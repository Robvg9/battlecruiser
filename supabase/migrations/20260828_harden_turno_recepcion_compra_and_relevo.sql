-- BattleCruiser TURNO: hardening de relevo y recepción física de compras.
-- Aplicado/verificado en Supabase LIVE el 2026-08-28.
-- Relevo: sustituto debe ser usuario activo elegible.
-- Compras en punto de venta: receptor derivado de sesión + tramo activos; nunca elegido manualmente.

CREATE OR REPLACE FUNCTION public.bc_interrumpir_y_relevar(p_turno_tramo_id uuid, p_sustituto_id uuid, p_motivo text)
RETURNS public.turno_tramos
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE old public.turno_tramos; r public.turno_tramos;
BEGIN
  SELECT * INTO old FROM public.turno_tramos WHERE id=p_turno_tramo_id FOR UPDATE;
  IF old.id IS NULL OR old.estado <> 'ACTIVO' THEN RAISE EXCEPTION 'Tramo activo no encontrado'; END IF;
  IF old.usuario_id <> auth.uid() THEN RAISE EXCEPTION 'Solo el operador activo puede interrumpir su tramo'; END IF;
  IF p_sustituto_id IS NULL OR p_sustituto_id=old.usuario_id THEN RAISE EXCEPTION 'Sustituto inválido'; END IF;
  IF nullif(trim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'El motivo es obligatorio'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u JOIN public.roles ro ON ro.id=u.role_id WHERE u.id=p_sustituto_id AND u.activo=true AND ro.activo=true AND ro.nombre IN ('Dependienta','Dueño')) THEN RAISE EXCEPTION 'El sustituto debe ser un usuario activo elegible'; END IF;
  UPDATE public.turno_tramos SET estado='INTERRUMPIDO',fin_at=clock_timestamp(),motivo_interrupcion=p_motivo WHERE id=old.id;
  INSERT INTO public.turno_tramos(turno_sesion_id,turno_id,usuario_id,tipo,estado,tramo_anterior_id) VALUES(old.turno_sesion_id,old.turno_id,p_sustituto_id,'RELEVO_INTERRUPCION','ACTIVO',old.id) RETURNING * INTO r;
  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload) VALUES(old.turno_id,old.turno_sesion_id,old.id,auth.uid(),'INTERRUPCION_RELEVO',jsonb_build_object('sustituto_id',p_sustituto_id,'motivo',p_motivo,'nuevo_tramo_id',r.id));
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.bc_registrar_llegada_compra(p_compra_id uuid, p_almacen_id uuid, p_observacion text DEFAULT NULL)
RETURNS public.turno_recepciones_compra
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v public.turno_recepciones_compra; v_user uuid; v_es_venta boolean;
BEGIN
  IF NOT public.bc_actor_is_admin() AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id=auth.uid() AND coalesce(u.puede_transportar_mercancia,false)=true) THEN RAISE EXCEPTION 'Solo ADMIN o transportista autorizado puede registrar llegada'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=p_almacen_id AND coalesce(a.es_punto_venta,false)=true) INTO v_es_venta;
  IF v_es_venta THEN
    SELECT tr.usuario_id INTO v_user
    FROM public.turno_tramos tr JOIN public.turno_sesiones s ON s.id=tr.turno_sesion_id
    WHERE s.almacen_id=p_almacen_id AND s.estado='EN_CURSO' AND tr.estado='ACTIVO' AND tr.usuario_id IS NOT NULL
    ORDER BY tr.inicio_at DESC LIMIT 1;
    IF v_user IS NULL THEN RAISE EXCEPTION 'No hay dependiente con sesión y tramo activos responsable del punto de venta'; END IF;
    INSERT INTO public.turno_recepciones_compra(compra_id,almacen_id,registrado_por,receptor_user_id,receptor_tipo,estado,observacion) VALUES(p_compra_id,p_almacen_id,auth.uid(),v_user,'DEPENDIENTE_SESION','PENDIENTE_RECEPCION',p_observacion) RETURNING * INTO v;
  ELSE
    IF NOT public.bc_actor_is_admin() THEN RAISE EXCEPTION 'En un almacén de almacenamiento solo ADMIN puede aprobar/recibir la mercancía'; END IF;
    INSERT INTO public.turno_recepciones_compra(compra_id,almacen_id,registrado_por,receptor_user_id,receptor_tipo,estado,observacion) VALUES(p_compra_id,p_almacen_id,auth.uid(),auth.uid(),'ADMIN_ALMACEN','PENDIENTE_RECEPCION',p_observacion) RETURNING * INTO v;
  END IF;
  RETURN v;
END; $$;
