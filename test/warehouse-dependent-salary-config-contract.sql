\set ON_ERROR_STOP on
DO $test$
DECLARE
  v_owner uuid := '20000000-0000-0000-0000-000000000001';
  v_worker uuid := '20000000-0000-0000-0000-000000000002';
  v_temp_store uuid := 'a2000000-0000-0000-0000-000000000001';
  v_perm_store uuid := 'a2000000-0000-0000-0000-000000000002';
  v_base date := (now() AT TIME ZONE 'America/Havana')::date + 200;
  v_result jsonb;
  v_turn uuid;
  v_program uuid;
  v_session uuid;
  v_rate numeric;
  v_event_count integer;
  v_list jsonb;
BEGIN
  INSERT INTO public.almacenes(id,nombre,tipo,activo) VALUES
    (v_temp_store,'Salario temporal fixture','VENTA',true),
    (v_perm_store,'Salario permanente fixture','VENTA',true);

  INSERT INTO public.turno_jornada_configuracion(almacen_id)
  VALUES (v_temp_store),(v_perm_store)
  ON CONFLICT (almacen_id) DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','',false);

  -- Una regla de una sola Jornada queda pendiente y se consume en el primer
  -- programa elegible de esta dependienta y almacén.
  v_result := public.bc8_configurar_dependienta_almacen(
    v_temp_store,v_worker,true,8,'PROXIMA_JORNADA'
  );
  IF v_result->>'aplicacion' <> 'PENDIENTE_HASTA_PROXIMA_JORNADA' THEN
    RAISE EXCEPTION 'FAIL: temporary salary rule was not kept for the next Jornada: %',v_result;
  END IF;

  v_result := public.bc5_crear_jornada_unica(
    v_temp_store,v_base,2,
    jsonb_build_array(
      jsonb_build_object('numero_dia',1,'trabaja',true,'responsable_id',v_worker),
      jsonb_build_object('numero_dia',2,'trabaja',false,'responsable_id',NULL)
    ),
    'Salary temporary contract'
  );
  v_turn := (v_result->>'turno_id')::uuid;
  SELECT p.id,p.salario_porcentaje INTO v_program,v_rate
  FROM public.turno_jornada_programacion p
  WHERE p.turno_id=v_turn AND p.numero_dia=1;
  IF v_program IS NULL OR v_rate IS DISTINCT FROM 8 THEN
    RAISE EXCEPTION 'FAIL: the one-time 8%% salary was not stamped on the next Jornada; rate=%',v_rate;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.almacen_dependienta_configuracion c
    WHERE c.almacen_id=v_temp_store AND c.usuario_id=v_worker
      AND c.salario_temporal_programacion_id=v_program
      AND c.salario_temporal_consumido_en IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL: temporary percentage was not tied to exactly one program row';
  END IF;

  -- Una regla permanente se copia al snapshot al crear la Jornada.
  v_result := public.bc8_configurar_dependienta_almacen(
    v_perm_store,v_worker,true,6,'PERMANENTE'
  );
  IF v_result->>'aplicacion' <> 'TODAS_LAS_JORNADAS_FUTURAS_NO_INICIADAS' THEN
    RAISE EXCEPTION 'FAIL: permanent salary rule returned an unexpected scope: %',v_result;
  END IF;
  v_result := public.bc5_crear_jornada_unica(
    v_perm_store,v_base,2,
    jsonb_build_array(
      jsonb_build_object('numero_dia',1,'trabaja',true,'responsable_id',v_worker),
      jsonb_build_object('numero_dia',2,'trabaja',false,'responsable_id',NULL)
    ),
    'Salary permanent contract'
  );
  v_turn := (v_result->>'turno_id')::uuid;
  SELECT p.id,p.salario_porcentaje INTO v_program,v_rate
  FROM public.turno_jornada_programacion p
  WHERE p.turno_id=v_turn AND p.numero_dia=1;
  IF v_program IS NULL OR v_rate IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'FAIL: permanent salary was not stamped on the Jornada; rate=%',v_rate;
  END IF;

  -- Una vez iniciada la sesión (tramo creado), cambiar la regla futura no
  -- modifica el snapshot de esa Jornada.
  SELECT s.id INTO v_session
  FROM public.turno_sesiones s
  WHERE s.jornada_programacion_id=v_program;
  INSERT INTO public.turno_tramos(turno_id,turno_sesion_id,usuario_id,tipo,estado)
  VALUES(v_turn,v_session,v_worker,'NORMAL','ACTIVO');

  v_result := public.bc8_configurar_dependienta_almacen(
    v_perm_store,v_worker,true,9,'PERMANENTE'
  );
  SELECT p.salario_porcentaje INTO v_rate
  FROM public.turno_jornada_programacion p WHERE p.id=v_program;
  IF v_rate IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'FAIL: permanent edit rewrote an already-started Jornada snapshot; rate=%',v_rate;
  END IF;

  v_list := public.bc8_listar_dependientas_almacen(v_perm_store);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_list->'dependientas') d
    WHERE d->>'usuario_id'=v_worker::text
      AND (d->>'salario_porcentaje_permanente')::numeric=9
  ) THEN
    RAISE EXCEPTION 'FAIL: warehouse listing did not expose the updated individual permanent rate: %',v_list;
  END IF;

  SELECT count(*) INTO v_event_count
  FROM public.almacen_dependienta_eventos
  WHERE usuario_id=v_worker
    AND almacen_id IN (v_temp_store,v_perm_store);
  IF v_event_count<4 THEN
    RAISE EXCEPTION 'FAIL: individual salary actions were not audited; events=%',v_event_count;
  END IF;

  RAISE NOTICE 'PASS warehouse dependent salary: temporary next Jornada, permanent per warehouse, started snapshot immutability, listing and audit';
END
$test$;
