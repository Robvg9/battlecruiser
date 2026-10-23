-- Step 6 behavioral contract. Run only against the disposable fixture database.
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('test.perms','reportes:ver',false);

DO $test$
DECLARE v_count integer; v_mermas integer; v_bajas integer; v_compra integer;
BEGIN
  SELECT count(*),count(*) FILTER (WHERE tipo='merma'),count(*) FILTER (WHERE tipo='baja'),
         count(*) FILTER (WHERE tipo='compra')
  INTO v_count,v_mermas,v_bajas,v_compra
  FROM public.reporte_movimiento_inventario(DATE '2030-01-01',DATE '2030-01-10',NULL,NULL,100,0);
  IF v_count<>7 THEN RAISE EXCEPTION 'Movement report expected 7 rows including purchase + approved adjustments, got %',v_count; END IF;
  IF v_mermas<>1 OR v_bajas<>1 OR v_compra<>1 THEN
    RAISE EXCEPTION 'Movement report omitted a purchase or approved adjustment: merma %, baja %, purchase %',v_mermas,v_bajas,v_compra;
  END IF;
  IF EXISTS (SELECT 1 FROM public.reporte_movimiento_inventario(DATE '2030-01-01',DATE '2030-01-10',NULL,NULL,100,0)
             WHERE tipo IN ('merma','baja') AND direccion<>'salida') THEN
    RAISE EXCEPTION 'Approved stock adjustments must be recorded as outbound movement';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.movimientos_producto(NULL,NULL,DATE '2030-01-01',DATE '2030-01-10',NULL,100,0);
  IF v_count<>7 THEN RAISE EXCEPTION 'Product movement ledger expected 7 rows incl. approved adjustments, got %',v_count; END IF;
  SELECT count(*) INTO v_count
  FROM public.movimientos_producto(NULL,NULL,DATE '2030-01-01',DATE '2030-01-10','merma',100,0);
  IF v_count<>1 THEN RAISE EXCEPTION 'Type filter for approved merma should yield one row, got %',v_count; END IF;
  IF (SELECT cantidad FROM public.movimientos_producto(NULL,NULL,DATE '2030-01-01',DATE '2030-01-10','merma',100,0) LIMIT 1)>=0 THEN
    RAISE EXCEPTION 'Merma quantity must be negative in the signed product ledger';
  END IF;
  IF EXISTS (SELECT 1 FROM public.movimientos_producto(NULL,NULL,DATE '2030-01-01',DATE '2030-01-10',NULL,100,0)
             WHERE tipo IN ('merma','baja') AND cantidad>=0) THEN
    RAISE EXCEPTION 'Approved adjustments must have a negative signed quantity';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.reporte_movimiento_inventario(DATE '2030-01-01',DATE '2030-01-10',
      '30000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000002'::uuid,100,0);
  IF v_count<>1 OR NOT EXISTS (
    SELECT 1 FROM public.reporte_movimiento_inventario(DATE '2030-01-01',DATE '2030-01-10',
       '30000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000002'::uuid,100,0)
    WHERE tipo='transferencia_entrada'
  ) THEN RAISE EXCEPTION 'Warehouse filter should show only the matching transfer inflow'; END IF;
  BEGIN
    PERFORM * FROM public.movimientos_producto(NULL,NULL,DATE '2030-01-10',DATE '2030-01-01',NULL,100,0);
    RAISE EXCEPTION 'REVERSED_DATE_RANGE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='REVERSED_DATE_RANGE_ACCEPTED' THEN RAISE; END IF;
    IF SQLSTATE<>'22007' THEN RAISE; END IF;
  END;
  IF has_function_privilege('anon','public.movimientos_producto(uuid,uuid,date,date,text,integer,integer)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute inventory movement RPC';
  END IF;
  IF NOT has_function_privilege('authenticated','public.movimientos_producto(uuid,uuid,date,date,text,integer,integer)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must retain movement RPC access';
  END IF;
END
$test$;

-- Expense permission does not confer approval rights over inventory adjustments.
SELECT set_config('test.perms','gastos:editar_any',false);
DO $test$
BEGIN
  BEGIN
    PERFORM public.resolver_aprobacion_operativa('merma',
      '80000000-0000-0000-0000-000000000002','APROBAR','',1,NULL);
    RAISE EXCEPTION 'EXPENSE_PERMISSION_ESCALATED_TO_MERMA';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='EXPENSE_PERMISSION_ESCALATED_TO_MERMA' THEN RAISE; END IF;
    IF SQLSTATE<>'42501' THEN RAISE; END IF;
  END;
  IF (SELECT estado FROM public.mermas WHERE id='80000000-0000-0000-0000-000000000002')<>'PENDIENTE' THEN
    RAISE EXCEPTION 'Unauthorized approval changed the merma';
  END IF;
END
$test$;

-- Decision and rejection-reason validation.
SELECT set_config('test.perms','mermas:editar_any',false);
DO $test$
BEGIN
  BEGIN
    PERFORM public.resolver_aprobacion_operativa('merma',
      '80000000-0000-0000-0000-000000000002',NULL,'',1,NULL);
    RAISE EXCEPTION 'NULL_APPROVAL_DECISION_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='NULL_APPROVAL_DECISION_ACCEPTED' THEN RAISE; END IF;
    IF SQLERRM<>'Decisión inválida.' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.resolver_aprobacion_operativa('merma',
      '80000000-0000-0000-0000-000000000002','RECHAZAR','  ',NULL,NULL);
    RAISE EXCEPTION 'EMPTY_REJECTION_REASON_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='EMPTY_REJECTION_REASON_ACCEPTED' THEN RAISE; END IF;
    IF SQLERRM<>'El rechazo requiere un motivo.' THEN RAISE; END IF;
  END;
END
$test$;

-- Approving a merma decrements stock/FIFO exactly once; actual qty is bounded by requested qty.
SELECT public.resolver_aprobacion_operativa('merma',
  '80000000-0000-0000-0000-000000000002','APROBAR','conteo verificado',1,NULL);
DO $test$
BEGIN
  IF (SELECT cantidad FROM public.stock WHERE producto_id='30000000-0000-0000-0000-000000000001'
      AND almacen_id='10000000-0000-0000-0000-000000000001')<>49 THEN
    RAISE EXCEPTION 'Merma approval must reduce stock by actual quantity 1';
  END IF;
  IF (SELECT cantidad_restante FROM public.lotes_compra WHERE id='40000000-0000-0000-0000-000000000001')<>49 THEN
    RAISE EXCEPTION 'Merma approval must consume FIFO lot units';
  END IF;
  IF (SELECT estado FROM public.mermas WHERE id='80000000-0000-0000-0000-000000000002')<>'APROBADA'
     OR (SELECT cantidad FROM public.mermas WHERE id='80000000-0000-0000-0000-000000000002')<>1 THEN
    RAISE EXCEPTION 'Approved merma should preserve approved quantity and status';
  END IF;
  BEGIN
    PERFORM public.resolver_aprobacion_operativa('merma',
      '80000000-0000-0000-0000-000000000002','APROBAR','duplicado',1,NULL);
    RAISE EXCEPTION 'ALREADY_RESOLVED_MERMA_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='ALREADY_RESOLVED_MERMA_ACCEPTED' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%no está pendiente%' THEN RAISE; END IF;
  END;
END
$test$;

-- The new baja branch requires its own permission and uses the same safe stock/FIFO routine.
INSERT INTO public.bajas(id,almacen_id,producto_id,cantidad,motivo,estado,creado_por,creado_nombre,creado_en,actualizado_en)
VALUES('83000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
       '30000000-0000-0000-0000-000000000001',4,'Baja de prueba','PENDIENTE',
       '20000000-0000-0000-0000-000000000001','Dueño Fixture','2030-01-12 15:00:00+00','2030-01-12 15:00:00+00');
SELECT set_config('test.perms','bajas:editar_any',false);
DO $test$
BEGIN
  BEGIN
    PERFORM public.resolver_aprobacion_operativa('baja',
      '83000000-0000-0000-0000-000000000001','APROBAR','',5,NULL);
    RAISE EXCEPTION 'BAJA_ABOVE_REQUESTED_QTY_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='BAJA_ABOVE_REQUESTED_QTY_ACCEPTED' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%Cantidad real inválida%' THEN RAISE; END IF;
  END;
  IF (SELECT cantidad FROM public.stock WHERE producto_id='30000000-0000-0000-0000-000000000001'
      AND almacen_id='10000000-0000-0000-0000-000000000001')<>49 THEN
    RAISE EXCEPTION 'Invalid baja quantity changed stock';
  END IF;
END
$test$;
SELECT public.resolver_aprobacion_operativa('baja',
  '83000000-0000-0000-0000-000000000001','APROBAR','conteo verificado',2,NULL);
DO $test$
BEGIN
  IF (SELECT cantidad FROM public.stock WHERE producto_id='30000000-0000-0000-0000-000000000001'
      AND almacen_id='10000000-0000-0000-0000-000000000001')<>47 THEN
    RAISE EXCEPTION 'Baja approval must decrement stock by approved quantity';
  END IF;
  IF (SELECT estado FROM public.bajas WHERE id='83000000-0000-0000-0000-000000000001')<>'APROBADA'
     OR (SELECT cantidad FROM public.bajas WHERE id='83000000-0000-0000-0000-000000000001')<>2 THEN
    RAISE EXCEPTION 'Approved baja should retain approved quantity and status';
  END IF;
END
$test$;

-- Rejection closes the request but does not mutate the stock balance.
INSERT INTO public.mermas(id,almacen_id,producto_id,cantidad,motivo,estado,creado_por,creado_nombre)
VALUES('82000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
       '30000000-0000-0000-0000-000000000001',1,'Merma rechazada','PENDIENTE',
       '20000000-0000-0000-0000-000000000001','Dueño Fixture');
SELECT set_config('test.perms','mermas:editar_any',false);
SELECT public.resolver_aprobacion_operativa('merma',
  '82000000-0000-0000-0000-000000000002','RECHAZAR','No procede',NULL,NULL);
DO $test$
BEGIN
  IF (SELECT cantidad FROM public.stock WHERE producto_id='30000000-0000-0000-0000-000000000001'
      AND almacen_id='10000000-0000-0000-0000-000000000001')<>47 THEN
    RAISE EXCEPTION 'Rejected merma must not reduce stock';
  END IF;
  IF (SELECT estado FROM public.mermas WHERE id='82000000-0000-0000-0000-000000000002')<>'RECHAZADA' THEN
    RAISE EXCEPTION 'Rejected merma status incorrect';
  END IF;
END
$test$;

-- Null/negative declared cash is rejected; mismatch is recorded atomically and idempotently.
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('test.perms','turnos:crear',false);
DO $test$
BEGIN
  BEGIN
    PERFORM public.registrar_cuadre('91000000-0000-0000-0000-000000000001',NULL,
      'a0000000-0000-0000-0000-000000000001','null value');
    RAISE EXCEPTION 'NULL_CASH_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='NULL_CASH_ACCEPTED' THEN RAISE; END IF;
    IF SQLSTATE<>'22023' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.registrar_cuadre('91000000-0000-0000-0000-000000000001',-1,
      'a0000000-0000-0000-0000-000000000002','negative');
    RAISE EXCEPTION 'NEGATIVE_CASH_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='NEGATIVE_CASH_ACCEPTED' THEN RAISE; END IF;
    IF SQLSTATE<>'22023' THEN RAISE; END IF;
  END;
END
$test$;
CREATE TEMP TABLE _cuadre_first AS
SELECT public.registrar_cuadre('91000000-0000-0000-0000-000000000001',95,
  'a0000000-0000-0000-0000-000000000003','Conteo verificado') AS result;
DO $test$
DECLARE v_repeat jsonb; v_row public.cuadres;
BEGIN
  v_repeat:=public.registrar_cuadre('91000000-0000-0000-0000-000000000001',95,
    'a0000000-0000-0000-0000-000000000003','Conteo verificado');
  IF coalesce((v_repeat->>'idempotente')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Repeating same settlement key should be idempotent: %',v_repeat;
  END IF;
  SELECT * INTO v_row FROM public.cuadres WHERE id='91000000-0000-0000-0000-000000000001';
  IF v_row.estado<>'CON_DIFERENCIA' OR v_row.diferencia<>-5 OR v_row.dinero_declarado<>95 THEN
    RAISE EXCEPTION 'Settlement difference/status is wrong: %',row_to_json(v_row);
  END IF;
  IF (SELECT count(*) FROM public.incidencias WHERE cuadre_id=v_row.id)<>1 THEN
    RAISE EXCEPTION 'Mismatch must create one incident; retries must not duplicate it';
  END IF;
END
$test$;

-- Invalid review decision is rejected; self-review blocked; review of a submitted count works once.
SELECT set_config('test.perms','turnos:editar_any',false);
DO $test$
BEGIN
  BEGIN
    PERFORM public.revisar_cuadre('91000000-0000-0000-0000-000000000001',NULL,'x',
      'b0000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'NULL_REVIEW_DECISION_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='NULL_REVIEW_DECISION_ACCEPTED' THEN RAISE; END IF;
    IF SQLERRM<>'Decisión inválida.' THEN RAISE; END IF;
  END;
END
$test$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
DO $test$
BEGIN
  BEGIN
    PERFORM public.revisar_cuadre('91000000-0000-0000-0000-000000000001','aprobar','', 
      'b0000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'SELF_REVIEW_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='SELF_REVIEW_ACCEPTED' THEN RAISE; END IF;
    IF SQLSTATE<>'42501' THEN RAISE; END IF;
  END;
END
$test$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
SELECT public.revisar_cuadre('91000000-0000-0000-0000-000000000001','aprobar','Revisado',
  'b0000000-0000-0000-0000-000000000003');
DO $test$
BEGIN
  IF (SELECT estado FROM public.cuadres WHERE id='91000000-0000-0000-0000-000000000001')<>'APROBADO' THEN
    RAISE EXCEPTION 'Reviewer approval did not close the cuadre';
  END IF;
  BEGIN
    PERFORM public.revisar_cuadre('91000000-0000-0000-0000-000000000001','devolver','Reabrir',
      'b0000000-0000-0000-0000-000000000004');
    RAISE EXCEPTION 'TERMINAL_CUADRE_REVIEW_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='TERMINAL_CUADRE_REVIEW_ACCEPTED' THEN RAISE; END IF;
    IF SQLERRM<>'El cuadre ya fue resuelto.' THEN RAISE; END IF;
  END;
END
$test$;

-- A returned cuadre must be re-declared before reviewer may act again.
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('test.perms','turnos:crear',false);
SELECT public.registrar_cuadre('91000000-0000-0000-0000-000000000002',100,
  'a0000000-0000-0000-0000-000000000004','Conteo inicial');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
SELECT set_config('test.perms','turnos:editar_any',false);
SELECT public.revisar_cuadre('91000000-0000-0000-0000-000000000002','devolver','Recontar',
  'b0000000-0000-0000-0000-000000000005');
DO $test$
BEGIN
  IF (SELECT estado FROM public.cuadres WHERE id='91000000-0000-0000-0000-000000000002')<>'EN_REVISION' THEN
    RAISE EXCEPTION 'Return decision must set EN_REVISION';
  END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('test.perms','turnos:crear',false);
SELECT public.registrar_cuadre('91000000-0000-0000-0000-000000000002',101,
  'a0000000-0000-0000-0000-000000000005','Conteo corregido');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
SELECT set_config('test.perms','turnos:editar_any',false);
SELECT public.revisar_cuadre('91000000-0000-0000-0000-000000000002','aprobar','Revisado tras reconteo',
  'b0000000-0000-0000-0000-000000000006');
DO $test$
BEGIN
  IF (SELECT estado FROM public.cuadres WHERE id='91000000-0000-0000-0000-000000000002')<>'APROBADO' THEN
    RAISE EXCEPTION 'Re-declared cuadre should be eligible for review';
  END IF;
END
$test$;

SELECT 'STEP6 CONTRACT PASS' AS result;
