\set ON_ERROR_STOP on
-- Disposable-only integration contract for La Cueva period settlement.
-- Applied only to the PostgreSQL 17 CI database after the legacy Jornada contracts.

DO $test$
DECLARE
  v_owner uuid:='20000000-0000-0000-0000-000000000001';
  v_worker uuid:='20000000-0000-0000-0000-000000000003';
  v_owner_role uuid:='30000000-0000-0000-0000-000000000001';
  v_worker_role uuid:='30000000-0000-0000-0000-000000000002';
  v_warehouse uuid:='10000000-0000-0000-0000-000000000099';
  v_other_warehouse uuid:='10000000-0000-0000-0000-000000000002';
  v_pan uuid:='31000000-0000-0000-0000-000000000001';
  v_juice uuid:='31000000-0000-0000-0000-000000000002';
  v_turn uuid:='a1000000-0000-0000-0000-000000000001';
  v_program uuid:='a2000000-0000-0000-0000-000000000001';
  v_session uuid:='a3000000-0000-0000-0000-000000000001';
  v_tranche uuid:='a4000000-0000-0000-0000-000000000001';
  v_initial_cut uuid:='a5000000-0000-0000-0000-000000000001';
  v_final_cut uuid:='a5000000-0000-0000-0000-000000000002';
  v_daily_id uuid;
  v_daily_retry uuid;
  v_result jsonb;
  v_error boolean;
  v_today date:=(now() AT TIME ZONE 'America/Havana')::date;
  v_start timestamptz:=now()-interval '2 hours';
  v_mid timestamptz:=now()-interval '90 minutes';
  v_end timestamptz:=now();
