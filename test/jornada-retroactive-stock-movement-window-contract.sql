-- Contract: retroactive Jornada stock and cash accounting share the effective
-- inherited-cut window, including approved reinvestments linked to an older shift.
DO $$
DECLARE
  v_function text := pg_get_functiondef(
    'public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure
  );
  v_event_start integer;
  v_event_end integer;
  v_cash_start integer;
  v_cash_end integer;
  v_event_block text;
  v_cash_block text;
  v_start_block text;
BEGIN
  IF position('WHEN v_retroactive AND v_initial.origen_corte_id IS NOT NULL' IN v_function)=0
     OR position('source_session.corte_operativo_at' IN v_function)=0
     OR position('max(source_tramo.fin_at)' IN v_function)=0 THEN
    RAISE EXCEPTION 'Retroactive Jornada does not derive the start from the inherited FINAL cut effective close.';
  END IF;

  v_event_start := position($needle$'REINVERSION',rl.cantidad_base::numeric$needle$ IN v_function);
  v_event_end := position($needle$'VALE',vs.cantidad::numeric$needle$ IN v_function);
  IF v_event_start=0 OR v_event_end<=v_event_start THEN
    RAISE EXCEPTION 'Could not isolate the stock reinvestment movement event.';
  END IF;
  v_event_block := substring(v_function FROM v_event_start FOR v_event_end-v_event_start);
  IF position('r.almacen_id=v_s.almacen_id' IN v_event_block)=0
     OR position('r.estado=''APROBADA''' IN v_event_block)=0
     OR position('r.fecha_revision IS NOT NULL' IN v_event_block)=0
     OR position('r.creado_en>v_start_at AND r.creado_en<=v_end_at' IN v_event_block)=0
     OR position('r.turno_sesion_id=v_s.id' IN v_event_block)>0 THEN
    RAISE EXCEPTION 'Stock reinvestments are not included by warehouse and operational time window independently of their legacy session link.';
  END IF;

  v_cash_start := position('SELECT coalesce(sum(r.total)' IN v_function);
  v_cash_end := position('SELECT count(*) INTO v_pending_adjustments' IN v_function);
  IF v_cash_start=0 OR v_cash_end<=v_cash_start THEN
    RAISE EXCEPTION 'Could not isolate the approved reinvestment cash aggregation.';
  END IF;
  v_cash_block := substring(v_function FROM v_cash_start FOR v_cash_end-v_cash_start);
  IF position('r.almacen_id=v_s.almacen_id' IN v_cash_block)=0
     OR position('r.estado IN (''APROBADA'',''PENDIENTE'')' IN v_cash_block)=0
     OR position('r.creado_en>v_start_at AND r.creado_en<=v_end_at' IN v_cash_block)=0
     OR position('r.turno_sesion_id=v_s.id' IN v_cash_block)>0 THEN
    RAISE EXCEPTION 'Cash reinvestment totals do not share the stock operational window.';
  END IF;

  RAISE NOTICE 'PASS: inherited-cut start, retroactive transfer window and warehouse-scoped reinvestment stock/cash totals are aligned.';
END;
$$;
