-- Functional contract: an explicitly linked late inbound transfer is
-- included once, but an unlinked late transfer and a linked pre-opening
-- transfer are excluded from the exact Jornada settlement.
BEGIN;

SELECT set_config('test.bc_admin','true',false);
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);

DO $test$
DECLARE
  v_session uuid := '91000000-0000-0000-0000-000000000007';
  v_owner uuid := '20000000-0000-0000-0000-000000000001';
  v_warehouse uuid := '10000000-0000-0000-0000-000000000001';
  v_source_warehouse uuid := '10000000-0000-0000-0000-000000000002';
  v_product uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_result jsonb;
  v_line jsonb;
BEGIN
  SELECT
    CASE
      WHEN coalesce(s.apertura_retroactiva,false) AND initial_cut.origen_corte_id IS NOT NULL
      THEN coalesce(
        (
          SELECT coalesce(
            source_session.corte_operativo_at,
            (
              SELECT max(source_tramo.fin_at)
              FROM public.turno_tramos source_tramo
              WHERE source_tramo.turno_sesion_id=source_session.id
                AND source_tramo.fin_at IS NOT NULL
            ),
            source_cut.confirmado_en
          )
          FROM public.turno_jornada_inventario_cortes source_cut
          JOIN public.turno_sesiones source_session
            ON source_session.id=source_cut.turno_sesion_id
          WHERE source_cut.id=initial_cut.origen_corte_id
            AND source_cut.tipo='FINAL'
            AND source_cut.estado='CONFIRMADO'
        ),
        initial_cut.confirmado_en,initial_cut.creado_en,t.apertura_real
      )
      ELSE coalesce(initial_cut.confirmado_en,initial_cut.creado_en,t.apertura_real)
    END,
    CASE
      WHEN s.estado='CERRADA_OPERATIVAMENTE' AND s.corte_operativo_at IS NOT NULL
        THEN s.corte_operativo_at
      ELSE coalesce(final_cut.confirmado_en,final_cut.creado_en,now())
    END
  INTO v_start_at,v_end_at
  FROM public.turno_sesiones s
  JOIN public.turnos t ON t.id=s.turno_id
  JOIN public.turno_jornada_inventario_cortes initial_cut
    ON initial_cut.turno_sesion_id=s.id
   AND initial_cut.tipo='INICIAL'
   AND initial_cut.estado='CONFIRMADO'
  JOIN public.turno_jornada_inventario_cortes final_cut
    ON final_cut.turno_sesion_id=s.id
   AND final_cut.tipo='FINAL'
   AND final_cut.estado='CONFIRMADO'
  WHERE s.id=v_session;

  IF v_start_at IS NULL OR v_end_at IS NULL THEN
    RAISE EXCEPTION 'Step 7 fixture must provide a valid confirmed Jornada window.';
  END IF;

  -- Select a product already present in this Jornada's own settlement
  -- snapshot; the generic Step 5 Pan fixture is not necessarily part of it.
  v_result:=public.bc7_liquidacion_inventario_jornada(v_session);
  SELECT (line->>'producto_id')::uuid
    INTO v_product
  FROM jsonb_array_elements(coalesce(v_result->'lineas','[]'::jsonb)) AS lines(line)
  LIMIT 1;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Step 7 fixture must expose at least one product in its Jornada settlement.';
  END IF;

  INSERT INTO public.transferencias
    (id,almacen_origen_id,almacen_destino_id,fecha,creado_por,estado)
  VALUES
    ('97200000-0000-0000-0000-000000000003',
     v_source_warehouse,v_warehouse,v_end_at+interval '1 hour',v_owner,'completada'),
    ('97200000-0000-0000-0000-000000000004',
     v_source_warehouse,v_warehouse,v_end_at+interval '2 hours',v_owner,'completada'),
    ('97200000-0000-0000-0000-000000000005',
     v_source_warehouse,v_warehouse,v_start_at-interval '1 hour',v_owner,'completada');

  INSERT INTO public.transferencias_lineas(id,transferencia_id,producto_id,cantidad)
  VALUES
    ('97300000-0000-0000-0000-000000000003',
     '97200000-0000-0000-0000-000000000003',v_product,4),
    ('97300000-0000-0000-0000-000000000004',
     '97200000-0000-0000-0000-000000000004',v_product,9),
    ('97300000-0000-0000-0000-000000000005',
     '97200000-0000-0000-0000-000000000005',v_product,7);

  INSERT INTO public.turno_jornada_entradas_vinculadas
    (turno_sesion_id,transferencia_id,vinculado_por)
  VALUES
    (v_session,'97200000-0000-0000-0000-000000000003',v_owner),
    (v_session,'97200000-0000-0000-0000-000000000005',v_owner);

  v_result:=public.bc7_liquidacion_inventario_jornada(v_session);
  SELECT line
    INTO v_line
  FROM jsonb_array_elements(coalesce(v_result->'lineas','[]'::jsonb)) AS lines(line)
  WHERE line->>'producto_id'=v_product::text
  LIMIT 1;

  IF v_line IS NULL THEN
    RAISE EXCEPTION 'Settlement did not return the fixture product line.';
  END IF;

  IF coalesce((v_line->>'transferencias_entrada')::numeric,0)<>4 THEN
    RAISE EXCEPTION
      'Only the exact-session linked transfer after cutoff must be included; expected 4 units, got %.',
      coalesce(v_line->>'transferencias_entrada','NULL');
  END IF;

  RAISE NOTICE 'PASS: linked post-cut transfer included; unlinked post-cut and linked pre-opening transfers excluded.';
END
$test$;

ROLLBACK;
