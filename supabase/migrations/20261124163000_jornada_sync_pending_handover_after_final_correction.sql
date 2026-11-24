BEGIN;

-- When the Owner corrects a FINAL physical count after the outgoing handover
-- was prepared, keep an unprogrammed handover synchronized with that corrected
-- count. Once a handover is linked to a destination or leaves
-- PENDIENTE_PROGRAMACION, it is immutable here and follows the normal receipt
-- / recount workflow instead.
CREATE OR REPLACE FUNCTION public.bc7_sync_pending_handover_after_final_correction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_session_id uuid;
  v_product_id uuid;
  v_actor_id uuid;
  v_session public.turno_sesiones;
  v_delivery record;
  v_quantity numeric;
  v_old_quantity numeric;
BEGIN
  IF TG_OP='DELETE' THEN
    v_session_id:=OLD.turno_sesion_id;
    v_product_id:=OLD.producto_id;
    v_actor_id:=OLD.creado_por;
    IF OLD.tipo<>'FINAL' THEN RETURN OLD; END IF;
  ELSE
    v_session_id:=NEW.turno_sesion_id;
    v_product_id:=NEW.producto_id;
    v_actor_id:=NEW.creado_por;
    IF NEW.tipo<>'FINAL' THEN RETURN NEW; END IF;
  END IF;

  SELECT * INTO v_session
  FROM public.turno_sesiones
  WHERE id=v_session_id;

  IF NOT FOUND THEN
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;

  FOR v_delivery IN
    SELECT e.id,e.turno_id,e.almacen_id,e.origen_corte_id
    FROM public.turno_jornada_inventario_entregas e
    WHERE e.origen_sesion_id=v_session_id
      AND e.estado='PENDIENTE_PROGRAMACION'
      AND e.destino_sesion_id IS NULL
    FOR UPDATE
  LOOP
    SELECT coalesce(
      (
        SELECT c.cantidad_corregida
        FROM public.turno_jornada_inventario_correcciones c
        WHERE c.turno_sesion_id=v_session_id
          AND c.tipo='FINAL'
          AND c.producto_id=v_product_id
          AND c.vigente
        ORDER BY c.creado_en DESC,c.id DESC
        LIMIT 1
      ),
      (
        SELECT l.cantidad_contada
        FROM public.turno_jornada_inventario_cortes cut
        JOIN public.turno_jornada_inventario_lineas l ON l.corte_id=cut.id
        WHERE cut.id=v_delivery.origen_corte_id
          AND cut.turno_sesion_id=v_session_id
          AND cut.tipo='FINAL'
          AND cut.estado='CONFIRMADO'
          AND l.producto_id=v_product_id
        LIMIT 1
      )
    ) INTO v_quantity;

    IF v_quantity IS NULL THEN
      CONTINUE;
    END IF;

    SELECT l.cantidad_declarada INTO v_old_quantity
    FROM public.turno_jornada_inventario_entrega_lineas l
    WHERE l.entrega_id=v_delivery.id
      AND l.producto_id=v_product_id
    FOR UPDATE;

    IF NOT FOUND OR v_old_quantity IS NOT DISTINCT FROM v_quantity THEN
      CONTINUE;
    END IF;

    UPDATE public.turno_jornada_inventario_entrega_lineas
    SET cantidad_declarada=v_quantity
    WHERE entrega_id=v_delivery.id
      AND producto_id=v_product_id;

    UPDATE public.turno_jornada_inventario_entregas
    SET actualizado_en=now()
    WHERE id=v_delivery.id;

    INSERT INTO public.turno_eventos(
      turno_id,turno_sesion_id,actor_user_id,tipo,payload
    ) VALUES(
      v_delivery.turno_id,v_session_id,coalesce(auth.uid(),v_actor_id),
      'INVENTARIO_ENTREGA_PENDIENTE_SINCRONIZADA_CORTE_FINAL',
      jsonb_build_object(
        'entrega_id',v_delivery.id,
        'corte_id',v_delivery.origen_corte_id,
        'producto_id',v_product_id,
        'cantidad_anterior',v_old_quantity,
        'cantidad_actualizada',v_quantity,
        'motivo','El corte final recibió una rectificación auditada antes de programar la entrega.'
      )
    );
  END LOOP;

  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS bc7_sync_pending_handover_after_final_correction
  ON public.turno_jornada_inventario_correcciones;

CREATE TRIGGER bc7_sync_pending_handover_after_final_correction
AFTER INSERT OR UPDATE OR DELETE
ON public.turno_jornada_inventario_correcciones
FOR EACH ROW
EXECUTE FUNCTION public.bc7_sync_pending_handover_after_final_correction();

COMMIT;
