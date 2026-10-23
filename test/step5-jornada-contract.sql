-- Behavioral integration tests for 20261023050000_step5_jornada_unica_backend.sql.
-- Runs only against the disposable PostgreSQL CI service.
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('test.bc_admin','true',false);
SELECT public.bc5_configurar_horario_jornada(
  '10000000-0000-0000-0000-000000000001','07:00','23:00','America/Havana'
);
CREATE TEMP TABLE _bc5_pattern_result AS
SELECT public.bc5_guardar_patron_jornada(
  '10000000-0000-0000-0000-000000000001',
  'CI 1 trabaja / 1 descansa / 1 trabaja',
  DATE '2030-01-01',
  '[
    {"numero_dia":1,"trabaja":true,"responsable_id":"20000000-0000-0000-0000-000000000001"},
    {"numero_dia":2,"trabaja":false,"responsable_id":null},
    {"numero_dia":3,"trabaja":true,"responsable_id":"20000000-0000-0000-0000-000000000001"}
  ]'::jsonb
) AS id;

DO $test$
DECLARE v_preview jsonb;
BEGIN
  v_preview := public.bc5_previsualizar_jornada(
    '10000000-0000-0000-0000-000000000001', DATE '2030-01-01', 3
  );
  IF jsonb_array_length(v_preview) <> 3 THEN RAISE EXCEPTION 'Preview must return 3 days'; END IF;
  IF v_preview->0->>'estado' <> 'PROGRAMADA' OR v_preview->1->>'estado' <> 'DESCANSO'
     OR v_preview->2->>'estado' <> 'PROGRAMADA' THEN
    RAISE EXCEPTION 'Rotation preview is not consistent: %', v_preview;
  END IF;
  IF v_preview->0->>'hora_inicio_prevista' <> '07:00:00'
     OR v_preview->0->>'hora_fin_prevista' <> '23:00:00'
     OR v_preview->0->>'zona_horaria' <> 'America/Havana' THEN
    RAISE EXCEPTION 'Default hours/timezone are wrong: %', v_preview->0;
  END IF;
  IF coalesce((v_preview->0->>'conflicto')::boolean,true) THEN
    RAISE EXCEPTION 'Unexpected conflict in an empty calendar';
  END IF;
END
$test$;

CREATE TEMP TABLE _bc5_created AS
SELECT public.bc5_crear_jornada_unica(
  '10000000-0000-0000-0000-000000000001',
  DATE '2030-01-01', 3, NULL, 'Integration test: no production data'
) AS result;

DO $test$
DECLARE v_turno uuid; v_session_count integer; v_program_count integer;
  v_programadas integer; v_descansos integer; v_assigned integer;
BEGIN
  SELECT (result->>'turno_id')::uuid INTO v_turno FROM _bc5_created;
  IF v_turno IS NULL THEN RAISE EXCEPTION 'Creation did not return a Turno id'; END IF;
  SELECT count(*) INTO v_session_count FROM public.turno_sesiones WHERE turno_id=v_turno;
  IF v_session_count <> 2 THEN
    RAISE EXCEPTION 'A 3-day 1-work/1-rest/1-work cycle must create 2 sessions, got %',v_session_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.turno_sesiones WHERE turno_id=v_turno AND bloque<>'JORNADA') THEN
    RAISE EXCEPTION 'New-model Turno contains legacy MANANA/TARDE session';
  END IF;
  IF EXISTS (SELECT 1 FROM public.turno_sesiones s
    JOIN public.turno_asignaciones a ON a.turno_sesion_id=s.id AND a.retirado_at IS NULL
    JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
    WHERE s.turno_id=v_turno AND (p.responsable_id<>a.usuario_id OR p.fecha<>s.fecha)) THEN
    RAISE EXCEPTION 'Session assignments do not match the schedule';
  END IF;
  SELECT count(*), count(*) FILTER (WHERE estado='PROGRAMADA'),
         count(*) FILTER (WHERE estado='DESCANSO')
  INTO v_program_count,v_programadas,v_descansos
  FROM public.turno_jornada_programacion WHERE turno_id=v_turno;
  IF v_program_count<>3 OR v_programadas<>2 OR v_descansos<>1 THEN
    RAISE EXCEPTION 'Expected 2 work days + 1 rest, got % total, % work, % rest',
      v_program_count,v_programadas,v_descansos;
  END IF;
  SELECT count(*) INTO v_assigned FROM public.turno_asignaciones a
  JOIN public.turno_sesiones s ON s.id=a.turno_sesion_id
  WHERE s.turno_id=v_turno AND a.retirado_at IS NULL;
  IF v_assigned<>2 THEN RAISE EXCEPTION 'Expected 2 active assignments, got %',v_assigned; END IF;
  IF jsonb_array_length(public.bc5_listar_patrones_jornada(
       '10000000-0000-0000-0000-000000000001')) <> 1 THEN
    RAISE EXCEPTION 'Pattern read RPC did not return the saved rotation';
  END IF;
  IF jsonb_array_length(public.bc5_obtener_programacion_jornada(v_turno)) <> 3 THEN
    RAISE EXCEPTION 'Schedule read RPC did not return all work/rest rows';
  END IF;
