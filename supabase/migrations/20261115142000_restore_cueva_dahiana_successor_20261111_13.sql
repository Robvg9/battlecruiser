-- Restore the owner-confirmed La Cueva successor period for Dahiana.
-- The previous close-date backfill moved this still-unlinked handover to Nov 14.
-- The owner confirms the real successor period was Nov 11–13, 2026.
-- Create only the schedule/assignment and link the existing final inventory.
-- Physical receipt remains pending; this migration never fabricates inventory counts
-- and never changes global stock, cash, sales, purchases or movement rows.

BEGIN;

-- Treat the outgoing handover as an immutable historical product-family snapshot.
-- La Cueva added five new active families on 2026-11-15 after Dahiana's 11–13
-- period. They must not be demanded from the 2026-11-11 handover.

DO $snapshot_contract$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_admin_programar_sucesora_pendiente(uuid,date,uuid,text)'::regprocedure
  ) INTO v_definition;

  v_old := $old_admin$
 IF v_grouped THEN
  SELECT count(*) INTO v_expected FROM public.productos p WHERE p.activo=true AND p.producto_padre_id IS NULL;
 ELSE
  SELECT count(*) INTO v_expected FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
  WHERE s.almacen_id=v_e.almacen_id AND p.activo=true;
 END IF;
 SELECT count(*) INTO v_line_count FROM public.turno_jornada_inventario_entrega_lineas WHERE entrega_id=v_e.id;
 IF v_line_count=0 OR v_line_count<>v_expected THEN
  RAISE EXCEPTION 'La entrega heredada contiene % líneas, pero el catálogo actual requiere % productos/familias. No se abrirá una sucesora incompleta.',v_line_count,v_expected USING ERRCODE='23514';
 END IF;$old_admin$;

  v_new := $new_admin$
 IF v_grouped THEN
  -- Retail delivery lines are the immutable product-family snapshot from
  -- the outgoing final cut. Do not compare them with today's active catalog:
  -- products may have been added after the historical handover.
  SELECT count(*) INTO v_line_count
  FROM public.turno_jornada_inventario_entrega_lineas
  WHERE entrega_id=v_e.id;
  IF v_line_count=0 OR EXISTS(
    SELECT 1
    FROM public.turno_jornada_inventario_entrega_lineas dl
    LEFT JOIN public.productos p ON p.id=dl.producto_id
    WHERE dl.entrega_id=v_e.id AND p.id IS NULL
  ) THEN
   RAISE EXCEPTION 'La entrega histórica no contiene un snapshot completo de familias existentes.' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT count(*) INTO v_expected
  FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
  WHERE s.almacen_id=v_e.almacen_id AND p.activo=true;
  SELECT count(*) INTO v_line_count
  FROM public.turno_jornada_inventario_entrega_lineas
  WHERE entrega_id=v_e.id;
  IF v_line_count=0 OR v_line_count<>v_expected THEN
   RAISE EXCEPTION 'La entrega heredada contiene % líneas, pero el catálogo actual requiere % productos.',v_line_count,v_expected USING ERRCODE='23514';
  END IF;
 END IF;$new_admin$;

  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se localizó el contrato de catálogo en bc7_admin_programar_sucesora_pendiente.';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);

  SELECT pg_get_functiondef(
    'public.bc7_recibir_entrega_jornada(uuid,jsonb,text,uuid)'::regprocedure
  ) INTO v_definition;

  v_old := $old_receive$
 IF v_grouped THEN
  SELECT count(*) INTO v_expected FROM public.productos p WHERE p.activo=true AND p.producto_padre_id IS NULL;
 ELSE
  SELECT count(*) INTO v_expected FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
  WHERE s.almacen_id=v_s.almacen_id AND p.activo=true;
 END IF;$old_receive$;

  v_new := $new_receive$
 IF v_grouped THEN
  -- The payload must match exactly the product families frozen in this delivery.
  -- New products created after the shift are not part of the historical receipt.
  SELECT count(*) INTO v_expected
  FROM public.turno_jornada_inventario_entrega_lineas
  WHERE entrega_id=v_e.id;
 ELSE
  SELECT count(*) INTO v_expected FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
  WHERE s.almacen_id=v_s.almacen_id AND p.activo=true;
 END IF;$new_receive$;

  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se localizó el recuento de catálogo en bc7_recibir_entrega_jornada.';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END;
$snapshot_contract$;

