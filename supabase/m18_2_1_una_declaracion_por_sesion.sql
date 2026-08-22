-- =============================================================
-- M18.2.1 — UNA DECLARACIÓN DE CAJA POR SESIÓN
--
-- Regla de negocio:
--   Una sesión = un día + un bloque (MANANA o TARDE).
--   Cada sesión admite exactamente una declaración de dinero.
--
-- Por tanto:
--   1 día  -> 1 mañana + 1 tarde = 2 declaraciones máximas.
--   2 días -> 2 mañanas + 2 tardes = 4 declaraciones máximas.
--   5 días -> 5 mañanas + 5 tardes = 10 declaraciones máximas.
--
-- La declaración puede editarse mientras esté DECLARADA.
-- Después de CONTADA no se permite editarla.
-- =============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_entregas_caja_sesion_unica
  ON public.entregas_caja (sesion_id)
  WHERE sesion_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.declarar_entrega_caja(
    p_ciclo_id uuid,
    p_monto_declarado numeric,
    p_sesion_id uuid DEFAULT NULL::uuid,
    p_turno_id uuid DEFAULT NULL::uuid,
    p_almacen_id uuid DEFAULT NULL::uuid,
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
  v_entrega_id uuid;
  v_ciclo record;
  v_almacen_id uuid;
BEGIN
  uid := public._validar_usuario_operacion('entregas_caja','crear');

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Se requiere idempotency_key';
  END IF;

  IF p_monto_declarado IS NULL OR p_monto_declarado < 0 THEN
    RAISE EXCEPTION 'monto_declarado inválido: debe ser mayor o igual a 0.' USING ERRCODE = '23514';
  END IF;

  IF p_sesion_id IS NULL THEN
    RAISE EXCEPTION 'La declaración debe estar asociada a una sesión (día y bloque).' USING ERRCODE = '23514';
  END IF;

  SELECT id, almacen_id, estado INTO v_ciclo
  FROM public.ciclos_operativos WHERE id = p_ciclo_id;
  IF v_ciclo.id IS NULL THEN
    RAISE EXCEPTION 'Ciclo operativo no encontrado.' USING ERRCODE = '23503';
  END IF;

  v_almacen_id := COALESCE(p_almacen_id, v_ciclo.almacen_id);
  IF v_almacen_id <> v_ciclo.almacen_id THEN
    RAISE EXCEPTION 'El almacén indicado no coincide con el almacén del ciclo.' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sesiones_ciclo
    WHERE id = p_sesion_id AND ciclo_id = p_ciclo_id
  ) THEN
    RAISE EXCEPTION 'La sesión indicada no pertenece al ciclo indicado.' USING ERRCODE = '23514';
  END IF;

  IF p_turno_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.turnos
    WHERE id = p_turno_id AND almacen_id = v_almacen_id
  ) THEN
    RAISE EXCEPTION 'El turno indicado no pertenece al almacén del ciclo.' USING ERRCODE = '23514';
  END IF;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key, uid, 'declarar_entrega_caja',
    jsonb_build_object(
      'ciclo_id', p_ciclo_id,
      'sesion_id', p_sesion_id,
      'turno_id', p_turno_id,
      'almacen_id', v_almacen_id,
      'monto_declarado', p_monto_declarado
    )
  );
  IF v_idempotente IS NOT NULL THEN
    RETURN public._entrega_caja_json(v_idempotente) || jsonb_build_object('idempotente', true);
  END IF;

  INSERT INTO public.entregas_caja (
    ciclo_id, sesion_id, turno_id, almacen_id,
    monto_declarado, declarado_por, declarado_nombre, estado
  ) VALUES (
    p_ciclo_id, p_sesion_id, p_turno_id, v_almacen_id,
    p_monto_declarado, uid,
    (SELECT nombre FROM public.usuarios WHERE id = uid),
    'DECLARADA'
  ) RETURNING id INTO v_entrega_id;

  UPDATE private.operaciones_idempotencia
  SET resultado_id = v_entrega_id
  WHERE idempotency_key = p_idempotency_key;

  PERFORM public.registrar_auditoria(
    'entrega_caja', 'Entrega de caja declarada por ' || uid,
    'exito', v_entrega_id::text, p_idempotency_key, NULL
  );

  RETURN public._entrega_caja_json(v_entrega_id);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Esta sesión ya tiene una declaración de dinero. Podés editar la declaración existente mientras esté pendiente de revisión.' USING ERRCODE = '23505';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.declarar_entrega_caja(uuid, numeric, uuid, uuid, uuid, uuid) TO authenticated;

-- =============================================================
-- FIN M18.2.1
-- =============================================================
