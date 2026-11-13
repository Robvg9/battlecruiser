-- Disposable-only assertions for the Step 7 jornada UI/backend contract.
\set ON_ERROR_STOP on
DO $test$
DECLARE
  v_turno uuid := '90000000-0000-0000-0000-000000000007';
  v_sesion uuid := '91000000-0000-0000-0000-000000000007';
  v_prog uuid := '92000000-0000-0000-0000-000000000007';
  v_owner uuid := '20000000-0000-0000-0000-000000000001';
  v_worker uuid := '20000000-0000-0000-0000-000000000002';
  v_almacen uuid := '10000000-0000-0000-0000-000000000001';
  v_pan uuid := '31000000-0000-0000-0000-000000000001';
  v_jugo uuid := '31000000-0000-0000-0000-000000000002';
  v_date date := (now() AT TIME ZONE 'America/Havana')::date;
  v_result jsonb;
  v_retry jsonb;
  v_tramo uuid;
  v_ajuste uuid;
  v_solicitud uuid;
  v_list_count integer;
  v_error boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,false);
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','mermas:crear,bajas:crear',false);

  INSERT INTO public.turnos(id,usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,estado_maestro,dias_turno)
  VALUES(v_turno,v_owner,'Dueño Fixture',v_almacen,v_date,'PROGRAMADO',v_owner,v_owner,'PROGRAMADO',1);
  INSERT INTO public.turno_jornada_programacion(
    id,turno_id,almacen_id,numero_dia,fecha,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,creado_por,actualizado_por
  ) VALUES(v_prog,v_turno,v_almacen,1,v_date,true,v_owner,'07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner);
  INSERT INTO public.turno_sesiones(id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id)
  VALUES(v_sesion,v_turno,v_almacen,1,'JORNADA',v_date,'PROGRAMADA',v_prog);
  INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
  VALUES(v_sesion,v_turno,v_owner,v_owner);

  -- A session cannot start until the initial physical count is persisted.
  v_error:=false;
  BEGIN
    UPDATE public.turno_sesiones SET estado='EN_CURSO' WHERE id=v_sesion;
  EXCEPTION WHEN check_violation THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: session opened without an initial inventory snapshot'; END IF;

  v_result:=public.bc7_obtener_inventario_jornada(v_sesion);
  IF jsonb_array_length(v_result->'productos')<>2 THEN
    RAISE EXCEPTION 'FAIL: expected two stock products from the session-scoped read';
  END IF;

  v_result:=public.bc7_guardar_inventario_jornada(v_sesion,'INICIAL',
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',9),
      jsonb_build_object('producto_id',v_jugo,'cantidad',5)
    ),'Conteo inicial físico de prueba');
  IF v_result->>'estado'<>'CONFIRMADO' THEN RAISE EXCEPTION 'FAIL: initial count not confirmed'; END IF;

  -- Retry cannot overwrite the confirmed snapshot.
  v_result:=public.bc7_guardar_inventario_jornada(v_sesion,'INICIAL',
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',1),
      jsonb_build_object('producto_id',v_jugo,'cantidad',1)
    ),'Reintento con payload diferente');
  IF coalesce((v_result->>'idempotente')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: repeat delivery was not treated idempotently';
  END IF;
  IF (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas l
      JOIN public.turno_jornada_inventario_cortes c ON c.id=l.corte_id
      WHERE c.turno_sesion_id=v_sesion AND c.tipo='INICIAL' AND l.producto_id=v_pan)<>9 THEN
    RAISE EXCEPTION 'FAIL: confirmed initial count was overwritten';
  END IF;

  PERFORM public.bc5_iniciar_jornada(v_sesion,'Motivo de excepción para test aislado');
  SELECT id INTO v_tramo FROM public.turno_tramos WHERE turno_sesion_id=v_sesion AND estado='ACTIVO';
  IF v_tramo IS NULL THEN RAISE EXCEPTION 'FAIL: journey start did not create an active work segment'; END IF;

  v_ajuste:=public.bc7_registrar_ajuste_jornada(v_sesion,'merma',v_pan,1,'Merma de prueba aislada',
    '93000000-0000-0000-0000-000000000007');
  IF NOT EXISTS(
    SELECT 1 FROM public.mermas
    WHERE id=v_ajuste AND turno_sesion_id=v_sesion AND turno_tramo_id=v_tramo
      AND sesion_id IS NULL AND ciclo_id IS NULL AND estado='PENDIENTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: session adjustment must keep legacy links NULL and preserve Jornada session/tranche provenance';
  END IF;

  -- A retail Jornada can submit several Bajas as one pending approval item.
  -- This actor has creation and Jornada-view permission, but no approval permission.
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','bajas:crear,turnos:ver',false);
  v_result:=public.bc7_registrar_bajas_multiple_jornada(
    v_sesion,
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',2,'motivo','Producto roto o dañado'),
      jsonb_build_object('producto_id',v_jugo,'cantidad',1,'motivo','Producto vencido')
    ),
    'Lista de bajas de prueba',
    '93000000-0000-0000-0000-000000000008'
  );
  v_solicitud:=(v_result->>'solicitud_id')::uuid;
  IF v_solicitud IS NULL OR (v_result->>'count')::integer<>2 OR v_result->>'estado'<>'PENDIENTE' THEN
    RAISE EXCEPTION 'FAIL: bulk Jornada Baja must create one pending parent with two products';
  END IF;
  IF (SELECT count(*) FROM public.bajas b
      WHERE b.solicitud_id=v_solicitud AND b.estado='PENDIENTE'
        AND b.turno_sesion_id=v_sesion AND b.turno_tramo_id=v_tramo
        AND b.sesion_id IS NULL AND b.ciclo_id IS NULL)<>2 THEN
    RAISE EXCEPTION 'FAIL: each Baja line must keep exact session/tranche provenance under the same parent';
  END IF;

  -- An identical retry returns the same parent and never creates duplicate product rows.
  v_retry:=public.bc7_registrar_bajas_multiple_jornada(
    v_sesion,
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',2,'motivo','Producto roto o dañado'),
      jsonb_build_object('producto_id',v_jugo,'cantidad',1,'motivo','Producto vencido')
    ),
    'Lista de bajas de prueba',
    '93000000-0000-0000-0000-000000000008'
  );
  IF v_retry->>'solicitud_id'<>v_solicitud::text OR (v_retry->>'count')::integer<>2
     OR (SELECT count(*) FROM public.bajas WHERE solicitud_id=v_solicitud)<>2 THEN
    RAISE EXCEPTION 'FAIL: an exact retry must return the same grouped request without duplicating lines';
  END IF;

  -- One insufficient product rejects the entire list and leaves no parent request.
  v_error:=false;
  BEGIN
    PERFORM public.bc7_registrar_bajas_multiple_jornada(
      v_sesion,
      jsonb_build_array(jsonb_build_object('producto_id',v_pan,'cantidad',999,'motivo','Stock de prueba')),
      'Lista que debe fallar',
      '93000000-0000-0000-0000-000000000009'
    );
  EXCEPTION WHEN OTHERS THEN v_error:=true;
  END;
  IF NOT v_error OR EXISTS(
    SELECT 1 FROM public.bajas_solicitudes
    WHERE creado_por=v_owner AND idempotency_key='93000000-0000-0000-0000-000000000009'
  ) THEN
    RAISE EXCEPTION 'FAIL: a stock shortage must reject the whole list without leaving a partial parent';
  END IF;

  -- The admin queue exposes one item for the whole list, not one item per product.
  PERFORM set_config('test.bc_admin','true',false);
  PERFORM set_config('test.perms','bajas:crear,mermas:crear',false);
  SELECT count(*) INTO v_list_count
  FROM public.listar_aprobaciones_admin() q
  WHERE q.tipo='baja_lista' AND q.id=v_solicitud;
  IF v_list_count<>1 THEN
    RAISE EXCEPTION 'FAIL: Administration must receive exactly one approval item for a multi-product Baja';
  END IF;

  INSERT INTO public.turno_declaraciones(turno_id,turno_sesion_id,turno_tramo_id,usuario_id,monto)
  VALUES(v_turno,v_sesion,v_tramo,v_owner,0);

  -- Existing canonical close must also require the final physical count.
  v_error:=false;
  BEGIN
    PERFORM public.bc5_cerrar_jornada(v_sesion,'Motivo de excepción para test aislado');
  EXCEPTION WHEN check_violation THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: journey closed without a final inventory snapshot'; END IF;
  IF (SELECT estado FROM public.turno_sesiones WHERE id=v_sesion)<>'EN_CURSO' THEN
    RAISE EXCEPTION 'FAIL: rejected close changed the session state';
  END IF;

  v_result:=public.bc7_guardar_inventario_jornada(v_sesion,'FINAL',
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',8),
      jsonb_build_object('producto_id',v_jugo,'cantidad',4)
    ),'Conteo final físico de prueba');
  IF v_result->>'estado'<>'CONFIRMADO' THEN RAISE EXCEPTION 'FAIL: final count not confirmed'; END IF;

  v_result:=public.bc7_obtener_inventario_jornada(v_sesion);
  IF (SELECT (x->>'diferencia')::numeric
      FROM jsonb_array_elements(v_result->'cortes'->'FINAL'->'lineas') x
      WHERE x->>'producto_id'=v_pan::text)<>-2 THEN
    RAISE EXCEPTION 'FAIL: final quantity discrepancy is not reproducible against system stock';
  END IF;

  PERFORM public.bc5_cerrar_jornada(v_sesion,'Motivo de excepción para test aislado');
  IF (SELECT estado FROM public.turno_sesiones WHERE id=v_sesion)<>'COMPLETADA' THEN
    RAISE EXCEPTION 'FAIL: journey did not close after the money declaration and final inventory were present';
  END IF;

  IF has_table_privilege('authenticated','public.turno_jornada_inventario_cortes','SELECT') THEN
    RAISE EXCEPTION 'FAIL: authenticated role can read the snapshot table directly';
  END IF;
  IF has_function_privilege('anon','public.bc7_obtener_inventario_jornada(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can execute the session inventory RPC';
  END IF;
  IF NOT has_function_privilege('authenticated','public.bc7_obtener_inventario_jornada(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated is missing the intended inventory RPC grant';
  END IF;

  -- A non-assigned worker cannot inspect or write another person's jornada.
  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  v_error:=false;
  BEGIN
    PERFORM public.bc7_obtener_inventario_jornada(v_sesion);
  EXCEPTION WHEN insufficient_privilege THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL: unrelated worker could inspect another journey'; END IF;

  RAISE NOTICE 'PASS Step 7: immutable snapshots, guarded open/close, session-scoped adjustment, permissions and ACLs';
END
$test$;