-- Historical Jornada inventory must use the product catalog as it existed by
-- the configured period end, not product families added later.
DO $period_snapshot$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_guardar_inventario_jornada(uuid,text,jsonb,text)'::regprocedure
  ) INTO v_definition;

  v_old := $old$  v_s public.turno_sesiones; v_uid uuid:=auth.uid();$old$;
  v_new := $new$  v_s public.turno_sesiones;
  v_period_end date;
  v_timezone text := 'America/Havana';
  v_uid uuid:=auth.uid();$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se localizó la declaración de bc7_guardar_inventario_jornada.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde al modelo de jornada única.' USING ERRCODE='23503';
  END IF;$old$;
  v_new := $new$  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde al modelo de jornada única.' USING ERRCODE='23503';
  END IF;
  SELECT coalesce(p.fecha_fin,p.fecha),
         coalesce(nullif(p.zona_horaria,''),'America/Havana')
  INTO v_period_end,v_timezone
  FROM public.turno_jornada_programacion p
  WHERE p.id=v_s.jornada_programacion_id;$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se localizó el inicio de sesión en bc7_guardar_inventario_jornada.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$      SELECT count(*) INTO v_expected FROM public.productos p WHERE p.activo=true AND p.producto_padre_id IS NULL;$old$;
  v_new := $new$      SELECT count(*) INTO v_expected
      FROM public.productos p
      WHERE p.activo=true AND p.producto_padre_id IS NULL
        AND p.created_at < ((v_period_end + 1)::timestamp AT TIME ZONE v_timezone);$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se localizó el catálogo inicial en bc7_guardar_inventario_jornada.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$        WHERE s.almacen_id=v_s.almacen_id AND p.activo=true$old$;
  v_new := $new$        WHERE s.almacen_id=v_s.almacen_id AND p.activo=true
          AND p.created_at < ((v_period_end + 1)::timestamp AT TIME ZONE v_timezone)$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>2*length(v_old) THEN
    RAISE EXCEPTION 'No se localizaron ambos filtros de período en bc7_guardar_inventario_jornada.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;

  SELECT pg_get_functiondef(
    'public.bc7_obtener_inventario_jornada(uuid)'::regprocedure
  ) INTO v_definition;

  v_old := $old$      FROM public.productos p WHERE p.activo=true AND p.producto_padre_id IS NULL$new$;
  v_new := $new$      FROM public.productos p
      WHERE p.activo=true AND p.producto_padre_id IS NULL
        AND p.created_at < (
          (coalesce(v_p.fecha_fin,v_p.fecha) + 1)::timestamp
          AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana')
        )$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se localizó la lista de familias en bc7_obtener_inventario_jornada.';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END;
$period_snapshot$;

DO $restore$
DECLARE
  v_delivery public.turno_jornada_inventario_entregas%ROWTYPE;
  v_source_session public.turno_sesiones%ROWTYPE;
  v_source_turn public.turnos%ROWTYPE;
  v_config public.turno_jornada_configuracion%ROWTYPE;
  v_owner_id uuid;
  v_responsible_id uuid;
  v_new_turn public.turnos%ROWTYPE;
  v_new_program public.turno_jornada_programacion%ROWTYPE;
  v_new_session public.turno_sesiones%ROWTYPE;
  v_timezone text := 'America/Havana';
  v_start_time time := '07:00';
  v_end_time time := '23:00';
  v_salary numeric;
  v_line_count integer;
  v_match_count integer;
  v_today date;
  v_reason text := 'Regularización retroactiva autorizada por el Dueño: la jornada real de Dahiana cubrió del 11 al 13 de noviembre de 2026. Se restaura la fecha original de entrega del 11/11, desplazada por el recálculo del cierre administrativo tardío de la jornada anterior. La recepción física y el cierre de esta jornada siguen pendientes de sus datos reales.';
