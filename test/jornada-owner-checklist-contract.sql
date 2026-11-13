-- Disposable-only acceptance contract for the Jornada owner checklist and reordered cash count.
\set ON_ERROR_STOP on
BEGIN;

-- Simulate the production stock-minimum BEFORE INSERT guard for this disposable test.
CREATE OR REPLACE FUNCTION public.bc_test_positive_stock_minimum()
RETURNS trigger LANGUAGE plpgsql
AS $guard$
BEGIN
  IF NEW.minimo IS NULL OR NEW.minimo<=0 THEN
    RAISE EXCEPTION 'Antes de agregar existencias, configure un stock mínimo mayor que cero.';
  END IF;
  RETURN NEW;
END
$guard$;
CREATE TRIGGER bc_test_positive_stock_minimum
BEFORE INSERT ON public.stock
FOR EACH ROW EXECUTE FUNCTION public.bc_test_positive_stock_minimum();

DO $test$
DECLARE
  v_turno uuid:=gen_random_uuid();
  v_sesion uuid:=gen_random_uuid();
  v_prog uuid:=gen_random_uuid();
  v_owner uuid:='20000000-0000-0000-0000-000000000001';
  v_worker uuid:=gen_random_uuid();
  v_almacen uuid:=gen_random_uuid();
  v_almacen_mayorista uuid:=gen_random_uuid();
  v_producto_baja uuid:='31000000-0000-0000-8000-000000000006';
  v_transferencia uuid:=gen_random_uuid();
  v_baja_id uuid;
  v_baja_batch jsonb;
  v_stock_disponible numeric;
  v_stock_global numeric;
  v_lotes_restantes numeric;
  v_pan uuid:='31000000-0000-0000-0000-000000000001';
  v_jugo uuid:='31000000-0000-0000-0000-000000000002';
  v_pru uuid:='31000000-0000-0000-0000-000000000005';
  v_date date:=(now() AT TIME ZONE 'America/Havana')::date;
  v_tramo uuid;
  v_declaracion uuid;
  v_reinversion uuid;
  v_minimo numeric;
  v_cantidad numeric;
  v_result jsonb;
  v_error boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','turnos:ver,mermas:crear,bajas:crear,reinversiones:editar_any',false);

  INSERT INTO auth.users(id) VALUES(v_worker) ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.usuarios(id,activo,role_id,nombre)
  VALUES(v_worker,true,'30000000-0000-0000-0000-000000000002','Dependienta checklist fixture')
  ON CONFLICT(id) DO UPDATE SET activo=true,role_id=EXCLUDED.role_id,nombre=EXCLUDED.nombre;

  INSERT INTO public.almacenes(id,nombre,tipo,activo)
  VALUES
    (v_almacen,'Jornada checklist fixture','minorista',true),
    (v_almacen_mayorista,'Almacén Casa fixture','mayorista',true);
  UPDATE public.productos SET precio_normal=9000 WHERE id=v_pan;
  UPDATE public.productos SET precio_normal=1000 WHERE id=v_jugo;
  INSERT INTO public.productos(id,nombre,unidad,activo,precio_normal)
  VALUES
    (v_pru,'Pru fixture','ud',true,60),
    (v_producto_baja,'Producto Baja ledger fixture','ud',true,100);
  INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
  VALUES
    (v_pan,v_almacen,10,2),
    (v_jugo,v_almacen,5,1),
    (v_pru,v_almacen,0,20),
    (v_producto_baja,v_almacen,2,1);

  INSERT INTO public.turnos(id,usuario_id,usuario_nombre,almacen_id,fecha,estado,
    creado_por,created_by,estado_maestro,dias_turno)
  VALUES(v_turno,v_owner,'Dueño fixture',v_almacen,v_date,'PROGRAMADO',
    v_owner,v_owner,'PROGRAMADO',1);

  INSERT INTO public.turno_jornada_programacion(
    id,turno_id,almacen_id,numero_dia,fecha,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,
    creado_por,actualizado_por,salario_porcentaje
  ) VALUES(
    v_prog,v_turno,v_almacen,1,v_date,true,v_worker,
    '07:00','23:00','America/Havana',NULL,'PROGRAMADA',
    v_owner,v_owner,0
  );

  INSERT INTO public.turno_sesiones(id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id)
  VALUES(v_sesion,v_turno,v_almacen,1,'JORNADA',v_date,'PROGRAMADA',v_prog);
  INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
  VALUES(v_sesion,v_turno,v_worker,v_owner);

  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  v_result:=public.bc7_guardar_inventario_jornada(v_sesion,'INICIAL',
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',9),
      jsonb_build_object('producto_id',v_jugo,'cantidad',5),
      jsonb_build_object('producto_id',v_pru,'cantidad',0),
      jsonb_build_object('producto_id',v_producto_baja,'cantidad',3)
    ),'Inventario inicial fixture checklist');
  IF v_result->>'estado'<>'CONFIRMADO' THEN
    RAISE EXCEPTION 'FAIL: initial physical inventory was not confirmed';
  END IF;

  PERFORM public.bc5_iniciar_jornada(v_sesion,'Inicio controlado para contrato de checklist');
  -- PostgreSQL now() is transaction-stable inside this DO/ROLLBACK fixture.
  -- Backdate the opening marker so approvals created later in the same test
  -- transaction remain strictly inside the Jornada inventory interval.
  UPDATE public.turnos SET apertura_real=now()-interval '1 hour' WHERE id=v_turno;
  SELECT id INTO v_tramo FROM public.turno_tramos
  WHERE turno_sesion_id=v_sesion AND estado='ACTIVO';
  IF v_tramo IS NULL THEN RAISE EXCEPTION 'FAIL: the fixture session has no active tranche'; END IF;

  -- An incoming transfer contributes to the Jornada's available balance even
  -- when public.stock remains an older lower snapshot.
  INSERT INTO public.transferencias(id,almacen_origen_id,almacen_destino_id,estado,creado_por,fecha)
  VALUES(v_transferencia,v_almacen_mayorista,v_almacen,'completada',v_owner,now()-interval '20 minutes');
  INSERT INTO public.transferencias_lineas(transferencia_id,producto_id,cantidad)
  VALUES(v_transferencia,v_producto_baja,4);

  SELECT stock_actual INTO v_stock_disponible
  FROM public.bc7_productos_ajuste_jornada(v_sesion)
  WHERE producto_id=v_producto_baja;
  IF v_stock_disponible IS DISTINCT FROM 7::numeric THEN
    RAISE EXCEPTION 'FAIL: Baja picker must show opening cut 3 + transfer 4 = 7, not raw stock: %',v_stock_disponible;
  END IF;

  SELECT cantidad INTO v_stock_global
  FROM public.stock WHERE almacen_id=v_almacen AND producto_id=v_producto_baja;
  IF v_stock_global IS DISTINCT FROM 2::numeric THEN
    RAISE EXCEPTION 'FAIL: fixture must retain raw global stock 2 while Jornada balance is 7; received %',v_stock_global;
  END IF;

  v_baja_batch:=public.bc7_registrar_bajas_multiple_jornada(
    v_sesion,
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_producto_baja,'cantidad',6,'motivo','Baja fixture superior al stock global'
    )),
    'Prueba de saldo operativo e inventario inicial más transferencia',
    '93000000-0000-0000-8000-000000000006'::uuid
  );
  v_baja_id:=(v_baja_batch->'bajas'->0->>'id')::uuid;
  IF v_baja_id IS NULL OR v_baja_batch->>'estado'<>'PENDIENTE'
     OR NOT EXISTS(
       SELECT 1 FROM public.bajas b
       WHERE b.id=v_baja_id AND b.turno_sesion_id=v_sesion
         AND b.turno_tramo_id=v_tramo AND b.estado='PENDIENTE'
         AND b.solicitud_id=(v_baja_batch->>'solicitud_id')::uuid
     ) THEN
    RAISE EXCEPTION 'FAIL: Jornada Baja must be pending with session/tranche provenance: %',v_baja_batch;
  END IF;

  SELECT stock_actual INTO v_stock_disponible
  FROM public.bc7_productos_ajuste_jornada(v_sesion)
  WHERE producto_id=v_producto_baja;
  IF v_stock_disponible IS DISTINCT FROM 1::numeric THEN
    RAISE EXCEPTION 'FAIL: pending Baja must reserve 6 from operational balance 7; available %',v_stock_disponible;
  END IF;

  -- A second request cannot reserve the same already-pending physical stock.
  v_error:=false;
  BEGIN
    PERFORM public.bc7_registrar_bajas_multiple_jornada(
      v_sesion,
      jsonb_build_array(jsonb_build_object(
        'producto_id',v_producto_baja,'cantidad',2,'motivo','Reserva excedida fixture'
      )),
      'Esta solicitud debe exceder el saldo reservado',
      '93000000-0000-0000-8000-000000000007'::uuid
    );
  EXCEPTION WHEN OTHERS THEN
    v_error:=true;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION 'FAIL: a second pending Baja exceeded the 1 unit remaining after reservation';
  END IF;


  INSERT INTO public.turno_declaraciones(turno_id,turno_sesion_id,turno_tramo_id,usuario_id,monto)
  VALUES(v_turno,v_sesion,v_tramo,v_worker,2800)
  RETURNING id INTO v_declaracion;

  -- The Owner cannot count cash before the employee has completed all four checks.
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  v_error:=false;
  BEGIN
    PERFORM public.bc5_contar_dinero_entregado(v_declaracion,2800,'Conteo anticipado debe ser rechazado');
  EXCEPTION WHEN check_violation THEN
    v_error:=true;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION 'FAIL: cash count was accepted before the final inventory and employee checks';
  END IF;

  -- The employee records the reinvestment before confirming the four checks.
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  INSERT INTO public.reinversiones(
    almacen_id,ciclo_id,sesion_id,turno_id,proveedor,fecha,total,
    usuario_id,usuario_nombre,idempotency_key,turno_sesion_id,turno_tramo_id,estado
  ) VALUES(
    v_almacen,NULL,NULL,v_turno,'Fixture proveedor',now(),7200,
    v_worker,'Dependienta checklist fixture','93000000-0000-0000-0000-000000000010',
    v_sesion,v_tramo,'PENDIENTE'
  ) RETURNING id INTO v_reinversion;
  INSERT INTO public.reinversiones_lineas(
    reinversion_id,producto_id,cantidad_presentacion,cantidad_base,costo_total,costo_unitario
  ) VALUES(v_reinversion,v_pru,120,120,7200,60);

  -- Keep the reinvestment pending through handover. The Owner will approve it afterward.

  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  v_result:=public.bc7_guardar_inventario_jornada(v_sesion,'FINAL',
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',8),
      jsonb_build_object('producto_id',v_jugo,'cantidad',4),
      jsonb_build_object('producto_id',v_pru,'cantidad',120),
      jsonb_build_object('producto_id',v_producto_baja,'cantidad',1)
    ),'Inventario final fixture checklist');
  IF v_result->>'estado'<>'CONFIRMADO' THEN
    RAISE EXCEPTION 'FAIL: final physical inventory was not confirmed';
  END IF;

  PERFORM public.bc7_confirmar_bloque_jornada(v_sesion,'gastos',true);
  PERFORM public.bc7_confirmar_bloque_jornada(v_sesion,'reinversiones',true);
  PERFORM public.bc7_confirmar_bloque_jornada(v_sesion,'bajas',true);

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  v_result:=public.bc7_estado_confirmaciones_jornada(v_sesion);
  IF coalesce((v_result->>'lista_para_conteo')::boolean,false) IS NOT TRUE
     OR coalesce((v_result->'gastos'->>'completado')::boolean,false) IS NOT TRUE
     OR coalesce((v_result->'reinversiones'->>'completado')::boolean,false) IS NOT TRUE
     OR coalesce((v_result->'bajas'->>'completado')::boolean,false) IS NOT TRUE
     OR coalesce((v_result->'inventario_final'->>'completado')::boolean,false) IS NOT TRUE
     OR v_result->>'fase'<>'LISTA_PARA_ENTREGA' THEN
    RAISE EXCEPTION 'FAIL: the four employee confirmations did not unlock the Owner cash-count phase: %',v_result;
  END IF;

  -- The four employee checks enable handover, not cash count while the employee session is active.
  v_error:=false;
  BEGIN
    PERFORM public.bc5_contar_dinero_entregado(v_declaracion,2800,'Conteo antes del traspaso debe ser rechazado');
  EXCEPTION WHEN check_violation THEN
    v_error:=true;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION 'FAIL: the Owner was allowed to count cash before Sheila handed over the Jornada';
  END IF;

  v_result:=public.bc7_estado_confirmaciones_jornada(v_sesion);
  IF v_result->>'fase'<>'LISTA_PARA_ENTREGA' THEN
    RAISE EXCEPTION 'FAIL: completed employee checks did not expose the handover phase: %',v_result;
  END IF;

  -- Sheila hands over before the Owner counts cash or resolves pending approvals.
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM public.bc5_cerrar_jornada(v_sesion,'Entrega controlada al Dueño en fixture');
  IF (SELECT estado FROM public.turno_sesiones WHERE id=v_sesion)<>'COMPLETADA'
     OR (SELECT estado_maestro FROM public.turnos WHERE id=v_turno)<>'EN_CURSO'
     OR (SELECT estado FROM public.reinversiones WHERE id=v_reinversion)<>'PENDIENTE' THEN
    RAISE EXCEPTION 'FAIL: handover must complete only the employee session, preserve the open master Turn and leave Owner approvals pending';
  END IF;

  -- The Owner can count only after handover; the session remains completed.
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  v_result:=public.bc5_contar_dinero_entregado(v_declaracion,2800,'Conteo físico posterior al traspaso');
  IF v_result->>'estado'<>'APROBADA'
     OR (v_result->>'monto_contado')::numeric<>2800
     OR (SELECT estado FROM public.turno_sesiones WHERE id=v_sesion)<>'COMPLETADA' THEN
    RAISE EXCEPTION 'FAIL: the Owner cash count did not approve after handover: %',v_result;
  END IF;

  v_result:=public.bc7_estado_confirmaciones_jornada(v_sesion);
  IF coalesce((v_result->>'lista_para_calcular')::boolean,false) IS TRUE THEN
    RAISE EXCEPTION 'FAIL: automatic calculation unlocked while the reinvestment approval was still pending: %',v_result;
  END IF;

  -- Approving a Jornada Baja must not run legacy FIFO/global-stock depletion:
  -- the final physical count already records this 6-unit write-off.
  v_result:=public.resolver_aprobacion_operativa(
    'baja',v_baja_id,'APROBAR',NULL,6,NULL
  );
  SELECT cantidad INTO v_stock_global
  FROM public.stock WHERE almacen_id=v_almacen AND producto_id=v_producto_baja;
  SELECT COALESCE(sum(cantidad_restante),0) INTO v_lotes_restantes
  FROM public.lotes_compra WHERE almacen_id=v_almacen AND producto_id=v_producto_baja;
  IF v_result->>'ok'<>'true'
     OR (SELECT estado FROM public.bajas WHERE id=v_baja_id)<>'APROBADA'
     OR v_stock_global<>2 OR v_lotes_restantes<>0 THEN
    RAISE EXCEPTION 'FAIL: approving Jornada Baja must succeed without changing global stock/FIFO: % / stock % / FIFO %',
      v_result,v_stock_global,v_lotes_restantes;
  END IF;

  -- The Owner resolves the pending reinvestment only after accepting the handover.
  v_result:=public.resolver_aprobacion_operativa(
    'reinversion',v_reinversion,'APROBAR',NULL,NULL,7200
  );
  SELECT cantidad,minimo INTO v_cantidad,v_minimo
  FROM public.stock WHERE almacen_id=v_almacen AND producto_id=v_pru;
  IF v_result->>'ok'<>'true' OR v_cantidad<>120 OR v_minimo<>20
     OR (SELECT estado FROM public.reinversiones WHERE id=v_reinversion)<>'APROBADA' THEN
    RAISE EXCEPTION 'FAIL: post-handover reinvestment approval did not increase stock and preserve minimum=20: % / % / %',v_result,v_cantidad,v_minimo;
  END IF;

  v_result:=public.bc7_estado_confirmaciones_jornada(v_sesion);
  IF coalesce((v_result->>'lista_para_calcular')::boolean,false) IS NOT TRUE
     OR v_result->>'fase'<>'CALCULAR' THEN
    RAISE EXCEPTION 'FAIL: automatic calculation did not unlock after the Owner cash count and pending approval: %; liquidation: %',v_result,public.bc7_liquidacion_inventario_jornada(v_sesion);
  END IF;
  v_result:=public.bc7_liquidacion_inventario_jornada(v_sesion);
  IF coalesce((v_result->>'calculable')::boolean,false) IS NOT TRUE
     OR (v_result->>'ventas_estimadas')::numeric<>10000 THEN
    RAISE EXCEPTION 'FAIL: automatic inventory/sales/cash calculation is not reproducible: %',v_result;
  END IF;

  RAISE NOTICE 'PASS Jornada owner checklist: four employee checks, employee handover, post-handover Owner cash approval, automatic calculation, open master Turn and reinvestment preserving minimum=20';
END
$test$;

ROLLBACK;
