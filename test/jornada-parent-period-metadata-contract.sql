-- PostgreSQL 17 disposable contract for Jornada parent-period metadata.
-- Never run against Supabase LIVE.
\\set ON_ERROR_STOP on

DO $test$
DECLARE
  v_turno uuid := '94000000-0000-0000-0000-000000000001';
  v_programacion uuid := '94000000-0000-0000-0000-000000000002';
  v_owner uuid := '20000000-0000-0000-0000-000000000001';
  v_warehouse uuid := '10000000-0000-0000-0000-000000000003';
  v_rows jsonb;
  v_row jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);

  INSERT INTO public.turnos(
    id,usuario_id,usuario_nombre,almacen_id,fecha,estado,
    creado_por,created_by,estado_maestro,dias_turno
  ) VALUES(
    v_turno,v_owner,'Dueño metadata fixture',v_warehouse,DATE '2099-04-15','PROGRAMADO',
    v_owner,v_owner,'PROGRAMADO',3
  );

  INSERT INTO public.turno_jornada_programacion(
    id,turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,
    creado_por,actualizado_por
  ) VALUES(
    v_programacion,v_turno,v_warehouse,1,DATE '2099-04-15',DATE '2099-04-17',true,v_owner,
    TIME '07:00',TIME '23:00','America/Havana',NULL,'PROGRAMADA',
    v_owner,v_owner
  );

  -- Query only the middle day: a valid 3-day period starts before this window.
  v_rows:=public.bc5_mis_jornadas(DATE '2099-04-16',DATE '2099-04-16');
  IF jsonb_typeof(v_rows)<>'array' OR jsonb_array_length(v_rows)<>1 THEN
    RAISE EXCEPTION 'FAIL parent-period RPC must return a multi-day period overlapping the requested day; result=%',v_rows;
  END IF;
  v_row:=v_rows->0;

  IF v_row->>'id'<>v_programacion::text THEN
    RAISE EXCEPTION 'FAIL parent-period RPC returned the wrong Jornada row: %',v_row;
  END IF;
  IF v_row->>'fecha' IS DISTINCT FROM '2099-04-15'
     OR v_row->>'fecha_fin' IS DISTINCT FROM '2099-04-17' THEN
    RAISE EXCEPTION 'FAIL parent-period RPC must preserve both period boundaries: %',v_row;
  END IF;
  IF v_row->>'turno_fecha_inicio' IS DISTINCT FROM '2099-04-15'
     OR (v_row->>'dias_turno')::integer IS DISTINCT FROM 3
     OR v_row->>'turno_estado_maestro' IS DISTINCT FROM 'PROGRAMADO' THEN
    RAISE EXCEPTION 'FAIL parent-period metadata is incomplete or inconsistent: %',v_row;
  END IF;

  RAISE NOTICE 'PASS Jornada parent-period metadata: overlap, fecha_fin, parent start, duration and master state';
END
$test$;