BEGIN
  -- Resolve the handover from its business keys, not generated UUIDs.
  SELECT count(*)
  INTO v_match_count
  FROM public.turno_jornada_inventario_entregas e
  JOIN public.almacenes a ON a.id=e.almacen_id
  JOIN public.turno_sesiones s ON s.id=e.origen_sesion_id
  JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
  JOIN public.turnos t ON t.id=e.turno_id
  JOIN public.turno_jornada_inventario_cortes c ON c.id=e.origen_corte_id
  WHERE a.nombre='Cafeteria La Cueva'
    AND p.fecha=DATE '2026-11-09'
    AND p.fecha_fin=DATE '2026-11-10'
    AND s.estado='COMPLETADA'
    AND t.estado_maestro='CERRADO'
    AND c.tipo='FINAL'
    AND c.estado='CONFIRMADO'
    AND e.destino_sesion_id IS NULL
    AND e.estado='PENDIENTE_PROGRAMACION';

  -- The production handover is intentionally absent from clean CI databases.
  IF v_match_count=0 THEN
    RAISE NOTICE 'No matching unlinked La Cueva handover; skipping production-only data repair.';
    RETURN;
  END IF;
  IF v_match_count<>1 THEN
    RAISE EXCEPTION 'Expected exactly one unlinked La Cueva handover; found %.',v_match_count;
  END IF;

  SELECT e.* INTO STRICT v_delivery
  FROM public.turno_jornada_inventario_entregas e
  JOIN public.almacenes a ON a.id=e.almacen_id
  JOIN public.turno_sesiones s ON s.id=e.origen_sesion_id
  JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
  JOIN public.turnos t ON t.id=e.turno_id
  JOIN public.turno_jornada_inventario_cortes c ON c.id=e.origen_corte_id
  WHERE a.nombre='Cafeteria La Cueva'
    AND p.fecha=DATE '2026-11-09'
    AND p.fecha_fin=DATE '2026-11-10'
    AND s.estado='COMPLETADA'
    AND t.estado_maestro='CERRADO'
    AND c.tipo='FINAL'
    AND c.estado='CONFIRMADO'
    AND e.destino_sesion_id IS NULL
    AND e.estado='PENDIENTE_PROGRAMACION'
  FOR UPDATE OF e;

  IF v_delivery.fecha_destino NOT IN (DATE '2026-11-11',DATE '2026-11-14') THEN
    RAISE EXCEPTION 'Unexpected current handover destination date: %.',v_delivery.fecha_destino;
  END IF;

  SELECT * INTO STRICT v_source_session
  FROM public.turno_sesiones
  WHERE id=v_delivery.origen_sesion_id;

  SELECT * INTO STRICT v_source_turn
  FROM public.turnos
  WHERE id=v_delivery.turno_id;

  SELECT u.id INTO STRICT v_owner_id
  FROM public.usuarios u
  WHERE u.username='roberto'
    AND u.activo=true
    AND coalesce(u.archivado,false)=false;

  SELECT u.id INTO STRICT v_responsible_id
  FROM public.usuarios u
  WHERE u.username='dahiana'
    AND u.nombre='Dahiana'
    AND u.activo=true
    AND coalesce(u.archivado,false)=false;

  IF NOT public.bc5_jornada_responsable_elegible(v_responsible_id) THEN
    RAISE EXCEPTION 'Dahiana is not an eligible active jornada responsible.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_owner_id)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_responsible_id) THEN
    RAISE EXCEPTION 'Owner or responsible auth identity is missing.';
  END IF;

  SELECT * INTO v_config
  FROM public.turno_jornada_configuracion
  WHERE almacen_id=v_delivery.almacen_id;

  IF FOUND THEN
    v_timezone:=coalesce(nullif(v_config.zona_horaria,''),'America/Havana');
    v_start_time:=v_config.hora_inicio;
    v_end_time:=v_config.hora_fin;
    v_salary:=v_config.salario_porcentaje;
  END IF;
  -- Do not inherit the outgoing worker's jornada-specific salary rate.\n  -- Leave it unset unless the warehouse has an explicit configured rate.\n  v_today:=(now() AT TIME ZONE v_timezone)::date;

  IF DATE '2026-11-13'>=v_today THEN
    RAISE EXCEPTION 'The owner-confirmed successor period must already be over for retroactive recovery.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.turnos t
    WHERE t.almacen_id=v_delivery.almacen_id
      AND t.dias_turno IS NOT NULL
      AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
  ) THEN
    RAISE EXCEPTION 'La Cueva already has another open or scheduled master turn.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_programacion p
    WHERE p.almacen_id=v_delivery.almacen_id
      AND p.fecha<=DATE '2026-11-13'
      AND coalesce(p.fecha_fin,p.fecha)>=DATE '2026-11-11'
      AND p.estado IN ('PROGRAMADA','DESCANSO')
  ) THEN
    RAISE EXCEPTION 'La Cueva already has a conflicting jornada program for Nov 11–13.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_programacion p
    WHERE p.responsable_id=v_responsible_id
      AND p.trabaja=true
      AND p.estado='PROGRAMADA'
      AND p.fecha<=DATE '2026-11-13'
      AND coalesce(p.fecha_fin,p.fecha)>=DATE '2026-11-11'
  ) OR EXISTS (
    SELECT 1
    FROM public.turno_sesiones s
    JOIN public.turno_asignaciones a ON a.turno_sesion_id=s.id
    JOIN public.turnos t ON t.id=s.turno_id
    WHERE s.fecha BETWEEN DATE '2026-11-11' AND DATE '2026-11-13'
      AND s.estado NOT IN ('COMPLETADA','CANCELADA')
      AND a.usuario_id=v_responsible_id
      AND a.retirado_at IS NULL
      AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
  ) OR EXISTS (
    SELECT 1 FROM public.turno_tramos tr
    WHERE tr.usuario_id=v_responsible_id AND tr.estado='ACTIVO'
  ) THEN
    RAISE EXCEPTION 'Dahiana has a conflicting programmed jornada or an active operational tramo.';
  END IF;

  SELECT count(*) INTO v_line_count
  FROM public.turno_jornada_inventario_entrega_lineas l
  WHERE l.entrega_id=v_delivery.id;

  IF v_line_count<>66 THEN
    RAISE EXCEPTION 'Expected exactly 66 families from the historical final inventory snapshot; delivery has %.',v_line_count;
  END IF;

  -- Restore the original handover date confirmed by the owner and preserve an audit trail.
  UPDATE public.turno_jornada_inventario_entregas
  SET fecha_destino=DATE '2026-11-11',actualizado_en=now()
  WHERE id=v_delivery.id;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES
    (v_delivery.almacen_id,v_source_program.id,v_owner_id,
     'INVENTARIO_ENTREGA_DESTINO_RESTAURADO_POR_DUENO',v_reason,
     jsonb_build_object('entrega_id',v_delivery.id,'fecha_destino_anterior',v_delivery.fecha_destino),
     jsonb_build_object('entrega_id',v_delivery.id,'fecha_destino',DATE '2026-11-11',
       'periodo_sucesor_confirmado_inicio',DATE '2026-11-11',
       'periodo_sucesor_confirmado_fin',DATE '2026-11-13',
       'responsable_username','dahiana'));

  INSERT INTO public.turnos
    (usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,estado_maestro,dias_turno)
  VALUES
    (v_owner_id,NULL,v_delivery.almacen_id,DATE '2026-11-11','PROGRAMADO',
     v_owner_id,v_owner_id,'PROGRAMADO',3)
  RETURNING * INTO v_new_turn;

  INSERT INTO public.turno_jornada_programacion
    (turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,
     hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,motivo_ajuste,
     creado_por,actualizado_por,salario_porcentaje)
  VALUES
    (v_new_turn.id,v_delivery.almacen_id,1,DATE '2026-11-11',DATE '2026-11-13',true,
     v_responsible_id,v_start_time,v_end_time,v_timezone,NULL,'PROGRAMADA',v_reason,
     v_owner_id,v_owner_id,v_salary)
  RETURNING * INTO v_new_program;

  INSERT INTO public.turno_sesiones
    (turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id,apertura_retroactiva)
  VALUES
    (v_new_turn.id,v_delivery.almacen_id,1,'JORNADA',DATE '2026-11-11',
     'PROGRAMADA',v_new_program.id,false)
  RETURNING * INTO v_new_session;

  INSERT INTO public.turno_asignaciones
    (turno_sesion_id,turno_id,usuario_id,asignado_por,motivo)
  VALUES
    (v_new_session.id,v_new_turn.id,v_responsible_id,v_owner_id,
     'Responsable real confirmada por el Dueño para la jornada histórica 11–13/11/2026.');

  UPDATE public.turno_jornada_inventario_entregas
  SET destino_sesion_id=v_new_session.id,estado='PENDIENTE_RECEPCION',actualizado_en=now()
  WHERE id=v_delivery.id;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES
    (v_delivery.almacen_id,v_new_program.id,v_owner_id,
     'JORNADA_SUcesora_RETROACTIVA_PROGRAMADA',v_reason,
     jsonb_build_object('entrega_id',v_delivery.id,'estado','PENDIENTE_PROGRAMACION'),
     jsonb_build_object('turno_id',v_new_turn.id,'sesion_id',v_new_session.id,
       'fecha_inicio',DATE '2026-11-11','fecha_fin',DATE '2026-11-13',
       'responsable_id',v_responsible_id,'lineas_inventario',v_line_count,
       'estado_entrega','PENDIENTE_RECEPCION','stock_global_modificado',false));

  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)
  VALUES
    (v_new_turn.id,v_new_session.id,v_owner_id,'JORNADA_SUcesora_RETROACTIVA_PROGRAMADA',
     jsonb_build_object('turno_anterior_id',v_source_turn.id,
       'sesion_anterior_id',v_source_session.id,'entrega_id',v_delivery.id,
       'sesion_id',v_new_session.id,'fecha_inicio',DATE '2026-11-11',
       'fecha_fin',DATE '2026-11-13','responsable_id',v_responsible_id,
       'responsable_username','dahiana','lineas_inventario',v_line_count,
       'stock_global_modificado',false,
       'recepcion_fisica_pendiente',true,'cierre_historico_pendiente',true));

  RAISE NOTICE 'Created historical successor Nov 11–13, 2026 for Dahiana; session %, linked delivery %, physical receipt pending.',
    v_new_session.id,v_delivery.id;
