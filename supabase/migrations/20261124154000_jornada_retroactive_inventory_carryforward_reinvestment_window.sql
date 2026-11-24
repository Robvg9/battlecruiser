BEGIN;

-- A retroactive Jornada may inherit its initial snapshot from a prior FINAL cut
-- that was recorded late. In that case, movement accounting must start at the
-- source cut's effective close, not at the delayed timestamp when it was entered.
-- Approved reinvestments are warehouse movements; a legacy turn/session link must
-- not exclude an otherwise in-period reinvestment from the current stock balance.
-- The cash reinvestment total uses the same operational window as stock movement.

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
      AND r.estado='APROBADA' AND r.fecha_revision IS NOT NULL
      AND r.creado_en>v_start_at AND r.creado_en<=v_end_at$new_event$;
  v_old_cash text := $old_cash$FROM public.reinversiones r WHERE r.turno_sesion_id=v_s.id AND r.estado IN ('APROBADA','PENDIENTE');$old_cash$;
  v_new_cash text := $new_cash$FROM public.reinversiones r
  WHERE r.almacen_id=v_s.almacen_id
    AND r.estado IN ('APROBADA','PENDIENTE')
    AND r.creado_en>v_start_at AND r.creado_en<=v_end_at;$new_cash$;
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
  RAISE NOTICE 'PASS: retroactive Jornada movements and reinvestment totals now use the effective inherited-cut window.';
END
$migration$;

COMMIT;
