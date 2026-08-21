-- =================================================================
-- M15.1 — COMPLETAR VERSIONADO DE m15_ciclos_operativos.sql
--
-- Este archivo NO es una migración de negocio nueva: ambas funciones
-- YA EXISTEN en producción (proyecto Supabase "battlecruiser",
-- papxnkkjtkxsitcsvcme), creadas por la migración real
-- 20260821125355_m15_ciclos_operativos. El archivo versionado en el
-- repo (supabase/m15_ciclos_operativos.sql) documentaba solo 4 de
-- las 6 funciones de esa migración (crear_ciclo_operativo,
-- listar_ciclos_operativos, obtener_ciclo_operativo,
-- _ciclo_operativo_json) y dejaba fuera estas dos. Este archivo
-- cierra ese gap de versionado GitHub ↔ Supabase.
--
-- Extraído textualmente vía pg_get_functiondef contra producción el
-- 2026-08-21. CREATE OR REPLACE de una función que ya existe con
-- exactamente este cuerpo: aplicarlo es un no-op funcional, solo
-- deja el repo fiel a la realidad.
--
-- No modifica tablas, RLS, permisos ni grants. No cambia lógica de
-- negocio (0 líneas distintas al cuerpo real verificado).
-- =================================================================

-- -----------------------------------------------------------------
-- RPC: iniciar_ciclo_operativo
-- Transición de estado: PLANIFICADO -> ACTIVO
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iniciar_ciclo_operativo(
    p_ciclo_id uuid,
    p_idempotency_key uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid;
  v_idempotente uuid;
  v_ciclo record;
BEGIN
  uid := public._validar_usuario_operacion('ciclos','editar');

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Se requiere idempotency_key';
  END IF;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key, uid, 'iniciar_ciclo_operativo',
    jsonb_build_object('ciclo_id', p_ciclo_id)
  );
  IF v_idempotente IS NOT NULL THEN
    RETURN public._ciclo_operativo_json(v_idempotente) || jsonb_build_object('idempotente', true);
  END IF;

  SELECT * INTO v_ciclo FROM public.ciclos_operativos WHERE id = p_ciclo_id;
  IF v_ciclo.id IS NULL THEN
    RAISE EXCEPTION 'Ciclo operativo no encontrado.' USING ERRCODE = '23503';
  END IF;

  IF v_ciclo.estado <> 'PLANIFICADO' THEN
    RAISE EXCEPTION 'Solo se puede iniciar un ciclo en estado PLANIFICADO (actual: %).', v_ciclo.estado
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.ciclos_operativos SET estado = 'ACTIVO' WHERE id = p_ciclo_id;

  UPDATE private.operaciones_idempotencia SET resultado_id = p_ciclo_id WHERE idempotency_key = p_idempotency_key;
  PERFORM public.registrar_auditoria('ciclo_operativo', 'Ciclo operativo iniciado (ACTIVO) por ' || uid, 'exito', p_ciclo_id::text, p_idempotency_key, NULL);

  RETURN public._ciclo_operativo_json(p_ciclo_id);
END;
$function$;

-- -----------------------------------------------------------------
-- RPC: iniciar_validacion_ciclo_operativo
-- Transición de estado: ACTIVO -> EN_VALIDACION
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iniciar_validacion_ciclo_operativo(
    p_ciclo_id uuid,
    p_idempotency_key uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid;
  v_idempotente uuid;
  v_ciclo record;
BEGIN
  uid := public._validar_usuario_operacion('ciclos','editar');

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Se requiere idempotency_key';
  END IF;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key, uid, 'iniciar_validacion_ciclo_operativo',
    jsonb_build_object('ciclo_id', p_ciclo_id)
  );
  IF v_idempotente IS NOT NULL THEN
    RETURN public._ciclo_operativo_json(v_idempotente) || jsonb_build_object('idempotente', true);
  END IF;

  SELECT * INTO v_ciclo FROM public.ciclos_operativos WHERE id = p_ciclo_id;
  IF v_ciclo.id IS NULL THEN
    RAISE EXCEPTION 'Ciclo operativo no encontrado.' USING ERRCODE = '23503';
  END IF;

  IF v_ciclo.estado <> 'ACTIVO' THEN
    RAISE EXCEPTION 'Solo se puede pasar a validación un ciclo en estado ACTIVO (actual: %).', v_ciclo.estado
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.ciclos_operativos SET estado = 'EN_VALIDACION' WHERE id = p_ciclo_id;

  UPDATE private.operaciones_idempotencia SET resultado_id = p_ciclo_id WHERE idempotency_key = p_idempotency_key;
  PERFORM public.registrar_auditoria('ciclo_operativo', 'Ciclo operativo pasó a EN_VALIDACION por ' || uid, 'exito', p_ciclo_id::text, p_idempotency_key, NULL);

  RETURN public._ciclo_operativo_json(p_ciclo_id);
END;
$function$;

-- =================================================================
-- FIN M15.1 — Con esto, m15_ciclos_operativos.sql + m15_1_completar_versionado.sql
-- documentan las 6 funciones reales de la migración 20260821125355.
-- =================================================================
