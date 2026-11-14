-- PostgreSQL contract for audited historical Jornada valuation overrides.
DO $$
DECLARE
  v_rls boolean;
  v_definition text;
BEGIN
  IF to_regclass('public.turno_jornada_valoracion_correcciones') IS NULL THEN
    RAISE EXCEPTION 'Historical valuation audit table is missing';
  END IF;
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c WHERE c.oid='public.turno_jornada_valoracion_correcciones'::regclass;
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Historical valuation audit table must have RLS enabled';
  END IF;
  IF has_table_privilege('authenticated','public.turno_jornada_valoracion_correcciones','SELECT')
     OR has_table_privilege('authenticated','public.turno_jornada_valoracion_correcciones','INSERT')
     OR has_table_privilege('anon','public.turno_jornada_valoracion_correcciones','SELECT') THEN
    RAISE EXCEPTION 'Historical valuation rows must not be directly accessible';
  END IF;
  IF NOT has_function_privilege('authenticated','public.bc7_corregir_valoracion_historica_jornada(uuid,uuid,numeric,numeric,text)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_corregir_valoracion_historica_jornada(uuid,uuid,numeric,numeric,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Historical valuation RPC permissions are not restricted to authenticated actors';
  END IF;
  SELECT pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure)
    INTO v_definition;
  IF position('precio_venta_corregido' IN v_definition)=0
     OR position('PRECIO_HISTORICO_AUDITADO' IN v_definition)=0
     OR position('precio_catalogo_actual' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Jornada settlement must prioritize historical price overrides and expose the current catalogue value';
  END IF;
  SELECT pg_get_functiondef('public.bc7_obtener_revision_jornada(uuid)'::regprocedure)
    INTO v_definition;
  IF position('costo_unitario_corregido' IN v_definition)=0
     OR position('COSTO_HISTORICO_AUDITADO' IN v_definition)=0
     OR position('coalesce(hv.precio_venta_corregido,p.precio_normal,pp.precio_normal)' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Owner review must apply auditable historical costs and price overrides to sales and post-cutoff Baja/Merma values';
  END IF;
  SELECT pg_get_functiondef('public.bc7_corregir_valoracion_historica_jornada(uuid,uuid,numeric,numeric,text)'::regprocedure)
    INTO v_definition;
  IF position('bc_actor_is_admin' IN v_definition)=0
     OR position('catalogo_actual_inalterado' IN v_definition)=0
     OR position('VALORACION_HISTORICA_CORREGIDA' IN v_definition)=0
     OR position('SET vigente=false' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Historical valuation corrections must enforce Owner/Admin, preserve prior versions and emit an audit event';
  END IF;
END;
$$;
