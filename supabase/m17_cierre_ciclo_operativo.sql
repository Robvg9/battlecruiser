-- =====================================================================
-- M17 — Cierre de ciclo operativo (finalizar_ciclo_operativo)
-- =====================================================================
-- Extraído textualmente vía pg_get_functiondef contra el proyecto
-- Supabase real "battlecruiser" (papxnkkjtkxsitcsvcme) el 21/08/2026,
-- tras confirmar en vivo el estado de producción y correr las pruebas
-- funcionales A-E dentro de una transacción con ROLLBACK (sin dejar
-- datos de prueba en producción).
--
-- Reglas de negocio confirmadas:
--   * Solo se puede finalizar un ciclo en estado EN_VALIDACION.
--   * Bloquea la finalización: cualquier entrega_caja en estado
--     DECLARADA o CONTADA, o cualquier cuadre que no esté en estado
--     APROBADO o RECHAZADO (ver obtener_pendientes_cierre_ciclo).
--   * Una entrega_caja RECHAZADA NO bloquea el cierre: se considera
--     resuelta (ya fue revisada), igual que una APROBADA.
--   * fin_plan es una columna GENERATED (inicio_plan + cantidad_dias - 1)
--     en el esquema real de producción: finalizar_ciclo_operativo NO la
--     escribe, solo actualiza `estado`.
--   * Reintentar la finalización de un ciclo ya VALIDADO/ARCHIVADO
--     lanza excepción (23514), salvo que se reutilice la MISMA
--     idempotency_key de la llamada original (respuesta idempotente).
--
-- Dependencias externas ya existentes (no se recrean acá):
--   public._validar_usuario_operacion(seccion, accion)
--   public._ciclo_operativo_json(ciclo_id)
--   public.obtener_pendientes_cierre_ciclo(ciclo_id)   [M16]
--   private.reclamar_idempotencia(key, uid, accion, payload)
--   private.operaciones_idempotencia
--   public.registrar_auditoria(...)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) obtener_pendientes_cierre_ciclo
--    (parte de M16, se incluye acá porque finalizar_ciclo_operativo
--    depende directamente de ella para decidir si puede cerrar)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_pendientes_cierre_ciclo(p_ciclo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_entregas_pendientes jsonb;
  v_cuadres_pendientes jsonb;
BEGIN
  PERFORM public._validar_usuario_operacion('ciclos','ver');

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'estado', e.estado)), '[]'::jsonb)
  INTO v_entregas_pendientes
  FROM public.entregas_caja e
  WHERE e.ciclo_id = p_ciclo_id AND e.estado IN ('DECLARADA','CONTADA');

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'turno_id', c.turno_id, 'estado', c.estado)), '[]'::jsonb)
  INTO v_cuadres_pendientes
  FROM public.cuadres c
  JOIN public.turnos t ON t.id = c.turno_id
  WHERE t.ciclo_id = p_ciclo_id AND c.estado NOT IN ('APROBADO','RECHAZADO');

  RETURN jsonb_build_object(
    'ciclo_id', p_ciclo_id,
    'entregas_pendientes', v_entregas_pendientes,
    'cuadres_pendientes', v_cuadres_pendientes,
    'puede_finalizar', (jsonb_array_length(v_entregas_pendientes) = 0 AND jsonb_array_length(v_cuadres_pendientes) = 0)
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 2) finalizar_ciclo_operativo
--    Incluye el ajuste de esquema real: fin_plan es GENERATED, por lo
--    que el UPDATE final solo toca `estado`.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalizar_ciclo_operativo(p_ciclo_id uuid, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid;
  v_idempotente uuid;
  v_ciclo record;
  v_pendientes jsonb;
BEGIN
  uid := public._validar_usuario_operacion('ciclos','editar_any');

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Se requiere idempotency_key';
  END IF;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key, uid, 'finalizar_ciclo_operativo',
    jsonb_build_object('ciclo_id', p_ciclo_id)
  );
  IF v_idempotente IS NOT NULL THEN
    RETURN public._ciclo_operativo_json(v_idempotente) || jsonb_build_object('idempotente', true);
  END IF;

  SELECT * INTO v_ciclo FROM public.ciclos_operativos WHERE id = p_ciclo_id;
  IF v_ciclo.id IS NULL THEN
    RAISE EXCEPTION 'Ciclo operativo no encontrado.' USING ERRCODE = '23503';
  END IF;

  IF v_ciclo.estado = 'VALIDADO' OR v_ciclo.estado = 'ARCHIVADO' THEN
    RAISE EXCEPTION 'El ciclo ya fue finalizado (estado: %).', v_ciclo.estado USING ERRCODE = '23514';
  END IF;

  IF v_ciclo.estado <> 'EN_VALIDACION' THEN
    RAISE EXCEPTION 'Solo se puede finalizar un ciclo en estado EN_VALIDACION (actual: %). Usá iniciar_ciclo_operativo / iniciar_validacion_ciclo_operativo primero.', v_ciclo.estado
      USING ERRCODE = '23514';
  END IF;

  v_pendientes := public.obtener_pendientes_cierre_ciclo(p_ciclo_id);

  IF NOT (v_pendientes->>'puede_finalizar')::boolean THEN
    RAISE EXCEPTION 'No se puede finalizar el ciclo: hay % entrega(s) de caja y % cuadre(s) pendientes de validación.',
      jsonb_array_length(v_pendientes->'entregas_pendientes'),
      jsonb_array_length(v_pendientes->'cuadres_pendientes')
      USING ERRCODE = '23514', DETAIL = v_pendientes::text;
  END IF;

  -- fin_plan es columna GENERATED (inicio_plan + cantidad_dias - 1) en el
  -- esquema real de producción: no se escribe, solo el estado.
  UPDATE public.ciclos_operativos
  SET estado = 'VALIDADO'
  WHERE id = p_ciclo_id;

  UPDATE private.operaciones_idempotencia SET resultado_id = p_ciclo_id WHERE idempotency_key = p_idempotency_key;
  PERFORM public.registrar_auditoria('ciclo_operativo', 'Ciclo operativo finalizado (VALIDADO) por ' || uid, 'exito', p_ciclo_id::text, p_idempotency_key, NULL);

  RETURN public._ciclo_operativo_json(p_ciclo_id);
