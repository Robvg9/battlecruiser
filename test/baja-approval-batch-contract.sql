DO $batch_contract$
DECLARE
  v_owner uuid := '11111111-1111-4111-8111-111111111111';
  v_staff uuid := '22222222-2222-4222-8222-222222222222';
  v_store uuid := '33333333-3333-4333-8333-333333333333';
  v_product_a uuid := '88888888-8888-4888-8888-888888888888';
  v_product_b uuid := '99999999-9999-4999-8999-999999999999';
  v_history_product uuid := '77777777-7777-4777-8777-777777777777';
  v_history_request uuid;
  v_historical_reason text;
  v_request uuid;
  v_batch jsonb;
  v_retry jsonb;
  v_detail jsonb;
  v_line_a uuid;
  v_line_b uuid;
  v_second_product uuid;
  v_visible integer;
  v_count integer;
  v_failed boolean;
  v_stock_a numeric;
  v_stock_b numeric;
  v_fifo_a numeric;
  v_fifo_b numeric;
  v_stock_a_before numeric;
  v_stock_b_before numeric;
  v_fifo_a_before numeric;
  v_fifo_b_before numeric;
BEGIN
  -- Backfill may group only the two historical rows with the exact same
  -- creator, warehouse and timestamp. The row 1 ms apart must stay standalone.
  SELECT b.solicitud_id INTO v_history_request
  FROM public.bajas b
  WHERE b.producto_id=v_history_product
    AND b.creado_por=v_staff
    AND b.creado_en='2026-11-09T12:00:00Z'::timestamptz
  LIMIT 1;

  IF v_history_request IS NULL THEN
    RAISE EXCEPTION 'The exact-timestamp historical list was not reconstructed.';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.bajas b WHERE b.solicitud_id=v_history_request;
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Historical backfill should group exactly two rows; got %.',v_count;
  END IF;

  SELECT motivo_general INTO v_historical_reason
  FROM public.bajas_solicitudes WHERE id=v_history_request;
  IF v_historical_reason<>'Solicitud histórica agrupada; el motivo general no quedó registrado. Consulte los motivos individuales por producto.' THEN
    RAISE EXCEPTION 'Historical grouping must not invent a general reason from per-product motives.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bajas b
    WHERE b.producto_id=v_history_product
      AND b.creado_por=v_staff
      AND b.creado_en='2026-11-09T12:00:00.001Z'::timestamptz
      AND b.solicitud_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Historical rows with merely-nearby timestamps must not be grouped.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bajas b
    WHERE b.solicitud_id=v_history_request AND b.estado<>'APROBADA'
  ) THEN
    RAISE EXCEPTION 'Historical backfill changed an existing decision state.';
  END IF;
  SELECT s.cantidad INTO v_stock_a
  FROM public.stock s
  WHERE s.almacen_id=v_store AND s.producto_id=v_history_product;
  SELECT coalesce(sum(l.cantidad_restante),0) INTO v_fifo_a
  FROM public.lotes_compra l
  WHERE l.almacen_id=v_store AND l.producto_id=v_history_product;
  IF v_stock_a<>10 OR v_fifo_a<>10 THEN
    RAISE EXCEPTION 'Historical grouping must not modify stock/FIFO; stock %, FIFO %.',v_stock_a,v_fifo_a;
  END IF;

  INSERT INTO public.productos(id,nombre) VALUES
    (v_product_a,'Producto lote A'),
    (v_product_b,'Producto lote B');
  INSERT INTO public.stock(almacen_id,producto_id,cantidad) VALUES
    (v_store,v_product_a,20),
    (v_store,v_product_b,20);
  INSERT INTO public.lotes_compra(almacen_id,producto_id,fecha_compra,cantidad_restante) VALUES
    (v_store,v_product_a,'2026-11-09T08:00:00Z',20),
    (v_store,v_product_b,'2026-11-09T08:00:00Z',20);

  -- One submitted list becomes one parent approval with two child product lines.
  PERFORM set_config('request.jwt.claim.sub',v_staff::text,false);
  v_batch:=public.crear_bajas_multiple(
    jsonb_build_array(
      jsonb_build_object(
        'almacen_id',v_store,'producto_id',v_product_a,'cantidad',3,
        'motivo','Rotura','motivo_general','Retiro por control de calidad'
      ),
      jsonb_build_object(
        'almacen_id',v_store,'producto_id',v_product_b,'cantidad',4,
        'motivo','Vencimiento','motivo_general','Retiro por control de calidad'
      )
    ),
    'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001'::uuid
  );
  v_request:=(v_batch->>'solicitud_id')::uuid;
  IF v_request IS NULL OR (v_batch->>'count')::integer<>2
     OR jsonb_array_length(v_batch->'bajas')<>2 THEN
    RAISE EXCEPTION 'The multi-line submission did not return one request and both lines.';
  END IF;
  v_line_a:=(v_batch->'bajas'->0->>'id')::uuid;
  v_line_b:=(v_batch->'bajas'->1->>'id')::uuid;

  v_retry:=public.crear_bajas_multiple(
    jsonb_build_array(
      jsonb_build_object(
        'almacen_id',v_store,'producto_id',v_product_a,'cantidad',3,
        'motivo','Rotura','motivo_general','Retiro por control de calidad'
      ),
      jsonb_build_object(
        'almacen_id',v_store,'producto_id',v_product_b,'cantidad',4,
        'motivo','Vencimiento','motivo_general','Retiro por control de calidad'
      )
    ),
    'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001'::uuid
  );
  -- The same payload and key must return the original request and its original child rows.
  IF (v_retry->>'solicitud_id')::uuid<>v_request
     OR (v_retry->>'count')::integer<>2
     OR jsonb_array_length(v_retry->'bajas')<>2
     OR v_retry->'bajas' IS DISTINCT FROM v_batch->'bajas' THEN
    RAISE EXCEPTION 'An idempotent retry did not return the same grouped request, line IDs and order.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  SELECT count(*) INTO v_visible
  FROM public.listar_aprobaciones_admin() a
  WHERE a.tipo='baja_lista' AND a.id=v_request AND a.estado='PENDIENTE';
  IF v_visible<>1 THEN
    RAISE EXCEPTION 'The admin queue must show one grouped pending item; got %.',v_visible;
  END IF;
  SELECT count(*) INTO v_visible
  FROM public.listar_aprobaciones_admin() a
  WHERE a.tipo='baja' AND a.id IN (v_line_a,v_line_b);
  IF v_visible<>0 THEN
    RAISE EXCEPTION 'Grouped child lines must not appear as standalone approvals.';
  END IF;

  v_detail:=public.obtener_detalle_solicitud_baja_admin(v_request);
  IF jsonb_array_length(v_detail->'lineas')<>2
     OR v_detail->>'motivo_general'<>'Retiro por control de calidad'
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_detail->'lineas') line
       WHERE line->>'motivo'='Rotura'
     )
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_detail->'lineas') line
       WHERE line->>'motivo'='Vencimiento'
     ) THEN
    RAISE EXCEPTION 'Grouped detail did not preserve the general and per-product reasons.';
  END IF;

  -- Reject partial payloads and quantities larger than the requested amount.
  v_failed:=false;
  BEGIN
    PERFORM public.resolver_solicitud_bajas_admin(
      v_request,'APROBAR',NULL,
      jsonb_build_array(jsonb_build_object('id',v_line_a,'cantidad_real',2.5))
    );
  EXCEPTION WHEN OTHERS THEN v_failed:=true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Approval must reject a payload that omits a pending line.';
  END IF;

  v_failed:=false;
  BEGIN
    PERFORM public.resolver_solicitud_bajas_admin(
      v_request,'APROBAR',NULL,
      jsonb_build_array(
        jsonb_build_object('id',v_line_a,'cantidad_real',3.1),
        jsonb_build_object('id',v_line_b,'cantidad_real',3)
      )
    );
  EXCEPTION WHEN OTHERS THEN v_failed:=true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Approval must not allow a real quantity above the requested line quantity.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bajas b
    WHERE b.solicitud_id=v_request AND b.estado<>'PENDIENTE'
  ) THEN
    RAISE EXCEPTION 'Rejected invalid approval payloads changed child states.';
  END IF;

  -- A complete approval resolves every line through one parent RPC and FIFO transaction.
  PERFORM public.resolver_solicitud_bajas_admin(
    v_request,'APROBAR',NULL,
    jsonb_build_array(
      jsonb_build_object('id',v_line_a,'cantidad_real',2.5),
      jsonb_build_object('id',v_line_b,'cantidad_real',3.5)
    )
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.bajas_solicitudes s
    WHERE s.id=v_request AND s.estado='APROBADA'
      AND s.total_lineas=2 AND s.cantidad_total=6
  ) THEN
    RAISE EXCEPTION 'The parent request was not marked approved with its real total.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bajas b
    WHERE b.solicitud_id=v_request AND b.estado<>'APROBADA'
  ) THEN
    RAISE EXCEPTION 'Not every child line was approved.';
  END IF;
  SELECT cantidad INTO v_stock_a FROM public.stock WHERE almacen_id=v_store AND producto_id=v_product_a;
  SELECT cantidad INTO v_stock_b FROM public.stock WHERE almacen_id=v_store AND producto_id=v_product_b;
  SELECT coalesce(sum(cantidad_restante),0) INTO v_fifo_a FROM public.lotes_compra WHERE almacen_id=v_store AND producto_id=v_product_a;
  SELECT coalesce(sum(cantidad_restante),0) INTO v_fifo_b FROM public.lotes_compra WHERE almacen_id=v_store AND producto_id=v_product_b;
  IF v_stock_a<>17.5 OR v_stock_b<>16.5 OR v_fifo_a<>17.5 OR v_fifo_b<>16.5 THEN
    RAISE EXCEPTION 'Grouped approval did not apply each real amount to stock/FIFO.';
  END IF;

  -- Reject requires a reason and updates the entire list without changing inventory.
  PERFORM set_config('request.jwt.claim.sub',v_staff::text,false);
  v_batch:=public.crear_bajas_multiple(
    jsonb_build_array(
      jsonb_build_object('almacen_id',v_store,'producto_id',v_product_a,'cantidad',1,'motivo','Daño','motivo_general','Solicitud de descarte'),
      jsonb_build_object('almacen_id',v_store,'producto_id',v_product_b,'cantidad',1,'motivo','Pérdida','motivo_general','Solicitud de descarte')
    ),
    'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0002'::uuid
  );
  v_request:=(v_batch->>'solicitud_id')::uuid;
  v_line_a:=(v_batch->'bajas'->0->>'id')::uuid;
  v_line_b:=(v_batch->'bajas'->1->>'id')::uuid;

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  v_failed:=false;
  BEGIN
    PERFORM public.resolver_solicitud_bajas_admin(v_request,'RECHAZAR',NULL,'[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_failed:=true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Rejecting a list without a comment must fail.';
  END IF;
  SELECT cantidad INTO v_stock_a FROM public.stock WHERE almacen_id=v_store AND producto_id=v_product_a;
  SELECT cantidad INTO v_stock_b FROM public.stock WHERE almacen_id=v_store AND producto_id=v_product_b;
  PERFORM public.resolver_solicitud_bajas_admin(
    v_request,'RECHAZAR','Motivo administrativo documentado','[]'::jsonb
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.bajas_solicitudes s WHERE s.id=v_request AND s.estado='RECHAZADA'
  ) OR EXISTS (
    SELECT 1 FROM public.bajas b WHERE b.solicitud_id=v_request AND b.estado<>'RECHAZADA'
  ) THEN
    RAISE EXCEPTION 'Rejection did not resolve the complete request.';
  END IF;
  IF (SELECT cantidad FROM public.stock WHERE almacen_id=v_store AND producto_id=v_product_a)<>v_stock_a
     OR (SELECT cantidad FROM public.stock WHERE almacen_id=v_store AND producto_id=v_product_b)<>v_stock_b THEN
    RAISE EXCEPTION 'Rejecting the request changed stock.';
  END IF;

  -- Force the second child (in the resolver's deterministic lock order) to
  -- lack FIFO. The first child will be processed before the second fails;
  -- the parent RPC must roll back all stock, FIFO and status mutations.
  PERFORM set_config('request.jwt.claim.sub',v_staff::text,false);
  v_batch:=public.crear_bajas_multiple(
    jsonb_build_array(
      jsonb_build_object('almacen_id',v_store,'producto_id',v_product_a,'cantidad',1,'motivo','Rotura','motivo_general','Prueba de atomicidad'),
      jsonb_build_object('almacen_id',v_store,'producto_id',v_product_b,'cantidad',1,'motivo','Rotura','motivo_general','Prueba de atomicidad')
    ),
    'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0003'::uuid
  );
  v_request:=(v_batch->>'solicitud_id')::uuid;
  SELECT b.producto_id INTO v_second_product
  FROM public.bajas b
  WHERE b.solicitud_id=v_request
  ORDER BY b.creado_en,b.id
  OFFSET 1 LIMIT 1;
  UPDATE public.lotes_compra
  SET cantidad_restante=0
  WHERE almacen_id=v_store AND producto_id=v_second_product;

  SELECT cantidad INTO v_stock_a FROM public.stock WHERE almacen_id=v_store AND producto_id=v_product_a;
  SELECT cantidad INTO v_stock_b FROM public.stock WHERE almacen_id=v_store AND producto_id=v_product_b;
  SELECT coalesce(sum(cantidad_restante),0) INTO v_fifo_a FROM public.lotes_compra WHERE almacen_id=v_store AND producto_id=v_product_a;
  SELECT coalesce(sum(cantidad_restante),0) INTO v_fifo_b FROM public.lotes_compra WHERE almacen_id=v_store AND producto_id=v_product_b;
  v_stock_a_before:=v_stock_a;v_stock_b_before:=v_stock_b;
  v_fifo_a_before:=v_fifo_a;v_fifo_b_before:=v_fifo_b;

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  v_failed:=false;
  BEGIN
    PERFORM public.resolver_solicitud_bajas_admin(
      v_request,'APROBAR',NULL,
      (SELECT jsonb_agg(jsonb_build_object('id',b.id,'cantidad_real',1))
       FROM public.bajas b WHERE b.solicitud_id=v_request)
    );
  EXCEPTION WHEN OTHERS THEN v_failed:=true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Grouped approval should fail when one line has insufficient FIFO.';
  END IF;
  SELECT cantidad INTO v_stock_a FROM public.stock WHERE almacen_id=v_store AND producto_id=v_product_a;
  SELECT cantidad INTO v_stock_b FROM public.stock WHERE almacen_id=v_store AND producto_id=v_product_b;
  SELECT coalesce(sum(cantidad_restante),0) INTO v_fifo_a FROM public.lotes_compra WHERE almacen_id=v_store AND producto_id=v_product_a;
  SELECT coalesce(sum(cantidad_restante),0) INTO v_fifo_b FROM public.lotes_compra WHERE almacen_id=v_store AND producto_id=v_product_b;
  IF v_stock_a<>v_stock_a_before OR v_stock_b<>v_stock_b_before
     OR v_fifo_a<>v_fifo_a_before OR v_fifo_b<>v_fifo_b_before
     OR EXISTS (SELECT 1 FROM public.bajas WHERE solicitud_id=v_request AND estado<>'PENDIENTE')
     OR NOT EXISTS (SELECT 1 FROM public.bajas_solicitudes WHERE id=v_request AND estado='PENDIENTE') THEN
    RAISE EXCEPTION 'Grouped approval failure did not roll back the entire list.';
  END IF;

  PERFORM public.resolver_solicitud_bajas_admin(
    v_request,'RECHAZAR','La prueba de FIFO no autoriza la solicitud','[]'::jsonb
  );

  IF NOT has_function_privilege(
       'authenticated','public.obtener_detalle_solicitud_baja_admin(uuid)','EXECUTE'
     )
     OR has_function_privilege(
       'anon','public.obtener_detalle_solicitud_baja_admin(uuid)','EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated','public.resolver_solicitud_bajas_admin(uuid,text,text,jsonb)','EXECUTE'
     )
     OR has_function_privilege(
       'anon','public.resolver_solicitud_bajas_admin(uuid,text,text,jsonb)','EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Grouped detail/resolution RPC permissions are not restricted as intended.';
  END IF;
  IF has_table_privilege('authenticated','public.bajas_solicitudes','SELECT')
     OR has_table_privilege('anon','public.bajas_solicitudes','SELECT')
     OR NOT (SELECT c.relrowsecurity FROM pg_class c
             JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='bajas_solicitudes') THEN
    RAISE EXCEPTION 'The grouped request table must remain RLS-protected and inaccessible directly.';
  END IF;
END;
$batch_contract$;

SELECT 'PASS: one request per list, exact legacy backfill, details, full-line decisions, bounded quantities, atomic FIFO rollback and RPC ACLs' AS result;