END
$test$;

-- Reprogram day 3 as rest, turn day 2 into a work day, and transfer day 1.
SELECT public.bc5_reprogramar_jornada(
 (SELECT id FROM public.turno_jornada_programacion p
  WHERE p.turno_id=(SELECT (result->>'turno_id')::uuid FROM _bc5_created) AND numero_dia=3),
 false, NULL, 'CI: modeled rest day'
);
SELECT public.bc5_reprogramar_jornada(
 (SELECT id FROM public.turno_jornada_programacion p
  WHERE p.turno_id=(SELECT (result->>'turno_id')::uuid FROM _bc5_created) AND numero_dia=2),
 true, '20000000-0000-0000-0000-000000000002', 'CI: modeled absence replacement'
);
SELECT public.bc5_reprogramar_jornada(
 (SELECT id FROM public.turno_jornada_programacion p
  WHERE p.turno_id=(SELECT (result->>'turno_id')::uuid FROM _bc5_created) AND numero_dia=1),
 true, '20000000-0000-0000-0000-000000000002', 'CI: owner-directed replacement'
);

DO $test$
DECLARE v_turno uuid; v_total integer; v_programadas integer; v_canceladas integer;
  v_day1 uuid; v_day2 uuid; v_employee uuid := '20000000-0000-0000-0000-000000000002';
  v_old_active integer; v_new_active integer;
BEGIN
  SELECT (result->>'turno_id')::uuid INTO v_turno FROM _bc5_created;
  SELECT count(*), count(*) FILTER (WHERE estado='PROGRAMADA'),
         count(*) FILTER (WHERE estado='CANCELADA')
    INTO v_total,v_programadas,v_canceladas
  FROM public.turno_sesiones WHERE turno_id=v_turno;
  IF v_total<>3 OR v_programadas<>2 OR v_canceladas<>1 THEN
    RAISE EXCEPTION 'Reprogramming should preserve history: sessions=% scheduled=% cancelled=%',
      v_total,v_programadas,v_canceladas;
  END IF;
  SELECT id INTO v_day1 FROM public.turno_sesiones WHERE turno_id=v_turno AND numero_dia=1 AND bloque='JORNADA';
  SELECT id INTO v_day2 FROM public.turno_sesiones WHERE turno_id=v_turno AND numero_dia=2 AND bloque='JORNADA';
  SELECT count(*) INTO v_old_active FROM public.turno_asignaciones
    WHERE turno_sesion_id=v_day1 AND retirado_at IS NULL AND usuario_id='20000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_new_active FROM public.turno_asignaciones
    WHERE turno_sesion_id=v_day1 AND retirado_at IS NULL AND usuario_id=v_employee;
  IF v_old_active<>0 OR v_new_active<>1 THEN RAISE EXCEPTION 'Owner change failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.turno_asignaciones
      WHERE turno_sesion_id=v_day2 AND usuario_id=v_employee AND retirado_at IS NULL) THEN
    RAISE EXCEPTION 'Reactivated rest day lacks an active assignee';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.turno_asignaciones
      WHERE turno_sesion_id=(SELECT id FROM public.turno_sesiones WHERE turno_id=v_turno AND numero_dia=3 AND bloque='JORNADA')
        AND retirado_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Rest conversion did not retain and retire the old assignment';
  END IF;
