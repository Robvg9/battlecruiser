\set ON_ERROR_STOP on
-- Issue #333 disposable acceptance contract:
-- reception A/B semantics at RPC boundary, full payload, decimals, idempotency/retry,
-- rejection/recount, mandatory resolve reasons, detail permissions, and integrity.

DO $issue333$
DECLARE
  v_owner uuid:='20000000-0000-0000-0000-000000000001';
  v_worker uuid:='20000000-0000-0000-0000-000000000002';
  v_stranger uuid:='20000000-0000-0000-0000-000000000099';
  v_almacen uuid:='10000000-0000-0000-0000-000000000001';
  v_pan uuid:='31000000-0000-0000-0000-000000000001';
  v_jugo uuid:='31000000-0000-0000-0000-000000000002';
  v_turno uuid:='90000000-0000-0000-0000-000000000007';
  v_day4 uuid:='91000000-0000-0000-0000-000000000010';
  v_day5 uuid:='91000000-0000-0000-0000-000000000011';
  v_day6 uuid:='91000000-0000-0000-0000-000000000012';
  v_day7 uuid:='91000000-0000-0000-0000-000000000013';
  v_day8 uuid:='91000000-0000-0000-0000-000000000014';
  v_prog7 uuid:='92000000-0000-0000-0000-000000000013';
  v_prog8 uuid:='92000000-0000-0000-0000-000000000014';
  v_entrega uuid;
  v_result jsonb;
  v_recepcion uuid;
  v_recepcion2 uuid;
  v_initial uuid;
  v_source_cut uuid;
  v_before_pan numeric;
  v_before_jugo numeric;
  v_after_pan numeric;
  v_after_jugo numeric;
  v_error boolean;
  v_lines jsonb;
  v_detail jsonb;
  i int;
  v_declared numeric;
  v_pid uuid;
