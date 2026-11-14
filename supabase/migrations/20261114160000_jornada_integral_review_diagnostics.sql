-- Audited overrides keep original physical cuts immutable.
CREATE TABLE IF NOT EXISTS public.turno_jornada_inventario_correcciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_sesion_id uuid NOT NULL REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT,
  tipo text NOT NULL DEFAULT 'FINAL' CHECK (tipo='FINAL'),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  cantidad_original numeric(14,3) NOT NULL CHECK (cantidad_original>=0),
  cantidad_corregida numeric(14,3) NOT NULL CHECK (cantidad_corregida>=0),
  comentario text NOT NULL CHECK (length(btrim(comentario)) BETWEEN 5 AND 500),
  creado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  vigente boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS turno_jornada_inventario_correccion_vigente_idx
  ON public.turno_jornada_inventario_correcciones(turno_sesion_id,tipo,producto_id) WHERE vigente;
CREATE INDEX IF NOT EXISTS turno_jornada_inventario_correcciones_historial_idx
  ON public.turno_jornada_inventario_correcciones(turno_sesion_id,producto_id,creado_en DESC);
ALTER TABLE public.turno_jornada_inventario_correcciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.turno_jornada_inventario_correcciones FROM PUBLIC, anon, authenticated;

-- Jornada integral review: preserve physical inventory, explain negative rows,
-- and expose each daily cash handover without guessing movement chronology.
CREATE OR REPLACE FUNCTION public.bc7_liquidacion_inventario_jornada(p_turno_sesion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_turno public.turnos;
  v_initial public.turno_jornada_inventario_cortes;
  v_final public.turno_jornada_inventario_cortes;
  v_is_retail boolean:=false;
  v_retroactive boolean:=false;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_rate numeric;
  v_lines jsonb:='[]'::jsonb;
  v_total_units numeric:=0;
  v_sales_total numeric;
  v_priced_lines integer:=0;
  v_total_lines integer:=0;
  v_negative_lines integer:=0;
  v_missing_price_sold integer:=0;
  v_expenses numeric:=0;
  v_reinvestments numeric:=0;
  v_daily_cash numeric:=0;
  v_daily_pending integer:=0;
  v_daily_expected integer:=0;
  v_daily_approved integer:=0;
  v_daily_missing integer:=0;
  v_pending_expenses integer:=0;
  v_pending_reinvestments integer:=0;
  v_pending_adjustments integer:=0;
  v_pending_post integer:=0;
  v_final_declared numeric;
  v_final_counted numeric;
  v_final_cash_state text;
  v_salary numeric;
  v_expected_cash numeric;
  v_cash_received numeric;
  v_difference numeric;
  v_complete boolean:=false;
  v_negative_details jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde a una jornada registrada.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS(SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL)
  ) THEN RAISE EXCEPTION 'Solo el responsable asignado o ADMIN puede consultar esta liquidación.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  SELECT * INTO v_turno FROM public.turnos WHERE id=v_s.turno_id;
  v_retroactive:=coalesce(v_s.apertura_retroactiva,false);
  SELECT (a.tipo='minorista') INTO v_is_retail FROM public.almacenes a WHERE a.id=v_s.almacen_id;
  IF NOT v_is_retail THEN
    RETURN jsonb_build_object('aplica',false,'motivo','La liquidación por diferencia de inventario está habilitada para almacenes minoristas.');
  END IF;
  SELECT * INTO v_initial FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo='INICIAL' AND estado='CONFIRMADO';
  SELECT * INTO v_final FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo='FINAL' AND estado='CONFIRMADO';
  v_start_at:=coalesce(v_turno.apertura_real,v_initial.confirmado_en,v_initial.creado_en);
  v_end_at:=coalesce(v_final.confirmado_en,v_final.creado_en,now());
  v_rate:=v_p.salario_porcentaje;

  -- Approved Bajas/Mermas registered or approved after the immutable final cut
  -- require an explicit Owner decision before sales/salary can be calculated.
  SELECT count(*)::integer INTO v_pending_post
  FROM (
    SELECT b.id FROM public.bajas b
    WHERE b.turno_sesion_id=v_s.id AND b.estado='APROBADA'
      AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_end_at
      AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
        WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA' AND mr.movimiento_id=b.id)
    UNION ALL
    SELECT m.id FROM public.mermas m
    WHERE m.turno_sesion_id=v_s.id AND m.estado='APROBADA'
      AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_end_at
      AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
        WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA' AND mr.movimiento_id=m.id)
  ) unresolved;

  WITH initial_lines AS (
    SELECT l.producto_id AS product_id,l.cantidad_contada::numeric AS qty
    FROM public.turno_jornada_inventario_lineas l
    WHERE l.corte_id=v_initial.id
  ),
  final_lines AS (
    SELECT l.producto_id AS product_id,
      coalesce(c.cantidad_corregida,l.cantidad_contada)::numeric AS qty,
      l.cantidad_contada::numeric AS original_qty,
      c.cantidad_corregida AS corrected_qty
    FROM public.turno_jornada_inventario_lineas l
    LEFT JOIN public.turno_jornada_inventario_correcciones c
      ON c.turno_sesion_id=v_s.id AND c.tipo='FINAL'
      AND c.producto_id=l.producto_id AND c.vigente
    WHERE l.corte_id=v_final.id
  ),
  movement_events AS (
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END product_id,
           'TRANSFERENCIA_ENTRADA'::text kind,tl.cantidad::numeric qty
    FROM public.transferencias t
    JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
    JOIN public.productos p ON p.id=tl.producto_id
    WHERE t.almacen_destino_id=v_s.almacen_id AND lower(t.estado)='completada'
      AND t.fecha>v_start_at AND t.fecha<=v_end_at
      AND (NOT v_retroactive
        OR (t.fecha AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'))::date>v_p.fecha
        OR EXISTS(SELECT 1 FROM public.turno_jornada_entradas_vinculadas linked
          WHERE linked.turno_sesion_id=v_s.id AND linked.transferencia_id=t.id))
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'TRANSFERENCIA_SALIDA',tl.cantidad::numeric
    FROM public.transferencias t
    JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
    JOIN public.productos p ON p.id=tl.producto_id
    WHERE t.almacen_origen_id=v_s.almacen_id AND lower(t.estado)='completada'
      AND t.fecha>v_start_at AND t.fecha<=v_end_at
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'COMPRA',lc.cantidad_inicial::numeric
    FROM public.lotes_compra lc
    JOIN public.productos p ON p.id=lc.producto_id
    WHERE lc.almacen_id=v_s.almacen_id AND lower(lc.origen)='compra'
      AND lc.fecha_compra>v_start_at AND lc.fecha_compra<=v_end_at
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'REINVERSION',rl.cantidad_base::numeric
    FROM public.reinversiones r
    JOIN public.reinversiones_lineas rl ON rl.reinversion_id=r.id
    JOIN public.productos p ON p.id=rl.producto_id
    WHERE r.almacen_id=v_s.almacen_id AND r.turno_sesion_id=v_s.id
      AND r.estado='APROBADA' AND r.fecha_revision IS NOT NULL
      AND r.creado_en>v_start_at AND r.creado_en<=v_end_at
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'VALE',vs.cantidad::numeric
    FROM public.vales_salida vs
    JOIN public.productos p ON p.id=vs.producto_id
    WHERE vs.almacen_id=v_s.almacen_id
      AND upper(coalesce(vs.estado,'REGISTRADO')) NOT IN ('PENDIENTE','RECHAZADO','CANCELADO','ANULADO')
      AND vs.fecha>v_start_at AND vs.fecha<=v_end_at
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'MERMA',m.cantidad::numeric
    FROM public.mermas m
    JOIN public.productos p ON p.id=m.producto_id
    WHERE m.almacen_id=v_s.almacen_id AND m.estado='APROBADA'
      AND (
        (coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_start_at
          AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)<=v_end_at
          AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA'
              AND mr.movimiento_id=m.id AND mr.clasificacion='DESPUES_CORTE'))
        OR EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
          WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA'
            AND mr.movimiento_id=m.id AND mr.clasificacion='ANTES_CORTE')
      )
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'BAJA',b.cantidad::numeric
    FROM public.bajas b
    JOIN public.productos p ON p.id=b.producto_id
    WHERE b.almacen_id=v_s.almacen_id AND b.estado='APROBADA'
      AND (
        (coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_start_at
          AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)<=v_end_at
          AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA'
              AND mr.movimiento_id=b.id AND mr.clasificacion='DESPUES_CORTE'))
        OR EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
          WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA'
            AND mr.movimiento_id=b.id AND mr.clasificacion='ANTES_CORTE')
      )
  ),
  movement_totals AS (
    SELECT product_id,
      coalesce(sum(qty) FILTER(WHERE kind='TRANSFERENCIA_ENTRADA'),0) transfer_in,
      coalesce(sum(qty) FILTER(WHERE kind='COMPRA'),0) purchases_in,
      coalesce(sum(qty) FILTER(WHERE kind='REINVERSION'),0) reinvestment_in,
      coalesce(sum(qty) FILTER(WHERE kind='TRANSFERENCIA_SALIDA'),0) transfer_out,
      coalesce(sum(qty) FILTER(WHERE kind='VALE'),0) vales_out,
      coalesce(sum(qty) FILTER(WHERE kind='MERMA'),0) merma_out,
      coalesce(sum(qty) FILTER(WHERE kind='BAJA'),0) bajas_out
    FROM movement_events GROUP BY product_id
  ),
  price_info AS (
    SELECT p.id product_id,p.nombre,p.unidad,
      CASE
        WHEN coalesce(p.precio_normal,0)>0 THEN p.precio_normal
        WHEN count(ch.id)>0
          AND count(ch.precio_normal)=count(ch.id)
          AND min(ch.precio_normal)=max(ch.precio_normal)
          AND min(ch.precio_normal)>0 THEN min(ch.precio_normal)
        ELSE NULL
      END precio_unitario,
      CASE
        WHEN coalesce(p.precio_normal,0)>0 THEN 'PRECIO_FAMILIA'
        WHEN count(ch.id)>0
          AND count(ch.precio_normal)=count(ch.id)
          AND min(ch.precio_normal)=max(ch.precio_normal)
          AND min(ch.precio_normal)>0 THEN 'PRECIO_VARIANTES_UNIFORME'
        WHEN count(ch.id)>0 THEN 'PRECIO_VARIANTES_DIFERENTE_O_INCOMPLETO'
        ELSE 'SIN_PRECIO'
      END estado_precio
    FROM public.productos p
    LEFT JOIN public.productos ch ON ch.producto_padre_id=p.id AND ch.activo=true
    WHERE p.activo=true AND p.producto_padre_id IS NULL
    GROUP BY p.id,p.nombre,p.unidad,p.precio_normal
  ),
  all_product_ids AS (
    SELECT product_id FROM initial_lines
    UNION SELECT product_id FROM final_lines
    UNION SELECT product_id FROM movement_totals
  ),
  calculated AS (
    SELECT ids.product_id,coalesce(pi.nombre,p.nombre) nombre,coalesce(pi.unidad,p.unidad) unidad,
      coalesce(i.qty,0) initial_qty,coalesce(f.qty,0) final_qty,
      f.original_qty final_qty_original,f.corrected_qty final_qty_corrected,
      coalesce(mt.transfer_in,0) transfer_in,coalesce(mt.purchases_in,0) purchases_in,
      coalesce(mt.reinvestment_in,0) reinvestment_in,coalesce(mt.transfer_out,0) transfer_out,
      coalesce(mt.vales_out,0) vales_out,coalesce(mt.merma_out,0) merma_out,coalesce(mt.bajas_out,0) bajas_out,
      (coalesce(i.qty,0)+coalesce(mt.transfer_in,0)+coalesce(mt.purchases_in,0)+coalesce(mt.reinvestment_in,0)
        -coalesce(mt.transfer_out,0)-coalesce(mt.vales_out,0)-coalesce(mt.merma_out,0)-coalesce(mt.bajas_out,0)-coalesce(f.qty,0)) sold_qty,
      pi.precio_unitario,pi.estado_precio
    FROM all_product_ids ids
    JOIN public.productos p ON p.id=ids.product_id
    LEFT JOIN price_info pi ON pi.product_id=ids.product_id
    LEFT JOIN initial_lines i ON i.product_id=ids.product_id
    LEFT JOIN final_lines f ON f.product_id=ids.product_id
    LEFT JOIN movement_totals mt ON mt.product_id=ids.product_id
  )
  SELECT count(*),
         count(*) FILTER(WHERE (precio_unitario IS NOT NULL AND sold_qty>=0) OR sold_qty=0),
         count(*) FILTER(WHERE sold_qty<0),
         count(*) FILTER(WHERE precio_unitario IS NULL AND sold_qty>0),
         coalesce(sum(sold_qty),0),
         CASE WHEN count(*) FILTER(WHERE (precio_unitario IS NULL AND sold_qty>0) OR sold_qty<0)>0 THEN NULL
              ELSE round(coalesce(sum(sold_qty*precio_unitario),0),2) END,
         coalesce(jsonb_agg(jsonb_build_object(
           'producto_id',product_id,'nombre',nombre,'unidad',unidad,
           'inventario_inicial',initial_qty,'transferencias_entrada',transfer_in,
           'compras',purchases_in,'reinversiones_entrada',reinvestment_in,
           'transferencias_salida',transfer_out,'vales_salida',vales_out,
           'mermas_aprobadas',merma_out,'bajas_aprobadas',bajas_out,
           'inventario_final',final_qty,'inventario_final_original',final_qty_original,
           'inventario_final_corregido',final_qty_corrected,'unidades_vendidas',sold_qty,
           'precio_unitario',precio_unitario,'estado_precio',estado_precio,
           'importe_estimado',CASE WHEN precio_unitario IS NOT NULL AND sold_qty>=0 THEN round(sold_qty*precio_unitario,2) ELSE NULL END
         ) ORDER BY nombre,product_id),'[]'::jsonb)
    INTO v_total_lines,v_priced_lines,v_negative_lines,v_missing_price_sold,v_total_units,v_sales_total,v_lines
  FROM calculated;

  -- Do not present provisional sales or salary as if the missing final stock were zero.
  IF v_initial.id IS NULL OR v_final.id IS NULL THEN
    v_total_lines:=0;
    v_priced_lines:=0;
    v_negative_lines:=0;
    v_missing_price_sold:=0;
    v_total_units:=NULL;
    v_sales_total:=NULL;
    v_lines:='[]'::jsonb;
  END IF;

  SELECT coalesce(sum(g.monto) FILTER(WHERE g.estado='APROBADO'),0),
         count(*) FILTER(WHERE g.estado='PENDIENTE')
    INTO v_expenses,v_pending_expenses
  FROM public.gastos g WHERE g.turno_sesion_id=v_s.id AND g.estado IN ('APROBADO','PENDIENTE');
  SELECT coalesce(sum(r.total) FILTER(WHERE r.estado='APROBADA'),0),
         count(*) FILTER(WHERE r.estado='PENDIENTE')
    INTO v_reinvestments,v_pending_reinvestments
  FROM public.reinversiones r WHERE r.turno_sesion_id=v_s.id AND r.estado IN ('APROBADA','PENDIENTE');
  SELECT count(*) INTO v_pending_adjustments
  FROM (
    SELECT 1 FROM public.mermas m WHERE m.turno_sesion_id=v_s.id AND m.estado='PENDIENTE'
    UNION ALL
    SELECT 1 FROM public.bajas b WHERE b.turno_sesion_id=v_s.id AND b.estado='PENDIENTE'
  ) pending;
  v_daily_expected:=greatest(0,(coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha)::integer);
  SELECT coalesce(sum(e.monto_aprobado) FILTER(WHERE e.estado='APROBADA'),0),
         count(*) FILTER(WHERE e.estado='PENDIENTE'),
         count(*) FILTER(WHERE e.estado='APROBADA')
    INTO v_daily_cash,v_daily_pending,v_daily_approved
  FROM public.turno_jornada_entregas_diarias e WHERE e.turno_sesion_id=v_s.id;
  v_daily_missing:=greatest(0,v_daily_expected-v_daily_approved);
  SELECT d.monto,d.monto_contado,d.estado_aprobacion
    INTO v_final_declared,v_final_counted,v_final_cash_state
  FROM public.turno_declaraciones d
  WHERE d.turno_sesion_id=v_s.id
  ORDER BY d.declarado_at DESC NULLS LAST,d.created_at DESC NULLS LAST LIMIT 1;

  v_salary:=CASE WHEN v_rate IS NOT NULL AND v_sales_total IS NOT NULL
    THEN round(v_sales_total*v_rate/100,2) ELSE NULL END;
  v_cash_received:=CASE WHEN v_final_counted IS NOT NULL AND v_final_cash_state='APROBADA'
    THEN v_daily_cash+v_final_counted ELSE NULL END;
  v_expected_cash:=CASE WHEN v_sales_total IS NOT NULL AND v_salary IS NOT NULL
    THEN round(v_sales_total-v_expenses-v_reinvestments-v_salary,2) ELSE NULL END;
  v_difference:=CASE WHEN v_cash_received IS NOT NULL AND v_expected_cash IS NOT NULL
    THEN round(v_cash_received-v_expected_cash,2) ELSE NULL END;
  -- Keep the physical inventory rows visible even while post-cutoff
  -- movements await Owner classification. Preserve a separate diagnostic
  -- for negative calculated sales, but never expose provisional sales/cash.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'producto_id',x.value->'producto_id',
    'nombre',x.value->'nombre',
    'unidades_vendidas',x.value->'unidades_vendidas',
    'inventario_inicial',x.value->'inventario_inicial',
    'transferencias_entrada',x.value->'transferencias_entrada',
    'compras',x.value->'compras',
    'reinversiones_entrada',x.value->'reinversiones_entrada',
    'transferencias_salida',x.value->'transferencias_salida',
    'vales_salida',x.value->'vales_salida',
    'mermas_aprobadas',x.value->'mermas_aprobadas',
    'bajas_aprobadas',x.value->'bajas_aprobadas',
    'inventario_final',x.value->'inventario_final',
    'inventario_final_original',x.value->'inventario_final_original',
    'inventario_final_corregido',x.value->'inventario_final_corregido'
  ) ORDER BY x.value->>'nombre'),'[]'::jsonb)
  INTO v_negative_details
  FROM jsonb_array_elements(coalesce(v_lines,'[]'::jsonb)) x(value)
  WHERE coalesce((x.value->>'unidades_vendidas')::numeric,0)<0;

  IF v_pending_post>0 THEN
    v_total_units:=NULL;
    v_sales_total:=NULL;
    v_salary:=NULL;
    v_expected_cash:=NULL;
    v_difference:=NULL;
    SELECT coalesce(jsonb_agg(
      x.value - ARRAY['unidades_vendidas','importe_estimado']
      ORDER BY x.value->>'nombre'
    ),'[]'::jsonb)
    INTO v_lines
    FROM jsonb_array_elements(coalesce(v_lines,'[]'::jsonb)) x(value);
  END IF;
  v_complete:=v_initial.id IS NOT NULL AND v_final.id IS NOT NULL
    AND v_total_lines>0 AND v_priced_lines=v_total_lines AND v_missing_price_sold=0 AND v_negative_lines=0
    AND v_rate IS NOT NULL AND v_daily_pending=0 AND v_daily_missing=0
    AND v_pending_expenses=0 AND v_pending_reinvestments=0 AND v_pending_adjustments=0
    AND v_pending_post=0
    AND v_cash_received IS NOT NULL;

  RETURN jsonb_build_object(
    'aplica',true,'calculable',v_complete,
    'formula','Inicial + entradas (transferencias/compras/reinversiones) - salidas aprobadas (transferencias/vales/mermas/bajas) - final = unidades vendidas; valoradas al precio normal.',
    'lineas',v_lines,'unidades_vendidas',v_total_units,
    'ventas_estimadas',v_sales_total,'salario_porcentaje',v_rate,'salario_calculado',v_salary,
    'gastos_aprobados',v_expenses,'reinversiones_aprobadas',v_reinvestments,
    'entregas_diarias_aprobadas',v_daily_cash,'entregas_diarias_pendientes',v_daily_pending,'entregas_diarias_faltantes',v_daily_missing,
    'dinero_final_declarado',v_final_declared,'dinero_final_contado',v_final_counted,
    'estado_dinero_final',v_final_cash_state,'dinero_recogido_total',v_cash_received,
    'efectivo_esperado_despues_de_gastos_reinversiones_salario',v_expected_cash,
    'diferencia',v_difference,
    'faltan_cortes',NOT(v_initial.id IS NOT NULL AND v_final.id IS NOT NULL),
    'familias_sin_precio',v_missing_price_sold,
    'familias_con_vendidas_negativas',v_negative_lines,
    'familias_vendidas_negativas_detalle',v_negative_details,
    'movimientos_posteriores_pendientes',v_pending_post,
    'pendientes',jsonb_build_object(
      'gastos',v_pending_expenses,'reinversiones',v_pending_reinvestments,
      'ajustes',v_pending_adjustments,'movimientos_posteriores_corte',v_pending_post,
      'entregas_diarias',v_daily_pending,'entregas_diarias_faltantes',v_daily_missing
    )
  );
