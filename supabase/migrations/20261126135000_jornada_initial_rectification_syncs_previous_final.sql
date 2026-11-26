-- Keep predecessor FINAL and successor INITIAL aligned after an audited
-- historical INITIAL rectification, but only when the exact accepted handover
-- interval has no stock-changing activity for the corrected product family.
BEGIN;

CREATE OR REPLACE FUNCTION public.bc7_sync_previous_final_from_successor_initial(
  p_successor_session_id uuid,
  p_producto_id uuid,
  p_cantidad_inicial numeric,
  p_actor_user_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_successor public.turno_sesiones;
  v_initial public.turno_jornada_inventario_cortes;
  v_source_cut public.turno_jornada_inventario_cortes;
  v_source public.turno_sesiones;
  v_source_turn public.turnos;
  v_delivery public.turno_jornada_inventario_entregas;
  v_receipt public.turno_jornada_inventario_recepciones;
  v_product public.productos;
  v_family_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_has_movement boolean:=false;
  v_old_qty numeric;
  v_correction_id uuid;
  v_alert jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR p_actor_user_id IS DISTINCT FROM auth.uid()
     OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin autenticado puede sincronizar el FINAL anterior.'
      USING ERRCODE='42501';
  END IF;

  IF p_successor_session_id IS NULL OR p_producto_id IS NULL
     OR p_cantidad_inicial IS NULL OR p_cantidad_inicial<0 THEN
    RAISE EXCEPTION 'Sesión, producto y cantidad inicial válida son obligatorios.'
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_successor
  FROM public.turno_sesiones
  WHERE id=p_successor_session_id AND bloque='JORNADA'
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('synchronized',false,'blocked',false,'reason','JORNADA_SUCESORA_NO_ENCONTRADA');
  END IF;

  SELECT * INTO v_initial
  FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_successor.id AND tipo='INICIAL' AND estado='CONFIRMADO'
  ORDER BY confirmado_en DESC NULLS LAST,creado_en DESC
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND OR v_initial.origen_corte_id IS NULL THEN
    RETURN jsonb_build_object('synchronized',false,'blocked',false,'reason','INICIAL_SIN_FINAL_ORIGEN_VINCULADO');
  END IF;

  SELECT * INTO v_source_cut
  FROM public.turno_jornada_inventario_cortes
  WHERE id=v_initial.origen_corte_id AND tipo='FINAL' AND estado='CONFIRMADO'
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('synchronized',false,'blocked',false,'reason','FINAL_ORIGEN_NO_CONFIRMADO');
  END IF;

  SELECT * INTO v_source
  FROM public.turno_sesiones
  WHERE id=v_source_cut.turno_sesion_id
    AND bloque='JORNADA'
    AND almacen_id=v_successor.almacen_id
  FOR UPDATE;
  IF NOT FOUND OR v_source.estado<>'COMPLETADA' THEN
    RETURN jsonb_build_object('synchronized',false,'blocked',false,'reason','JORNADA_ANTERIOR_NO_COMPLETADA_O_ALMACEN_DISTINTO');
  END IF;

  SELECT * INTO v_source_turn
  FROM public.turnos
  WHERE id=v_source.turno_id
  FOR SHARE;
  IF NOT FOUND OR coalesce(v_source_turn.estado_maestro,v_source_turn.estado)<>'CERRADO' THEN
    RETURN jsonb_build_object('synchronized',false,'blocked',false,'reason','TURNO_ANTERIOR_NO_CERRADO');
  END IF;

  SELECT * INTO v_delivery
  FROM public.turno_jornada_inventario_entregas
  WHERE origen_sesion_id=v_source.id
    AND origen_corte_id=v_source_cut.id
    AND destino_sesion_id=v_successor.id
    AND estado='ACEPTADA'
  ORDER BY actualizado_en DESC NULLS LAST,creado_en DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('synchronized',false,'blocked',false,'reason','ENTREGA_SUCESORA_NO_ACEPTADA');
  END IF;

  SELECT * INTO v_receipt
  FROM public.turno_jornada_inventario_recepciones
  WHERE entrega_id=v_delivery.id AND estado='ACEPTADA'
  ORDER BY intento DESC,recibido_en DESC
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.turno_jornada_inventario_recepcion_lineas rl
    WHERE rl.recepcion_id=v_receipt.id AND rl.producto_id=p_producto_id
  ) THEN
    RETURN jsonb_build_object('synchronized',false,'blocked',false,'reason','EVIDENCIA_FISICA_DE_RECEPCION_NO_ENCONTRADA');
  END IF;

  SELECT * INTO v_product FROM public.productos WHERE id=p_producto_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('synchronized',false,'blocked',false,'reason','PRODUCTO_NO_ENCONTRADO');
  END IF;
  v_family_id:=coalesce(v_product.producto_padre_id,v_product.id);

  v_start:=coalesce(v_source.corte_operativo_at,v_source_cut.confirmado_en);
  v_end:=v_receipt.recibido_en;
  IF v_start IS NULL OR v_end IS NULL OR v_end<=v_start THEN
    RETURN jsonb_build_object('synchronized',false,'blocked',false,'reason','INTERVALO_DE_RECEPCION_INVALIDO');
  END IF;

  -- Only movements of this product family inside the actual handover interval
  -- block attribution. Later successor operations are outside this interval.
  SELECT EXISTS (
    SELECT 1
    FROM public.transferencias t
    JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
    JOIN public.productos mp ON mp.id=tl.producto_id
    WHERE (t.almacen_origen_id=v_source.almacen_id OR t.almacen_destino_id=v_source.almacen_id)
      AND lower(t.estado)='completada'
      AND t.fecha>v_start AND t.fecha<=v_end
      AND coalesce(mp.producto_padre_id,mp.id)=v_family_id
    UNION ALL
    SELECT 1
    FROM public.ventas v
    JOIN public.ventas_lineas vl ON vl.venta_id=v.id
    JOIN public.productos mp ON mp.id=vl.producto_id
    WHERE v.almacen_id=v_source.almacen_id
      AND v.fecha>v_start AND v.fecha<=v_end
      AND coalesce(mp.producto_padre_id,mp.id)=v_family_id
    UNION ALL
    SELECT 1
    FROM public.vales_salida vs
    JOIN public.productos mp ON mp.id=vs.producto_id
    WHERE vs.almacen_id=v_source.almacen_id
      AND upper(coalesce(vs.estado,'REGISTRADO')) NOT IN ('PENDIENTE','RECHAZADO','CANCELADO','ANULADO')
      AND vs.fecha>v_start AND vs.fecha<=v_end
      AND coalesce(mp.producto_padre_id,mp.id)=v_family_id
    UNION ALL
    SELECT 1
    FROM public.lotes_compra lc
    JOIN public.productos mp ON mp.id=lc.producto_id
    WHERE lc.almacen_id=v_source.almacen_id
      AND lower(coalesce(lc.origen,''))='compra'
      AND lc.fecha_compra>v_start AND lc.fecha_compra<=v_end
      AND coalesce(mp.producto_padre_id,mp.id)=v_family_id
    UNION ALL
    SELECT 1
    FROM public.reinversiones ri
    JOIN public.reinversiones_lineas ril ON ril.reinversion_id=ri.id
    JOIN public.productos mp ON mp.id=ril.producto_id
    WHERE ri.almacen_id=v_source.almacen_id
      AND ri.fecha>v_start AND ri.fecha<=v_end
      AND coalesce(mp.producto_padre_id,mp.id)=v_family_id
    UNION ALL
    SELECT 1
    FROM public.bajas b
    JOIN public.productos mp ON mp.id=b.producto_id
    WHERE b.almacen_id=v_source.almacen_id
      AND upper(coalesce(b.estado,'')) NOT IN ('RECHAZADA','CANCELADA','ANULADA')
      AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_start
      AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)<=v_end
      AND coalesce(mp.producto_padre_id,mp.id)=v_family_id
    UNION ALL
    SELECT 1
    FROM public.mermas m
    JOIN public.productos mp ON mp.id=m.producto_id
    WHERE m.almacen_id=v_source.almacen_id
      AND upper(coalesce(m.estado,'')) NOT IN ('RECHAZADA','CANCELADA','ANULADA')
      AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_start
      AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)<=v_end
      AND coalesce(mp.producto_padre_id,mp.id)=v_family_id
    UNION ALL
    SELECT 1
    FROM public.stock st
    JOIN public.productos mp ON mp.id=st.producto_id
    WHERE st.almacen_id=v_source.almacen_id
      AND st.updated_at>v_start AND st.updated_at<=v_end
      AND coalesce(mp.producto_padre_id,mp.id)=v_family_id
    UNION ALL
    SELECT 1
    FROM public.turno_jornada_inventario_correcciones ic
    JOIN public.productos mp ON mp.id=ic.producto_id
    WHERE ic.turno_sesion_id NOT IN (v_source.id,v_successor.id)
      AND ic.creado_en>v_start AND ic.creado_en<=v_end
      AND coalesce(mp.producto_padre_id,mp.id)=v_family_id
    UNION ALL
    SELECT 1
    FROM public.turno_jornada_inventario_entregas other_delivery
    JOIN public.turno_jornada_inventario_entrega_lineas other_line
      ON other_line.entrega_id=other_delivery.id
    JOIN public.productos mp ON mp.id=other_line.producto_id
    WHERE other_delivery.almacen_id=v_source.almacen_id
      AND other_delivery.id<>v_delivery.id
      AND other_delivery.creado_en>v_start AND other_delivery.creado_en<=v_end
      AND coalesce(mp.producto_padre_id,mp.id)=v_family_id
  ) INTO v_has_movement;

  SELECT coalesce(
    (
      SELECT c.cantidad_corregida
      FROM public.turno_jornada_inventario_correcciones c
      WHERE c.turno_sesion_id=v_source.id AND c.tipo='FINAL'
        AND c.producto_id=p_producto_id AND c.vigente
      ORDER BY c.creado_en DESC,c.id DESC LIMIT 1
    ),
    (
      SELECT l.cantidad_contada
      FROM public.turno_jornada_inventario_lineas l
      WHERE l.corte_id=v_source_cut.id AND l.producto_id=p_producto_id
      LIMIT 1
    )
  ) INTO v_old_qty;
  IF v_old_qty IS NULL THEN
    RETURN jsonb_build_object('synchronized',false,'blocked',false,'reason','PRODUCTO_NO_PERTENECE_AL_FINAL_ANTERIOR');
  END IF;

  IF v_has_movement THEN
    v_alert:=jsonb_build_object(
      'tipo','DISCREPANCIA_INVENTARIO_ENTRE_JORNADAS',
      'sesion_anterior_id',v_source.id,
      'sesion_sucesora_id',v_successor.id,
      'producto_id',p_producto_id,
      'producto',v_product.nombre,
      'cantidad_final_anterior',v_old_qty,
      'cantidad_inicial_corregida',p_cantidad_inicial,
      'entrega_id',v_delivery.id,
      'recepcion_id',v_receipt.id,
      'desde',v_start,'hasta',v_end,
      'movimientos_intermedios_detectados',true,
      'corte_final_anterior_actualizado',false,
      'mensaje','El INICIAL fue rectificado, pero hay movimientos de esta familia entre el FINAL anterior y la recepción. El FINAL anterior se conserva y requiere revisión administrativa.'
    );
    INSERT INTO public.turno_jornada_eventos(
      almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
    ) VALUES
    (
      v_source.almacen_id,v_source.jornada_programacion_id,p_actor_user_id,
      'JORNADA_INVENTARIO_DISCREPANCIA_CONTINUIDAD',
      'INICIAL sucesor rectificado; no se propagó al FINAL anterior por movimientos intermedios.',
      jsonb_build_object('corte_final_id',v_source_cut.id),
      jsonb_build_object('alerta',v_alert)
    ),
    (
      v_successor.almacen_id,v_successor.jornada_programacion_id,p_actor_user_id,
      'JORNADA_INVENTARIO_DISCREPANCIA_CONTINUIDAD',
      'INICIAL rectificado con movimientos intermedios en el intervalo de recepción.',
      jsonb_build_object('corte_inicial_id',v_initial.id),
      jsonb_build_object('alerta',v_alert)
    );
    RETURN jsonb_build_object(
      'synchronized',false,'blocked',true,
      'reason','MOVIMIENTO_DEL_PRODUCTO_EN_INTERVALO',
      'producto_id',p_producto_id,'producto',v_product.nombre,
      'cantidad_final_anterior',v_old_qty,
      'cantidad_inicial_corregida',p_cantidad_inicial,
      'delivery_id',v_delivery.id,'receipt_id',v_receipt.id
    );
  END IF;

  IF v_old_qty IS NOT DISTINCT FROM p_cantidad_inicial THEN
    RETURN jsonb_build_object('synchronized',false,'blocked',false,'already_aligned',true,
      'reason','FINAL_ANTERIOR_Y_NUEVO_INICIAL_YA_COINCIDEN','producto_id',p_producto_id);
  END IF;

  UPDATE public.turno_jornada_inventario_correcciones
  SET vigente=false
  WHERE turno_sesion_id=v_source.id AND tipo='FINAL'
    AND producto_id=p_producto_id AND vigente;

  INSERT INTO public.turno_jornada_inventario_correcciones(
    turno_sesion_id,tipo,producto_id,cantidad_original,cantidad_corregida,
    comentario,creado_por,vigente
  ) VALUES (
    v_source.id,'FINAL',p_producto_id,v_old_qty,p_cantidad_inicial,
    left('Sincronización automática desde INICIAL rectificado de Jornada sucesora. '
      ||'Sesión sucesora '||v_successor.id::text
      ||'; recepción aceptada '||v_receipt.id::text
      ||'; motivo: '||coalesce(nullif(btrim(p_motivo),''),'rectificación administrativa')
      ||'. El FINAL original permanece inmutable.',500),
    p_actor_user_id,true
  )
  RETURNING id INTO v_correction_id;

  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)
  VALUES (
    v_source.turno_id,v_source.id,p_actor_user_id,
    'JORNADA_FINAL_RECTIFICADO_DESDE_INICIAL_SUCESOR',
    jsonb_build_object(
      'source_session_id',v_source.id,'successor_session_id',v_successor.id,
      'source_final_cut_id',v_source_cut.id,'successor_initial_cut_id',v_initial.id,
      'delivery_id',v_delivery.id,'receipt_id',v_receipt.id,'correction_id',v_correction_id,
      'producto_id',p_producto_id,'cantidad_final_anterior',v_old_qty,
      'cantidad_inicial_corregida',p_cantidad_inicial,
      'source_of_truth','INITIAL_SUCCESSOR_RECTIFICATION_WITH_ACCEPTED_RECEIPT',
      'source_cut_rows_modified',false,'successor_initial_rows_modified',false,
      'receipt_rows_modified',false,'global_stock_modified',false,'catalog_modified',false,
      'movement_window_from',v_start,'movement_window_to',v_end
    )
  );

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES
  (
    v_source.almacen_id,v_source.jornada_programacion_id,p_actor_user_id,
    'JORNADA_FINAL_RECTIFICADO_DESDE_INICIAL_SUCESOR',
    'FINAL anterior sincronizado automáticamente desde la rectificación del INICIAL sucesor.',
    jsonb_build_object('corte_final_id',v_source_cut.id,'cantidad_anterior',v_old_qty),
    jsonb_build_object('correccion_id',v_correction_id,'producto_id',p_producto_id,
      'cantidad_corregida',p_cantidad_inicial,'corte_original_conservado',true,
      'stock_global_modificado',false)
  ),
  (
    v_successor.almacen_id,v_successor.jornada_programacion_id,p_actor_user_id,
    'JORNADA_FINAL_RECTIFICADO_DESDE_INICIAL_SUCESOR',
    'El INICIAL corregido se propagó al FINAL de la Jornada anterior.',
    jsonb_build_object('corte_inicial_id',v_initial.id,'cantidad_inicial',p_cantidad_inicial),
    jsonb_build_object('correccion_final_id',v_correction_id,'sesion_anterior_id',v_source.id,
      'corte_original_conservado',true,'stock_global_modificado',false)
  );

  RETURN jsonb_build_object(
    'synchronized',true,'blocked',false,
    'producto_id',p_producto_id,'producto',v_product.nombre,
    'cantidad_final_anterior',v_old_qty,'cantidad_final_actualizada',p_cantidad_inicial,
    'correction_id',v_correction_id,'delivery_id',v_delivery.id,'receipt_id',v_receipt.id,
    'source_cut_rows_modified',false,'successor_initial_rows_modified',false,
    'receipt_rows_modified',false,'global_stock_modified',false,'catalog_modified',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_sync_previous_final_from_successor_initial(uuid,uuid,numeric,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_sync_previous_final_from_successor_initial(uuid,uuid,numeric,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc7_corregir_inventario_inicial_jornada(p_turno_sesion_id uuid, p_correcciones jsonb, p_comentario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_initial public.turno_jornada_inventario_cortes;
  v_item jsonb;
  v_product_id uuid;
  v_new_qty numeric;
  v_old_qty numeric;
  v_count integer:=0;
  v_changes jsonb:='[]'::jsonb;
  v_final_sync_result jsonb;
  v_final_syncs jsonb:='[]'::jsonb;
  v_final_sync_blocked jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede rectificar un inventario inicial histórico.' USING ERRCODE='42501';
  END IF;
  IF p_correcciones IS NULL OR jsonb_typeof(p_correcciones)<>'array'
     OR jsonb_array_length(p_correcciones)=0 OR jsonb_array_length(p_correcciones)>200 THEN
    RAISE EXCEPTION 'Envía entre 1 y 200 correcciones de producto.' USING ERRCODE='22023';
  END IF;
  IF length(btrim(coalesce(p_comentario,'')))<5 OR length(p_comentario)>500 THEN
    RAISE EXCEPTION 'Explica el motivo de la rectificación (5–500 caracteres).' USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_correcciones) x(value)
    WHERE jsonb_typeof(x.value)<>'object'
      OR coalesce(x.value->>'producto_id','') !~* '^[0-9a-f-]{36}$'
      OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
  ) THEN
    RAISE EXCEPTION 'Producto o cantidad inválida. Usa cantidades no negativas con hasta 3 decimales.' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_correcciones))
     <> (SELECT count(DISTINCT (x.value->>'producto_id')::uuid) FROM jsonb_array_elements(p_correcciones) x(value)) THEN
    RAISE EXCEPTION 'No repitas el mismo producto en una rectificación.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'COMPLETADA' THEN
    RAISE EXCEPTION 'Solo se rectifica el inventario inicial de una jornada completada.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_initial
  FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo='INICIAL' AND estado='CONFIRMADO'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe un inventario inicial confirmado.' USING ERRCODE='23503';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_correcciones)
  LOOP
    v_product_id:=(v_item->>'producto_id')::uuid;
    v_new_qty:=(v_item->>'cantidad')::numeric;

    SELECT coalesce(c.cantidad_corregida,l.cantidad_contada)
      INTO v_old_qty
    FROM public.turno_jornada_inventario_lineas l
    LEFT JOIN public.turno_jornada_inventario_correcciones c
      ON c.turno_sesion_id=v_s.id
     AND c.tipo='INICIAL'
     AND c.producto_id=l.producto_id
     AND c.vigente
    WHERE l.corte_id=v_initial.id
      AND l.producto_id=v_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto % no pertenece al corte inicial confirmado.',v_product_id USING ERRCODE='23503';
    END IF;
    IF v_old_qty=v_new_qty THEN
      CONTINUE;
    END IF;

    UPDATE public.turno_jornada_inventario_correcciones
    SET vigente=false
    WHERE turno_sesion_id=v_s.id AND tipo='INICIAL'
      AND producto_id=v_product_id AND vigente;

    INSERT INTO public.turno_jornada_inventario_correcciones(
      turno_sesion_id,tipo,producto_id,cantidad_original,cantidad_corregida,
      comentario,creado_por
    ) VALUES(
      v_s.id,'INICIAL',v_product_id,v_old_qty,v_new_qty,btrim(p_comentario),auth.uid()
    );

    v_changes:=v_changes||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,
      'cantidad_original',v_old_qty,
      'cantidad_corregida',v_new_qty
    ));

    -- If this INITIAL is inherited from an accepted successor handover, propagate
    -- the rectified physical quantity to its exact predecessor FINAL. The helper
    -- checks product-family movements in the handover window and keeps both cuts
    -- plus the original receipt immutable.
    v_final_sync_result:=public.bc7_sync_previous_final_from_successor_initial(
      v_s.id,v_product_id,v_new_qty,auth.uid(),btrim(p_comentario)
    );
    IF coalesce((v_final_sync_result->>'synchronized')::boolean,false) THEN
      v_final_syncs:=v_final_syncs||jsonb_build_array(v_final_sync_result);
    ELSIF coalesce((v_final_sync_result->>'blocked')::boolean,false) THEN
      v_final_sync_blocked:=v_final_sync_blocked||jsonb_build_array(v_final_sync_result);
    END IF;

    v_count:=v_count+1;
  END LOOP;

  IF v_count=0 THEN
    RAISE EXCEPTION 'No hay cantidades distintas que rectificar.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),
    'INVENTARIO_INICIAL_CORREGIDO',btrim(p_comentario),
    jsonb_build_object(
      'sesion_id',v_s.id,
      'corte_inicial_original_id',v_initial.id,
      'corte_original_conservado',true
    ),
    jsonb_build_object(
      'productos_corregidos',v_count,
      'correcciones',v_changes,
      'finales_anteriores_sincronizados',v_final_syncs,
      'finales_anteriores_requieren_revision',v_final_sync_blocked,
      'recepcion_original_conservada',true,
      'stock_global_modificado',false
    )
  );

  RETURN jsonb_build_object(
    'ok',true,
    'productos_corregidos',v_count,
    'corte_original_conservado',true,
    'recepcion_original_conservada',true,
    'correcciones',v_changes,
    'finales_anteriores_sincronizados',v_final_syncs,
    'finales_anteriores_requieren_revision',v_final_sync_blocked
  );
END;
$function$


NOTIFY pgrst, 'reload schema';

COMMIT;
