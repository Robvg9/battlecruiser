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
  v_next_program uuid;
  v_next_session uuid;
  v_next_turn uuid;
  v_next_tranche public.turno_tramos;
  v_handover_id uuid;
  v_program_result jsonb;
  v_tranche uuid:='a4000000-0000-0000-0000-000000000001';
  v_initial_cut uuid:='a5000000-0000-0000-0000-000000000001';
  v_final_cut uuid:='a5000000-0000-0000-0000-000000000002';
  v_daily_id uuid;
  v_daily_retry uuid;
  v_expense_id uuid;
  v_reinvestment_id uuid;
  v_merma_id uuid;
  v_baja_id uuid;
  v_closed public.turno_sesiones;
  v_result jsonb;
  v_error boolean;
  v_operation text;
  -- The current jornada covers the two completed dates before today; the next one starts today.
  v_today date:=(now() AT TIME ZONE 'America/Havana')::date-2;
  v_start timestamptz:=now()-interval '2 hours';
  v_mid timestamptz:=now()-interval '90 minutes';
  v_end timestamptz:=now()+interval '2 hours';
BEGIN
  INSERT INTO auth.users(id) VALUES(v_worker) ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.usuarios(id,activo,role_id,nombre)
  VALUES(v_worker,true,v_worker_role,'Dependienta La Cueva fixture')
  ON CONFLICT(id) DO UPDATE SET activo=true,role_id=EXCLUDED.role_id,nombre=EXCLUDED.nombre;

  INSERT INTO public.almacenes(id,nombre,tipo,activo)
  VALUES(v_warehouse,'La Cueva settlement fixture','minorista',true)
  ON CONFLICT(id) DO NOTHING;
  UPDATE public.productos SET precio_normal=10 WHERE id IN (v_pan,v_juice);
  -- No jornada configuration row yet: the retroactive-opening and owner salary RPCs
  -- must provision it from the persisted schedule without inventing a salary rate.

  INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
  VALUES(v_pan,v_warehouse,100,0),(v_juice,v_warehouse,100,0)
  ON CONFLICT(producto_id,almacen_id) DO UPDATE SET cantidad=EXCLUDED.cantidad;

  -- Approved merma and baja must consume a real FIFO lot exactly once.
  INSERT INTO public.lotes_compra(
    id,producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario,
    fecha_compra,origen,usuario_id,compra_id
  ) VALUES(
    'a6200000-0000-0000-0000-000000000002',v_juice,v_warehouse,100,100,1,
    v_start-interval '1 day','compra',v_worker,NULL
  );

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

  -- No next session is pre-created: this is the final programmed period for the current Turn.
  INSERT INTO public.turno_jornada_inventario_cortes(
    id,turno_sesion_id,tipo,estado,creado_por,confirmado_por,creado_en,confirmado_en,observacion
  ) VALUES(v_initial_cut,v_session,'INICIAL','CONFIRMADO',v_worker,v_worker,v_start,v_start,'Initial physical count');

  -- One Juice bottle is sold and one bottle is lost (0.5 merma + 0.5 baja): 6 initial - 1 approved loss - 4 final = 1 sold.
  INSERT INTO public.turno_jornada_inventario_lineas(corte_id,producto_id,cantidad_contada,stock_sistema)
  VALUES(v_initial_cut,v_pan,10,10),(v_initial_cut,v_juice,6,6);

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
  VALUES(v_final_cut,v_pan,7,7),(v_final_cut,v_juice,4,4);
  -- Force the deferred final-cut trigger now, so the handover points to the scheduled day after fecha_fin.
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada IMMEDIATE;
  SET CONSTRAINTS bc7_preparar_entrega_inventario_jornada DEFERRED;

  UPDATE public.turno_sesiones SET estado='EN_CURSO' WHERE id=v_session;
  UPDATE public.turnos SET estado='ABIERTO',estado_maestro='EN_CURSO' WHERE id=v_turn;

  INSERT INTO public.turno_tramos(id,turno_id,turno_sesion_id,usuario_id,tipo,estado,inicio_at)
  VALUES(v_tranche,v_turn,v_session,v_worker,'NORMAL','ACTIVO',v_start);

  -- Existing operational movements: +2 transfer, +1 purchase, -1 transfer, -1 vale.
  INSERT INTO public.transferencias(id,almacen_origen_id,almacen_destino_id,fecha,creado_por,estado)
  VALUES
    -- This inbound transfer is already represented in the imported initial count and is intentionally unlinked.
    ('a6000000-0000-0000-0000-000000000003',v_other_warehouse,v_warehouse,v_start-interval '5 minutes',v_owner,'completada'),
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

  -- This expense begins pending and enters the settlement only after owner approval.
  INSERT INTO public.gastos(
    almacen_id,ciclo_id,sesion_id,concepto,descripcion,monto,estado,
    creado_por,creado_nombre,turno_sesion_id,turno_tramo_id
  ) VALUES(
    v_warehouse,NULL,NULL,'Gasto fixture','Gasto aprobado para el contrato',5,'PENDIENTE',
    v_worker,'Dependienta fixture',v_session,v_tranche
  ) RETURNING id INTO v_expense_id;

  -- Closing-day amount uses the existing declared/count/owner-approval flow.
  INSERT INTO public.turno_declaraciones(
    turno_id,turno_sesion_id,turno_tramo_id,usuario_id,monto,moneda,
    declarado_at,estado_aprobacion,monto_contado,contado_por,contado_at,diferencia,aprobado_por,aprobado_at
  ) VALUES(
    v_turn,v_session,v_tranche,v_worker,19.5,'CUP',v_end,'APROBADA',19.5,v_owner,v_end,0,v_owner,v_end
  );

  -- Rate configuration is an explicit owner action. Test uses 5%; production remains NULL until configured.
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','reinversiones:editar_any,entregas_caja:editar_any',false);
  IF EXISTS(SELECT 1 FROM public.turno_jornada_configuracion WHERE almacen_id=v_warehouse) THEN
    RAISE EXCEPTION 'FAIL: the fixture unexpectedly created the store config before the explicit owner action';
  END IF;
  PERFORM public.bc7_configurar_salario_porcentaje_jornada(v_session,5);
  IF NOT EXISTS(
    SELECT 1 FROM public.turno_jornada_configuracion
    WHERE almacen_id=v_warehouse
      AND hora_inicio=TIME '07:00' AND hora_fin=TIME '23:00'
      AND zona_horaria='America/Havana' AND salario_porcentaje=5
  ) OR (SELECT salario_porcentaje FROM public.turno_jornada_programacion WHERE id=v_program)<>5 THEN
    RAISE EXCEPTION 'FAIL: salary RPC must bootstrap the missing store schedule from the saved Jornada and snapshot the explicit owner rate';
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
  PERFORM set_config('test.perms','turnos:ver,gastos:crear,reinversiones:crear,mermas:crear,bajas:crear',false);
  v_daily_id:=public.bc7_registrar_entrega_diaria_jornada(
    v_session,v_today,20,'Entrega diaria de prueba','a6400000-0000-0000-0000-000000000001'
  );
  v_daily_retry:=public.bc7_registrar_entrega_diaria_jornada(
    v_session,v_today,20,'Entrega diaria de prueba','a6400000-0000-0000-0000-000000000001'
  );
  IF v_daily_id IS DISTINCT FROM v_daily_retry THEN
    RAISE EXCEPTION 'FAIL: daily cash retry created a duplicate record';
  END IF;

  -- Reinvestment, merma and baja are recorded in this same Jornada, pending owner review.
  v_reinvestment_id:=public.bc7_registrar_reinversion_jornada(
    v_session,
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_pan,'presentacion_id',NULL,'cantidad_presentacion',NULL,
      'cantidad_base',1,'costo_total',3
    )),
    'a6400000-0000-0000-0000-000000000002',
    'Proveedor settlement fixture'
  );
  v_merma_id:=public.bc7_registrar_ajuste_jornada(
    v_session,'merma',v_juice,0.5,'Merma fixture de liquidación',
    'a6400000-0000-0000-0000-000000000003'
  );
  v_baja_id:=public.bc7_registrar_ajuste_jornada(
    v_session,'baja',v_juice,0.5,'Baja fixture de liquidación',
    'a6400000-0000-0000-0000-000000000004'
  );
  IF NOT EXISTS(SELECT 1 FROM public.reinversiones WHERE id=v_reinvestment_id AND estado='PENDIENTE')
     OR NOT EXISTS(SELECT 1 FROM public.mermas WHERE id=v_merma_id AND estado='PENDIENTE')
     OR NOT EXISTS(SELECT 1 FROM public.bajas WHERE id=v_baja_id AND estado='PENDIENTE')
     OR NOT EXISTS(SELECT 1 FROM public.gastos WHERE id=v_expense_id AND estado='PENDIENTE') THEN
    RAISE EXCEPTION 'FAIL: expense, reinvestment, merma and baja must enter the owner approval queue';
  END IF;
  IF (SELECT cantidad FROM public.stock WHERE producto_id=v_pan AND almacen_id=v_warehouse)<>100
     OR (SELECT cantidad FROM public.stock WHERE producto_id=v_juice AND almacen_id=v_warehouse)<>100 THEN
    RAISE EXCEPTION 'FAIL: pending operations changed stock before owner approval';
  END IF;

  -- The assigned worker can submit all operation types, but cannot approve any of them.
  IF NOT public.tiene_permiso('gastos','crear')
     OR NOT public.tiene_permiso('reinversiones','crear')
     OR NOT public.tiene_permiso('mermas','crear')
     OR NOT public.tiene_permiso('bajas','crear') THEN
    RAISE EXCEPTION 'FAIL: Dependienta must be able to submit expenses, reinvestments, merma and baja';
  END IF;
  FOREACH v_operation IN ARRAY ARRAY['gasto','merma','baja','reinversion','entrega_diaria']
  LOOP
    v_error:=false;
    BEGIN
      PERFORM public.resolver_aprobacion_operativa(
        v_operation,gen_random_uuid(),'APROBAR','worker cannot approve',NULL,NULL
      );
    EXCEPTION WHEN SQLSTATE '42501' THEN
      v_error:=true;
    END;
    IF NOT v_error THEN
      RAISE EXCEPTION 'FAIL: Dependienta unexpectedly approved operation type %',v_operation;
    END IF;
  END LOOP;
  v_error:=false;
  BEGIN
    PERFORM * FROM public.listar_aprobaciones_admin();
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_error:=true;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION 'FAIL: Dependienta unexpectedly accessed the administrative approval queue';
  END IF;

  v_result:=public.bc7_liquidacion_inventario_jornada(v_session);
  IF (v_result->>'ventas_estimadas')::numeric<>60 THEN
    RAISE EXCEPTION 'FAIL: pending adjustments are not applied until approval; expected inventory-delta sales CUP60; result=%',v_result;
  END IF;
  IF (v_result->>'salario_calculado')::numeric<>3 THEN
    RAISE EXCEPTION 'FAIL: expected 5 percent salary CUP3.00 before pending adjustments are approved; result=%',v_result;
  END IF;
  IF (v_result->>'calculable')::boolean IS DISTINCT FROM false
     OR (v_result->'pendientes'->>'gastos')::integer<>1
     OR (v_result->'pendientes'->>'reinversiones')::integer<>1
     OR (v_result->'pendientes'->>'ajustes')::integer<>2
     OR (v_result->'pendientes'->>'entregas_diarias')::integer<>1
     OR (v_result->'pendientes'->>'entregas_diarias_faltantes')::integer<>1 THEN
    RAISE EXCEPTION 'FAIL: pending cash, expense, reinvestment, merma and baja must block final settlement; result=%',v_result;
  END IF;

  -- Direct RPC closure must enforce the same pending-operation gate as the workspace UI.
  v_error:=false;
  BEGIN
    PERFORM public.bc5_cerrar_jornada(v_session,'CI cierre anticipado para probar el bloqueo');
  EXCEPTION WHEN check_violation THEN
    v_error:=true;
  END;
  IF NOT v_error
     OR (SELECT estado FROM public.turno_sesiones WHERE id=v_session)<>'EN_CURSO'
     OR NOT EXISTS(SELECT 1 FROM public.turno_tramos WHERE id=v_tranche AND estado='ACTIVO') THEN
    RAISE EXCEPTION 'FAIL: backend allowed the jornada to close while daily cash/expense/reinvestment/merma/baja approvals were pending';
  END IF;

  -- The generic authenticated legacy helper must not bypass the Jornada close gate either.
  v_error:=false;
  BEGIN
    PERFORM public.bc_cerrar_turno_sesion(v_session);
  EXCEPTION WHEN insufficient_privilege THEN
    v_error:=true;
  END;
  IF NOT v_error
     OR (SELECT estado FROM public.turno_sesiones WHERE id=v_session)<>'EN_CURSO' THEN
    RAISE EXCEPTION 'FAIL: direct legacy close helper bypassed the protected Jornada close RPC';
  END IF;


  -- Owner approves each operation. Only these approved records affect the final stock/cash reconciliation.
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms',
    'gastos:editar_any,reinversiones:editar_any,mermas:editar_any,bajas:editar_any,entregas_caja:editar_any',false);
  PERFORM public.resolver_aprobacion_operativa('gasto',v_expense_id,'APROBAR','Gasto revisado',NULL,5);
  PERFORM public.resolver_aprobacion_operativa('reinversion',v_reinvestment_id,'APROBAR','Reinversión revisada',NULL,NULL);
  PERFORM public.resolver_aprobacion_operativa('merma',v_merma_id,'APROBAR','Merma comprobada',0.5,NULL);
  PERFORM public.resolver_aprobacion_operativa('baja',v_baja_id,'APROBAR','Baja comprobada',0.5,NULL);
  PERFORM public.resolver_aprobacion_operativa('entrega_diaria',v_daily_id,'APROBAR','Conteo correcto',20,NULL);

  IF (SELECT cantidad FROM public.stock WHERE producto_id=v_pan AND almacen_id=v_warehouse)<>101
     OR (SELECT cantidad FROM public.stock WHERE producto_id=v_juice AND almacen_id=v_warehouse)<>99 THEN
    RAISE EXCEPTION 'FAIL: approval must apply reinvestment, merma and baja stock effects exactly once';
  END IF;

  v_result:=public.bc7_liquidacion_inventario_jornada(v_session);
  IF (v_result->>'calculable')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: complete approved inventory/cash data should be calculable; result=%',v_result;
  END IF;
  IF (v_result->>'ventas_estimadas')::numeric<>50
     OR (v_result->>'salario_calculado')::numeric<>2.5
     OR (v_result->>'gastos_aprobados')::numeric<>5
     OR (v_result->>'reinversiones_aprobadas')::numeric<>3 THEN
    RAISE EXCEPTION 'FAIL: approved sale/expense/reinvestment/merma/baja inputs were not included correctly; result=%',v_result;
  END IF;
  IF (v_result->>'efectivo_esperado_despues_de_gastos_reinversiones_salario')::numeric<>39.5 THEN
    RAISE EXCEPTION 'FAIL: expected cash after expense, reinvestment and salary should be CUP39.50; result=%',v_result;
  END IF;
  IF (v_result->>'dinero_recogido_total')::numeric<>39.5
     OR (v_result->>'diferencia')::numeric<>0 THEN
    RAISE EXCEPTION 'FAIL: daily approved cash + final counted cash should reconcile at zero; result=%',v_result;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_result->'lineas') line
    WHERE line.value->>'producto_id'=v_pan::text
      AND (line.value->>'reinversiones_entrada')::numeric=1
  ) OR NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_result->'lineas') line
    WHERE line.value->>'producto_id'=v_juice::text
      AND (line.value->>'mermas_aprobadas')::numeric=0.5
      AND (line.value->>'bajas_aprobadas')::numeric=0.5
  ) THEN
    RAISE EXCEPTION 'FAIL: inventory-delta lines omitted approved reinvestment, merma or baja quantities; result=%',v_result;
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
  PERFORM set_config('test.perms','turnos:ver,gastos:crear,reinversiones:crear,mermas:crear,bajas:crear',false);
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
     OR (v_result->>'dinero_recogido_total')::numeric<>40.5
     OR (v_result->>'diferencia')::numeric<>1 THEN
    RAISE EXCEPTION 'FAIL: corrected daily cash should keep the settlement auditable; result=%',v_result;
  END IF;

  -- A change to the store default must not rewrite the rate fixed on this jornada.
  UPDATE public.turno_jornada_configuracion SET salario_porcentaje=10 WHERE almacen_id=v_warehouse;
  v_result:=public.bc7_liquidacion_inventario_jornada(v_session);
  IF (v_result->>'salario_calculado')::numeric<>2.5
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

  -- The operational session closes only after the complete approved reconciliation passes.
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);
  v_closed:=public.bc5_cerrar_jornada(v_session,'Cierre de contrato PostgreSQL fuera del horario programado');
  IF v_closed.estado<>'COMPLETADA'
     OR NOT EXISTS(SELECT 1 FROM public.turno_tramos WHERE id=v_tranche AND estado='COMPLETADO')
     OR (SELECT estado FROM public.turnos WHERE id=v_turn)<>'ABIERTO'
     OR (SELECT estado_maestro FROM public.turnos WHERE id=v_turn)<>'EN_CURSO'
     OR (public.bc7_liquidacion_inventario_jornada(v_session)->>'calculable')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: jornada close must complete the current session but preserve the master turn as open for the next programmed day';
  END IF;

  -- The final period leaves one owner-schedulable handover because there is no
  -- next session in the current Turn. The Turn must pass the Jornada approval gate.
  SELECT id INTO v_handover_id
  FROM public.turno_jornada_inventario_entregas
  WHERE origen_sesion_id=v_session AND destino_sesion_id IS NULL
    AND fecha_destino=v_today+2 AND estado='PENDIENTE_PROGRAMACION';
  IF v_handover_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: final Jornada did not leave its period-end inventory handover schedulable';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM public.bc_enviar_turno_a_aprobacion(v_turn);
  IF (SELECT estado_maestro FROM public.turnos WHERE id=v_turn)<>'PENDIENTE_APROBACION'
     OR NOT EXISTS(SELECT 1 FROM public.turno_revisiones WHERE turno_id=v_turn AND estado='PENDIENTE') THEN
    RAISE EXCEPTION 'FAIL: a fully reconciled Jornada Turn did not enter owner approval';
  END IF;
  PERFORM public.bc_aprobar_turno(v_turn,'Liquidación de jornada completa revisada y aprobada');
  IF (SELECT estado_maestro FROM public.turnos WHERE id=v_turn)<>'CERRADO' THEN
    RAISE EXCEPTION 'FAIL: owner approval did not close the completed Jornada Turn';
  END IF;

  -- Create the next Turn only after the previous one is approved and closed.
  v_program_result:=public.bc5_crear_jornada_unica(
    v_warehouse,v_today+2,2,
    jsonb_build_array(
      jsonb_build_object('numero_dia',1,'trabaja',true,'responsable_id',v_worker),
      jsonb_build_object('numero_dia',2,'trabaja',false,'responsable_id',NULL)
    ),
    'Siguiente Turn después de aprobar el período anterior'
  );
  v_next_turn:=(v_program_result->>'turno_id')::uuid;
  SELECT id INTO v_next_program FROM public.turno_jornada_programacion
  WHERE turno_id=v_next_turn AND numero_dia=1;
  SELECT id INTO v_next_session FROM public.turno_sesiones
  WHERE turno_id=v_next_turn AND numero_dia=1 AND bloque='JORNADA';
  IF v_next_turn IS NULL OR v_next_program IS NULL OR v_next_session IS NULL THEN
    RAISE EXCEPTION 'FAIL: next Turn scheduling did not create its first Jornada session';
  END IF;

  -- Link the prior period's pending handover across Turn boundaries and receive it physically.
  PERFORM public.bc7_vincular_entrega_jornada(v_handover_id,v_next_session);
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);
  v_result:=public.bc7_recibir_entrega_jornada(
    v_next_session,
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',7),
      jsonb_build_object('producto_id',v_juice,'cantidad',4)
    ),
    'Recepción física exacta del inventario del período anterior',
    'a6400000-0000-0000-0000-000000000005'
  );
  IF v_result->>'estado'<>'ACEPTADA'
     OR NOT EXISTS(
       SELECT 1 FROM public.turno_jornada_inventario_cortes
       WHERE turno_sesion_id=v_next_session AND tipo='INICIAL' AND estado='CONFIRMADO'
     ) THEN
    RAISE EXCEPTION 'FAIL: next Turn did not receive and confirm the prior period inventory';
  END IF;

  v_next_tranche:=public.bc5_iniciar_jornada(
    v_next_session,'Apertura de la siguiente Jornada tras aprobar el período anterior'
  );
  IF v_next_tranche.estado<>'ACTIVO'
     OR (SELECT estado FROM public.turno_sesiones WHERE id=v_next_session)<>'EN_CURSO'
     OR (SELECT estado_maestro FROM public.turnos WHERE id=v_next_turn)<>'EN_CURSO'
     OR (SELECT estado_maestro FROM public.turnos WHERE id=v_turn)<>'CERRADO' THEN
    RAISE EXCEPTION 'FAIL: the next Turn/Jornada could not open after owner approval and physical inventory receipt';
  END IF;

  RAISE NOTICE 'PASS La Cueva: multi-day daily cash, approved expense/reinvestment/merma/baja, full inventory/cash reconciliation, owner Turn approval, next Turn creation, cross-Turn inventory handover/receipt, next Jornada open and ACL.';
END;
$test$;
