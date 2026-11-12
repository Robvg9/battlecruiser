BEGIN;

-- Use the Jornada inventory/cash ledger when the Turn is built from Jornada sessions.
-- Legacy Turnos retain their existing turno_entregas_inventario contract unchanged.
CREATE OR REPLACE FUNCTION public.bc_enviar_turno_a_aprobacion(p_turno_id uuid)
RETURNS public.turnos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  total integer;
  completas integer;
  no_resueltas integer;
  entregas_validas integer;
  estado_actual text;
  v_turno public.turnos;
  v_sesion public.turno_sesiones;
  v_liquidacion jsonb;
  v_entregas_finales integer;
  v_entregas_no_resueltas integer;
  r public.turnos;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN autenticado puede enviar un Turno a aprobación.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_turno FROM public.turnos WHERE id=p_turno_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turno no encontrado.' USING ERRCODE='P0002'; END IF;
  estado_actual:=v_turno.estado_maestro;
  IF estado_actual<>'EN_CURSO' THEN
    RAISE EXCEPTION 'El Turno debe estar EN_CURSO para enviarse a aprobación' USING ERRCODE='23514';
  END IF;

  -- Jornada-specific close: every worked session must already be closed and fully
  -- reconciled. The final outgoing handover may remain PENDIENTE_PROGRAMACION so
  -- the next Turn can be created after owner approval and linked cross-Turn.
  IF EXISTS(SELECT 1 FROM public.turno_sesiones s WHERE s.turno_id=p_turno_id AND s.bloque='JORNADA') THEN
    SELECT count(*) INTO total
    FROM public.turno_sesiones WHERE turno_id=p_turno_id;
    SELECT count(*) INTO completas
    FROM public.turno_sesiones WHERE turno_id=p_turno_id AND estado='COMPLETADA';
    SELECT count(*) INTO no_resueltas
    FROM public.turno_sesiones
    WHERE turno_id=p_turno_id AND estado NOT IN ('COMPLETADA','CANCELADA');

    IF total=0 OR completas=0 OR no_resueltas>0 THEN
      RAISE EXCEPTION 'Todas las jornadas trabajadas deben estar completadas y los días no trabajados cancelados antes de enviar el Turno a aprobación.' USING ERRCODE='23514';
    END IF;

    FOR v_sesion IN
      SELECT * FROM public.turno_sesiones
      WHERE turno_id=p_turno_id AND bloque='JORNADA' AND estado='COMPLETADA'
      ORDER BY numero_dia
    LOOP
      v_liquidacion:=public.bc7_liquidacion_inventario_jornada(v_sesion.id);
      IF coalesce((v_liquidacion->>'calculable')::boolean,false) IS NOT TRUE THEN
        RAISE EXCEPTION 'La jornada % todavía no tiene una liquidación completa. Revisa inventario, efectivo, salario y aprobaciones. Detalle: %',
          v_sesion.numero_dia,v_liquidacion USING ERRCODE='23514';
      END IF;
    END LOOP;

    SELECT count(*) INTO v_entregas_finales
    FROM public.turno_sesiones s
    WHERE s.turno_id=p_turno_id AND s.bloque='JORNADA' AND s.estado='COMPLETADA'
      AND NOT EXISTS(
        SELECT 1 FROM public.turno_jornada_inventario_entregas e
        WHERE e.origen_sesion_id=s.id
          AND e.estado IN ('ACEPTADA','PENDIENTE_PROGRAMACION')
      );
    SELECT count(*) INTO v_entregas_no_resueltas
    FROM public.turno_jornada_inventario_entregas e
    JOIN public.turno_sesiones s ON s.id=e.origen_sesion_id
    WHERE s.turno_id=p_turno_id
      AND e.estado NOT IN ('ACEPTADA','PENDIENTE_PROGRAMACION');
    IF v_entregas_finales>0 OR v_entregas_no_resueltas>0 THEN
      RAISE EXCEPTION 'Hay entregas de inventario compartido pendientes de recepción o revisión del Dueño.' USING ERRCODE='23514';
    END IF;

    UPDATE public.turnos
    SET estado_maestro='PENDIENTE_APROBACION',actualizado_en=now()
    WHERE id=p_turno_id RETURNING * INTO r;

    INSERT INTO public.turno_revisiones(turno_id,estado)
    VALUES(p_turno_id,'PENDIENTE')
    ON CONFLICT(turno_id) DO UPDATE
      SET estado='PENDIENTE',revisado_por=NULL,revisado_at=NULL,comentario=NULL;

    INSERT INTO public.turno_eventos(turno_id,actor_user_id,tipo,payload)
    VALUES(p_turno_id,auth.uid(),'TURNO_ENVIADO_APROBACION',
      jsonb_build_object(
        'modelo','JORNADA',
        'sesiones_completadas',completas,
        'sesiones_canceladas',(SELECT count(*) FROM public.turno_sesiones WHERE turno_id=p_turno_id AND estado='CANCELADA'),
        'sesiones_totales',total,
        'liquidacion_validada',true,
        'entrega_final_pendiente_programacion',(SELECT count(*) FROM public.turno_jornada_inventario_entregas e
          JOIN public.turno_sesiones s ON s.id=e.origen_sesion_id
          WHERE s.turno_id=p_turno_id AND e.estado='PENDIENTE_PROGRAMACION')
      ));
    RETURN r;
  END IF;

  -- Original legacy Turno flow.
  SELECT count(*) INTO total
  FROM public.turno_sesiones WHERE turno_id=p_turno_id;
  SELECT count(*) INTO completas
  FROM public.turno_sesiones WHERE turno_id=p_turno_id AND estado='COMPLETADA';
  SELECT count(*) INTO no_resueltas
  FROM public.turno_sesiones
  WHERE turno_id=p_turno_id AND estado NOT IN ('COMPLETADA','CANCELADA');

  IF total=0 OR completas=0 OR no_resueltas>0 THEN
    RAISE EXCEPTION 'Todas las jornadas trabajadas deben estar completadas y los bloques no trabajados cancelados antes de enviar el Turno a aprobación';
  END IF;

  SELECT count(*) INTO entregas_validas
  FROM public.turno_entregas_inventario
  WHERE turno_id=p_turno_id AND estado IN ('RECIBIDO','CON_DIFERENCIAS');
  IF entregas_validas=0 THEN
    RAISE EXCEPTION 'El inventario debe haber sido entregado y recibido antes de enviar el Turno a aprobación';
  END IF;

  UPDATE public.turnos
  SET estado_maestro='PENDIENTE_APROBACION'
  WHERE id=p_turno_id
  RETURNING * INTO r;

  INSERT INTO public.turno_revisiones(turno_id,estado)
  VALUES(p_turno_id,'PENDIENTE')
  ON CONFLICT(turno_id) DO UPDATE
    SET estado='PENDIENTE',revisado_por=NULL,revisado_at=NULL;

  INSERT INTO public.turno_eventos(turno_id,actor_user_id,tipo,payload)
  VALUES(
    p_turno_id,auth.uid(),'TURNO_ENVIADO_APROBACION',
    jsonb_build_object(
      'sesiones_completadas',completas,
      'sesiones_canceladas',(SELECT count(*) FROM public.turno_sesiones WHERE turno_id=p_turno_id AND estado='CANCELADA'),
      'sesiones_totales',total
    )
  );
  RETURN r;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc_enviar_turno_a_aprobacion(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc_enviar_turno_a_aprobacion(uuid) TO authenticated;

COMMIT;
