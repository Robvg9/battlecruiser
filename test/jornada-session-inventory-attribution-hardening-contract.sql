-- Root-cause regression contract: a Jornada owns exact inventory events.
DO $test$
DECLARE
  v_settlement text := pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure);
  v_trigger text := pg_get_functiondef('public.bc7_vincular_transferencia_jornada_destino_minorista()'::regprocedure);
  v_pending text := pg_get_functiondef('public.bc7_transferencias_pendientes_vinculo_jornada(uuid)'::regprocedure);
  v_balance text := pg_get_functiondef('public.bc7_jornada_saldos_operativos(uuid)'::regprocedure);
  v_full_link text := pg_get_functiondef('public.bc7_vincular_transferencia_jornada(uuid,uuid,text)'::regprocedure);
  v_line_link text := pg_get_functiondef('public.bc7_vincular_lineas_transferencia_jornada(uuid,uuid,uuid[],text)'::regprocedure);
  v_constraint boolean;
BEGIN
  IF position('normalized_movement_rows AS' IN v_balance)=0
     OR position('FROM movement_rows raw_m' IN v_balance)=0
     OR position('FROM normalized_movement_rows m' IN v_balance)=0
     OR position('coalesce(product.producto_padre_id,raw_m.producto_id)' IN v_balance)=0
     OR position('line_link.transferencia_linea_id=tl.id' IN v_balance)=0 THEN
    RAISE EXCEPTION 'FAIL: operational stock snapshots (including mandatory price-change counts) must normalize variant lines to the same retail family and use exact transfer-line ownership.';
  END IF;

  IF position('bc7_jornada_saldos_operativos(v_s.id)' IN pg_get_functiondef('public.bc7_confirmar_cambios_precio_conteo(uuid,jsonb)'::regprocedure))=0 THEN
    RAISE EXCEPTION 'FAIL: price-change confirmation must use the corrected family-normalized stock snapshot.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.turno_jornada_entradas_lineas_vinculadas allocated_line
    JOIN public.turno_jornada_entradas_vinculadas link
      ON link.id=allocated_line.entrada_vinculada_id
    JOIN public.transferencias transfer
      ON transfer.id=link.transferencia_id
    JOIN public.turno_sesiones session
      ON session.id=link.turno_sesion_id
    JOIN public.turno_jornada_programacion program
      ON program.id=session.jornada_programacion_id
    WHERE transfer.fecha>coalesce(
        session.corte_operativo_at,
        (
          (coalesce(program.fecha_fin,program.fecha)::timestamp+program.hora_fin_prevista)
          AT TIME ZONE coalesce(nullif(program.zona_horaria,''),'America/Havana')
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.turno_eventos explicit_link_event
        WHERE explicit_link_event.turno_sesion_id=session.id
          AND explicit_link_event.tipo='TRANSFERENCIA_RETROACTIVA_VINCULADA'
          AND explicit_link_event.payload->>'transferencia_id'=transfer.id::text
      )
  ) THEN
    RAISE EXCEPTION 'FAIL: an automatic post-cut transfer link without an explicit Owner audit event must never become a line-level override.';
  END IF;

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

  IF position('allocated_link.turno_sesion_id<>v_s.id' IN v_settlement)=0
     OR position('allocated_line.transferencia_linea_id=tl.id' IN v_settlement)=0 THEN
    RAISE EXCEPTION 'FAIL: a line allocated to another Jornada must be excluded from this session, even when its timestamp falls inside this session window.';
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
     OR position('NOT EXISTS' IN v_pending)=0 THEN
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