BEGIN
  -- Ensure a known pending handover exists for Day 5 (from prior shared-inventory contract state).
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','turnos:ver,turnos:editar_any,auditoria:editar_any',false);

  -- Prepare Day 7/8 destinations for controlled scenarios.
  INSERT INTO public.turno_jornada_programacion(id,turno_id,almacen_id,numero_dia,fecha,trabaja,responsable_id,hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,creado_por,actualizado_por)
  VALUES
    (v_prog7,v_turno,v_almacen,7,(now() AT TIME ZONE 'America/Havana')::date+5,true,v_worker,'07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner),
    (v_prog8,v_turno,v_almacen,8,(now() AT TIME ZONE 'America/Havana')::date+6,true,v_worker,'07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.turno_sesiones(id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id)
  VALUES
    (v_day7,v_turno,v_almacen,7,'JORNADA',(now() AT TIME ZONE 'America/Havana')::date+5,'PROGRAMADA',v_prog7),
    (v_day8,v_turno,v_almacen,8,'JORNADA',(now() AT TIME ZONE 'America/Havana')::date+6,'PROGRAMADA',v_prog8)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
  VALUES
    (v_day7,v_turno,v_worker,v_owner),
    (v_day8,v_turno,v_worker,v_owner)
  ON CONFLICT DO NOTHING;

  -- Capture global stock snapshot (no handover should mutate public.stock/FIFO).
  SELECT cantidad INTO v_before_pan FROM public.stock WHERE almacen_id=v_almacen AND producto_id=v_pan;
  SELECT cantidad INTO v_before_jugo FROM public.stock WHERE almacen_id=v_almacen AND producto_id=v_jugo;

  ---------------------------------------------------------------------------
  -- 66/66 coincident, full 66-line payload, retries/idempotency, zero & <=3 decimals,
  -- FINAL/INITIAL integrity, no stock changes.
  ---------------------------------------------------------------------------
  -- Create 64 extra disposable products/stock lines and include in Day 5 FINAL.
  FOR i IN 1..64 LOOP
    v_pid := ('40000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid;
    INSERT INTO public.productos(id,nombre,unidad,activo)
    VALUES (v_pid,'Prod333-'||i,'ud',true)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
    VALUES (v_pid,v_almacen,(i%10)::numeric,0)
    ON CONFLICT (producto_id,almacen_id) DO NOTHING;
  END LOOP;

  -- Ensure Day 5 is openable and has an INITIAL (if pending handover remains, resolve by correct receipt).
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);

  SELECT e.id INTO v_entrega
  FROM public.turno_jornada_inventario_entregas e
  WHERE e.destino_sesion_id=v_day5
  ORDER BY e.creado_en DESC LIMIT 1;
  IF v_entrega IS NOT NULL AND (SELECT estado FROM public.turno_jornada_inventario_entregas WHERE id=v_entrega) IN ('PENDIENTE_RECEPCION','REQUIERE_RECUENTO') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('producto_id',l.producto_id,'cantidad',l.cantidad_declarada) ORDER BY l.producto_id),'[]'::jsonb)
    INTO v_lines
    FROM public.turno_jornada_inventario_entrega_lineas l WHERE l.entrega_id=v_entrega;
    PERFORM public.bc7_recibir_entrega_jornada(v_day5,v_lines,'Match to unblock day5 for issue333 fixture','33300000-0000-0000-0000-000000000001');
  END IF;

  UPDATE public.turno_sesiones SET estado='EN_CURSO' WHERE id=v_day5 AND estado='PROGRAMADA';

  -- Build a 66-line declared payload with zero and decimals (0, 1.5, 2.125 etc.).
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'producto_id',p.id,
      'cantidad',CASE
        WHEN p.id=v_pan THEN 10
        WHEN p.id=v_jugo THEN 0
        ELSE round(( (right(p.id::text,2)::int % 7) + 0.125 )::numeric,3)
      END
    ) ORDER BY p.id
  ),'[]'::jsonb)
  INTO v_lines
  FROM (
    SELECT v_pan AS id
    UNION ALL SELECT v_jugo
    UNION ALL SELECT ('40000000-0000-0000-0000-'||lpad(gs::text,12,'0'))::uuid
    FROM generate_series(1,64) gs
  ) p;
  IF jsonb_array_length(v_lines) <> 66 THEN
    RAISE EXCEPTION 'FAIL: fixture did not build 66-line payload (%).', jsonb_array_length(v_lines);
  END IF;

  -- Persist FINAL with 66 lines (full payload integrity).
  v_result := public.bc7_guardar_inventario_jornada(v_day5,'FINAL',v_lines,'Issue333 66-line final with zero and decimals');
  IF v_result->>'estado' <> 'CONFIRMADO' THEN RAISE EXCEPTION 'FAIL: Day5 FINAL not confirmed'; END IF;
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada IMMEDIATE;
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada DEFERRED;

  SELECT id, origen_corte_id INTO v_entrega, v_source_cut
  FROM public.turno_jornada_inventario_entregas WHERE origen_sesion_id=v_day5;
  IF v_entrega IS NULL THEN RAISE EXCEPTION 'FAIL: no handover prepared from Day5'; END IF;
  IF (SELECT count(*) FROM public.turno_jornada_inventario_entrega_lineas WHERE entrega_id=v_entrega) <> 66 THEN
    RAISE EXCEPTION 'FAIL: handover did not carry full 66-line payload';
  END IF;
  IF (SELECT cantidad_declarada FROM public.turno_jornada_inventario_entrega_lineas WHERE entrega_id=v_entrega AND producto_id=v_jugo) <> 0 THEN
    RAISE EXCEPTION 'FAIL: zero declared quantity not preserved in handover';
  END IF;
  IF (SELECT cantidad_declarada FROM public.turno_jornada_inventario_entrega_lineas WHERE entrega_id=v_entrega AND producto_id=v_pan) <> 10 THEN
    RAISE EXCEPTION 'FAIL: declared quantity mismatch in handover';
  END IF;

  -- 66/66 coincident receive (all declared quantities), idempotent retry with same key/payload.
  SELECT destino_sesion_id INTO v_day6 FROM public.turno_jornada_inventario_entregas WHERE id=v_entrega;
  IF v_day6 IS NULL THEN RAISE EXCEPTION 'FAIL: expected destination for 66-line handover'; END IF;

  v_result := public.bc7_recibir_entrega_jornada(
    v_day6, v_lines, '66/66 coincident physical count', '33300000-0000-0000-0000-000000000066'
  );
  v_recepcion := (v_result->>'id')::uuid;
  IF coalesce((v_result->>'requiere_revision')::boolean,true) IS NOT FALSE OR v_result->>'estado' <> 'ACEPTADA' THEN
    RAISE EXCEPTION 'FAIL: 66/66 coincident receipt not accepted automatically: %', v_result;
  END IF;
  v_initial := (v_result->>'inventario_inicial_id')::uuid;
  IF v_initial IS NULL THEN RAISE EXCEPTION 'FAIL: 66/66 receipt did not create INITIAL'; END IF;

  v_result := public.bc7_recibir_entrega_jornada(
    v_day6, v_lines, '66/66 coincident physical count', '33300000-0000-0000-0000-000000000066'
  );
  IF (v_result->>'id')::uuid IS DISTINCT FROM v_recepcion OR coalesce((v_result->>'idempotente')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: idempotent retry did not return original accepted reception';
  END IF;

  -- Integrity: source FINAL preserved, destination INITIAL matches received, no stock changes.
  IF (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas WHERE corte_id=v_source_cut AND producto_id=v_pan) <> 10 THEN
    RAISE EXCEPTION 'FAIL: source FINAL line mutated';
  END IF;
  IF (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas WHERE corte_id=v_initial AND producto_id=v_pan) <> 10 THEN
    RAISE EXCEPTION 'FAIL: destination INITIAL not materialized from received 66/66';
  END IF;
  IF (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas WHERE corte_id=v_initial AND producto_id=v_jugo) <> 0 THEN
    RAISE EXCEPTION 'FAIL: zero quantity not preserved in INITIAL';
  END IF;

  SELECT cantidad INTO v_after_pan FROM public.stock WHERE almacen_id=v_almacen AND producto_id=v_pan;
  SELECT cantidad INTO v_after_jugo FROM public.stock WHERE almacen_id=v_almacen AND producto_id=v_jugo;
  IF v_after_pan IS DISTINCT FROM v_before_pan OR v_after_jugo IS DISTINCT FROM v_before_jugo THEN
    RAISE EXCEPTION 'FAIL: handover/reception modified public.stock';
  END IF;

  ---------------------------------------------------------------------------
  -- 1 difference and 15 differences, positive/negative differences, <=3 decimals,
  -- rejection and recount, mandatory reasons in both decisions, payload completeness.
  ---------------------------------------------------------------------------
  UPDATE public.turno_sesiones SET estado='EN_CURSO' WHERE id=v_day6;

  -- 1 positive difference on pan (+0.5) with 3-decimal precision in another line.
  v_lines := (
    SELECT jsonb_agg(
      jsonb_build_object(
        'producto_id', (x->>'producto_id')::uuid,
        'cantidad', CASE
          WHEN (x->>'producto_id')::uuid = v_pan THEN ((x->>'cantidad')::numeric + 0.5)
          ELSE (x->>'cantidad')::numeric
        END
      ) ORDER BY (x->>'producto_id')
    )
    FROM jsonb_array_elements((
      SELECT jsonb_agg(jsonb_build_object('producto_id',l.producto_id,'cantidad',l.cantidad_efectiva) ORDER BY l.producto_id)
      FROM public.turno_jornada_inventario_entrega_lineas l
      WHERE l.entrega_id=(SELECT id FROM public.turno_jornada_inventario_entregas WHERE origen_sesion_id=v_day5)
    )) x
  );
  -- Day 6 final declares 66 lines; create handover to day 7.
  PERFORM public.bc7_guardar_inventario_jornada(v_day6,'FINAL',v_lines,'Day6 final with 66 lines');
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada IMMEDIATE;
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada DEFERRED;
  SELECT id INTO v_entrega FROM public.turno_jornada_inventario_entregas WHERE origen_sesion_id=v_day6;

  -- Receive with 1 negative difference and 1 positive? keep exactly 1 difference: pan -1.25
  v_lines := (
    SELECT jsonb_agg(
      jsonb_build_object(
        'producto_id',(l->>'producto_id')::uuid,
        'cantidad',CASE WHEN (l->>'producto_id')::uuid=v_pan THEN ((l->>'cantidad')::numeric - 1.25) ELSE (l->>'cantidad')::numeric END
      ) ORDER BY (l->>'producto_id')
    )
    FROM jsonb_array_elements((
      SELECT jsonb_agg(jsonb_build_object('producto_id',el.producto_id,'cantidad',el.cantidad_declarada) ORDER BY el.producto_id)
      FROM public.turno_jornada_inventario_entrega_lineas el WHERE el.entrega_id=v_entrega
    )) l
  );
  IF jsonb_array_length(v_lines) <> 66 THEN RAISE EXCEPTION 'FAIL: receive payload not 66 lines'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);
  v_result := public.bc7_recibir_entrega_jornada(v_day7,v_lines,'1 difference receipt','33300000-0000-0000-0000-000000000101');
  IF v_result->>'estado' <> 'PENDIENTE_REVISION' OR coalesce((v_result->>'requiere_revision')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: 1-difference receipt not pending review';
  END IF;
  IF (SELECT count(*) FROM public.turno_jornada_inventario_recepcion_lineas rl
      JOIN public.turno_jornada_inventario_recepciones r ON r.id=rl.recepcion_id
      WHERE r.entrega_id=v_entrega AND rl.diferencia<>0) <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 1 difference line';
  END IF;

  -- Mandatory reason for APPROVE and REJECT at RPC boundary.
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','turnos:ver,turnos:editar_any,auditoria:editar_any',false);

  v_error:=false;
  BEGIN
    PERFORM public.bc7_resolver_entrega_jornada(v_entrega,'APROBAR',NULL);
  EXCEPTION WHEN others THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: resolve APROBAR without reason must be rejected'; END IF;

  v_error:=false;
  BEGIN
    PERFORM public.bc7_resolver_entrega_jornada(v_entrega,'RECHAZAR','');
  EXCEPTION WHEN others THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: resolve RECHAZAR without reason must be rejected'; END IF;

  -- Rejection and recount: reject, then send new correct 66-line recount (all match declared).
  v_result := public.bc7_resolver_entrega_jornada(v_entrega,'RECHAZAR','Rechazo por conteo incorrecto');
  IF v_result->>'estado' <> 'REQUIERE_RECUENTO' THEN RAISE EXCEPTION 'FAIL: reject did not require recount'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);
  SELECT jsonb_agg(jsonb_build_object('producto_id',el.producto_id,'cantidad',el.cantidad_declarada) ORDER BY el.producto_id)
    INTO v_lines
  FROM public.turno_jornada_inventario_entrega_lineas el WHERE el.entrega_id=v_entrega;
  v_result := public.bc7_recibir_entrega_jornada(v_day7,v_lines,'Recount all match','33300000-0000-0000-0000-000000000102');
  IF v_result->>'estado' <> 'ACEPTADA' OR (v_result->>'intento')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL: recount after rejection not accepted as attempt 2';
  END IF;
  IF (SELECT count(*) FROM public.turno_jornada_inventario_recepciones WHERE entrega_id=v_entrega) <> 2 THEN
    RAISE EXCEPTION 'FAIL: rejection/recount history not preserved';
  END IF;

  ---------------------------------------------------------------------------
  -- 15 differences (positive and negative), approve with reason, integrity/no stock.
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','turnos:ver,turnos:editar_any,auditoria:editar_any',false);
  UPDATE public.turno_sesiones SET estado='EN_CURSO' WHERE id=v_day7;
  SELECT jsonb_agg(jsonb_build_object('producto_id',el.producto_id,'cantidad',el.cantidad_efectiva) ORDER BY el.producto_id)
    INTO v_lines
  FROM public.turno_jornada_inventario_entrega_lineas el WHERE el.entrega_id=v_entrega; -- from accepted handover
  PERFORM public.bc7_guardar_inventario_jornada(v_day7,'FINAL',v_lines,'Day7 final for 15-diff case');
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada IMMEDIATE;
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada DEFERRED;
  SELECT id, origen_corte_id INTO v_entrega, v_source_cut FROM public.turno_jornada_inventario_entregas WHERE origen_sesion_id=v_day7;

  -- Alter 15 lines: 8 positive, 7 negative (all valid, within decimals), rest equal.
  v_lines := (
    SELECT jsonb_agg(
      jsonb_build_object(
        'producto_id',(l->>'producto_id')::uuid,
        'cantidad',
          CASE
            WHEN rn <= 8 THEN ((l->>'cantidad')::numeric + (rn * 0.125))
            WHEN rn <= 15 THEN greatest(((l->>'cantidad')::numeric - ((rn-8) * 0.25)), 0)
            ELSE (l->>'cantidad')::numeric
          END
      ) ORDER BY (l->>'producto_id')
    )
    FROM (
      SELECT l, row_number() OVER (ORDER BY (l->>'producto_id')) AS rn
      FROM jsonb_array_elements((
        SELECT jsonb_agg(jsonb_build_object('producto_id',el.producto_id,'cantidad',el.cantidad_declarada) ORDER BY el.producto_id)
        FROM public.turno_jornada_inventario_entrega_lineas el WHERE el.entrega_id=v_entrega
      )) l
    ) t
  );

  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);
  v_result := public.bc7_recibir_entrega_jornada(v_day8,v_lines,'15 differences mixed','33300000-0000-0000-0000-000000000115');
  IF v_result->>'estado' <> 'PENDIENTE_REVISION' THEN RAISE EXCEPTION 'FAIL: 15-difference receipt not pending review'; END IF;
  IF (SELECT count(*) FROM public.turno_jornada_inventario_recepcion_lineas rl
      JOIN public.turno_jornada_inventario_recepciones r ON r.id=rl.recepcion_id
      WHERE r.entrega_id=v_entrega AND rl.diferencia<>0) <> 15 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 15 difference lines';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','turnos:ver,turnos:editar_any,auditoria:editar_any',false);
  v_result := public.bc7_resolver_entrega_jornada(v_entrega,'APROBAR','Aprobado con diferencias verificadas');
  IF v_result->>'estado' <> 'ACEPTADA' THEN RAISE EXCEPTION 'FAIL: approve with reason failed for 15-diff case'; END IF;
  v_initial := (v_result->>'inventario_inicial_id')::uuid;
  IF (SELECT count(*) FROM public.turno_jornada_inventario_lineas WHERE corte_id=v_source_cut) <> 66 THEN
    RAISE EXCEPTION 'FAIL: source FINAL not preserved (line count changed)';
  END IF;
  IF (SELECT count(*) FROM public.turno_jornada_inventario_lineas WHERE corte_id=v_initial) <> 66 THEN
    RAISE EXCEPTION 'FAIL: destination INITIAL missing full 66 lines';
  END IF;

  SELECT cantidad INTO v_after_pan FROM public.stock WHERE almacen_id=v_almacen AND producto_id=v_pan;
  SELECT cantidad INTO v_after_jugo FROM public.stock WHERE almacen_id=v_almacen AND producto_id=v_jugo;
  IF v_after_pan IS DISTINCT FROM v_before_pan OR v_after_jugo IS DISTINCT FROM v_before_jugo THEN
    RAISE EXCEPTION 'FAIL: approval path modified public.stock';
  END IF;

  ---------------------------------------------------------------------------
  -- Detail RPC permissions: turnos.ver cannot read foreign delivery, owner/auditor can.
  ---------------------------------------------------------------------------
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);
  PERFORM set_config('request.jwt.claim.sub',v_stranger::text,false);
  v_error:=false;
  BEGIN
    PERFORM public.bc7_detalle_recepcion_entrega_jornada(v_entrega);
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
           WHEN others THEN
             IF SQLSTATE='42501' THEN v_error:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: turnos.ver stranger read foreign delivery detail'; END IF;

  -- Positive: assigned worker on destination can read their delivery detail.
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  v_detail := public.bc7_detalle_recepcion_entrega_jornada(v_entrega);
  IF v_detail IS NULL OR (v_detail->>'id')::uuid IS DISTINCT FROM v_entrega THEN
    RAISE EXCEPTION 'FAIL: assigned worker could not read own delivery detail';
  END IF;

  -- Positive: auditor/admin can read.
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','auditoria:editar_any',false);
  v_detail := public.bc7_detalle_recepcion_entrega_jornada(v_entrega);
  IF v_detail IS NULL THEN RAISE EXCEPTION 'FAIL: auditor could not read delivery detail'; END IF;

  RAISE NOTICE 'PASS issue #333 reception: 66-line payload, 66/66, 1 & 15 diffs (+/-), zero/decimals, idempotency/recount history, mandatory reasons, detail permissions, FINAL/INITIAL integrity, no stock changes';
END
$issue333$;