END;
$restore$;

COMMIT;

    OR (v_grouped AND p.producto_padre_id IS NOT NULL)
    OR (NOT v_grouped AND NOT EXISTS(
      SELECT 1 FROM public.stock st WHERE st.almacen_id=v_s.almacen_id AND st.producto_id=p.id
    ))$old$;

  v_new := $new$
  LEFT JOIN public.productos p ON p.id=(x.value->>'producto_id')::uuid
  WHERE jsonb_typeof(x.value)<>'object' OR p.id IS NULL
    OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})
DO $restore$
DECLARE
  v_delivery public.turno_jornada_inventario_entregas%ROWTYPE;
  v_source_session public.turno_sesiones%ROWTYPE;
  v_source_turn public.turnos%ROWTYPE;
  v_source_program public.turno_jornada_programacion%ROWTYPE;
  v_config public.turno_jornada_configuracion%ROWTYPE;
  v_owner_id uuid;
  v_responsible_id uuid;
  v_new_turn public.turnos%ROWTYPE;
  v_new_program public.turno_jornada_programacion%ROWTYPE;
  v_new_session public.turno_sesiones%ROWTYPE;
  v_timezone text := 'America/Havana';
  v_start_time time := '07:00';
  v_end_time time := '23:00';
  v_salary numeric;
  v_expected integer;
  v_line_count integer;
  v_match_count integer;
  v_today date;
  v_reason text := 'Regularización retroactiva autorizada por el Dueño: la jornada real de Dahiana cubrió del 11 al 13 de noviembre de 2026. Se restaura la fecha original de entrega del 11/11, desplazada por el recálculo del cierre administrativo tardío de la jornada anterior. La recepción física y el cierre de esta jornada siguen pendientes de sus datos reales.';
