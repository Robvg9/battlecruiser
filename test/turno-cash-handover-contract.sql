\set ON_ERROR_STOP on
-- Cash handover contract runs only against the disposable PostgreSQL fixture.
-- It uses the completed Day 1 and active Day 2 created by the Step 7 contracts.
DO $cash$
DECLARE
  v_turno uuid := '90000000-0000-0000-0000-000000000007';
  v_day1 uuid := '91000000-0000-0000-0000-000000000007';
  v_day2 uuid := '91000000-0000-0000-0000-000000000008';
  v_owner uuid := '20000000-0000-0000-0000-000000000001';
  v_worker uuid := '20000000-0000-0000-0000-000000000002';
  v_pan uuid := '31000000-0000-0000-0000-000000000001';
  v_jugo uuid := '31000000-0000-0000-0000-000000000002';
  v_decl1 uuid;
  v_decl2 uuid;
  v_declared1 numeric;
  v_tramo2 uuid;
  v_diff_id uuid;
  v_result jsonb;
  v_retry jsonb;
  v_error boolean;
  v_moves_before integer;
  v_moves_after integer;
  v_stock_pan numeric;
  v_stock_jugo numeric;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','turnos:crear,turnos:editar_any,turnos:ver,gastos:crear,gastos:ver,reinversiones:crear,reinversiones:ver',false);

  SELECT id INTO v_decl1
  FROM public.turno_declaraciones
  WHERE turno_sesion_id=v_day1
  ORDER BY declarado_at DESC,created_at DESC
  LIMIT 1;
  IF v_decl1 IS NULL THEN RAISE EXCEPTION 'FAIL: Day 1 declaration fixture is missing'; END IF;
  SELECT monto INTO v_declared1 FROM public.turno_declaraciones WHERE id=v_decl1;
  IF (SELECT estado FROM public.turno_sesiones WHERE id=v_day1)<>'COMPLETADA' THEN
    RAISE EXCEPTION 'FAIL: Day 1 fixture must already be completed';
  END IF;

  -- The administrative inbox sees a completed declaration before counting.
  v_result:=public.bc5_listar_dinero_pendiente_contar();
  IF NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_result) x
    WHERE x->>'declaracion_id'=v_decl1::text
  ) THEN
    RAISE EXCEPTION 'FAIL: owner inbox did not return the pending Day 1 declaration';
  END IF;

  -- Exact match: count the exact declared amount, without creating a difference row.
  v_result:=public.bc5_contar_dinero_entregado(v_decl1,v_declared1,'Conteo exacto fixture');
  IF v_result->>'estado'<>'APROBADA'
     OR (v_result->>'diferencia')::numeric<>0
     OR coalesce((v_result->>'idempotente')::boolean,false) THEN
    RAISE EXCEPTION 'FAIL: exact cash count was not approved correctly';
  END IF;
  IF EXISTS(SELECT 1 FROM public.turno_diferencias WHERE declaracion_dinero_id=v_decl1) THEN
    RAISE EXCEPTION 'FAIL: exact cash count unexpectedly created a difference';
  END IF;

  -- A pending declaration cannot be counted before its assigned session is completed.
  SELECT id INTO v_tramo2
  FROM public.turno_tramos
  WHERE turno_sesion_id=v_day2 AND estado='ACTIVO' AND usuario_id=v_owner
  ORDER BY inicio_at DESC,created_at DESC
  LIMIT 1;
  IF v_tramo2 IS NULL THEN RAISE EXCEPTION 'FAIL: active Day 2 tranche is missing'; END IF;

  v_decl2:=public.bc_declarar_dinero(v_tramo2,100);
  v_error:=false;
  BEGIN
    PERFORM public.bc5_contar_dinero_entregado(v_decl2,92,'Conteo antes del cierre');
  EXCEPTION WHEN check_violation THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: owner counted cash before session completion'; END IF;

  -- Complete the real Step 7 flow inside the disposable database.
  PERFORM public.bc7_guardar_inventario_jornada(v_day2,'FINAL',
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',9.5),
      jsonb_build_object('producto_id',v_jugo,'cantidad',4.25)
    ),'Final physical count fixture');
  PERFORM public.bc5_cerrar_jornada(v_day2,'Excepción controlada del contrato PostgreSQL');
  IF (SELECT estado FROM public.turno_sesiones WHERE id=v_day2)<>'COMPLETADA' THEN
    RAISE EXCEPTION 'FAIL: Day 2 did not reach COMPLETADA before owner count';
  END IF;

  SELECT count(*) INTO v_moves_before FROM public.movimientos_caja_fixture;
  SELECT cantidad INTO v_stock_pan FROM public.stock
    WHERE producto_id=v_pan AND almacen_id='10000000-0000-0000-0000-000000000001';
  SELECT cantidad INTO v_stock_jugo FROM public.stock
    WHERE producto_id=v_jugo AND almacen_id='10000000-0000-0000-0000-000000000001';

  -- A mismatch is persisted, linked to the declaration, and remains unresolved.
  v_result:=public.bc5_contar_dinero_entregado(v_decl2,92,'Faltan 8 CUP al contar físicamente');
  IF v_result->>'estado'<>'CON_DIFERENCIA'
     OR (v_result->>'monto_declarado')::numeric<>100
     OR (v_result->>'monto_contado')::numeric<>92
     OR (v_result->>'diferencia')::numeric<>-8 THEN
    RAISE EXCEPTION 'FAIL: mismatch did not produce the expected declared/count/difference values';
  END IF;
  v_diff_id:=(v_result->>'diferencia_id')::uuid;
  IF v_diff_id IS NULL THEN RAISE EXCEPTION 'FAIL: mismatch did not link a turno_diferencias record'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.turno_diferencias
    WHERE id=v_diff_id AND declaracion_dinero_id=v_decl2
      AND categoria='DINERO' AND esperado=100 AND declarado=92
      AND diferencia=-8 AND aprobado=false AND usuario_responsable=v_owner
  ) THEN
    RAISE EXCEPTION 'FAIL: the cash difference row is not correctly linked or is already approved';
  END IF;

  -- A same-value retry is idempotent; a different value cannot overwrite the physical evidence.
  v_retry:=public.bc5_contar_dinero_entregado(v_decl2,92,'Reintento del mismo conteo');
  IF coalesce((v_retry->>'idempotente')::boolean,false) IS NOT TRUE
     OR (v_retry->>'diferencia_id')::uuid IS DISTINCT FROM v_diff_id THEN
    RAISE EXCEPTION 'FAIL: identical cash count retry was not idempotent';
  END IF;
  v_error:=false;
  BEGIN
    PERFORM public.bc5_contar_dinero_entregado(v_decl2,91,'Intento de sobrescribir evidencia');
  EXCEPTION WHEN check_violation THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: a different amount overwrote a confirmed physical count'; END IF;

  SELECT count(*) INTO v_moves_after FROM public.movimientos_caja_fixture;
  IF v_moves_after<>v_moves_before
     OR (SELECT cantidad FROM public.stock WHERE producto_id=v_pan AND almacen_id='10000000-0000-0000-0000-000000000001')<>v_stock_pan
     OR (SELECT cantidad FROM public.stock WHERE producto_id=v_jugo AND almacen_id='10000000-0000-0000-0000-000000000001')<>v_stock_jugo THEN
    RAISE EXCEPTION 'FAIL: cash count/difference changed cash movements or product stock';
  END IF;
  IF (SELECT count(*) FROM public.turno_diferencias WHERE declaracion_dinero_id=v_decl2)<>1
     OR (SELECT count(*) FROM public.turno_eventos
         WHERE turno_sesion_id=v_day2 AND tipo='DINERO_CONTADO_POR_ADMIN')<>1 THEN
    RAISE EXCEPTION 'FAIL: cash count retry created duplicate differences or audit events';
  END IF;

  v_result:=public.bc5_listar_dinero_pendiente_contar();
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_result) x
      WHERE x->>'declaracion_id'=v_decl2::text AND x->>'estado_aprobacion'='CON_DIFERENCIA') THEN
    RAISE EXCEPTION 'FAIL: unresolved discrepancy is missing from the owner inbox';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_result) x
      WHERE x->>'declaracion_id'=v_decl1::text) THEN
    RAISE EXCEPTION 'FAIL: an exact, approved count remains in the pending inbox';
  END IF;

  -- A Jornada discrepancy cannot bypass the physical-count workflow through the old approval RPC.
  v_error:=false;
  BEGIN
    PERFORM public.bc_aprobar_declaracion(v_decl2);
  EXCEPTION WHEN check_violation THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: ordinary declaration approval bypassed a cash discrepancy'; END IF;

  -- Only an explicit administrator review resolves the discrepancy; original counted evidence remains.
  PERFORM public.bc_aprobar_diferencia(v_diff_id,'Revisada contra el efectivo entregado');
  IF (SELECT estado_aprobacion FROM public.turno_declaraciones WHERE id=v_decl2)<>'APROBADA'
     OR (SELECT monto_contado FROM public.turno_declaraciones WHERE id=v_decl2)<>92
     OR (SELECT diferencia FROM public.turno_declaraciones WHERE id=v_decl2)<>-8
     OR NOT (SELECT aprobado FROM public.turno_diferencias WHERE id=v_diff_id) THEN
    RAISE EXCEPTION 'FAIL: administrator review did not preserve and resolve the original difference';
  END IF;
  IF (SELECT count(*) FROM public.turno_eventos
      WHERE turno_sesion_id=v_day2 AND tipo='DINERO_DIFERENCIA_RESUELTA')<>1 THEN
    RAISE EXCEPTION 'FAIL: discrepancy resolution event is missing';
  END IF;

  -- An assigned non-admin cannot list all cash or register a count.
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);
  v_error:=false;
  BEGIN
    PERFORM public.bc5_listar_dinero_pendiente_contar();
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: non-admin listed the administrator cash inbox'; END IF;
  v_error:=false;
  BEGIN
    PERFORM public.bc5_contar_dinero_entregado(v_decl2,92,'Conteo no autorizado');
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: non-admin recorded the owner cash count'; END IF;

  IF has_function_privilege('anon','public.bc5_listar_dinero_pendiente_contar()','EXECUTE')
     OR has_function_privilege('anon','public.bc5_contar_dinero_entregado(uuid,numeric,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc5_listar_dinero_pendiente_contar()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc5_contar_dinero_entregado(uuid,numeric,text)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: cash handover RPC ACL grants are incorrect';
  END IF;
  IF has_table_privilege('authenticated','public.turno_declaraciones','INSERT')
     OR has_table_privilege('authenticated','public.turno_declaraciones','UPDATE')
     OR has_table_privilege('authenticated','public.turno_diferencias','INSERT')
     OR has_table_privilege('authenticated','public.turno_diferencias','UPDATE') THEN
    RAISE EXCEPTION 'FAIL: authenticated can bypass cash handover RPCs through direct writes';
  END IF;

  RAISE NOTICE 'PASS Cash handover: exact match, admin-only count, immutable evidence, discrepancy review, no automatic stock/cash mutation, idempotency and ACLs';
END
$cash$;
