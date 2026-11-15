\set ON_ERROR_STOP on
-- Issue #333 disposable acceptance contract (isolated almacen/turno).
-- Covers: 66/66, 1 and 15 differences (+/-), zero & <=3 decimals, full 66-line payload,
-- idempotency/retry, rejection/recount, mandatory reasons, detail permissions (+/-),
-- FINAL/INITIAL integrity and no public.stock changes.
-- IMPORTANT: This contract adds DELETE statements inside the DO block to clean up all test data
-- (public.stock, public.productos, public.turnos, etc.) while the variables are still in scope,
-- ensuring no persistent side effects on downstream contracts. All inserted data is removed
-- so subsequent contracts see a clean state.
-- Run: psql -v ON_ERROR_STOP=1 -f test/jornada-recepcion-issue333-contract.sql

DO $issue333$
DECLARE
  v_owner uuid:='20000000-0000-0000-0000-000000000001';
  v_worker uuid:='20000000-0000-0000-0000-000000000002';
  v_stranger uuid:='20000000-0000-0000-0000-000000000099';
  v_almacen uuid:='13330000-0000-0000-0000-000000000001';
  v_turno uuid:='93330000-0000-0000-0000-000000000001';
  v_s1 uuid:='93330000-0000-0000-0000-000000000011';
  v_s2 uuid:='93330000-0000-0000-0000-000000000012';
  v_s3 uuid:='93330000-0000-0000-0000-000000000013';
  v_s4 uuid:='93330000-0000-0000-0000-000000000014';
  v_p1 uuid:='93330000-0000-0000-0000-000000000021';
  v_p2 uuid:='93330000-0000-0000-0000-000000000022';
  v_p3 uuid:='93330000-0000-0000-0000-000000000023';
  v_p4 uuid:='93330000-0000-0000-0000-000000000024';
  v_prog1 uuid:='93330000-0000-0000-0000-000000000031';
  v_prog2 uuid:='93330000-0000-0000-0000-000000000032';
  v_prog3 uuid:='93330000-0000-0000-0000-000000000033';
  v_prog4 uuid:='93330000-0000-0000-0000-000000000034';
  v_entrega uuid;
  v_result jsonb;
  v_recepcion uuid;
  v_initial uuid;
  v_source_cut uuid;
  v_before_stock_total numeric;
  v_after_stock_total numeric;
  v_error boolean;
  v_lines jsonb;
  v_detail jsonb;
  i int;
  v_pid uuid;
  v_decl numeric;