BEGIN
  INSERT INTO auth.users(id) VALUES(v_worker) ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.usuarios(id,activo,role_id,nombre)
  VALUES(v_worker,true,v_worker_role,'Dependienta La Cueva fixture')
  ON CONFLICT(id) DO UPDATE SET activo=true,role_id=EXCLUDED.role_id,nombre=EXCLUDED.nombre;

  INSERT INTO public.almacenes(id,nombre,tipo,activo)
  VALUES(v_warehouse,'La Cueva settlement fixture','minorista',true)
  ON CONFLICT(id) DO NOTHING;
  UPDATE public.productos SET precio_normal=10 WHERE id IN (v_pan,v_juice);
  INSERT INTO public.turno_jornada_configuracion(almacen_id)
  VALUES(v_warehouse) ON CONFLICT(almacen_id) DO NOTHING;

  INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
  VALUES(v_pan,v_warehouse,100,0),(v_juice,v_warehouse,100,0)
  ON CONFLICT(producto_id,almacen_id) DO UPDATE SET cantidad=EXCLUDED.cantidad;

  INSERT INTO public.turnos(
    id,usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,
    estado_maestro,dias_turno,apertura_real
  ) VALUES(
    v_turn,v_owner,'Dueño fixture',v_warehouse,v_today,'PROGRAMADO',v_owner,v_owner,
    'PROGRAMADO',2,v_start
  );

  INSERT INTO public.turno_jornada_programacion(
    id,turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,creado_por,actualizado_por
  ) VALUES(
    v_program,v_turn,v_warehouse,1,v_today,v_today+1,true,v_worker,
    '07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner
  );

  INSERT INTO public.turno_sesiones(
    id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id,apertura_retroactiva
  ) VALUES(v_session,v_turn,v_warehouse,1,'JORNADA',v_today,'PROGRAMADA',v_program,true);

  INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
  VALUES(v_session,v_turn,v_worker,v_owner);

  INSERT INTO public.turno_jornada_inventario_cortes(
    id,turno_sesion_id,tipo,estado,creado_por,confirmado_por,creado_en,confirmado_en,observacion
  ) VALUES(v_initial_cut,v_session,'INICIAL','CONFIRMADO',v_worker,v_worker,v_start,v_start,'Initial physical count');

  INSERT INTO public.turno_jornada_inventario_lineas(corte_id,producto_id,cantidad_contada,stock_sistema)
  VALUES(v_initial_cut,v_pan,10,10),(v_initial_cut,v_juice,5,5);

  -- No final inventory yet: sales and salary must stay unavailable rather than treating final stock as zero.
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  v_result:=public.bc7_liquidacion_inventario_jornada(v_session);
  IF v_result->>'ventas_estimadas' IS NOT NULL
     OR v_result->>'salario_calculado' IS NOT NULL
     OR jsonb_array_length(v_result->'lineas')<>0 THEN
    RAISE EXCEPTION 'FAIL: sales and salary must remain pending until final inventory confirmation; result=%',v_result;
  END IF;

  INSERT INTO public.turno_jornada_inventario_cortes(
    id,turno_sesion_id,tipo,estado,creado_por,confirmado_por,creado_en,confirmado_en,observacion
  ) VALUES(v_final_cut,v_session,'FINAL','CONFIRMADO',v_worker,v_worker,v_end,v_end,'Final physical count');
  INSERT INTO public.turno_jornada_inventario_lineas(corte_id,producto_id,cantidad_contada,stock_sistema)
  VALUES(v_final_cut,v_pan,7,7),(v_final_cut,v_juice,5,5);

  UPDATE public.turno_sesiones SET estado='EN_CURSO' WHERE id=v_session;
  UPDATE public.turnos SET estado='ABIERTO',estado_maestro='EN_CURSO' WHERE id=v_turn;

  INSERT INTO public.turno_tramos(id,turno_id,turno_sesion_id,usuario_id,tipo,estado,inicio_at)
  VALUES(v_tranche,v_turn,v_session,v_worker,'NORMAL','ACTIVO',v_start);

  -- Existing operational movements: +2 transfer, +1 purchase, -1 transfer, -1 vale.
  INSERT INTO public.transferencias(id,almacen_origen_id,almacen_destino_id,fecha,creado_por,estado)
  VALUES
    -- This inbound transfer is already represented in the imported initial count and is intentionally unlinked.
    ('a6000000-0000-0000-0000-000000000003',v_other_warehouse,v_warehouse,v_start+interval '5 minutes',v_owner,'completada'),
    -- This inbound transfer happened after the initial count and is linked by its exact ID.
    ('a6000000-0000-0000-0000-000000000001',v_other_warehouse,v_warehouse,v_start+interval '10 minutes',v_owner,'completada'),
    ('a6000000-0000-0000-0000-000000000002',v_warehouse,v_other_warehouse,v_start+interval '30 minutes',v_owner,'completada');

  INSERT INTO public.transferencias_lineas(id,transferencia_id,producto_id,cantidad)
  VALUES
    ('a6100000-0000-0000-0000-000000000003','a6000000-0000-0000-0000-000000000003',v_pan,99),
    ('a6100000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001',v_pan,2),
    ('a6100000-0000-0000-0000-000000000002','a6000000-0000-0000-0000-000000000002',v_pan,1);

  INSERT INTO public.turno_jornada_entradas_vinculadas(turno_sesion_id,transferencia_id,vinculado_por)
  VALUES(v_session,'a6000000-0000-0000-0000-000000000001',v_owner);

  INSERT INTO public.lotes_compra(
    id,producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario,
    fecha_compra,origen,usuario_id,compra_id
  ) VALUES(
    'a6200000-0000-0000-0000-000000000001',v_pan,v_warehouse,1,1,3,
    v_start+interval '20 minutes','compra',v_worker,NULL
  );

  INSERT INTO public.vales_salida(id,producto_id,almacen_id,tipo,cantidad,estado,creado_por,fecha)
  VALUES('a6300000-0000-0000-0000-000000000001',v_pan,v_warehouse,'consumo',1,'REGISTRADO',v_worker,v_start+interval '40 minutes');

  -- Approved expense is deducted from expected cash; pending items would block settlement.
  INSERT INTO public.gastos(
    almacen_id,ciclo_id,sesion_id,concepto,descripcion,monto,estado,
    creado_por,creado_nombre,turno_sesion_id,turno_tramo_id
  ) VALUES(
    v_warehouse,NULL,NULL,'Gasto fixture','Gasto aprobado para el contrato',5,'APROBADO',
    v_worker,'Dependienta fixture',v_session,v_tranche
  );

  -- Closing-day amount uses the existing declared/count/owner-approval flow.
  INSERT INTO public.turno_declaraciones(
    turno_id,turno_sesion_id,turno_tramo_id,usuario_id,monto,moneda,
    declarado_at,estado_aprobacion,monto_contado,contado_por,contado_at,diferencia,aprobado_por,aprobado_at
  ) VALUES(
    v_turn,v_session,v_tranche,v_worker,13,'CUP',v_end,'APROBADA',13,v_owner,v_end,0,v_owner,v_end
  );

  -- Rate configuration is an explicit owner action. Test uses 5%; production remains NULL until configured.
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','reinversiones:editar_any,entregas_caja:editar_any',false);
  PERFORM public.bc7_configurar_salario_porcentaje_jornada(v_session,5);
  IF (SELECT salario_porcentaje FROM public.turno_jornada_programacion WHERE id=v_program)<>5
     OR (SELECT salario_porcentaje FROM public.turno_jornada_configuracion WHERE almacen_id=v_warehouse)<>5 THEN
    RAISE EXCEPTION 'FAIL: salary rate must be snapshotted on the jornada and retained as store default';
  END IF;
  v_error:=false;
  BEGIN
    PERFORM public.bc7_configurar_salario_porcentaje_jornada(v_session,10);
  EXCEPTION WHEN OTHERS THEN
    v_error:=true;
  END;
  IF NOT v_error OR (SELECT salario_porcentaje FROM public.turno_jornada_programacion WHERE id=v_program)<>5 THEN
    RAISE EXCEPTION 'FAIL: an assigned journey salary percentage must not be overwritten';
  END IF;

  -- One daily delivery is stored as pending and cannot be included until the Dueño approves it.
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver,gastos:crear,reinversiones:crear',false);
  v_daily_id:=public.bc7_registrar_entrega_diaria_jornada(
    v_session,v_today,20,'Entrega diaria de prueba','a6400000-0000-0000-0000-000000000001'
  );
  v_daily_retry:=public.bc7_registrar_entrega_diaria_jornada(
    v_session,v_today,20,'Entrega diaria de prueba','a6400000-0000-0000-0000-000000000001'
  );
  IF v_daily_id IS DISTINCT FROM v_daily_retry THEN
    RAISE EXCEPTION 'FAIL: daily cash retry created a duplicate record';
  END IF;

  v_result:=public.bc7_liquidacion_inventario_jornada(v_session);
  IF (v_result->>'ventas_estimadas')::numeric<>40 THEN
    RAISE EXCEPTION 'FAIL: expected inventory-delta sales CUP40; result=%',v_result;
  END IF;
  IF (v_result->>'salario_calculado')::numeric<>2 THEN
    RAISE EXCEPTION 'FAIL: expected 5 percent salary CUP2; result=%',v_result;
  END IF;
  IF (v_result->>'calculable')::boolean IS DISTINCT FROM false
     OR (v_result->'pendientes'->>'entregas_diarias')::integer<>1 THEN
    RAISE EXCEPTION 'FAIL: pending daily cash must block final settlement; result=%',v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','entregas_caja:editar_any',false);
  PERFORM public.resolver_aprobacion_operativa('entrega_diaria',v_daily_id,'APROBAR','Conteo correcto',20,NULL);

  v_result:=public.bc7_liquidacion_inventario_jornada(v_session);
  IF (v_result->>'calculable')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: complete approved inventory/cash data should be calculable; result=%',v_result;
  END IF;
  IF (v_result->>'efectivo_esperado_despues_de_gastos_reinversiones_salario')::numeric<>33 THEN
    RAISE EXCEPTION 'FAIL: expected cash after expense and salary should be CUP33; result=%',v_result;
  END IF;
  IF (v_result->>'dinero_recogido_total')::numeric<>33
     OR (v_result->>'diferencia')::numeric<>0 THEN
    RAISE EXCEPTION 'FAIL: daily approved cash + final counted cash should reconcile at zero; result=%',v_result;
  END IF;

  -- A rejected daily delivery can be corrected and resubmitted without creating a second row.
  UPDATE public.turno_jornada_entregas_diarias
  SET estado='PENDIENTE',monto_aprobado=NULL
  WHERE id=v_daily_id;
  PERFORM public.resolver_aprobacion_operativa(
    'entrega_diaria',v_daily_id,'RECHAZAR','El importe declarado requiere corrección',NULL,NULL
  );
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver,gastos:crear,reinversiones:crear',false);
  v_daily_retry:=public.bc7_registrar_entrega_diaria_jornada(
    v_session,v_today,21,'Entrega corregida','a6400000-0000-0000-0000-000000000002'
  );
  IF v_daily_retry IS DISTINCT FROM v_daily_id THEN
    RAISE EXCEPTION 'FAIL: rejected delivery resubmission created a second row';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','entregas_caja:editar_any',false);
  PERFORM public.resolver_aprobacion_operativa(
    'entrega_diaria',v_daily_id,'APROBAR','Importe corregido y comprobado',21,NULL
  );
  v_result:=public.bc7_liquidacion_inventario_jornada(v_session);
  IF (v_result->>'calculable')::boolean IS DISTINCT FROM true
     OR (v_result->>'dinero_recogido_total')::numeric<>34
     OR (v_result->>'diferencia')::numeric<>1 THEN
    RAISE EXCEPTION 'FAIL: corrected daily cash should keep the settlement auditable; result=%',v_result;
  END IF;

  -- A change to the store default must not rewrite the rate fixed on this jornada.
  UPDATE public.turno_jornada_configuracion SET salario_porcentaje=10 WHERE almacen_id=v_warehouse;
  v_result:=public.bc7_liquidacion_inventario_jornada(v_session);
  IF (v_result->>'salario_calculado')::numeric<>2
     OR (SELECT salario_porcentaje FROM public.turno_jornada_programacion WHERE id=v_program)<>5 THEN
    RAISE EXCEPTION 'FAIL: historical jornada salary must remain tied to its snapshotted 5 percent rate; result=%',v_result;
  END IF;

  IF has_table_privilege('authenticated','public.turno_jornada_entregas_diarias','SELECT')
     OR has_table_privilege('authenticated','public.turno_jornada_entregas_diarias','INSERT')
     OR has_function_privilege('anon','public.bc7_liquidacion_inventario_jornada(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_liquidacion_inventario_jornada(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_registrar_entrega_diaria_jornada(uuid,date,numeric,text,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.bc7_configurar_salario_porcentaje_jornada(uuid,numeric)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: daily cash and settlement ACL boundary is incorrect';
  END IF;

  RAISE NOTICE 'PASS La Cueva: inventory-delta settlement, family-safe price, owner-configured percentage, daily cash idempotency, approval gate, reconciliation, ACL.';
END;
$test$;
