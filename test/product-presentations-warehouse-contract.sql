-- Disposable PostgreSQL contract and runtime tests for warehouse-specific presentations.
DO $$
DECLARE
  legacy_definition text;
  typed_definition text;
  catalog_definition text;
BEGIN
  SELECT lower(pg_get_functiondef('public.registrar_venta(uuid,jsonb,uuid)'::regprocedure))
    INTO legacy_definition;
  SELECT lower(pg_get_functiondef('public.registrar_venta(uuid,jsonb,uuid,text)'::regprocedure))
    INTO typed_definition;

  IF position('v_presentacion_count<>1' IN legacy_definition)=0
     OR position('select count(*)::integer into v_presentacion_count' IN legacy_definition)=0 THEN
    RAISE EXCEPTION 'Legacy registrar_venta must reject ambiguous active presentations';
  END IF;
  IF position('v_presentacion_count<>1' IN typed_definition)=0
     OR position('select count(*)::integer into v_presentacion_count' IN typed_definition)=0 THEN
    RAISE EXCEPTION 'Typed registrar_venta must reject ambiguous active presentations';
  END IF;
  IF position('v_tipo_precio_linea:=coalesce' IN typed_definition)=0
     OR position('v_presentacion_producto is not null and v_presentacion_id<>v_presentacion_producto' IN typed_definition)>0 THEN
    RAISE EXCEPTION 'Price selection must remain independent from the warehouse presentation';
  END IF;

  SELECT lower(pg_get_functiondef('public.bc_guardar_producto_catalogo(uuid,text,uuid,text,numeric,numeric,text,numeric,text,numeric,uuid)'::regprocedure))
    INTO catalog_definition;
  IF position('(v_norm_name is null) <> (p_factor_normal is null)' IN catalog_definition)=0
     OR position('(v_wh_name is null) <> (p_factor_mayorista is null)' IN catalog_definition)=0
     OR position('lower(v_norm_name)=lower(v_wh_name)' IN catalog_definition)=0 THEN
    RAISE EXCEPTION 'Catalog RPC must validate two independent optional name/factor pairs';
  END IF;
END
$$;

