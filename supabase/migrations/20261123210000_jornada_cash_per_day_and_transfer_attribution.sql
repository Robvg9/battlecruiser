BEGIN;

-- Step 5 is the set of date-specific deliveries. A separate period-total
-- declaration is not part of a multi-day Jornada. Daily review remains Owner
-- controlled and the handover only requires one entry for every calendar date.
DO $patch_cash_per_day_step5$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_estado_confirmaciones_jornada(uuid)'::regprocedure)
    INTO v_def;

  IF strpos(v_def,'BC7_CASH_PER_DAY_STEP5_V1')=0 THEN
    v_old := $old$
  v_daily_registered integer:=0;
$old$;
    v_new := $new$
  v_daily_registered integer:=0;
  v_daily_approved integer:=0;
$new$;
    IF strpos(v_def,v_old)=0 THEN
      RAISE EXCEPTION 'Cannot add daily approval count to bc7_estado_confirmaciones_jornada.';
    END IF;
    v_def:=replace(v_def,v_old,v_new);

    v_old := $old$
  SELECT d.estado_aprobacion,d.turno_tramo_id,d.usuario_id
    INTO v_cash_state,v_cash_tranche_id,v_cash_actor_id
  FROM public.turno_declaraciones d
  WHERE d.turno_sesion_id=p_turno_sesion_id
  ORDER BY d.declarado_at DESC NULLS LAST,d.created_at DESC NULLS LAST
  LIMIT 1;
$old$;
    v_new := $new$
  -- BC7_CASH_PER_DAY_STEP5_V1: no period-wide declaration is required.
$new$;
    IF strpos(v_def,v_old)=0 THEN
      RAISE EXCEPTION 'Cannot remove the legacy period declaration read from Step 5 checklist.';
    END IF;
    v_def:=replace(v_def,v_old,v_new);

    v_old := $old$
  SELECT count(DISTINCT e.fecha)::integer
    INTO v_daily_registered
  FROM public.turno_jornada_entregas_diarias e
  WHERE e.turno_sesion_id=p_turno_sesion_id
    AND e.fecha BETWEEN v_p.fecha AND coalesce(v_p.fecha_fin,v_p.fecha)
    AND e.estado<>'RECHAZADA';
$old$;
    v_new := $new$
  SELECT
    count(DISTINCT CASE WHEN e.estado<>'RECHAZADA' THEN e.fecha END)::integer,
    count(DISTINCT CASE WHEN e.estado='APROBADA' THEN e.fecha END)::integer
    INTO v_daily_registered,v_daily_approved
  FROM public.turno_jornada_entregas_diarias e
  WHERE e.turno_sesion_id=p_turno_sesion_id
    AND e.fecha BETWEEN v_p.fecha AND coalesce(v_p.fecha_fin,v_p.fecha);
$new$;
    IF strpos(v_def,v_old)=0 THEN
      RAISE EXCEPTION 'Cannot replace daily delivery coverage query in Step 5 checklist.';
    END IF;
    v_def:=replace(v_def,v_old,v_new);

    v_old := $old$
  v_cash_registered:=v_cash_state IS NOT NULL
    AND v_cash_state NOT IN ('RECHAZADA','RECTIFICADA')
    AND EXISTS(
      SELECT 1
      FROM public.turno_eventos e
      WHERE e.turno_sesion_id=p_turno_sesion_id
        AND e.turno_tramo_id=v_cash_tranche_id
        AND e.actor_user_id=v_cash_actor_id
        AND e.tipo IN (
          'DINERO_DECLARADO',
          'DINERO_REDECLARADO',
          'DINERO_DECLARACION_RESPONSABLE_SUSTITUYE_TRANSCRIPCION',
          'DINERO_DECLARACION_RESPONSABLE_RECTIFICA_RECHAZO'
        )
    );
$old$;
    v_new := $new$
  v_cash_registered:=v_daily_expected>0 AND v_daily_registered=v_daily_expected;
  v_cash_declared:=v_cash_registered;
  v_cash_state:=CASE
    WHEN NOT v_cash_registered THEN 'PENDIENTE'
    WHEN v_daily_approved=v_daily_expected THEN 'APROBADA'
    ELSE 'ESPERANDO_APROBACION'
  END;
$new$;
    IF strpos(v_def,v_old)=0 THEN
      RAISE EXCEPTION 'Cannot replace final declaration dependency with per-day cash state.';
    END IF;
    v_def:=replace(v_def,v_old,v_new);

    v_old := $old$
  v_cash_declared:=v_cash_registered
    AND v_daily_expected>0
    AND v_daily_registered=v_daily_expected;
