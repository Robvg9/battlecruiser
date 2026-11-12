\set ON_ERROR_STOP on
-- Disposable PostgreSQL 17 acceptance contract for the Step 4 shared inventory handover.
-- Runs after the Step 7 finance contract has created Day 2 and its open tranche.
-- Any existing Day 2 -> Day 3 handover is physically received and accepted before Day 3 can open.
DO $shared$
DECLARE
  v_turno uuid:='90000000-0000-0000-0000-000000000007';
  v_owner uuid:='20000000-0000-0000-0000-000000000001';
  v_worker uuid:='20000000-0000-0000-0000-000000000002';
  v_almacen uuid:='10000000-0000-0000-0000-000000000001';
  v_pan uuid:='31000000-0000-0000-0000-000000000001';
  v_jugo uuid:='31000000-0000-0000-0000-000000000002';
  v_day2 uuid:='91000000-0000-0000-0000-000000000008';
  v_day3 uuid:='91000000-0000-0000-0000-000000000009';
  v_day4 uuid:='91000000-0000-0000-0000-000000000010';
  v_day5 uuid:='91000000-0000-0000-0000-000000000011';
  v_day6 uuid:='91000000-0000-0000-0000-000000000012';
  v_prog3 uuid:='92000000-0000-0000-0000-000000000009';
  v_prog4 uuid:='92000000-0000-0000-0000-000000000010';
  v_prog5 uuid:='92000000-0000-0000-0000-000000000011';
  v_prog6 uuid:='92000000-0000-0000-0000-000000000012';
  v_hoy date:=(now() AT TIME ZONE 'America/Havana')::date;
  v_entrega uuid;
  v_entrega_anterior uuid;
  v_recepcion uuid;
  v_initial uuid;
  v_initial_anterior uuid;
  v_lineas_recibidas jsonb;
  v_resultado_recepcion jsonb;
  v_estado_entrega text;
  v_result jsonb;
  v_source jsonb;
  v_destination jsonb;
  v_before_pan numeric;
  v_before_jugo numeric;
  v_after_pan numeric;
  v_after_jugo numeric;
  v_error boolean;
  v_attempt integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','turnos:ver,turnos:editar_any,ventas:ver',false);
  UPDATE public.turnos SET dias_turno=6 WHERE id=v_turno;

  -- Pre-create the real next-day sessions and assignments. The source FINAL must reuse these rows.
  INSERT INTO public.turno_jornada_programacion(
    id,turno_id,almacen_id,numero_dia,fecha,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,creado_por,actualizado_por
  ) VALUES
    (v_prog3,v_turno,v_almacen,3,v_hoy+1,true,v_worker,'07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner),
    (v_prog4,v_turno,v_almacen,4,v_hoy+2,true,v_worker,'07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner),
    (v_prog5,v_turno,v_almacen,5,v_hoy+3,true,v_worker,'07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner),
    (v_prog6,v_turno,v_almacen,6,v_hoy+4,true,v_owner,'07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner);
  INSERT INTO public.turno_sesiones(
    id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id
  ) VALUES
    (v_day3,v_turno,v_almacen,3,'JORNADA',v_hoy+1,'PROGRAMADA',v_prog3),
    (v_day4,v_turno,v_almacen,4,'JORNADA',v_hoy+2,'PROGRAMADA',v_prog4),
    (v_day5,v_turno,v_almacen,5,'JORNADA',v_hoy+3,'PROGRAMADA',v_prog5),
    (v_day6,v_turno,v_almacen,6,'JORNADA',v_hoy+4,'EN_CURSO',v_prog6);
  INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
  VALUES
    (v_day3,v_turno,v_worker,v_owner),
    (v_day4,v_turno,v_worker,v_owner),
    (v_day5,v_turno,v_worker,v_owner),
    (v_day6,v_turno,v_owner,v_owner);

  SELECT cantidad INTO v_before_pan FROM public.stock WHERE almacen_id=v_almacen AND producto_id=v_pan;
  SELECT cantidad INTO v_before_jugo FROM public.stock WHERE almacen_id=v_almacen AND producto_id=v_jugo;

  -- Resolve any previous-day shared delivery into Day 3 before allowing its INITIAL cut.
  -- The fixture may already contain a pending Day 2 -> Day 3 handover from the prior finance contract.
  SELECT e.id,e.estado INTO v_entrega_anterior,v_estado_entrega
  FROM public.turno_jornada_inventario_entregas e
  WHERE e.destino_sesion_id=v_day3
     OR (e.origen_sesion_id=v_day2 AND e.destino_sesion_id IS NULL
         AND e.fecha_destino=v_hoy+1 AND e.estado='PENDIENTE_PROGRAMACION')
  ORDER BY e.creado_en DESC
  LIMIT 1
  FOR UPDATE;
  IF v_entrega_anterior IS NOT NULL THEN
    IF v_estado_entrega='PENDIENTE_PROGRAMACION' THEN
      PERFORM public.bc7_vincular_entrega_jornada(v_entrega_anterior,v_day3);
      v_estado_entrega:='PENDIENTE_RECEPCION';
    END IF;
    IF v_estado_entrega NOT IN ('PENDIENTE_RECEPCION','REQUIERE_RECUENTO') THEN
      RAISE EXCEPTION 'FAIL: previous-day handover has unexpected status %',v_estado_entrega;
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'producto_id',l.producto_id,'cantidad',l.cantidad_declarada
    ) ORDER BY l.producto_id),'[]'::jsonb)
    INTO v_lineas_recibidas
    FROM public.turno_jornada_inventario_entrega_lineas l
    WHERE l.entrega_id=v_entrega_anterior;
    IF jsonb_array_length(v_lineas_recibidas)=0 THEN
      RAISE EXCEPTION 'FAIL: previous-day shared handover has no inventory lines';
    END IF;
    PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
    PERFORM set_config('test.bc_admin','false',false);
    PERFORM set_config('test.perms','turnos:ver',false);
    v_resultado_recepcion:=public.bc7_recibir_entrega_jornada(
      v_day3,v_lineas_recibidas,'Physical receipt of the prior-day shared inventory',
      '98000000-0000-0000-0000-000000000009'
    );
    IF v_resultado_recepcion->>'estado'<>'ACEPTADA' THEN
      RAISE EXCEPTION 'FAIL: matching prior-day receipt was not accepted automatically; result=%',v_resultado_recepcion;
    END IF;
    v_initial_anterior:=nullif(v_resultado_recepcion->>'inventario_inicial_id','')::uuid;
    IF v_initial_anterior IS NULL THEN
      SELECT id INTO v_initial_anterior FROM public.turno_jornada_inventario_cortes
      WHERE turno_sesion_id=v_day3 AND tipo='INICIAL' AND estado='CONFIRMADO';
    END IF;
    IF v_initial_anterior IS NULL THEN
      RAISE EXCEPTION 'FAIL: accepted prior-day receipt did not materialize Day 3 INITIAL';
    END IF;
  ELSE
    v_result:=public.bc7_guardar_inventario_jornada(v_day3,'INICIAL',
      jsonb_build_array(
        jsonb_build_object('producto_id',v_pan,'cantidad',10),
        jsonb_build_object('producto_id',v_jugo,'cantidad',5)
      ),'Initial physical count for shared handover source');
  END IF;
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);
  UPDATE public.turno_sesiones SET estado='EN_CURSO' WHERE id=v_day3;

  -- Day 3 declares 20/6. Deferred trigger reuses the already scheduled Day 4.
  v_result:=public.bc7_guardar_inventario_jornada(v_day3,'FINAL',
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',20),
      jsonb_build_object('producto_id',v_jugo,'cantidad',6)
    ),'Shared handover Day 3 fixture');
  IF v_result->>'estado'<>'CONFIRMADO' THEN RAISE EXCEPTION 'FAIL: Day 3 FINAL not confirmed'; END IF;
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada IMMEDIATE;
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada DEFERRED;

  SELECT id INTO v_entrega FROM public.turno_jornada_inventario_entregas
  WHERE origen_sesion_id=v_day3;
  IF v_entrega IS NULL THEN RAISE EXCEPTION 'FAIL: final cut did not prepare shared handover'; END IF;
  IF (SELECT destino_sesion_id FROM public.turno_jornada_inventario_entregas WHERE id=v_entrega) IS DISTINCT FROM v_day4 THEN
    RAISE EXCEPTION 'FAIL: handover did not reuse the pre-created Day 4 session'; END IF;
  IF (SELECT count(*) FROM public.turno_sesiones WHERE turno_id=v_turno AND numero_dia=4 AND bloque='JORNADA')<>1 THEN
    RAISE EXCEPTION 'FAIL: preparing the handover created a duplicate Day 4 session'; END IF;
  IF (SELECT cantidad_declarada FROM public.turno_jornada_inventario_entrega_lineas
      WHERE entrega_id=v_entrega AND producto_id=v_pan) IS DISTINCT FROM 20 THEN
    RAISE EXCEPTION 'FAIL: source FINAL declaration was not copied into the handover ledger'; END IF;

  -- The disposable fixture has an intentionally unreconciled cash difference.
  -- Exercise the inventory close barrier without manufacturing a cash approval.
  UPDATE public.turno_sesiones SET estado='COMPLETADA' WHERE id=v_day3;

  -- Receiver reports 18 while source declared 20. This is pending, idempotent and blocks independent INITIAL.
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);
  v_result:=public.bc7_recibir_entrega_jornada(v_day4,
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',18),
      jsonb_build_object('producto_id',v_jugo,'cantidad',6)
    ),'Receiver reports two units short','98000000-0000-0000-0000-000000000001');
  v_recepcion:=(v_result->>'id')::uuid;
  IF v_result->>'estado'<>'PENDIENTE_REVISION'
     OR coalesce((v_result->>'requiere_revision')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: 20->18 receipt was not held for owner review'; END IF;

  v_result:=public.bc7_recibir_entrega_jornada(v_day4,
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',18),
      jsonb_build_object('producto_id',v_jugo,'cantidad',6)
    ),'Receiver reports two units short','98000000-0000-0000-0000-000000000001');
  IF (v_result->>'id')::uuid IS DISTINCT FROM v_recepcion
     OR coalesce((v_result->>'idempotente')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: duplicate receipt key did not return the original attempt'; END IF;

  v_error:=false;
  BEGIN
    PERFORM public.bc7_guardar_inventario_jornada(v_day4,'INICIAL',
      jsonb_build_array(
        jsonb_build_object('producto_id',v_pan,'cantidad',18),
        jsonb_build_object('producto_id',v_jugo,'cantidad',6)
      ),'Bypass attempt');
  EXCEPTION WHEN check_violation THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: normal INITIAL bypassed a pending shared delivery'; END IF;
  IF EXISTS (SELECT 1 FROM public.turno_jornada_inventario_cortes
    WHERE turno_sesion_id=v_day4 AND tipo='INICIAL') THEN
    RAISE EXCEPTION 'FAIL: pending discrepancy generated an INITIAL cut prematurely'; END IF;

  v_error:=false;
  BEGIN
    UPDATE public.turno_sesiones SET estado='EN_CURSO' WHERE id=v_day4;
  EXCEPTION WHEN check_violation THEN v_error:=true;
  END;
  IF NOT v_error OR (SELECT estado FROM public.turno_sesiones WHERE id=v_day4)<>'PROGRAMADA' THEN
    RAISE EXCEPTION 'FAIL: destination jornada opened while its shared receipt was unresolved'; END IF;

  v_error:=false;
  BEGIN
    PERFORM public.bc7_resolver_entrega_jornada(v_entrega,'APROBAR','Unauthorized worker approval');
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: assigned receiver could approve their own discrepancy'; END IF;

  -- Owner approves the received quantities as the sole effective amount for both days.
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','turnos:ver,turnos:editar_any',false);
  v_result:=public.bc7_resolver_entrega_jornada(v_entrega,'APROBAR',
    'Physical count checked; approve the received amount of 18');
  v_initial:=(v_result->>'inventario_inicial_id')::uuid;
  IF v_result->>'estado'<>'ACEPTADA' OR v_initial IS NULL THEN
    RAISE EXCEPTION 'FAIL: owner approval did not accept and materialize Day 4 INITIAL'; END IF;
  IF (SELECT estado FROM public.turno_jornada_inventario_recepciones WHERE id=v_recepcion)<>'ACEPTADA'
     OR (SELECT decision_por FROM public.turno_jornada_inventario_recepciones WHERE id=v_recepcion) IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'FAIL: receipt audit did not preserve owner approval identity'; END IF;
  IF (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas
      WHERE corte_id=(SELECT origen_corte_id FROM public.turno_jornada_inventario_entregas WHERE id=v_entrega)
        AND producto_id=v_pan)<>20 THEN
    RAISE EXCEPTION 'FAIL: source FINAL was rewritten instead of preserved'; END IF;
  IF (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas
      WHERE corte_id=v_initial AND producto_id=v_pan)<>18 THEN
    RAISE EXCEPTION 'FAIL: destination INITIAL does not preserve the received physical count'; END IF;
  IF (SELECT cantidad_efectiva FROM public.turno_jornada_inventario_entrega_lineas
      WHERE entrega_id=v_entrega AND producto_id=v_pan)<>18 THEN
    RAISE EXCEPTION 'FAIL: effective shared quantity did not resolve to the owner-approved 18'; END IF;

  v_source:=public.bc7_estado_entrega_inventario_jornada(v_day3);
  v_destination:=public.bc7_estado_entrega_inventario_jornada(v_day4);
  IF v_source->'salida'->>'estado'<>'ACEPTADA'
     OR v_destination->'entrada'->>'estado'<>'ACEPTADA'
     OR (SELECT (x->>'cantidad_efectiva')::numeric
         FROM jsonb_array_elements(v_source->'salida'->'lineas') x
         WHERE x->>'producto_id'=v_pan::text)<>18
     OR (SELECT (x->>'cantidad_efectiva')::numeric
         FROM jsonb_array_elements(v_destination->'entrada'->'lineas') x
         WHERE x->>'producto_id'=v_pan::text)<>18 THEN
    RAISE EXCEPTION 'FAIL: FINAL origin and INITIAL destination do not expose the same effective quantity'; END IF;

  SELECT cantidad INTO v_after_pan FROM public.stock WHERE almacen_id=v_almacen AND producto_id=v_pan;
  SELECT cantidad INTO v_after_jugo FROM public.stock WHERE almacen_id=v_almacen AND producto_id=v_jugo;
  IF v_after_pan<>v_before_pan OR v_after_jugo<>v_before_jugo THEN
    RAISE EXCEPTION 'FAIL: inventory handover modified global stock/FIFO balances'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.turno_jornada_eventos
    WHERE tipo IN ('INVENTARIO_RECEPCION_APROBADA','INVENTARIO_INICIAL_RECIBIDO')
      AND (estado_despues->>'entrega_id'=v_entrega::text OR estado_antes->>'entrega_id'=v_entrega::text)) THEN
    RAISE EXCEPTION 'FAIL: owner decision and receipt were not preserved in the audit log'; END IF;

  -- Day 4 now becomes the next source. Day 5 receives an incorrect count, the owner rejects it,
  -- and a second exact physical recount is accepted without overwriting the first attempt.
  UPDATE public.turno_sesiones SET estado='EN_CURSO' WHERE id=v_day4;
  v_result:=public.bc7_guardar_inventario_jornada(v_day4,'FINAL',
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',40),
      jsonb_build_object('producto_id',v_jugo,'cantidad',8)
    ),'Day 4 final for reject/recount fixture');
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada IMMEDIATE;
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada DEFERRED;
  UPDATE public.turno_sesiones SET estado='COMPLETADA' WHERE id=v_day4;
  SELECT id INTO v_entrega FROM public.turno_jornada_inventario_entregas WHERE origen_sesion_id=v_day4;

  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);
  v_result:=public.bc7_recibir_entrega_jornada(v_day5,
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',39),
      jsonb_build_object('producto_id',v_jugo,'cantidad',8)
    ),'Wrong first receipt; recount required','98000000-0000-0000-0000-000000000003');
  v_recepcion:=(v_result->>'id')::uuid;
  IF v_result->>'estado'<>'PENDIENTE_REVISION' THEN
    RAISE EXCEPTION 'FAIL: second handover discrepancy was not held for owner review'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','turnos:ver,turnos:editar_any',false);
  v_result:=public.bc7_resolver_entrega_jornada(v_entrega,'RECHAZAR',
    'Reject this count; the employee must recount physically');
  IF v_result->>'estado'<>'REQUIERE_RECUENTO'
     OR (SELECT estado FROM public.turno_jornada_inventario_recepciones WHERE id=v_recepcion)<>'RECHAZADA'
     OR EXISTS (SELECT 1 FROM public.turno_jornada_inventario_cortes WHERE turno_sesion_id=v_day5 AND tipo='INICIAL') THEN
    RAISE EXCEPTION 'FAIL: rejected receipt did not remain blocked for recount'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);
  v_result:=public.bc7_recibir_entrega_jornada(v_day5,
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',40),
      jsonb_build_object('producto_id',v_jugo,'cantidad',8)
    ),'Second physical count matches declared inventory','98000000-0000-0000-0000-000000000004');
  IF v_result->>'estado'<>'ACEPTADA'
     OR (v_result->>'intento')::integer<>2 THEN
    RAISE EXCEPTION 'FAIL: new equal physical recount did not resolve rejected attempt'; END IF;
  IF (SELECT count(*) FROM public.turno_jornada_inventario_recepciones WHERE entrega_id=v_entrega)<>2
     OR (SELECT estado FROM public.turno_jornada_inventario_recepciones WHERE id=v_recepcion)<>'RECHAZADA' THEN
    RAISE EXCEPTION 'FAIL: rejection/recount history was overwritten instead of appended'; END IF;

  -- Legacy open session without INITIAL can only be regularized by the owner with reason and full count.
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','turnos:ver,turnos:editar_any',false);
  v_result:=public.bc7_regularizar_inicial_jornada_legacy(v_day6,
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',11),
      jsonb_build_object('producto_id',v_jugo,'cantidad',9)
    ),'Recover a legacy open jornada that had no initial inventory');
  IF v_result->>'estado'<>'CONFIRMADO'
     OR coalesce((v_result->>'regularizacion_legacy')::boolean,false) IS NOT TRUE
     OR (SELECT count(*) FROM public.turno_jornada_inventario_lineas WHERE corte_id=(v_result->>'id')::uuid)<>2 THEN
    RAISE EXCEPTION 'FAIL: audited legacy inventory recovery did not persist a full physical initial count'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.turno_jornada_eventos
    WHERE tipo='INVENTARIO_INICIAL_LEGACY_REGULARIZADO'
      AND estado_despues->>'corte_inicial_id'=v_result->>'id') THEN
    RAISE EXCEPTION 'FAIL: legacy recovery reason/audit event was not persisted'; END IF;

  -- The final day has no next session. It prepares an unlinked handover for owner scheduling;
  -- it must not silently create a new Turno or Jornada session.
  v_result:=public.bc7_guardar_inventario_jornada(v_day6,'FINAL',
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',11),
      jsonb_build_object('producto_id',v_jugo,'cantidad',9)
    ),'Day 6 final without a pre-scheduled Day 7');
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada IMMEDIATE;
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada DEFERRED;
  SELECT id INTO v_entrega FROM public.turno_jornada_inventario_entregas
  WHERE origen_sesion_id=v_day6;
  IF v_entrega IS NULL
     OR (SELECT destino_sesion_id FROM public.turno_jornada_inventario_entregas WHERE id=v_entrega) IS NOT NULL
     OR (SELECT estado FROM public.turno_jornada_inventario_entregas WHERE id=v_entrega)<>'PENDIENTE_PROGRAMACION' THEN
    RAISE EXCEPTION 'FAIL: missing next day was not left as an owner-schedulable handover'; END IF;
  IF (SELECT count(*) FROM public.turno_sesiones WHERE turno_id=v_turno)<>6 THEN
    RAISE EXCEPTION 'FAIL: handover created a duplicate or unrequested next-day session'; END IF;

  -- Protected RPC and table boundaries remain authenticated-only.
  IF has_function_privilege('anon','public.bc7_recibir_entrega_jornada(uuid,jsonb,text,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_resolver_entrega_jornada(uuid,text,text)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_vincular_entrega_jornada(uuid,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_regularizar_inicial_jornada_legacy(uuid,jsonb,text)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_estado_entrega_inventario_jornada(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can execute a protected shared inventory RPC'; END IF;
  IF NOT has_function_privilege('authenticated','public.bc7_recibir_entrega_jornada(uuid,jsonb,text,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_resolver_entrega_jornada(uuid,text,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_vincular_entrega_jornada(uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_regularizar_inicial_jornada_legacy(uuid,jsonb,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_estado_entrega_inventario_jornada(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated is missing a shared inventory RPC grant'; END IF;
  IF has_table_privilege('authenticated','public.turno_jornada_inventario_entregas','SELECT')
     OR has_table_privilege('authenticated','public.turno_jornada_inventario_entrega_lineas','SELECT')
     OR has_table_privilege('authenticated','public.turno_jornada_inventario_recepciones','SELECT')
     OR has_table_privilege('authenticated','public.turno_jornada_inventario_recepcion_lineas','SELECT') THEN
    RAISE EXCEPTION 'FAIL: authenticated can bypass the shared inventory RPC boundary'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);
  v_error:=false;
  BEGIN
    PERFORM public.bc7_estado_entrega_inventario_jornada(v_day2);
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: unassigned worker read another day''s handover'; END IF;

  RAISE NOTICE 'PASS Step 4 shared inventory: single effective quantity, owner approval/rejection, idempotent receipt, automatic equality, retry history, next-session reuse, stock isolation, legacy recovery and ACLs';
END
$shared$;