END;
$function$;

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
        'costo_unitario_estimado',c.costo_unitario,
        'estado_costo',CASE WHEN c.costo_unitario IS NULL THEN 'SIN_COSTO_COMPROBADO' ELSE 'COSTO_PROMEDIO_PONDERADO_LOTES' END,
        'costo_vendido_estimado',CASE WHEN c.costo_unitario IS NOT NULL AND (x.value->>'unidades_vendidas')::numeric>=0
          THEN round((x.value->>'unidades_vendidas')::numeric*c.costo_unitario,2) ELSE NULL END,
        'ganancia_bruta_estimada',CASE WHEN c.costo_unitario IS NOT NULL AND x.value->>'importe_estimado' IS NOT NULL
          THEN round((x.value->>'importe_estimado')::numeric-
            ((x.value->>'unidades_vendidas')::numeric*c.costo_unitario),2) ELSE NULL END,
        'margen_bruto_estimado',CASE WHEN c.costo_unitario IS NOT NULL
          AND nullif((x.value->>'importe_estimado')::numeric,0) IS NOT NULL
          THEN round(100*(((x.value->>'importe_estimado')::numeric-
            ((x.value->>'unidades_vendidas')::numeric*c.costo_unitario))/
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
    ) c ON true;
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

CREATE OR REPLACE FUNCTION public.bc7_corregir_inventario_final_jornada(
  p_turno_sesion_id uuid,
  p_correcciones jsonb,
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
  v_new_qty numeric;
  v_old_qty numeric;
  v_count integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede corregir un corte histórico.' USING ERRCODE='42501';
  END IF;
  IF p_correcciones IS NULL OR jsonb_typeof(p_correcciones)<>'array' THEN
    RAISE EXCEPTION 'Envía una lista de correcciones de producto.' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_correcciones)=0 OR jsonb_array_length(p_correcciones)>200 THEN
    RAISE EXCEPTION 'Envía entre 1 y 200 correcciones de producto.' USING ERRCODE='22023';
  END IF;
  IF length(btrim(coalesce(p_comentario,'')))<5 OR length(p_comentario)>500 THEN
    RAISE EXCEPTION 'Explica el motivo de la corrección (5–500 caracteres).' USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_correcciones) x(value)
    WHERE jsonb_typeof(x.value)<>'object'
      OR coalesce(x.value->>'producto_id','') !~* '^[0-9a-f-]{36}$'
      OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
  ) THEN RAISE EXCEPTION 'Producto o cantidad inválida. Usa cantidades no negativas con hasta 3 decimales.' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_correcciones))
     <> (SELECT count(DISTINCT (x.value->>'producto_id')::uuid) FROM jsonb_array_elements(p_correcciones) x(value)) THEN
    RAISE EXCEPTION 'No repitas el mismo producto en una corrección.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'COMPLETADA' THEN
    RAISE EXCEPTION 'Solo se corrige el inventario final de una jornada completada.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_final FROM public.turno_jornada_inventario_cortes
    WHERE turno_sesion_id=v_s.id AND tipo='FINAL' AND estado='CONFIRMADO' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe un inventario final confirmado.' USING ERRCODE='23503'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_correcciones)
  LOOP
    v_product_id:=(v_item->>'producto_id')::uuid;
    v_new_qty:=(v_item->>'cantidad')::numeric;
    SELECT coalesce(c.cantidad_corregida,l.cantidad_contada)
      INTO v_old_qty
    FROM public.turno_jornada_inventario_lineas l
    LEFT JOIN public.turno_jornada_inventario_correcciones c
      ON c.turno_sesion_id=v_s.id AND c.tipo='FINAL'
      AND c.producto_id=l.producto_id AND c.vigente
    WHERE l.corte_id=v_final.id AND l.producto_id=v_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'El producto % no pertenece al corte final confirmado.',v_product_id USING ERRCODE='23503'; END IF;
    IF v_old_qty=v_new_qty THEN CONTINUE; END IF;
    UPDATE public.turno_jornada_inventario_correcciones
      SET vigente=false WHERE turno_sesion_id=v_s.id AND tipo='FINAL'
        AND producto_id=v_product_id AND vigente;
    INSERT INTO public.turno_jornada_inventario_correcciones(
      turno_sesion_id,tipo,producto_id,cantidad_original,cantidad_corregida,comentario,creado_por
    ) VALUES(v_s.id,'FINAL',v_product_id,v_old_qty,v_new_qty,btrim(p_comentario),auth.uid());
    v_count:=v_count+1;
  END LOOP;
  IF v_count=0 THEN RAISE EXCEPTION 'No hay cantidades distintas que corregir.' USING ERRCODE='22023'; END IF;
  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),'INVENTARIO_FINAL_CORREGIDO',btrim(p_comentario),
    jsonb_build_object('sesion_id',v_s.id,'corte_original_id',v_final.id),
    jsonb_build_object('productos_corregidos',v_count,'correcciones',p_correcciones)
  );
  RETURN jsonb_build_object('ok',true,'productos_corregidos',v_count,'corte_original_conservado',true);
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_corregir_inventario_final_jornada(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_corregir_inventario_final_jornada(uuid,jsonb,text) TO authenticated;
