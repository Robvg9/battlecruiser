-- Keep an unreceived shared handover aligned with an owner-approved correction
-- to the source jornada FINAL. Never rewrite a pending or accepted physical receipt.
BEGIN;

DO $patch_trigger$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_preparar_entrega_inventario_jornada()'::regprocedure)
    INTO v_definition;

  v_old := $old$SELECT v_entrega,l.producto_id,l.cantidad_contada
  FROM public.turno_jornada_inventario_lineas l
  WHERE l.corte_id=NEW.id$old$;
  v_new := $new$SELECT v_entrega,l.producto_id,coalesce(c.cantidad_corregida,l.cantidad_contada)
  FROM public.turno_jornada_inventario_lineas l
  LEFT JOIN public.turno_jornada_inventario_correcciones c
    ON c.turno_sesion_id=v_s.id
   AND c.tipo='FINAL'
   AND c.producto_id=l.producto_id
   AND c.vigente=true
  WHERE l.corte_id=NEW.id$new$;

  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo localizar de forma única el snapshot FINAL del trigger de entrega compartida.';
  END IF;

  EXECUTE replace(v_definition,v_old,v_new);
END;
$patch_trigger$;

DO $patch_correction$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_corregir_inventario_final_jornada(uuid,jsonb,text)'::regprocedure
  ) INTO v_definition;

  v_old := $old$v_old_qty numeric;
  v_count integer:=0;$old$;
  v_new := $new$v_old_qty numeric;
  v_delivery_id uuid;
  v_delivery_old_qty numeric;
  v_count integer:=0;$new$;

  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo localizar de forma única la declaración de la función de corrección FINAL.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$VALUES(v_s.id,'FINAL',v_product_id,v_old_qty,v_new_qty,btrim(p_comentario),auth.uid());
    v_count:=v_count+1;$old$;
  v_new := $new$VALUES(v_s.id,'FINAL',v_product_id,v_old_qty,v_new_qty,btrim(p_comentario),auth.uid());

    -- A corrected FINAL may refresh its pending handover only before any physical
    -- receipt is pending or accepted. Rejected attempts remain historical; a new
    -- attempt will use the refreshed declaration.
    SELECT e.id,dl.cantidad_declarada
      INTO v_delivery_id,v_delivery_old_qty
    FROM public.turno_jornada_inventario_entregas e
    JOIN public.turno_jornada_inventario_entrega_lineas dl ON dl.entrega_id=e.id
    WHERE e.origen_sesion_id=v_s.id
      AND dl.producto_id=v_product_id
      AND e.estado IN ('PENDIENTE_PROGRAMACION','PENDIENTE_RECEPCION','REQUIERE_RECUENTO')
      AND NOT EXISTS (
        SELECT 1
        FROM public.turno_jornada_inventario_recepciones r
        WHERE r.entrega_id=e.id
          AND r.estado IN ('PENDIENTE_REVISION','ACEPTADA')
      )
    FOR UPDATE OF e,dl;

    IF FOUND AND v_delivery_old_qty IS DISTINCT FROM v_new_qty THEN
      UPDATE public.turno_jornada_inventario_entrega_lineas
      SET cantidad_declarada=v_new_qty
      WHERE entrega_id=v_delivery_id AND producto_id=v_product_id;

      INSERT INTO public.turno_jornada_eventos(
        almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
      ) VALUES(
        v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),
        'INVENTARIO_ENTREGA_SINCRONIZADA_CORRECCION_FINAL',
        'Entrega pendiente actualizada tras corregir el inventario FINAL antes de la recepción física.',
        jsonb_build_object(
          'entrega_id',v_delivery_id,
          'producto_id',v_product_id,
          'cantidad_declarada_anterior',v_delivery_old_qty
        ),
        jsonb_build_object(
          'entrega_id',v_delivery_id,
          'producto_id',v_product_id,
          'cantidad_declarada_actualizada',v_new_qty,
          'sin_recepcion_pendiente_o_aceptada',true
        )
      );
    END IF;

    v_count:=v_count+1;$new$;

  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo localizar de forma única el punto de inserción de la sincronización de entrega.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END;
$patch_correction$;

COMMIT;
