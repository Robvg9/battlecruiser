-- PostgreSQL 17 contract: Owner review, classification and liquidation
-- must all use the same sealed operational cutoff.
DO $bc7_owner_review_operational_cut_contract$
DECLARE
  v_review text;
  v_classifier text;
  v_expected_baja text;
  v_expected_merma text;
  v_old_baja text;
  v_old_merma text;
  v_count integer;
  v_has_rls boolean;
BEGIN
  SELECT pg_get_functiondef('public.bc7_obtener_revision_jornada(uuid)'::regprocedure)
    INTO v_review;
  SELECT pg_get_functiondef('public.bc7_clasificar_movimientos_fuera_corte(uuid,jsonb)'::regprocedure)
    INTO v_classifier;

  v_expected_baja := 'coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>coalesce(v_s.corte_operativo_at,v_final.confirmado_en)';
  v_expected_merma := 'coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>coalesce(v_s.corte_operativo_at,v_final.confirmado_en)';
  v_old_baja := 'coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_final.confirmado_en';
  v_old_merma := 'coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_final.confirmado_en';

  IF position(v_expected_baja IN v_review)=0
     OR position(v_expected_merma IN v_review)=0
     OR position(v_old_baja IN v_review)>0
     OR position(v_old_merma IN v_review)>0 THEN
    RAISE EXCEPTION 'Owner review does not list Bajas/Mermas against the immutable operational cutoff.';
  END IF;
  IF strpos(v_review,'corte_operativo_at')=0 THEN
    RAISE EXCEPTION 'Owner review does not return the operational cutoff timestamp.';
  END IF;

  v_count := (length(v_classifier)-length(replace(v_classifier,v_expected_baja,'')))/length(v_expected_baja);
  IF v_count<>2 OR position(v_old_baja IN v_classifier)>0 THEN
    RAISE EXCEPTION 'Classifier BAJA validation/recount must both use the operational cutoff; count=%',v_count;
  END IF;
  v_count := (length(v_classifier)-length(replace(v_classifier,v_expected_merma,'')))/length(v_expected_merma);
  IF v_count<>2 OR position(v_old_merma IN v_classifier)>0 THEN
    RAISE EXCEPTION 'Classifier MERMA validation/recount must both use the operational cutoff; count=%',v_count;
  END IF;

  IF strpos(v_classifier,'ANTES_CORTE')=0 OR strpos(v_classifier,'DESPUES_CORTE')=0
     OR strpos(v_classifier,'MOVIMIENTOS_POST_CORTE_CLASIFICADOS')=0 THEN
    RAISE EXCEPTION 'Explicit classification categories and audit event must remain available.';
  END IF;
  IF NOT has_function_privilege('authenticated','public.bc7_obtener_revision_jornada(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_obtener_revision_jornada(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_clasificar_movimientos_fuera_corte(uuid,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_clasificar_movimientos_fuera_corte(uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Owner review/classification RPC grants changed unexpectedly.';
  END IF;

  SELECT c.relrowsecurity INTO v_has_rls
  FROM pg_class c WHERE c.oid='public.turno_jornada_movimiento_revision'::regclass;
  IF v_has_rls IS DISTINCT FROM true
     OR has_table_privilege('authenticated','public.turno_jornada_movimiento_revision','INSERT')
     OR has_table_privilege('anon','public.turno_jornada_movimiento_revision','SELECT') THEN
    RAISE EXCEPTION 'Audited movement classification table must retain its protected RLS boundary.';
  END IF;
END;
$bc7_owner_review_operational_cut_contract$;
