\set ON_ERROR_STOP on
-- Disposable PostgreSQL 17 integration scenario for the ADMIN-only sealed
-- final inventory capture. Never connects to Supabase LIVE.
DO $sealed_final_inventory_admin_capture$
DECLARE
  v_admin uuid:='20000000-0000-0000-0000-000000000011';
  v_warehouse uuid:='10000000-0000-0000-0000-000000000111';
  v_product uuid:='31000000-0000-0000-0000-000000000011';
  v_product2 uuid:='31000000-0000-0000-0000-000000000012';
  v_admin_role uuid;
  v_turn uuid:='a9100000-0000-0000-0000-000000000011';
  v_program uuid:='a9200000-0000-0000-0000-000000000011';
  v_session uuid:='a9300000-0000-0000-0000-000000000011';
  v_initial_cut uuid:='a9500000-0000-0000-0000-000000000011';
  v_tranche uuid:='a9400000-0000-0000-0000-000000000011';
  v_future_tranche uuid:='a9400000-0000-0000-0000-000000000012';
  v_key uuid:='a9600000-0000-0000-0000-000000000011';
  v_closed_key uuid:='a9600000-0000-0000-0000-000000000012';
  v_cut uuid;
  v_result jsonb;
  v_retry jsonb;
  v_balance numeric;
  v_global numeric;
  v_error boolean:=false;
  v_today date:=(now() AT TIME ZONE 'America/Havana')::date;
  v_cutoff timestamptz:=now()-interval '60 minutes';
  v_start timestamptz:=now()-interval '8 hours';
  v_lines jsonb:=jsonb_build_array(
    jsonb_build_object('producto_id','31000000-0000-0000-0000-000000000011','cantidad',7),
    jsonb_build_object('producto_id','31000000-0000-0000-0000-000000000012','cantidad',3)
  );
  v_incomplete jsonb:=jsonb_build_array(jsonb_build_object(
    'producto_id','31000000-0000-0000-0000-000000000011','cantidad',7
  ));
  v_hash text:=repeat('a',64);