$old$;
    v_new := $new$
  -- The worker completes Step 5 once every date has a recorded amount.
  v_cash_declared:=v_cash_registered;
$new$;
    IF strpos(v_def,v_old)=0 THEN
      RAISE EXCEPTION 'Cannot align Step 5 completion to daily-only records.';
    END IF;
    v_def:=replace(v_def,v_old,v_new);

    v_old := $old$
    WHEN v_cash_state IS DISTINCT FROM 'APROBADA' THEN 'PENDIENTE_CONTEO_DUENO'
$old$;
    v_new := $new$
    WHEN v_cash_state IS DISTINCT FROM 'APROBADA' THEN 'PENDIENTE_APROBACION_ENTREGAS_DIARIAS'
$new$;
    IF strpos(v_def,v_old)=0 THEN
      RAISE EXCEPTION 'Cannot update cash phase label for daily-only Step 5.';
    END IF;
    v_def:=replace(v_def,v_old,v_new);

    EXECUTE v_def;
  END IF;
END;
$patch_cash_per_day_step5$;

-- The cash total used by Jornada liquidation is the sum of approved daily
-- deliveries. The final day is already part of the daily rows, not a second
-- cash declaration/count. Count every date inclusively (start and end).
DO $patch_cash_per_day_liquidation$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure)
    INTO v_def;

  IF strpos(v_def,'BC7_CASH_PER_DAY_LIQUIDATION_V1')=0 THEN
    v_old := $old$
  v_daily_expected:=greatest(0,(coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha)::integer);
$old$;
    v_new := $new$
  v_daily_expected:=greatest(0,(coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha+1)::integer);
$new$;
    IF strpos(v_def,v_old)=0 THEN
      RAISE EXCEPTION 'Cannot make daily cash period coverage inclusive in liquidation.';
    END IF;
    v_def:=replace(v_def,v_old,v_new);

    v_old := $old$
  v_cash_received:=CASE WHEN v_final_counted IS NOT NULL AND v_final_cash_state='APROBADA'
    THEN v_daily_cash+v_final_counted ELSE NULL END;
$old$;
    v_new := $new$
  -- BC7_CASH_PER_DAY_LIQUIDATION_V1
  v_cash_received:=CASE
    WHEN v_daily_expected>0 AND v_daily_pending=0 AND v_daily_missing=0
      THEN v_daily_cash
    ELSE NULL
  END;
$new$;
    IF strpos(v_def,v_old)=0 THEN
      RAISE EXCEPTION 'Cannot remove final declaration/count dependency from cash liquidation.';
    END IF;
    v_def:=replace(v_def,v_old,v_new);

    EXECUTE v_def;
  END IF;
END;
$patch_cash_per_day_liquidation$;

-- Historical transfer attribution is allowed after an automatic/manual
-- operational seal, but never after the master Turn is closed. The existing
-- destination, completed transfer, post-period timestamp, unique link and
-- mandatory reason checks remain in place. This creates no stock movement.
DO $patch_sealed_transfer_attribution$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_vincular_transferencia_jornada(uuid,uuid,text)'::regprocedure)
    INTO v_def;

  IF strpos(v_def,'BC7_TRANSFER_ALLOW_SEALED_JORNADA_V1')=0 THEN
    v_old := $old$
  IF v_s.estado NOT IN ('PROGRAMADA','EN_CURSO','COMPLETADA') THEN
    RAISE EXCEPTION 'La sesión no admite atribuciones históricas en su estado actual.' USING ERRCODE='23514';
  END IF;
$old$;
    v_new := $new$
  -- BC7_TRANSFER_ALLOW_SEALED_JORNADA_V1
  IF v_s.estado NOT IN ('PROGRAMADA','EN_CURSO','COMPLETADA','CERRADA_OPERATIVAMENTE') THEN
    RAISE EXCEPTION 'La sesión no admite atribuciones históricas en su estado actual.' USING ERRCODE='23514';
  END IF;
$new$;
    IF strpos(v_def,v_old)=0 THEN
      RAISE EXCEPTION 'Cannot add sealed Jornada state to historical transfer attribution.';
    END IF;
    v_def:=replace(v_def,v_old,v_new);
    EXECUTE v_def;
  END IF;
END;
$patch_sealed_transfer_attribution$;

COMMIT;
