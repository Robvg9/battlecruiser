-- Reproduce the exact checklist-function shape currently present in LIVE.
-- The historical 20261121193906 migration was already applied in production
-- before its later repository edit; therefore this database has no V1 marker,
-- no exact-cutoff tranche filter, and no open-master-Turn guard yet.
DO $simulate_live_checklist_definition$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_confirmar_bloque_jornada(uuid,text,boolean)'::regprocedure
  ) INTO v_def;

  v_old := $old$  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN RAISE EXCEPTION 'La Jornada no existe.' USING ERRCODE='23503'; END IF;$old$;
  v_new := $new$  IF NOT FOUND THEN RAISE EXCEPTION 'La Jornada no existe.' USING ERRCODE='23503'; END IF;$new$;
  IF position(v_old IN v_def)=0 THEN
    RAISE EXCEPTION 'Fixture drift: expected the current main-repository checklist function shape.';
  END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old := $old$    IF NOT EXISTS (SELECT 1 FROM public.turnos t WHERE t.id=v_s.turno_id AND t.estado='ABIERTO') THEN RAISE EXCEPTION 'El Turno maestro ya está cerrado; no se admiten cambios de checklist.' USING ERRCODE='23514'; END IF;$old$;
  IF position(v_old IN v_def)=0 THEN
    RAISE EXCEPTION 'Fixture drift: expected the historical open-turn-only guard.';
  END IF;
  v_def:=replace(v_def,v_old,'');

  v_old := $old$    SELECT * INTO v_tramo FROM public.turno_tramos WHERE turno_sesion_id=v_s.id AND estado='COMPLETADO' AND fin_at=v_s.corte_operativo_at ORDER BY fin_at DESC NULLS LAST LIMIT 1;$old$;
  v_new := $new$    SELECT * INTO v_tramo FROM public.turno_tramos WHERE turno_sesion_id=v_s.id AND estado='COMPLETADO' ORDER BY fin_at DESC NULLS LAST LIMIT 1;$new$;
  IF position(v_old IN v_def)=0 THEN
    RAISE EXCEPTION 'Fixture drift: expected the exact-cutoff tranche filter introduced by the un-applied historical edit.';
  END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old := $old$  -- BC7_SEALED_OWNER_BLOCK_GATE_V1$old$;
  IF position(v_old IN v_def)=0 THEN
    RAISE EXCEPTION 'Fixture drift: expected the V1 marker introduced by the un-applied historical edit.';
  END IF;
  v_def:=replace(v_def,v_old,'');

  IF position('BC7_SEALED_OWNER_BLOCK_GATE_V1' IN v_def)>0
     OR position('AND fin_at=v_s.corte_operativo_at' IN v_def)>0 THEN
    RAISE EXCEPTION 'Fixture failed to reproduce the pre-forward-migration LIVE definition.';
  END IF;

  EXECUTE v_def;
  RAISE NOTICE 'PASS fixture: current production checklist-function definition reproduced before forward migration.';
END;
$simulate_live_checklist_definition$;
