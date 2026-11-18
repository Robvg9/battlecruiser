-- Disposable Step 7 contract: canonical Jornada product set and reversible archive permissions.
DO $test$
DECLARE v_definition text; v_has_rls boolean;
BEGIN
  IF to_regprocedure('public.bc7_jornada_productos_corte(uuid,text)') IS NULL THEN RAISE EXCEPTION 'Canonical Jornada product-set function is missing'; END IF;
  SELECT pg_get_functiondef('public.bc7_jornada_productos_corte(uuid,text)'::regprocedure) INTO v_definition;
  IF position('turno_jornada_inventario_lineas' IN v_definition)=0 OR position('public.stock' IN v_definition)=0 OR position('public.reinversiones' IN v_definition)=0 OR position('public.transferencias' IN v_definition)=0 THEN RAISE EXCEPTION 'Canonical Jornada product-set source is incomplete'; END IF;
  IF has_function_privilege('authenticated','public.bc7_jornada_productos_corte(uuid,text)','EXECUTE') OR has_function_privilege('anon','public.bc7_jornada_productos_corte(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Internal product-set helper must not be directly executable by API roles'; END IF;
  IF to_regprocedure('public.bc_producto_archivar(uuid,text)') IS NULL OR to_regprocedure('public.bc_producto_restaurar(uuid,text)') IS NULL THEN RAISE EXCEPTION 'Product archive/restore RPC pair is incomplete'; END IF;
  IF NOT has_function_privilege('authenticated','public.bc_producto_archivar(uuid,text)','EXECUTE') OR NOT has_function_privilege('authenticated','public.bc_producto_restaurar(uuid,text)','EXECUTE') OR has_function_privilege('anon','public.bc_producto_archivar(uuid,text)','EXECUTE') OR has_function_privilege('anon','public.bc_producto_restaurar(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Product archive RPC grants are incorrect'; END IF;
  IF to_regclass('public.productos_archivo_historial') IS NULL THEN RAISE EXCEPTION 'Product archive audit table is missing'; END IF;
  SELECT c.relrowsecurity INTO v_has_rls FROM pg_class c WHERE c.oid='public.productos_archivo_historial'::regclass;
  IF v_has_rls IS DISTINCT FROM true THEN RAISE EXCEPTION 'Product archive audit table must keep RLS enabled'; END IF;
  IF has_table_privilege('authenticated','public.productos_archivo_historial','SELECT') OR has_table_privilege('authenticated','public.productos_archivo_historial','INSERT') OR has_table_privilege('anon','public.productos_archivo_historial','SELECT') THEN RAISE EXCEPTION 'Archive audit history must remain RPC-only'; END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='productos' AND column_name='archivado_at') OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='productos' AND column_name='motivo_archivo') THEN RAISE EXCEPTION 'Product archive metadata columns are missing'; END IF;
END
$test$;
