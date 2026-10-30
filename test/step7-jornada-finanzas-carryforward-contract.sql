-- Disposable PostgreSQL 17 contract for jornada finance and opening cut carry-forward.
-- Requires Step 7 base contract to have created and closed Day 1 (turno/session ...007).
\set ON_ERROR_STOP on
BEGIN;

DO $test$
DECLARE
  v_turno uuid := '90000000-0000-0000-0000-000000000007';
  v_day1 uuid := '91000000-0000-0000-0000-000000000007';
  v_day2 uuid := '91000000-0000-0000-0000-000000000008';
  v_prog2 uuid := '92000000-0000-0000-0000-000000000008';
  v_owner uuid := '20000000-0000-0000-0000-000000000001';
  v_worker uuid := '20000000-0000-0000-0000-000000000002';
  v_almacen uuid := '10000000-0000-0000-0000-000000000001';
  v_pan uuid := '31000000-0000-0000-0000-000000000001';
  v_jugo uuid := '31000000-0000-0000-0000-000000000002';
  v_date date;
  v_source uuid;
  v_opening uuid;
  v_initial uuid;
  v_tramo uuid := '94000000-0000-0000-0000-000000000008';
  v_gasto uuid;
  v_gasto_retry uuid;
  v_reinv uuid;
  v_reinv_retry uuid;
  v_data jsonb;
  v_error boolean;
  v_stock_before numeric;
  v_stock_after numeric;
  v_prior_pan numeric;
  v_prior_jugo numeric;
