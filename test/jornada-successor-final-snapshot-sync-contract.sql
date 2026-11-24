-- PostgreSQL 17 regression contract for historical successor snapshot inheritance.
DO $test$
DECLARE
  v_owner uuid := '20000000-0000-0000-0000-000000000001';
  v_warehouse uuid := '10000000-0000-0000-0000-000000000223';
  v_product uuid := '31000000-0000-0000-0000-000000000223';
  v_late_product uuid := '31000000-0000-0000-0000-000000000224';
  v_third_product uuid := '31000000-0000-0000-0000-000000000225';
  v_turn uuid := 'a9100000-0000-0000-0000-000000000223';
  v_program uuid := 'a9200000-0000-0000-0000-000000000223';
  v_session uuid := 'a9300000-0000-0000-0000-000000000223';
  v_cut uuid := 'a9500000-0000-0000-0000-000000000223';
  v_delivery uuid;
  v_count integer;
  v_quantity numeric;
  v_events integer;
  v_function text;
  v_validation_block text;
  v_helper oid := 'public.bc7_sync_pending_handover_product_from_final(uuid,uuid,uuid)'::regprocedure;
  v_bulk_helper oid := 'public.bc7_sync_pending_handover_from_final_cut(uuid,uuid)'::regprocedure;
  v_helper_config text[];