BEGIN
  -- Resolve the handover from its business keys, not generated UUIDs.
  SELECT count(*)
  INTO v_match_count
  FROM public.turno_jornada_inventario_entregas e
  JOIN public.almacenes a ON a.id=e.almacen_id
  JOIN public.turno_sesiones s ON s.id=e.origen_sesion_id
  JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
  JOIN public.turnos t ON t.id=e.turno_id
  JOIN public.turno_jornada_inventario_cortes c ON c.id=e.origen_corte_id
  WHERE a.nombre='Cafeteria La Cueva'
    AND p.fecha=DATE '2026-11-09'
    AND p.fecha_fin=DATE '2026-11-10'
    AND s.estado='COMPLETADA'
    AND t.estado_maestro='CERRADO'
    AND c.tipo='FINAL'
    AND c.estado='CONFIRMADO'
    AND e.destino_sesion_id IS NULL
    AND e.estado='PENDIENTE_PROGRAMACION';

  -- The production handover is intentionally absent from clean CI databases.
  IF v_match_count=0 THEN
    RAISE NOTICE 'No matching unlinked La Cueva handover; skipping production-only data repair.';
    RETURN;
  END IF;
  IF v_match_count<>1 THEN
    RAISE EXCEPTION 'Expected exactly one unlinked La Cueva handover; found %.',v_match_count;
  END IF;

  SELECT e.* INTO STRICT v_delivery
  FROM public.turno_jornada_inventario_entregas e
  JOIN public.almacenes a ON a.id=e.almacen_id
  JOIN public.turno_sesiones s ON s.id=e.origen_sesion_id
  JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
  JOIN public.turnos t ON t.id=e.turno_id
  JOIN public.turno_jornada_inventario_cortes c ON c.id=e.origen_corte_id
  WHERE a.nombre='Cafeteria La Cueva'
    AND p.fecha=DATE '2026-11-09'
    AND p.fecha_fin=DATE '2026-11-10'
    AND s.estado='COMPLETADA'
    AND t.estado_maestro='CERRADO'
    AND c.tipo='FINAL'
    AND c.estado='CONFIRMADO'
    AND e.destino_sesion_id IS NULL
    AND e.estado='PENDIENTE_PROGRAMACION'
  FOR UPDATE OF e;

  IF v_delivery.fecha_destino NOT IN (DATE '2026-11-11',DATE '2026-11-14') THEN
    RAISE EXCEPTION 'Unexpected current handover destination date: %.',v_delivery.fecha_destino;
  END IF;

  SELECT * INTO STRICT v_source_session
  FROM public.turno_sesiones
  WHERE id=v_delivery.origen_sesion_id;

  SELECT * INTO STRICT v_source_turn
  FROM public.turnos
  WHERE id=v_delivery.turno_id;

  SELECT * INTO STRICT v_source_program
  FROM public.turno_jornada_programacion
  WHERE id=v_source_session.jornada_programacion_id;

  SELECT u.id INTO STRICT v_owner_id
  FROM public.usuarios u
  WHERE u.username='roberto'
    AND u.activo=true
    AND coalesce(u.archivado,false)=false;

  SELECT u.id INTO STRICT v_responsible_id
  FROM public.usuarios u
  WHERE u.username='dahiana'
    AND u.nombre='Dahiana'
    AND u.activo=true
    AND coalesce(u.archivado,false)=false;

  IF NOT public.bc5_jornada_responsable_elegible(v_responsible_id) THEN
    RAISE EXCEPTION 'Dahiana is not an eligible active jornada responsible.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_owner_id)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_responsible_id) THEN
    RAISE EXCEPTION 'Owner or responsible auth identity is missing.';
  END IF;

  SELECT * INTO v_config
  FROM public.turno_jornada_configuracion
  WHERE almacen_id=v_delivery.almacen_id;

  IF FOUND THEN
    v_timezone:=coalesce(nullif(v_config.zona_horaria,''),'America/Havana');
    v_start_time:=v_config.hora_inicio;
    v_end_time:=v_config.hora_fin;
    v_salary:=v_config.salario_porcentaje;
  END IF;
  v_salary:=coalesce(v_salary,v_source_program.salario_porcentaje);
  v_today:=(now() AT TIME ZONE v_timezone)::date;

  IF DATE '2026-11-13'>=v_today THEN
    RAISE EXCEPTION 'The owner-confirmed successor period must already be over for retroactive recovery.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.turnos t
    WHERE t.almacen_id=v_delivery.almacen_id
      AND t.dias_turno IS NOT NULL
      AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
  ) THEN
    RAISE EXCEPTION 'La Cueva already has another open or scheduled master turn.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_programacion p
    WHERE p.almacen_id=v_delivery.almacen_id
      AND p.fecha<=DATE '2026-11-13'
      AND coalesce(p.fecha_fin,p.fecha)>=DATE '2026-11-11'
      AND p.estado IN ('PROGRAMADA','DESCANSO')
  ) THEN
    RAISE EXCEPTION 'La Cueva already has a conflicting jornada program for Nov 11–13.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_programacion p
    WHERE p.responsable_id=v_responsible_id
      AND p.trabaja=true
      AND p.estado='PROGRAMADA'
      AND p.fecha<=DATE '2026-11-13'
      AND coalesce(p.fecha_fin,p.fecha)>=DATE '2026-11-11'
  ) OR EXISTS (
    SELECT 1
    FROM public.turno_sesiones s
    JOIN public.turno_asignaciones a ON a.turno_sesion_id=s.id
    JOIN public.turnos t ON t.id=s.turno_id
    WHERE s.fecha BETWEEN DATE '2026-11-11' AND DATE '2026-11-13'
      AND s.estado NOT IN ('COMPLETADA','CANCELADA')
      AND a.usuario_id=v_responsible_id
      AND a.retirado_at IS NULL
      AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
  ) OR EXISTS (
    SELECT 1 FROM public.turno_tramos tr
    WHERE tr.usuario_id=v_responsible_id AND tr.estado='ACTIVO'
  ) THEN
    RAISE EXCEPTION 'Dahiana has a conflicting programmed jornada or an active operational tramo.';
  END IF;

  SELECT count(*) INTO v_expected
  FROM public.productos p
  WHERE p.activo=true AND p.producto_padre_id IS NULL;

  SELECT count(*) INTO v_line_count
  FROM public.turno_jornada_inventario_entrega_lineas l
  WHERE l.entrega_id=v_delivery.id;

  IF v_line_count<>66 OR v_line_count<>v_expected THEN
    RAISE EXCEPTION 'Expected 66 existing product-family lines matching the active catalog; delivery has %, catalog has %.',v_line_count,v_expected;
  END IF;

  -- Restore the original handover date confirmed by the owner and preserve an audit trail.
  UPDATE public.turno_jornada_inventario_entregas
  SET fecha_destino=DATE '2026-11-11',actualizado_en=now()
  WHERE id=v_delivery.id;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES
    (v_delivery.almacen_id,v_source_program.id,v_owner_id,
     'INVENTARIO_ENTREGA_DESTINO_RESTAURADO_POR_DUENO',v_reason,
     jsonb_build_object('entrega_id',v_delivery.id,'fecha_destino_anterior',v_delivery.fecha_destino),
     jsonb_build_object('entrega_id',v_delivery.id,'fecha_destino',DATE '2026-11-11',
       'periodo_sucesor_confirmado_inicio',DATE '2026-11-11',
       'periodo_sucesor_confirmado_fin',DATE '2026-11-13',
       'responsable_username','dahiana'));

  INSERT INTO public.turnos
    (usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,estado_maestro,dias_turno)
  VALUES
    (v_owner_id,NULL,v_delivery.almacen_id,DATE '2026-11-11','PROGRAMADO',
     v_owner_id,v_owner_id,'PROGRAMADO',3)
  RETURNING * INTO v_new_turn;

  INSERT INTO public.turno_jornada_programacion
    (turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,
     hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,motivo_ajuste,
     creado_por,actualizado_por,salario_porcentaje)
  VALUES
    (v_new_turn.id,v_delivery.almacen_id,1,DATE '2026-11-11',DATE '2026-11-13',true,
     v_responsible_id,v_start_time,v_end_time,v_timezone,NULL,'PROGRAMADA',v_reason,
     v_owner_id,v_owner_id,v_salary)
  RETURNING * INTO v_new_program;

  INSERT INTO public.turno_sesiones
    (turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id,apertura_retroactiva)
  VALUES
    (v_new_turn.id,v_delivery.almacen_id,1,'JORNADA',DATE '2026-11-11',
     'PROGRAMADA',v_new_program.id,false)
  RETURNING * INTO v_new_session;

  INSERT INTO public.turno_asignaciones
    (turno_sesion_id,turno_id,usuario_id,asignado_por,motivo)
  VALUES
    (v_new_session.id,v_new_turn.id,v_responsible_id,v_owner_id,
     'Responsable real confirmada por el Dueño para la jornada histórica 11–13/11/2026.');

  UPDATE public.turno_jornada_inventario_entregas
  SET destino_sesion_id=v_new_session.id,estado='PENDIENTE_RECEPCION',actualizado_en=now()
  WHERE id=v_delivery.id;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES
    (v_delivery.almacen_id,v_new_program.id,v_owner_id,
     'JORNADA_SUcesora_RETROACTIVA_PROGRAMADA',v_reason,
     jsonb_build_object('entrega_id',v_delivery.id,'estado','PENDIENTE_PROGRAMACION'),
     jsonb_build_object('turno_id',v_new_turn.id,'sesion_id',v_new_session.id,
       'fecha_inicio',DATE '2026-11-11','fecha_fin',DATE '2026-11-13',
       'responsable_id',v_responsible_id,'lineas_inventario',v_line_count,
       'estado_entrega','PENDIENTE_RECEPCION','stock_global_modificado',false));

  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)
  VALUES
    (v_new_turn.id,v_new_session.id,v_owner_id,'JORNADA_SUcesora_RETROACTIVA_PROGRAMADA',
     jsonb_build_object('turno_anterior_id',v_source_turn.id,
       'sesion_anterior_id',v_source_session.id,'entrega_id',v_delivery.id,
       'sesion_id',v_new_session.id,'fecha_inicio',DATE '2026-11-11',
       'fecha_fin',DATE '2026-11-13','responsable_id',v_responsible_id,
       'responsable_username','dahiana','lineas_inventario',v_line_count,
       'stock_global_modificado',false,
       'recepcion_fisica_pendiente',true,'cierre_historico_pendiente',true));

  RAISE NOTICE 'Created historical successor Nov 11–13, 2026 for Dahiana; session %, linked delivery %, physical receipt pending.',
    v_new_session.id,v_delivery.id;