BEGIN
  SELECT fecha INTO v_date FROM public.turno_sesiones WHERE id=v_day1;
  IF v_date IS NULL OR (SELECT estado FROM public.turno_sesiones WHERE id=v_day1)<>'COMPLETADA' THEN
    RAISE EXCEPTION 'FAIL: Day 1 source session must already be completed by the Step 7 contract.';
  END IF;
  SELECT c.id INTO v_source
  FROM public.turno_jornada_inventario_cortes c
  WHERE c.turno_sesion_id=v_day1 AND c.tipo='FINAL' AND c.estado='CONFIRMADO';
  IF v_source IS NULL THEN RAISE EXCEPTION 'FAIL: Day 1 must have a confirmed FINAL cut.'; END IF;

  -- Day 2 is a new daily jornada in the same turn; it must not rewrite Day 1.
  INSERT INTO public.turno_jornada_programacion(
    id,turno_id,almacen_id,numero_dia,fecha,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,creado_por,actualizado_por
  ) VALUES(
    v_prog2,v_turno,v_almacen,2,v_date+1,true,v_worker,
    '07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner
  );
  INSERT INTO public.turno_sesiones(
    id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id
  ) VALUES(v_day2,v_turno,v_almacen,2,'JORNADA',v_date+1,'PROGRAMADO',v_prog2);
  INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
  VALUES(v_day2,v_turno,v_worker,v_owner);

  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);

  v_data:=public.bc7_obtener_inventario_jornada(v_day2);
  IF v_data->'apertura_previa'->>'corte_id' IS DISTINCT FROM v_source::text THEN
    RAISE EXCEPTION 'FAIL: Day 2 did not receive the confirmed Day 1 final cut as opening reference.';
  END IF;
  IF jsonb_array_length(v_data->'apertura_previa'->'lineas')<>2 THEN
    RAISE EXCEPTION 'FAIL: Day 2 opening reference must contain both prior physical count lines.';
  END IF;
  SELECT cantidad INTO v_stock_before FROM public.stock
  WHERE producto_id=v_pan AND almacen_id=v_almacen;
  SELECT cantidad_contada INTO v_prior_pan FROM public.turno_jornada_inventario_lineas
  WHERE corte_id=v_source AND producto_id=v_pan;
  SELECT cantidad_contada INTO v_prior_jugo FROM public.turno_jornada_inventario_lineas
  WHERE corte_id=v_source AND producto_id=v_jugo;

  v_data:=public.bc7_guardar_inventario_jornada(v_day2,'INICIAL',
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',v_prior_pan),
      jsonb_build_object('producto_id',v_jugo,'cantidad',v_prior_jugo)
    ),'Conteo físico de apertura Día 2 basado en referencia Día 1');
  v_initial:=nullif(v_data->>'id','')::uuid;
  IF v_initial IS NULL OR v_data->>'estado'<>'CONFIRMADO' THEN
    RAISE EXCEPTION 'FAIL: Day 2 initial physical snapshot was not confirmed.';
  END IF;
  IF (SELECT origen_corte_id FROM public.turno_jornada_inventario_cortes WHERE id=v_initial) IS DISTINCT FROM v_source THEN
    RAISE EXCEPTION 'FAIL: new initial snapshot is not linked to the prior final cut.';
  END IF;
  IF v_initial=v_source THEN RAISE EXCEPTION 'FAIL: carry-forward reused/mutated the prior cut instead of creating a new snapshot.'; END IF;
  IF (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas WHERE corte_id=v_source AND producto_id=v_pan) IS DISTINCT FROM v_prior_pan THEN
    RAISE EXCEPTION 'FAIL: prior final count was overwritten.';
  END IF;
  SELECT cantidad INTO v_stock_after FROM public.stock
  WHERE producto_id=v_pan AND almacen_id=v_almacen;
  IF v_stock_after IS DISTINCT FROM v_stock_before THEN
    RAISE EXCEPTION 'FAIL: confirming opening carry-forward unexpectedly changed system stock.';
  END IF;

  -- Activate the synthetic Day 2 session after its physical initial cut and attach an active tranche.
  UPDATE public.turno_sesiones SET estado='EN_CURSO' WHERE id=v_day2;
  INSERT INTO public.turno_tramos(
    id,turno_id,turno_sesion_id,usuario_id,tipo,estado,inicio_at,created_at
  ) VALUES(v_tramo,v_turno,v_day2,v_worker,'NORMAL','ACTIVO',now(),now());

  PERFORM set_config('test.perms',
    'turnos:ver,gastos:crear,gastos:ver,reinversiones:crear,reinversiones:ver',false);

  -- Expense creation is tied to the exact JORNADA session/tranche and stays in approval.
  v_gasto:=public.bc7_registrar_gasto_jornada(
    v_day2,'Compra de limpieza',125.50,'Gasto Step 7 fixture',
    '95000000-0000-0000-0000-000000000008'
  );
  v_gasto_retry:=public.bc7_registrar_gasto_jornada(
    v_day2,'Compra de limpieza',125.50,'Gasto Step 7 fixture',
    '95000000-0000-0000-0000-000000000008'
  );
  IF v_gasto IS DISTINCT FROM v_gasto_retry THEN RAISE EXCEPTION 'FAIL: expense retry returned a different id.'; END IF;
  IF (SELECT count(*) FROM public.gastos WHERE idempotency_key='95000000-0000-0000-0000-000000000008')<>1 THEN
    RAISE EXCEPTION 'FAIL: expense retry duplicated the pending approval record.';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.gastos WHERE id=v_gasto AND estado='PENDIENTE'
      AND turno_sesion_id=v_day2 AND turno_tramo_id=v_tramo
      AND sesion_id IS NULL AND ciclo_id IS NULL AND creado_por=v_worker
  ) THEN
    RAISE EXCEPTION 'FAIL: expense is not pending/linked to the current JORNADA tranche without legacy FKs.';
  END IF;

  -- Reinvestment reuses the existing transaction contract once; retry cannot duplicate stock/FIFO/cash.
  SELECT cantidad INTO v_stock_before FROM public.stock
  WHERE producto_id=v_pan AND almacen_id=v_almacen;
  v_reinv:=public.bc7_registrar_reinversion_jornada(
    v_day2,
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_pan,'presentacion_id',NULL,'cantidad_presentacion',NULL,
      'cantidad_base',2,'costo_total',60
    )),
    '96000000-0000-0000-0000-000000000008',
    'Proveedor Step 7 fixture'
  );
  v_reinv_retry:=public.bc7_registrar_reinversion_jornada(
    v_day2,
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_pan,'presentacion_id',NULL,'cantidad_presentacion',NULL,
      'cantidad_base',2,'costo_total',60
    )),
    '96000000-0000-0000-0000-000000000008',
    'Proveedor Step 7 fixture'
  );
  IF v_reinv IS DISTINCT FROM v_reinv_retry THEN RAISE EXCEPTION 'FAIL: reinvestment retry returned a different id.'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.reinversiones WHERE id=v_reinv AND turno_id=v_turno
      AND turno_sesion_id=v_day2 AND turno_tramo_id=v_tramo
      AND sesion_id IS NULL AND ciclo_id IS NULL AND usuario_id=v_worker
  ) THEN
    RAISE EXCEPTION 'FAIL: reinvestment lost Jornada/tranche provenance or wrote legacy session ids.';
  END IF;
  IF (SELECT count(*) FROM public.reinversiones WHERE idempotency_key='96000000-0000-0000-0000-000000000008')<>1 THEN
    RAISE EXCEPTION 'FAIL: reinvestment retry duplicated the record.';
  END IF;
  SELECT cantidad INTO v_stock_after FROM public.stock
  WHERE producto_id=v_pan AND almacen_id=v_almacen;
  IF v_stock_after IS DISTINCT FROM v_stock_before+2 THEN
    RAISE EXCEPTION 'FAIL: reinvestment stock effect did not occur exactly once.';
  END IF;
  IF (SELECT count(*) FROM public.lotes_compra WHERE origen='reinversion' AND usuario_id=v_worker AND almacen_id=v_almacen)<>1 THEN
    RAISE EXCEPTION 'FAIL: reinvestment FIFO lot was not created exactly once.';
  END IF;
  IF (SELECT count(*) FROM public.movimientos_caja_fixture WHERE referencia_id=v_reinv AND tipo='REINVERSION' AND direccion='SALIDA')<>1 THEN
    RAISE EXCEPTION 'FAIL: reinvestment cash ledger entry was not created exactly once.';
  END IF;

  -- Section read permissions are independent even when the worker may create both operation types.
  v_data:=public.bc7_finanzas_jornada(v_day2);
  IF jsonb_array_length(v_data->'gastos')<>1 OR jsonb_array_length(v_data->'reinversiones')<>1 THEN
    RAISE EXCEPTION 'FAIL: finance read did not return both authorized operation types.';
  END IF;
  PERFORM set_config('test.perms','turnos:ver,gastos:ver',false);
  v_data:=public.bc7_finanzas_jornada(v_day2);
  IF jsonb_array_length(v_data->'gastos')<>1 OR jsonb_array_length(v_data->'reinversiones')<>0 THEN
    RAISE EXCEPTION 'FAIL: finance read leaked reinvestments without reinversiones.ver.';
  END IF;
  PERFORM set_config('test.perms','turnos:ver',false);
  v_data:=public.bc7_finanzas_jornada(v_day2);
  IF jsonb_array_length(v_data->'gastos')<>0 OR jsonb_array_length(v_data->'reinversiones')<>0 THEN
    RAISE EXCEPTION 'FAIL: finance read leaked rows without section-specific ver permissions.';
  END IF;

  -- The owner is neither the current Day 2 assignee nor admin; direct RPC calls must fail.
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.perms','turnos:ver,gastos:crear,gastos:ver',false);
  v_error:=false;
  BEGIN
    PERFORM public.bc7_finanzas_jornada(v_day2);
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: unassigned owner read another worker''s jornada finance.'; END IF;
  v_error:=false;
  BEGIN
    PERFORM public.bc7_registrar_gasto_jornada(
      v_day2,'Intento no asignado',1,NULL,'97000000-0000-0000-0000-000000000008'
    );
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: unassigned owner wrote a gasto into another worker''s jornada.'; END IF;

  IF has_function_privilege('anon','public.bc7_registrar_gasto_jornada(uuid,text,numeric,text,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_registrar_reinversion_jornada(uuid,jsonb,uuid,text)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_finanzas_jornada(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon has access to a protected Jornada finance RPC.';
  END IF;
  IF NOT has_function_privilege('authenticated','public.bc7_registrar_gasto_jornada(uuid,text,numeric,text,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_registrar_reinversion_jornada(uuid,jsonb,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_finanzas_jornada(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated is missing an intended Jornada finance RPC grant.';
  END IF;

  RAISE NOTICE 'PASS Step 7 finance/carry-forward: provenance, recount, permissions, idempotency, FIFO, stock and cash ledger.';
END
$test$;

ROLLBACK;
