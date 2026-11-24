BEGIN;

-- Retroactive Jornadas inherit their opening from a prior FINAL cut that may
-- have been entered late. Count warehouse transfers from the inherited cut's
-- effective close, not from the delayed data-entry timestamp.
--
-- Reinvestments use a different attribution rule: the Jornada session_id is
-- the explicit business link. This is important when an authorized reinvestment
-- is entered after the physical cut but belongs to this sealed Jornada. Include
-- all approved reinvestments linked to this session, even when created late;
-- exclude reinvestments linked to other sessions even if their timestamps happen
-- to fall inside this Jornada's calendar window. Stock and cash totals must agree.

DO $migration$
DECLARE
  v_function text := pg_get_functiondef(
    'public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure
  );
  v_old_start text := $old_start$v_start_at:=coalesce(v_initial.confirmado_en,v_initial.creado_en,v_turno.apertura_real);$old_start$;
  v_new_start text := $new_start$v_start_at:=CASE
    WHEN v_retroactive AND v_initial.origen_corte_id IS NOT NULL THEN coalesce(
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
        WHERE source_cut.id=v_initial.origen_corte_id
          AND source_cut.tipo='FINAL'
          AND source_cut.estado='CONFIRMADO'
      ),
      v_initial.confirmado_en,v_initial.creado_en,v_turno.apertura_real
    )
    ELSE coalesce(v_initial.confirmado_en,v_initial.creado_en,v_turno.apertura_real)
  END;$new_start$;
  v_old_event text := $old_event$WHERE r.almacen_id=v_s.almacen_id AND r.turno_sesion_id=v_s.id
      AND r.estado='APROBADA' AND r.fecha_revision IS NOT NULL
      AND r.creado_en>v_start_at AND r.creado_en<=v_end_at$old_event$;
  v_new_event text := $new_event$WHERE r.almacen_id=v_s.almacen_id
      AND r.turno_sesion_id=v_s.id
      AND r.estado='APROBADA' AND r.fecha_revision IS NOT NULL$new_event$;
  v_old_cash text := $old_cash$FROM public.reinversiones r WHERE r.turno_sesion_id=v_s.id AND r.estado IN ('APROBADA','PENDIENTE');$old_cash$;
  v_new_cash text := $new_cash$FROM public.reinversiones r
  WHERE r.almacen_id=v_s.almacen_id
    AND r.turno_sesion_id=v_s.id
    AND r.estado IN ('APROBADA','PENDIENTE');$new_cash$;
BEGIN
  IF position(v_new_start IN v_function)=0 THEN
    IF position(v_old_start IN v_function)=0 THEN
      RAISE EXCEPTION 'Could not locate the expected Jornada initial-cut start expression; refusing a partial function rewrite.';
    END IF;
    v_function := replace(v_function,v_old_start,v_new_start);
  END IF;

  IF position(v_new_event IN v_function)=0 THEN
    IF position(v_old_event IN v_function)=0 THEN
      RAISE EXCEPTION 'Could not locate the expected reinvestment stock-movement filter; refusing a partial function rewrite.';
    END IF;
    v_function := replace(v_function,v_old_event,v_new_event);
  END IF;

  IF position(v_new_cash IN v_function)=0 THEN
    IF position(v_old_cash IN v_function)=0 THEN
      RAISE EXCEPTION 'Could not locate the expected reinvestment cash-total filter; refusing a partial function rewrite.';
    END IF;
    v_function := replace(v_function,v_old_cash,v_new_cash);
  END IF;

  EXECUTE v_function;
  RAISE NOTICE 'PASS: retroactive Jornada start uses inherited effective close; reinvestment stock and cash use the same explicit session attribution.';
END
$migration$;

COMMIT;