END;
$restore$;

COMMIT;

    OR (NOT v_grouped AND NOT EXISTS(
      SELECT 1 FROM public.stock st WHERE st.almacen_id=v_s.almacen_id AND st.producto_id=p.id
    ))$new$;

  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se localizó la validación de producto en bc7_recibir_entrega_jornada.';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END;
$snapshot_contract$;


DO $restore$
DECLARE
  v_delivery public.turno_jornada_inventario_entregas%ROWTYPE;
  v_source_session public.turno_sesiones%ROWTYPE;
  v_source_turn public.turnos%ROWTYPE;
  v_source_program public.turno_jornada_programacion%ROWTYPE;
  v_config public.turno_jornada_configuracion%ROWTYPE;
  v_owner_id uuid;
  v_responsible_id uuid;
  v_new_turn public.turnos%ROWTYPE;
  v_new_program public.turno_jornada_programacion%ROWTYPE;
  v_new_session public.turno_sesiones%ROWTYPE;
  v_timezone text := 'America/Havana';
  v_start_time time := '07:00';
  v_end_time time := '23:00';
  v_salary numeric;
  v_expected integer;
  v_line_count integer;
  v_match_count integer;
  v_today date;
  v_reason text := 'Regularización retroactiva autorizada por el Dueño: la jornada real de Dahiana cubrió del 11 al 13 de noviembre de 2026. Se restaura la fecha original de entrega del 11/11, desplazada por el recálculo del cierre administrativo tardío de la jornada anterior. La recepción física y el cierre de esta jornada siguen pendientes de sus datos reales.';
