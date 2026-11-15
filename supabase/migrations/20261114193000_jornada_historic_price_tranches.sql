-- Historical sale price tranches for completed retail sessions.
CREATE TABLE IF NOT EXISTS public.turno_jornada_precio_tramos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_sesion_id uuid NOT NULL REFERENCES public.turno_sesiones(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  cantidad numeric(14,4) NOT NULL CHECK (cantidad > 0),
  precio_unitario numeric(14,4) NOT NULL CHECK (precio_unitario >= 0),
  comentario text NOT NULL CHECK (length(btrim(comentario)) >= 5),
  creado_por uuid NOT NULL DEFAULT auth.uid(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  vigente boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_turno_jornada_precio_tramos_vigente
 ON public.turno_jornada_precio_tramos(turno_sesion_id,producto_id) WHERE vigente;
ALTER TABLE public.turno_jornada_precio_tramos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.turno_jornada_precio_tramos FROM anon, authenticated;
GRANT SELECT ON public.turno_jornada_precio_tramos TO authenticated;
DROP POLICY IF EXISTS "owner reads historic price tranches" ON public.turno_jornada_precio_tramos;
CREATE POLICY "owner reads historic price tranches" ON public.turno_jornada_precio_tramos
 FOR SELECT TO authenticated USING (public.bc_actor_is_admin());

CREATE OR REPLACE FUNCTION public.bc7_guardar_tramos_precio_jornada(
 p_turno_sesion_id uuid, p_producto_id uuid, p_tramos jsonb, p_comentario text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_s public.turno_sesiones; v_liq jsonb; v_line jsonb; v_sold numeric;
 v_sum numeric; v_item jsonb; v_count integer:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
  RAISE EXCEPTION 'Solo el Dueño/Admin puede corregir precios históricos.' USING ERRCODE='42501';
 END IF;
 IF length(btrim(coalesce(p_comentario,'')))<5 OR length(p_comentario)>500
   OR jsonb_typeof(p_tramos)<>'array' OR jsonb_array_length(p_tramos)<2 OR jsonb_array_length(p_tramos)>30 THEN
  RAISE EXCEPTION 'Indica al menos dos tramos y una fuente de verificación válida.' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_tramos) x(value)
   WHERE jsonb_typeof(x.value)<>'object'
    OR coalesce(x.value->>'cantidad','') !~ '^[0-9]+([.][0-9]{1,4})?$'
    OR coalesce(x.value->>'precio_unitario','') !~ '^[0-9]+([.][0-9]{1,4})?$'
    OR (x.value->>'cantidad')::numeric<=0) THEN
  RAISE EXCEPTION 'Cada tramo requiere cantidad positiva y precio no negativo.' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
 IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'COMPLETADA' THEN
  RAISE EXCEPTION 'Solo se corrigen jornadas completadas.' USING ERRCODE='23514';
 END IF;
 v_liq:=public.bc7_liquidacion_inventario_jornada(v_s.id);
 SELECT x.value,(x.value->>'unidades_vendidas')::numeric INTO v_line,v_sold
 FROM jsonb_array_elements(coalesce(v_liq->'lineas','[]'::jsonb)) x(value)
 WHERE (x.value->>'producto_id')::uuid=p_producto_id;
 IF v_line IS NULL OR v_sold IS NULL OR v_sold<0 THEN
  RAISE EXCEPTION 'No se pudo verificar la cantidad vendida de este producto.' USING ERRCODE='23514';
 END IF;
 SELECT sum((x.value->>'cantidad')::numeric) INTO v_sum FROM jsonb_array_elements(p_tramos) x(value);
 IF abs(v_sum-v_sold)>0.0001 THEN
  RAISE EXCEPTION 'Las cantidades de los tramos (%) deben sumar exactamente las unidades vendidas (%).',v_sum,v_sold USING ERRCODE='23514';
 END IF;
 UPDATE public.turno_jornada_precio_tramos SET vigente=false
  WHERE turno_sesion_id=v_s.id AND producto_id=p_producto_id AND vigente;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_tramos) LOOP
  INSERT INTO public.turno_jornada_precio_tramos(turno_sesion_id,producto_id,cantidad,precio_unitario,comentario,creado_por)
  VALUES(v_s.id,p_producto_id,(v_item->>'cantidad')::numeric,(v_item->>'precio_unitario')::numeric,btrim(p_comentario),auth.uid());
  v_count:=v_count+1;
 END LOOP;
 INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
 VALUES(v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),'PRECIOS_POR_TRAMOS_JORNADA',btrim(p_comentario),
  jsonb_build_object('producto_id',p_producto_id,'unidades_vendidas',v_sold),
  jsonb_build_object('tramos',p_tramos,'cantidad_tramos',v_count));
 RETURN jsonb_build_object('ok',true,'tramos_guardados',v_count,'unidades_vendidas',v_sold);
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_guardar_tramos_precio_jornada(uuid,uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_guardar_tramos_precio_jornada(uuid,uuid,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc7_obtener_revision_jornada(p_turno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_turn public.turnos;
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_final public.turno_jornada_inventario_cortes;
  v_liq jsonb;
  v_lines jsonb;
  v_post jsonb;
  v_sessions jsonb:='[]'::jsonb;
  v_cost_covered integer;
  v_cost_total integer;
  v_sold_price_missing integer;
  v_pending_post integer;
  v_cash_declared numeric;
  v_cash_counted numeric;
  v_cash_state text;
  v_cash_declared_at timestamptz;
  v_cash_counted_at timestamptz;
  v_revision public.turno_revisiones;
  v_adjusted_lines jsonb;
  v_adjusted_sales numeric;
  v_adjusted_salary numeric;
  v_adjusted_expected numeric;
  v_adjusted_difference numeric;
  v_adjusted_missing_prices integer:=0;
  v_adjusted_negative integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede consultar la revisión integral.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_turn FROM public.turnos WHERE id=p_turno_id AND dias_turno IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe un Turno de jornadas para revisar.' USING ERRCODE='23503'; END IF;
  SELECT * INTO v_revision FROM public.turno_revisiones WHERE turno_id=v_turn.id;
  FOR v_s IN SELECT * FROM public.turno_sesiones
    WHERE turno_id=v_turn.id AND bloque='JORNADA' ORDER BY numero_dia
  LOOP
    SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
    SELECT * INTO v_final FROM public.turno_jornada_inventario_cortes
      WHERE turno_sesion_id=v_s.id AND tipo='FINAL' AND estado='CONFIRMADO';
    v_liq:=public.bc7_liquidacion_inventario_jornada(v_s.id);

    -- Apply explicit values for this completed Jornada only; catalogue pricing remains untouched.
    SELECT coalesce(jsonb_agg(
      x.value || jsonb_build_object(
        'precio_catalogo_unitario',x.value->'precio_unitario',
        'precio_unitario',coalesce(jt.precio_ponderado,jv.precio_venta_unitario,nullif(x.value->>'precio_unitario','')::numeric),
        'precio_corregido_jornada',coalesce(jt.precio_ponderado,jv.precio_venta_unitario),
        'precio_tramos',jt.tramos,
        'estado_precio',CASE WHEN jt.tramos IS NOT NULL THEN 'PRECIOS_POR_TRAMOS' WHEN jv.precio_venta_unitario IS NOT NULL THEN 'PRECIO_CORREGIDO_JORNADA' ELSE x.value->>'estado_precio' END,
        'importe_estimado',CASE
          WHEN jt.importe IS NOT NULL THEN jt.importe
          WHEN x.value->>'unidades_vendidas' IS NOT NULL
            AND coalesce(jv.precio_venta_unitario,nullif(x.value->>'precio_unitario','')::numeric) IS NOT NULL
            AND (x.value->>'unidades_vendidas')::numeric>=0
          THEN round((x.value->>'unidades_vendidas')::numeric*coalesce(jv.precio_venta_unitario,nullif(x.value->>'precio_unitario','')::numeric),2)
          ELSE NULL END
      ) ORDER BY x.value->>'nombre'
    ),'[]'::jsonb)
    INTO v_adjusted_lines
    FROM jsonb_array_elements(coalesce(v_liq->'lineas','[]'::jsonb)) x(value)
    LEFT JOIN public.turno_jornada_valores_correcciones jv
      ON jv.turno_sesion_id=v_s.id
     AND jv.producto_id=(x.value->>'producto_id')::uuid
     AND jv.vigente
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('cantidad',t.cantidad,'precio_unitario',t.precio_unitario)
                       ORDER BY t.precio_unitario) tramos,
             round(sum(t.cantidad*t.precio_unitario),2) importe,
             round(sum(t.cantidad*t.precio_unitario)/nullif(sum(t.cantidad),0),4) precio_ponderado
      FROM public.turno_jornada_precio_tramos t
      WHERE t.turno_sesion_id=v_s.id AND t.producto_id=(x.value->>'producto_id')::uuid AND t.vigente
    ) jt ON true;

    SELECT
      count(*) FILTER(WHERE coalesce((x.value->>'unidades_vendidas')::numeric,0)>0
        AND x.value->>'importe_estimado' IS NULL),
      count(*) FILTER(WHERE coalesce((x.value->>'unidades_vendidas')::numeric,0)<0)
    INTO v_adjusted_missing_prices,v_adjusted_negative
    FROM jsonb_array_elements(coalesce(v_adjusted_lines,'[]'::jsonb)) x(value);

    IF coalesce((v_liq->>'movimientos_posteriores_pendientes')::integer,0)=0
       AND coalesce((v_liq->>'faltan_cortes')::boolean,true)=false
       AND v_adjusted_negative=0
       AND v_adjusted_missing_prices=0 THEN
      SELECT round(coalesce(sum((x.value->>'importe_estimado')::numeric),0),2)
      INTO v_adjusted_sales
      FROM jsonb_array_elements(coalesce(v_adjusted_lines,'[]'::jsonb)) x(value);
    ELSE
      v_adjusted_sales:=NULL;
    END IF;
    v_adjusted_salary:=CASE WHEN v_adjusted_sales IS NOT NULL AND v_liq->>'salario_porcentaje' IS NOT NULL
      THEN round(v_adjusted_sales*(v_liq->>'salario_porcentaje')::numeric/100,2) ELSE NULL END;
    v_adjusted_expected:=CASE WHEN v_adjusted_salary IS NOT NULL
      THEN round(v_adjusted_sales-coalesce((v_liq->>'gastos_aprobados')::numeric,0)
        -coalesce((v_liq->>'reinversiones_aprobadas')::numeric,0)-v_adjusted_salary,2) ELSE NULL END;
    v_adjusted_difference:=CASE WHEN v_adjusted_expected IS NOT NULL AND v_liq->>'dinero_recogido_total' IS NOT NULL
      THEN round((v_liq->>'dinero_recogido_total')::numeric-v_adjusted_expected,2) ELSE NULL END;
    v_liq:=coalesce(v_liq,'{}'::jsonb)||jsonb_build_object(
      'lineas',v_adjusted_lines,
      'ventas_estimadas',v_adjusted_sales,
      'salario_calculado',v_adjusted_salary,
      'efectivo_esperado_despues_de_gastos_reinversiones_salario',v_adjusted_expected,
      'diferencia',v_adjusted_difference,
      'familias_sin_precio',v_adjusted_missing_prices,
      'productos_vendidos_con_precio_faltante',v_adjusted_missing_prices,
      'calculable',
        coalesce((v_liq->>'faltan_cortes')::boolean,true)=false
        AND v_adjusted_missing_prices=0
        AND v_adjusted_negative=0
        AND v_adjusted_sales IS NOT NULL
        AND v_adjusted_salary IS NOT NULL
        AND coalesce((v_liq->>'movimientos_posteriores_pendientes')::integer,0)=0
        AND coalesce((v_liq->'pendientes'->>'gastos')::integer,0)=0
        AND coalesce((v_liq->'pendientes'->>'reinversiones')::integer,0)=0
        AND coalesce((v_liq->'pendientes'->>'ajustes')::integer,0)=0
        AND coalesce((v_liq->'pendientes'->>'entregas_diarias')::integer,0)=0
        AND coalesce((v_liq->'pendientes'->>'entregas_diarias_faltantes')::integer,0)=0
        AND v_liq->>'dinero_recogido_total' IS NOT NULL
    );

    SELECT coalesce(jsonb_agg(
      x.value || jsonb_build_object(
        'costo_lote_unitario',c.costo_unitario,
        'costo_corregido_jornada',jv.costo_unitario,
        'costo_unitario_estimado',coalesce(jv.costo_unitario,c.costo_unitario),
        'estado_costo',CASE WHEN jv.costo_unitario IS NOT NULL THEN 'COSTO_CORREGIDO_JORNADA' WHEN c.costo_unitario IS NULL THEN 'SIN_COSTO_COMPROBADO' ELSE 'COSTO_PROMEDIO_PONDERADO_LOTES' END,
        'costo_vendido_estimado',CASE WHEN coalesce(jv.costo_unitario,c.costo_unitario) IS NOT NULL AND (x.value->>'unidades_vendidas')::numeric>=0
          THEN round((x.value->>'unidades_vendidas')::numeric*coalesce(jv.costo_unitario,c.costo_unitario),2) ELSE NULL END,
        'ganancia_bruta_estimada',CASE WHEN coalesce(jv.costo_unitario,c.costo_unitario) IS NOT NULL AND x.value->>'importe_estimado' IS NOT NULL
          THEN round((x.value->>'importe_estimado')::numeric-
            ((x.value->>'unidades_vendidas')::numeric*coalesce(jv.costo_unitario,c.costo_unitario)),2) ELSE NULL END,
        'margen_bruto_estimado',CASE WHEN coalesce(jv.costo_unitario,c.costo_unitario) IS NOT NULL
          AND nullif((x.value->>'importe_estimado')::numeric,0) IS NOT NULL
          THEN round(100*(((x.value->>'importe_estimado')::numeric-
            ((x.value->>'unidades_vendidas')::numeric*coalesce(jv.costo_unitario,c.costo_unitario)))/
            (x.value->>'importe_estimado')::numeric),2) ELSE NULL END
      ) ORDER BY x.value->>'nombre'
    ),'[]'::jsonb)
    INTO v_lines
    FROM jsonb_array_elements(coalesce(v_liq->'lineas','[]'::jsonb)) x(value)
    LEFT JOIN LATERAL (
      SELECT round(sum(l.cantidad_inicial*l.costo_unitario)/nullif(sum(l.cantidad_inicial),0),2) costo_unitario
      FROM public.lotes_compra l
      JOIN public.productos p ON p.id=l.producto_id
      WHERE l.almacen_id=v_s.almacen_id
        AND coalesce(p.producto_padre_id,p.id)=(x.value->>'producto_id')::uuid
        AND l.fecha_compra<=coalesce(v_final.confirmado_en,now())
        AND coalesce(l.costo_unitario,0)>0
    ) c ON true
    LEFT JOIN public.turno_jornada_valores_correcciones jv
      ON jv.turno_sesion_id=v_s.id
     AND jv.producto_id=(x.value->>'producto_id')::uuid
     AND jv.vigente;
    SELECT
      count(*) FILTER(WHERE coalesce((x.value->>'unidades_vendidas')::numeric,0)>0
        AND x.value->>'estado_costo'<>'SIN_COSTO_COMPROBADO'),
      count(*) FILTER(WHERE coalesce((x.value->>'unidades_vendidas')::numeric,0)>0),
      count(*) FILTER(WHERE coalesce((x.value->>'unidades_vendidas')::numeric,0)>0
        AND x.value->>'importe_estimado' IS NULL)
      INTO v_cost_covered,v_cost_total,v_sold_price_missing
    FROM jsonb_array_elements(coalesce(v_lines,'[]'::jsonb)) x(value);
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'tipo',m.tipo,'id',m.id,'producto',m.producto,'cantidad',m.cantidad,
        'precio_unitario',m.precio_unitario,
        'valor_estimado',CASE WHEN m.precio_unitario IS NOT NULL THEN round(m.cantidad*m.precio_unitario,2) ELSE NULL END,
        'estado',m.estado,'creado_en',m.creado_en,'fecha_revision',m.fecha_revision,'motivo',m.motivo,
        'clasificacion',r.clasificacion,'comentario_revision',r.comentario
      ) ORDER BY m.creado_en,m.producto),'[]'::jsonb),
      count(*) FILTER(WHERE r.clasificacion IS NULL)
      INTO v_post,v_pending_post
    FROM (
      SELECT 'BAJA'::text tipo,b.id,p.nombre producto,b.cantidad,coalesce(p.precio_normal,pp.precio_normal) precio_unitario,b.estado,b.creado_en,coalesce(b.fecha_revision,b.actualizado_en) AS fecha_revision,b.motivo
      FROM public.bajas b JOIN public.productos p ON p.id=b.producto_id LEFT JOIN public.productos pp ON pp.id=p.producto_padre_id
      WHERE b.turno_sesion_id=v_s.id AND b.estado='APROBADA'
        AND v_final.id IS NOT NULL AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_final.confirmado_en
      UNION ALL
      SELECT 'MERMA'::text,m.id,p.nombre,m.cantidad,
        coalesce(p.precio_normal,pp.precio_normal) precio_unitario,
        m.estado,m.creado_en,coalesce(m.fecha_revision,m.actualizado_en) AS fecha_revision,m.motivo
      FROM public.mermas m
      JOIN public.productos p ON p.id=m.producto_id
      LEFT JOIN public.productos pp ON pp.id=p.producto_padre_id
      WHERE m.turno_sesion_id=v_s.id AND m.estado='APROBADA'
        AND v_final.id IS NOT NULL AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_final.confirmado_en
    ) m
    LEFT JOIN public.turno_jornada_movimiento_revision r
      ON r.turno_sesion_id=v_s.id AND r.tipo_movimiento=m.tipo AND r.movimiento_id=m.id;
    SELECT d.monto,d.monto_contado,d.estado_aprobacion,d.declarado_at,d.contado_at
      INTO v_cash_declared,v_cash_counted,v_cash_state,v_cash_declared_at,v_cash_counted_at
    FROM public.turno_declaraciones d
    WHERE d.turno_sesion_id=v_s.id
    ORDER BY d.declarado_at DESC NULLS LAST LIMIT 1;
    v_liq:=coalesce(v_liq,'{}'::jsonb) || jsonb_build_object(
      'lineas',coalesce(v_lines,'[]'::jsonb),
      'costos_con_cobertura',coalesce(v_cost_covered,0),
      'costos_sin_cobertura',greatest(0,coalesce(v_cost_total,0)-coalesce(v_cost_covered,0)),
      'familias_total_costo',coalesce(v_cost_total,0),
      'ganancia_bruta_parcial',(
        SELECT sum((x.value->>'ganancia_bruta_estimada')::numeric)
        FROM jsonb_array_elements(coalesce(v_lines,'[]'::jsonb)) x(value)
        WHERE x.value->>'ganancia_bruta_estimada' IS NOT NULL
      ),
      'movimientos_posteriores_corte',coalesce(v_post,'[]'::jsonb),
      'movimientos_posteriores_pendientes',coalesce(v_pending_post,0),
      'productos_vendidos_con_precio_faltante',coalesce(v_sold_price_missing,0),
      'ganancia_bruta_es_total',coalesce(v_cost_covered,0)=coalesce(v_cost_total,0)
        AND coalesce(v_sold_price_missing,0)=0
        AND coalesce((v_liq->>'familias_con_vendidas_negativas')::integer,0)=0
    );
    IF coalesce(v_pending_post,0)>0 THEN
      v_liq:=v_liq||jsonb_build_object(
        'costos_con_cobertura',0,
        'costos_sin_cobertura',0,
        'familias_total_costo',0,
        'ganancia_bruta_parcial',NULL,
        'ganancia_bruta_es_total',false
      );
    END IF;
    v_sessions:=v_sessions||jsonb_build_array(jsonb_build_object(
      'id',v_s.id,'numero_dia',v_s.numero_dia,'fecha',v_p.fecha,'fecha_fin',coalesce(v_p.fecha_fin,v_p.fecha),
      'estado',v_s.estado,'responsable_id',v_p.responsable_id,
      'hora_inicio',v_p.hora_inicio_prevista,'hora_fin',v_p.hora_fin_prevista,
      'salario_porcentaje',v_p.salario_porcentaje,
      'entregas_diarias',(SELECT coalesce(jsonb_agg(jsonb_build_object('fecha',e.fecha,'monto',e.monto_aprobado,'estado',e.estado) ORDER BY e.fecha),'[]'::jsonb) FROM public.turno_jornada_entregas_diarias e WHERE e.turno_sesion_id=v_s.id),
      'efectivo',CASE WHEN v_cash_state IS NULL THEN NULL ELSE jsonb_build_object(
        'declarado',v_cash_declared,'contado',v_cash_counted,'estado',v_cash_state,
        'declarado_at',v_cash_declared_at,'contado_at',v_cash_counted_at) END,
      'liquidacion',v_liq
    ));
  END LOOP;
  RETURN jsonb_build_object(
    'turno',jsonb_build_object('id',v_turn.id,'almacen_id',v_turn.almacen_id,
      'almacen_nombre',(SELECT a.nombre FROM public.almacenes a WHERE a.id=v_turn.almacen_id),
      'fecha',v_turn.fecha,'dias_turno',v_turn.dias_turno,
      'estado',v_turn.estado,'estado_maestro',v_turn.estado_maestro,
      'creado_en',v_turn.creado_en,'observacion',v_turn.observacion),
    'revision',CASE WHEN v_revision.id IS NULL THEN NULL ELSE jsonb_build_object(
      'estado',v_revision.estado,'comentario',v_revision.comentario,
      'revisado_at',v_revision.revisado_at) END,
    'sesiones',v_sessions
  );
END;
$function$

