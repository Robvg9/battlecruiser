\set ON_ERROR_STOP on
-- These assertions run after the existing Step 7 contract has completed Day 1.
-- All records are inside the disposable PostgreSQL 17 database.

DO $finance$
DECLARE
  v_turno uuid := '90000000-0000-0000-0000-000000000007';
  v_day1 uuid := '91000000-0000-0000-0000-000000000007';
  v_prog1 uuid := '92000000-0000-0000-0000-000000000007';
  v_owner uuid := '20000000-0000-0000-0000-000000000001';
  v_worker uuid := '20000000-0000-0000-0000-000000000002';
  v_almacen uuid := '10000000-0000-0000-0000-000000000001';
  v_pan uuid := '31000000-0000-0000-0000-000000000001';
  v_jugo uuid := '31000000-0000-0000-0000-000000000002';
  v_day2 uuid := '91000000-0000-0000-0000-000000000008';
  v_prog2 uuid := '92000000-0000-0000-0000-000000000008';
  v_fecha_hoy date := (now() AT TIME ZONE 'America/Havana')::date;
  v_final_id uuid;
  v_initial_id uuid;
  v_tramo uuid;
  v_declaration_id uuid;
  v_cash_data jsonb;
  v_sale uuid;
  v_sale_retry uuid;
  v_sales_data jsonb;
  v_expense uuid;
  v_expense_retry uuid;
  v_reinvestment uuid;
  v_reinvestment_retry uuid;
  v_result jsonb;
  v_before_pan numeric;
  v_before_jugo numeric;
  v_count integer;
  v_error boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','gastos:crear,reinversiones:crear,gastos:ver,reinversiones:ver,ventas:crear,ventas:ver,turnos:ver',false);

  -- Day 1 has already been physically counted and closed by step7-jornada-contract.sql.
  -- Move only the disposable fixture's historical date back one day, then create today's Day 2.
  SELECT id INTO v_final_id
  FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_day1 AND tipo='FINAL' AND estado='CONFIRMADO';
  IF v_final_id IS NULL THEN RAISE EXCEPTION 'FAIL: Day 1 final snapshot is missing'; END IF;

  UPDATE public.turnos SET dias_turno=2 WHERE id=v_turno;
  UPDATE public.turno_jornada_programacion SET fecha=v_fecha_hoy-1 WHERE id=v_prog1;
  UPDATE public.turno_sesiones SET fecha=v_fecha_hoy-1 WHERE id=v_day1;

  INSERT INTO public.turno_jornada_programacion(
    id,turno_id,almacen_id,numero_dia,fecha,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,creado_por,actualizado_por
  ) VALUES(
    v_prog2,v_turno,v_almacen,2,v_fecha_hoy,true,v_owner,
    '07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner
  );
  INSERT INTO public.turno_sesiones(
    id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id
  ) VALUES(v_day2,v_turno,v_almacen,2,'JORNADA',v_fecha_hoy,'PROGRAMADA',v_prog2);
  INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
  VALUES(v_day2,v_turno,v_owner,v_owner);

  -- The previous confirmed FINAL is displayed as an editable reference only.
  v_result:=public.bc7_obtener_inventario_jornada(v_day2);
  IF v_result->'apertura_previa'->>'corte_id' IS DISTINCT FROM v_final_id::text THEN
    RAISE EXCEPTION 'FAIL: Day 2 did not read Day 1 confirmed FINAL as its opening reference';
  END IF;
  IF (SELECT (x->>'cantidad_contada')::numeric
      FROM jsonb_array_elements(v_result->'apertura_previa'->'lineas') x
      WHERE x->>'producto_id'=v_pan::text)<>8 THEN
    RAISE EXCEPTION 'FAIL: previous physical count was not returned for the matching product';
  END IF;

  SELECT cantidad INTO v_before_pan FROM public.stock WHERE producto_id=v_pan AND almacen_id=v_almacen;
  SELECT cantidad INTO v_before_jugo FROM public.stock WHERE producto_id=v_jugo AND almacen_id=v_almacen;

  -- A fresh physical count is required; it creates a new immutable INITIAL with a source link.
  v_result:=public.bc7_guardar_inventario_jornada(v_day2,'INICIAL',
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',7.5),
      jsonb_build_object('producto_id',v_jugo,'cantidad',4.25)
    ),'Day 2 physical recount fixture');
  v_initial_id:=(v_result->>'id')::uuid;
  IF v_result->>'estado'<>'CONFIRMADO' THEN RAISE EXCEPTION 'FAIL: Day 2 initial count not confirmed'; END IF;
  IF (SELECT origen_corte_id FROM public.turno_jornada_inventario_cortes WHERE id=v_initial_id) IS DISTINCT FROM v_final_id THEN
    RAISE EXCEPTION 'FAIL: Day 2 INITIAL did not preserve the previous FINAL provenance link';
  END IF;
  IF (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas WHERE corte_id=v_initial_id AND producto_id=v_pan)<>7.5 THEN
    RAISE EXCEPTION 'FAIL: Day 2 count did not preserve the fresh physical quantity';
  END IF;
  IF (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas l
      JOIN public.turno_jornada_inventario_cortes c ON c.id=l.corte_id
      WHERE c.id=v_final_id AND l.producto_id=v_pan)<>8 THEN
    RAISE EXCEPTION 'FAIL: carry-forward modified Day 1 immutable FINAL';
  END IF;
  IF (SELECT cantidad FROM public.stock WHERE producto_id=v_pan AND almacen_id=v_almacen)<>v_before_pan
     OR (SELECT cantidad FROM public.stock WHERE producto_id=v_jugo AND almacen_id=v_almacen)<>v_before_jugo THEN
    RAISE EXCEPTION 'FAIL: confirming or carrying forward an inventory cut changed stock';
  END IF;

  PERFORM public.bc5_iniciar_jornada(v_day2,'PostgreSQL fixture start-time exception');
  SELECT id INTO v_tramo FROM public.turno_tramos
  WHERE turno_sesion_id=v_day2 AND estado='ACTIVO' AND usuario_id=v_owner;
  IF v_tramo IS NULL THEN RAISE EXCEPTION 'FAIL: Day 2 did not open an active owner tranche'; END IF;

  -- Exercise the exact cash read model used by the owner/responsible Jornada workspace.
  -- The declaration and owner count are fixture-only; no production cash rows are touched.
  SELECT (public.bc_declarar_dinero(v_tramo,100::numeric)).id INTO v_declaration_id;
  UPDATE public.turno_declaraciones
  SET monto_contado=90,
      contado_por=v_owner,
      contado_at=now(),
      observacion_conteo='Owner count fixture',
      diferencia=-10,
      estado_aprobacion='CON_DIFERENCIA'
  WHERE id=v_declaration_id;
  v_cash_data:=public.bc7_obtener_inventario_jornada(v_day2);
  IF v_cash_data->'declaracion_dinero'->>'id' IS DISTINCT FROM v_declaration_id::text
     OR (v_cash_data->'declaracion_dinero'->>'monto')::numeric<>100
     OR (v_cash_data->'declaracion_dinero'->>'monto_contado')::numeric<>90
     OR (v_cash_data->'declaracion_dinero'->>'diferencia')::numeric<>-10
     OR v_cash_data->'declaracion_dinero'->>'estado_aprobacion'<>'CON_DIFERENCIA'
     OR (v_cash_data->'declaracion_dinero'->>'contado_por')::uuid IS DISTINCT FROM v_owner
     OR v_cash_data->'declaracion_dinero'->>'observacion_conteo'<>'Owner count fixture'
     OR v_cash_data->'declaracion_dinero'->>'contado_at' IS NULL THEN
    RAISE EXCEPTION 'FAIL: Jornada inventory readback omitted owner counted cash, difference or count metadata';
  END IF;

  -- New Jornada POS sales persist the exact active session/tranche and payment method.
  -- The same external idempotency key must never duplicate a sale or change its attribution.
  v_sale:=public.bc7_registrar_venta_jornada(
    v_almacen,
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_pan,'cantidad',2,'presentacion_id',NULL,
      'cantidad_presentacion',NULL,'tipo_precio','normal'
    )),
    v_day2,v_tramo,'EFECTIVO',
    '95000000-0000-0000-0000-000000000003'
  );
  v_sale_retry:=public.bc7_registrar_venta_jornada(
    v_almacen,
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_pan,'cantidad',2,'presentacion_id',NULL,
      'cantidad_presentacion',NULL,'tipo_precio','normal'
    )),
    v_day2,v_tramo,'EFECTIVO',
    '95000000-0000-0000-0000-000000000003'
  );
  IF v_sale IS DISTINCT FROM v_sale_retry THEN
    RAISE EXCEPTION 'FAIL: repeated Jornada sale returned a different ID';
  END IF;
  IF (SELECT count(*) FROM public.ventas
      WHERE creado_por=v_owner AND idempotency_key='95000000-0000-0000-0000-000000000003')<>1 THEN
    RAISE EXCEPTION 'FAIL: retry duplicated a Jornada sale';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ventas
    WHERE id=v_sale AND turno_sesion_id=v_day2 AND turno_tramo_id=v_tramo
      AND metodo_pago='EFECTIVO' AND idempotency_payload_hash IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL: sale lost exact Jornada/tranche/payment provenance';
  END IF;
  v_error:=false;
  BEGIN
    PERFORM public.bc7_registrar_venta_jornada(
      v_almacen,
      jsonb_build_array(jsonb_build_object(
        'producto_id',v_pan,'cantidad',2,'presentacion_id',NULL,
        'cantidad_presentacion',NULL,'tipo_precio','normal'
      )),
      v_day2,v_tramo,'TRANSFERENCIA',
      '95000000-0000-0000-0000-000000000003'
    );
  EXCEPTION WHEN unique_violation THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: sale idempotency key allowed a payment-method change'; END IF;
  v_sales_data:=public.bc7_ventas_jornada(v_day2);
  IF jsonb_array_length(v_sales_data->'ventas')<>1
     OR (v_sales_data->'resumen'->>'cantidad')::integer<>1
     OR (v_sales_data->'resumen'->>'efectivo')::numeric<>20
     OR (v_sales_data->'resumen'->>'transferencia')::numeric<>0 THEN
    RAISE EXCEPTION 'FAIL: Jornada sales ledger did not return session-scoped totals by payment method';
  END IF;

  -- Expense is linked only to turno_sesiones/turno_tramos; legacy FK stays NULL.
  v_expense:=public.bc7_registrar_gasto_jornada(
    v_day2,'Agua para el local',20,'Compra operativa fixture',
    '95000000-0000-0000-0000-000000000001'
  );
  v_expense_retry:=public.bc7_registrar_gasto_jornada(
    v_day2,'Agua para el local',20,'Retry fixture',
    '95000000-0000-0000-0000-000000000001'
  );
  IF v_expense IS DISTINCT FROM v_expense_retry THEN
    RAISE EXCEPTION 'FAIL: gasto retry did not return the original ID';
  END IF;
  SELECT count(*) INTO v_count FROM public.gastos
  WHERE creado_por=v_owner AND idempotency_key='95000000-0000-0000-0000-000000000001';
  IF v_count<>1 THEN RAISE EXCEPTION 'FAIL: duplicate expense was created for one idempotency key'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.gastos
    WHERE id=v_expense AND estado='PENDIENTE'
      AND turno_sesion_id=v_day2 AND turno_tramo_id=v_tramo
      AND sesion_id IS NULL AND ciclo_id IS NULL AND almacen_id=v_almacen
  ) THEN
    RAISE EXCEPTION 'FAIL: expense is not pending or carries incorrect jornada/legacy provenance';
  END IF;

  -- Reinvestment reuses the established stock/FIFO/cash function and retains provider + master turn.
  v_reinvestment:=public.bc7_registrar_reinversion_jornada(
    v_day2,
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_pan,'presentacion_id',NULL,'cantidad_presentacion',NULL,
      'cantidad_base',2,'costo_total',10
    )),
    '95000000-0000-0000-0000-000000000002',
    'Proveedor de prueba'
  );
  v_reinvestment_retry:=public.bc7_registrar_reinversion_jornada(
    v_day2,
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_pan,'presentacion_id',NULL,'cantidad_presentacion',NULL,
      'cantidad_base',2,'costo_total',10
    )),
    '95000000-0000-0000-0000-000000000002',
    'Proveedor de prueba'
  );
  IF v_reinvestment IS DISTINCT FROM v_reinvestment_retry THEN
    RAISE EXCEPTION 'FAIL: reinvestment retry did not return the original ID';
  END IF;
  SELECT count(*) INTO v_count FROM public.reinversiones
  WHERE usuario_id=v_owner AND idempotency_key='95000000-0000-0000-0000-000000000002';
  IF v_count<>1 THEN RAISE EXCEPTION 'FAIL: duplicate reinvestment was created for one idempotency key'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.reinversiones
    WHERE id=v_reinvestment AND proveedor='Proveedor de prueba'
      AND turno_id=v_turno AND turno_sesion_id=v_day2 AND turno_tramo_id=v_tramo
      AND sesion_id IS NULL AND ciclo_id IS NULL AND almacen_id=v_almacen
  ) THEN
    RAISE EXCEPTION 'FAIL: reinvestment lost provider or correct session/tranche/master provenance';
  END IF;
  IF (SELECT count(*) FROM public.reinversiones_lineas WHERE reinversion_id=v_reinvestment)<>1 THEN
    RAISE EXCEPTION 'FAIL: reinvestment detail line not persisted';
  END IF;
  IF (SELECT cantidad FROM public.stock WHERE producto_id=v_pan AND almacen_id=v_almacen)<>v_before_pan+2 THEN
    RAISE EXCEPTION 'FAIL: reinvestment did not add stock exactly once';
  END IF;
  IF (SELECT count(*) FROM public.lotes_compra WHERE usuario_id=v_owner AND origen='reinversion')<>1 THEN
    RAISE EXCEPTION 'FAIL: FIFO purchase lot was not created exactly once';
  END IF;
  IF (SELECT count(*) FROM public.movimientos_caja_fixture WHERE referencia_id=v_reinvestment)<>1 THEN
    RAISE EXCEPTION 'FAIL: cash ledger integration did not create exactly one movement';
  END IF;

  -- The assigned worker still needs turnos.ver to read or save Jornada inventory.
  -- Financial create grants alone must not expose inventory snapshots or bypass the gate.
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','gastos:crear,reinversiones:crear,gastos:ver,reinversiones:ver',false);
  v_error:=false;
  BEGIN
    PERFORM public.bc7_obtener_inventario_jornada(v_day2);
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: assigned user read Jornada inventory without turnos.ver'; END IF;
  v_error:=false;
  BEGIN
    PERFORM public.bc7_guardar_inventario_jornada(v_day2,'INICIAL',
      jsonb_build_array(
        jsonb_build_object('producto_id',v_pan,'cantidad',7.5),
        jsonb_build_object('producto_id',v_jugo,'cantidad',4.25)
      ),'Permission rejection fixture');
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: assigned user saved Jornada inventory without turnos.ver'; END IF;

  -- The assigned responsible can inspect the full financial and adjustment ledger
  -- for this one jornada with turnos.ver. No global finance .ver grants are required.
  PERFORM set_config('test.perms','turnos:ver,ventas:ver',false);
  v_sales_data:=public.bc7_ventas_jornada(v_day2);
  IF jsonb_array_length(v_sales_data->'ventas')<>1
     OR (v_sales_data->'resumen'->>'efectivo')::numeric<>20 THEN
    RAISE EXCEPTION 'FAIL: currently assigned responsible cannot read their own payment-channel sales ledger';
  END IF;
  v_result:=public.bc7_finanzas_jornada(v_day2);
  IF jsonb_array_length(v_result->'gastos')<>1 OR jsonb_array_length(v_result->'reinversiones')<>1 THEN
    RAISE EXCEPTION 'FAIL: assigned responsible cannot read the complete own-session finance ledger';
  END IF;
  IF jsonb_typeof(v_result->'mermas') IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_result->'bajas') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'FAIL: own-session adjustment sections are missing from the finance ledger';
  END IF;

  -- An unrelated authenticated user cannot read or write this jornada by calling RPCs directly.
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.perms','turnos:ver,ventas:crear,ventas:ver,gastos:crear,gastos:ver,reinversiones:crear,reinversiones:ver',false);
  v_error:=false;
  BEGIN
    PERFORM public.bc7_finanzas_jornada(v_day2);
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: unrelated user read another worker finance'; END IF;
  v_error:=false;
  BEGIN
    PERFORM public.bc7_registrar_gasto_jornada(
      v_day2,'Gasto no asignado',10,NULL,'97000000-0000-0000-0000-000000000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: unassigned authenticated user wrote a gasto through the RPC'; END IF;
  v_error:=false;
  BEGIN
    PERFORM public.bc7_registrar_reinversion_jornada(
      v_day2,jsonb_build_array(jsonb_build_object(
        'producto_id',v_pan,'presentacion_id',NULL,'cantidad_presentacion',NULL,
        'cantidad_base',1,'costo_total',5
      )),'97000000-0000-0000-0000-000000000002','No autorizado'
    );
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: unassigned authenticated user wrote a reinvestment through the RPC'; END IF;
  v_error:=false;
  BEGIN
    PERFORM public.bc7_registrar_venta_jornada(
      v_almacen,
      jsonb_build_array(jsonb_build_object(
        'producto_id',v_pan,'cantidad',1,'presentacion_id',NULL,
        'cantidad_presentacion',NULL,'tipo_precio','normal'
      )),
      v_day2,v_tramo,'EFECTIVO',
      '97000000-0000-0000-0000-000000000003'
    );
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: unrelated authenticated user registered a sale for another responsible'; END IF;
  v_error:=false;
  BEGIN
    PERFORM public.bc7_ventas_jornada(v_day2);
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: unrelated authenticated user read another responsible sales ledger'; END IF;

  IF has_function_privilege('anon','public.bc7_registrar_gasto_jornada(uuid,text,numeric,text,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_registrar_reinversion_jornada(uuid,jsonb,uuid,text)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_finanzas_jornada(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_registrar_venta_jornada(uuid,jsonb,uuid,uuid,text,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_ventas_jornada(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon has execute privilege on a protected Jornada finance RPC';
  END IF;
  IF NOT has_function_privilege('authenticated','public.bc7_registrar_gasto_jornada(uuid,text,numeric,text,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_registrar_reinversion_jornada(uuid,jsonb,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_finanzas_jornada(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_registrar_venta_jornada(uuid,jsonb,uuid,uuid,text,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_ventas_jornada(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated is missing an intended Jornada finance RPC grant';
  END IF;

  IF has_table_privilege('authenticated','public.gastos','SELECT')
     OR has_table_privilege('authenticated','public.gastos','INSERT')
     OR has_table_privilege('authenticated','public.reinversiones','SELECT')
     OR has_table_privilege('authenticated','public.reinversiones','INSERT')
     OR has_table_privilege('authenticated','public.reinversiones_lineas','SELECT') THEN
    RAISE EXCEPTION 'FAIL: authenticated can bypass the finance RPCs through direct table access';
  END IF;
  IF has_function_privilege('anon','public.bc7_registrar_gasto_jornada(uuid,text,numeric,text,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_registrar_reinversion_jornada(uuid,jsonb,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_registrar_gasto_jornada(uuid,text,numeric,text,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_registrar_reinversion_jornada(uuid,jsonb,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: finance RPC ACL grants do not match authenticated-only policy';
  END IF;

  RAISE NOTICE 'PASS Step 7 Finance + Carry-forward + Jornada sales: idempotent expense/reinvestment/sale, provider, stock/FIFO/cash, payment-method provenance, assigned-session scoped reads and immutable previous-day provenance';
END
$finance$;
