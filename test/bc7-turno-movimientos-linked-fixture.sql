-- Disposable-only linked movement fixture. Reuses the canonical Step 7 JORNADA
-- that test/step7-jornada-contract.sql created, started and closed.
-- No LIVE or non-disposable data is touched.
DO $fixture$
DECLARE
  v_session uuid:='91000000-0000-0000-0000-000000000007';
  v_owner uuid:='20000000-0000-0000-0000-000000000001';
  v_worker uuid:='20000000-0000-0000-0000-000000000002';
  v_warehouse uuid:='10000000-0000-0000-0000-000000000001';
  v_other_warehouse uuid:='10000000-0000-0000-0000-000000000002';
  v_product uuid:='31000000-0000-0000-0000-000000000001';
  v_tranche uuid;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  -- Normalize only this disposable tranche to a deterministic 09:00–10:00
  -- Havana interval so we can test an operation created inside it and
  -- approved after its end, regardless of the CI runner's wall clock.
  UPDATE public.turno_tramos tr
  SET inicio_at=(sesion.fecha::timestamp+time '09:00') AT TIME ZONE 'America/Havana',
      fin_at=(sesion.fecha::timestamp+time '10:00') AT TIME ZONE 'America/Havana'
  FROM public.turno_sesiones sesion
  WHERE tr.turno_sesion_id=v_session
    AND tr.usuario_id=v_owner
    AND sesion.id=tr.turno_sesion_id
    AND sesion.bloque='JORNADA'
    AND sesion.estado='COMPLETADA';

  SELECT tr.id,tr.inicio_at,tr.fin_at
  INTO v_tranche,v_start,v_end
  FROM public.turno_tramos tr
  JOIN public.turno_sesiones s ON s.id=tr.turno_sesion_id
  WHERE tr.turno_sesion_id=v_session
    AND tr.usuario_id=v_owner
    AND s.bloque='JORNADA'
    AND s.estado='COMPLETADA'
    AND tr.estado='COMPLETADO'
  ORDER BY tr.inicio_at DESC
  LIMIT 1;
  IF v_tranche IS NULL OR v_start IS NULL OR v_end IS NULL THEN
    RAISE EXCEPTION 'Canonical Step 7 fixture must leave a completed JORNADA tranche for owner';
  END IF;

  -- Make the second legacy session share the same date and warehouse. It must
  -- still not inherit any operation that is explicitly linked to the JORNADA.
  UPDATE public.turno_sesiones other_session
  SET fecha=(SELECT fecha FROM public.turno_sesiones WHERE id=v_session)
  WHERE other_session.id='93000000-0000-0000-0000-000000000002';

  INSERT INTO public.transferencias(
    id,almacen_origen_id,almacen_destino_id,fecha,creado_por,estado
  ) VALUES
    ('97200000-0000-0000-0000-000000000001',
     v_other_warehouse,v_warehouse,v_start+interval '5 minutes',v_worker,'completada'),
    ('97200000-0000-0000-0000-000000000002',
     v_other_warehouse,v_warehouse,v_start+interval '7 minutes',v_worker,'completada');

  INSERT INTO public.transferencias_lineas(id,transferencia_id,producto_id,cantidad)
  VALUES
    ('97300000-0000-0000-0000-000000000001',
     '97200000-0000-0000-0000-000000000001',v_product,4),
    ('97300000-0000-0000-0000-000000000002',
     '97200000-0000-0000-0000-000000000002',v_product,9);

  -- The first inbound transfer is explicitly linked to this JORNADA.
  -- Both transfers share warehouse/date and a different creator, so only the link
  -- may attribute the first one; the second must remain in general History.
  INSERT INTO public.turno_jornada_entradas_vinculadas(
    turno_sesion_id,transferencia_id,vinculado_por
  ) VALUES(v_session,'97200000-0000-0000-0000-000000000001',v_owner);

  -- The employee created each adjustment in her exact source tranche;
  -- an admin approved it only after that tranche had finished.
  INSERT INTO public.mermas(
    id,almacen_id,producto_id,cantidad,motivo,estado,creado_por,creado_nombre,
    fecha_revision,actualizado_en,revisado_por,revisado_nombre,creado_en,
    turno_sesion_id,turno_tramo_id
  ) VALUES (
    '99200000-0000-0000-0000-000000000001',
    v_warehouse,v_product,2,'fixture explícito','APROBADA',
    v_owner,'Responsable fixture',
    v_end+interval '5 minutes',v_end+interval '5 minutes',v_worker,'ADMIN fixture',
    v_start+interval '2 minutes',v_session,v_tranche
  );

  INSERT INTO public.bajas(
    id,almacen_id,producto_id,cantidad,motivo,estado,creado_por,creado_nombre,
    fecha_revision,actualizado_en,revisado_por,revisado_nombre,creado_en,
    turno_sesion_id,turno_tramo_id
  ) VALUES (
    '99300000-0000-0000-0000-000000000001',
    v_warehouse,v_product,3,'fixture explícito','APROBADA',
    v_owner,'Responsable fixture',
    v_end+interval '6 minutes',v_end+interval '6 minutes',v_worker,'ADMIN fixture',
    v_start+interval '3 minutes',v_session,v_tranche
  );
END
$fixture$;