BEGIN
  -- Isolated disposable almacen, turno, sessions and 66 products/stock rows.
  INSERT INTO public.almacenes(id,nombre,tipo,activo)
  VALUES (v_almacen,'Almacen Issue333','RETAIL',true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.turnos(
    id,usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,estado_maestro,dias_turno
  ) VALUES (
    v_turno,v_owner,'Owner Issue333',v_almacen,(now() AT TIME ZONE 'America/Havana')::date+20,
    'ABIERTO',v_owner,v_owner,'EN_CURSO',4
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.turno_jornada_programacion(id,turno_id,almacen_id,numero_dia,fecha,trabaja,responsable_id,hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,creado_por,actualizado_por)
  VALUES
    (v_prog1,v_turno,v_almacen,1,(now() AT TIME ZONE 'America/Havana')::date+20,true,v_worker,'07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner),
    (v_prog2,v_turno,v_almacen,2,(now() AT TIME ZONE 'America/Havana')::date+21,true,v_worker,'07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner),
    (v_prog3,v_turno,v_almacen,3,(now() AT TIME ZONE 'America/Havana')::date+22,true,v_worker,'07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner),
    (v_prog4,v_turno,v_almacen,4,(now() AT TIME ZONE 'America/Havana')::date+23,true,v_worker,'07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.turno_sesiones(id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id)
  VALUES
    (v_s1,v_turno,v_almacen,1,'JORNADA',(now() AT TIME ZONE 'America/Havana')::date+20,'PROGRAMADA',v_prog1),
    (v_s2,v_turno,v_almacen,2,'JORNADA',(now() AT TIME ZONE 'America/Havana')::date+21,'PROGRAMADA',v_prog2),
    (v_s3,v_turno,v_almacen,3,'JORNADA',(now() AT TIME ZONE 'America/Havana')::date+22,'PROGRAMADA',v_prog3),
    (v_s4,v_turno,v_almacen,4,'JORNADA',(now() AT TIME ZONE 'America/Havana')::date+23,'PROGRAMADA',v_prog4)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
  VALUES
    (v_s1,v_turno,v_worker,v_owner),
    (v_s2,v_turno,v_worker,v_owner),
    (v_s3,v_turno,v_worker,v_owner),
    (v_s4,v_turno,v_worker,v_owner)
  ON CONFLICT DO NOTHING;

  -- 66 products: include specific ones for positive/negative/zero/decimal cases.
  INSERT INTO public.productos(id,nombre,unidad,activo) VALUES
    (v_p1,'Prod333-A','ud',true),
    (v_p2,'Prod333-B','ud',true),
    (v_p3,'Prod333-Cero','ud',true),
    (v_p4,'Prod333-Dec','ud',true)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo) VALUES
    (v_p1,v_almacen,50,0),(v_p2,v_almacen,50,0),(v_p3,v_almacen,50,0),(v_p4,v_almacen,50,0)
  ON CONFLICT (producto_id,almacen_id) DO NOTHING;

  FOR i IN 1..62 LOOP
    v_pid := ('53330000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid;
    INSERT INTO public.productos(id,nombre,unidad,activo)
    VALUES (v_pid,'Prod333-'||i,'ud',true)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
    VALUES (v_pid,v_almacen,(10 + (i%5))::numeric,0)
    ON CONFLICT (producto_id,almacen_id) DO NOTHING;
  END LOOP;

  SELECT coalesce(sum(cantidad),0) INTO v_before_stock_total
  FROM public.stock WHERE almacen_id=v_almacen;

  -- Build canonical 66-line payload with zero and up to 3 decimals.
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'producto_id',x.id,
      'cantidad',x.qty
    ) ORDER BY x.id
  ),'[]'::jsonb) INTO v_lines
  FROM (
    SELECT v_p1 AS id, 10::numeric AS qty
    UNION ALL SELECT v_p2, 5.125::numeric
    UNION ALL SELECT v_p3, 0::numeric
    UNION ALL SELECT v_p4, 2.5::numeric
    UNION ALL SELECT ('53330000-0000-0000-0000-'||lpad(gs::text,12,'0'))::uuid,
      round((1 + (gs % 9) + 0.001 * (gs % 4))::numeric, 3)
    FROM generate_series(1,62) gs
  ) x;
  IF jsonb_array_length(v_lines) <> 66 THEN
    RAISE EXCEPTION 'FAIL: expected 66-line payload, got %', jsonb_array_length(v_lines);
  END IF;

  ---------------------------------------------------------------------------
  -- 66/66 coincident, full payload, idempotency, FINAL/INITIAL integrity, no stock.
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);

  v_result := public.bc7_guardar_inventario_jornada(v_s1,'INICIAL',v_lines,'Issue333 initial S1');
  IF v_result->>'estado' <> 'CONFIRMADO' THEN RAISE EXCEPTION 'FAIL: S1 INITIAL not confirmed'; END IF;
  UPDATE public.turno_sesiones SET estado='EN_CURSO' WHERE id=v_s1;

  v_result := public.bc7_guardar_inventario_jornada(v_s1,'FINAL',v_lines,'Issue333 final S1 66 lines');
  IF v_result->>'estado' <> 'CONFIRMADO' THEN RAISE EXCEPTION 'FAIL: S1 FINAL not confirmed'; END IF;
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada IMMEDIATE;
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada DEFERRED;
  -- Disposable close to allow handover flow in fixture context.
  UPDATE public.turno_sesiones SET estado='COMPLETADA' WHERE id=v_s1;

  SELECT id, origen_corte_id INTO v_entrega, v_source_cut
  FROM public.turno_jornada_inventario_entregas WHERE origen_sesion_id=v_s1;
  IF v_entrega IS NULL THEN RAISE EXCEPTION 'FAIL: no handover from S1'; END IF;
  IF (SELECT count(*) FROM public.turno_jornada_inventario_entrega_lineas WHERE entrega_id=v_entrega) <> 66 THEN
    RAISE EXCEPTION 'FAIL: handover does not carry full 66-line payload';
  END IF;
  IF (SELECT cantidad_declarada FROM public.turno_jornada_inventario_entrega_lineas WHERE entrega_id=v_entrega AND producto_id=v_p3) <> 0 THEN
    RAISE EXCEPTION 'FAIL: zero quantity not preserved in handover';
  END IF;
  IF (SELECT cantidad_declarada FROM public.turno_jornada_inventario_entrega_lineas WHERE entrega_id=v_entrega AND producto_id=v_p2) <> 5.125 THEN
    RAISE EXCEPTION 'FAIL: decimal quantity not preserved in handover';
  END IF;

  v_result := public.bc7_recibir_entrega_jornada(v_s2,v_lines,'66/66 coincident','33330000-0000-0000-0000-000000000066');
  v_recepcion := (v_result->>'id')::uuid;
  IF v_result->>'estado' <> 'ACEPTADA' OR coalesce((v_result->>'requiere_revision')::boolean,true) IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL: 66/66 receipt not auto-accepted: %', v_result;
  END IF;
  v_initial := (v_result->>'inventario_inicial_id')::uuid;
  IF v_initial IS NULL THEN RAISE EXCEPTION 'FAIL: 66/66 did not materialize INITIAL'; END IF;

  v_result := public.bc7_recibir_entrega_jornada(v_s2,v_lines,'66/66 coincident','33330000-0000-0000-0000-000000000066');
  IF (v_result->>'id')::uuid IS DISTINCT FROM v_recepcion OR coalesce((v_result->>'idempotente')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: idempotent retry mismatch';
  END IF;

  IF (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas WHERE corte_id=v_source_cut AND producto_id=v_p2) <> 5.125 THEN
    RAISE EXCEPTION 'FAIL: source FINAL mutated';
  END IF;
  IF (SELECT count(*) FROM public.turno_jornada_inventario_lineas WHERE corte_id=v_initial) <> 66 THEN
    RAISE EXCEPTION 'FAIL: INITIAL missing 66 lines';
  END IF;
  IF (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas WHERE corte_id=v_initial AND producto_id=v_p3) <> 0 THEN
    RAISE EXCEPTION 'FAIL: zero not preserved in INITIAL';
  END IF;

  SELECT coalesce(sum(cantidad),0) INTO v_after_stock_total FROM public.stock WHERE almacen_id=v_almacen;
  IF v_after_stock_total IS DISTINCT FROM v_before_stock_total THEN
    RAISE EXCEPTION 'FAIL: public.stock changed after 66/66 handover/reception';
  END IF;

  ---------------------------------------------------------------------------
  -- 1 difference (+/- capable payload kept full), mandatory reasons, rejection & recount.
  ---------------------------------------------------------------------------
  UPDATE public.turno_sesiones SET estado='EN_CURSO' WHERE id=v_s2;
  PERFORM public.bc7_guardar_inventario_jornada(v_s2,'FINAL',v_lines,'S2 final 66');
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada IMMEDIATE;
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada DEFERRED;
  UPDATE public.turno_sesiones SET estado='COMPLETADA' WHERE id=v_s2;
  SELECT id INTO v_entrega FROM public.turno_jornada_inventario_entregas WHERE origen_sesion_id=v_s2;

  -- 1 negative difference on p1 (-1.25), rest equal (full 66-line payload).
  SELECT jsonb_agg(
    jsonb_build_object(
      'producto_id',(l->>'producto_id')::uuid,
      'cantidad',CASE WHEN (l->>'producto_id')::uuid=v_p1 THEN ((l->>'cantidad')::numeric - 1.25) ELSE (l->>'cantidad')::numeric END
    ) ORDER BY (l->>'producto_id')
  ) INTO v_lines
  FROM jsonb_array_elements((
    SELECT jsonb_agg(jsonb_build_object('producto_id',el.producto_id,'cantidad',el.cantidad_declarada) ORDER BY el.producto_id)
    FROM public.turno_jornada_inventario_entrega_lineas el WHERE el.entrega_id=v_entrega
  )) l;
  IF jsonb_array_length(v_lines) <> 66 THEN RAISE EXCEPTION 'FAIL: 1-diff payload not 66'; END IF;

  v_result := public.bc7_recibir_entrega_jornada(v_s3,v_lines,'1 diff','33330000-0000-0000-0000-000000000101');
  IF v_result->>'estado' <> 'PENDIENTE_REVISION' THEN RAISE EXCEPTION 'FAIL: 1-diff not pending review'; END IF;
  IF (SELECT count(*) FROM public.turno_jornada_inventario_recepcion_lineas rl
      JOIN public.turno_jornada_inventario_recepciones r ON r.id=rl.recepcion_id
      WHERE r.entrega_id=v_entrega AND rl.diferencia<>0) <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected 1 diff line';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','turnos:ver,turnos:editar_any,auditoria:editar_any',false);

  v_error:=false;
  BEGIN PERFORM public.bc7_resolver_entrega_jornada(v_entrega,'APROBAR',NULL);
  EXCEPTION WHEN others THEN v_error:=true; END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: APROBAR without reason allowed'; END IF;

  v_error:=false;
  BEGIN PERFORM public.bc7_resolver_entrega_jornada(v_entrega,'RECHAZAR','   ');
  EXCEPTION WHEN others THEN v_error:=true; END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: RECHAZAR with blank reason allowed'; END IF;

  v_result := public.bc7_resolver_entrega_jornada(v_entrega,'RECHAZAR','Conteo incorrecto, repetir');
  IF v_result->>'estado' <> 'REQUIERE_RECUENTO' THEN RAISE EXCEPTION 'FAIL: reject did not require recount'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);

  SELECT jsonb_agg(jsonb_build_object('producto_id',el.producto_id,'cantidad',el.cantidad_declarada) ORDER BY el.producto_id)
    INTO v_lines FROM public.turno_jornada_inventario_entrega_lineas el WHERE el.entrega_id=v_entrega;
  v_result := public.bc7_recibir_entrega_jornada(v_s3,v_lines,'Recount match','33330000-0000-0000-0000-000000000102');
  IF v_result->>'estado' <> 'ACEPTADA' OR (v_result->>'intento')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL: recount not accepted as attempt 2';
  END IF;
  IF (SELECT count(*) FROM public.turno_jornada_inventario_recepciones WHERE entrega_id=v_entrega) <> 2 THEN
    RAISE EXCEPTION 'FAIL: recount history lost';
  END IF;

  ---------------------------------------------------------------------------
  -- 15 differences (8 positive, 7 negative), approve with reason, integrity/no stock.
  ---------------------------------------------------------------------------
  UPDATE public.turno_sesiones SET estado='EN_CURSO' WHERE id=v_s3;
  SELECT jsonb_agg(jsonb_build_object('producto_id',el.producto_id,'cantidad',el.cantidad_efectiva) ORDER BY el.producto_id)
    INTO v_lines FROM public.turno_jornada_inventario_entrega_lineas el WHERE el.entrega_id=v_entrega;
  PERFORM public.bc7_guardar_inventario_jornada(v_s3,'FINAL',v_lines,'S3 final for 15 diffs');
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada IMMEDIATE;
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada DEFERRED;
  UPDATE public.turno_sesiones SET estado='COMPLETADA' WHERE id=v_s3;
  SELECT id, origen_corte_id INTO v_entrega, v_source_cut FROM public.turno_jornada_inventario_entregas WHERE origen_sesion_id=v_s3;

  SELECT jsonb_agg(
    jsonb_build_object(
      'producto_id',(t.l->>'producto_id')::uuid,
      'cantidad',
        CASE
          WHEN t.rn <= 8 THEN round(((t.l->>'cantidad')::numeric + (t.rn * 0.125))::numeric,3)
          WHEN t.rn <= 15 THEN greatest(round(((t.l->>'cantidad')::numeric - ((t.rn-8) * 0.25))::numeric,3), 0)
          ELSE (t.l->>'cantidad')::numeric
        END
    ) ORDER BY (t.l->>'producto_id')
  ) INTO v_lines
  FROM (
    SELECT l, row_number() OVER (ORDER BY (l->>'producto_id')) AS rn
    FROM jsonb_array_elements((
      SELECT jsonb_agg(jsonb_build_object('producto_id',el.producto_id,'cantidad',el.cantidad_declarada) ORDER BY el.producto_id)
      FROM public.turno_jornada_inventario_entrega_lineas el WHERE el.entrega_id=v_entrega
    )) l
  ) t;

  v_result := public.bc7_recibir_entrega_jornada(v_s4,v_lines,'15 diffs mixed','33330000-0000-0000-0000-000000000115');
  IF v_result->>'estado' <> 'PENDIENTE_REVISION' THEN RAISE EXCEPTION 'FAIL: 15-diff not pending review'; END IF;
  IF (SELECT count(*) FROM public.turno_jornada_inventario_recepcion_lineas rl
      JOIN public.turno_jornada_inventario_recepciones r ON r.id=rl.recepcion_id
      WHERE r.entrega_id=v_entrega AND rl.diferencia<>0) <> 15 THEN
    RAISE EXCEPTION 'FAIL: expected 15 diff lines';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','turnos:ver,turnos:editar_any,auditoria:editar_any',false);
  v_result := public.bc7_resolver_entrega_jornada(v_entrega,'APROBAR','Aprobado con diferencias verificadas');
  IF v_result->>'estado' <> 'ACEPTADA' THEN RAISE EXCEPTION 'FAIL: 15-diff approve failed'; END IF;
  v_initial := (v_result->>'inventario_inicial_id')::uuid;

  IF (SELECT count(*) FROM public.turno_jornada_inventario_lineas WHERE corte_id=v_source_cut) <> 66 THEN
    RAISE EXCEPTION 'FAIL: source FINAL integrity broken';
  END IF;
  IF (SELECT count(*) FROM public.turno_jornada_inventario_lineas WHERE corte_id=v_initial) <> 66 THEN
    RAISE EXCEPTION 'FAIL: INITIAL integrity broken (not 66 lines)';
  END IF;

  SELECT coalesce(sum(cantidad),0) INTO v_after_stock_total FROM public.stock WHERE almacen_id=v_almacen;
  IF v_after_stock_total IS DISTINCT FROM v_before_stock_total THEN
    RAISE EXCEPTION 'FAIL: public.stock changed after approval path';
  END IF;

  ---------------------------------------------------------------------------
  -- Detail RPC permissions: stranger with turnos.ver blocked, assigned worker and auditor allowed.
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub',v_stranger::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);
  v_error:=false;
  BEGIN
    PERFORM public.bc7_detalle_recepcion_entrega_jornada(v_entrega);
  EXCEPTION WHEN others THEN
    IF SQLSTATE IN ('42501') THEN v_error:=true; ELSE RAISE; END if;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: stranger with turnos.ver read foreign delivery detail'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);
  v_detail := public.bc7_detalle_recepcion_entrega_jornada(v_entrega);
  IF v_detail IS NULL OR (v_detail->>'id')::uuid IS DISTINCT FROM v_entrega THEN
    RAISE EXCEPTION 'FAIL: assigned worker could not read delivery detail';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','auditoria:editar_any',false);
  v_detail := public.bc7_detalle_recepcion_entrega_jornada(v_entrega);
  IF v_detail IS NULL THEN RAISE EXCEPTION 'FAIL: auditor could not read delivery detail'; END IF;

  RAISE NOTICE 'PASS issue #333 reception (isolated): 66-line payload, 66/66, 1 & 15 diffs (+/-), zero/decimals, idempotency/recount, mandatory reasons, detail permissions, FINAL/INITIAL integrity, no stock changes';
-- Cleanup ALL test data inserted by this contract to ensure no side effects on downstream contracts.
-- Order matters: delete dependent rows first to avoid FK violations.
-- Delete inventory lines first (they reference productos.id via FK)
DELETE FROM public.turno_jornada_inventario_lineas;
DELETE FROM public.turno_jornada_inventario_entrega_lineas;
DELETE FROM public.turno_jornada_inventario_recepcion_lineas;
-- Delete stock rows for this warehouse
DELETE FROM public.stock WHERE almacen_id = v_almacen;
-- Delete the 4 specific products created by this fixture (Prod333-A through D, plus loop products)
DELETE FROM public.productos WHERE id IN (v_p1, v_p2, v_p3, v_p4);
DELETE FROM public.productos WHERE nombre LIKE 'Prod333-%';
-- Delete session/turno/programacion data
DELETE FROM public.turno_asignaciones WHERE turno_sesion_id IN (v_s1, v_s2, v_s3, v_s4);
DELETE FROM public.turno_sesiones WHERE id IN (v_s1, v_s2, v_s3, v_s4);
DELETE FROM public.turno_jornada_programacion WHERE id IN (v_prog1, v_prog2, v_prog3, v_prog4);
DELETE FROM public.turnos WHERE id = v_turno;
DELETE FROM public.almacenes WHERE id = v_almacen;
END
$issue333$;