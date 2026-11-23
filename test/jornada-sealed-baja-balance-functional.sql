\set ON_ERROR_STOP on
-- Disposable PostgreSQL 17 integration scenario. This proves the sealed
-- Jornada ledger, picker, multi-line Bajas, idempotency and master-Turn gate
-- against real rows/functions; it never connects to Supabase LIVE.
DO $sealed_baja_functional$
DECLARE
  v_owner uuid:='20000000-0000-0000-0000-000000000001';
  v_worker uuid:='20000000-0000-0000-0000-000000000003';
  v_worker_role uuid:='30000000-0000-0000-0000-000000000002';
  v_warehouse uuid:='10000000-0000-0000-0000-000000000101';
  v_product uuid:='31000000-0000-0000-0000-000000000001';
  v_turn uuid:='a9100000-0000-0000-0000-000000000001';
  v_program uuid:='a9200000-0000-0000-0000-000000000001';
  v_session uuid:='a9300000-0000-0000-0000-000000000001';
  v_tranche uuid:='a9400000-0000-0000-0000-000000000001';
  v_initial_cut uuid:='a9500000-0000-0000-0000-000000000001';
  v_late uuid:=now()-interval '20 minutes';
  v_cutoff timestamptz:=now()-interval '60 minutes';
  v_start timestamptz:=now()-interval '8 hours';
  v_today date:=(now() AT TIME ZONE 'America/Havana')::date;
  v_balance numeric;
  v_available numeric;
  v_global_stock numeric;
  v_lines jsonb;
  v_result jsonb;
  v_retry jsonb;
  v_error boolean:=false;
  v_request_key uuid:='a9600000-0000-0000-0000-000000000001';
  v_short_key uuid:='a9600000-0000-0000-0000-000000000002';
  v_closed_key uuid:='a9600000-0000-0000-0000-000000000003';
