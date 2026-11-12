BEGIN;

-- Enforce the close gate on the server for retail Jornada sessions.
-- Final owner cash count may happen after handover, but operational inputs and stock must reconcile first.
-- Keep the generic legacy close RPC for MANANA/TARDE, but forbid it from
-- bypassing the protected Jornada settlement gate.
-- Preserve the legacy close contract for MANANA/TARDE. A Jornada must
-- pass through bc5_cerrar_jornada, which validates its full daily settlement.
CREATE OR REPLACE FUNCTION public.bc_cerrar_turno_sesion(p_turno_sesion_id uuid)
RETURNS public.turno_sesiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_sesion public.turno_sesiones;
  v_tramo public.turno_tramos;
  v_declarado integer;
  v_result public.turno_sesiones;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_sesion
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;

  IF v_sesion.id IS NULL THEN
    RAISE EXCEPTION 'Sesión no encontrada.';
  END IF;
  IF v_sesion.bloque='JORNADA' THEN
    RAISE EXCEPTION 'Las jornadas deben cerrarse mediante bc5_cerrar_jornada para validar inventario, dinero y liquidación.'
      USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_sesion.id
      AND a.usuario_id=auth.uid()
      AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo una persona asignada a esta sesión puede cerrarla.';
  END IF;
  IF v_sesion.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'La sesión no está en curso.';
  END IF;

  SELECT * INTO v_tramo
  FROM public.turno_tramos
  WHERE turno_sesion_id=v_sesion.id
    AND estado='ACTIVO'
  ORDER BY inicio_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF v_tramo.id IS NULL THEN
    RAISE EXCEPTION 'La sesión EN_CURSO no tiene un tramo activo.';
  END IF;

  SELECT count(DISTINCT d.turno_tramo_id)
    INTO v_declarado
  FROM public.turno_declaraciones d
  WHERE d.turno_sesion_id=v_sesion.id;

  IF v_declarado=0 THEN
    RAISE EXCEPTION 'No se puede cerrar: el tramo debe declarar el dinero entregado.';
  END IF;

  UPDATE public.turno_tramos
  SET estado='COMPLETADO',fin_at=now()
  WHERE id=v_tramo.id;

  UPDATE public.turno_sesiones
  SET estado='COMPLETADA',updated_at=now()
  WHERE id=v_sesion.id
  RETURNING * INTO v_result;

  UPDATE public.turnos
  SET estado='CERRADO',cierre_real=now(),actualizado_en=now()
  WHERE id=v_sesion.turno_id AND estado='ABIERTO';

  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo)
  VALUES(v_sesion.turno_id,v_sesion.id,v_tramo.id,auth.uid(),'SESION_CERRADA');

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc_cerrar_turno_sesion(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc_cerrar_turno_sesion(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc5_cerrar_jornada(
  p_turno_sesion_id uuid,
  p_motivo_excepcion text DEFAULT NULL
)
RETURNS public.turno_sesiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_sesion public.turno_sesiones;
  v_programacion public.turno_jornada_programacion;
  v_local timestamp without time zone;
  v_ahora_minuto time;
  v_fecha_fin date;
  v_result public.turno_sesiones;
  v_tramo public.turno_tramos;
  v_liquidacion jsonb;
  v_pendientes jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_sesion FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_sesion.bloque<>'JORNADA' OR v_sesion.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'No es una sesión de jornada única válida.' USING ERRCODE='23503';
  END IF;
  SELECT * INTO v_programacion FROM public.turno_jornada_programacion WHERE id=v_sesion.jornada_programacion_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programación de jornada no encontrada.' USING ERRCODE='23503';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_sesion.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado puede cerrar esta jornada.' USING ERRCODE='42501';
  END IF;
  IF v_sesion.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'La jornada no está en curso.' USING ERRCODE='23514';
  END IF;

  IF EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_sesion.almacen_id AND a.tipo='minorista') THEN
    v_liquidacion:=public.bc7_liquidacion_inventario_jornada(v_sesion.id);
    v_pendientes:=coalesce(v_liquidacion->'pendientes','{}'::jsonb);
    IF coalesce((v_liquidacion->>'faltan_cortes')::boolean,true) THEN
      RAISE EXCEPTION 'No se puede cerrar: falta confirmar el inventario inicial o final.' USING ERRCODE='23514';
    END IF;
    IF v_liquidacion->>'salario_porcentaje' IS NULL THEN
      RAISE EXCEPTION 'No se puede cerrar: el Dueño debe configurar el porcentaje salarial de esta jornada.' USING ERRCODE='23514';
    END IF;
    IF coalesce((v_liquidacion->>'familias_sin_precio')::integer,0)>0 THEN
      RAISE EXCEPTION 'No se puede cerrar: hay productos sin precio válido en la liquidación.' USING ERRCODE='23514';
    END IF;
    IF coalesce((v_liquidacion->>'familias_con_vendidas_negativas')::integer,0)>0 THEN
      RAISE EXCEPTION 'No se puede cerrar: el inventario tiene diferencias negativas que deben revisarse.' USING ERRCODE='23514';
    END IF;
    IF coalesce((v_pendientes->>'gastos')::integer,0)>0
       OR coalesce((v_pendientes->>'reinversiones')::integer,0)>0
       OR coalesce((v_pendientes->>'ajustes')::integer,0)>0
       OR coalesce((v_pendientes->>'entregas_diarias')::integer,0)>0
       OR coalesce((v_pendientes->>'entregas_diarias_faltantes')::integer,0)>0 THEN
      RAISE EXCEPTION 'No se puede cerrar: faltan importes diarios o aprobaciones de gastos, reinversiones, mermas o bajas.' USING ERRCODE='23514';
    END IF;
  END IF;

  v_fecha_fin:=coalesce(v_programacion.fecha_fin,v_programacion.fecha);
  v_local:=now() AT TIME ZONE v_programacion.zona_horaria;
  v_ahora_minuto:=date_trunc('minute',v_local)::time;
  IF (v_local::date<>v_fecha_fin OR v_ahora_minuto<>v_programacion.hora_fin_prevista)
     AND trim(coalesce(p_motivo_excepcion,''))='' THEN
    RAISE EXCEPTION 'Cierre anticipado o tardío: debe registrar un motivo antes de cerrar.' USING ERRCODE='23514';
  END IF;

  -- Complete the Jornada transition here; the public legacy helper now rejects
  -- direct calls for block=JORNADA and remains available only to legacy blocks.
  SELECT * INTO v_tramo FROM public.turno_tramos
  WHERE turno_sesion_id=v_sesion.id AND estado='ACTIVO'
  ORDER BY inicio_at DESC NULLS LAST,created_at DESC NULLS LAST
  LIMIT 1 FOR UPDATE;
  IF v_tramo.id IS NULL THEN
    RAISE EXCEPTION 'La jornada EN_CURSO no tiene un tramo activo.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.turno_declaraciones d
    WHERE d.turno_tramo_id=v_tramo.id AND d.usuario_id=auth.uid()
  ) THEN
    RAISE EXCEPTION 'Antes de cerrar la jornada debes declarar el dinero entregado.' USING ERRCODE='23514';
  END IF;
  UPDATE public.turno_tramos SET estado='COMPLETADO',fin_at=now() WHERE id=v_tramo.id;
  UPDATE public.turno_sesiones SET estado='COMPLETADA',updated_at=now()
  WHERE id=v_sesion.id RETURNING * INTO v_result;
  UPDATE public.turnos SET estado='ABIERTO',estado_maestro='EN_CURSO',cierre_real=NULL,actualizado_en=now()
  WHERE id=v_sesion.turno_id;
  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo)
  VALUES(v_sesion.turno_id,v_sesion.id,v_tramo.id,auth.uid(),'SESION_CERRADA');

  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)
  VALUES(v_sesion.turno_id,v_sesion.id,auth.uid(),
    CASE WHEN v_local::date=v_fecha_fin AND v_ahora_minuto=v_programacion.hora_fin_prevista THEN 'JORNADA_CERRADA' ELSE 'JORNADA_CERRADA_CON_EXCEPCION' END,
    jsonb_build_object('fecha_fin_programada',v_fecha_fin,'hora_programada',v_programacion.hora_fin_prevista,
      'hora_real',v_ahora_minuto,'fecha_real',v_local::date,'zona_horaria',v_programacion.zona_horaria,
      'motivo',nullif(trim(p_motivo_excepcion),'')));
  INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(v_programacion.almacen_id,v_programacion.id,auth.uid(),
    CASE WHEN v_local::date=v_fecha_fin AND v_ahora_minuto=v_programacion.hora_fin_prevista THEN 'JORNADA_CERRADA' ELSE 'JORNADA_CERRADA_CON_EXCEPCION' END,
    nullif(trim(p_motivo_excepcion),''),jsonb_build_object('estado_sesion',v_sesion.estado),
    jsonb_build_object('estado_sesion',v_result.estado,'fecha_real',v_local::date,'fecha_fin_programada',v_fecha_fin,'hora_real',v_ahora_minuto));
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc5_cerrar_jornada(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc5_cerrar_jornada(uuid,text) TO authenticated;

COMMIT;