BEGIN
  -- Resolve the handover from its business keys, not generated UUIDs.
  SELECT count(*)
  INTO v_match_count
  FROM public.turno_jornada_inventario_entregas e
  JOIN public.almacenes a ON a.id=e.almacen_id
  JOIN public.turno_sesiones s ON s.id=e.origen_sesion_id
  JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
  JOIN public.turnos t ON t.id=e.turno_id
  JOIN public.turno_jornada_inventario_cortes c ON c.id=e.origen_corte_id
  WHERE a.nombre='Cafeteria La Cueva'
    AND p.fecha=DATE '2026-11-09'
    AND p.fecha_fin=DATE '2026-11-10'
    AND s.estado='COMPLETADA'
    AND t.estado_maestro='CERRADO'
    AND c.tipo='FINAL'
    AND c.estado='CONFIRMADO'
    AND e.destino_sesion_id IS NULL
    AND e.estado='PENDIENTE_PROGRAMACION';

  -- The production handover is intentionally absent from clean CI databases.
  IF v_match_count=0 THEN
    RAISE NOTICE 'No matching unlinked La Cueva handover; skipping production-only data repair.';
    RETURN;
  END IF;
  IF v_match_count<>1 THEN
    RAISE EXCEPTION 'Expected exactly one unlinked La Cueva handover; found %.',v_match_count;
  END IF;

  SELECT e.* INTO STRICT v_delivery
  FROM public.turno_jornada_inventario_entregas e
  JOIN public.almacenes a ON a.id=e.almacen_id
  JOIN public.turno_sesiones s ON s.id=e.origen_sesion_id
  JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
  JOIN public.turnos t ON t.id=e.turno_id
  JOIN public.turno_jornada_inventario_cortes c ON c.id=e.origen_corte_id
  WHERE a.nombre='Cafeteria La Cueva'
    AND p.fecha=DATE '2026-11-09'
    AND p.fecha_fin=DATE '2026-11-10'
    AND s.estado='COMPLETADA'
    AND t.estado_maestro='CERRADO'
    AND c.tipo='FINAL'
    AND c.estado='CONFIRMADO'
    AND e.destino_sesion_id IS NULL
    AND e.estado='PENDIENTE_PROGRAMACION'
  FOR UPDATE OF e;

  IF v_delivery.fecha_destino NOT IN (DATE '2026-11-11',DATE '2026-11-14') THEN
    RAISE EXCEPTION 'Unexpected current handover destination date: %.',v_delivery.fecha_destino;
  END IF;

  SELECT * INTO STRICT v_source_session
  FROM public.turno_sesiones
  WHERE id=v_delivery.origen_sesion_id;

  SELECT * INTO STRICT v_source_turn
  FROM public.turnos
  WHERE id=v_delivery.turno_id;

  SELECT * INTO STRICT v_source_program
  FROM public.turno_jornada_programacion
  WHERE id=v_source_session.jornada_programacion_id;

  SELECT u.id INTO STRICT v_owner_id
  FROM public.usuarios u
  WHERE u.username='roberto'
    AND u.activo=true
    AND coalesce(u.archivado,false)=false;

  SELECT u.id INTO STRICT v_responsible_id
  FROM public.usuarios u
  WHERE u.username='dahiana'
    AND u.nombre='Dahiana'
    AND u.activo=true
    AND coalesce(u.archivado,false)=false;

  IF NOT public.bc5_jornada_responsable_elegible(v_responsible_id) THEN
    RAISE EXCEPTION 'Dahiana is not an eligible active jornada responsible.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_owner_id)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_responsible_id) THEN
    RAISE EXCEPTION 'Owner or responsible auth identity is missing.';
  END IF;

  SELECT * INTO v_config
  FROM public.turno_jornada_configuracion
  WHERE almacen_id=v_delivery.almacen_id;

  IF FOUND THEN
    v_timezone:=coalesce(nullif(v_config.zona_horaria,''),'America/Havana');
    v_start_time:=v_config.hora_inicio;
    v_end_time:=v_config.hora_fin;
    v_salary:=v_config.salario_porcentaje;
  END IF;
  v_salary:=coalesce(v_salary,v_source_program.salario_porcentaje);
  v_today:=(now() AT TIME ZONE v_timezone)::date;

  IF DATE '2026-11-13'>=v_today THEN
    RAISE EXCEPTION 'The owner-confirmed successor period must already be over for retroactive recovery.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.turnos t
    WHERE t.almacen_id=v_delivery.almacen_id
      AND t.dias_turno IS NOT NULL
      AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
  ) THEN
    RAISE EXCEPTION 'La Cueva already has another open or scheduled master turn.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_programacion p
    WHERE p.almacen_id=v_delivery.almacen_id
      AND p.fecha<=DATE '2026-11-13'
      AND coalesce(p.fecha_fin,p.fecha)>=DATE '2026-11-11'
      AND p.estado IN ('PROGRAMADA','DESCANSO')
  ) THEN
    RAISE EXCEPTION 'La Cueva already has a conflicting jornada program for Nov 11–13.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_programacion p
    WHERE p.responsable_id=v_responsible_id
      AND p.trabaja=true
      AND p.estado='PROGRAMADA'
      AND p.fecha<=DATE '2026-11-13'
      AND coalesce(p.fecha_fin,p.fecha)>=DATE '2026-11-11'
  ) OR EXISTS (
    SELECT 1
    FROM public.turno_sesiones s
    JOIN public.turno_asignaciones a ON a.turno_sesion_id=s.id
    JOIN public.turnos t ON t.id=s.turno_id
    WHERE s.fecha BETWEEN DATE '2026-11-11' AND DATE '2026-11-13'
      AND s.estado NOT IN ('COMPLETADA','CANCELADA')
      AND a.usuario_id=v_responsible_id
      AND a.retirado_at IS NULL
      AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
  ) OR EXISTS (
    SELECT 1 FROM public.turno_tramos tr
    WHERE tr.usuario_id=v_responsible_id AND tr.estado='ACTIVO'
  ) THEN
    RAISE EXCEPTION 'Dahiana has a conflicting programmed jornada or an active operational tramo.';
  END IF;

  SELECT count(*) INTO v_expected
  FROM public.productos p
  WHERE p.activo=true AND p.producto_padre_id IS NULL;

  SELECT count(*) INTO v_line_count
  FROM public.turno_jornada_inventario_entrega_lineas l
  WHERE l.entrega_id=v_delivery.id;

  IF v_line_count<>66 OR v_line_count<>v_expected THEN
    RAISE EXCEPTION 'Expected 66 existing product-family lines matching the active catalog; delivery has %, catalog has %.',v_line_count,v_expected;
  END IF;

  -- Restore the original handover date confirmed by the owner and preserve an audit trail.
  UPDATE public.turno_jornada_inventario_entregas
  SET fecha_destino=DATE '2026-11-11',actualizado_en=now()
  WHERE id=v_delivery.id;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES
    (v_delivery.almacen_id,v_source_program.id,v_owner_id,
     'INVENTARIO_ENTREGA_DESTINO_RESTAURADO_POR_DUENO',v_reason,
     jsonb_build_object('entrega_id',v_delivery.id,'fecha_destino_anterior',v_delivery.fecha_destino),
     jsonb_build_object('entrega_id',v_delivery.id,'fecha_destino',DATE '2026-11-11',
       'periodo_sucesor_confirmado_inicio',DATE '2026-11-11',
       'periodo_sucesor_confirmado_fin',DATE '2026-11-13',
       'responsable_username','dahiana'));

  INSERT INTO public.turnos
    (usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,estado_maestro,dias_turno)
  VALUES
    (v_owner_id,NULL,v_delivery.almacen_id,DATE '2026-11-11','PROGRAMADO',
     v_owner_id,v_owner_id,'PROGRAMADO',3)
  RETURNING * INTO v_new_turn;

  INSERT INTO public.turno_jornada_programacion
    (turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,
     hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,motivo_ajuste,
     creado_por,actualizado_por,salario_porcentaje)
  VALUES
    (v_new_turn.id,v_delivery.almacen_id,1,DATE '2026-11-11',DATE '2026-11-13',true,
     v_responsible_id,v_start_time,v_end_time,v_timezone,NULL,'PROGRAMADA',v_reason,
     v_owner_id,v_owner_id,v_salary)
  RETURNING * INTO v_new_program;

  INSERT INTO public.turno_sesiones
    (turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id,apertura_retroactiva)
  VALUES
    (v_new_turn.id,v_delivery.almacen_id,1,'JORNADA',DATE '2026-11-11',
     'PROGRAMADA',v_new_program.id,false)
  RETURNING * INTO v_new_session;

  INSERT INTO public.turno_asignaciones
    (turno_sesion_id,turno_id,usuario_id,asignado_por,motivo)
  VALUES
    (v_new_session.id,v_new_turn.id,v_responsible_id,v_owner_id,
     'Responsable real confirmada por el Dueño para la jornada histórica 11–13/11/2026.');

  UPDATE public.turno_jornada_inventario_entregas
  SET destino_sesion_id=v_new_session.id,estado='PENDIENTE_RECEPCION',actualizado_en=now()
  WHERE id=v_delivery.id;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES
    (v_delivery.almacen_id,v_new_program.id,v_owner_id,
     'JORNADA_SUcesora_RETROACTIVA_PROGRAMADA',v_reason,
     jsonb_build_object('entrega_id',v_delivery.id,'estado','PENDIENTE_PROGRAMACION'),
     jsonb_build_object('turno_id',v_new_turn.id,'sesion_id',v_new_session.id,
       'fecha_inicio',DATE '2026-11-11','fecha_fin',DATE '2026-11-13',
       'responsable_id',v_responsible_id,'lineas_inventario',v_line_count,
       'estado_entrega','PENDIENTE_RECEPCION','stock_global_modificado',false));

  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)
  VALUES
    (v_new_turn.id,v_new_session.id,v_owner_id,'JORNADA_SUcesora_RETROACTIVA_PROGRAMADA',
     jsonb_build_object('turno_anterior_id',v_source_turn.id,
       'sesion_anterior_id',v_source_session.id,'entrega_id',v_delivery.id,
       'sesion_id',v_new_session.id,'fecha_inicio',DATE '2026-11-11',
       'fecha_fin',DATE '2026-11-13','responsable_id',v_responsible_id,
       'responsable_username','dahiana','lineas_inventario',v_line_count,
       'stock_global_modificado',false,
       'recepcion_fisica_pendiente',true,'cierre_historico_pendiente',true));

  RAISE NOTICE 'Created historical successor Nov 11–13, 2026 for Dahiana; session %, linked delivery %, physical receipt pending.',
    v_new_session.id,v_delivery.id;
END;
$restore$;

COMMIT;
