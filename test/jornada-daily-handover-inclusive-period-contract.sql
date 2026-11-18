-- Disposable PostgreSQL contract: both endpoints of a multi-day Jornada are valid
-- daily cash-handover dates. Dates outside the period remain rejected.
\set ON_ERROR_STOP on

DO $test$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Havana')::date;
  v_owner uuid := '20000000-0000-0000-0000-000000000003';
  v_warehouse uuid := '10000000-0000-0000-0000-000000000009';
  v_turno uuid := '94000000-0000-0000-0000-000000000001';
  v_programacion uuid := '95000000-0000-0000-0000-000000000001';
  v_sesion uuid := 'a3000000-0000-0000-0000-000000000001';
  v_tramo uuid;
  v_first uuid;
  v_last uuid;
  v_retry uuid;
  v_error boolean := false;
  v_rows integer;
BEGIN
  INSERT INTO auth.users(id) VALUES(v_owner);
  INSERT INTO public.usuarios(id,activo,role_id,nombre)
  VALUES(v_owner,true,'30000000-0000-0000-0000-000000000002','Daily Cash Contract Worker');

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','turnos:ver',false);

  INSERT INTO public.almacenes(id,nombre,tipo,activo)
  VALUES(v_warehouse,'Minorista — daily cash contract','minorista',true);

  INSERT INTO public.turnos(
    id,usuario_id,usuario_nombre,almacen_id,fecha,estado,
    creado_por,created_by,estado_maestro,dias_turno
  ) VALUES(
    v_turno,v_owner,'Dueño Fixture',v_warehouse,v_today-1,'ABIERTO',
    v_owner,v_owner,'EN_CURSO',2
  );

  INSERT INTO public.turno_jornada_programacion(
    id,turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,
    creado_por,actualizado_por
  ) VALUES(
    v_programacion,v_turno,v_warehouse,1,v_today-1,v_today,true,v_owner,
    '07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner
  );

  INSERT INTO public.turno_sesiones(
    id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id
  ) VALUES(
    v_sesion,v_turno,v_warehouse,1,'JORNADA',v_today-1,'EN_CURSO',v_programacion
  );

  INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
  VALUES(v_sesion,v_turno,v_owner,v_owner);

  INSERT INTO public.turno_tramos(turno_sesion_id,turno_id,usuario_id,tipo,estado)
  VALUES(v_sesion,v_turno,v_owner,'NORMAL','ACTIVO')
  RETURNING id INTO v_tramo;

  -- Day 1 of the scheduled period.
  v_first:=public.bc7_registrar_entrega_diaria_jornada(
    v_sesion,v_today-1,101.00,'Day 1 inclusive-period contract',
    '97000000-0000-0000-0000-000000000001'
  );

  -- fecha_fin is inclusive: the last scheduled day must also be accepted.
  v_last:=public.bc7_registrar_entrega_diaria_jornada(
    v_sesion,v_today,202.00,'Day 2 inclusive-period contract',
    '97000000-0000-0000-0000-000000000002'
  );

  v_retry:=public.bc7_registrar_entrega_diaria_jornada(
    v_sesion,v_today,202.00,'Day 2 inclusive-period contract',
    '97000000-0000-0000-0000-000000000002'
  );

  IF v_first IS NULL OR v_last IS NULL OR v_retry IS DISTINCT FROM v_last THEN
    RAISE EXCEPTION 'FAIL: daily handover endpoint or idempotent retry did not return the expected record IDs.';
  END IF;

  SELECT count(*)::integer INTO v_rows
  FROM public.turno_jornada_entregas_diarias
  WHERE turno_sesion_id=v_sesion
    AND fecha IN (v_today-1,v_today)
    AND estado='PENDIENTE'
    AND monto_aprobado IS NULL
    AND creado_por=v_owner
    AND turno_tramo_id=v_tramo;

  IF v_rows<>2 THEN
    RAISE EXCEPTION 'FAIL: expected exactly two pending, unapproved daily handovers; found %.',v_rows;
  END IF;

  v_error:=false;
  BEGIN
    PERFORM public.bc7_registrar_entrega_diaria_jornada(
      v_sesion,v_today+1,303.00,'Outside period must fail',
      '97000000-0000-0000-0000-000000000003'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_error:=true;
  END;

  IF NOT v_error THEN
    RAISE EXCEPTION 'FAIL: a daily handover after fecha_fin was accepted.';
  END IF;

  v_error:=false;
  BEGIN
    PERFORM public.bc7_registrar_entrega_diaria_jornada(
      v_sesion,v_today-2,404.00,'Before period must fail',
      '97000000-0000-0000-0000-000000000004'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_error:=true;
  END;

  IF NOT v_error THEN
    RAISE EXCEPTION 'FAIL: a daily handover before fecha was accepted.';
  END IF;

  RAISE NOTICE 'PASS: daily handovers accept both fecha and inclusive fecha_fin, preserve idempotency, and reject dates outside the period.';
END
$test$;
