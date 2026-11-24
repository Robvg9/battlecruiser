BEGIN;

-- A pending successor inherits the exact confirmed FINAL cut, not today's
-- active product catalogue. The product set and quantities are a historical
-- snapshot; products added later must never invalidate an older delivery.
CREATE OR REPLACE FUNCTION public.bc7_sync_pending_handover_product_from_final(
  p_corte_id uuid,
  p_producto_id uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_session_id uuid;
  v_cut_creator uuid;
  v_delivery_id uuid;
  v_turn_id uuid;
  v_actor_id uuid;
  v_quantity numeric;
  v_old_quantity numeric;
  v_old_effective numeric;
  v_line_id uuid;
  v_has_line boolean := false;
  v_action text;
BEGIN
  SELECT c.turno_sesion_id,c.creado_por
  INTO v_session_id,v_cut_creator
  FROM public.turno_jornada_inventario_cortes c
  WHERE c.id=p_corte_id
    AND c.tipo='FINAL'
    AND c.estado='CONFIRMADO';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT e.id,e.turno_id
  INTO v_delivery_id,v_turn_id
  FROM public.turno_jornada_inventario_entregas e
  WHERE e.origen_sesion_id=v_session_id
    AND e.origen_corte_id=p_corte_id
    AND e.estado='PENDIENTE_PROGRAMACION'
    AND e.destino_sesion_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- An active, audited Owner correction overrides the immutable physical line.
  -- Otherwise the confirmed FINAL line remains the source of truth.
  SELECT coalesce(
    (
      SELECT correction.cantidad_corregida
      FROM public.turno_jornada_inventario_correcciones correction
      WHERE correction.turno_sesion_id=v_session_id
        AND correction.tipo='FINAL'
        AND correction.producto_id=p_producto_id
        AND correction.vigente
      ORDER BY correction.creado_en DESC,correction.id DESC
      LIMIT 1
    ),
    (
      SELECT source_line.cantidad_contada
      FROM public.turno_jornada_inventario_lineas source_line
      WHERE source_line.corte_id=p_corte_id
        AND source_line.producto_id=p_producto_id
      LIMIT 1
    )
  )
  INTO v_quantity;

  SELECT delivery_line.id,
         delivery_line.cantidad_declarada,
         delivery_line.cantidad_efectiva
  INTO v_line_id,v_old_quantity,v_old_effective
  FROM public.turno_jornada_inventario_entrega_lineas delivery_line
  WHERE delivery_line.entrega_id=v_delivery_id
    AND delivery_line.producto_id=p_producto_id
  FOR UPDATE;

  v_has_line := FOUND;
  v_actor_id := coalesce(p_actor_id,auth.uid(),v_cut_creator);

  IF v_quantity IS NULL THEN
    IF NOT v_has_line THEN
      RETURN false;
    END IF;

    DELETE FROM public.turno_jornada_inventario_entrega_lineas
    WHERE id=v_line_id;

    v_action := 'DELETE';
  ELSIF NOT v_has_line THEN
    INSERT INTO public.turno_jornada_inventario_entrega_lineas(
      entrega_id,producto_id,cantidad_declarada,cantidad_efectiva
    ) VALUES (
      v_delivery_id,p_producto_id,v_quantity,NULL
    );

    v_action := 'INSERT';
  ELSIF v_old_quantity IS DISTINCT FROM v_quantity
     OR v_old_effective IS NOT NULL THEN
    UPDATE public.turno_jornada_inventario_entrega_lineas
    SET cantidad_declarada=v_quantity,
        cantidad_efectiva=NULL
    WHERE id=v_line_id;

    v_action := 'UPDATE';
  ELSE
    RETURN false;
  END IF;

  INSERT INTO public.turno_eventos(
    turno_id,turno_sesion_id,actor_user_id,tipo,payload
  ) VALUES (
    v_turn_id,v_session_id,v_actor_id,
    'INVENTARIO_ENTREGA_PENDIENTE_SINCRONIZADA_CORTE_FINAL',
    jsonb_build_object(
      'entrega_id',v_delivery_id,
      'corte_id',p_corte_id,
      'producto_id',p_producto_id,
      'accion',v_action,
      'cantidad_anterior',v_old_quantity,
      'cantidad_actualizada',v_quantity,
      'cantidad_efectiva_anterior',v_old_effective,
      'source_of_truth','CORTE_FINAL_CONFIRMADO',
      'motivo','Sincronización automática del snapshot FINAL antes de programar la sucesora.'
    )
  );

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_sync_pending_handover_from_final_cut(
  p_corte_id uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_delivery_id uuid;
  v_product_id uuid;
  v_changed integer := 0;
BEGIN
  SELECT e.id
  INTO v_delivery_id
  FROM public.turno_jornada_inventario_entregas e
  JOIN public.turno_jornada_inventario_cortes c
    ON c.id=e.origen_corte_id
   AND c.turno_sesion_id=e.origen_sesion_id
  WHERE c.id=p_corte_id
    AND c.tipo='FINAL'
    AND c.estado='CONFIRMADO'
    AND e.estado='PENDIENTE_PROGRAMACION'
    AND e.destino_sesion_id IS NULL;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Include source rows, stale delivery-only rows, and active corrections.
  -- This makes reconciliation bidirectional: add/update missing rows and
  -- remove stale rows without touching a delivery outside the pending state.
  FOR v_product_id IN
    SELECT delivery_line.producto_id
    FROM public.turno_jornada_inventario_entrega_lineas delivery_line
    WHERE delivery_line.entrega_id=v_delivery_id
    UNION
    SELECT source_line.producto_id
    FROM public.turno_jornada_inventario_lineas source_line
    WHERE source_line.corte_id=p_corte_id
    UNION
    SELECT correction.producto_id
    FROM public.turno_jornada_inventario_correcciones correction
    JOIN public.turno_jornada_inventario_cortes cut
      ON cut.turno_sesion_id=correction.turno_sesion_id
    WHERE cut.id=p_corte_id
      AND correction.tipo='FINAL'
      AND correction.vigente
  LOOP
    IF public.bc7_sync_pending_handover_product_from_final(
      p_corte_id,v_product_id,p_actor_id
    ) THEN
      v_changed := v_changed + 1;
    END IF;
  END LOOP;

  RETURN v_changed;
END;
$function$;

-- Keep a pending, unlinked handover synchronized when a line is inserted,
-- corrected or removed after the FINAL cut was first confirmed.
CREATE OR REPLACE FUNCTION public.bc7_sync_pending_handover_final_line_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM public.bc7_sync_pending_handover_from_final_cut(OLD.corte_id,auth.uid());
    RETURN OLD;
  ELSIF TG_OP='UPDATE' THEN
    IF OLD.corte_id IS DISTINCT FROM NEW.corte_id THEN
      PERFORM public.bc7_sync_pending_handover_from_final_cut(OLD.corte_id,auth.uid());
    END IF;
    PERFORM public.bc7_sync_pending_handover_from_final_cut(NEW.corte_id,auth.uid());
    RETURN NEW;
  END IF;

  PERFORM public.bc7_sync_pending_handover_from_final_cut(NEW.corte_id,auth.uid());
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bc7_sync_pending_handover_final_line
  ON public.turno_jornada_inventario_lineas;

CREATE TRIGGER bc7_sync_pending_handover_final_line
AFTER INSERT OR UPDATE OR DELETE
ON public.turno_jornada_inventario_lineas
FOR EACH ROW
EXECUTE FUNCTION public.bc7_sync_pending_handover_final_line_trigger();

-- Reconcile correction-only or correction-revocation cases through the same
-- snapshot path. The earlier per-product trigger remains in place for backward
-- compatibility; this full-set trigger is idempotent and records only changes.
CREATE OR REPLACE FUNCTION public.bc7_sync_pending_handover_final_correction_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old_cut_id uuid;
  v_new_cut_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.tipo='FINAL' THEN
    SELECT c.id INTO v_old_cut_id
    FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=OLD.turno_sesion_id
      AND c.tipo='FINAL'
      AND c.estado='CONFIRMADO'
    LIMIT 1;
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') AND NEW.tipo='FINAL' THEN
    SELECT c.id INTO v_new_cut_id
    FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=NEW.turno_sesion_id
      AND c.tipo='FINAL'
      AND c.estado='CONFIRMADO'
    LIMIT 1;
  END IF;

  IF v_old_cut_id IS NOT NULL
     AND v_old_cut_id IS DISTINCT FROM v_new_cut_id THEN
    PERFORM public.bc7_sync_pending_handover_from_final_cut(v_old_cut_id,auth.uid());
  END IF;

  IF v_new_cut_id IS NOT NULL THEN
    PERFORM public.bc7_sync_pending_handover_from_final_cut(v_new_cut_id,auth.uid());
  END IF;

  IF TG_OP='DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bc7_sync_pending_handover_final_correction_snapshot
  ON public.turno_jornada_inventario_correcciones;

CREATE TRIGGER bc7_sync_pending_handover_final_correction_snapshot
AFTER INSERT OR UPDATE OR DELETE
ON public.turno_jornada_inventario_correcciones
FOR EACH ROW
EXECUTE FUNCTION public.bc7_sync_pending_handover_final_correction_trigger();

-- The successor RPC now reconciles the delivery against its confirmed source
-- cut, not against the current product catalogue.
CREATE OR REPLACE FUNCTION public.bc7_admin_programar_sucesora_pendiente(
  p_entrega_id uuid,
  p_fecha_fin date,
  p_responsable_id uuid,
  p_observacion text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_e public.turno_jornada_inventario_entregas;
  v_old_s public.turno_sesiones;
  v_old_t public.turnos;
  v_old_p public.turno_jornada_programacion;
  v_cfg public.turno_jornada_configuracion;
  v_t public.turnos;
  v_p public.turno_jornada_programacion;
  v_s public.turno_sesiones;
  v_timezone text:='America/Havana';
  v_start time:='07:00';
  v_end time:='23:00';
  v_days integer;
  v_source_line_count integer;
  v_line_count integer;
  v_mismatch_count integer;
  v_salary numeric;
  v_today date;
BEGIN
  IF v_uid IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN autenticado puede preparar una jornada sucesora atrasada.'
      USING ERRCODE='42501';
  END IF;

  IF p_entrega_id IS NULL OR p_fecha_fin IS NULL OR p_responsable_id IS NULL
    OR length(btrim(coalesce(p_observacion,'')))<5
    OR length(p_observacion)>1000 THEN
    RAISE EXCEPTION 'Completa la fecha final, responsable y motivo (5–1000 caracteres).'
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_e
  FROM public.turno_jornada_inventario_entregas
  WHERE id=p_entrega_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_e.estado<>'PENDIENTE_PROGRAMACION'
     OR v_e.destino_sesion_id IS NOT NULL THEN
    RAISE EXCEPTION 'La entrega no está pendiente de programación.'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_old_s
  FROM public.turno_sesiones
  WHERE id=v_e.origen_sesion_id
  FOR SHARE;

  SELECT * INTO v_old_t
  FROM public.turnos
  WHERE id=v_e.turno_id
  FOR SHARE;

  SELECT * INTO v_old_p
  FROM public.turno_jornada_programacion
  WHERE id=v_old_s.jornada_programacion_id;

  IF v_old_s.id IS NULL
     OR v_old_s.estado<>'COMPLETADA'
     OR v_old_t.estado_maestro<>'CERRADO'
     OR NOT EXISTS (
       SELECT 1
       FROM public.turno_jornada_inventario_cortes c
       WHERE c.turno_sesion_id=v_old_s.id
         AND c.tipo='FINAL'
         AND c.estado='CONFIRMADO'
         AND c.id=v_e.origen_corte_id
     ) THEN
    RAISE EXCEPTION 'El origen debe ser un Turno cerrado con jornada completada e inventario final confirmado.'
      USING ERRCODE='23514';
  END IF;

  IF p_fecha_fin<v_e.fecha_destino
     OR p_fecha_fin-v_e.fecha_destino>30 THEN
    RAISE EXCEPTION 'El período sucesor debe abarcar entre 1 y 31 días desde %.',v_e.fecha_destino
      USING ERRCODE='22023';
  END IF;

  IF NOT public.bc5_jornada_responsable_elegible(p_responsable_id) THEN
    RAISE EXCEPTION 'La responsable debe estar activa y tener rol Dependienta o Dueño.'
      USING ERRCODE='42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('bc7-period-warehouse:'||v_e.almacen_id::text,0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('bc7-period-responsible:'||p_responsable_id::text,0)
  );

  SELECT * INTO v_cfg
  FROM public.turno_jornada_configuracion
  WHERE almacen_id=v_e.almacen_id
  FOR SHARE;

  IF FOUND THEN
    v_timezone:=coalesce(nullif(v_cfg.zona_horaria,''),'America/Havana');
    v_start:=v_cfg.hora_inicio;
    v_end:=v_cfg.hora_fin;
    v_salary:=v_cfg.salario_porcentaje;
  END IF;

  v_salary:=coalesce(v_salary,v_old_p.salario_porcentaje);
  v_today:=(now() AT TIME ZONE v_timezone)::date;

  IF v_e.fecha_destino>=v_today THEN
    RAISE EXCEPTION 'La fecha inicial de la sucesora debe ser anterior a hoy; para fechas actuales o futuras usa la programación normal.'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.turnos t
    WHERE t.almacen_id=v_e.almacen_id
      AND t.dias_turno IS NOT NULL
      AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
  ) THEN
    RAISE EXCEPTION 'El almacén ya tiene otro turno abierto o programado.'
      USING ERRCODE='23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.turno_jornada_programacion p
    WHERE p.almacen_id=v_e.almacen_id
      AND p.fecha<=p_fecha_fin
      AND coalesce(p.fecha_fin,p.fecha)>=v_e.fecha_destino
      AND p.estado IN ('PROGRAMADA','DESCANSO')
  ) THEN
    RAISE EXCEPTION 'Ya existe una programación que se cruza con el período sucesor.'
      USING ERRCODE='23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.turno_jornada_programacion p
    WHERE p.responsable_id=p_responsable_id
      AND p.trabaja=true
      AND p.estado='PROGRAMADA'
      AND p.fecha<=p_fecha_fin
      AND coalesce(p.fecha_fin,p.fecha)>=v_e.fecha_destino
  )
  OR EXISTS (
    SELECT 1
    FROM public.turno_sesiones s
    JOIN public.turno_asignaciones a ON a.turno_sesion_id=s.id
    JOIN public.turnos t ON t.id=s.turno_id
    WHERE s.fecha BETWEEN v_e.fecha_destino AND p_fecha_fin
      AND s.estado NOT IN ('COMPLETADA','CANCELADA')
      AND a.usuario_id=p_responsable_id
      AND a.retirado_at IS NULL
      AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
  )
  OR EXISTS (
    SELECT 1
    FROM public.turno_tramos tr
    WHERE tr.usuario_id=p_responsable_id
      AND tr.estado='ACTIVO'
  ) THEN
    RAISE EXCEPTION 'La responsable ya tiene otra jornada programada o tramo activo dentro del período.'
      USING ERRCODE='23505';
  END IF;

  -- Reconcile the complete product set and quantities from the immutable,
  -- confirmed FINAL cut. The current catalogue is intentionally not consulted:
  -- newly created/archived products cannot change historical handover contents.
  PERFORM public.bc7_sync_pending_handover_from_final_cut(v_e.origen_corte_id,v_uid);

  SELECT count(*)::integer
  INTO v_source_line_count
  FROM public.turno_jornada_inventario_lineas source_line
  WHERE source_line.corte_id=v_e.origen_corte_id;

  SELECT count(*)::integer
  INTO v_line_count
  FROM public.turno_jornada_inventario_entrega_lineas delivery_line
  WHERE delivery_line.entrega_id=v_e.id;

  SELECT count(*)::integer
  INTO v_mismatch_count
  FROM public.turno_jornada_inventario_lineas source_line
  LEFT JOIN public.turno_jornada_inventario_entrega_lineas delivery_line
    ON delivery_line.entrega_id=v_e.id
   AND delivery_line.producto_id=source_line.producto_id
  LEFT JOIN LATERAL (
    SELECT correction.cantidad_corregida
    FROM public.turno_jornada_inventario_correcciones correction
    WHERE correction.turno_sesion_id=v_old_s.id
      AND correction.tipo='FINAL'
      AND correction.producto_id=source_line.producto_id
      AND correction.vigente
    ORDER BY correction.creado_en DESC,correction.id DESC
    LIMIT 1
  ) correction ON true
  WHERE delivery_line.id IS NULL
     OR delivery_line.cantidad_declarada IS DISTINCT FROM
        coalesce(correction.cantidad_corregida,source_line.cantidad_contada);

  SELECT v_mismatch_count + count(*)::integer
  INTO v_mismatch_count
  FROM public.turno_jornada_inventario_entrega_lineas delivery_line
  WHERE delivery_line.entrega_id=v_e.id
    AND NOT EXISTS (
      SELECT 1
      FROM public.turno_jornada_inventario_lineas source_line
      WHERE source_line.corte_id=v_e.origen_corte_id
        AND source_line.producto_id=delivery_line.producto_id
    );

  IF v_source_line_count=0
     OR v_line_count<>v_source_line_count
     OR v_mismatch_count<>0 THEN
    RAISE EXCEPTION
      'La entrega heredada no coincide con el inventario FINAL confirmado: % líneas en el corte, % en la entrega y % diferencias. No se creó la sucesora; el sistema ha intentado sincronizar el snapshot histórico. Actualiza la entrega y vuelve a intentarlo.',
      v_source_line_count,v_line_count,v_mismatch_count
      USING ERRCODE='23514';
  END IF;

  v_days:=(p_fecha_fin-v_e.fecha_destino)+1;

  INSERT INTO public.turnos(
    usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,
    estado_maestro,dias_turno
  ) VALUES (
    v_uid,NULL,v_e.almacen_id,v_e.fecha_destino,'PROGRAMADO',v_uid,v_uid,
    'PROGRAMADO',v_days
  )
  RETURNING * INTO v_t;

  INSERT INTO public.turno_jornada_programacion(
    turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,
    motivo_ajuste,creado_por,actualizado_por,salario_porcentaje
  ) VALUES (
    v_t.id,v_e.almacen_id,1,v_e.fecha_destino,p_fecha_fin,true,p_responsable_id,
    v_start,v_end,v_timezone,NULL,'PROGRAMADA',
    'Regularización retroactiva: '||btrim(p_observacion),
    v_uid,v_uid,v_salary
  )
  RETURNING * INTO v_p;

  INSERT INTO public.turno_sesiones(
    turno_id,almacen_id,numero_dia,bloque,fecha,estado,
    jornada_programacion_id,apertura_retroactiva
  ) VALUES (
    v_t.id,v_e.almacen_id,1,'JORNADA',v_e.fecha_destino,'PROGRAMADA',v_p.id,false
  )
  RETURNING * INTO v_s;

  INSERT INTO public.turno_asignaciones(
    turno_sesion_id,turno_id,usuario_id,asignado_por,motivo
  ) VALUES (
    v_s.id,v_t.id,p_responsable_id,v_uid,
    'Responsable de jornada sucesora retroactiva: '||btrim(p_observacion)
  );

  UPDATE public.turno_jornada_inventario_entregas
  SET destino_sesion_id=v_s.id,
      estado='PENDIENTE_RECEPCION',
      actualizado_en=now()
  WHERE id=v_e.id;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES (
    v_e.almacen_id,v_p.id,v_uid,'JORNADA_SUcesora_RETROACTIVA_PROGRAMADA',
    btrim(p_observacion),
    jsonb_build_object('entrega_id',v_e.id,'estado','PENDIENTE_PROGRAMACION'),
    jsonb_build_object(
      'turno_id',v_t.id,
      'sesion_id',v_s.id,
      'fecha_inicio',v_e.fecha_destino,
      'fecha_fin',p_fecha_fin,
      'responsable_id',p_responsable_id,
      'estado_entrega','PENDIENTE_RECEPCION'
    )
  );

  INSERT INTO public.turno_eventos(
    turno_id,actor_user_id,tipo,payload
  ) VALUES (
    v_t.id,v_uid,'JORNADA_SUcesora_RETROACTIVA_PROGRAMADA',
    jsonb_build_object(
      'turno_anterior_id',v_old_t.id,
      'sesion_anterior_id',v_old_s.id,
      'entrega_id',v_e.id,
      'sesion_id',v_s.id,
      'fecha_inicio',v_e.fecha_destino,
      'fecha_fin',p_fecha_fin,
      'responsable_id',p_responsable_id,
      'lineas_inventario',v_line_count,
      'source_of_truth','CORTE_FINAL_CONFIRMADO',
      'stock_global_modificado',false
    )
  );

  RETURN jsonb_build_object(
    'turno_id',v_t.id,
    'sesion_id',v_s.id,
    'programacion_id',v_p.id,
    'entrega_id',v_e.id,
    'fecha_inicio',v_e.fecha_destino,
    'fecha_fin',p_fecha_fin,
    'responsable_id',p_responsable_id,
    'lineas_inventario',v_line_count,
    'estado','PROGRAMADA',
    'recepcion','PENDIENTE_RECEPCION',
    'stock_global_modificado',false
  );
