-- Runtime contract for optional mixed inventory; executes only in disposable PostgreSQL CI.
DO $$
DECLARE
  v_user uuid := '11111111-1111-4111-8111-111111111111';
  v_warehouse_a uuid := '22222222-2222-4222-8222-222222222222';
  v_warehouse_b uuid := '33333333-3333-4333-8333-333333333333';
  v_warehouse_c uuid := '44444444-4444-4444-8444-444444444444';
  v_parent uuid;
  v_apple uuid;
  v_pear uuid;
  v_child uuid;
  v_result jsonb;
  v_qty numeric;
  v_names text[];
  v_variantes jsonb;
  v_count integer;
  v_failed boolean;
  v_message text;
  v_conversion_parent uuid;
  v_conversion_apple uuid;
  v_conversion_pear uuid;
  v_conversion_lot_1 uuid;
  v_conversion_lot_2 uuid;
  v_history jsonb;
  v_history_remaining numeric;
  v_inventory_minimum numeric;
  v_total_fifo_value numeric;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',v_user::text,false);
  INSERT INTO public.almacenes(id,nombre) VALUES
    (v_warehouse_a,'Almacén A'),(v_warehouse_b,'Almacén B');
  INSERT INTO public.presentaciones(nombre) VALUES ('Caja');
  INSERT INTO public.productos(nombre,unidad,precio_normal,activo,presentacion_id)
    VALUES ('Refresco de lata','cajas',10,true,(SELECT id FROM public.presentaciones WHERE nombre='Caja'))
    RETURNING id INTO v_parent;
  INSERT INTO public.producto_presentaciones(producto_id,presentacion_id,factor)
    SELECT v_parent,id,24 FROM public.presentaciones WHERE nombre='Caja';
  INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
    VALUES(v_parent,v_warehouse_a,0,7);

  v_result:=public.configurar_producto_inventario_mixto(v_parent,true,
    '[{"nombre":"Manzana"},{"nombre":"Pera"}]'::jsonb);
  IF NOT (SELECT inventario_mixto FROM public.productos WHERE id=v_parent) THEN
    RAISE EXCEPTION 'Mixed mode was not enabled on the selected parent';
  END IF;
  SELECT id INTO v_apple FROM public.productos WHERE producto_padre_id=v_parent AND variante_nombre='Manzana';
  SELECT id INTO v_pear FROM public.productos WHERE producto_padre_id=v_parent AND variante_nombre='Pera';
  IF v_apple IS NULL OR v_pear IS NULL OR v_apple=v_pear THEN
    RAISE EXCEPTION 'Admin-defined flavors did not receive unique product identities';
  END IF;
  IF (SELECT count(*) FROM public.producto_presentaciones WHERE producto_id IN (v_apple,v_pear) AND activo)=0 THEN
    RAISE EXCEPTION 'Parent presentation conversions were not copied to the variants';
  END IF;
  IF (SELECT count(*) FROM public.stock WHERE producto_id IN (v_apple,v_pear))
     <> 2*(SELECT count(*) FROM public.almacenes WHERE activo=true) THEN
    RAISE EXCEPTION 'Every active flavor must have one stock row per existing warehouse';
  END IF;

  -- Positive inventory writes are forbidden until each SKU/warehouse minimum is set.
  v_failed:=false;
  BEGIN
    UPDATE public.stock SET cantidad=1 WHERE producto_id=v_apple AND almacen_id=v_warehouse_a;
  EXCEPTION WHEN check_violation THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Stock movement accepted without a positive flavor minimum'; END IF;

  -- The required-minimum migration must safely normalize historical NULLs.
  IF EXISTS (
    SELECT 1 FROM public.stock
    WHERE producto_id='66666666-6666-4666-8666-666666666666'
      AND almacen_id='55555555-5555-4555-8555-555555555555'
      AND minimo IS DISTINCT FROM 0
  ) THEN
    RAISE EXCEPTION 'Legacy NULL minimum was not backfilled to zero';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stock' AND column_name='minimo'
      AND (is_nullable<>'NO' OR column_default IS NULL)
  ) THEN
    RAISE EXCEPTION 'Stock minimum column must be NOT NULL and have a safe default';
  END IF;

  -- A normal product must have an explicitly entered positive minimum per warehouse.
  v_failed:=false;
  BEGIN
    UPDATE public.stock SET cantidad=6
    WHERE producto_id='66666666-6666-4666-8666-666666666666'
      AND almacen_id='55555555-5555-4555-8555-555555555555';
  EXCEPTION WHEN check_violation THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Normal product stock increase accepted without a positive minimum'; END IF;

  -- Existing stock can still be sold or written off while its minimum is being configured.
  UPDATE public.stock SET cantidad=4
  WHERE producto_id='66666666-6666-4666-8666-666666666666'
    AND almacen_id='55555555-5555-4555-8555-555555555555';
  IF (SELECT cantidad FROM public.stock
      WHERE producto_id='66666666-6666-4666-8666-666666666666'
        AND almacen_id='55555555-5555-4555-8555-555555555555')<>4 THEN
    RAISE EXCEPTION 'Legacy stock decrease was blocked while minimum was pending';
  END IF;

  v_failed:=false;
  BEGIN
    UPDATE public.stock SET almacen_id=v_warehouse_a
    WHERE producto_id='66666666-6666-4666-8666-666666666666'
      AND almacen_id='55555555-5555-4555-8555-555555555555';
  EXCEPTION WHEN check_violation THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Positive stock was reassigned to another warehouse without a minimum'; END IF;

  PERFORM public.bc_actualizar_stock_minimo_obligatorio(
    '66666666-6666-4666-8666-666666666666',
    '55555555-5555-4555-8555-555555555555',5
  );
  IF (SELECT minimo FROM public.stock
      WHERE producto_id='66666666-6666-4666-8666-666666666666'
        AND almacen_id='55555555-5555-4555-8555-555555555555')<>5 THEN
    RAISE EXCEPTION 'The required normal-product warehouse minimum was not saved';
  END IF;
  UPDATE public.stock SET cantidad=5
  WHERE producto_id='66666666-6666-4666-8666-666666666666'
    AND almacen_id='55555555-5555-4555-8555-555555555555';
  v_failed:=false;
  BEGIN
    PERFORM public.bc_actualizar_stock_minimo_obligatorio(
      '66666666-6666-4666-8666-666666666666',
      '55555555-5555-4555-8555-555555555555',0
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Normal product minimum accepted zero'; END IF;
  v_failed:=false;
  BEGIN
    PERFORM public.bc_actualizar_stock_minimo_obligatorio(
      '66666666-6666-4666-8666-666666666666',v_warehouse_a,'NaN'::numeric
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Normal product minimum accepted NaN'; END IF;

  -- Legacy RPC/direct update paths must not clear an already configured minimum
  -- while positive stock remains; stock decreases still remain permitted.
  v_failed:=false;
  BEGIN
    UPDATE public.stock SET minimo=0
    WHERE producto_id='66666666-6666-4666-8666-666666666666'
      AND almacen_id='55555555-5555-4555-8555-555555555555';
  EXCEPTION WHEN check_violation THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Configured minimum was cleared while positive stock remained'; END IF;
  IF (SELECT minimo FROM public.stock
      WHERE producto_id='66666666-6666-4666-8666-666666666666'
        AND almacen_id='55555555-5555-4555-8555-555555555555')<>5 THEN
    RAISE EXCEPTION 'Legacy minimum-clear attempt changed the configured threshold';
  END IF;
  v_failed:=false;
  BEGIN
    UPDATE public.stock SET minimo='NaN'::numeric
    WHERE producto_id='66666666-6666-4666-8666-666666666666'
      AND almacen_id='55555555-5555-4555-8555-555555555555';
  EXCEPTION WHEN check_violation THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'A non-finite minimum was stored on positive stock'; END IF;

  -- A not-yet-assigned warehouse can be explicitly assigned at zero stock,
  -- but only together with its own positive minimum.
  IF EXISTS(SELECT 1 FROM public.stock
    WHERE producto_id='66666666-6666-4666-8666-666666666666'
      AND almacen_id=v_warehouse_b) THEN
    RAISE EXCEPTION 'Fixture unexpectedly has a stock assignment in warehouse B';
  END IF;
  PERFORM public.bc_actualizar_stock_minimo_obligatorio(
    '66666666-6666-4666-8666-666666666666',v_warehouse_b,2
  );
  IF NOT EXISTS(SELECT 1 FROM public.stock
    WHERE producto_id='66666666-6666-4666-8666-666666666666'
      AND almacen_id=v_warehouse_b AND cantidad=0 AND minimo=2) THEN
    RAISE EXCEPTION 'Minimum setup did not create the zero-stock warehouse assignment';
  END IF;
  UPDATE public.stock SET cantidad=2
  WHERE producto_id='66666666-6666-4666-8666-666666666666'
    AND almacen_id=v_warehouse_b;
  IF NOT EXISTS(SELECT 1 FROM public.stock
    WHERE producto_id='66666666-6666-4666-8666-666666666666'
      AND almacen_id=v_warehouse_b AND cantidad=2 AND minimo=2) THEN
    RAISE EXCEPTION 'Stock could not be received after configuring the destination minimum';
  END IF;

  -- Before configuration, each flavor is surfaced as requiring a minimum.
  SELECT variantes INTO v_variantes
  FROM public.inventario_mixto_enriquecido(v_warehouse_a)
  WHERE producto_id=v_parent;
  IF NOT (v_variantes @> jsonb_build_array(jsonb_build_object('producto_id',v_apple,'minimo',0,'estado','sin_minimo')))
     OR NOT (v_variantes @> jsonb_build_array(jsonb_build_object('producto_id',v_pear,'minimo',0,'estado','sin_minimo'))) THEN
    RAISE EXCEPTION 'Unconfigured flavor minimums were not reported as pending: %',v_variantes;
  END IF;

  -- Each flavor receives its own minimum, independently for each warehouse.
  v_failed:=false;
  BEGIN
    PERFORM public.bc_actualizar_stock_minimo_variante(v_apple,v_warehouse_a,0);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Flavor minimum accepted zero'; END IF;

  PERFORM public.bc_actualizar_stock_minimo_variante(v_apple,v_warehouse_a,25);
  PERFORM public.bc_actualizar_stock_minimo_variante(v_pear,v_warehouse_a,12);
  PERFORM public.bc_actualizar_stock_minimo_variante(v_apple,v_warehouse_b,3);
  UPDATE public.stock SET cantidad=20 WHERE producto_id=v_apple AND almacen_id=v_warehouse_a;
  UPDATE public.stock SET cantidad=10 WHERE producto_id=v_pear AND almacen_id=v_warehouse_a;
  INSERT INTO public.lotes_compra(producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario)
    VALUES(v_apple,v_warehouse_a,20,20,1.50),(v_pear,v_warehouse_a,10,10,1.75);
  IF (SELECT minimo FROM public.stock WHERE producto_id=v_apple AND almacen_id=v_warehouse_a)<>25
     OR (SELECT minimo FROM public.stock WHERE producto_id=v_pear AND almacen_id=v_warehouse_a)<>12 THEN
    RAISE EXCEPTION 'The flavor minimum RPC did not synchronize the stock rows';
  END IF;
  IF (SELECT minimo FROM public.productos_stock_mixto_minimos
      WHERE producto_id=v_apple AND almacen_id=v_warehouse_a)<>25
     OR (SELECT minimo FROM public.productos_stock_mixto_minimos
      WHERE producto_id=v_apple AND almacen_id=v_warehouse_b)<>3
     OR (SELECT minimo FROM public.productos_stock_mixto_minimos
      WHERE producto_id=v_pear AND almacen_id=v_warehouse_a)<>12 THEN
    RAISE EXCEPTION 'Flavor minimums were not persisted independently per warehouse';
  END IF;
  SELECT variantes INTO v_variantes
  FROM public.inventario_mixto_enriquecido(v_warehouse_a)
  WHERE producto_id=v_parent;
  IF NOT (v_variantes @> jsonb_build_array(jsonb_build_object(
      'producto_id',v_apple,'minimo',25,'estado','bajo'
    ))) OR NOT (v_variantes @> jsonb_build_array(jsonb_build_object(
      'producto_id',v_pear,'minimo',12,'estado','bajo'
    ))) THEN
    RAISE EXCEPTION 'Inventory API did not expose flavor-specific minimum and status: %',v_variantes;
  END IF;
  SELECT variantes INTO v_variantes
  FROM public.inventario_mixto_enriquecido(v_warehouse_b)
  WHERE producto_id=v_parent;
  IF NOT (v_variantes @> jsonb_build_array(jsonb_build_object(
      'producto_id',v_apple,'minimo',3
    ))) THEN
    RAISE EXCEPTION 'A flavor minimum leaked across warehouses: %',v_variantes;
  END IF;

  -- A mixed parent cannot be used as a generic stock SKU by old or new RPC callers.
  v_failed:=false;
  BEGIN
    INSERT INTO public.stock(producto_id,almacen_id,cantidad)
      VALUES(v_parent,v_warehouse_a,1);
  EXCEPTION WHEN check_violation THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Mixed parent accepted a generic stock write'; END IF;

  -- An admin may rename an existing flavor without changing its product ID or its stock.
  PERFORM public.configurar_producto_inventario_mixto(v_parent,true,jsonb_build_array(
    jsonb_build_object('id',v_apple,'nombre','Manzana Roja'),
    jsonb_build_object('id',v_pear,'nombre','Pera')
  ));
  IF NOT EXISTS(SELECT 1 FROM public.productos WHERE id=v_apple AND variante_nombre='Manzana Roja') THEN
    RAISE EXCEPTION 'Flavor rename did not preserve the existing variant identity';
  END IF;
  IF (SELECT cantidad FROM public.stock WHERE producto_id=v_apple AND almacen_id=v_warehouse_a)<>20 THEN
    RAISE EXCEPTION 'Flavor rename changed its stock';
  END IF;

  -- New warehouses automatically receive rows for every active variant.
  INSERT INTO public.almacenes(id,nombre) VALUES(v_warehouse_c,'Almacén C');
  SELECT count(*) INTO v_count FROM public.stock WHERE almacen_id=v_warehouse_c AND producto_id IN (v_apple,v_pear);
  IF v_count<>2 THEN RAISE EXCEPTION 'New warehouse was not seeded with every active flavor'; END IF;

  -- A parent with open flavor stock cannot be deactivated or have its base unit changed.
  v_failed:=false;
  BEGIN
    UPDATE public.productos SET activo=false WHERE id=v_parent;
  EXCEPTION WHEN check_violation THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Mixed parent was deactivated while flavor stock remained'; END IF;

  v_failed:=false;
  BEGIN
    UPDATE public.productos SET unidad='latas' WHERE id=v_parent;
  EXCEPTION WHEN check_violation THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Mixed parent base unit changed while flavor stock remained'; END IF;

  v_failed:=false;
  BEGIN
    UPDATE public.productos SET activo=false WHERE id=v_apple;
  EXCEPTION WHEN check_violation THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Variant with stock was deactivated directly'; END IF;

  -- A transfer selects the flavor's own product ID; the other flavor is untouched.
  UPDATE public.stock SET cantidad=cantidad-5
   WHERE producto_id=v_apple AND almacen_id=v_warehouse_a;
  UPDATE public.stock SET cantidad=cantidad+5
   WHERE producto_id=v_apple AND almacen_id=v_warehouse_b;
  IF (SELECT cantidad FROM public.stock WHERE producto_id=v_apple AND almacen_id=v_warehouse_a)<>15
     OR (SELECT cantidad FROM public.stock WHERE producto_id=v_apple AND almacen_id=v_warehouse_b)<>5
     OR (SELECT cantidad FROM public.stock WHERE producto_id=v_pear AND almacen_id=v_warehouse_a)<>10 THEN
    RAISE EXCEPTION 'Variant-specific transfer changed a different flavor or the wrong warehouse';
  END IF;
  INSERT INTO public.lotes_compra(producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario)
    VALUES(v_apple,v_warehouse_b,5,5,1.50);

  -- The inventory aggregate must expose one parent total and each independent flavor.
  SELECT cantidad,ARRAY(
    SELECT x->>'nombre' FROM jsonb_array_elements(variantes) x ORDER BY x->>'nombre'
  ) INTO v_qty,v_names
  FROM public.inventario_mixto_enriquecido(v_warehouse_a)
  WHERE producto_id=v_parent;
  IF v_qty<>25 OR v_names<>ARRAY['Manzana Roja','Pera'] THEN
    RAISE EXCEPTION 'Mixed inventory summary is incorrect: qty %, variants %',v_qty,v_names;
  END IF;

  -- Removing a flavor that still has stock or open FIFO lots is forbidden.
  v_failed:=false;
  BEGIN
    PERFORM public.configurar_producto_inventario_mixto(v_parent,true,
      jsonb_build_array(jsonb_build_object('id',v_pear,'nombre','Pera')));
  EXCEPTION WHEN check_violation THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Variant with stock/lots was removed'; END IF;

  -- Disabling mixed mode is also blocked while any flavor still has stock/FIFO value.
  v_failed:=false;
  BEGIN
    PERFORM public.configurar_producto_inventario_mixto(v_parent,false,'[]'::jsonb);
  EXCEPTION WHEN check_violation THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Mixed mode disabled while flavor stock remained'; END IF;

  -- Non-admin cannot create or edit variant configuration.
  PERFORM set_config('test.bc_admin','false',true);
  v_failed:=false;
  BEGIN
    PERFORM public.configurar_producto_inventario_mixto(v_parent,true,
      jsonb_build_array(jsonb_build_object('id',v_apple,'nombre','Manzana Roja'),jsonb_build_object('id',v_pear,'nombre','Pera')));
  EXCEPTION WHEN insufficient_privilege THEN v_failed:=true;
  END;
  PERFORM set_config('test.bc_admin','true',true);
  IF NOT v_failed THEN RAISE EXCEPTION 'Non-admin changed mixed product configuration'; END IF;

  -- Clear quantities and open FIFO remnants, then disable; parent minimum is restored.
  UPDATE public.stock SET cantidad=0 WHERE producto_id IN (v_apple,v_pear);
  UPDATE public.lotes_compra SET cantidad_restante=0 WHERE producto_id IN (v_apple,v_pear);
  v_result:=public.configurar_producto_inventario_mixto(v_parent,false,'[]'::jsonb);
  IF (SELECT inventario_mixto FROM public.productos WHERE id=v_parent) THEN
    RAISE EXCEPTION 'Mixed mode was not disabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stock WHERE producto_id=v_parent AND almacen_id=v_warehouse_a AND cantidad=0 AND minimo=7
  ) THEN
    RAISE EXCEPTION 'Parent minimum threshold was not restored after disabling mixed mode';
  END IF;
  IF EXISTS(SELECT 1 FROM public.productos WHERE producto_padre_id=v_parent AND activo=true) THEN
    RAISE EXCEPTION 'Flavor SKUs remained active after disabling mixed mode';
  END IF;

  -- A stocked generic product is converted using a user-provided flavor split.
  -- The operation is atomic, keeps each purchase cost/date and its FIFO lineage,
  -- removes the parent's global minimum, and exposes the sum of child minima.
  INSERT INTO public.productos(nombre,unidad,precio_normal,activo)
    VALUES('Nectar de lata','unidad',20,true)
    RETURNING id INTO v_conversion_parent;
  INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
    VALUES(v_conversion_parent,v_warehouse_a,100,1);
  INSERT INTO public.lotes_compra(
    producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario,fecha_compra,origen
  ) VALUES(
    v_conversion_parent,v_warehouse_a,60,60,1.00,now()-interval '2 days','compra'
  ) RETURNING id INTO v_conversion_lot_1;
  INSERT INTO public.lotes_compra(
    producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario,fecha_compra,origen
  ) VALUES(
    v_conversion_parent,v_warehouse_a,40,40,2.00,now()-interval '1 day','compra'
  ) RETURNING id INTO v_conversion_lot_2;

  v_failed:=false;
  BEGIN
    PERFORM public.configurar_producto_inventario_mixto_con_asignaciones(
      v_conversion_parent,true,
      jsonb_build_array(jsonb_build_object('nombre','Manzana'),jsonb_build_object('nombre','Pera')),
      jsonb_build_array(
        jsonb_build_object('almacen_id',v_warehouse_a,'variantes',jsonb_build_array(
          jsonb_build_object('nombre','Manzana','cantidad',59,'minimo',10),
          jsonb_build_object('nombre','Pera','cantidad',40,'minimo',20))),
        jsonb_build_object('almacen_id',v_warehouse_b,'variantes',jsonb_build_array(
          jsonb_build_object('nombre','Manzana','cantidad',0,'minimo',3),
          jsonb_build_object('nombre','Pera','cantidad',0,'minimo',4))),
        jsonb_build_object('almacen_id',v_warehouse_c,'variantes',jsonb_build_array(
          jsonb_build_object('nombre','Manzana','cantidad',0,'minimo',3),
          jsonb_build_object('nombre','Pera','cantidad',0,'minimo',4))),
        jsonb_build_object('almacen_id','55555555-5555-4555-8555-555555555555'::uuid,'variantes',jsonb_build_array(
          jsonb_build_object('nombre','Manzana','cantidad',0,'minimo',3),
          jsonb_build_object('nombre','Pera','cantidad',0,'minimo',4)))
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Conversion accepted flavor allocations that did not sum to generic stock'; END IF;
  IF (SELECT inventario_mixto FROM public.productos WHERE id=v_conversion_parent)
     OR (SELECT cantidad FROM public.stock WHERE producto_id=v_conversion_parent AND almacen_id=v_warehouse_a)<>100
     OR (SELECT sum(cantidad_restante) FROM public.lotes_compra WHERE producto_id=v_conversion_parent AND almacen_id=v_warehouse_a)<>100 THEN
    RAISE EXCEPTION 'Rejected conversion changed generic stock, its purchase layers, or product mode';
  END IF;

  v_result:=public.configurar_producto_inventario_mixto_con_asignaciones(
    v_conversion_parent,true,
    jsonb_build_array(jsonb_build_object('nombre','Manzana'),jsonb_build_object('nombre','Pera')),
    jsonb_build_array(
      jsonb_build_object('almacen_id',v_warehouse_a,'variantes',jsonb_build_array(
        jsonb_build_object('nombre','Manzana','cantidad',60,'minimo',10),
        jsonb_build_object('nombre','Pera','cantidad',40,'minimo',20))),
      jsonb_build_object('almacen_id',v_warehouse_b,'variantes',jsonb_build_array(
        jsonb_build_object('nombre','Manzana','cantidad',0,'minimo',3),
        jsonb_build_object('nombre','Pera','cantidad',0,'minimo',4))),
      jsonb_build_object('almacen_id',v_warehouse_c,'variantes',jsonb_build_array(
        jsonb_build_object('nombre','Manzana','cantidad',0,'minimo',3),
        jsonb_build_object('nombre','Pera','cantidad',0,'minimo',4))),
      jsonb_build_object('almacen_id','55555555-5555-4555-8555-555555555555'::uuid,'variantes',jsonb_build_array(
        jsonb_build_object('nombre','Manzana','cantidad',0,'minimo',3),
        jsonb_build_object('nombre','Pera','cantidad',0,'minimo',4)))
    )
  );
  SELECT id INTO v_conversion_apple FROM public.productos
    WHERE producto_padre_id=v_conversion_parent AND variante_nombre='Manzana' AND activo=true;
  SELECT id INTO v_conversion_pear FROM public.productos
    WHERE producto_padre_id=v_conversion_parent AND variante_nombre='Pera' AND activo=true;
  IF v_conversion_apple IS NULL OR v_conversion_pear IS NULL THEN
    RAISE EXCEPTION 'Conversion did not create both flavor SKUs';
  END IF;
  IF EXISTS(SELECT 1 FROM public.stock WHERE producto_id=v_conversion_parent)
     OR EXISTS(SELECT 1 FROM public.productos_stock_mixto_minimos WHERE producto_id=v_conversion_parent) THEN
    RAISE EXCEPTION 'Mixed parent kept a global stock row or a general minimum';
  END IF;
  IF (SELECT cantidad FROM public.stock WHERE producto_id=v_conversion_apple AND almacen_id=v_warehouse_a)<>60
     OR (SELECT cantidad FROM public.stock WHERE producto_id=v_conversion_pear AND almacen_id=v_warehouse_a)<>40
     OR (SELECT minimo FROM public.stock WHERE producto_id=v_conversion_apple AND almacen_id=v_warehouse_a)<>10
     OR (SELECT minimo FROM public.stock WHERE producto_id=v_conversion_pear AND almacen_id=v_warehouse_a)<>20 THEN
    RAISE EXCEPTION 'Manually allocated quantities or flavor-specific minimums were not preserved';
  END IF;
  IF (SELECT sum(cantidad_restante) FROM public.lotes_compra WHERE producto_id=v_conversion_parent)<>0
     OR (SELECT sum(cantidad_restante) FROM public.lotes_compra WHERE producto_id IN (v_conversion_apple,v_conversion_pear))<>100 THEN
    RAISE EXCEPTION 'Generic FIFO layers were not moved to the flavor SKUs';
  END IF;
  SELECT sum(cantidad_restante*costo_unitario) INTO v_total_fifo_value
  FROM public.lotes_compra WHERE producto_id IN (v_conversion_apple,v_conversion_pear) AND almacen_id=v_warehouse_a;
  IF v_total_fifo_value<>140 THEN
    RAISE EXCEPTION 'Conversion changed the original FIFO inventory value: %',v_total_fifo_value;
  END IF;
  IF (SELECT count(*) FROM public.lotes_compra_conversion_mixta
      WHERE lote_origen_id IN (v_conversion_lot_1,v_conversion_lot_2))<>4 THEN
    RAISE EXCEPTION 'Source purchase layers were not mapped to both flavor SKUs';
  END IF;
  SELECT minimo,cantidad INTO v_inventory_minimum,v_qty
  FROM public.inventario_mixto_enriquecido(v_warehouse_a)
  WHERE producto_id=v_conversion_parent;
  IF v_inventory_minimum<>30 OR v_qty<>100 THEN
    RAISE EXCEPTION 'Composite minimum must equal the sum of flavor minimums; got minimum %, stock %',v_inventory_minimum,v_qty;
  END IF;
  SELECT sum(cantidad_restante),count(*) INTO v_history_remaining,v_count
  FROM public.historial_compras(NULL,NULL,v_conversion_parent,v_warehouse_a,100,0);
  IF v_history_remaining<>100 OR v_count<>2 THEN
    RAISE EXCEPTION 'Original purchase history did not show the remaining converted FIFO balance: %, rows %',v_history_remaining,v_count;
  END IF;
  SELECT sum(cantidad_restante),count(*) INTO v_history_remaining,v_count
  FROM public.historial_compras(NULL,NULL,v_conversion_apple,v_warehouse_a,100,0);
  IF v_history_remaining<>60 OR v_count<>2 THEN
    RAISE EXCEPTION 'Filtering purchase history by a flavor did not isolate its converted layers: %, rows %',v_history_remaining,v_count;
  END IF;
  v_history:=public.historial_premium_detalle('compras',v_conversion_lot_1);
  IF (v_history->>'cantidad_restante')::numeric<>60
     OR jsonb_array_length(v_history->'asignaciones')<>2 THEN
    RAISE EXCEPTION 'Premium purchase detail lost the converted flavor allocation: %',v_history;
  END IF;
  v_history:=public.bc_obtener_snapshot_conversion_mixta(v_conversion_parent);
  IF NOT (v_history->>'inventario_mixto')::boolean
     OR jsonb_array_length(v_history->'almacenes')<>4 THEN
    RAISE EXCEPTION 'Conversion snapshot did not expose the mixed product and all active warehouses';
  END IF;

  -- Stock writes lock parent before variant, serializing them with mode changes.
  IF position('WHERE id=v_parent_id FOR SHARE' IN pg_get_functiondef('public.bc_guard_mixed_stock_sku()'::regprocedure))=0
     OR position('WHERE id=NEW.producto_id FOR SHARE' IN pg_get_functiondef('public.bc_guard_mixed_stock_sku()'::regprocedure))=0
     OR position('WHERE id=v_parent_id FOR SHARE' IN pg_get_functiondef('public.bc_guard_mixed_stock_sku()'::regprocedure))
        > position('WHERE id=NEW.producto_id FOR SHARE' IN pg_get_functiondef('public.bc_guard_mixed_stock_sku()'::regprocedure)) THEN
    RAISE EXCEPTION 'Mixed stock writes must lock parent before variant to serialize with configuration';
  END IF;

  -- SQL execution permissions are restricted to authenticated users.
  IF has_function_privilege('anon','public.configurar_producto_inventario_mixto(uuid,boolean,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can configure mixed inventory';
  END IF;
  IF has_function_privilege('anon','public.bc_actualizar_stock_minimo_obligatorio(uuid,uuid,numeric)','EXECUTE')
     OR has_function_privilege('anon','public.bc_actualizar_stock_minimo_variante(uuid,uuid,numeric)','EXECUTE')
     OR has_function_privilege('anon','public.bc_seed_mixed_variant_minimum()','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can execute a stock-minimum or trigger function';
  END IF;
  IF has_function_privilege('anon','public.configurar_producto_inventario_mixto_con_asignaciones(uuid,boolean,jsonb,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.bc_obtener_snapshot_conversion_mixta(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can configure or inspect mixed stock conversion';
  END IF;
  IF NOT has_function_privilege('authenticated','public.configurar_producto_inventario_mixto_con_asignaciones(uuid,boolean,jsonb,jsonb)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc_obtener_snapshot_conversion_mixta(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc_actualizar_stock_minimo_obligatorio(uuid,uuid,numeric)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc_actualizar_stock_minimo_variante(uuid,uuid,numeric)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role cannot execute the authorized stock-minimum RPCs';
  END IF;
  IF has_table_privilege('authenticated','public.productos_stock_mixto_minimos','INSERT') THEN
    RAISE EXCEPTION 'Authenticated role can write mixed minimums directly';
  END IF;
END
$$;

SELECT 'PASS: mandatory positive minima per warehouse and flavor, pending-minimum status, legacy backfill, mixed inventory, identities, stock, FIFO guard, transfer separation, warehouse seeding, aggregation, admin ACL and safe disable' AS result;
