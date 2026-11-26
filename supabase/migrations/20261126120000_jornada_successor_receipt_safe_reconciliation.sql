-- Owner-only, per-product reconciliation of an accepted successor receipt to a closed
-- source Jornada FINAL. Original cut lines, successor INITIAL, receipt, catalog and stock
-- are never updated; only the audited FINAL correction overlay is appended.
CREATE OR REPLACE FUNCTION public.bc7_previsualizar_reconciliacion_final_sucesora(
  p_sesion_origen_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_source public.turno_sesiones;
  v_source_turn public.turnos;
  v_source_cut public.turno_jornada_inventario_cortes;
  v_delivery public.turno_jornada_inventario_entregas;
  v_receipt public.turno_jornada_inventario_recepciones;
  v_target public.turno_sesiones;
  v_target_cut public.turno_jornada_inventario_cortes;
  v_item record;
  v_lines jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_already jsonb;
  v_has_movement boolean;
  v_old_qty numeric;
  v_new_qty numeric;
  v_delta numeric;
  v_diff_count integer := 0;
  v_eligible_count integer := 0;
  v_blocked_count integer := 0;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin autenticado puede revisar esta conciliación.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_source
  FROM public.turno_sesiones
  WHERE id = p_sesion_origen_id AND bloque = 'JORNADA';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_reconciliation',false,'reason','SESION_ORIGEN_NO_ENCONTRADA');
  END IF;

  SELECT * INTO v_source_turn
  FROM public.turnos
  WHERE id = v_source.turno_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_reconciliation',false,'reason','TURNO_ORIGEN_NO_ENCONTRADO');
  END IF;
  IF v_source.estado <> 'COMPLETADA'
     OR coalesce(v_source_turn.estado_maestro,v_source_turn.estado) <> 'CERRADO' THEN
    RETURN jsonb_build_object('has_reconciliation',false,'reason','JORNADA_ORIGEN_NO_COMPLETADA_O_TURNO_NO_CERRADO');
  END IF;

  SELECT * INTO v_source_cut
  FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id = v_source.id AND tipo = 'FINAL' AND estado = 'CONFIRMADO'
  ORDER BY confirmado_en DESC NULLS LAST, creado_en DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_reconciliation',false,'reason','FINAL_ORIGEN_NO_CONFIRMADO');
  END IF;

  SELECT * INTO v_delivery
  FROM public.turno_jornada_inventario_entregas
  WHERE origen_sesion_id = v_source.id
    AND origen_corte_id = v_source_cut.id
    AND estado = 'ACEPTADA'
    AND destino_sesion_id IS NOT NULL
  ORDER BY creado_en DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_reconciliation',false,'reason','RECEPCION_SUCESORA_NO_ACEPTADA');
  END IF;

  SELECT * INTO v_receipt
  FROM public.turno_jornada_inventario_recepciones
  WHERE entrega_id = v_delivery.id AND estado = 'ACEPTADA'
  ORDER BY intento DESC, recibido_en DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_reconciliation',false,'reason','EVIDENCIA_RECEPCION_NO_ENCONTRADA');
  END IF;

  SELECT * INTO v_target
  FROM public.turno_sesiones
  WHERE id = v_delivery.destino_sesion_id
    AND bloque = 'JORNADA'
    AND almacen_id = v_source.almacen_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_reconciliation',false,'reason','JORNADA_SUCESORA_NO_COINCIDE');
  END IF;

  SELECT * INTO v_target_cut
  FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id = v_target.id
    AND tipo = 'INICIAL'
    AND estado = 'CONFIRMADO'
    AND origen_corte_id = v_source_cut.id
  ORDER BY confirmado_en DESC NULLS LAST, creado_en DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_reconciliation',false,'reason','INICIAL_SUCESOR_NO_VINCULADO_AL_FINAL_ORIGEN');
  END IF;

  v_start := v_source.corte_operativo_at;
  v_end := v_receipt.recibido_en;
  IF v_start IS NULL OR v_end IS NULL OR v_end <= v_start THEN
    RETURN jsonb_build_object('has_reconciliation',false,'reason','INTERVALO_OPERATIVO_INVALIDO');
  END IF;

  SELECT e.payload INTO v_already
  FROM public.turno_eventos e
  WHERE e.turno_sesion_id = v_source.id
    AND e.tipo = 'JORNADA_FINAL_RECONCILIADO_RECEPCION_SUCESORA'
    AND e.payload->>'delivery_id' = v_delivery.id::text
  ORDER BY e.created_at DESC
  LIMIT 1;

  FOR v_item IN
    SELECT
      dl.producto_id,
      p.nombre AS producto,
      coalesce(p.producto_padre_id,p.id) AS familia_id,
      dl.cantidad_declarada,
      dl.cantidad_efectiva,
      source_line.cantidad_contada AS source_original_qty,
      current_final.cantidad_corregida AS source_corrected_qty,
      initial_line.cantidad_contada AS successor_initial_qty,
      receipt_line.cantidad_declarada AS receipt_declared_qty,
      receipt_line.cantidad_recibida AS receipt_received_qty,
      receipt_line.diferencia AS receipt_delta
    FROM public.turno_jornada_inventario_entrega_lineas dl
    JOIN public.productos p ON p.id = dl.producto_id
    LEFT JOIN public.turno_jornada_inventario_lineas source_line
      ON source_line.corte_id = v_source_cut.id
     AND source_line.producto_id = dl.producto_id
    LEFT JOIN LATERAL (
      SELECT c.cantidad_corregida
      FROM public.turno_jornada_inventario_correcciones c
      WHERE c.turno_sesion_id = v_source.id
        AND c.tipo = 'FINAL'
        AND c.producto_id = dl.producto_id
        AND c.vigente = true
      ORDER BY c.creado_en DESC, c.id DESC
      LIMIT 1
    ) current_final ON true
    LEFT JOIN public.turno_jornada_inventario_lineas initial_line
      ON initial_line.corte_id = v_target_cut.id
     AND initial_line.producto_id = dl.producto_id
    LEFT JOIN public.turno_jornada_inventario_recepcion_lineas receipt_line
      ON receipt_line.recepcion_id = v_receipt.id
     AND receipt_line.producto_id = dl.producto_id
    WHERE dl.entrega_id = v_delivery.id
    ORDER BY p.nombre, dl.producto_id
  LOOP
    v_old_qty := coalesce(v_item.source_corrected_qty,v_item.source_original_qty);
    v_new_qty := v_item.receipt_received_qty;
    v_blockers := '[]'::jsonb;
    IF v_item.source_original_qty IS NULL OR v_item.successor_initial_qty IS NULL
       OR v_item.receipt_declared_qty IS NULL OR v_item.receipt_received_qty IS NULL
       OR v_old_qty IS NULL THEN
      v_diff_count := v_diff_count + 1;
      v_blockers := jsonb_build_array('FALTA_LINEA_DE_CORTE_O_RECEPCION');
      v_blocked_count := v_blocked_count + 1;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'producto_id',v_item.producto_id,'producto',v_item.producto,
        'cantidad_final_anterior',v_old_qty,
        'cantidad_recibida_sucesora',v_new_qty,
        'diferencia_unidades',null,'elegible',false,'bloqueos',v_blockers
      ));
      CONTINUE;
    END IF;
    v_delta := round(v_new_qty - v_old_qty,3);
    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

    v_diff_count := v_diff_count + 1;
    IF v_old_qty IS DISTINCT FROM v_item.cantidad_declarada
       OR v_item.receipt_declared_qty IS DISTINCT FROM v_item.cantidad_declarada
       OR v_item.cantidad_efectiva IS DISTINCT FROM v_item.receipt_received_qty
       OR v_item.successor_initial_qty IS DISTINCT FROM v_item.receipt_received_qty
       OR v_item.receipt_delta IS DISTINCT FROM round(v_item.receipt_received_qty - v_item.receipt_declared_qty,3) THEN
      v_blockers := v_blockers || jsonb_build_array('CANTIDADES_DE_EVIDENCIA_NO_COINCIDEN');
    END IF;

    -- A physical difference is attributable to the prior Jornada only when that
    -- product family had no stock-changing activity between its immutable cutoff
    -- and the actual successor receipt time. Other products' activity does not
    -- prevent this product-specific reconciliation.
    SELECT EXISTS (
      SELECT 1
      FROM public.transferencias t
      JOIN public.transferencias_lineas tl ON tl.transferencia_id = t.id
      JOIN public.productos mp ON mp.id = tl.producto_id
      WHERE (t.almacen_origen_id = v_source.almacen_id OR t.almacen_destino_id = v_source.almacen_id)
        AND lower(t.estado) = 'completada'
        AND t.fecha > v_start AND t.fecha <= v_end
        AND coalesce(mp.producto_padre_id,mp.id) = v_item.familia_id
      UNION ALL
      SELECT 1
      FROM public.ventas v
      JOIN public.ventas_lineas vl ON vl.venta_id = v.id
      JOIN public.productos mp ON mp.id = vl.producto_id
      WHERE v.almacen_id = v_source.almacen_id
        AND v.fecha > v_start AND v.fecha <= v_end
        AND coalesce(mp.producto_padre_id,mp.id) = v_item.familia_id
      UNION ALL
      SELECT 1
      FROM public.vales_salida vs
      JOIN public.productos mp ON mp.id = vs.producto_id
      WHERE vs.almacen_id = v_source.almacen_id
        AND upper(coalesce(vs.estado,'REGISTRADO')) NOT IN ('PENDIENTE','RECHAZADO','CANCELADO','ANULADO')
        AND vs.fecha > v_start AND vs.fecha <= v_end
        AND coalesce(mp.producto_padre_id,mp.id) = v_item.familia_id
      UNION ALL
      SELECT 1
      FROM public.lotes_compra lc
      JOIN public.productos mp ON mp.id = lc.producto_id
      WHERE lc.almacen_id = v_source.almacen_id
        AND lower(coalesce(lc.origen,'')) = 'compra'
        AND lc.fecha_compra > v_start AND lc.fecha_compra <= v_end
        AND coalesce(mp.producto_padre_id,mp.id) = v_item.familia_id
      UNION ALL
      SELECT 1
      FROM public.reinversiones ri
      JOIN public.reinversiones_lineas ril ON ril.reinversion_id = ri.id
      JOIN public.productos mp ON mp.id = ril.producto_id
      WHERE ri.almacen_id = v_source.almacen_id
        AND ri.fecha > v_start AND ri.fecha <= v_end
        AND coalesce(mp.producto_padre_id,mp.id) = v_item.familia_id
      UNION ALL
      SELECT 1
      FROM public.bajas b
      JOIN public.productos mp ON mp.id = b.producto_id
      WHERE b.almacen_id = v_source.almacen_id
        AND upper(coalesce(b.estado,'')) NOT IN ('RECHAZADA','CANCELADA','ANULADA')
        AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en) > v_start
        AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en) <= v_end
        AND coalesce(mp.producto_padre_id,mp.id) = v_item.familia_id
      UNION ALL
      SELECT 1
      FROM public.mermas m
      JOIN public.productos mp ON mp.id = m.producto_id
      WHERE m.almacen_id = v_source.almacen_id
        AND upper(coalesce(m.estado,'')) NOT IN ('RECHAZADA','CANCELADA','ANULADA')
        AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en) > v_start
        AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en) <= v_end
        AND coalesce(mp.producto_padre_id,mp.id) = v_item.familia_id
      UNION ALL
      SELECT 1
      FROM public.stock st
      JOIN public.productos mp ON mp.id = st.producto_id
      WHERE st.almacen_id = v_source.almacen_id
        AND st.updated_at > v_start AND st.updated_at <= v_end
        AND coalesce(mp.producto_padre_id,mp.id) = v_item.familia_id
      UNION ALL
      SELECT 1
      FROM public.turno_jornada_inventario_correcciones ic
      JOIN public.productos mp ON mp.id = ic.producto_id
      WHERE ic.turno_sesion_id <> v_source.id
        AND ic.creado_en > v_start AND ic.creado_en <= v_end
        AND coalesce(mp.producto_padre_id,mp.id) = v_item.familia_id
      UNION ALL
      SELECT 1
      FROM public.turno_jornada_inventario_entregas other_delivery
      JOIN public.turno_jornada_inventario_entrega_lineas other_line
        ON other_line.entrega_id = other_delivery.id
      JOIN public.productos mp ON mp.id = other_line.producto_id
      WHERE other_delivery.almacen_id = v_source.almacen_id
        AND other_delivery.id <> v_delivery.id
        -- A delivery that formed this Jornada's own INICIAL is opening stock,
        -- not an intermediate movement after this Jornada's operational cutoff.
        AND other_delivery.destino_sesion_id IS DISTINCT FROM v_source.id
        AND other_delivery.creado_en > v_start AND other_delivery.creado_en <= v_end
        AND coalesce(mp.producto_padre_id,mp.id) = v_item.familia_id
    ) INTO v_has_movement;

    IF v_has_movement THEN
      v_blockers := v_blockers || jsonb_build_array('MOVIMIENTO_DEL_PRODUCTO_EN_INTERVALO');
    END IF;

    IF jsonb_array_length(v_blockers) = 0 THEN
      v_eligible_count := v_eligible_count + 1;
    ELSE
      v_blocked_count := v_blocked_count + 1;
    END IF;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'producto_id',v_item.producto_id,
      'producto',v_item.producto,
      'cantidad_final_anterior',v_old_qty,
      'cantidad_recibida_sucesora',v_new_qty,
      'diferencia_unidades',v_delta,
      'elegible',jsonb_array_length(v_blockers) = 0,
      'bloqueos',v_blockers
    ));
  END LOOP;

  IF v_already IS NOT NULL THEN
    RETURN jsonb_build_object(
      'has_reconciliation',true,'already_applied',true,'can_apply',false,
      'source_session_id',v_source.id,'successor_session_id',v_target.id,
      'delivery_id',v_delivery.id,'receipt_id',v_receipt.id,
      'lines',v_lines,'audit',v_already,
      'message','Esta conciliación ya fue aplicada y quedó auditada.'
    );
  END IF;

  IF v_diff_count = 0 THEN
    RETURN jsonb_build_object('has_reconciliation',false,'reason','NO_HAY_DIFERENCIAS_FISICAS_PENDIENTES');
  END IF;

  RETURN jsonb_build_object(
    'has_reconciliation',true,
    'already_applied',false,
    'can_apply',v_blocked_count = 0 AND v_eligible_count = v_diff_count,
    'source_session_id',v_source.id,
    'source_turn_id',v_source.turno_id,
    'source_cut_id',v_source_cut.id,
    'successor_session_id',v_target.id,
    'successor_cut_id',v_target_cut.id,
    'delivery_id',v_delivery.id,
    'receipt_id',v_receipt.id,
    'cutoff_at',v_start,
    'received_at',v_end,
    'products_with_difference',v_diff_count,
    'products_eligible',v_eligible_count,
    'products_blocked',v_blocked_count,
    'lines',v_lines,
    'original_cuts_preserved',true,
    'global_stock_modified',false,
    'catalog_modified',false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_aplicar_reconciliacion_final_sucesora(
  p_sesion_origen_id uuid,
  p_comentario text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_source public.turno_sesiones;
  v_source_turn public.turnos;
  v_delivery public.turno_jornada_inventario_entregas;
  v_target public.turno_sesiones;
  v_preview jsonb;
  v_line jsonb;
  v_inserted jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_existing jsonb;
  v_note text := nullif(btrim(coalesce(p_comentario,'')),'');
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin autenticado puede aplicar esta conciliación.'
      USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'La clave de idempotencia es obligatoria.' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NULL OR length(v_note) < 5 OR length(v_note) > 500 THEN
    RAISE EXCEPTION 'Explica la fuente física de la conciliación (5–500 caracteres).'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('bc7-successor-final-reconcile:'||p_sesion_origen_id::text,0)
  );

  SELECT e.payload INTO v_existing
  FROM public.turno_eventos e
  WHERE e.turno_sesion_id = p_sesion_origen_id
    AND e.tipo = 'JORNADA_FINAL_RECONCILIADO_RECEPCION_SUCESORA'
    AND e.payload->>'idempotency_key' = p_idempotency_key::text
  ORDER BY e.created_at DESC
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'repetida',true,'audit',v_existing);
  END IF;

  SELECT * INTO v_source
  FROM public.turno_sesiones
  WHERE id = p_sesion_origen_id AND bloque = 'JORNADA'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La jornada de origen no existe.' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO v_source_turn
  FROM public.turnos
  WHERE id = v_source.turno_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El turno de origen no existe.' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO v_delivery
  FROM public.turno_jornada_inventario_entregas
  WHERE origen_sesion_id = v_source.id AND estado = 'ACEPTADA'
  ORDER BY creado_en DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay una recepción sucesora aceptada para esta jornada.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_target
  FROM public.turno_sesiones
  WHERE id = v_delivery.destino_sesion_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La jornada sucesora no existe.' USING ERRCODE = '23503';
  END IF;

  v_preview := public.bc7_previsualizar_reconciliacion_final_sucesora(v_source.id);
  IF coalesce((v_preview->>'already_applied')::boolean,false) THEN
    RETURN jsonb_build_object('ok',true,'repetida',true,'audit',v_preview->'audit');
  END IF;
  IF coalesce((v_preview->>'can_apply')::boolean,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'La conciliación no es segura para aplicar: %',
      coalesce(v_preview->>'reason', 'hay diferencias con movimientos de stock intermedios o evidencia incompleta.')
      USING ERRCODE = '23514';
  END IF;

  FOR v_line IN
    SELECT value
    FROM jsonb_array_elements(coalesce(v_preview->'lines','[]'::jsonb))
  LOOP
    IF coalesce((v_line->>'elegible')::boolean,false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'La conciliación incluye una línea que dejó de ser elegible.' USING ERRCODE = '23514';
    END IF;

    UPDATE public.turno_jornada_inventario_correcciones
    SET vigente = false
    WHERE turno_sesion_id = v_source.id
      AND tipo = 'FINAL'
      AND producto_id = (v_line->>'producto_id')::uuid
      AND vigente = true;

    INSERT INTO public.turno_jornada_inventario_correcciones(
      turno_sesion_id,tipo,producto_id,cantidad_original,cantidad_corregida,
      comentario,creado_por,vigente
    ) VALUES (
      v_source.id,'FINAL',(v_line->>'producto_id')::uuid,
      (v_line->>'cantidad_final_anterior')::numeric,
      (v_line->>'cantidad_recibida_sucesora')::numeric,
      v_note,auth.uid(),true
    );

    v_inserted := v_inserted || jsonb_build_array(v_line);
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.turno_eventos(
    turno_id,turno_sesion_id,actor_user_id,tipo,payload
  ) VALUES (
    v_source.turno_id,v_source.id,auth.uid(),
    'JORNADA_FINAL_RECONCILIADO_RECEPCION_SUCESORA',
    jsonb_build_object(
      'source_session_id',v_source.id,
      'source_turn_id',v_source.turno_id,
      'source_cut_id',v_preview->'source_cut_id',
      'successor_session_id',v_target.id,
      'successor_cut_id',v_preview->'successor_cut_id',
      'delivery_id',v_delivery.id,
      'receipt_id',v_preview->'receipt_id',
      'idempotency_key',p_idempotency_key,
      'comment',v_note,
      'products_corrected',v_count,
      'corrections',v_inserted,
      'source_cut_rows_modified',false,
      'successor_initial_rows_modified',false,
      'receipt_rows_modified',false,
      'global_stock_modified',false,
      'catalog_modified',false
    )
  );

  RETURN jsonb_build_object(
    'ok',true,'repetida',false,
    'source_session_id',v_source.id,
    'successor_session_id',v_target.id,
    'delivery_id',v_delivery.id,
    'products_corrected',v_count,
    'corrections',v_inserted,
    'source_cut_rows_modified',false,
    'successor_initial_rows_modified',false,
    'receipt_rows_modified',false,
    'global_stock_modified',false,
    'catalog_modified',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_previsualizar_reconciliacion_final_sucesora(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc7_aplicar_reconciliacion_final_sucesora(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_previsualizar_reconciliacion_final_sucesora(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_aplicar_reconciliacion_final_sucesora(uuid,text,uuid) TO authenticated;