BEGIN
  INSERT INTO auth.users(id) VALUES(v_admin) ON CONFLICT(id) DO NOTHING;

  SELECT id INTO v_admin_role FROM public.roles
  WHERE id='30000000-0000-0000-0000-000000000001'::uuid
    AND nombre='Dueño'
  LIMIT 1;
  IF v_admin_role IS NULL THEN
    RAISE EXCEPTION 'The PostgreSQL 17 fixture must seed an owner/admin role.';
  END IF;
  INSERT INTO public.usuarios(id,activo,role_id,nombre)
  VALUES(v_admin,true,v_admin_role,'ADMIN sealed inventory fixture')
  ON CONFLICT(id) DO UPDATE SET activo=true,role_id=EXCLUDED.role_id,nombre=EXCLUDED.nombre;

  INSERT INTO public.almacenes(id,nombre,tipo,activo)
  VALUES(v_warehouse,'Sealed final inventory fixture','minorista',true)
  ON CONFLICT(id) DO UPDATE SET nombre=EXCLUDED.nombre,tipo='minorista',activo=true;

  INSERT INTO public.productos(id,nombre,unidad,activo,precio_normal)
  VALUES(v_product,'Producto fixture sellado','unidad',true,10)
  ON CONFLICT(id) DO UPDATE SET nombre=EXCLUDED.nombre,activo=true,producto_padre_id=NULL,archivado_at=NULL;

  INSERT INTO public.productos(id,nombre,unidad,activo,precio_normal)
  VALUES(v_product2,'Producto fixture sellado 2','unidad',true,10)
  ON CONFLICT(id) DO UPDATE SET nombre=EXCLUDED.nombre,activo=true,producto_padre_id=NULL,archivado_at=NULL;

  INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
  VALUES(v_product,v_warehouse,10,0),(v_product2,v_warehouse,5,0)
  ON CONFLICT(producto_id,almacen_id) DO UPDATE SET cantidad=EXCLUDED.cantidad,minimo=0;

  INSERT INTO public.turnos(
    id,usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,
    estado_maestro,dias_turno,apertura_real
  ) VALUES(
    v_turn,v_admin,'Dueño sealed fixture',v_warehouse,v_today,'ABIERTO',v_admin,v_admin,
    'EN_CURSO',1,v_start
  );

  INSERT INTO public.turno_jornada_programacion(
    id,turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,creado_por,actualizado_por
  ) VALUES(
    v_program,v_turn,v_warehouse,1,v_today,v_today,true,v_admin,
    '07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_admin,v_admin
  );

  INSERT INTO public.turno_sesiones(
    id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id,
    apertura_retroactiva,cierre_operativo_at,corte_operativo_at,
    cierre_operativo_origen,cierre_operativo_por
  ) VALUES(
    v_session,v_turn,v_warehouse,1,'JORNADA',v_today,'CERRADA_OPERATIVAMENTE',v_program,
    true,v_cutoff+interval '1 hour',v_cutoff,'AUTO_HORA_FIN',v_admin
  );

  -- The fixture's owner account is also the assigned responsible for
  -- this scenario; the sealed worker checklist must verify a real assignment.
  INSERT INTO public.turno_asignaciones(
    turno_sesion_id,turno_id,usuario_id,asignado_por,motivo
  ) VALUES(
    v_session,v_turn,v_admin,v_admin,'Assigned responsible for sealed checklist fixture'
  );

  INSERT INTO public.turno_tramos(
    id,turno_id,turno_sesion_id,usuario_id,tipo,estado,inicio_at,fin_at
  ) VALUES(
    v_future_tranche,v_turn,v_session,v_admin,'NORMAL','COMPLETADO',
    v_start,v_cutoff+interval '5 minutes'
  );

  INSERT INTO public.turno_jornada_inventario_cortes(
    id,turno_sesion_id,tipo,estado,creado_por,confirmado_por,creado_en,confirmado_en,observacion
  ) VALUES(
    v_initial_cut,v_session,'INICIAL','CONFIRMADO',v_admin,v_admin,v_start,v_start,
    'Opening physical count'
  );
  INSERT INTO public.turno_jornada_inventario_lineas(corte_id,producto_id,cantidad_contada,stock_sistema)
  VALUES(v_initial_cut,v_product,10,10),(v_initial_cut,v_product2,5,5);

  PERFORM set_config('request.jwt.claim.sub',v_admin::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','turnos:ver,turnos:editar_any',false);

  -- A completed tranche after the operational cutoff must not be mistaken for
  -- the sealed Jornada tranche. The checklist must remain untouched.
  v_error:=false;
  BEGIN
    PERFORM public.bc7_confirmar_bloque_jornada(v_session,'gastos',true);
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_error:=true;
  END;
  IF NOT v_error OR EXISTS(
    SELECT 1 FROM public.turno_jornada_confirmaciones
    WHERE turno_sesion_id=v_session
  ) THEN
    RAISE EXCEPTION 'FAIL: owner checklist accepted a non-matching completed tranche.';
  END IF;

  INSERT INTO public.turno_tramos(
    id,turno_id,turno_sesion_id,usuario_id,tipo,estado,inicio_at,fin_at
  ) VALUES(
    v_tranche,v_turn,v_session,v_admin,'NORMAL','COMPLETADO',v_start,v_cutoff
  );

  PERFORM public.bc7_confirmar_bloque_jornada(v_session,'gastos',true);
  PERFORM public.bc7_confirmar_bloque_jornada(v_session,'reinversiones',true);
  PERFORM public.bc7_confirmar_bloque_jornada(v_session,'bajas',true);
  IF NOT EXISTS(
    SELECT 1 FROM public.turno_jornada_confirmaciones
    WHERE turno_sesion_id=v_session
      AND gastos_completado AND reinversiones_completado AND bajas_completado
  ) THEN
    RAISE EXCEPTION 'FAIL: owner checklist did not confirm all sealed blocks while master Turn remained open.';
  END IF;

  v_error:=false;
  BEGIN
    PERFORM public.bc7_admin_registrar_inventario_final_sellado_jornada(
      v_session,v_incomplete,'Archivo histórico incompleto.',
      'Sheyla-inventario-final.csv',v_hash,v_key
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_error:=true;
  END;
  IF NOT v_error OR EXISTS (
    SELECT 1 FROM public.turno_jornada_inventario_cortes
    WHERE turno_sesion_id=v_session AND tipo='FINAL'
  ) THEN
    RAISE EXCEPTION 'FAIL: incomplete product set was not rejected before creating the final cut.';
  END IF;

  v_result:=public.bc7_admin_registrar_inventario_final_sellado_jornada(
    v_session,v_lines,'Conteo físico del 20/11 a las 23:00, fuente firmada.',
    'Sheyla-inventario-final.csv',v_hash,v_key
  );
  v_cut:=(v_result->>'corte_id')::uuid;
  IF v_result->>'ok'<>'true'
     OR v_result->>'idempotente'<>'false'
     OR (SELECT count(*) FROM public.turno_jornada_inventario_cortes
         WHERE turno_sesion_id=v_session AND tipo='FINAL' AND estado='CONFIRMADO')<>1 THEN
    RAISE EXCEPTION 'FAIL: sealed ADMIN capture did not create exactly one confirmed final cut: %',v_result;
  END IF;

  IF (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas
      WHERE corte_id=v_cut AND producto_id=v_product) IS DISTINCT FROM 7::numeric
     OR (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas
      WHERE corte_id=v_cut AND producto_id=v_product2) IS DISTINCT FROM 3::numeric THEN
    RAISE EXCEPTION 'FAIL: complete physical quantities were not stored.';
  END IF;
  IF (SELECT stock_sistema FROM public.turno_jornada_inventario_lineas
      WHERE corte_id=v_cut AND producto_id=v_product) IS DISTINCT FROM 10::numeric THEN
    RAISE EXCEPTION 'FAIL: reference balance should be operational balance 10, not arbitrary global stock.';
  END IF;
  IF (SELECT corte_operativo_at FROM public.turno_sesiones WHERE id=v_session) IS DISTINCT FROM v_cutoff THEN
    RAISE EXCEPTION 'FAIL: historical operational cutoff was mutated.';
  END IF;
  IF (SELECT estado FROM public.turno_sesiones WHERE id=v_session) IS DISTINCT FROM 'CERRADA_OPERATIVAMENTE'
     OR (SELECT estado FROM public.turnos WHERE id=v_turn) IS DISTINCT FROM 'ABIERTO' THEN
    RAISE EXCEPTION 'FAIL: capture must not reopen the Jornada or close the master Turn.';
  END IF;
  SELECT cantidad INTO v_global FROM public.stock
  WHERE producto_id=v_product AND almacen_id=v_warehouse;
  IF v_global IS DISTINCT FROM 10::numeric THEN
    RAISE EXCEPTION 'FAIL: global warehouse stock changed during historical capture.';
  END IF;

  v_retry:=public.bc7_admin_registrar_inventario_final_sellado_jornada(
    v_session,v_lines,'Conteo físico del 20/11 a las 23:00, fuente firmada.',
    'Sheyla-inventario-final.csv',v_hash,v_key
  );
  IF v_retry->>'idempotente'<>'true'
     OR (v_retry->>'corte_id')::uuid IS DISTINCT FROM v_cut
     OR (SELECT count(*) FROM public.turno_jornada_inventario_cortes
         WHERE turno_sesion_id=v_session AND tipo='FINAL')<>1 THEN
    RAISE EXCEPTION 'FAIL: exact upload retry duplicated the final inventory cut.';
  END IF;

  v_error:=false;
  BEGIN
    PERFORM public.bc7_admin_registrar_inventario_final_sellado_jornada(
      v_session,jsonb_build_array(jsonb_build_object(
        'producto_id',v_product,'cantidad',8
      )),'Payload distinto con la misma clave.','Sheyla-inventario-final.csv',v_hash,v_key
    );
  EXCEPTION WHEN SQLSTATE '23505' THEN
    v_error:=true;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION 'FAIL: reused idempotency key with a different payload was accepted.';
  END IF;

  -- The same upload is locked out once the master Turn closes.
  UPDATE public.turnos SET estado='CERRADO',estado_maestro='CERRADO',cierre_real=now()
  WHERE id=v_turn;
  v_error:=false;
  BEGIN
    PERFORM public.bc7_admin_registrar_inventario_final_sellado_jornada(
      v_session,v_lines,'Intento tras cerrar el Turno.','Sheyla-inventario-final.csv',
      v_hash,v_closed_key
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_error:=true;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION 'FAIL: sealed inventory capture remained writable after master Turn closure.';
  END IF;

  v_error:=false;
  BEGIN
    PERFORM public.bc7_confirmar_bloque_jornada(v_session,'gastos',false);
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_error:=true;
  END;
  IF NOT v_error OR NOT EXISTS(
    SELECT 1 FROM public.turno_jornada_confirmaciones
    WHERE turno_sesion_id=v_session AND gastos_completado
  ) THEN
    RAISE EXCEPTION 'FAIL: sealed owner checklist remained writable or changed after master Turn closure.';
  END IF;

  IF pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure)
     NOT LIKE '%THEN v_s.corte_operativo_at%' THEN
    RAISE EXCEPTION 'FAIL: historical liquidation does not use the immutable operational cutoff.';
  END IF;

  RAISE NOTICE 'PASS sealed final inventory ADMIN capture: exact initial product set, source SHA-256, historical cutoff, ledger reference balance, no global stock mutation, idempotency and closed-Turn write gate.';
END
$sealed_final_inventory_admin_capture$;
