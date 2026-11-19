-- Live/disposable contract for product-wide persistent Jornada values.
DO $contract$
DECLARE
  v_rls boolean;
  v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='productos'
      AND column_name='costo_unitario_referencia'
  ) THEN
    RAISE EXCEPTION 'Product-wide cost reference column is missing.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='productos_valores_historial';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Product value history must have RLS enabled.';
  END IF;

  IF has_table_privilege('authenticated','public.productos_valores_historial','SELECT')
     OR has_table_privilege('authenticated','public.productos_valores_historial','INSERT')
     OR has_table_privilege('anon','public.productos_valores_historial','SELECT') THEN
    RAISE EXCEPTION 'Direct product value history access must remain revoked.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.productos'::regclass
      AND tgname='productos_values_history_capture'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Product price/cost history capture trigger is missing.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.productos p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.productos_valores_historial h
      WHERE h.producto_id=p.id AND h.origen='BASELINE'
    )
  ) THEN
    RAISE EXCEPTION 'A product has no frozen baseline value.';
  END IF;

  v_def:=pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure);
  IF position('persistent_values.precio_venta_unitario' in v_def)=0
     OR position('v_initial.confirmado_en' in v_def)=0 THEN
    RAISE EXCEPTION 'Sales liquidation does not resolve price as-of the initial inventory cut.';
  END IF;

  v_def:=pg_get_functiondef('public.bc7_obtener_revision_jornada(uuid)'::regprocedure);
  IF position('persistent_values.costo_unitario' in v_def)=0
     OR position('v_final.confirmado_en' in v_def)=0 THEN
    RAISE EXCEPTION 'Owner review does not resolve cost as-of the final inventory cut.';
  END IF;
END;
$contract$;
