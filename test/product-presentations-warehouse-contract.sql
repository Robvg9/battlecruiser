-- Disposable PostgreSQL contract for warehouse-specific presentation enforcement.
DO $$
DECLARE
  legacy_definition text;
  typed_definition text;
BEGIN
  SELECT lower(pg_get_functiondef('public.registrar_venta(uuid,jsonb,uuid)'::regprocedure))
    INTO legacy_definition;
  SELECT lower(pg_get_functiondef('public.registrar_venta(uuid,jsonb,uuid,text)'::regprocedure))
    INTO typed_definition;

  IF position('v_tipo_almacen=''mayorista''' IN legacy_definition)=0
     OR position('v_presentacion_producto is null' IN legacy_definition)=0
     OR position('v_presentacion_id is distinct from v_presentacion_producto' IN legacy_definition)=0
     OR position('v_presentacion_producto is not null and v_presentacion_id=v_presentacion_producto' IN legacy_definition)=0 THEN
    RAISE EXCEPTION 'Legacy registrar_venta does not enforce retail/wholesale presentation ownership';
  END IF;

  IF position('select tipo into v_tipo_almacen from public.almacenes' IN typed_definition)=0
     OR position('v_tipo_almacen=''mayorista''' IN typed_definition)=0
     OR position('v_presentacion_producto is null' IN typed_definition)=0
     OR position('v_presentacion_id is distinct from v_presentacion_producto' IN typed_definition)=0
     OR position('v_presentacion_producto is not null and v_presentacion_id=v_presentacion_producto' IN typed_definition)=0 THEN
    RAISE EXCEPTION 'Typed registrar_venta does not enforce actual warehouse presentation ownership';
  END IF;

  IF position('v_tipo_precio_linea:=coalesce' IN typed_definition)=0 THEN
    RAISE EXCEPTION 'Price selection was unexpectedly removed while enforcing the warehouse channel';
  END IF;
END
$$;

SELECT 'PASS: both registrar_venta overloads enforce warehouse-specific presentations' AS result;
