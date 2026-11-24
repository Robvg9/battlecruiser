BEGIN;

-- In retail Jornadas, every daily cash amount approved by the Owner is the
-- verified cash received. No second aggregate physical count is required.
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
  v_start_at:=coalesce(v_initial.confirmado_en,v_initial.creado_en,v_turno.apertura_real);
  v_end_at:=CASE
    WHEN v_s.estado='CERRADA_OPERATIVAMENTE' AND v_s.corte_operativo_at IS NOT NULL
      THEN v_s.corte_operativo_at
    ELSE coalesce(v_final.confirmado_en,v_final.creado_en,now())
  END;
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
    SELECT l.producto_id AS product_id,
      coalesce(c.cantidad_corregida,l.cantidad_contada)::numeric AS qty
    FROM public.turno_jornada_inventario_lineas l
    LEFT JOIN public.turno_jornada_inventario_correcciones c
      ON c.turno_sesion_id=v_s.id AND c.tipo='INICIAL'
      AND c.producto_id=l.producto_id AND c.vigente
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
        OR (t.fecha AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'))::date BETWEEN v_p.fecha AND coalesce(v_p.fecha_fin,v_p.fecha)
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
        m.turno_sesion_id=v_s.id
        OR EXISTS(
          SELECT 1 FROM public.turno_jornada_movimiento_revision mr
          WHERE mr.turno_sesion_id=v_s.id
            AND mr.tipo_movimiento='MERMA'
            AND mr.movimiento_id=m.id
            AND mr.clasificacion='ANTES_CORTE'
        )
      )
      AND (
        (coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_start_at
          AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)<=v_end_at
          AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA'
              AND mr.movimiento_id=m.id AND mr.clasificacion='DESPUES_CORTE'))
        OR (coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_start_at
          AND EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA'
              AND mr.movimiento_id=m.id AND mr.clasificacion='ANTES_CORTE'))
      )
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'BAJA',b.cantidad::numeric
    FROM public.bajas b
    JOIN public.productos p ON p.id=b.producto_id
    WHERE b.almacen_id=v_s.almacen_id AND b.estado='APROBADA'
      AND (
        b.turno_sesion_id=v_s.id
        OR EXISTS(
          SELECT 1 FROM public.turno_jornada_movimiento_revision mr
          WHERE mr.turno_sesion_id=v_s.id
            AND mr.tipo_movimiento='BAJA'
            AND mr.movimiento_id=b.id
            AND mr.clasificacion='ANTES_CORTE'
        )
      )
      AND (
        (coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_start_at
          AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)<=v_end_at
          AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA'
              AND mr.movimiento_id=b.id AND mr.clasificacion='DESPUES_CORTE'))
        OR (coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_start_at
          AND EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA'
              AND mr.movimiento_id=b.id AND mr.clasificacion='ANTES_CORTE'))
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
        WHEN coalesce(historical_price.precio_venta_unitario,0)>0
          THEN historical_price.precio_venta_unitario
        WHEN coalesce(persistent_values.precio_venta_unitario,0)>0 THEN persistent_values.precio_venta_unitario
        WHEN coalesce(p.precio_normal,0)>0 THEN p.precio_normal
        WHEN count(ch.id)>0
          AND count(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))=count(ch.id)
          AND min(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))=max(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))
          AND min(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))>0 THEN min(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))
        ELSE NULL
      END precio_unitario,
      CASE
        WHEN coalesce(historical_price.precio_venta_unitario,0)>0 THEN 'PRECIO_HISTORICO_JORNADA'
        WHEN coalesce(persistent_values.precio_venta_unitario,0)>0 THEN 'PRECIO_PRODUCTO_VIGENTE'
        WHEN coalesce(p.precio_normal,0)>0 THEN 'PRECIO_FAMILIA'
        WHEN count(ch.id)>0
          AND count(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))=count(ch.id)
          AND min(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))=max(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))
          AND min(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))>0 THEN 'PRECIO_VARIANTES_UNIFORME'
        WHEN count(ch.id)>0 THEN 'PRECIO_VARIANTES_DIFERENTE_O_INCOMPLETO'
        ELSE 'SIN_PRECIO'
      END estado_precio
    FROM public.productos p
    LEFT JOIN LATERAL (
      SELECT correction.precio_venta_unitario
      FROM public.turno_jornada_valores_correcciones correction
      WHERE correction.turno_sesion_id=v_s.id
        AND correction.producto_id=p.id
        AND correction.vigente
      ORDER BY correction.creado_en DESC,correction.id DESC
      LIMIT 1
    ) historical_price ON true
    LEFT JOIN LATERAL (
      SELECT h.precio_venta_unitario
      FROM public.productos_valores_historial h
      WHERE h.producto_id=p.id
        AND h.effective_at <= coalesce(v_initial.confirmado_en,v_start_at,now())
      ORDER BY h.effective_at DESC,h.creado_en DESC,h.id DESC
      LIMIT 1
    ) persistent_values ON true
    LEFT JOIN public.productos ch ON ch.producto_padre_id=p.id AND ch.activo=true
    LEFT JOIN LATERAL (
      SELECT h.precio_venta_unitario
      FROM public.productos_valores_historial h
      WHERE h.producto_id=ch.id
        AND h.effective_at <= coalesce(v_initial.confirmado_en,v_start_at,now())
      ORDER BY h.effective_at DESC,h.creado_en DESC,h.id DESC
      LIMIT 1
    ) child_persistent_values ON true
    WHERE p.activo=true AND p.producto_padre_id IS NULL
    GROUP BY p.id,p.nombre,p.unidad,p.precio_normal,
      historical_price.precio_venta_unitario,persistent_values.precio_venta_unitario
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

  -- Each change is a physical stock checkpoint. The units no longer present at that checkpoint
  -- are valued at the price that was active immediately before it. The remaining units sold
  -- during the Jornada use the latest applied price.
  IF EXISTS(
    SELECT 1 FROM public.turno_jornada_cambios_precio c
    WHERE c.turno_sesion_id=v_s.id AND c.estado='APLICADO'
  ) THEN
    WITH price_totals AS (
      SELECT c.producto_id,
        sum(c.unidades_vendidas_precio_anterior)::numeric AS old_price_units,
        round(sum(c.unidades_vendidas_precio_anterior*c.precio_anterior),2) AS old_price_amount,
        (array_agg(c.precio_nuevo ORDER BY c.confirmado_en DESC,c.id DESC))[1] AS latest_price,
        jsonb_agg(jsonb_build_object(
          'precio_anterior',c.precio_anterior,
          'precio_nuevo',c.precio_nuevo,
          'stock_sistema',c.stock_sistema,
          'stock_contado',c.stock_contado,
          'unidades_vendidas_precio_anterior',c.unidades_vendidas_precio_anterior,
          'confirmado_en',c.confirmado_en
        ) ORDER BY c.confirmado_en,c.id) AS price_changes
      FROM public.turno_jornada_cambios_precio c
      WHERE c.turno_sesion_id=v_s.id AND c.estado='APLICADO'
      GROUP BY c.producto_id
    ),
    repriced AS (
      SELECT x.value AS line,pt.producto_id,
        coalesce((x.value->>'unidades_vendidas')::numeric,0) AS sold_qty,
        pt.old_price_units,pt.old_price_amount,pt.latest_price,pt.price_changes,
        CASE
          WHEN pt.producto_id IS NULL THEN nullif(x.value->>'importe_estimado','')::numeric
          WHEN coalesce((x.value->>'unidades_vendidas')::numeric,0)<pt.old_price_units-0.0001 THEN NULL
          WHEN coalesce((x.value->>'unidades_vendidas')::numeric,0)<0 THEN NULL
          ELSE round(pt.old_price_amount
            + greatest(0,(x.value->>'unidades_vendidas')::numeric-pt.old_price_units)*pt.latest_price,2)
        END AS repriced_amount,
        pt.producto_id IS NOT NULL
          AND coalesce((x.value->>'unidades_vendidas')::numeric,0)<pt.old_price_units-0.0001 AS inconsistent
      FROM jsonb_array_elements(coalesce(v_lines,'[]'::jsonb)) x(value)
      LEFT JOIN price_totals pt ON pt.producto_id=(x.value->>'producto_id')::uuid
    )
    SELECT
      coalesce(jsonb_agg(
        line || CASE WHEN producto_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
          'precio_unitario',latest_price,
          'estado_precio','PRECIO_CAMBIADO_CON_CONTEO',
          'precio_cambios_aplicado',true,
          'precio_cambios',price_changes,
          'precio_tramos_inconsistentes',inconsistent,
          'importe_estimado',repriced_amount
        ) END ORDER BY line->>'nombre'
      ),'[]'::jsonb),
      count(*),
      count(*) FILTER(WHERE (repriced_amount IS NOT NULL AND sold_qty>=0) OR sold_qty=0),
      count(*) FILTER(WHERE sold_qty<0),
      count(*) FILTER(WHERE sold_qty>0 AND repriced_amount IS NULL),
      coalesce(sum(sold_qty),0),
      CASE WHEN count(*) FILTER(WHERE (repriced_amount IS NULL AND sold_qty>0) OR sold_qty<0)>0
        THEN NULL ELSE round(coalesce(sum(repriced_amount),0),2) END
    INTO v_lines,v_total_lines,v_priced_lines,v_negative_lines,
         v_missing_price_sold,v_total_units,v_sales_total
    FROM repriced;
  END IF;

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
  v_daily_expected:=greatest(0,(coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha+1)::integer);
  SELECT coalesce(sum(e.monto_aprobado) FILTER(WHERE e.estado='APROBADA'),0),
         count(*) FILTER(WHERE e.estado='PENDIENTE'),
         count(*) FILTER(WHERE e.estado='APROBADA')
    INTO v_daily_cash,v_daily_pending,v_daily_approved
  FROM public.turno_jornada_entregas_diarias e
  WHERE e.turno_sesion_id=v_s.id
    AND e.fecha BETWEEN v_p.fecha AND coalesce(v_p.fecha_fin,v_p.fecha);
  v_daily_missing:=greatest(0,v_daily_expected-v_daily_approved);
  -- Every daily cash amount approved by the Owner is the verified cash received.
  -- A second aggregate physical count is not part of the retail Jornada workflow.
  v_final_declared:=coalesce(v_daily_cash,0);
  v_final_counted:=NULL;
  v_final_cash_state:=CASE
    WHEN v_daily_expected>0
      AND v_daily_approved=v_daily_expected
      AND v_daily_pending=0
      AND v_daily_missing=0
    THEN 'APROBADA'
    ELSE 'PENDIENTE'
  END;

  v_salary:=CASE WHEN v_rate IS NOT NULL AND v_sales_total IS NOT NULL
    THEN round(v_sales_total*v_rate/100,2) ELSE NULL END;
  v_cash_received:=CASE
    WHEN v_daily_expected>0
      AND v_daily_approved=v_daily_expected
      AND v_daily_pending=0
      AND v_daily_missing=0
    THEN coalesce(v_daily_cash,0)
    ELSE NULL
  END;
  v_expected_cash:=CASE WHEN v_sales_total IS NOT NULL
    THEN round(v_sales_total-v_expenses-v_reinvestments,2) ELSE NULL END;
  v_difference:=CASE WHEN v_cash_received IS NOT NULL AND v_expected_cash IS NOT NULL
    THEN round(v_expected_cash-v_cash_received,2) ELSE NULL END;
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
    'formula','Inicial + entradas (transferencias/compras/reinversiones) - salidas aprobadas (transferencias/vales/mermas/bajas) - final = unidades vendidas; valoradas al precio histórico de la jornada cuando esté registrado y, en su defecto, al precio normal del catálogo.',
    'lineas',v_lines,'unidades_vendidas',v_total_units,
    'ventas_estimadas',v_sales_total,'salario_porcentaje',v_rate,'salario_calculado',v_salary,
    'gastos_aprobados',v_expenses,'reinversiones_aprobadas',v_reinvestments,
    'entregas_diarias_aprobadas',v_daily_cash,'entregas_diarias_pendientes',v_daily_pending,'entregas_diarias_faltantes',v_daily_missing,
    'dinero_final_declarado',v_final_declared,'dinero_final_contado',v_final_counted,
    'estado_dinero_final',v_final_cash_state,'dinero_recogido_total',v_cash_received,
    'efectivo_esperado_despues_de_gastos_reinversiones',v_expected_cash,
    'efectivo_esperado_despues_de_gastos_reinversiones_salario',v_expected_cash,
    'formula_efectivo','Ventas - gastos aprobados - reinversiones aprobadas. El salario se acumula y paga por separado; no se descuenta de esta caja.',
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
CREATE OR REPLACE FUNCTION public.bc7_estado_confirmaciones_jornada(p_turno_sesion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_gastos boolean:=false;
  v_reinversiones boolean:=false;
  v_bajas boolean:=false;
  v_final boolean:=false;
  v_lista_conteo boolean:=false;
  v_lista_calculo boolean:=false;
  v_cash_state text;
  v_cash_declared boolean:=false;
  v_cash_registered boolean:=false;
  v_cash_tranche_id uuid;
  v_cash_actor_id uuid;
  v_daily_expected integer:=0;
  v_daily_registered integer:=0;
  v_daily_approved integer:=0;
  v_daily_pending integer:=0;
  v_liquidacion jsonb;
  v_phase text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN
    RAISE EXCEPTION 'La sesión no corresponde a una Jornada.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS(
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Solo la responsable asignada o ADMIN puede consultar el checklist.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_p
  FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id;

  SELECT coalesce(c.gastos_completado,false),
         coalesce(c.reinversiones_completado,false),
         coalesce(c.bajas_completado,false)
    INTO v_gastos,v_reinversiones,v_bajas
  FROM public.turno_jornada_confirmaciones c
  WHERE c.turno_sesion_id=p_turno_sesion_id;
  v_gastos:=coalesce(v_gastos,false);
  v_reinversiones:=coalesce(v_reinversiones,false);
  v_bajas:=coalesce(v_bajas,false);

  SELECT EXISTS(
    SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=p_turno_sesion_id
      AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
  ) INTO v_final;

  v_daily_expected:=greatest(0,coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha+1);
  SELECT count(DISTINCT e.fecha) FILTER(WHERE e.estado<>'RECHAZADA')::integer,
         count(DISTINCT e.fecha) FILTER(WHERE e.estado='APROBADA')::integer,
         count(*) FILTER(WHERE e.estado<>'APROBADA')::integer
    INTO v_daily_registered,v_daily_approved,v_daily_pending
  FROM public.turno_jornada_entregas_diarias e
  WHERE e.turno_sesion_id=p_turno_sesion_id
    AND e.fecha BETWEEN v_p.fecha AND coalesce(v_p.fecha_fin,v_p.fecha);

  v_cash_registered:=v_daily_expected>0
    AND v_daily_registered=v_daily_expected;
  v_cash_declared:=v_cash_registered;
  -- Owner approval of every date is the cash verification.
  v_cash_state:=CASE
    WHEN v_daily_expected>0
      AND v_daily_approved=v_daily_expected
      AND v_daily_pending=0
    THEN 'APROBADA'
    ELSE 'PENDIENTE'
  END;

    v_lista_conteo:=v_gastos AND v_reinversiones AND v_bajas AND v_final AND v_cash_declared;
  v_liquidacion:=public.bc7_liquidacion_inventario_jornada(p_turno_sesion_id);
  v_lista_calculo:=v_lista_conteo
    AND v_cash_state='APROBADA'
    AND coalesce((v_liquidacion->>'calculable')::boolean,false);

  v_phase:=CASE
    WHEN NOT v_lista_conteo THEN 'OPERACION'
    WHEN v_s.estado NOT IN ('COMPLETADA','CERRADA_OPERATIVAMENTE') THEN 'LISTA_PARA_ENTREGA'
    WHEN v_cash_state IS DISTINCT FROM 'APROBADA' THEN 'PENDIENTE_APROBACION_DIARIA'
    WHEN v_lista_calculo THEN 'CALCULAR'
    ELSE 'REVISION_APROBACIONES'
  END;

  RETURN jsonb_build_object(
    'gastos',jsonb_build_object('completado',v_gastos),
    'reinversiones',jsonb_build_object('completado',v_reinversiones),
    'bajas',jsonb_build_object('completado',v_bajas),
    'inventario_final',jsonb_build_object('completado',v_final),
    'declaracion_dinero',jsonb_build_object(
      'completado',v_cash_declared,
      'declaracion_registrada',v_cash_registered,
      'entregas_diarias_registradas',v_daily_registered,
      'entregas_diarias_esperadas',v_daily_expected,
      'entregas_diarias_aprobadas',v_daily_approved,
      'entregas_diarias_pendientes_aprobacion',v_daily_pending,
      'estado',v_cash_state
    ),
    'lista_para_conteo',v_lista_conteo,
    'lista_para_calcular',v_lista_calculo,
    'estado_efectivo_final',v_cash_state,
    'fase',v_phase
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.bc7_estado_conteo_efectivo_jornada(p_turno_sesion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_expected integer:=0;
  v_registered integer:=0;
  v_approved integer:=0;
  v_pending integer:=0;
  v_daily_total numeric(14,2):=0;
  v_checklist jsonb;
  v_approved_state boolean:=false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN
    RAISE EXCEPTION 'La sesión no corresponde a una Jornada.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS (
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id
        AND a.usuario_id=auth.uid()
        AND a.retirado_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Solo la responsable asignada o ADMIN puede consultar las entregas de efectivo.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_p
  FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la programación de esta Jornada.' USING ERRCODE='23503';
  END IF;

  v_expected:=greatest(0,(coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha+1)::integer);
  SELECT count(DISTINCT e.fecha) FILTER(WHERE e.estado<>'RECHAZADA')::integer,
         count(DISTINCT e.fecha) FILTER(WHERE e.estado='APROBADA')::integer,
         count(*) FILTER(WHERE e.estado<>'APROBADA')::integer,
         coalesce(sum(e.monto_aprobado) FILTER(WHERE e.estado='APROBADA'),0)::numeric(14,2)
    INTO v_registered,v_approved,v_pending,v_daily_total
  FROM public.turno_jornada_entregas_diarias e
  WHERE e.turno_sesion_id=v_s.id
    AND e.fecha BETWEEN v_p.fecha AND coalesce(v_p.fecha_fin,v_p.fecha);

  v_approved_state:=v_expected>0
    AND coalesce(v_approved,0)=v_expected
    AND coalesce(v_pending,0)=0;
  v_checklist:=public.bc7_estado_confirmaciones_jornada(v_s.id);

  RETURN jsonb_build_object(
    'turno_sesion_id',v_s.id,
    'entregas_diarias_esperadas',v_expected,
    'entregas_diarias_registradas',coalesce(v_registered,0),
    'entregas_diarias_aprobadas',coalesce(v_approved,0),
    'entregas_diarias_pendientes_aprobacion',coalesce(v_pending,0),
    'total_diario_aprobado',coalesce(v_daily_total,0),
    'monto_contado',NULL,
    'monto_entregas_aprobadas_al_contar',NULL,
    'diferencia',NULL,
    'estado',CASE WHEN v_approved_state THEN 'APROBADA' ELSE 'PENDIENTE' END,
    'contado_por',NULL,
    'contado_at',NULL,
    'observacion',NULL,
    'resolucion',NULL,
    'resuelto_por',NULL,
    'resuelto_at',NULL,
    'puede_contar',false,
    'requiere_conteo_fisico',false,
    'listo_para_revision',v_approved_state
      AND coalesce((v_checklist->>'lista_para_conteo')::boolean,false)
      AND coalesce((v_checklist->>'lista_para_calcular')::boolean,false)
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.listar_aprobaciones_admin()
 RETURNS TABLE(tipo text, id uuid, fecha timestamp with time zone, usuario_nombre text, almacen_nombre text, producto_nombre text, resumen text, monto numeric, cantidad numeric, estado text, motivo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (
    public.tiene_permiso('auditoria','editar_any')
    OR public.tiene_permiso('gastos','editar_any')
    OR public.tiene_permiso('mermas','editar_any')
    OR public.tiene_permiso('bajas','editar_any')
    OR public.tiene_permiso('reinversiones','editar_any')
    OR public.tiene_permiso('entregas_caja','editar_any')
  ) THEN
    RAISE EXCEPTION 'Sin permiso para ver aprobaciones administrativas' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
    SELECT 'gasto'::text,g.id,g.creado_en,g.creado_nombre,a.nombre,NULL::text,
           g.concepto,g.monto,NULL::numeric,g.estado,g.descripcion
    FROM public.gastos g
    LEFT JOIN public.almacenes a ON a.id=g.almacen_id
    WHERE g.estado='PENDIENTE'
      AND (public.tiene_permiso('gastos','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT 'merma'::text,m.id,m.creado_en,m.creado_nombre,a.nombre,p.nombre,
           'Merma de inventario'::text,NULL::numeric,m.cantidad,m.estado,m.motivo
    FROM public.mermas m
    JOIN public.almacenes a ON a.id=m.almacen_id
    JOIN public.productos p ON p.id=m.producto_id
    WHERE m.estado='PENDIENTE'
      AND (public.tiene_permiso('mermas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'baja_lista'::text,
      s.id,
      s.creado_en,
      s.creado_nombre,
      a.nombre,
      ('Lista de bajas · '||count(b.id)||' productos')::text,
      'Solicitud agrupada de inventario'::text,
      NULL::numeric,
      sum(b.cantidad),
      'PENDIENTE'::text,
      s.motivo_general
    FROM public.bajas_solicitudes s
    JOIN public.almacenes a ON a.id=s.almacen_id
    JOIN public.bajas b ON b.solicitud_id=s.id AND b.estado='PENDIENTE'
    WHERE s.estado='PENDIENTE'
      AND (public.tiene_permiso('bajas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))
    GROUP BY s.id,s.creado_en,s.creado_nombre,a.nombre,s.motivo_general

    UNION ALL

    SELECT 'baja'::text,b.id,b.creado_en,b.creado_nombre,a.nombre,p.nombre,
           'Baja individual'::text,NULL::numeric,b.cantidad,b.estado,b.motivo
    FROM public.bajas b
    JOIN public.almacenes a ON a.id=b.almacen_id
    JOIN public.productos p ON p.id=b.producto_id
    WHERE b.estado='PENDIENTE'
      AND b.solicitud_id IS NULL
      AND (public.tiene_permiso('bajas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'reinversion'::text,r.id,r.fecha,r.usuario_nombre,a.nombre,
      (SELECT string_agg(p.nombre, ', ' ORDER BY p.nombre)
       FROM public.reinversiones_lineas rl JOIN public.productos p ON p.id=rl.producto_id
       WHERE rl.reinversion_id=r.id),
      coalesce((
        SELECT string_agg(
          trim(trailing '.' from trim(trailing '0' from rl.cantidad_base::text))
          ||' '||p.nombre||' × '||
          trim(trailing '.' from trim(trailing '0' from rl.costo_unitario::text))||' CUP',
          ' · ' ORDER BY p.nombre,rl.id
        )
        FROM public.reinversiones_lineas rl
        JOIN public.productos p ON p.id=rl.producto_id
        WHERE rl.reinversion_id=r.id
      ),'Reinversión')::text,
      r.total,
      (SELECT sum(rl.cantidad_base) FROM public.reinversiones_lineas rl WHERE rl.reinversion_id=r.id),
      r.estado,
      coalesce(r.proveedor,'')
    FROM public.reinversiones r
    JOIN public.almacenes a ON a.id=r.almacen_id
    WHERE r.estado='PENDIENTE'
      AND r.turno_sesion_id IS NOT NULL
      AND public.tiene_permiso('reinversiones','editar_any')

    UNION ALL

    SELECT 'entrega_diaria'::text,e.id,e.creado_en,e.creado_nombre,a.nombre,
           NULL::text,('Entrega diaria de efectivo · '||e.fecha::text)::text,
           e.monto_declarado,NULL::numeric,e.estado,e.observacion
    FROM public.turno_jornada_entregas_diarias e
    JOIN public.almacenes a ON a.id=e.almacen_id
    WHERE e.estado='PENDIENTE'
      AND public.tiene_permiso('entregas_caja','editar_any')

    UNION ALL

    SELECT
      'declaracion_jornada'::text,
      d.id,
      d.declarado_at,
      COALESCE(u.nombre,'')::text,
      a.nombre,
      NULL::text,
      ('Declaración final de efectivo · Día '||COALESCE(t.dias_turno,s.numero_dia)::text)::text,
      d.monto,
      NULL::numeric,
      d.estado_aprobacion,
      s.estado::text
    FROM public.turno_declaraciones d
    JOIN public.turno_sesiones s ON s.id=d.turno_sesion_id
    JOIN public.turnos t ON t.id=s.turno_id
    JOIN public.almacenes a ON a.id=s.almacen_id
    LEFT JOIN public.usuarios u ON u.id=d.usuario_id
    LEFT JOIN public.turno_jornada_confirmaciones c ON c.turno_sesion_id=s.id
    WHERE s.bloque='JORNADA'
      AND s.estado='COMPLETADA'
      AND coalesce(a.tipo,'')<>'minorista'
      AND d.estado_aprobacion IN ('PENDIENTE','ESPERANDO_APROBACION')
      AND d.monto_contado IS NULL
      AND (public.tiene_permiso('entregas_caja','editar_any')
        OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'recepcion_inventario_jornada'::text,
      e.id,
      coalesce(r.recibido_en,e.actualizado_en,e.creado_en),
      coalesce(ud.nombre,u.nombre,'Responsable')::text,
      a.nombre,
      ('Destino '||sd.fecha::text||' · origen '||so.fecha::text||' · '||coalesce(diff.cnt,0)::text||' diferencia(s)')::text,
      ('Recepción inventario compartido · '||coalesce(lineas.total,0)::text||' productos')::text,
      NULL::numeric,
      coalesce(lineas.total,0)::numeric,
      e.estado,
      coalesce(r.observacion,'')
    FROM public.turno_jornada_inventario_entregas e
    JOIN public.almacenes a ON a.id=e.almacen_id
    JOIN public.turno_sesiones so ON so.id=e.origen_sesion_id
    LEFT JOIN public.turno_sesiones sd ON sd.id=e.destino_sesion_id
    LEFT JOIN public.turno_jornada_programacion pd ON pd.id=sd.jornada_programacion_id
    LEFT JOIN public.usuarios ud ON ud.id=pd.responsable_id
    LEFT JOIN LATERAL (
      SELECT rec.id,rec.recibido_en,rec.recibido_por,rec.observacion
      FROM public.turno_jornada_inventario_recepciones rec
      WHERE rec.entrega_id=e.id
      ORDER BY rec.intento DESC LIMIT 1
    ) r ON true
    LEFT JOIN public.usuarios u ON u.id=r.recibido_por
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS total
      FROM public.turno_jornada_inventario_entrega_lineas dl
      WHERE dl.entrega_id=e.id
    ) lineas ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt
      FROM public.turno_jornada_inventario_recepcion_lineas rl
      WHERE rl.recepcion_id=r.id AND rl.diferencia<>0
    ) diff ON true
    WHERE e.estado='PENDIENTE_REVISION'
      AND (public.bc_actor_is_admin() OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'jornada_revision'::text,
      t.id,
      coalesce(max(t.actualizado_en),max(s.updated_at),t.creado_en),
      coalesce(max(u.nombre),'Responsable')::text,
      a.nombre,
      NULL::text,
      ('Revisión integral de jornada · '||count(*) FILTER(WHERE s.estado IN ('COMPLETADA','CERRADA_OPERATIVAMENTE'))::text||' día(s) completado(s)')::text,
      NULL::numeric,
      NULL::numeric,
      coalesce(t.estado_maestro,t.estado),
      ('Turno pendiente de revisión del Dueño · '||coalesce(t.estado_maestro,t.estado))::text
    FROM public.turnos t
    JOIN public.almacenes a ON a.id=t.almacen_id
    JOIN public.turno_sesiones s ON s.turno_id=t.id AND s.bloque='JORNADA'
    LEFT JOIN public.turno_asignaciones ta ON ta.turno_sesion_id=s.id AND ta.retirado_at IS NULL
    LEFT JOIN public.usuarios u ON u.id=ta.usuario_id
    WHERE t.dias_turno IS NOT NULL
      AND public.bc_actor_is_admin()
      AND coalesce(t.estado_maestro,t.estado) IN ('EN_CURSO','PENDIENTE_APROBACION')
      AND NOT EXISTS(SELECT 1 FROM public.turno_revisiones tr
        WHERE tr.turno_id=t.id AND tr.estado='APROBADO')
    GROUP BY t.id,a.nombre,t.creado_en,t.estado_maestro,t.estado
    HAVING count(*) FILTER(WHERE s.estado IN ('COMPLETADA','CERRADA_OPERATIVAMENTE'))>0
       AND count(*) FILTER(WHERE s.estado NOT IN ('COMPLETADA','CERRADA_OPERATIVAMENTE','CANCELADA'))=0

    ORDER BY 3 DESC;
END;
$function$;

COMMIT;
