\set ON_ERROR_STOP on
-- Disposable PostgreSQL 17 functional contract for automatic successor handover
-- synchronization after an audited FINAL count correction.
DO $handover_sync$
DECLARE
  v_owner uuid:='20000000-0000-0000-0000-000000000001';
  v_warehouse uuid:='10000000-0000-0000-0000-000000000221';
  v_product uuid:='31000000-0000-0000-0000-000000000221';
  v_turn uuid:='a9100000-0000-0000-0000-000000000221';
  v_program uuid:='a9200000-0000-0000-0000-000000000221';
  v_session uuid:='a9300000-0000-0000-0000-000000000221';
  v_final_cut uuid:='a9500000-0000-0000-0000-000000000221';
  v_first_correction uuid:='a9600000-0000-0000-0000-000000000221';
  v_second_correction uuid:='a9600000-0000-0000-0000-000000000222';
  v_delivery uuid;
  v_declared numeric;
  v_effective numeric;
  v_events integer;
  v_today date:=(now() AT TIME ZONE 'America/Havana')::date;
BEGIN
  IF to_regprocedure('public.bc7_sync_pending_handover_after_final_correction()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgname='bc7_sync_pending_handover_after_final_correction'
         AND tgrelid='public.turno_jornada_inventario_correcciones'::regclass
         AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION 'FAIL: pending-handover correction trigger is missing.';
  END IF;

  INSERT INTO public.almacenes(id,nombre,tipo,activo)
  VALUES(v_warehouse,'Pending handover correction fixture','minorista',true)
  ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.productos(id,nombre,unidad,activo,precio_normal)
  VALUES(v_product,'Pending handover sync product','unidad',true,10)
  ON CONFLICT(id) DO UPDATE SET activo=true,producto_padre_id=NULL,archivado_at=NULL;

  INSERT INTO public.turnos(
    id,usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,
    estado_maestro,dias_turno,apertura_real
  ) VALUES(
    v_turn,v_owner,'Owner handover fixture',v_warehouse,v_today,'ABIERTO',v_owner,v_owner,
    'EN_CURSO',1,now()-interval '8 hours'
  ) ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.turno_jornada_programacion(
    id,turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,creado_por,actualizado_por
  ) VALUES(
    v_program,v_turn,v_warehouse,1,v_today,v_today,true,NULL,
    '07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner
  ) ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.turno_sesiones(
    id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id,
    apertura_retroactiva,cierre_operativo_at,corte_operativo_at,cierre_operativo_origen,cierre_operativo_por
  ) VALUES(
    v_session,v_turn,v_warehouse,1,'JORNADA',v_today,'CERRADA_OPERATIVAMENTE',v_program,
    false,now(),now(),'AUTO_HORA_FIN',v_owner
  ) ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.turno_jornada_inventario_cortes(
    id,turno_sesion_id,tipo,estado,creado_por,confirmado_por,creado_en,confirmado_en,observacion
  ) VALUES(
    v_final_cut,v_session,'FINAL','CONFIRMADO',v_owner,v_owner,now(),now(),'Final count for handover sync contract'
  ) ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.turno_jornada_inventario_lineas(corte_id,producto_id,cantidad_contada,stock_sistema)
  VALUES(v_final_cut,v_product,10,10)
  ON CONFLICT(corte_id,producto_id) DO NOTHING;

  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada IMMEDIATE;
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada DEFERRED;

  SELECT e.id INTO v_delivery
  FROM public.turno_jornada_inventario_entregas e
  WHERE e.origen_sesion_id=v_session
    AND e.estado='PENDIENTE_PROGRAMACION'
    AND e.destino_sesion_id IS NULL;
  IF v_delivery IS NULL THEN
    RAISE EXCEPTION 'FAIL: the final-cut trigger did not prepare an unprogrammed handover.';
  END IF;

  SELECT cantidad_declarada,cantidad_efectiva INTO v_declared,v_effective
  FROM public.turno_jornada_inventario_entrega_lineas
  WHERE entrega_id=v_delivery AND producto_id=v_product;
  IF v_declared IS DISTINCT FROM 10::numeric OR v_effective IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: the handover did not begin with the original final count or has an unexpected receipt quantity.';
  END IF;

  INSERT INTO public.turno_jornada_inventario_correcciones(
    id,turno_sesion_id,tipo,producto_id,cantidad_original,cantidad_corregida,
    comentario,creado_por,creado_en,vigente
  ) VALUES(
    v_first_correction,v_session,'FINAL',v_product,10,13,
    'First correction of physical final count',v_owner,now()-interval '2 minutes',true
  );
  SELECT cantidad_declarada INTO v_declared
  FROM public.turno_jornada_inventario_entrega_lineas
  WHERE entrega_id=v_delivery AND producto_id=v_product;
  IF v_declared IS DISTINCT FROM 13::numeric THEN
    RAISE EXCEPTION 'FAIL: inserting an active FINAL correction did not update the pending handover (expected 13, got %).',v_declared;
  END IF;

  INSERT INTO public.turno_jornada_inventario_correcciones(
    id,turno_sesion_id,tipo,producto_id,cantidad_original,cantidad_corregida,
    comentario,creado_por,creado_en,vigente
  ) VALUES(
    v_second_correction,v_session,'FINAL',v_product,13,14,
    'Second correction supersedes first final count',v_owner,now(),true
  );
  SELECT cantidad_declarada INTO v_declared
  FROM public.turno_jornada_inventario_entrega_lineas
  WHERE entrega_id=v_delivery AND producto_id=v_product;
  IF v_declared IS DISTINCT FROM 14::numeric THEN
    RAISE EXCEPTION 'FAIL: latest active FINAL correction did not win (expected 14, got %).',v_declared;
  END IF;

  UPDATE public.turno_jornada_inventario_correcciones
  SET vigente=false
  WHERE id=v_second_correction;
  SELECT cantidad_declarada INTO v_declared
  FROM public.turno_jornada_inventario_entrega_lineas
  WHERE entrega_id=v_delivery AND producto_id=v_product;
  IF v_declared IS DISTINCT FROM 13::numeric THEN
    RAISE EXCEPTION 'FAIL: disabling the latest correction did not restore the previous active correction (expected 13, got %).',v_declared;
  END IF;

  UPDATE public.turno_jornada_inventario_correcciones
  SET vigente=false
  WHERE id=v_first_correction;
  SELECT cantidad_declarada,cantidad_efectiva INTO v_declared,v_effective
  FROM public.turno_jornada_inventario_entrega_lineas
  WHERE entrega_id=v_delivery AND producto_id=v_product;
  IF v_declared IS DISTINCT FROM 10::numeric OR v_effective IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: disabling all FINAL corrections did not restore the immutable physical count or altered received quantity.';
  END IF;

  SELECT count(*) INTO v_events
  FROM public.turno_eventos
  WHERE turno_id=v_turn
    AND turno_sesion_id=v_session
    AND tipo='INVENTARIO_ENTREGA_PENDIENTE_SINCRONIZADA_CORTE_FINAL'
    AND payload->>'entrega_id'=v_delivery::text
    AND payload->>'producto_id'=v_product::text;
  IF v_events<>4 THEN
    RAISE EXCEPTION 'FAIL: expected 4 immutable handover-sync audit events for 4 distinct quantity changes, received %.',v_events;
  END IF;

  RAISE NOTICE 'PASS: pending handover follows active FINAL corrections, restores previous/original quantities on correction deactivation, preserves receipt quantities, and audits every change.';
END
$handover_sync$;