BEGIN
  -- Static safety contract: scheduling reconciles to source FINAL, not today's
  -- product catalogue.
  SELECT pg_get_functiondef(
    'public.bc7_admin_programar_sucesora_pendiente(uuid,date,uuid,text)'::regprocedure
  ) INTO v_function;

  -- The line comparison must be scoped to this delivery's exact source FINAL cut.
  v_validation_block:=substring(
    v_function
    FROM position('LEFT JOIN LATERAL (' IN v_function)
    FOR position('SELECT v_mismatch_count + count(*)::integer' IN v_function)
        - position('LEFT JOIN LATERAL (' IN v_function)
  );
  IF position('WHERE source_line.corte_id=v_e.origen_corte_id' IN v_validation_block)=0 THEN
    RAISE EXCEPTION 'FAIL: FINAL-vs-delivery mismatch validation must exclude inventory lines from every other historical cut.';
  END IF;

  IF position('bc7_sync_pending_handover_from_final_cut' IN v_function)=0
     OR position('turno_jornada_inventario_lineas' IN v_function)=0
     OR position('La entrega heredada no coincide con el inventario FINAL confirmado' IN v_function)=0 THEN
    RAISE EXCEPTION 'FAIL: successor scheduling must reconcile and validate the confirmed source FINAL snapshot.';
  END IF;

  IF position('FROM public.productos p WHERE p.activo=true' IN v_function)>0
     OR position('v_expected' IN v_function)>0 THEN
    RAISE EXCEPTION 'FAIL: successor scheduling must not use the current active product catalogue as a historical line-count requirement.';
  END IF;

  IF position('v_old_p.salario_porcentaje' IN v_function)>0 THEN
    RAISE EXCEPTION 'FAIL: retroactive successor must not inherit the outgoing jornada-specific salary percentage.';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_helper)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_bulk_helper)
     OR has_function_privilege('authenticated',v_helper,'EXECUTE')
     OR has_function_privilege('anon',v_helper,'EXECUTE')
     OR has_function_privilege('authenticated',v_bulk_helper,'EXECUTE')
     OR has_function_privilege('anon',v_bulk_helper,'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: internal synchronizers must remain SECURITY DEFINER and not be exposed as Data API RPCs.';
  END IF;

  SELECT proconfig INTO v_helper_config FROM pg_proc WHERE oid=v_helper;
  IF NOT ('search_path=""'=ANY(coalesce(v_helper_config,ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'FAIL: internal snapshot synchronizer must use an empty search_path.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='bc7_sync_pending_handover_final_line'
      AND tgrelid='public.turno_jornada_inventario_lineas'::regclass
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='bc7_sync_pending_handover_final_correction_snapshot'
      AND tgrelid='public.turno_jornada_inventario_correcciones'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'FAIL: FINAL line and correction snapshot triggers are required.';
  END IF;

  -- Build a closed source turn with a confirmed FINAL and allow the existing
  -- deferred handover trigger to prepare its initial pending snapshot.
  INSERT INTO public.almacenes(id,nombre,tipo,activo)
  VALUES(v_warehouse,'Successor snapshot fixture','minorista',true)
  ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.productos(id,nombre,unidad,activo,precio_normal)
  VALUES(v_product,'Snapshot base product','unidad',true,10)
  ON CONFLICT(id) DO UPDATE
    SET activo=true,producto_padre_id=NULL,archivado_at=NULL;

  INSERT INTO public.turnos(
    id,usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,
    estado_maestro,dias_turno,apertura_real
  ) VALUES (
    v_turn,v_owner,'Snapshot owner',v_warehouse,
    (now() AT TIME ZONE 'America/Havana')::date+30000,
    'ABIERTO',v_owner,v_owner,'EN_CURSO',1,now()-interval '8 hours'
  ) ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.turno_jornada_programacion(
    id,turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,
    creado_por,actualizado_por
  ) VALUES (
    v_program,v_turn,v_warehouse,1,
    (now() AT TIME ZONE 'America/Havana')::date+30000,
    (now() AT TIME ZONE 'America/Havana')::date+30000,
    true,v_owner,'07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner
  ) ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.turno_sesiones(
    id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id,
    apertura_retroactiva,cierre_operativo_at,corte_operativo_at,
    cierre_operativo_origen,cierre_operativo_por
  ) VALUES (
    v_session,v_turn,v_warehouse,1,'JORNADA',
    (now() AT TIME ZONE 'America/Havana')::date+30000,
    'CERRADA_OPERATIVAMENTE',v_program,false,now(),now(),'AUTO_HORA_FIN',v_owner
  ) ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.turno_jornada_inventario_cortes(
    id,turno_sesion_id,tipo,estado,creado_por,confirmado_por,
    creado_en,confirmado_en,observacion
  ) VALUES (
    v_cut,v_session,'FINAL','CONFIRMADO',v_owner,v_owner,now(),now(),
    'FINAL source snapshot for retroactive successor regression'
  ) ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.turno_jornada_inventario_lineas(
    corte_id,producto_id,cantidad_contada,stock_sistema
  ) VALUES(v_cut,v_product,10,10)
  ON CONFLICT(corte_id,producto_id) DO NOTHING;

  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada IMMEDIATE;
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada DEFERRED;

  SELECT e.id INTO v_delivery
  FROM public.turno_jornada_inventario_entregas e
  WHERE e.origen_sesion_id=v_session
    AND e.origen_corte_id=v_cut
    AND e.estado='PENDIENTE_PROGRAMACION'
    AND e.destino_sesion_id IS NULL;

  IF v_delivery IS NULL THEN
    RAISE EXCEPTION 'FAIL: confirmed FINAL must prepare a pending successor handover.';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.turno_jornada_inventario_entrega_lineas
  WHERE entrega_id=v_delivery;

  IF v_count<>1 THEN
    RAISE EXCEPTION 'FAIL: initial pending handover should contain one source FINAL line, got %.',v_count;
  END IF;

  -- The catalogue item itself is created only after the old handover exists.
  INSERT INTO public.productos(id,nombre,unidad,activo,precio_normal)
  VALUES(v_late_product,'Product created after source snapshot','unidad',true,10)
  ON CONFLICT(id) DO UPDATE
    SET activo=true,producto_padre_id=NULL,archivado_at=NULL;

  -- Adding its physical FINAL line later must update the pending handover.
  INSERT INTO public.turno_jornada_inventario_lineas(
    corte_id,producto_id,cantidad_contada,stock_sistema
  ) VALUES(v_cut,v_late_product,7,7);

  SELECT count(*) INTO v_count
  FROM public.turno_jornada_inventario_entrega_lineas
  WHERE entrega_id=v_delivery;

  SELECT cantidad_declarada INTO v_quantity
  FROM public.turno_jornada_inventario_entrega_lineas
  WHERE entrega_id=v_delivery AND producto_id=v_late_product;

  IF v_count<>2 OR v_quantity IS DISTINCT FROM 7::numeric THEN
    RAISE EXCEPTION 'FAIL: inserting a late FINAL line must add it to the pending handover (lines %, quantity %).',v_count,v_quantity;
  END IF;

  UPDATE public.turno_jornada_inventario_lineas
  SET cantidad_contada=8
  WHERE corte_id=v_cut AND producto_id=v_late_product;

  SELECT cantidad_declarada INTO v_quantity
  FROM public.turno_jornada_inventario_entrega_lineas
  WHERE entrega_id=v_delivery AND producto_id=v_late_product;

  IF v_quantity IS DISTINCT FROM 8::numeric THEN
    RAISE EXCEPTION 'FAIL: updating a FINAL quantity must update the pending handover, got %.',v_quantity;
  END IF;

  DELETE FROM public.turno_jornada_inventario_lineas
  WHERE corte_id=v_cut AND producto_id=v_late_product;

  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_inventario_entrega_lineas
    WHERE entrega_id=v_delivery AND producto_id=v_late_product
  ) THEN
    RAISE EXCEPTION 'FAIL: deleting a FINAL line must remove it from an unlinked pending handover.';
  END IF;

  INSERT INTO public.productos(id,nombre,unidad,activo,precio_normal)
  VALUES(v_third_product,'Another later product','unidad',true,10)
  ON CONFLICT(id) DO UPDATE
    SET activo=true,producto_padre_id=NULL,archivado_at=NULL;

  INSERT INTO public.turno_jornada_inventario_lineas(
    corte_id,producto_id,cantidad_contada,stock_sistema
  ) VALUES(v_cut,v_third_product,5,5);

  SELECT cantidad_declarada INTO v_quantity
  FROM public.turno_jornada_inventario_entrega_lineas
  WHERE entrega_id=v_delivery AND producto_id=v_third_product;

  IF v_quantity IS DISTINCT FROM 5::numeric THEN
    RAISE EXCEPTION 'FAIL: a second late FINAL product must be synchronized before scheduling.';
  END IF;

  -- Once the delivery leaves PENDIENTE_PROGRAMACION, the FINAL snapshot and
  -- receipt workflow are no longer auto-mutated by later source edits.
  UPDATE public.turno_jornada_inventario_entregas
  SET estado='REQUIERE_RECUENTO'
  WHERE id=v_delivery;

  UPDATE public.turno_jornada_inventario_lineas
  SET cantidad_contada=6
  WHERE corte_id=v_cut AND producto_id=v_third_product;

  SELECT cantidad_declarada INTO v_quantity
  FROM public.turno_jornada_inventario_entrega_lineas
  WHERE entrega_id=v_delivery AND producto_id=v_third_product;

  IF v_quantity IS DISTINCT FROM 5::numeric THEN
    RAISE EXCEPTION 'FAIL: a handover that left PENDIENTE_PROGRAMACION must remain immutable.';
  END IF;

  SELECT count(*) INTO v_events
  FROM public.turno_eventos
  WHERE turno_id=v_turn
    AND turno_sesion_id=v_session
    AND tipo='INVENTARIO_ENTREGA_PENDIENTE_SINCRONIZADA_CORTE_FINAL'
    AND payload->>'entrega_id'=v_delivery::text;

  IF v_events<3 THEN
    RAISE EXCEPTION 'FAIL: expected audit events for late line insert/update/delete, received %.',v_events;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock
    WHERE almacen_id=v_warehouse
  ) THEN
    RAISE EXCEPTION 'FAIL: snapshot synchronization must never alter global warehouse stock.';
  END IF;

  RAISE NOTICE 'PASS: successor snapshot inherits confirmed historical FINAL, tracks late line insert/update/delete while pending, ignores later catalogue growth, and freezes after receipt/review.';
END
$test$;
