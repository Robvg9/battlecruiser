-- Keep shared inventory handovers faithful to the effective source FINAL.
-- A destination receipt records physical reality for the destination; it must not
-- silently rewrite a previously closed source FINAL.
BEGIN;

CREATE OR REPLACE FUNCTION public.bc7_preparar_entrega_inventario_jornada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_programacion public.turno_jornada_programacion;
  v_destino uuid;
  v_entrega uuid;
  v_fecha_destino date;
BEGIN
  IF NEW.tipo <> 'FINAL' THEN RETURN NEW; END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=NEW.turno_sesion_id AND bloque='JORNADA'
    AND jornada_programacion_id IS NOT NULL;

  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO v_programacion
  FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_fecha_destino:=coalesce(v_programacion.fecha_fin,v_programacion.fecha)+1;

  SELECT s.id INTO v_destino
  FROM public.turno_sesiones s
  WHERE s.turno_id=v_s.turno_id
    AND s.numero_dia=v_s.numero_dia+1
    AND s.fecha=v_fecha_destino
    AND s.almacen_id=v_s.almacen_id
    AND s.bloque='JORNADA'
    AND s.jornada_programacion_id IS NOT NULL
    AND s.estado IN ('PENDIENTE','PROGRAMADA')
  ORDER BY s.id
  LIMIT 1;

  -- An existing INITIAL is historical and is never linked or rewritten.
  IF v_destino IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=v_destino AND c.tipo='INICIAL'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.turno_jornada_inventario_entregas
    (almacen_id,turno_id,origen_sesion_id,origen_corte_id,destino_sesion_id,fecha_destino,
     estado,creado_por)
  VALUES
    (v_s.almacen_id,v_s.turno_id,v_s.id,NEW.id,v_destino,v_fecha_destino,
     CASE WHEN v_destino IS NULL THEN 'PENDIENTE_PROGRAMACION' ELSE 'PENDIENTE_RECEPCION' END,
     NEW.confirmado_por)
  ON CONFLICT (origen_sesion_id) DO NOTHING
  RETURNING id INTO v_entrega;

  IF v_entrega IS NULL THEN
    SELECT id INTO v_entrega
    FROM public.turno_jornada_inventario_entregas
    WHERE origen_sesion_id=v_s.id;
  END IF;

  -- Copy the current effective FINAL, not only the immutable raw count.
  -- A correction is honored only when it already exists at handover time.
  -- The ON CONFLICT guard makes deferred-trigger retries idempotent while
  -- preserving any delivery that has already had a physical receipt attempt.
  INSERT INTO public.turno_jornada_inventario_entrega_lineas
    (entrega_id,producto_id,cantidad_declarada)
  SELECT v_entrega,l.producto_id,coalesce(c.cantidad_corregida,l.cantidad_contada)
  FROM public.turno_jornada_inventario_lineas l
  LEFT JOIN public.turno_jornada_inventario_correcciones c
    ON c.turno_sesion_id=v_s.id
   AND c.tipo='FINAL'
   AND c.producto_id=l.producto_id
   AND c.vigente=true
  WHERE l.corte_id=NEW.id
  ON CONFLICT (entrega_id,producto_id) DO UPDATE
    SET cantidad_declarada=EXCLUDED.cantidad_declarada,
        cantidad_efectiva=NULL
    WHERE EXISTS (
      SELECT 1
      FROM public.turno_jornada_inventario_entregas e
      WHERE e.id=EXCLUDED.entrega_id
        AND e.estado IN ('PENDIENTE_PROGRAMACION','PENDIENTE_RECEPCION')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.turno_jornada_inventario_recepciones r
      WHERE r.entrega_id=EXCLUDED.entrega_id
    );

  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_eventos
    WHERE tipo='INVENTARIO_ENTREGA_PREPARADA'
      AND estado_despues->>'entrega_id'=v_entrega::text
  ) THEN
    RETURN NEW;
  END IF;

  IF v_entrega IS NOT NULL THEN
    INSERT INTO public.turno_jornada_eventos
      (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
    VALUES
      (v_s.almacen_id,v_s.jornada_programacion_id,NEW.confirmado_por,
       'INVENTARIO_ENTREGA_PREPARADA',
       'Entrega compartida generada desde el inventario final efectivo confirmado.',
       jsonb_build_object('sesion_origen_id',v_s.id,'corte_final_id',NEW.id),
       jsonb_build_object('entrega_id',v_entrega,'sesion_destino_id',v_destino,
         'fecha_destino',v_fecha_destino,'usa_correccion_final_vigente',EXISTS(
           SELECT 1 FROM public.turno_jornada_inventario_correcciones c
           WHERE c.turno_sesion_id=v_s.id AND c.tipo='FINAL' AND c.vigente=true
         )));
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_resolver_entrega_jornada(
  p_entrega_id uuid,
  p_decision text,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_e public.turno_jornada_inventario_entregas;
  v_r public.turno_jornada_inventario_recepciones;
  v_s public.turno_sesiones;
  v_initial uuid;
  v_diferencias integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el dueño puede resolver una diferencia de recepción.' USING ERRCODE='42501';
  END IF;
  IF upper(coalesce(p_decision,'')) NOT IN ('APROBAR','RECHAZAR')
     OR NULLIF(btrim(coalesce(p_motivo,'')),'') IS NULL OR length(p_motivo)>1000 THEN
    RAISE EXCEPTION 'Selecciona aprobar/rechazar y registra el motivo de la decisión.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_e
  FROM public.turno_jornada_inventario_entregas
  WHERE id=p_entrega_id
  FOR UPDATE;
  IF NOT FOUND OR v_e.estado<>'PENDIENTE_REVISION' THEN
    RAISE EXCEPTION 'La entrega no tiene una diferencia pendiente de revisión.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_r
  FROM public.turno_jornada_inventario_recepciones
  WHERE entrega_id=v_e.id
  ORDER BY intento DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND OR v_r.estado<>'PENDIENTE_REVISION' THEN
    RAISE EXCEPTION 'No existe un intento de recepción pendiente.' USING ERRCODE='23514';
  END IF;

  IF upper(p_decision)='APROBAR' THEN
    SELECT count(*)::integer INTO v_diferencias
    FROM public.turno_jornada_inventario_recepcion_lineas rl
    WHERE rl.recepcion_id=v_r.id AND rl.diferencia<>0;

    -- The receipt remains the source of truth for physical differences.
    -- Do not call bc7_corregir_inventario_final_jornada here: a receipt from
    -- the next jornada must not mutate the previous jornada's closed FINAL.
    UPDATE public.turno_jornada_inventario_recepciones
    SET estado='ACEPTADA',decision_por=auth.uid(),
        decision_en=now(),decision_motivo=left(btrim(p_motivo),1000)
    WHERE id=v_r.id
    RETURNING * INTO v_r;

    UPDATE public.turno_jornada_inventario_entrega_lineas dl
    SET cantidad_efectiva=rl.cantidad_recibida
    FROM public.turno_jornada_inventario_recepcion_lineas rl
    WHERE rl.recepcion_id=v_r.id
      AND rl.producto_id=dl.producto_id
      AND dl.entrega_id=v_e.id;

    UPDATE public.turno_jornada_inventario_entregas
    SET estado='ACEPTADA',actualizado_en=now()
    WHERE id=v_e.id;
    v_e.estado:='ACEPTADA';

    -- The destination INITIAL is created from the accepted physical receipt.
    v_initial:=public._bc7_crear_inicial_desde_entrega(
      v_e.id,v_r.id,auth.uid(),
      'Recepción física revisada y aprobada por el dueño: '||left(btrim(p_motivo),900)
    );
  ELSE
    UPDATE public.turno_jornada_inventario_recepciones
    SET estado='RECHAZADA',decision_por=auth.uid(),
        decision_en=now(),decision_motivo=left(btrim(p_motivo),1000)
    WHERE id=v_r.id
    RETURNING * INTO v_r;

    UPDATE public.turno_jornada_inventario_entregas
    SET estado='REQUIERE_RECUENTO',actualizado_en=now()
    WHERE id=v_e.id;
    v_e.estado:='REQUIERE_RECUENTO';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=v_e.destino_sesion_id;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES
    (v_e.almacen_id,v_s.jornada_programacion_id,auth.uid(),
     CASE WHEN upper(p_decision)='APROBAR'
       THEN 'INVENTARIO_RECEPCION_APROBADA'
       ELSE 'INVENTARIO_RECEPCION_RECHAZADA'
     END,
     left(btrim(p_motivo),1000),
     jsonb_build_object('entrega_id',v_e.id,'recepcion_id',v_r.id,
       'estado_anterior','PENDIENTE_REVISION'),
     jsonb_build_object('entrega_id',v_e.id,'recepcion_id',v_r.id,
       'estado',v_e.estado,'inventario_inicial_id',v_initial,
       'productos_final_anterior_corregidos',0,
       'diferencias_registradas_en_recepcion',v_diferencias,
       'corte_final_origen_modificado',false));

  RETURN jsonb_build_object(
    'id',v_e.id,
    'estado',CASE WHEN upper(p_decision)='APROBAR'
      THEN 'ACEPTADA' ELSE 'REQUIERE_RECUENTO' END,
    'recepcion_id',v_r.id,
    'inventario_inicial_id',v_initial,
    'productos_final_anterior_corregidos',0,
    'diferencias_registradas_en_recepcion',v_diferencias,
    'corte_final_origen_modificado',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_preparar_entrega_inventario_jornada() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_resolver_entrega_jornada(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_resolver_entrega_jornada(uuid,text,text) TO authenticated;


-- A correction may be recorded after the handover snapshot was first prepared.
-- Refresh only a handover that has not got a pending or accepted physical receipt.
-- Rejected attempts remain immutable history; a subsequent recount reads the refreshed
-- declared amount from the delivery line.
DO $patch_pending_handover$
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
      SET cantidad_declarada=v_new_qty,cantidad_efectiva=NULL
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
$patch_pending_handover$;

COMMIT;
