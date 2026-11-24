BEGIN;

-- Restore the one explicitly Owner-attributed Fosforeras line that was
-- accidentally excluded from the 2026-11-18..20 La Cueva session during the
-- line-level backfill. Keep the correction narrowly scoped to the exact
-- transfer/session/line and require the original Owner audit record.
DO $restore_fosforeras_line$
DECLARE
  v_line_id uuid;
  v_session_id uuid := 'bc0d6619-6e97-47e3-b373-9484942efbb7';
  v_transfer_id uuid := '677e771e-1aa7-404b-b3b1-722d1c402390';
  v_inserted integer := 0;
BEGIN
  SELECT line.id INTO v_line_id
  FROM public.transferencias_lineas line
  JOIN public.productos product ON product.id=line.producto_id
  WHERE line.transferencia_id=v_transfer_id
    AND lower(btrim(product.nombre))='fosforeras'
    AND line.cantidad=50
  LIMIT 1;

  -- A disposable CI fixture has no copy of this production historical transfer.
  -- In LIVE, if the exact transfer exists, it must have the documented line.
  IF EXISTS (SELECT 1 FROM public.transferencias WHERE id=v_transfer_id)
     AND v_line_id IS NULL THEN
    RAISE EXCEPTION 'Expected Fosforeras x50 transfer line is missing from the historical transfer.';
  END IF;

  IF v_line_id IS NOT NULL THEN
    INSERT INTO public.turno_jornada_entradas_lineas_vinculadas
      (entrada_vinculada_id,transferencia_linea_id,vinculado_por,vinculado_en,motivo)
    SELECT
      link.id,
      v_line_id,
      audit.actor_user_id,
      audit.created_at,
      'Restaurada tras auditoría: vínculo retroactivo único autorizado por el Dueño (4 líneas) para esta Jornada. El Excel Noviembre-18-19-20-Sheila.xlsx confirma Fosforeras: 50 iniciales, 47 finales y 3 vendidas. La exclusión previa fue un error; se restaura solo esta línea.'
    FROM public.turno_jornada_entradas_vinculadas link
    JOIN public.turno_sesiones session ON session.id=link.turno_sesion_id
    JOIN public.transferencias transfer ON transfer.id=link.transferencia_id
    JOIN public.turno_eventos audit
      ON audit.turno_sesion_id=session.id
     AND audit.tipo='TRANSFERENCIA_RETROACTIVA_VINCULADA'
     AND audit.payload->>'transferencia_id'=transfer.id::text
     AND audit.payload->>'vinculo_id'=link.id::text
     AND audit.payload->>'lineas'='4'
     AND audit.payload->>'aplicacion_unica'='true'
     AND audit.actor_user_id=link.vinculado_por
     AND audit.created_at=link.vinculado_en
    WHERE session.id=v_session_id
      AND link.transferencia_id=v_transfer_id
      AND transfer.almacen_destino_id=session.almacen_id
      AND lower(transfer.estado)='completada'
      AND NOT EXISTS (
        SELECT 1
        FROM public.turno_jornada_entradas_lineas_vinculadas existing
        WHERE existing.transferencia_linea_id=v_line_id
      )
    ON CONFLICT (transferencia_linea_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted=ROW_COUNT;

    IF NOT EXISTS (
      SELECT 1
      FROM public.turno_jornada_entradas_lineas_vinculadas restored
      JOIN public.turno_jornada_entradas_vinculadas link
        ON link.id=restored.entrada_vinculada_id
      WHERE restored.transferencia_linea_id=v_line_id
        AND link.turno_sesion_id=v_session_id
        AND link.transferencia_id=v_transfer_id
    ) THEN
      RAISE EXCEPTION 'The Fosforeras x50 line was not restored to its explicitly authorized La Cueva session; check the original Owner event and any conflicting allocation.';
    END IF;

    -- Preserve a second immutable audit trail for this corrective restore.
    IF NOT EXISTS (
      SELECT 1 FROM public.turno_eventos
      WHERE idempotency_key='jornada_fosforeras_line_restore:'||v_line_id::text
    ) THEN
      INSERT INTO public.turno_eventos
        (turno_id,turno_sesion_id,actor_user_id,tipo,payload,idempotency_key)
      SELECT
        session.turno_id,
        session.id,
        audit.actor_user_id,
        'JORNADA_LINEA_TRANSFERENCIA_RESTAURADA',
        jsonb_build_object(
          'transferencia_id',v_transfer_id,
          'transferencia_linea_id',v_line_id,
          'producto','Fosforeras',
          'cantidad',50,
          'source_file','Noviembre-18-19-20-Sheila.xlsx',
          'excel_initial',50,
          'excel_final',47,
          'excel_sold',3,
          'original_owner_link_event_id',audit.id,
          'line_level_restore_rows',v_inserted,
          'reason','The original retroactive Owner link and source workbook confirm this line belongs to the 18–20 November Jornada; the prior migration exclusion was incorrect.'
        ),
        'jornada_fosforeras_line_restore:'||v_line_id::text
      FROM public.turno_sesiones session
      JOIN public.turno_jornada_entradas_vinculadas link
        ON link.turno_sesion_id=session.id AND link.transferencia_id=v_transfer_id
      JOIN public.turno_eventos audit
        ON audit.turno_sesion_id=session.id
       AND audit.tipo='TRANSFERENCIA_RETROACTIVA_VINCULADA'
       AND audit.payload->>'transferencia_id'=v_transfer_id::text
       AND audit.payload->>'vinculo_id'=link.id::text
       AND audit.payload->>'lineas'='4'
       AND audit.payload->>'aplicacion_unica'='true'
      WHERE session.id=v_session_id
      LIMIT 1;
    END IF;
  END IF;
END
$restore_fosforeras_line$;

-- A late-entered Jornada remains CERRADA_OPERATIVAMENTE while the master Turn
-- stays open for the Owner's integral review. Historical price tranches are
-- specifically an Owner correction for that sealed operational session; they
-- must not be blocked merely because it has not yet transitioned to COMPLETADA.
-- Keep the master-turn closed/cancelled freeze, Admin authorization, exact
-- sold-quantity check, audit event, SECURITY DEFINER and grants unchanged.
DO $allow_price_tranches_after_operational_seal$
DECLARE
  v_function text:=pg_get_functiondef(
    'public.bc7_guardar_tramos_precio_jornada(uuid,uuid,jsonb,text)'::regprocedure
  );
  v_old_guard text:=$old$
 IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'COMPLETADA' THEN
  RAISE EXCEPTION 'Solo se corrigen jornadas completadas.' USING ERRCODE='23514';
 END IF;
$old$;
  v_new_guard text:=$new$
 IF NOT FOUND OR v_s.bloque<>'JORNADA'
    OR v_s.estado NOT IN ('COMPLETADA','CERRADA_OPERATIVAMENTE') THEN
  RAISE EXCEPTION 'Solo se corrigen jornadas cerradas operativamente o completadas.' USING ERRCODE='23514';
 END IF;
$new$;
BEGIN
  IF position(v_new_guard IN v_function)=0 THEN
    IF position(v_old_guard IN v_function)=0 THEN
      RAISE EXCEPTION 'Price-tranche session-state guard changed unexpectedly; refusing a partial function rewrite.';
    END IF;
    v_function:=replace(v_function,v_old_guard,v_new_guard);
  END IF;

  IF position('coalesce(t.estado_maestro,t.estado) IN (' || quote_literal('CERRADO') || ',' || quote_literal('CANCELADO') || ')' IN v_function)=0 THEN
    RAISE EXCEPTION 'Price-tranche master-Turn close/cancel freeze is missing; refusing to enable a weaker correction path.';
  END IF;

  EXECUTE v_function;
END
$allow_price_tranches_after_operational_seal$;

REVOKE ALL ON FUNCTION public.bc7_guardar_tramos_precio_jornada(uuid,uuid,jsonb,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_guardar_tramos_precio_jornada(uuid,uuid,jsonb,text)
  TO authenticated;

COMMIT;
