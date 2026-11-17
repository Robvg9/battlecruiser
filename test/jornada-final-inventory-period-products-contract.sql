-- Disposable regression contract for multi-day retail Jornada final inventory.
-- Reproduces late-created products that are physically present through an
-- approved Jornada reinvestment or an inbound transfer pending Owner attribution.
-- An inbound transfer already attributed to another session must stay excluded.
\set ON_ERROR_STOP on
BEGIN;

DO $test$
DECLARE
  v_owner uuid:='20000000-0000-0000-0000-000000000001';
  v_worker uuid:='20000000-0000-0000-0000-000000000002';
  v_warehouse uuid:=gen_random_uuid();
  v_source_warehouse uuid:=gen_random_uuid();
  v_turn uuid:=gen_random_uuid();
  v_program uuid:=gen_random_uuid();
  v_program_day2 uuid:=gen_random_uuid();
  v_session uuid:=gen_random_uuid();
  v_session_day2 uuid:=gen_random_uuid();
  v_tranche uuid:=gen_random_uuid();
  v_pan uuid:='31000000-0000-0000-0000-000000000001';
  v_juice uuid:='31000000-0000-0000-0000-000000000002';
  v_mani uuid:=gen_random_uuid();
  v_paniqueque uuid:=gen_random_uuid();
  v_pastel uuid:=gen_random_uuid();
  v_foreign_product uuid:=gen_random_uuid();
  v_transfer uuid:=gen_random_uuid();
  v_foreign_transfer uuid:=gen_random_uuid();
  v_reinvestment uuid:=gen_random_uuid();
  v_initial_cut uuid:=gen_random_uuid();
  v_detail jsonb;
  v_result jsonb;
  v_error boolean:=false;
  v_line_count integer;
  v_start date:=(now() AT TIME ZONE 'America/Havana')::date-5;
  v_end date:=(now() AT TIME ZONE 'America/Havana')::date-3;
  v_cutoff timestamptz;
