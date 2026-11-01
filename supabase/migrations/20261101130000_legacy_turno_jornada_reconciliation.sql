-- Reconcile old split-session turn records without deleting audit history.
BEGIN;

CREATE OR REPLACE FUNCTION public.bc5_cancelar_sesion_programada(
  p_turno_sesion_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_sesion public.turno_sesiones;
  v_motivo text;
  v_asignaciones_retiradas integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN autenticado puede cancelar un bloque no trabajado.'
      USING ERRCODE='42501';
  END IF;

  v_motivo := nullif(left(btrim(coalesce(p_motivo,'')),1000),'');
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'La cancelación requiere un motivo auditable.'
      USING ERRCODE='22023';
  END IF;

  SELECT s.* INTO v_sesion
  FROM public.turno_sesiones s
  JOIN public.turnos t ON t.id=s.turno_id
  WHERE s.id=p_turno_sesion_id
    AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
  FOR UPDATE OF s,t;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró una sesión de un Turno operativo.'
      USING ERRCODE='23503';
  END IF;

  IF v_sesion.estado='CANCELADA' THEN
    RETURN jsonb_build_object(
      'id',v_sesion.id,'estado','CANCELADA','bloque',v_sesion.bloque,
      'fecha',v_sesion.fecha,'idempotente',true
    );
  END IF;

  IF v_sesion.bloque NOT IN ('MANANA','TARDE')
     OR v_sesion.estado NOT IN ('PENDIENTE','PROGRAMADA') THEN
    RAISE EXCEPTION 'Solo puede cancelarse un bloque legacy Mañana/Tarde que siga programado y no iniciado.'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (SELECT 1 FROM public.turno_tramos x WHERE x.turno_sesion_id=v_sesion.id)
     OR EXISTS (SELECT 1 FROM public.turno_declaraciones x WHERE x.turno_sesion_id=v_sesion.id)
     OR EXISTS (SELECT 1 FROM public.turno_jornada_inventario_cortes x WHERE x.turno_sesion_id=v_sesion.id)
     OR EXISTS (SELECT 1 FROM public.gastos x WHERE x.turno_sesion_id=v_sesion.id)
     OR EXISTS (SELECT 1 FROM public.reinversiones x WHERE x.turno_sesion_id=v_sesion.id)
     OR EXISTS (SELECT 1 FROM public.mermas x WHERE x.turno_sesion_id=v_sesion.id)
     OR EXISTS (SELECT 1 FROM public.bajas x WHERE x.turno_sesion_id=v_sesion.id)
     OR EXISTS (
       SELECT 1 FROM public.turno_eventos x
       WHERE x.turno_sesion_id=v_sesion.id
         AND x.tipo IN (
           'SESION_INICIADA','JORNADA_INICIADA','JORNADA_INICIADA_CON_EXCEPCION',
           'DINERO_DECLARADO','DINERO_CONTADO_POR_ADMIN','SESION_CERRADA',
           'JORNADA_CERRADA','JORNADA_CERRADA_CON_EXCEPCION'
         )
     ) THEN
    RAISE EXCEPTION 'La sesión ya tiene actividad, dinero o inventario registrado; no puede cancelarse como no trabajada.'
      USING ERRCODE='23514';
  END IF;

  UPDATE public.turno_asignaciones
  SET retirado_at=now(),
      motivo=coalesce(nullif(btrim(motivo),''),v_motivo)
  WHERE turno_sesion_id=v_sesion.id AND retirado_at IS NULL;
  GET DIAGNOSTICS v_asignaciones_retiradas=ROW_COUNT;

  UPDATE public.turno_sesiones
  SET estado='CANCELADA',updated_at=now()
  WHERE id=v_sesion.id
  RETURNING * INTO v_sesion;

  INSERT INTO public.turno_eventos(
    turno_id,turno_sesion_id,actor_user_id,tipo,payload
  ) VALUES (
    v_sesion.turno_id,v_sesion.id,auth.uid(),'SESION_PROGRAMADA_CANCELADA_ADMIN',
    jsonb_build_object(
      'fecha',v_sesion.fecha,'numero_dia',v_sesion.numero_dia,
      'bloque_legacy',v_sesion.bloque,'motivo',v_motivo,
      'asignaciones_retiradas',v_asignaciones_retiradas,
      'historial_preservado',true
    )
  );

  RETURN jsonb_build_object(
    'id',v_sesion.id,'estado',v_sesion.estado,'bloque',v_sesion.bloque,
    'fecha',v_sesion.fecha,'asignaciones_retiradas',v_asignaciones_retiradas,
    'idempotente',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bc5_cancelar_sesion_programada(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc5_cancelar_sesion_programada(uuid,text) TO authenticated;

-- A turn is ready for owner review when every worked session is completed and
-- every unworked legacy placeholder is explicitly cancelled. Inventory handoff
-- remains mandatory; cancelled blocks never require a fictional cash declaration.
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
  r public.turnos;
BEGIN
  IF NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede enviar un Turno a aprobación';
  END IF;

  SELECT estado_maestro INTO estado_actual
  FROM public.turnos WHERE id=p_turno_id FOR UPDATE;
  IF estado_actual IS NULL THEN
    RAISE EXCEPTION 'Turno no encontrado';
  END IF;
  IF estado_actual <> 'EN_CURSO' THEN
    RAISE EXCEPTION 'El Turno debe estar EN_CURSO para enviarse a aprobación';
  END IF;

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

COMMIT;
