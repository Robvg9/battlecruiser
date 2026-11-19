-- Disposable end-to-end contract for mandatory stock counts before a price change.
\set ON_ERROR_STOP on

DO $test$
DECLARE
  v_turn uuid := '94000000-0000-0000-0000-000000000001';
  v_sesion uuid := '94000000-0000-0000-0000-000000000001';
  v_prog uuid := '94000000-0000-0000-0000-000000000001';
  v_owner uuid := '20000000-0000-0000-0000-000000000001';
  v_worker uuid := '95000000-0000-0000-0000-000000000003';
  v_other_worker uuid := '95000000-0000-0000-0000-000000000004';
  v_almacen uuid := '10000000-0000-0000-0000-000000000004';
  v_pan uuid := '31000000-0000-0000-0000-000000000001';
  v_jugo uuid := '31000000-0000-0000-0000-000000000002';
  v_old_price numeric;
  v_new_price numeric;
  v_result jsonb;
  v_liq jsonb;
  v_line jsonb;
  v_expected_amount numeric;
  v_error boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','turnos:ver,turnos:editar_any',false);

  INSERT INTO auth.users(id) VALUES(v_worker) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.usuarios(id,activo,role_id)
  VALUES(v_worker,true,'30000000-0000-0000-0000-000000000002');

  INSERT INTO public.almacenes(id,nombre,tipo,activo)
  VALUES(v_almacen,'Almacén minorista para contrato de precio','minorista',true);
  INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
  SELECT producto_id,v_almacen,cantidad,minimo
  FROM public.stock
  WHERE almacen_id='10000000-0000-0000-0000-000000000001';
  UPDATE public.productos SET precio_normal=10 WHERE id=v_pan;
  UPDATE public.productos SET precio_normal=5 WHERE id=v_jugo;

  INSERT INTO public.turnos(
    id,usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,
    estado_maestro,dias_turno,apertura_real
  ) VALUES(
    v_turn,v_owner,'Dueño Fixture',v_almacen,
    (now() AT TIME ZONE 'America/Havana')::date,
    'PROGRAMADO',v_owner,v_owner,'PROGRAMADO',1,now()
  );
  INSERT INTO public.turno_jornada_programacion(
    id,turno_id,almacen_id,numero_dia,fecha,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,
    creado_por,actualizado_por,salario_porcentaje
  ) VALUES(
    v_prog,v_turn,v_almacen,1,(now() AT TIME ZONE 'America/Havana')::date,
    true,v_worker,'07:00','23:00','America/Havana',NULL,'PROGRAMADA',
    v_owner,v_owner,5
  );
  INSERT INTO public.turno_sesiones(
    id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id
  ) VALUES(
    v_sesion,v_turn,v_almacen,1,'JORNADA',
    (now() AT TIME ZONE 'America/Havana')::date,'PROGRAMADA',v_prog
  );
  INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
  VALUES(v_sesion,v_turn,v_worker,v_owner);

  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);

  v_result:=public.bc7_guardar_inventario_jornada(
    v_sesion,'INICIAL',
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',10),
      jsonb_build_object('producto_id',v_jugo,'cantidad',5)
    ),
    'Conteo inicial de prueba para cambio de precio'
  );
  IF v_result->>'estado'<>'CONFIRMADO' THEN
    RAISE EXCEPTION 'FAIL: initial inventory was not confirmed before price test';
  END IF;

  PERFORM public.bc5_iniciar_jornada(v_sesion,'Apertura controlada del contrato de precio');

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  v_result:=public.bc7_cambios_precio_contexto();
  IF NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_result) x(value)
    WHERE x.value->>'sesion_id'=v_sesion::text
  ) THEN
    RAISE EXCEPTION 'FAIL: owner price-change context did not expose the active Jornada';
  END IF;

  SELECT precio_normal INTO v_old_price FROM public.productos WHERE id=v_pan;
  v_new_price:=v_old_price+10;

  v_result:=public.bc7_solicitar_cambios_precio_jornada(
    v_sesion,
    jsonb_build_array(jsonb_build_object('producto_id',v_pan,'precio_nuevo',v_new_price)),
    'Prueba de contrato: actualización del precio de Pan'
  );

  IF v_result->>'ok'<>'true' OR (v_result->>'productos_pendientes_de_conteo')::integer<>1
     OR (v_result->>'catalogo_modificado')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL: price change request must remain pending and leave catalogue untouched';
  END IF;
  IF (SELECT precio_normal FROM public.productos WHERE id=v_pan)<>v_old_price THEN
    RAISE EXCEPTION 'FAIL: price changed before the physical count was confirmed';
  END IF;

  -- Only the worker with the active tranche receives the blocking gate.
  INSERT INTO auth.users(id) VALUES(v_other_worker) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.usuarios(id,activo,role_id)
  VALUES(v_other_worker,true,'30000000-0000-0000-0000-000000000002');
  PERFORM set_config('request.jwt.claim.sub',v_other_worker::text,false);
  v_result:=public.bc7_mis_cambios_precio_pendientes();
  IF jsonb_array_length(v_result)<>0 THEN
    RAISE EXCEPTION 'FAIL: another authenticated worker received a pending price gate';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  v_result:=public.bc7_mis_cambios_precio_pendientes();
  IF jsonb_array_length(v_result)<>1
     OR v_result->0->>'sesion_id'<>v_sesion::text THEN
    RAISE EXCEPTION 'FAIL: the active assigned worker did not receive the pending price gate';
  END IF;

  -- The current assigned worker must physically count 8 units. The 2 missing units
  -- are sold at the previous price; one further unit will be sold after the change.
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  v_result:=public.bc7_confirmar_cambios_precio_conteo(
    v_sesion,
    jsonb_build_array(jsonb_build_object('producto_id',v_pan,'cantidad',8))
  );

  IF v_result->>'ok'<>'true' OR (v_result->>'productos_aplicados')::integer<>1 THEN
    RAISE EXCEPTION 'FAIL: physical count did not activate the pending price change';
  END IF;
  IF (SELECT precio_normal FROM public.productos WHERE id=v_pan)<>v_new_price THEN
    RAISE EXCEPTION 'FAIL: confirmed price was not persisted in the product catalogue';
  END IF;
  IF (SELECT unidades_vendidas_precio_anterior FROM public.turno_jornada_cambios_precio
      WHERE turno_sesion_id=v_sesion AND producto_id=v_pan AND estado='APLICADO')<>2 THEN
    RAISE EXCEPTION 'FAIL: two missing units were not assigned to the previous price tranche';
  END IF;

  v_result:=public.bc7_guardar_inventario_jornada(
    v_sesion,'FINAL',
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',7),
      jsonb_build_object('producto_id',v_jugo,'cantidad',5)
    ),
    'Conteo final de prueba después del cambio de precio'
  );
  IF v_result->>'estado'<>'CONFIRMADO' THEN
    RAISE EXCEPTION 'FAIL: final inventory could not be confirmed';
  END IF;

  v_liq:=public.bc7_liquidacion_inventario_jornada(v_sesion);
  SELECT x.value INTO v_line
  FROM jsonb_array_elements(v_liq->'lineas') x(value)
  WHERE x.value->>'producto_id'=v_pan::text;

  v_expected_amount:=round((2*v_old_price)+(1*v_new_price),2);
  IF (v_line->>'unidades_vendidas')::numeric<>3
     OR (v_line->>'importe_estimado')::numeric<>v_expected_amount
     OR (v_line->>'precio_cambios_aplicado')::boolean IS DISTINCT FROM true
     OR jsonb_array_length(v_line->'precio_cambios')<>1 THEN
    RAISE EXCEPTION 'FAIL: settlement did not preserve 2 old-price sales and 1 new-price sale. Line: %',v_line;
  END IF;

  -- Closing is forbidden while even one product still has an unresolved physical count.
  INSERT INTO public.turno_jornada_cambios_precio(
    turno_sesion_id,almacen_id,producto_id,precio_anterior,precio_nuevo,
    comentario,creado_por
  ) VALUES(v_sesion,v_almacen,v_jugo,5,6,'Pending close-gate fixture',v_owner);

  v_error:=false;
  BEGIN
    UPDATE public.turno_sesiones SET estado='COMPLETADA' WHERE id=v_sesion;
  EXCEPTION WHEN check_violation THEN v_error:=true;
  END;
  IF NOT v_error OR (SELECT estado FROM public.turno_sesiones WHERE id=v_sesion)<>'EN_CURSO' THEN
    RAISE EXCEPTION 'FAIL: Jornada closed with a price change still awaiting stock count';
  END IF;

  UPDATE public.turno_jornada_cambios_precio
  SET estado='CANCELADO'
  WHERE turno_sesion_id=v_sesion AND producto_id=v_jugo AND estado='PENDIENTE_CONTEO';

  IF has_table_privilege('authenticated','public.turno_jornada_cambios_precio','SELECT') THEN
    RAISE EXCEPTION 'FAIL: authenticated can query the price-change ledger directly';
  END IF;
  IF has_function_privilege('anon','public.bc7_solicitar_cambios_precio_jornada(uuid,jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can request a price change';
  END IF;
  IF has_function_privilege('anon','public.bc7_mis_cambios_precio_pendientes()','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can read pending price changes';
  END IF;
  IF has_function_privilege('authenticated','public.bc7_bloquear_cierre_con_cambios_precio_pendientes()','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated can call the trigger helper directly';
  END IF;

  RAISE NOTICE 'PASS price changes: pending request, worker-only blocking gate, unchanged catalogue, mandatory physical count, persistent catalogue update, old/new sale tranches, settlement and close gate';
END
$test$;