BEGIN
  v_cutoff:=((v_end+1)::timestamp AT TIME ZONE 'America/Havana');

  INSERT INTO public.almacenes(id,nombre,tipo,activo)
  VALUES
    (v_warehouse,'Jornada final inventory period products fixture','minorista',true),
    (v_source_warehouse,'Jornada transfer source fixture','mayorista',true);

  -- Two opening families existed before the period. Four other catalogue rows
  -- are deliberately created after it; three are supported by this Jornada
  -- and one belongs to a transfer already attributed to another session.
  UPDATE public.productos
  SET created_at=v_cutoff-interval '2 days'
  WHERE id IN (v_pan,v_juice);

  INSERT INTO public.productos(id,nombre,unidad,activo,precio_normal,created_at)
  VALUES
    (v_mani,'Mani en Grano','ud',true,280,v_cutoff+interval '1 day'),
    (v_paniqueque,'Paniqueque Redondo','ud',true,70,v_cutoff+interval '1 day'),
    (v_pastel,'Pastel de $180','ud',true,180,v_cutoff+interval '1 day'),
    (v_foreign_product,'Producto de otra Jornada','ud',true,90,v_cutoff+interval '1 day');

  INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
  VALUES
    (v_pan,v_warehouse,10,1),
    (v_juice,v_warehouse,5,1),
    (v_mani,v_warehouse,24,1),
    (v_paniqueque,v_warehouse,40,1),
    (v_pastel,v_warehouse,60,1),
    (v_foreign_product,v_warehouse,99,1);

  INSERT INTO public.turnos(
    id,usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,
    estado_maestro,dias_turno
  ) VALUES(
    v_turn,v_owner,'Dueño fixture',v_warehouse,v_start,'ABIERTO',v_owner,v_owner,
    'EN_CURSO',3
  );

  INSERT INTO public.turno_jornada_programacion(
    id,turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,
    hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,
    creado_por,actualizado_por
  ) VALUES
    (v_program,v_turn,v_warehouse,1,v_start,v_end,true,v_worker,
      '07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner),
    (v_program_day2,v_turn,v_warehouse,2,v_start+1,v_end,true,v_worker,
      '07:00','23:00','America/Havana',NULL,'PROGRAMADA',v_owner,v_owner);

  INSERT INTO public.turno_sesiones(
    id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id,apertura_retroactiva
  ) VALUES
    (v_session,v_turn,v_warehouse,1,'JORNADA',v_start,'PROGRAMADA',v_program,true),
    (v_session_day2,v_turn,v_warehouse,2,'JORNADA',v_start+1,'PROGRAMADA',v_program_day2,true);

  INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
  VALUES(v_session,v_turn,v_worker,v_owner);

  INSERT INTO public.turno_jornada_inventario_cortes(
    id,turno_sesion_id,tipo,estado,creado_por,confirmado_por,observacion
  ) VALUES(v_initial_cut,v_session,'INICIAL','CONFIRMADO',v_worker,v_worker,'Opening physical count fixture');

  INSERT INTO public.turno_jornada_inventario_lineas(corte_id,producto_id,cantidad_contada,stock_sistema)
  VALUES(v_initial_cut,v_pan,10,10),(v_initial_cut,v_juice,5,5);

  INSERT INTO public.turno_tramos(id,turno_id,turno_sesion_id,usuario_id,tipo,estado,inicio_at)
  VALUES(v_tranche,v_turn,v_session,v_worker,'NORMAL','ACTIVO',now()-interval '1 hour');
  UPDATE public.turno_sesiones SET estado='EN_CURSO' WHERE id=v_session;

  -- An approved reinvestment is directly linked to this Jornada and contributes
  -- a late-created product even though the catalogue cutoff has passed.
  INSERT INTO public.reinversiones(
    id,almacen_id,turno_id,proveedor,fecha,total,usuario_id,usuario_nombre,
    idempotency_key,turno_sesion_id,turno_tramo_id,estado,revisado_por,revisado_nombre,fecha_revision
  ) VALUES(
    v_reinvestment,v_warehouse,v_turn,'Fixture reinversion',now(),8400,
    v_worker,'Dependienta fixture',gen_random_uuid(),v_session,v_tranche,'APROBADA',
    v_owner,'Dueño fixture',now()
  );
  INSERT INTO public.reinversiones_lineas(
    reinversion_id,producto_id,cantidad_base,costo_total,costo_unitario
  ) VALUES(v_reinvestment,v_pastel,60,8400,140);

  -- One completed inbound transfer was entered after the operating period. Its
  -- two products are countable in this historical final snapshot, but the
  -- transfer remains un-attributed until the Owner reviews it.
  INSERT INTO public.transferencias(
    id,almacen_origen_id,almacen_destino_id,estado,creado_por,fecha
  ) VALUES
    (v_transfer,v_source_warehouse,v_warehouse,'completada',v_owner,now()),
    (v_foreign_transfer,v_source_warehouse,v_warehouse,'completada',v_owner,now());

  INSERT INTO public.transferencias_lineas(id,transferencia_id,producto_id,cantidad)
  VALUES
    (gen_random_uuid(),v_transfer,v_mani,24),
    (gen_random_uuid(),v_transfer,v_paniqueque,40),
    (gen_random_uuid(),v_foreign_transfer,v_foreign_product,99);

  -- The second transfer is explicitly attributed to Day 2, so it must not
  -- leak into this session's final product set.
  INSERT INTO public.turno_jornada_entradas_vinculadas(
    turno_sesion_id,transferencia_id,vinculado_por
  ) VALUES(v_session_day2,v_foreign_transfer,v_owner);

  PERFORM set_config('request.jwt.claim.sub',v_worker::text,false);
  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('test.perms','turnos:ver',false);

  v_detail:=public.bc7_obtener_inventario_jornada(v_session);
  SELECT count(*) INTO v_line_count
  FROM jsonb_array_elements(v_detail->'productos') p;

  IF v_line_count<>5 THEN
    RAISE EXCEPTION 'FAIL: inventory UI must show exactly five families (2 opening + 3 supported late products); got % products: %',
      v_line_count,v_detail->'productos';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[v_pan,v_juice,v_mani,v_paniqueque,v_pastel]) expected(id)
    WHERE NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(v_detail->'productos') p
      WHERE (p->>'producto_id')::uuid=expected.id
    )
  ) THEN
    RAISE EXCEPTION 'FAIL: UI product projection omitted an opening, transfer or reinvestment family';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_detail->'productos') p
    WHERE (p->>'producto_id')::uuid=v_foreign_product
  ) THEN
    RAISE EXCEPTION 'FAIL: UI leaked a transfer already attributed to another Jornada';
  END IF;

  -- A stale/partial client list must be rejected by a clear count error, not
  -- disguised as a schedule error.
  BEGIN
    PERFORM public.bc7_guardar_inventario_jornada(
      v_session,'FINAL',
      jsonb_build_array(
        jsonb_build_object('producto_id',v_pan,'cantidad',8),
        jsonb_build_object('producto_id',v_juice,'cantidad',4),
        jsonb_build_object('producto_id',v_mani,'cantidad',18),
        jsonb_build_object('producto_id',v_pastel,'cantidad',23)
      ),
      'Intentionally incomplete regression payload'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_error:=true;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION 'FAIL: server accepted an incomplete inventory final payload';
  END IF;

  v_result:=public.bc7_guardar_inventario_jornada(
    v_session,'FINAL',
    jsonb_build_array(
      jsonb_build_object('producto_id',v_pan,'cantidad',8),
      jsonb_build_object('producto_id',v_juice,'cantidad',4),
      jsonb_build_object('producto_id',v_mani,'cantidad',18),
      jsonb_build_object('producto_id',v_paniqueque,'cantidad',9),
      jsonb_build_object('producto_id',v_pastel,'cantidad',23)
    ),
    'Final physical inventory fixture with late period evidence'
  );
  IF v_result->>'estado'<>'CONFIRMADO'
     OR (v_result->>'cantidad_lineas')::integer<>5 THEN
    RAISE EXCEPTION 'FAIL: server did not confirm the exact five-line physical inventory snapshot: %',v_result;
  END IF;

  SELECT count(*) INTO v_line_count
  FROM public.turno_jornada_inventario_lineas l
  JOIN public.turno_jornada_inventario_cortes c ON c.id=l.corte_id
  WHERE c.turno_sesion_id=v_session AND c.tipo='FINAL';
  IF v_line_count<>5 THEN
    RAISE EXCEPTION 'FAIL: persisted final snapshot line count differs from the submitted physical count';
  END IF;

  IF (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas l
      JOIN public.turno_jornada_inventario_cortes c ON c.id=l.corte_id
      WHERE c.turno_sesion_id=v_session AND c.tipo='FINAL' AND l.producto_id=v_mani)<>18
     OR (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas l
      JOIN public.turno_jornada_inventario_cortes c ON c.id=l.corte_id
      WHERE c.turno_sesion_id=v_session AND c.tipo='FINAL' AND l.producto_id=v_paniqueque)<>9
     OR (SELECT cantidad_contada FROM public.turno_jornada_inventario_lineas l
      JOIN public.turno_jornada_inventario_cortes c ON c.id=l.corte_id
      WHERE c.turno_sesion_id=v_session AND c.tipo='FINAL' AND l.producto_id=v_pastel)<>23 THEN
    RAISE EXCEPTION 'FAIL: saved physical quantities were not preserved for the three late products';
  END IF;

  RAISE NOTICE 'PASS Jornada final inventory: exact shared product projection, 3 late evidence-backed products, cross-session transfer isolation, incomplete count rejection and persisted physical quantities';
END
$test$;

ROLLBACK;
