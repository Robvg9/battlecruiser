-- Historical price and cost overrides scoped to one completed Jornada.
-- Original catalogue prices and physical inventory cuts remain untouched.
CREATE TABLE IF NOT EXISTS public.turno_jornada_valores_correcciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_sesion_id uuid NOT NULL REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  precio_venta_original numeric(14,4),
  costo_unitario_original numeric(14,4),
  precio_venta_unitario numeric(14,4) NOT NULL CHECK (precio_venta_unitario>=0),
  costo_unitario numeric(14,4) NOT NULL CHECK (costo_unitario>=0),
  comentario text NOT NULL CHECK (length(btrim(comentario)) BETWEEN 5 AND 500),
  creado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  vigente boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS turno_jornada_valores_vigentes_idx
  ON public.turno_jornada_valores_correcciones(turno_sesion_id,producto_id) WHERE vigente;
CREATE INDEX IF NOT EXISTS turno_jornada_valores_historial_idx
  ON public.turno_jornada_valores_correcciones(turno_sesion_id,producto_id,creado_en DESC);
ALTER TABLE public.turno_jornada_valores_correcciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.turno_jornada_valores_correcciones FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bc7_ajustar_valores_producto_jornada(
  p_turno_sesion_id uuid,
  p_ajustes jsonb,
  p_comentario text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_final public.turno_jornada_inventario_cortes;
  v_item jsonb;
  v_product_id uuid;
  v_price numeric;
  v_cost numeric;
  v_old_price numeric;
  v_old_cost numeric;
  v_count integer:=0;
  v_before jsonb:='[]'::jsonb;
  v_after jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede corregir valores históricos.' USING ERRCODE='42501';
  END IF;
  IF p_ajustes IS NULL OR jsonb_typeof(p_ajustes)<>'array'
     OR jsonb_array_length(p_ajustes)=0 OR jsonb_array_length(p_ajustes)>200 THEN
    RAISE EXCEPTION 'Envía una lista de entre 1 y 200 productos.' USING ERRCODE='22023';
  END IF;
  IF length(btrim(coalesce(p_comentario,'')))<5 OR length(p_comentario)>500 THEN
    RAISE EXCEPTION 'Explica la fuente del precio y costo (5–500 caracteres).' USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_ajustes) x(value)
    WHERE jsonb_typeof(x.value)<>'object'
      OR coalesce(x.value->>'producto_id','') !~* '^[0-9a-f-]{36}$'
      OR coalesce(x.value->>'precio_venta_unitario','') !~ '^([0-9]+([.][0-9]{1,4})?|[.][0-9]{1,4})$'
      OR coalesce(x.value->>'costo_unitario','') !~ '^([0-9]+([.][0-9]{1,4})?|[.][0-9]{1,4})$'
  ) THEN RAISE EXCEPTION 'Producto, precio o costo inválido. Usa importes no negativos con hasta 4 decimales.' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_ajustes))
      <> (SELECT count(DISTINCT (x.value->>'producto_id')::uuid) FROM jsonb_array_elements(p_ajustes) x(value)) THEN
    RAISE EXCEPTION 'No repitas el mismo producto en los ajustes.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'COMPLETADA' THEN
    RAISE EXCEPTION 'Solo se corrigen valores de una Jornada completada.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_final FROM public.turno_jornada_inventario_cortes
    WHERE turno_sesion_id=v_s.id AND tipo='FINAL' AND estado='CONFIRMADO';
  IF NOT FOUND THEN RAISE EXCEPTION 'La Jornada no tiene un inventario final confirmado.' USING ERRCODE='23503'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_ajustes)
  LOOP
    v_product_id:=(v_item->>'producto_id')::uuid;
    v_price:=(v_item->>'precio_venta_unitario')::numeric;
    v_cost:=(v_item->>'costo_unitario')::numeric;
    IF NOT EXISTS(
      SELECT 1 FROM public.turno_jornada_inventario_lineas il
      JOIN public.turno_jornada_inventario_cortes c ON c.id=il.corte_id
      WHERE c.turno_sesion_id=v_s.id AND c.tipo IN ('INICIAL','FINAL')
        AND c.estado='CONFIRMADO' AND il.producto_id=v_product_id
    ) THEN
      RAISE EXCEPTION 'El producto % no pertenece a los cortes confirmados de esta Jornada.',v_product_id USING ERRCODE='23503';
    END IF;
    SELECT p.precio_normal INTO v_old_price FROM public.productos p WHERE p.id=v_product_id;
    SELECT round(sum(l.cantidad_inicial*l.costo_unitario)/nullif(sum(l.cantidad_inicial),0),4)
      INTO v_old_cost
    FROM public.lotes_compra l
    JOIN public.productos p ON p.id=l.producto_id
    WHERE l.almacen_id=v_s.almacen_id
      AND coalesce(p.producto_padre_id,p.id)=v_product_id
      AND l.fecha_compra<=v_final.confirmado_en
      AND coalesce(l.costo_unitario,0)>0;
    SELECT coalesce(v_before,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,'precio_venta_anterior',coalesce(j.precio_venta_unitario,v_old_price),
      'costo_anterior',coalesce(j.costo_unitario,v_old_cost)
    )) INTO v_before
    FROM (SELECT 1) base
    LEFT JOIN LATERAL (
      SELECT precio_venta_unitario,costo_unitario FROM public.turno_jornada_valores_correcciones
      WHERE turno_sesion_id=v_s.id AND producto_id=v_product_id AND vigente
    ) j ON true;
    UPDATE public.turno_jornada_valores_correcciones
      SET vigente=false
      WHERE turno_sesion_id=v_s.id AND producto_id=v_product_id AND vigente;
    INSERT INTO public.turno_jornada_valores_correcciones(
      turno_sesion_id,producto_id,precio_venta_original,costo_unitario_original,
      precio_venta_unitario,costo_unitario,comentario,creado_por
    ) VALUES(v_s.id,v_product_id,v_old_price,v_old_cost,v_price,v_cost,btrim(p_comentario),auth.uid());
    v_after:=v_after||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,'precio_venta_unitario',v_price,'costo_unitario',v_cost
    ));
    v_count:=v_count+1;
  END LOOP;
  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),'VALORES_HISTORICOS_JORNADA_CORREGIDOS',
    btrim(p_comentario),jsonb_build_object('valores_anteriores',v_before),
    jsonb_build_object('valores_nuevos',v_after,'productos_ajustados',v_count)
  );
  RETURN jsonb_build_object('ok',true,'productos_ajustados',v_count,'catalogo_modificado',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_ajustar_valores_producto_jornada(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_ajustar_valores_producto_jornada(uuid,jsonb,text) TO authenticated;


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
    SELECT coalesce(jsonb_agg(
      x.value || jsonb_build_object(
        'precio_catalogo_unitario',x.value->'precio_unitario',
        'precio_unitario',coalesce(jv.precio_venta_unitario,nullif(x.value->>'precio_unitario','')::numeric),
        'precio_corregido_jornada',jv.precio_venta_unitario,
        'estado_precio',CASE WHEN jv.precio_venta_unitario IS NOT NULL THEN 'PRECIO_CORREGIDO_JORNADA' ELSE x.value->>'estado_precio' END,
        'importe_estimado',CASE
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
     AND jv.vigente;

    IF coalesce((v_liq->>'movimientos_posteriores_pendientes')::integer,0)=0
       AND coalesce((v_liq->>'familias_con_vendidas_negativas')::integer,0)=0 THEN
      SELECT count(*) FILTER(WHERE coalesce((x.value->>'unidades_vendidas')::numeric,0)>0 AND x.value->>'importe_estimado' IS NULL),
        CASE WHEN count(*) FILTER(WHERE coalesce((x.value->>'unidades_vendidas')::numeric,0)>0 AND x.value->>'importe_estimado' IS NULL)>0
          THEN NULL ELSE round(coalesce(sum((x.value->>'importe_estimado')::numeric),0),2) END
      INTO v_adjusted_missing_prices,v_adjusted_sales
      FROM jsonb_array_elements(v_adjusted_lines) x(value);
      v_adjusted_salary:=CASE WHEN v_adjusted_sales IS NOT NULL AND v_liq->>'salario_porcentaje' IS NOT NULL
        THEN round(v_adjusted_sales*(v_liq->>'salario_porcentaje')::numeric/100,2) ELSE NULL END;
      v_adjusted_expected:=CASE WHEN v_adjusted_salary IS NOT NULL
        THEN round(v_adjusted_sales-coalesce((v_liq->>'gastos_aprobados')::numeric,0)
          -coalesce((v_liq->>'reinversiones_aprobadas')::numeric,0)-v_adjusted_salary,2) ELSE NULL END;
      v_adjusted_difference:=CASE WHEN v_adjusted_expected IS NOT NULL AND v_liq->>'dinero_recogido_total' IS NOT NULL
        THEN round((v_liq->>'dinero_recogido_total')::numeric-v_adjusted_expected,2) ELSE NULL END;
      v_liq:=v_liq||jsonb_build_object(
        'lineas',v_adjusted_lines,'ventas_estimadas',v_adjusted_sales,
        'salario_calculado',v_adjusted_salary,
        'efectivo_esperado_despues_de_gastos_reinversiones_salario',v_adjusted_expected,
        'diferencia',v_adjusted_difference,
        'familias_sin_precio',v_adjusted_missing_prices
      );
    ELSE
      v_liq:=v_liq||jsonb_build_object('lineas',v_adjusted_lines);
    END IF;
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
$function$;
