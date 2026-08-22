-- BATTLECRUISER M21.2 — Compatibilidad con turnos existentes creados antes del snapshot inicial.
-- Si un turno histórico no tiene snapshot, la entrega captura el inventario real en el momento de entregar.

CREATE OR REPLACE FUNCTION public.declarar_entrega_inventario_turno(p_ciclo_id uuid,p_observacion text DEFAULT NULL,p_idempotency_key uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE uid uuid; v_entrega uuid; v_almacen uuid; v_count integer;
BEGIN
  uid := public._validar_usuario_operacion('ciclos','editar');
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Se requiere idempotency_key'; END IF;
  SELECT almacen_id INTO v_almacen FROM public.ciclos_operativos WHERE id=p_ciclo_id;
  IF v_almacen IS NULL THEN RAISE EXCEPTION 'Turno no encontrado.'; END IF;
  SELECT id INTO v_entrega FROM public.turnos_inventario_entregas WHERE ciclo_origen_id=p_ciclo_id FOR UPDATE;
  IF v_entrega IS NOT NULL THEN RETURN jsonb_build_object('id',v_entrega,'estado',(SELECT estado FROM public.turnos_inventario_entregas WHERE id=v_entrega),'existente',true); END IF;
  SELECT count(*) INTO v_count FROM public.turnos_inventario_inicial WHERE ciclo_id=p_ciclo_id;
  IF v_count=0 THEN
    INSERT INTO public.turnos_inventario_inicial(ciclo_id,producto_id,almacen_id,cantidad_base,presentacion_id)
    SELECT p_ciclo_id,s.producto_id,s.almacen_id,s.cantidad,p.presentacion_id FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
    WHERE s.almacen_id=v_almacen AND s.cantidad>=0 ON CONFLICT(ciclo_id,producto_id) DO NOTHING;
  END IF;
  INSERT INTO public.turnos_inventario_entregas(ciclo_origen_id,almacen_id,entregado_por,entregado_nombre,observacion,idempotency_key)
  VALUES(p_ciclo_id,v_almacen,uid,(SELECT nombre FROM public.usuarios WHERE id=uid),NULLIF(btrim(p_observacion),''),p_idempotency_key) RETURNING id INTO v_entrega;
  INSERT INTO public.turnos_inventario_entrega_lineas(entrega_id,producto_id,presentacion_id,cantidad_base,cantidad_presentacion)
  SELECT v_entrega,i.producto_id,i.presentacion_id,i.cantidad_base,i.cantidad_base FROM public.turnos_inventario_inicial i WHERE i.ciclo_id=p_ciclo_id;
  PERFORM public.registrar_auditoria('entrega_inventario','Entrega de inventario declarada','exito',v_entrega::text,p_idempotency_key,NULL);
  RETURN jsonb_build_object('id',v_entrega,'estado','PENDIENTE');
END;
$$;
GRANT EXECUTE ON FUNCTION public.declarar_entrega_inventario_turno(uuid,text,uuid) TO authenticated;
