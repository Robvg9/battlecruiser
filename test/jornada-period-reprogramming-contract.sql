\set ON_ERROR_STOP on
DO $test$
DECLARE
  v_owner uuid := '20000000-0000-0000-0000-000000000001';
  v_worker uuid := '20000000-0000-0000-0000-000000000002';
  v_store_move uuid := 'a1000000-0000-0000-0000-000000000001';
  v_store_occupied uuid := 'a1000000-0000-0000-0000-000000000002';
  v_store_legacy uuid := 'a1000000-0000-0000-0000-000000000003';
  v_store_inventory uuid := 'a1000000-0000-0000-0000-000000000004';
  v_store_started uuid := 'a1000000-0000-0000-0000-000000000005';
  v_store_legacy_assignment uuid := 'a1000000-0000-0000-0000-000000000006';
  v_store_range uuid := 'a1000000-0000-0000-0000-000000000007';
  v_base date := (now() AT TIME ZONE 'America/Havana')::date + 10;
  v_result jsonb;
  v_turn uuid;
  v_other_turn uuid;
  v_session uuid;
  v_error boolean;
  v_events integer;
  v_key uuid := '93000000-0000-0000-0000-000000000101';
BEGIN
  INSERT INTO public.almacenes(id,nombre,tipo,activo) VALUES
    (v_store_move,'Reprogramación solapada','VENTA',true),
    (v_store_occupied,'Reprogramación con día ocupado','VENTA',true),
    (v_store_legacy,'Reprogramación con asignación legacy','VENTA',true),
    (v_store_inventory,'Reprogramación con inventario inicial','VENTA',true),
    (v_store_started,'Reprogramación con actividad','VENTA',true),
    (v_store_legacy_assignment,'Turno legacy de conflicto','VENTA',true),
    (v_store_range,'Jornada consolidada con fecha_fin','VENTA',true);

  INSERT INTO public.turno_jornada_configuracion(almacen_id)
  SELECT id FROM public.almacenes WHERE id IN (
    v_store_move,v_store_occupied,v_store_legacy,v_store_inventory,v_store_started,v_store_legacy_assignment,v_store_range
  ) ON CONFLICT (almacen_id) DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','',false);

  -- A normal day-row with fecha_fin equal to fecha must shift both endpoints.
  -- Consolidated ranges (fecha_fin > fecha) are rejected below.
  -- Forward/backward shifts overlap the original range; the function must order rows safely.
  v_result := public.bc5_crear_jornada_unica(
    v_store_move,v_base,3,
    jsonb_build_array(
      jsonb_build_object('numero_dia',1,'trabaja',true,'responsable_id',v_owner),
      jsonb_build_object('numero_dia',2,'trabaja',false,'responsable_id',NULL),
      jsonb_build_object('numero_dia',3,'trabaja',true,'responsable_id',v_worker)
    ),
    'Fixture período movible'
  );
  v_turn := (v_result->>'turno_id')::uuid;
  IF v_turn IS NULL THEN RAISE EXCEPTION 'FAIL: fixture did not create a Jornada master'; END IF;
  UPDATE public.turno_jornada_programacion SET fecha_fin=fecha WHERE turno_id=v_turn;

  v_result := public.bc5_reprogramar_periodo_jornada(v_turn,v_base+2,'Mover dos días hacia delante',v_key);
  IF (v_result->>'idempotente')::boolean IS DISTINCT FROM false
     OR (v_result->>'desplazamiento_dias')::integer<>2
     OR (SELECT fecha FROM public.turnos WHERE id=v_turn)<>v_base+2
     OR (SELECT fecha FROM public.turno_jornada_programacion WHERE turno_id=v_turn AND numero_dia=1)<>v_base+2
     OR (SELECT fecha FROM public.turno_jornada_programacion WHERE turno_id=v_turn AND numero_dia=2)<>v_base+3
     OR (SELECT fecha FROM public.turno_jornada_programacion WHERE turno_id=v_turn AND numero_dia=3)<>v_base+4
     OR (SELECT fecha_fin FROM public.turno_jornada_programacion WHERE turno_id=v_turn AND numero_dia=1)<>v_base+2
     OR (SELECT fecha_fin FROM public.turno_jornada_programacion WHERE turno_id=v_turn AND numero_dia=2)<>v_base+3
     OR (SELECT fecha_fin FROM public.turno_jornada_programacion WHERE turno_id=v_turn AND numero_dia=3)<>v_base+4
     OR (SELECT s.fecha FROM public.turno_sesiones s JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id WHERE p.turno_id=v_turn AND p.numero_dia=1)<>v_base+2
     OR (SELECT s.fecha FROM public.turno_sesiones s JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id WHERE p.turno_id=v_turn AND p.numero_dia=3)<>v_base+4 THEN
    RAISE EXCEPTION 'FAIL: forward overlapping shift did not move the period consistently';
  END IF;

  v_result := public.bc5_reprogramar_periodo_jornada(v_turn,v_base+1,'Mover un día hacia atrás',
    '93000000-0000-0000-0000-000000000102');
  IF (v_result->>'desplazamiento_dias')::integer<>-1
     OR (SELECT fecha FROM public.turnos WHERE id=v_turn)<>v_base+1
     OR (SELECT fecha FROM public.turno_jornada_programacion WHERE turno_id=v_turn AND numero_dia=3)<>v_base+3
     OR (SELECT fecha_fin FROM public.turno_jornada_programacion WHERE turno_id=v_turn AND numero_dia=3)<>v_base+3 THEN
    RAISE EXCEPTION 'FAIL: backward overlapping shift did not preserve day offsets';
  END IF;

  SELECT count(*) INTO v_events FROM public.turno_jornada_eventos
  WHERE programacion_id IN (SELECT id FROM public.turno_jornada_programacion WHERE turno_id=v_turn)
    AND tipo='JORNADA_PERIODO_REPROGRAMADO';
  IF v_events<>6 THEN RAISE EXCEPTION 'FAIL: each moved day must be audited for both successful moves'; END IF;

  v_result := public.bc5_reprogramar_periodo_jornada(v_turn,v_base+2,'Mover dos días hacia delante',v_key);
  IF (v_result->>'idempotente')::boolean IS DISTINCT FROM true
     OR (v_result->>'fecha_inicio')::date<>v_base+2 THEN
    RAISE EXCEPTION 'FAIL: identical retry did not return stored result';
  END IF;
  SELECT count(*) INTO v_events FROM public.turno_jornada_eventos
  WHERE programacion_id IN (SELECT id FROM public.turno_jornada_programacion WHERE turno_id=v_turn)
    AND tipo='JORNADA_PERIODO_REPROGRAMADO';
  IF v_events<>6 THEN RAISE EXCEPTION 'FAIL: idempotent retry created duplicate audit events'; END IF;

  v_error:=false;
  BEGIN
    PERFORM public.bc5_reprogramar_periodo_jornada(v_turn,v_base+3,'Otro payload con la misma llave',v_key);
  EXCEPTION WHEN invalid_parameter_value THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: same idempotency key accepted a different payload'; END IF;

  v_error:=false;
  BEGIN
    PERFORM public.bc5_reprogramar_periodo_jornada(v_turn,
      (now() AT TIME ZONE 'America/Havana')::date-1,'Fecha pasada',
      '93000000-0000-0000-0000-000000000103');
  EXCEPTION WHEN invalid_parameter_value THEN v_error:=true;
  END;
  IF NOT v_error OR (SELECT fecha FROM public.turnos WHERE id=v_turn)<>v_base+1 THEN
    RAISE EXCEPTION 'FAIL: past date should be rejected without partial changes';
  END IF;

  v_error:=false;
  BEGIN
    PERFORM public.bc5_reprogramar_periodo_jornada(v_turn,v_base+5,'   ',
      '93000000-0000-0000-0000-000000000104');
  EXCEPTION WHEN invalid_parameter_value THEN v_error:=true;
  END;
  IF NOT v_error OR (SELECT fecha FROM public.turnos WHERE id=v_turn)<>v_base+1 THEN
    RAISE EXCEPTION 'FAIL: empty motive should be rejected without partial changes';
  END IF;

  -- A destination day already occupied in the same warehouse must roll back every row.
  v_result := public.bc5_crear_jornada_unica(
    v_store_occupied,v_base+20,2,
    jsonb_build_array(
      jsonb_build_object('numero_dia',1,'trabaja',true,'responsable_id',v_owner),
      jsonb_build_object('numero_dia',2,'trabaja',true,'responsable_id',v_worker)
    ),'Fixture con conflicto de almacén'
  );
  v_turn := (v_result->>'turno_id')::uuid;
  INSERT INTO public.turnos(usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,estado_maestro,dias_turno)
  VALUES(v_owner,'Fixture cerrado',v_store_occupied,v_base+23,'CERRADO',v_owner,v_owner,'CERRADO',1)
  RETURNING id INTO v_other_turn;
  INSERT INTO public.turno_jornada_programacion(
    turno_id,almacen_id,numero_dia,fecha,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,creado_por,actualizado_por
  ) VALUES(v_other_turn,v_store_occupied,1,v_base+23,false,NULL,
    TIME '07:00',TIME '23:00','America/Havana',NULL,'DESCANSO',v_owner,v_owner);

  v_error:=false;
  BEGIN
    PERFORM public.bc5_reprogramar_periodo_jornada(v_turn,v_base+22,'Mover hacia día ocupado',
      '93000000-0000-0000-0000-000000000105');
  EXCEPTION WHEN unique_violation THEN v_error:=true;
  END;
  IF NOT v_error OR (SELECT fecha FROM public.turnos WHERE id=v_turn)<>v_base+20
     OR (SELECT fecha FROM public.turno_jornada_programacion WHERE turno_id=v_turn AND numero_dia=1)<>v_base+20
     OR (SELECT fecha FROM public.turno_jornada_programacion WHERE turno_id=v_turn AND numero_dia=2)<>v_base+21 THEN
    RAISE EXCEPTION 'FAIL: occupied destination did not reject and roll back the whole period';
  END IF;

  -- A pending legacy assignment for the same responsible blocks the target day.
  v_result := public.bc5_crear_jornada_unica(
    v_store_legacy,v_base+40,2,
    jsonb_build_array(
      jsonb_build_object('numero_dia',1,'trabaja',true,'responsable_id',v_owner),
      jsonb_build_object('numero_dia',2,'trabaja',false,'responsable_id',NULL)
    ),'Fixture con asignación legacy'
  );
  v_turn := (v_result->>'turno_id')::uuid;
  INSERT INTO public.turnos(usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,estado_maestro,dias_turno)
  VALUES(v_owner,'Fixture legacy',v_store_legacy_assignment,v_base+41,'PROGRAMADO',v_owner,v_owner,'PROGRAMADO',1)
  RETURNING id INTO v_other_turn;
  INSERT INTO public.turno_sesiones(turno_id,almacen_id,numero_dia,bloque,fecha,estado)
  VALUES(v_other_turn,v_store_legacy_assignment,1,'MANANA',v_base+41,'PROGRAMADA')
  RETURNING id INTO v_session;
  INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
  VALUES(v_session,v_other_turn,v_owner,v_owner);

  v_error:=false;
  BEGIN
    PERFORM public.bc5_reprogramar_periodo_jornada(v_turn,v_base+41,'Mover hacia asignación legacy',
      '93000000-0000-0000-0000-000000000106');
  EXCEPTION WHEN unique_violation THEN v_error:=true;
  END;
  IF NOT v_error OR (SELECT fecha FROM public.turnos WHERE id=v_turn)<>v_base+40 THEN
    RAISE EXCEPTION 'FAIL: legacy assignment did not block destination';
  END IF;

  -- An initial inventory snapshot freezes dates even before the first opening.
  v_result := public.bc5_crear_jornada_unica(
    v_store_inventory,v_base+50,2,
    jsonb_build_array(
      jsonb_build_object('numero_dia',1,'trabaja',true,'responsable_id',v_owner),
      jsonb_build_object('numero_dia',2,'trabaja',false,'responsable_id',NULL)
    ),'Fixture con conteo inicial'
  );
  v_turn := (v_result->>'turno_id')::uuid;
  SELECT s.id INTO v_session FROM public.turno_sesiones s
  JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
  WHERE p.turno_id=v_turn AND p.numero_dia=1;
  INSERT INTO public.turno_jornada_inventario_cortes(
    turno_sesion_id,tipo,estado,creado_por,confirmado_por,observacion
  ) VALUES(v_session,'INICIAL','CONFIRMADO',v_owner,v_owner,'Corte inicial del fixture');

  v_error:=false;
  BEGIN
    PERFORM public.bc5_reprogramar_periodo_jornada(v_turn,v_base+51,'No mover después del conteo',
      '93000000-0000-0000-0000-000000000107');
  EXCEPTION WHEN check_violation THEN v_error:=true;
  END;
  IF NOT v_error OR (SELECT fecha FROM public.turnos WHERE id=v_turn)<>v_base+50 THEN
    RAISE EXCEPTION 'FAIL: initial inventory did not freeze period dates';
  END IF;

  -- Any tranche means that operational activity has begun; block even if test state remains PROGRAMADA.
  v_result := public.bc5_crear_jornada_unica(
    v_store_started,v_base+60,2,
    jsonb_build_array(
      jsonb_build_object('numero_dia',1,'trabaja',true,'responsable_id',v_owner),
      jsonb_build_object('numero_dia',2,'trabaja',false,'responsable_id',NULL)
    ),'Fixture con tramo'
  );
  v_turn := (v_result->>'turno_id')::uuid;
  SELECT s.id INTO v_session FROM public.turno_sesiones s
  JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
  WHERE p.turno_id=v_turn AND p.numero_dia=1;
  INSERT INTO public.turno_tramos(turno_id,turno_sesion_id,usuario_id,tipo,estado)
  VALUES(v_turn,v_session,v_owner,'NORMAL','ACTIVO');

  v_error:=false;
  BEGIN
    PERFORM public.bc5_reprogramar_periodo_jornada(v_turn,v_base+61,'No mover después del inicio',
      '93000000-0000-0000-0000-000000000108');
  EXCEPTION WHEN check_violation THEN v_error:=true;
  END;
  IF NOT v_error OR (SELECT fecha FROM public.turnos WHERE id=v_turn)<>v_base+60 THEN
    RAISE EXCEPTION 'FAIL: a started session did not freeze the whole period';
  END IF;


  -- A consolidated multi-day row uses fecha_fin > fecha (retroactive successor shape).
  -- Do not reprogram it using the daily-row algorithm, even if the master is future-dated.
  v_result := public.bc5_crear_jornada_unica(
    v_store_range,v_base+70,2,
    jsonb_build_array(
      jsonb_build_object('numero_dia',1,'trabaja',true,'responsable_id',v_owner),
      jsonb_build_object('numero_dia',2,'trabaja',false,'responsable_id',NULL)
    ),'Fixture con fecha_fin consolidada'
  );
  v_turn := (v_result->>'turno_id')::uuid;
  UPDATE public.turno_jornada_programacion
  SET fecha_fin=fecha+1
  WHERE turno_id=v_turn AND numero_dia=1;
  v_error:=false;
  BEGIN
    PERFORM public.bc5_reprogramar_periodo_jornada(
      v_turn,v_base+71,'No mover rango consolidado',
      '93000000-0000-0000-0000-000000000110'
    );
  EXCEPTION WHEN check_violation THEN v_error:=true;
  END;
  IF NOT v_error
     OR (SELECT fecha FROM public.turnos WHERE id=v_turn)<>v_base+70
     OR (SELECT fecha FROM public.turno_jornada_programacion WHERE turno_id=v_turn AND numero_dia=1)<>v_base+70
     OR (SELECT fecha_fin FROM public.turno_jornada_programacion WHERE turno_id=v_turn AND numero_dia=1)<>v_base+71 THEN
    RAISE EXCEPTION 'FAIL: consolidated fecha_fin period was not safely rejected without mutation';
  END IF;

  IF to_regclass('public.turno_jornada_reprogramacion_turno_id_idx') IS NULL THEN
    RAISE EXCEPTION 'FAIL: idempotency table Turno FK index is missing';
  END IF;

  -- Non-admin and anon access are denied; authenticated access remains available to the RPC gate.
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  v_error:=false;
  BEGIN
    PERFORM public.bc5_reprogramar_periodo_jornada(
      '00000000-0000-0000-0000-000000000000',v_base+2,'No admin',
      '93000000-0000-0000-0000-000000000109');
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: non-admin invoked period reschedule'; END IF;
  IF has_function_privilege('anon','public.bc5_reprogramar_periodo_jornada(uuid,date,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can execute period reschedule RPC';
  END IF;
  IF NOT has_function_privilege('authenticated','public.bc5_reprogramar_periodo_jornada(uuid,date,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated lacks the intended RPC grant';
  END IF;

  RAISE NOTICE 'PASS Jornada period reschedule: overlapping shifts, warehouse/legacy conflicts, inventory/activity freeze, audit, idempotency and RBAC';
END
$test$;
