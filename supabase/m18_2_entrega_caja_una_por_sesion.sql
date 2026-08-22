-- M18.2 — una entrega de caja por sesión + edición mientras DECLARADA
CREATE UNIQUE INDEX IF NOT EXISTS uq_entregas_caja_sesion_unica ON public.entregas_caja (sesion_id) WHERE sesion_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.editar_entrega_caja(p_entrega_id uuid,p_monto_declarado numeric,p_idempotency_key uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
DECLARE uid uuid; e record; v_idempotente uuid;
BEGIN
 uid:=public._validar_usuario_operacion('entregas_caja','editar');
 IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Se requiere idempotency_key'; END IF;
 IF p_monto_declarado IS NULL OR p_monto_declarado<0 THEN RAISE EXCEPTION 'monto_declarado inválido: debe ser mayor o igual a 0.' USING ERRCODE='23514'; END IF;
 v_idempotente:=private.reclamar_idempotencia(p_idempotency_key,uid,'editar_entrega_caja',jsonb_build_object('entrega_id',p_entrega_id,'monto_declarado',p_monto_declarado));
 IF v_idempotente IS NOT NULL THEN RETURN public._entrega_caja_json(v_idempotente)||jsonb_build_object('idempotente',true); END IF;
 SELECT * INTO e FROM public.entregas_caja WHERE id=p_entrega_id FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'La entrega de caja no existe.' USING ERRCODE='23503'; END IF;
 IF e.estado<>'DECLARADA' THEN RAISE EXCEPTION 'Solo se puede editar una entrega todavía pendiente de revisión. Estado actual: %.',e.estado USING ERRCODE='23514'; END IF;
 UPDATE public.entregas_caja SET monto_declarado=p_monto_declarado,fecha_declaracion=now(),actualizado_en=now() WHERE id=p_entrega_id;
 UPDATE private.operaciones_idempotencia SET resultado_id=p_entrega_id WHERE idempotency_key=p_idempotency_key;
 PERFORM public.registrar_auditoria('entrega_caja','Entrega de caja editada por '||uid,'exito',p_entrega_id::text,p_idempotency_key,jsonb_build_object('monto_declarado',p_monto_declarado));
 RETURN public._entrega_caja_json(p_entrega_id);
END; $function$;
GRANT EXECUTE ON FUNCTION public.editar_entrega_caja(uuid,numeric,uuid) TO authenticated;

-- declarar_entrega_caja en producción también reutiliza la entrega existente
-- cuando la sesión ya tiene una declaración en estado DECLARADA; si ya fue
-- CONTADA/APROBADA/RECHAZADA, no permite crear una segunda declaración.