-- Permit ADMIN to correct a confirmed FINAL for an active Jornada, including
-- sessions already marked CERRADA_OPERATIVAMENTE while the master Turno is
-- still EN_CURSO. The original closed/cancelled-turn guard remains mandatory.
-- Corrections stay in the audited overlay; physical cuts and global stock remain immutable.
BEGIN;

DO $allow_open_jornada_final_correction$
DECLARE
  v_oid oid;
  v_definition text;
  v_updated text;
  v_pattern text := 'v_s[.]estado[[:space:]]*<>[[:space:]]*''COMPLETADA''';
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
  IF position('coalesce(t.estado_maestro,t.estado)' IN v_definition)=0
     OR position('IN (''CERRADO'',''CANCELADO'')' IN v_definition)=0 THEN
    RAISE EXCEPTION 'La función FINAL no conserva el bloqueo del Turno maestro cerrado/cancelado.';
  END IF;

  IF regexp_count(v_definition,v_pattern)=1 THEN
    v_updated:=regexp_replace(
      v_definition,v_pattern,
      'v_s.estado NOT IN (''COMPLETADA'',''EN_CURSO'',''CERRADA_OPERATIVAMENTE'')'
    );
  ELSE
    v_pattern := 'v_s[.]estado[[:space:]]*!=[[:space:]]*''COMPLETADA''';
    IF regexp_count(v_definition,v_pattern)<>1 THEN
      RAISE EXCEPTION 'No se encontró exactamente una guarda de estado COMPLETADA en la función FINAL.';
    END IF;
    v_updated:=regexp_replace(
      v_definition,v_pattern,
      'v_s.estado NOT IN (''COMPLETADA'',''EN_CURSO'',''CERRADA_OPERATIVAMENTE'')'
    );
  END IF;

  v_updated:=replace(
    v_updated,
    'Solo se corrige el inventario final de una jornada completada.',
    'Solo se corrige el inventario final de una jornada en curso, cerrada operativamente o completada.'
  );

  IF v_updated=v_definition
     OR position('v_s.estado NOT IN (''COMPLETADA'',''EN_CURSO'',''CERRADA_OPERATIVAMENTE'')' IN v_updated)=0
     OR position('coalesce(t.estado_maestro,t.estado)' IN v_updated)=0
     OR position('IN (''CERRADO'',''CANCELADO'')' IN v_updated)=0 THEN
    RAISE EXCEPTION 'La función FINAL no quedó ampliada de forma segura; se cancela la migración.';
  END IF;

  EXECUTE v_updated;
END;
$allow_open_jornada_final_correction$;

NOTIFY pgrst,'reload schema';
COMMIT;
