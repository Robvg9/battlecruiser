-- Keep the Owner review and movement-classification RPCs on the same
-- immutable operational cutoff already used by bc7_liquidacion_inventario_jornada.
-- A late approval timestamp must not hide a movement created after Jornada close
-- but before the physical FINAL count was entered/confirmed.
BEGIN;

DO $bc7_owner_review_operational_cut$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
  v_occurrences integer;
BEGIN
  SELECT pg_get_functiondef('public.bc7_obtener_revision_jornada(uuid)'::regprocedure)
    INTO v_definition;

  v_old := $old$coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_final.confirmado_en$old$;
  v_new := $new$coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>coalesce(v_s.corte_operativo_at,v_final.confirmado_en)$new$;
  v_occurrences := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  IF v_occurrences<>1 THEN
    RAISE EXCEPTION 'Unexpected Owner review BAJA cutoff predicate count: %; expected 1. No function changed.',v_occurrences;
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_final.confirmado_en$old$;
  v_new := $new$coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>coalesce(v_s.corte_operativo_at,v_final.confirmado_en)$new$;
  v_occurrences := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  IF v_occurrences<>1 THEN
    RAISE EXCEPTION 'Unexpected Owner review MERMA cutoff predicate count: %; expected 1. No function changed.',v_occurrences;
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  -- Return the cutoff timestamp with the reviewed session so the Owner can
  -- compare each event against the exact close time before making a decision.
  v_old := $old$'estado',v_s.estado,'responsable_id',v_p.responsable_id,$old$;
  v_new := $new$'estado',v_s.estado,'corte_operativo_at',v_s.corte_operativo_at,'responsable_id',v_p.responsable_id,$new$;
  v_occurrences := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  IF v_occurrences<>1 THEN
    RAISE EXCEPTION 'Unexpected Owner review session projection count: %; expected 1. No function changed.',v_occurrences;
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.bc7_clasificar_movimientos_fuera_corte(uuid,jsonb)'::regprocedure)
    INTO v_definition;

  -- Validate the same operational cutoff when saving a decision and when
  -- recounting unresolved records. This prevents "listed but cannot save" and
  -- "blocked but not listed" states from diverging.
  v_old := $old$coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_final.confirmado_en$old$;
  v_new := $new$coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>coalesce(v_s.corte_operativo_at,v_final.confirmado_en)$new$;
  v_occurrences := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  IF v_occurrences<>2 THEN
    RAISE EXCEPTION 'Unexpected classifier BAJA cutoff predicate count: %; expected 2. No function changed.',v_occurrences;
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_final.confirmado_en$old$;
  v_new := $new$coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>coalesce(v_s.corte_operativo_at,v_final.confirmado_en)$new$;
  v_occurrences := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  IF v_occurrences<>2 THEN
    RAISE EXCEPTION 'Unexpected classifier MERMA cutoff predicate count: %; expected 2. No function changed.',v_occurrences;
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END;
$bc7_owner_review_operational_cut$;

COMMIT;
