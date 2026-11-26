-- Permit an ADMIN to correct an already-confirmed FINAL while its Jornada
-- remains EN_CURSO. The existing RPC continues to write an audited overlay;
-- the immutable physical cut, global stock and movement ledger stay untouched.
BEGIN;

DO $allow_open_jornada_final_correction$
DECLARE
  v_oid oid;
  v_definition text;
  v_updated text;
  v_pattern text := 'v_s\\.estado\\s*<>\\s*''COMPLETADA''';
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid)
    INTO v_oid,v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='bc7_corregir_inventario_final_jornada'
  ORDER BY p.oid
  LIMIT 1;

  IF v_oid IS NULL OR v_definition IS NULL THEN
    RAISE EXCEPTION 'No se encontró bc7_corregir_inventario_final_jornada; no se aplica un parche especulativo.';
  END IF;
  IF position('bc_actor_is_admin' IN v_definition)=0
     OR position('turno_jornada_inventario_correcciones' IN v_definition)=0
     OR position('tipo=''FINAL''' IN v_definition)=0 THEN
    RAISE EXCEPTION 'La función FINAL no contiene los controles de ADMIN y auditoría esperados.';
  END IF;

  IF regexp_count(v_definition,v_pattern)=1 THEN
    v_updated:=regexp_replace(
      v_definition,v_pattern,
      'v_s.estado NOT IN (''COMPLETADA'',''EN_CURSO'')'
    );
  ELSE
    v_pattern := 'v_s\\.estado\\s*!=\\s*''COMPLETADA''';
    IF regexp_count(v_definition,v_pattern)<>1 THEN
      RAISE EXCEPTION 'No se encontró exactamente una guarda de estado COMPLETADA en la función FINAL.';
    END IF;
    v_updated:=regexp_replace(
      v_definition,v_pattern,
      'v_s.estado NOT IN (''COMPLETADA'',''EN_CURSO'')'
    );
  END IF;

  v_updated:=replace(
    v_updated,
    'Solo se corrige el inventario final de una jornada completada.',
    'Solo se corrige el inventario final de una jornada abierta o completada.'
  );

  IF v_updated=v_definition THEN
    RAISE EXCEPTION 'La función FINAL no cambió; se cancela la migración.';
  END IF;

  EXECUTE v_updated;
END;
$allow_open_jornada_final_correction$;

NOTIFY pgrst,'reload schema';
COMMIT;