END;
$function$;

-- =====================================================================
-- REGISTRO DE PRUEBAS (21/08/2026, contra papxnkkjtkxsitcsvcme,
-- BEGIN...ROLLBACK — confirmado sin datos residuales en producción)
-- =====================================================================
-- A. Ciclo sin pendientes (PLANIFICADO→ACTIVO→EN_VALIDACION→finalizar)
--    → PASS: estado final VALIDADO.
-- B. Entrega DECLARADA presente → finalizar_ciclo_operativo lanza
--    excepción 23514 ("hay 1 entrega(s) de caja ... pendientes")
--    → PASS: bloqueó correctamente.
-- C. Entrega CONTADA presente → misma excepción 23514
--    → PASS: bloqueó correctamente.
-- D. Entrega RECHAZADA presente (declarada→contada→rechazada por un
--    segundo usuario, ya que no se puede revisar la propia entrega)
--    → PASS: el ciclo finalizó igual (VALIDADO). Comportamiento
--    correcto y documentado: RECHAZADA se considera una entrega ya
--    resuelta, no pendiente.
-- E. Segunda finalización sobre un ciclo ya VALIDADO (con
--    idempotency_key distinta a la original) → excepción 23514
--    ("El ciclo ya fue finalizado (estado: VALIDADO)")
--    → PASS: bloqueó correctamente la doble finalización.
-- F. M14 (abrir_turno, cerrar_turno, registrar_venta, registrar_cuadre,
--    revisar_cuadre): firmas verificadas intactas en catálogo, sin
--    tocar ni un archivo de M14 → PASS.
-- G. M15 (crear_ciclo_operativo, iniciar_ciclo_operativo,
--    iniciar_validacion_ciclo_operativo, _ciclo_operativo_json):
--    ejercitadas en vivo por las pruebas A-E sin errores → PASS.
-- H. M16 (declarar_entrega_caja, registrar_conteo_entrega_caja,
--    revisar_entrega_caja, obtener_pendientes_cierre_ciclo):
--    ejercitadas en vivo por las pruebas B-D sin errores → PASS.
-- =====================================================================
