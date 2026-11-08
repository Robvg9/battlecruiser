DO $contract$
DECLARE
  v_owner uuid := '11111111-1111-4111-8111-111111111111';
  v_staff uuid := '22222222-2222-4222-8222-222222222222';
  v_expense_approver uuid := '55555555-5555-4555-8555-555555555555';
  v_merma_approver uuid := '66666666-6666-4666-8666-666666666666';
  v_store uuid := '33333333-3333-4333-8333-333333333333';
  v_product uuid := '44444444-4444-4444-8444-444444444444';
  v_owner_baja uuid;
  v_owner_repeat uuid;
  v_staff_baja uuid;
  v_visible integer;
  v_stock numeric;
  v_fifo numeric;
  v_before_count integer;
  v_failed boolean := false;
  v_batch jsonb;
  v_batch_retry jsonb;
  v_batch_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);

  v_owner_baja := public.crear_baja(
    v_store, v_product, 2, 'Consumo interno', NULL, NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
  );
  v_owner_repeat := public.crear_baja(
    v_store, v_product, 2, 'Consumo interno', NULL, NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
  );

  IF v_owner_baja IS DISTINCT FROM v_owner_repeat THEN
    RAISE EXCEPTION 'Idempotency did not return the same Baja id.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bajas b
    WHERE b.id = v_owner_baja
      AND b.estado = 'APROBADA'
      AND b.creado_por = v_owner
      AND b.revisado_por = v_owner
      AND b.fecha_revision IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Owner Baja was not immediately approved and audited.';
  END IF;

  SELECT s.cantidad INTO v_stock
  FROM public.stock s WHERE s.almacen_id = v_store AND s.producto_id = v_product;
  SELECT COALESCE(sum(l.cantidad_restante), 0) INTO v_fifo
  FROM public.lotes_compra l WHERE l.almacen_id = v_store AND l.producto_id = v_product;

  IF v_stock <> 48 OR v_fifo <> 48 THEN
    RAISE EXCEPTION 'Owner approval must decrement stock and FIFO once; stock %, FIFO %.', v_stock, v_fifo;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, false);
  v_staff_baja := public.crear_baja(
    v_store, v_product, 3, 'Rotura', NULL, NULL,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.bajas b
    WHERE b.id = v_staff_baja
      AND b.estado = 'PENDIENTE'
      AND b.creado_por = v_staff
      AND b.revisado_por IS NULL
      AND b.fecha_revision IS NULL
  ) THEN
    RAISE EXCEPTION 'Non-approver Baja must stay pending.';
  END IF;

  SELECT s.cantidad INTO v_stock
  FROM public.stock s WHERE s.almacen_id = v_store AND s.producto_id = v_product;
  SELECT COALESCE(sum(l.cantidad_restante), 0) INTO v_fifo
  FROM public.lotes_compra l WHERE l.almacen_id = v_store AND l.producto_id = v_product;

  IF v_stock <> 48 OR v_fifo <> 48 THEN
    RAISE EXCEPTION 'A pending request must not change stock or FIFO; stock %, FIFO %.', v_stock, v_fifo;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SELECT count(*) INTO v_visible
  FROM public.listar_aprobaciones_admin() a
  WHERE a.tipo = 'baja' AND a.id = v_staff_baja AND a.estado = 'PENDIENTE';

  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'Authorized approver cannot see the pending Baja in the admin queue.';
  END IF;

  -- The Baja approver must not see unrelated pending expenses or mermas.
  SELECT count(*) INTO v_visible FROM public.listar_aprobaciones_admin();
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'Baja-only approver received rows from other approval modules.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_expense_approver::text, false);
  SELECT count(*) INTO v_visible
  FROM public.listar_aprobaciones_admin() a
  WHERE a.tipo = 'gasto';
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'Expense approver cannot see the pending expense.';
  END IF;
  SELECT count(*) INTO v_visible
  FROM public.listar_aprobaciones_admin() a
  WHERE a.tipo <> 'gasto';
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'Expense-only approver received unrelated approval rows.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_merma_approver::text, false);
  SELECT count(*) INTO v_visible
  FROM public.listar_aprobaciones_admin() a
  WHERE a.tipo = 'merma';
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'Merma approver cannot see the pending merma.';
  END IF;
  SELECT count(*) INTO v_visible
  FROM public.listar_aprobaciones_admin() a
  WHERE a.tipo <> 'merma';
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'Merma-only approver received unrelated approval rows.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, false);
  v_failed := false;
  BEGIN
    PERFORM 1 FROM public.listar_aprobaciones_admin();
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'A creator without global approval permission must not list the admin queue.';
  END IF;


  -- Batch request: regular creators enqueue every line without changing stock or FIFO.
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, false);
  v_batch := public.crear_bajas_multiple(
    jsonb_build_array(
      jsonb_build_object('almacen_id',v_store,'producto_id',v_product,'cantidad',1,'motivo','Rotura'),
      jsonb_build_object('almacen_id',v_store,'producto_id',v_product,'cantidad',2,'motivo','Consumo interno')
    ),
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid
  );
  IF (v_batch->>'count')::integer <> 2 OR jsonb_array_length(v_batch->'bajas') <> 2 THEN
    RAISE EXCEPTION 'Batch request did not return both Baja records.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bajas b
    WHERE b.id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(v_batch->'bajas'))
      AND (b.estado <> 'PENDIENTE' OR b.creado_por <> v_staff)
  ) THEN RAISE EXCEPTION 'A non-approver batch row was not kept pending.'; END IF;

  v_batch_retry := public.crear_bajas_multiple(
    jsonb_build_array(
      jsonb_build_object('almacen_id',v_store,'producto_id',v_product,'cantidad',1,'motivo','Rotura'),
      jsonb_build_object('almacen_id',v_store,'producto_id',v_product,'cantidad',2,'motivo','Consumo interno')
    ),
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid
  );
  IF v_batch_retry <> v_batch THEN RAISE EXCEPTION 'Retrying a successful Baja batch did not return the original records.'; END IF;
  SELECT count(*) INTO v_batch_count FROM public.bajas b
  WHERE b.id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(v_batch->'bajas'));
  IF v_batch_count <> 2 THEN RAISE EXCEPTION 'Idempotent batch retry created duplicate rows.'; END IF;
  SELECT cantidad INTO v_stock FROM public.stock WHERE almacen_id=v_store AND producto_id=v_product;
  SELECT COALESCE(sum(cantidad_restante),0) INTO v_fifo FROM public.lotes_compra WHERE almacen_id=v_store AND producto_id=v_product;
  IF v_stock <> 48 OR v_fifo <> 48 THEN RAISE EXCEPTION 'Pending batch changed stock/FIFO; stock %, FIFO %.',v_stock,v_fifo; END IF;

  -- Existing owner approval authority applies once per line in a single transaction.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  v_batch := public.crear_bajas_multiple(
    jsonb_build_array(
      jsonb_build_object('almacen_id',v_store,'producto_id',v_product,'cantidad',1,'motivo','Rotura'),
      jsonb_build_object('almacen_id',v_store,'producto_id',v_product,'cantidad',2,'motivo','Consumo interno')
    ),
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid
  );
  IF (v_batch->>'count')::integer <> 2 OR EXISTS (
    SELECT 1 FROM public.bajas b
    WHERE b.id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(v_batch->'bajas'))
      AND (b.estado <> 'APROBADA' OR b.revisado_por <> v_owner)
  ) THEN RAISE EXCEPTION 'Owner batch rows were not approved by the authorized creator.'; END IF;

  v_batch_retry := public.crear_bajas_multiple(
    jsonb_build_array(
      jsonb_build_object('almacen_id',v_store,'producto_id',v_product,'cantidad',1,'motivo','Rotura'),
      jsonb_build_object('almacen_id',v_store,'producto_id',v_product,'cantidad',2,'motivo','Consumo interno')
    ),
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid
  );
  IF v_batch_retry <> v_batch THEN RAISE EXCEPTION 'Owner batch retry was not idempotent.'; END IF;
  SELECT cantidad INTO v_stock FROM public.stock WHERE almacen_id=v_store AND producto_id=v_product;
  SELECT COALESCE(sum(cantidad_restante),0) INTO v_fifo FROM public.lotes_compra WHERE almacen_id=v_store AND producto_id=v_product;
  IF v_stock <> 45 OR v_fifo <> 45 THEN RAISE EXCEPTION 'Approved batch did not decrease stock/FIFO by 3; stock %, FIFO %.',v_stock,v_fifo; END IF;

  IF NOT has_function_privilege('authenticated','public.crear_bajas_multiple(jsonb,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role cannot execute the batch Baja RPC.';
  END IF;
  IF has_function_privilege('anon','public.crear_bajas_multiple(jsonb,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role must not execute the batch Baja RPC.';
  END IF;

  -- An aggregate stock failure rolls back every line and creates no partial rows.
  SELECT count(*) INTO v_before_count FROM public.bajas;
  v_failed := false;
  BEGIN
    PERFORM public.crear_bajas_multiple(
      jsonb_build_array(jsonb_build_object('almacen_id',v_store,'producto_id',v_product,'cantidad',999,'motivo','Exceso')),
      'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid
    );
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  SELECT count(*) INTO v_batch_count FROM public.bajas;
  IF NOT v_failed OR v_batch_count <> v_before_count THEN
    RAISE EXCEPTION 'An overdrawn batch should fail atomically before creating records.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  UPDATE public.lotes_compra
  SET cantidad_restante = 0
  WHERE almacen_id = v_store AND producto_id = v_product;
  SELECT count(*) INTO v_before_count FROM public.bajas;
  v_failed := false;
  BEGIN
    PERFORM public.crear_baja(
      v_store, v_product, 1, 'Prueba FIFO insuficiente', NULL, NULL,
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'Expected the auto-approved Baja to fail when FIFO is insufficient.';
  END IF;

  SELECT s.cantidad INTO v_stock
  FROM public.stock s WHERE s.almacen_id = v_store AND s.producto_id = v_product;
  SELECT count(*) INTO v_visible FROM public.bajas;

  IF v_stock <> 45 OR v_visible <> v_before_count THEN
    RAISE EXCEPTION 'FIFO failure was not atomic; stock %, Baja rows before %, after %.',
      v_stock, v_before_count, v_visible;
  END IF;
END;
$contract$;

SELECT 'PASS: owner auto-approval, regular pending flow, queue permission, FIFO idempotency and rollback' AS result;