BEGIN
  INSERT INTO auth.users(id) VALUES(v_owner),(v_worker)
  ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.usuarios(id,activo,role_id,nombre)
  VALUES(v_worker,true,v_worker_role,'Dependienta sealed Jornada fixture')
  ON CONFLICT(id) DO UPDATE
    SET activo=true,role_id=EXCLUDED.role_id,nombre=EXCLUDED.nombre;

  INSERT INTO public.almacenes(id,nombre,tipo,activo)
  VALUES(v_warehouse,'Sealed Jornada functional fixture','minorista',true)
  ON CONFLICT(id) DO UPDATE SET nombre=EXCLUDED.nombre,tipo='minorista',activo=true;
  INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
  VALUES(v_product,v_warehouse,100,0)
  ON CONFLICT(producto_id,almacen_id) DO UPDATE SET cantidad=100,minimo=0;

  INSERT INTO public.turnos(
    id,usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,
    estado_maestro,dias_turno,apertura_real
  ) VALUES(
    v_turn,v_owner,'Dueño sealed fixture',v_warehouse,v_today,'ABIERTO',v_owner,v_owner,
    'EN_CURSO',1,v_start
  );

  INSERT INTO public.turno_jornada_programacion(
    id,turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,creado_por,actualizado_por
  ) VALUES(
    v_program,v_turn,v_warehouse,1,v_today,v_today,true,v_worker,
    '07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner
  );

  INSERT INTO public.turno_sesiones(
    id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id,
    apertura_retroactiva,cierre_operativo_at,corte_operativo_at,
    cierre_operativo_origen,cierre_operativo_por
  ) VALUES(
    v_session,v_turn,v_warehouse,1,'JORNADA',v_today,'CERRADA_OPERATIVAMENTE',v_program,
    true,v_late,v_cutoff,'MANUAL',v_owner
  );

  INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
  VALUES(v_session,v_turn,v_worker,v_owner);

  INSERT INTO public.turno_tramos(
    id,turno_id,turno_sesion_id,usuario_id,tipo,estado,inicio_at,fin_at
  ) VALUES(
    v_tranche,v_turn,v_session,v_worker,'NORMAL','COMPLETADO',v_start,v_cutoff
  );

  INSERT INTO public.turno_jornada_inventario_cortes(
    id,turno_sesion_id,tipo,estado,creado_por,confirmado_por,creado_en,confirmado_en,observacion
  ) VALUES(
    v_initial_cut,v_session,'INICIAL','CONFIRMADO',v_worker,v_worker,v_start,v_start,
    'Initial count for sealed Jornada test'
  );
  INSERT INTO public.turno_jornada_inventario_lineas(corte_id,producto_id,cantidad_contada,stock_sistema)
  VALUES(v_initial_cut,v_product,10,10);

  -- These same-session approvals occurred AFTER the operational cutoff.
  -- They must still affect the sealed Jornada's reconciliation ledger.
  INSERT INTO public.bajas(
    almacen_id,producto_id,ciclo_id,sesion_id,cantidad,motivo,estado,
    creado_por,creado_nombre,creado_en,actualizado_en,fecha_revision,
    revisado_por,revisado_nombre,comentario_revision,turno_sesion_id,turno_tramo_id
  ) VALUES(
    v_warehouse,v_product,NULL,NULL,2,'Approved late baja','APROBADA',
    v_worker,'Dependienta fixture',v_late,v_late,v_late,
    v_owner,'Dueño fixture','Late evidence approved',v_session,v_tranche
  );
  INSERT INTO public.mermas(
    almacen_id,producto_id,ciclo_id,sesion_id,cantidad,motivo,estado,
    creado_por,creado_nombre,creado_en,actualizado_en,fecha_revision,
    revisado_por,revisado_nombre,comentario_revision,turno_sesion_id,turno_tramo_id
  ) VALUES(
    v_warehouse,v_product,NULL,NULL,1,'Approved late merma','APROBADA',
    v_worker,'Dependienta fixture',v_late,v_late,v_late,
    v_owner,'Dueño fixture','Late evidence approved',v_session,v_tranche
  );

  -- A warehouse purchase after the immutable cutoff must not leak into this
  -- Jornada's historic balance, even though global stock reflects it.
  INSERT INTO public.lotes_compra(
    id,producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario,
    fecha_compra,origen,usuario_id,compra_id
  ) VALUES(
    'a9700000-0000-0000-0000-000000000001',v_product,v_warehouse,50,50,1,
    v_late,'compra',v_worker,NULL
  );

  -- A pending request reserves one additional unit without decrementing the ledger.
  INSERT INTO public.bajas(
    almacen_id,producto_id,ciclo_id,sesion_id,cantidad,motivo,estado,
    creado_por,creado_nombre,creado_en,actualizado_en,turno_sesion_id,turno_tramo_id
  ) VALUES(
    v_warehouse,v_product,NULL,NULL,1,'Pending reservation','PENDIENTE',
    v_worker,'Dependienta fixture',now(),now(),v_session,v_tranche
  );

  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver,bajas:crear',false);

  SELECT cantidad_actual INTO v_balance
  FROM public.bc7_jornada_saldos_operativos(v_session)
  WHERE producto_id=v_product;
  IF v_balance IS DISTINCT FROM 7::numeric THEN
    RAISE EXCEPTION 'FAIL: sealed balance should be opening 10 - late approved Baja 2 - late approved Merma 1, excluding post-cutoff purchase 50; balance=%',v_balance;
  END IF;

  SELECT stock_actual INTO v_available
  FROM public.bc7_productos_ajuste_jornada(v_session)
  WHERE producto_id=v_product;
  IF v_available IS DISTINCT FROM 6::numeric THEN
    RAISE EXCEPTION 'FAIL: sealed picker must use the operational balance 7 less pending reservation 1, not global stock; available=%',v_available;
  END IF;

  v_lines:=jsonb_build_array(jsonb_build_object(
    'producto_id',v_product,'cantidad',6,'motivo','Late sealed Jornada correction'
  ));
  v_result:=public.bc7_registrar_bajas_multiple_jornada(
    v_session,v_lines,'Late Baja while master Turn remains open',v_request_key
  );
  IF v_result->>'count'<>'1'
     OR v_result->>'estado'<>'PENDIENTE'
     OR (v_result->>'solicitud_id') IS NULL THEN
    RAISE EXCEPTION 'FAIL: multi-product Baja was not created atomically in a sealed Jornada; result=%',v_result;
  END IF;

  v_retry:=public.bc7_registrar_bajas_multiple_jornada(
    v_session,v_lines,'Late Baja while master Turn remains open',v_request_key
  );
  IF v_retry->>'solicitud_id' IS DISTINCT FROM v_result->>'solicitud_id'
     OR v_retry->>'count'<>'1'
     OR (SELECT count(*) FROM public.bajas WHERE solicitud_id=(v_result->>'solicitud_id')::uuid)<>1 THEN
    RAISE EXCEPTION 'FAIL: exact network retry duplicated the sealed Jornada Baja request; first=% retry=%',v_result,v_retry;
  END IF;

  v_error:=false;
  BEGIN
    PERFORM public.bc7_registrar_bajas_multiple_jornada(
      v_session,
      jsonb_build_array(jsonb_build_object(
        'producto_id',v_product,'cantidad',1,'motivo','Must fail without remaining stock'
      )),
      'Atomic insufficient-stock attempt',v_short_key
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_error:=true;
  END;
  IF NOT v_error OR EXISTS(
    SELECT 1 FROM public.bajas_solicitudes
    WHERE creado_por=v_worker AND idempotency_key=v_short_key
  ) THEN
    RAISE EXCEPTION 'FAIL: insufficient remaining stock did not reject the whole second request atomically.';
  END IF;

  SELECT cantidad INTO v_global_stock
  FROM public.stock WHERE almacen_id=v_warehouse AND producto_id=v_product;
  IF v_global_stock IS DISTINCT FROM 100::numeric THEN
    RAISE EXCEPTION 'FAIL: sealed Jornada pending Bajas must not decrement global warehouse stock; stock=%',v_global_stock;
  END IF;

  -- Once the master Turn closes, a new late request must be rejected by the
  -- responsible-tranche guard and leave no parent or child rows behind.
  UPDATE public.turnos
  SET estado='CERRADO',estado_maestro='CERRADO',cierre_real=now(),actualizado_en=now()
  WHERE id=v_turn;

  v_error:=false;
  BEGIN
    PERFORM public.bc7_registrar_bajas_multiple_jornada(
      v_session,
      jsonb_build_array(jsonb_build_object(
        'producto_id',v_product,'cantidad',0.25,'motivo','Must fail after master Turn closure'
      )),
      'Closed master Turn must reject late Bajas',v_closed_key
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_error:=true;
  END;
  IF NOT v_error OR EXISTS(
    SELECT 1 FROM public.bajas_solicitudes
    WHERE creado_por=v_worker AND idempotency_key=v_closed_key
  ) THEN
    RAISE EXCEPTION 'FAIL: late Baja remained writable after the master Turn closed.';
  END IF;

  RAISE NOTICE 'PASS sealed Jornada functional: cutoff, linked late approvals, general movement exclusion, picker balance, grouped Baja, idempotency, reservations, atomic stock rejection, no global stock mutation and closed-Turn write gate.';
END
$sealed_baja_functional$;
