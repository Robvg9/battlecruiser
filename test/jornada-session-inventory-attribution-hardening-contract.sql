-- Root-cause regression contract: a Jornada owns exact inventory events.
DO $test$
DECLARE
  v_settlement text := pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure);
  v_trigger text := pg_get_functiondef('public.bc7_vincular_transferencia_jornada_destino_minorista()'::regprocedure);
  v_pending text := pg_get_functiondef('public.bc7_transferencias_pendientes_vinculo_jornada(uuid)'::regprocedure);
  v_full_link text := pg_get_functiondef('public.bc7_vincular_transferencia_jornada(uuid,uuid,text)'::regprocedure);
  v_line_link text := pg_get_functiondef('public.bc7_vincular_lineas_transferencia_jornada(uuid,uuid,uuid[],text)'::regprocedure);
  v_constraint boolean;
BEGIN
  IF position('source_cut.corte_sucesora_origen_id=v_initial.id' IN v_settlement)=0 THEN
    RAISE EXCEPTION 'FAIL: a one-way inherited cut pointer must not move the opening boundary without reciprocal successor proof.';
  END IF;

  IF position('r.turno_sesion_id=v_s.id' IN v_settlement)=0
     OR position('r.creado_en>v_start_at AND r.creado_en<=v_end_at' IN v_settlement)>0 THEN
    RAISE EXCEPTION 'FAIL: reinvestment stock must belong to the exact Jornada session, independent of late data-entry timestamp.';
  END IF;
  IF position('r.turno_sesion_id=v_s.id' IN v_settlement)=0
     OR position('r.estado IN (''APROBADA'',''PENDIENTE'')' IN v_settlement)=0 THEN
    RAISE EXCEPTION 'FAIL: reinvestment cash must use the same session attribution as reinvestment stock.';
  END IF;

  IF position('linked_line.transferencia_linea_id=tl.id' IN v_settlement)=0
     OR position('linked_override.transferencia_id=t.id' IN v_settlement)=0 THEN
    RAISE EXCEPTION 'FAIL: late transfer overrides must match the exact selected transfer line, not the whole transfer.';
  END IF;
  IF position('linked_override.transferencia_id=t.id' IN v_settlement)>0
     AND position('FROM public.turno_jornada_entradas_vinculadas linked_override' || chr(10) ||
                  '        WHERE linked_override.turno_sesion_id=v_s.id' IN v_settlement)>0
     AND position('linked_line.transferencia_linea_id=tl.id' IN v_settlement)=0 THEN
    RAISE EXCEPTION 'FAIL: whole-transfer override found without line-level guard.';
  END IF;

  IF position('NEW.fecha >=' IN v_trigger)=0
     OR position('NEW.fecha <=' IN v_trigger)=0
     OR position('p.hora_inicio_prevista' IN v_trigger)=0
     OR position('p.hora_fin_prevista' IN v_trigger)=0
     OR position('lower(coalesce(NEW.estado' IN v_trigger)=0
     OR position('completada' IN v_trigger)=0
     OR position('ORDER BY s.fecha DESC' IN v_trigger)>0 THEN
    RAISE EXCEPTION 'FAIL: automatic attribution must require completed transfer timestamp inside exactly one scheduled Jornada window.';
  END IF;

  IF position('tl.id' IN v_pending)=0
     OR position('p.hora_fin_prevista' IN v_pending)=0
     OR position('NOT EXISTS(' || chr(10) ||
                  '      SELECT 1' IN v_pending)=0 THEN
    RAISE EXCEPTION 'FAIL: pending transfer review must expose line identity and use exact scheduled end boundary.';
  END IF;

  IF position('RAISE EXCEPTION' IN v_full_link)=0
     OR position('INSERT INTO public.turno_jornada_entradas_vinculadas' IN v_full_link)>0 THEN
    RAISE EXCEPTION 'FAIL: legacy whole-transfer attribution must be disabled.';
  END IF;
  IF position('tl.id=ANY(p_transferencia_linea_ids)' IN v_line_link)=0
     OR position('public.turno_jornada_entradas_lineas_vinculadas' IN v_line_link)=0 THEN
    RAISE EXCEPTION 'FAIL: line-level attribution RPC must validate and persist exact selected transfer lines.';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.turno_jornada_entradas_lineas_vinculadas'::regclass
      AND conname='turno_jornada_entrada_linea_unica'
      AND contype='u'
  ) INTO v_constraint;
  IF NOT v_constraint THEN
    RAISE EXCEPTION 'FAIL: transfer lines must be attributable to at most one Jornada.';
  END IF;

  RAISE NOTICE 'PASS: reciprocal opening proof, session-scoped reinvestments, scheduled auto-link boundary, and exact transfer-line attribution.';
END
$test$;