END;
$function$;

-- Only trigger functions / the Admin SECURITY DEFINER RPC may call these
-- internal synchronizers. They are not exposed as public or authenticated RPCs.
REVOKE ALL ON FUNCTION public.bc7_sync_pending_handover_product_from_final(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_sync_pending_handover_from_final_cut(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_sync_pending_handover_final_line_trigger()
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_sync_pending_handover_final_correction_trigger()
  FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.bc7_admin_programar_sucesora_pendiente(uuid,date,uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_admin_programar_sucesora_pendiente(uuid,date,uuid,text)
  TO authenticated;

-- Backfill only still-unlinked pending deliveries. A received or reviewed
-- handover is immutable and remains under the established physical-recount flow.
DO $backfill_pending_successor_snapshots$
DECLARE
  v_row record;
  v_changed integer;
BEGIN
  FOR v_row IN
    SELECT e.id,e.origen_corte_id,e.creado_por
    FROM public.turno_jornada_inventario_entregas e
    JOIN public.turno_jornada_inventario_cortes c
      ON c.id=e.origen_corte_id
     AND c.turno_sesion_id=e.origen_sesion_id
    WHERE c.tipo='FINAL'
      AND c.estado='CONFIRMADO'
      AND e.estado='PENDIENTE_PROGRAMACION'
      AND e.destino_sesion_id IS NULL
  LOOP
    v_changed:=public.bc7_sync_pending_handover_from_final_cut(
      v_row.origen_corte_id,v_row.creado_por
    );
    RAISE NOTICE 'Pending successor snapshot % reconciled; changed lines=%',
      v_row.id,v_changed;
  END LOOP;
END
$backfill_pending_successor_snapshots$;

COMMIT;
