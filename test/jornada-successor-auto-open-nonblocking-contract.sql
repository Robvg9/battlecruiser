BEGIN;

DO $contract$
DECLARE
  v_receipt text:=pg_get_functiondef('public.bc7_recibir_entrega_jornada(uuid,jsonb,text,uuid)'::regprocedure);
  v_open text:=pg_get_functiondef('public._bc7_iniciar_sucesora_si_corresponde(uuid,uuid)'::regprocedure);
  v_public_open text:=pg_get_functiondef('public.bc7_asegurar_inicio_sucesora_programada(uuid)'::regprocedure);
  v_processor text:=pg_get_functiondef('public.bc7_procesar_sucesoras_programadas()'::regprocedure);
  v_correct text:=pg_get_functiondef('public._bc7_rectificar_final_anterior_desde_recepcion(uuid,uuid,uuid)'::regprocedure);
  v_detail text:=pg_get_functiondef('public.bc7_obtener_inventario_jornada(uuid)'::regprocedure);
  v_command text;
BEGIN
  IF position('_bc7_rectificar_final_anterior_desde_recepcion' IN v_receipt)=0
     OR strpos(v_receipt,'requiere_revision')=0
     OR strpos(v_receipt,'diferencias_informativas')=0
     OR position('ACEPTADA',v_receipt)=0 THEN
    RAISE EXCEPTION 'FAIL: receipt must accept and expose differences as informational, with traceable previous-final reconciliation';
  END IF;
  IF position('INVENTARIO_RECEPCION_DISCREPANCIAS_INFORMATIVAS' IN v_receipt)=0 THEN
    RAISE EXCEPTION 'FAIL: receipt difference event must be recorded';
  END IF;
  IF position('UPDATE PUBLIC.STOCK' IN upper(v_correct))>0
     OR position('UPDATE PUBLIC.TURNO_JORNADA_INVENTARIO_LINEAS' IN upper(v_correct))>0 THEN
    RAISE EXCEPTION 'FAIL: previous FINAL corrections must be overlays, never mutate stock or original cut lines';
  END IF;
  IF position('turno_jornada_inventario_correcciones' IN v_correct)=0
     OR position('movimientos_intermedios_detectados' IN v_correct)=0 THEN
    RAISE EXCEPTION 'FAIL: correction helper must create audited overlays and detect movements between cuts';
  END IF;
  IF position('PENDIENTE_REVISION' IN v_correct)=0 THEN
    RAISE EXCEPTION 'FAIL: reconciliation helper must be scoped to a physical receipt record';
  END IF;
  IF position('clock_timestamp()' IN v_open)=0
     OR position('hora_inicio_prevista' IN v_open)=0
     OR position('bc5_cerrar_jornadas_operativas_vencidas' IN v_open)=0
     OR position('RESPONSABLE_CON_TRAMO_ACTIVO' IN v_open)=0 THEN
    RAISE EXCEPTION 'FAIL: automatic opening must preserve scheduled start, existing seal and active-responsible guards';
  END IF;
  IF position('bc7_asegurar_inicio_sucesora_programada' IN v_public_open)=0
     OR position('responsable_id' IN v_public_open)=0 THEN
    RAISE EXCEPTION 'FAIL: assigned responsible/Owner must be able to ensure due successor opening';
  END IF;
  IF position('_bc7_iniciar_sucesora_si_corresponde' IN v_processor)=0
     OR position('LIMIT 100' IN v_processor)=0
     OR position('FOR UPDATE OF s SKIP LOCKED' IN v_processor)=0 THEN
    RAISE EXCEPTION 'FAIL: minute processor must safely start due successors in bounded, locked batches';
  END IF;
  IF position('alertas_continuidad' IN v_detail)=0
     OR position('JORNADA_INVENTARIO_DISCREPANCIA_CONTINUIDAD' IN v_detail)=0 THEN
    RAISE EXCEPTION 'FAIL: previous and successor Jornadas must expose durable continuity alerts';
  END IF;
  IF to_regclass('cron.job') IS NOT NULL THEN
    SELECT command INTO v_command
    FROM cron.job
    WHERE jobname='battlecruiser-jornada-operational-seal' AND active;
    IF v_command IS NULL OR position('bc7_procesar_sucesoras_programadas' IN v_command)=0 THEN
      RAISE EXCEPTION 'FAIL: existing minute cron must process due successors and operational seals';
    END IF;
  END IF;
  IF has_function_privilege('anon','public.bc7_asegurar_inicio_sucesora_programada(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anonymous callers must not auto-open a Jornada';
  END IF;
  IF NOT has_function_privilege('authenticated','public.bc7_asegurar_inicio_sucesora_programada(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated responsible/Owner must be able to open a due successor';
  END IF;
END
$contract$;

ROLLBACK;