-- All writes below affect only the seeded PostgreSQL service container in GitHub Actions.
DO $$
DECLARE
  v_user uuid := '11111111-1111-4111-8111-111111111111';
  v_retail_warehouse uuid := '22222222-2222-4222-8222-222222222222';
  v_wholesale_warehouse uuid := '33333333-3333-4333-8333-333333333333';
  v_turno uuid := '44444444-4444-4444-8444-444444444444';
  v_product uuid := '55555555-5555-4555-8555-555555555555';
  v_retail_presentation uuid := '66666666-6666-4666-8666-666666666666';
  v_wholesale_presentation uuid := '77777777-7777-4777-8777-777777777777';
  v_extra_presentation uuid := '88888888-8888-4888-8888-888888888888';
  v_sale uuid;
  v_qty numeric;
  v_price numeric;
  v_failed boolean;
  v_created_product uuid;
  v_catalog_wholesale uuid;
  v_association_count integer;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',v_user::text,false);

  INSERT INTO public.almacenes(id,tipo) VALUES
    (v_retail_warehouse,'minorista'),
    (v_wholesale_warehouse,'mayorista');
  INSERT INTO public.presentaciones(id,nombre,activo) VALUES
    (v_retail_presentation,'Unidad fixture',true),
    (v_wholesale_presentation,'Caja fixture',true),
    (v_extra_presentation,'Pack extra fixture',true);
  INSERT INTO public.productos(id,nombre,precio_normal,precio_mayorista,presentacion_id)
    VALUES(v_product,'Producto fixture',10,80,v_wholesale_presentation);
  INSERT INTO public.producto_presentaciones(producto_id,presentacion_id,factor,activo) VALUES
    (v_product,v_retail_presentation,1,true),
    (v_product,v_wholesale_presentation,6,true);
  INSERT INTO public.stock(producto_id,almacen_id,cantidad) VALUES
    (v_product,v_retail_warehouse,100),
    (v_product,v_wholesale_warehouse,100);
  INSERT INTO public.turnos(id,usuario_id,estado,almacen_id)
    VALUES(v_turno,v_user,'ABIERTO',v_retail_warehouse);

  -- Retail warehouse consumes the retail unit presentation.
  v_sale:=public.registrar_venta(v_retail_warehouse,jsonb_build_array(jsonb_build_object(
    'producto_id',v_product,'cantidad',2,
    'presentacion_id',v_retail_presentation,'cantidad_presentacion',2
  )),'99999999-9999-4999-8999-999999999991');
  SELECT vl.cantidad,vl.precio_unitario INTO v_qty,v_price
    FROM public.ventas_lineas vl WHERE vl.venta_id=v_sale;
  IF v_qty<>2 OR v_price<>10 THEN
    RAISE EXCEPTION 'Retail sale did not preserve its unit presentation and normal warehouse price';
  END IF;

  -- Wholesale warehouse consumes the wholesale case presentation.
  UPDATE public.turnos SET almacen_id=v_wholesale_warehouse WHERE id=v_turno;
  v_sale:=public.registrar_venta(v_wholesale_warehouse,jsonb_build_array(jsonb_build_object(
    'producto_id',v_product,'cantidad',1,
    'presentacion_id',v_wholesale_presentation,'cantidad_presentacion',1
  )),'99999999-9999-4999-8999-999999999992');
  SELECT vl.cantidad,vl.precio_unitario INTO v_qty,v_price
    FROM public.ventas_lineas vl WHERE vl.venta_id=v_sale;
  IF v_qty<>6 OR v_price<>80 THEN
    RAISE EXCEPTION 'Wholesale sale did not preserve its case presentation and wholesale warehouse price';
  END IF;

  -- Selecting a wholesale price must not force wholesale presentation in a retail warehouse.
  UPDATE public.turnos SET almacen_id=v_retail_warehouse WHERE id=v_turno;
  INSERT INTO public.turno_sesiones(id,turno_id,estado,fecha,numero_dia,bloque,almacen_id)
    VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v_turno,'EN_CURSO',DATE '2026-11-03',1,'JORNADA',v_retail_warehouse);
  INSERT INTO public.turno_tramos(id,turno_sesion_id,usuario_id,estado,inicio_at)
    VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v_user,'ACTIVO',now());
  v_sale:=public.registrar_venta(v_retail_warehouse,jsonb_build_array(jsonb_build_object(
    'producto_id',v_product,'cantidad',1,
    'presentacion_id',v_retail_presentation,'cantidad_presentacion',1,'tipo_precio','mayorista'
  )),'99999999-9999-4999-8999-999999999993','mayorista');
  SELECT vl.cantidad,vl.precio_unitario INTO v_qty,v_price
    FROM public.ventas_lineas vl WHERE vl.venta_id=v_sale;
  IF v_qty<>1 OR v_price<>80 THEN
    RAISE EXCEPTION 'Alternate wholesale price must be accepted with the retail warehouse presentation';
  END IF;

  -- A second active retail association is ambiguous and must fail closed in both RPCs.
  INSERT INTO public.producto_presentaciones(producto_id,presentacion_id,factor,activo)
    VALUES(v_product,v_extra_presentation,4,true);
  v_failed:=false;
  BEGIN
    PERFORM public.registrar_venta(v_retail_warehouse,jsonb_build_array(jsonb_build_object(
      'producto_id',v_product,'cantidad',1,
      'presentacion_id',v_retail_presentation,'cantidad_presentacion',1
    )),'99999999-9999-4999-8999-999999999994');
  EXCEPTION WHEN OTHERS THEN
    v_failed:=true;
    GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
    IF position('única presentación activa' IN v_error)=0 THEN
      RAISE EXCEPTION 'Unexpected ambiguous legacy sale rejection: %',v_error;
    END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Legacy sale RPC incorrectly accepted ambiguous retail presentations'; END IF;

  v_failed:=false;
  BEGIN
    PERFORM public.registrar_venta(v_retail_warehouse,jsonb_build_array(jsonb_build_object(
      'producto_id',v_product,'cantidad',1,
      'presentacion_id',v_retail_presentation,'cantidad_presentacion',1,'tipo_precio','normal'
    )),'99999999-9999-4999-8999-999999999996','normal');
  EXCEPTION WHEN OTHERS THEN
    v_failed:=true;
    GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
    IF position('única presentación activa' IN v_error)=0 THEN
      RAISE EXCEPTION 'Unexpected ambiguous typed sale rejection: %',v_error;
    END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Typed sale RPC incorrectly accepted ambiguous retail presentations'; END IF;

  -- The catalog RPC persists both optional associations and keeps the wholesale pointer.
  v_created_product:=public.bc_guardar_producto_catalogo(
    NULL,'Producto catálogo fixture',NULL,NULL,12,90,
    'Unidad catálogo',1,'Caja catálogo',12,
    '99999999-9999-4999-8999-999999999995'
  );
  SELECT presentacion_id INTO v_catalog_wholesale
    FROM public.productos WHERE id=v_created_product;
  SELECT count(*) INTO v_association_count
    FROM public.producto_presentaciones
   WHERE producto_id=v_created_product AND activo IS DISTINCT FROM false;
  IF v_association_count<>2 OR v_catalog_wholesale IS NULL THEN
    RAISE EXCEPTION 'Catalog RPC did not persist both independent presentation pairs';
  END IF;

  -- Reject malformed JSON input before creating a sale.
  v_failed:=false;
  BEGIN
    PERFORM public.registrar_venta(v_retail_warehouse,'{}'::jsonb,
      '99999999-9999-4999-8999-999999999997');
  EXCEPTION WHEN OTHERS THEN
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Legacy sale RPC accepted a non-array line payload'; END IF;
END
$$;

SELECT 'PASS: PostgreSQL runtime validates channel presentation, alternate pricing, ambiguous associations and catalog persistence' AS result;
