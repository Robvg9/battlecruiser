-- ============================================================
-- M14b: Fix de bug preexistente en abrir_turno/cerrar_turno
-- Aplicada en producción (papxnkkjtkxsitcsvcme) el 2026-08-21
--
-- CAUSA RAÍZ: la variable local "nombre" colisionaba con la columna
-- usuarios.nombre en "SELECT nombre INTO nombre FROM public.usuarios
-- WHERE id=uid". Esta base tiene plpgsql.variable_conflict = 'error',
-- por lo que esa colisión hacía fallar SIEMPRE la ejecución con:
--   ERROR 42702: column reference "nombre" is ambiguous
-- Resultado: abrir_turno nunca pudo completar un INSERT exitoso en
-- producción. Por eso la tabla turnos tenía 0 filas antes de esta sesión.
-- ============================================================

CREATE OR REPLACE FUNCTION public.abrir_turno(p_almacen_id uuid DEFAULT NULL::uuid, p_idempotency_key uuid DEFAULT NULL::uuid, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid; v_nombre text; existente uuid; idv uuid; idem uuid; payload jsonb; v_activo boolean;
BEGIN
  uid := public._validar_usuario_operacion('turnos','crear');
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Se requiere idempotency_key';
  END IF;

  IF p_almacen_id IS NULL THEN
    RAISE EXCEPTION 'Debe especificarse un almacén para abrir el turno.' USING ERRCODE = '23514';
  END IF;

  SELECT activo INTO v_activo FROM public.almacenes WHERE id = p_almacen_id;
  IF v_activo IS NULL THEN
    RAISE EXCEPTION 'Almacén no encontrado.' USING ERRCODE = '23503';
  END IF;
  IF NOT v_activo THEN
    RAISE EXCEPTION 'El almacén indicado está inactivo.' USING ERRCODE = '23514';
  END IF;

  payload := jsonb_build_object('almacen_id',p_almacen_id,'observacion',p_observacion);
  idem := private.reclamar_idempotencia(p_idempotency_key,uid,'abrir_turno',payload);
  IF idem IS NOT NULL THEN
    RETURN jsonb_build_object('id',idem,'estado','ABIERTO','idempotente',true);
  END IF;

  SELECT id INTO existente FROM public.turnos WHERE usuario_id=uid AND estado='ABIERTO' LIMIT 1;
  IF existente IS NOT NULL THEN
    UPDATE private.operaciones_idempotencia SET resultado_id=existente WHERE idempotency_key=p_idempotency_key;
    RETURN jsonb_build_object('id',existente,'estado','ABIERTO','nota','Ya tenés un turno abierto.');
  END IF;

  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id=uid;
  INSERT INTO public.turnos(usuario_id,usuario_nombre,almacen_id,fecha,apertura_real,estado,observacion,creado_por)
  VALUES(uid,v_nombre,p_almacen_id,current_date,now(),'ABIERTO',p_observacion,uid)
  RETURNING id INTO idv;

  UPDATE private.operaciones_idempotencia SET resultado_id=idv WHERE idempotency_key=p_idempotency_key;
  PERFORM public.registrar_auditoria('turno','Turno abierto por '||coalesce(v_nombre,uid::text),'exito',idv::text,p_idempotency_key,NULL);
  RETURN jsonb_build_object('id',idv,'estado','ABIERTO');
END;
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_turno(p_turno_id uuid, p_idempotency_key uuid DEFAULT NULL::uuid, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid; v_nombre text; t record; idem uuid; idv uuid; resp int;
BEGIN
  uid:=public._validar_usuario_operacion('turnos','editar');
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Se requiere idempotency_key'; END IF;
  idem:=private.reclamar_idempotencia(p_idempotency_key,uid,'cerrar_turno',jsonb_build_object('turno_id',p_turno_id,'observacion',p_observacion));
  IF idem IS NOT NULL THEN RETURN jsonb_build_object('id',idem,'estado','CERRADO','idempotente',true); END IF;
  SELECT * INTO t FROM public.turnos WHERE id=p_turno_id;
  IF t.id IS NULL THEN RAISE EXCEPTION 'El turno no existe.'; END IF;
  IF t.estado<>'ABIERTO' THEN RAISE EXCEPTION 'El turno no está abierto (estado: %).',t.estado; END IF;
  IF t.usuario_id<>uid AND NOT public.tiene_permiso('turnos','editar_any') THEN RAISE EXCEPTION 'No podés cerrar un turno que no es tuyo.' USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO resp FROM public.responsabilidades WHERE turno_id=p_turno_id AND estado IN('PENDIENTE','EN_PROGRESO');
  UPDATE public.turnos SET estado='CERRADO',cierre_real=now(),observacion=coalesce(p_observacion,observacion),actualizado_en=now() WHERE id=p_turno_id;
  INSERT INTO public.cuadres(turno_id,dinero_esperado,estado) VALUES(p_turno_id,public.calcular_dinero_esperado_turno(p_turno_id),'PENDIENTE');
  UPDATE private.operaciones_idempotencia SET resultado_id=p_turno_id WHERE idempotency_key=p_idempotency_key;
  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id=uid;
  PERFORM public.registrar_auditoria('turno','Turno cerrado por '||coalesce(v_nombre,uid::text),'exito',p_turno_id::text,p_idempotency_key,jsonb_build_object('resp_pendientes',resp));
  RETURN jsonb_build_object('id',p_turno_id,'estado','CERRADO','responsabilidades_pendientes',resp);
END;
$function$;