END
$test$;

-- New model forbids a second shift in the same day/Turno.
DO $test$
DECLARE v_turno uuid := (SELECT (result->>'turno_id')::uuid FROM _bc5_created);
BEGIN
  BEGIN
    INSERT INTO public.turno_sesiones(turno_id,almacen_id,numero_dia,bloque,fecha,estado)
    VALUES (v_turno,'10000000-0000-0000-0000-000000000001',1,'MANANA',DATE '2030-01-01','PROGRAMADA');
    RAISE EXCEPTION 'A mixed MANANA/JORNADA schedule was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$test$;

-- Same responsible/date cannot be scheduled in another warehouse.
DO $test$
BEGIN
  BEGIN
    PERFORM public.bc5_crear_jornada_unica(
      '10000000-0000-0000-0000-000000000002',DATE '2030-01-02',1,
      '[{"numero_dia":1,"trabaja":true,"responsable_id":"20000000-0000-0000-0000-000000000002"}]'::jsonb,
      'CI: intentionally conflicting schedule'
    );
    RAISE EXCEPTION 'Cross-warehouse same-day conflict was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$test$;

-- Legacy active assignment and the new model cannot claim the same person/date.
DO $test$
DECLARE v_turn uuid; v_session uuid;
BEGIN
  INSERT INTO public.turnos(usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,estado_maestro,dias_turno)
  VALUES ('20000000-0000-0000-0000-000000000001',NULL,
          '10000000-0000-0000-0000-000000000002',DATE '2030-01-02','PROGRAMADO',
          '20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','PROGRAMADO',1)
  RETURNING id INTO v_turn;
  INSERT INTO public.turno_sesiones(turno_id,almacen_id,numero_dia,bloque,fecha,estado)
  VALUES (v_turn,'10000000-0000-0000-0000-000000000002',1,'MANANA',DATE '2030-01-02','PROGRAMADA')
  RETURNING id INTO v_session;
  BEGIN
    INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
    VALUES (v_session,v_turn,'20000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'Legacy/new model conflict was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$test$;

-- Admin authorization and explicit RPC/table privilege boundaries.
SELECT set_config('test.bc_admin','false',false);
DO $test$
BEGIN
  BEGIN
    PERFORM public.bc5_configurar_horario_jornada(
      '10000000-0000-0000-0000-000000000001','07:00','23:00','America/Havana');
    RAISE EXCEPTION 'Non-admin was able to change journey hours';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$test$;
SELECT set_config('test.bc_admin','true',false);

DO $test$
BEGIN
  IF has_table_privilege('authenticated','public.turno_jornada_programacion','SELECT')
     OR has_table_privilege('anon','public.turno_jornada_programacion','INSERT') THEN
    RAISE EXCEPTION 'New schedule tables are directly exposed through the Data API';
  END IF;
  IF has_function_privilege('anon',
    'public.bc5_crear_jornada_unica(uuid,date,integer,jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute the privileged journey creation RPC';
  END IF;
  IF NOT has_function_privilege('authenticated',
    'public.bc5_crear_jornada_unica(uuid,date,integer,jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated lacks the journey creation RPC grant';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.turno_jornada_programacion'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.turno_jornada_eventos'::regclass) THEN
    RAISE EXCEPTION 'RLS not enabled on new journey tables';
  END IF;
END
$test$;

SELECT 'STEP5_JORNADA_POSTGRES_INTEGRATION=PASS';
