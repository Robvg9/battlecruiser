-- BATTLECRUISER M21.1 — El dinero entregado al final del turno es la entrega de la TARDE.
-- La mañana solo se cuenta como recepción de dinero por la tarde; no se suma dos veces al cuadre final.

CREATE OR REPLACE FUNCTION public.obtener_cuadre_turno_general(p_ciclo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public','pg_temp' AS $$
DECLARE c record; v_ventas numeric:=0; v_compras numeric:=0; v_gastos numeric:=0; v_reinversion numeric:=0; v_esperado numeric:=0; v_entregado numeric:=0; v_mermas numeric:=0; v_bajas numeric:=0;
BEGIN
  SELECT * INTO c FROM public.ciclos_operativos WHERE id=p_ciclo_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Turno no encontrado.'; END IF;
  PERFORM public._validar_usuario_operacion('ciclos','ver');
  SELECT COALESCE(sum(v.total),0) INTO v_ventas FROM public.ventas v WHERE v.almacen_id=c.almacen_id AND v.fecha >= c.inicio_plan::timestamptz AND v.fecha < (c.fin_plan + 1)::timestamptz;
  SELECT COALESCE(sum(cp.total),0) INTO v_compras FROM public.compras cp WHERE cp.almacen_id=c.almacen_id AND cp.fecha >= c.inicio_plan::timestamptz AND cp.fecha < (c.fin_plan + 1)::timestamptz;
  SELECT COALESCE(sum(g.monto),0) INTO v_gastos FROM public.gastos g WHERE g.ciclo_id=p_ciclo_id AND g.estado='APROBADO';
  SELECT COALESCE(sum(r.total),0) INTO v_reinversion FROM public.reinversiones r WHERE r.ciclo_id=p_ciclo_id;
  SELECT COALESCE(sum(m.cantidad),0) INTO v_mermas FROM public.mermas m WHERE m.ciclo_id=p_ciclo_id AND m.estado='APROBADA';
  SELECT COALESCE(sum(b.cantidad),0) INTO v_bajas FROM public.bajas b WHERE b.ciclo_id=p_ciclo_id AND b.estado='APROBADA';
  SELECT COALESCE(sum(e.monto_contado),0) INTO v_entregado
  FROM public.entregas_caja e JOIN public.sesiones_ciclo s ON s.id=e.sesion_id
  WHERE e.ciclo_id=p_ciclo_id AND s.bloque='TARDE' AND e.estado IN('CONTADA','APROBADA');
  v_esperado := greatest(v_ventas - v_gastos - v_reinversion,0);
  RETURN jsonb_build_object('ciclo_id',p_ciclo_id,'inventario_inicial',COALESCE((SELECT jsonb_agg(jsonb_build_object('producto_id',i.producto_id,'producto_nombre',p.nombre,'cantidad',i.cantidad_base,'presentacion',pr.nombre)) FROM public.turnos_inventario_inicial i JOIN public.productos p ON p.id=i.producto_id LEFT JOIN public.presentaciones pr ON pr.id=i.presentacion_id WHERE i.ciclo_id=p_ciclo_id),'[]'::jsonb),'entradas',v_compras,'compras',v_compras,'ventas',v_ventas,'mermas',v_mermas,'bajas',v_bajas,'gastos',v_gastos,'reinversiones',v_reinversion,'dinero_esperado',v_esperado,'dinero_entregado',v_entregado,'diferencia',v_entregado-v_esperado);
END;
$$;
GRANT EXECUTE ON FUNCTION public.obtener_cuadre_turno_general(uuid) TO authenticated;
