BEGIN;

ALTER TABLE public.turno_declaraciones
  DROP CONSTRAINT IF EXISTS turno_declaraciones_estado_aprobacion_check;

ALTER TABLE public.turno_declaraciones
  ADD CONSTRAINT turno_declaraciones_estado_aprobacion_check
  CHECK (estado_aprobacion = ANY (ARRAY[
    'PENDIENTE'::text,
    'ESPERANDO_APROBACION'::text,
    'DECLARACION_APROBADA'::text,
    'APROBADA'::text,
    'RECHAZADA'::text,
    'CON_DIFERENCIA'::text,
    'RECTIFICADA'::text
  ]));

CREATE OR REPLACE FUNCTION public.bc7_admin_registrar_entrega_diaria_jornada(
  p_turno_sesion_id uuid,
  p_fecha date,
  p_monto numeric,
  p_observacion text,
  p_idempotency_key uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_t public.turno_tramos;
  v_turno public.turnos;
  v_id uuid;
  v_existing_session uuid;
  v_existing_date date;
  v_existing_amount numeric;
  v_existing_state text;
  v_uid uuid:=auth.uid();
  v_nombre text;
  v_fecha_fin date;
  v_hoy date;
  v_note text:=nullif(left(btrim(coalesce(p_observacion,'')),500),'');
BEGIN
  IF v_uid IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede transcribir entregas diarias de una jornada sellada.'
      USING ERRCODE='42501';
  END IF;
  IF p_turno_sesion_id IS NULL OR p_fecha IS NULL OR p_monto IS NULL
     OR p_monto<0 OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Jornada, fecha, importe no negativo y clave de idempotencia son obligatorios.'
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id AND bloque='JORNADA'
    AND estado='CERRADA_OPERATIVAMENTE'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La transcripción diaria solo está disponible después del sello operativo.'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_turno
  FROM public.turnos
  WHERE id=v_s.turno_id
  FOR SHARE;
  IF NOT FOUND OR v_turno.estado IS DISTINCT FROM 'ABIERTO' THEN
    RAISE EXCEPTION 'El Turno maestro ya no está abierto; no se admiten registros diarios tardíos.'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_p
  FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el período de esta Jornada.'
      USING ERRCODE='23503';
  END IF;

  SELECT * INTO v_t
  FROM public.turno_tramos
  WHERE turno_sesion_id=v_s.id
    AND usuario_id=v_p.responsable_id
    AND estado='COMPLETADO'
    AND fin_at=v_s.corte_operativo_at
  ORDER BY fin_at DESC NULLS LAST,created_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el tramo completado de la responsable para esta Jornada.'
      USING ERRCODE='23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_s.id
      AND a.usuario_id=v_t.usuario_id
      AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'La responsable ya no está asignada a esta Jornada; requiere revisión administrativa.'
      USING ERRCODE='23514';
  END IF;

  v_fecha_fin:=coalesce(v_p.fecha_fin,v_p.fecha);
  v_hoy:=(now() AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'))::date;
  IF p_fecha<v_p.fecha OR p_fecha>v_fecha_fin OR p_fecha>v_hoy THEN
    RAISE EXCEPTION 'La fecha debe pertenecer al período y no puede ser futura.'
      USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.almacenes a
    WHERE a.id=v_s.almacen_id AND a.tipo='minorista'
  ) THEN
    RAISE EXCEPTION 'La transcripción de entregas diarias está habilitada para almacenes minoristas.'
      USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text||':'||p_idempotency_key::text,0));
  SELECT id,turno_sesion_id,fecha,monto_declarado
    INTO v_id,v_existing_session,v_existing_date,v_existing_amount
  FROM public.turno_jornada_entregas_diarias
  WHERE creado_por=v_uid AND idempotency_key=p_idempotency_key
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NOT NULL THEN
    IF v_existing_session IS DISTINCT FROM v_s.id
       OR v_existing_date IS DISTINCT FROM p_fecha
       OR v_existing_amount IS DISTINCT FROM p_monto THEN
      RAISE EXCEPTION 'La clave de idempotencia pertenece a otra entrega diaria.'
        USING ERRCODE='23505';
    END IF;
    RETURN v_id;
  END IF;

  SELECT id,estado,monto_declarado
    INTO v_id,v_existing_state,v_existing_amount
  FROM public.turno_jornada_entregas_diarias
  WHERE turno_sesion_id=v_s.id AND fecha=p_fecha
  LIMIT 1
  FOR UPDATE;

  SELECT nombre INTO v_nombre FROM public.usuarios WHERE id=v_uid;

  IF v_id IS NOT NULL THEN
    IF v_existing_state<>'RECHAZADA' THEN
      RAISE EXCEPTION 'Ya existe una entrega diaria para esta fecha. Consulta su estado antes de reenviar.'
        USING ERRCODE='23505';
    END IF;
    UPDATE public.turno_jornada_entregas_diarias
    SET turno_tramo_id=v_t.id,
        monto_declarado=p_monto,
        monto_aprobado=NULL,
        estado='PENDIENTE',
        observacion=v_note,
        creado_por=v_uid,
        creado_nombre=v_nombre,
        creado_en=now(),
        idempotency_key=p_idempotency_key,
        revisado_por=NULL,
        revisado_nombre=NULL,
        comentario_revision=NULL,
        fecha_revision=NULL
    WHERE id=v_id;

    INSERT INTO public.turno_jornada_eventos
      (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
    VALUES
      (v_s.almacen_id,v_s.jornada_programacion_id,v_uid,'ENTREGA_DIARIA_REENVIADA_ADMIN',
       v_note,
       jsonb_build_object('entrega_id',v_id,'fecha',p_fecha,
         'monto_declarado',v_existing_amount,'estado','RECHAZADA'),
       jsonb_build_object('entrega_id',v_id,'monto_declarado',p_monto,'estado','PENDIENTE'));
    RETURN v_id;
  END IF;

  INSERT INTO public.turno_jornada_entregas_diarias
    (turno_sesion_id,turno_tramo_id,almacen_id,fecha,monto_declarado,observacion,
     creado_por,creado_nombre,idempotency_key)
  VALUES
    (v_s.id,v_t.id,v_s.almacen_id,p_fecha,p_monto,v_note,
     v_uid,v_nombre,p_idempotency_key)
  RETURNING id INTO v_id;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES
    (v_s.almacen_id,v_s.jornada_programacion_id,v_uid,'ENTREGA_DIARIA_TRANSCRITA_ADMIN',
     v_note,
     jsonb_build_object('sesion_id',v_s.id,'tramo_id',v_t.id,'fecha',p_fecha),
     jsonb_build_object('entrega_id',v_id,'monto_declarado',p_monto,'estado','PENDIENTE'));

  INSERT INTO public.turno_eventos
    (turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
  VALUES
    (v_s.turno_id,v_s.id,v_t.id,v_uid,'DINERO_ENTREGA_DIARIA_TRANSCRITA_ADMIN',
     jsonb_build_object('entrega_id',v_id,'fecha',p_fecha,'monto_declarado',p_monto,
       'responsable_id',v_t.usuario_id,'transcrito_por',v_uid,
       'observacion',v_note,'es_declaracion_final',false));

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc5_admin_rectificar_declaracion_a_entrega_diaria(
  p_declaracion_id uuid,
  p_fecha date,
  p_observacion text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_d public.turno_declaraciones;
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_t public.turno_tramos;
  v_turno public.turnos;
  v_entrega_id uuid;
  v_uid uuid:=auth.uid();
  v_nombre text;
  v_note text:=nullif(left(btrim(coalesce(p_observacion,'')),1000),'');
  v_today date;
BEGIN
  IF v_uid IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede rectificar una declaración de efectivo.'
      USING ERRCODE='42501';
  END IF;
  IF p_declaracion_id IS NULL OR p_fecha IS NULL OR v_note IS NULL OR length(v_note)<5 THEN
    RAISE EXCEPTION 'Declaración, fecha y motivo de rectificación (mínimo 5 caracteres) son obligatorios.'
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_d
  FROM public.turno_declaraciones
  WHERE id=p_declaracion_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la declaración que deseas rectificar.'
      USING ERRCODE='23503';
  END IF;
  IF v_d.estado_aprobacion NOT IN ('PENDIENTE','ESPERANDO_APROBACION')
     OR v_d.monto_contado IS NOT NULL THEN
    RAISE EXCEPTION 'Solo se puede rectificar una declaración pendiente que aún no tenga conteo físico.'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=v_d.turno_sesion_id AND bloque='JORNADA'
    AND estado='CERRADA_OPERATIVAMENTE'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La declaración pertenece a una Jornada que no está sellada operativamente.'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_turno
  FROM public.turnos
  WHERE id=v_s.turno_id
  FOR SHARE;
  IF NOT FOUND OR v_turno.estado IS DISTINCT FROM 'ABIERTO' THEN
    RAISE EXCEPTION 'El Turno maestro debe seguir abierto para rectificar datos pendientes.'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_p
  FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la programación de esta Jornada.'
      USING ERRCODE='23503';
  END IF;

  v_today:=(now() AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'))::date;
  IF p_fecha<v_p.fecha OR p_fecha>coalesce(v_p.fecha_fin,v_p.fecha) OR p_fecha>v_today THEN
    RAISE EXCEPTION 'La fecha seleccionada debe pertenecer al período y no puede ser futura.'
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_t
  FROM public.turno_tramos
  WHERE id=v_d.turno_tramo_id
    AND turno_sesion_id=v_s.id
    AND estado='COMPLETADO'
    AND fin_at=v_s.corte_operativo_at
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el tramo completado de la declaración.'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_entregas_diarias
    WHERE turno_sesion_id=v_s.id AND fecha=p_fecha
  ) THEN
    RAISE EXCEPTION 'Ya existe una entrega diaria para esa fecha. Revísala antes de rectificar.'
      USING ERRCODE='23505';
  END IF;

  SELECT nombre INTO v_nombre FROM public.usuarios WHERE id=v_uid;

  INSERT INTO public.turno_jornada_entregas_diarias
    (turno_sesion_id,turno_tramo_id,almacen_id,fecha,monto_declarado,monto_aprobado,
     estado,observacion,creado_por,creado_nombre,idempotency_key)
  VALUES
    (v_s.id,v_t.id,v_s.almacen_id,p_fecha,v_d.monto,NULL,'PENDIENTE',
     'Rectificación de declaración final: '||v_note,v_uid,v_nombre,gen_random_uuid())
  RETURNING id INTO v_entrega_id;

  UPDATE public.turno_declaraciones
  SET estado_aprobacion='RECTIFICADA',
      aprobado_por=NULL,
      aprobado_at=NULL
  WHERE id=v_d.id;

  INSERT INTO public.turno_eventos
    (turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
  VALUES
    (v_s.turno_id,v_s.id,v_t.id,v_uid,'DINERO_DECLARACION_RECTIFICADA_A_ENTREGA_DIARIA',
     jsonb_build_object(
       'declaracion_id',v_d.id,
       'entrega_diaria_id',v_entrega_id,
       'fecha',p_fecha,
       'monto',v_d.monto,
       'estado_anterior',v_d.estado_aprobacion,
       'aprobado_por_anterior',v_d.aprobado_por,
       'aprobado_at_anterior',v_d.aprobado_at,
       'estado_nuevo','RECTIFICADA',
       'rectificado_por',v_uid,
       'motivo',v_note
     ));

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES
    (v_s.almacen_id,v_s.jornada_programacion_id,v_uid,'DECLARACION_DINERO_RECTIFICADA',
     v_note,
     jsonb_build_object('declaracion_id',v_d.id,'monto',v_d.monto,
       'estado',v_d.estado_aprobacion),
     jsonb_build_object('entrega_diaria_id',v_entrega_id,'fecha',p_fecha,
       'monto_declarado',v_d.monto,'estado_declaracion','RECTIFICADA'));

  RETURN jsonb_build_object(
    'declaracion_id',v_d.id,
    'entrega_diaria_id',v_entrega_id,
    'fecha',p_fecha,
    'monto',v_d.monto,
    'estado_declaracion','RECTIFICADA'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc_declarar_dinero(p_turno_tramo_id uuid,p_monto numeric)
RETURNS public.turno_declaraciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  t public.turno_tramos;
  r public.turno_declaraciones;
  v_old_amount numeric;
  v_old_state text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO t FROM public.turno_tramos WHERE id=p_turno_tramo_id FOR UPDATE;
  IF t.id IS NULL OR t.estado NOT IN ('ACTIVO','INTERRUMPIDO','COMPLETADO') THEN
    RAISE EXCEPTION 'Tramo inválido';
  END IF;
  IF t.usuario_id<>auth.uid() THEN
    RAISE EXCEPTION 'Solo el operador del tramo puede declarar';
  END IF;
  IF p_monto IS NULL OR p_monto<0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;

  SELECT * INTO r FROM public.turno_declaraciones WHERE turno_tramo_id=t.id FOR UPDATE;
  IF FOUND THEN
    IF r.estado_aprobacion NOT IN ('RECHAZADA','RECTIFICADA') OR r.monto_contado IS NOT NULL THEN
      RAISE EXCEPTION 'Este tramo ya tiene una declaración que no puede sobrescribirse.';
    END IF;
    v_old_amount:=r.monto;
    v_old_state:=r.estado_aprobacion;
    UPDATE public.turno_declaraciones
    SET monto=p_monto,
        estado_aprobacion='ESPERANDO_APROBACION',
        aprobado_por=NULL,aprobado_at=NULL,
        monto_contado=NULL,contado_por=NULL,contado_at=NULL,
        diferencia=NULL,observacion_conteo=NULL
    WHERE id=r.id
    RETURNING * INTO r;
    INSERT INTO public.turno_eventos
      (turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
    VALUES
      (t.turno_id,t.turno_sesion_id,t.id,auth.uid(),'DINERO_REDECLARADO',
       jsonb_build_object('declaracion_id',r.id,'monto_anterior',v_old_amount,
         'monto_nuevo',p_monto,'estado_anterior',v_old_state));
  ELSE
    INSERT INTO public.turno_declaraciones
      (turno_id,turno_sesion_id,turno_tramo_id,usuario_id,monto)
    VALUES (t.turno_id,t.turno_sesion_id,t.id,t.usuario_id,p_monto)
    RETURNING * INTO r;
    INSERT INTO public.turno_eventos
      (turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
    VALUES
      (t.turno_id,t.turno_sesion_id,t.id,auth.uid(),'DINERO_DECLARADO',
       jsonb_build_object('monto',p_monto));
  END IF;
  RETURN r;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc5_admin_transcribir_declaracion_dinero(
  p_turno_sesion_id uuid,
  p_monto numeric,
  p_observacion text
)
RETURNS public.turno_declaraciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_t public.turno_tramos;
  v_declaration public.turno_declaraciones;
  v_note text:=nullif(left(btrim(coalesce(p_observacion,'')),1000),'');
  v_old_amount numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede transcribir una declaración después del sello operativo.'
      USING ERRCODE='42501';
  END IF;
  IF p_monto IS NULL OR p_monto<0 THEN
    RAISE EXCEPTION 'El importe declarado debe ser un número no negativo.'
      USING ERRCODE='22023';
  END IF;
  IF v_note IS NULL OR length(v_note)<5 THEN
    RAISE EXCEPTION 'Indica la fuente o motivo de la transcripción (mínimo 5 caracteres).'
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id AND bloque='JORNADA'
    AND estado='CERRADA_OPERATIVAMENTE'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo se puede transcribir la declaración de una Jornada sellada operativamente.'
      USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.turnos t WHERE t.id=v_s.turno_id AND t.estado='ABIERTO'
  ) THEN
    RAISE EXCEPTION 'El Turno maestro ya no está abierto; no se admiten transcripciones tardías.'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_t
  FROM public.turno_tramos
  WHERE turno_sesion_id=v_s.id AND estado='COMPLETADO'
  ORDER BY fin_at DESC NULLS LAST,created_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;
  IF v_t.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el tramo responsable de esta Jornada.'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_declaration
  FROM public.turno_declaraciones
  WHERE turno_tramo_id=v_t.id
  FOR UPDATE;

  IF FOUND THEN
    IF v_declaration.estado_aprobacion IS DISTINCT FROM 'RECTIFICADA'
       OR v_declaration.monto_contado IS NOT NULL THEN
      RAISE EXCEPTION 'Este tramo ya tiene una declaración. Solo una declaración rectificada puede transcribirse de nuevo.'
        USING ERRCODE='23505';
    END IF;
    v_old_amount:=v_declaration.monto;
    UPDATE public.turno_declaraciones
    SET monto=p_monto,
        estado_aprobacion='ESPERANDO_APROBACION',
        aprobado_por=NULL,aprobado_at=NULL,
        monto_contado=NULL,contado_por=NULL,contado_at=NULL,
        diferencia=NULL,observacion_conteo=NULL
    WHERE id=v_declaration.id
    RETURNING * INTO v_declaration;
  ELSE
    INSERT INTO public.turno_declaraciones
      (turno_id,turno_sesion_id,turno_tramo_id,usuario_id,monto)
    VALUES
      (v_s.turno_id,v_s.id,v_t.id,v_t.usuario_id,p_monto)
    RETURNING * INTO v_declaration;
  END IF;

  INSERT INTO public.turno_eventos
    (turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
  VALUES
    (v_s.turno_id,v_s.id,v_t.id,auth.uid(),
     CASE WHEN v_old_amount IS NULL
       THEN 'DINERO_DECLARACION_TRANSCRITA_ADMIN'
       ELSE 'DINERO_DECLARACION_RETRANSCRITA_ADMIN'
     END,
     jsonb_build_object(
       'declaracion_id',v_declaration.id,
       'monto_anterior',v_old_amount,
       'monto_declarado',p_monto,
       'responsable_id',v_t.usuario_id,
       'transcrito_por',auth.uid(),
       'fuente_observacion',v_note,
       'es_conteo_fisico',false
     ));

  RETURN v_declaration;
END;
$function$;

DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_obtener_inventario_jornada(uuid)'::regprocedure
  ) INTO v_definition;

  v_old := $old$    'tramo_activo',(
      SELECT jsonb_build_object('id',t.id,'usuario_id',t.usuario_id,'inicio_at',t.inicio_at)
      FROM public.turno_tramos t
      WHERE t.turno_sesion_id=v_s.id AND t.estado='ACTIVO'
      ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST LIMIT 1
    ),
    'declaracion_dinero',($old$;

  v_new := $new$    'tramo_activo',(
      SELECT jsonb_build_object('id',t.id,'usuario_id',t.usuario_id,'inicio_at',t.inicio_at)
      FROM public.turno_tramos t
      WHERE t.turno_sesion_id=v_s.id AND t.estado='ACTIVO'
      ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST LIMIT 1
    ),
    'tramo_registrable',(
      SELECT jsonb_build_object(
        'id',t.id,'usuario_id',t.usuario_id,'inicio_at',t.inicio_at,
        'fin_at',t.fin_at,'estado',t.estado
      )
      FROM public.turno_tramos t
      WHERE t.turno_sesion_id=v_s.id
        AND t.usuario_id=v_p.responsable_id
        AND (
          (v_s.estado='EN_CURSO' AND t.estado='ACTIVO')
          OR (
            v_s.estado='CERRADA_OPERATIVAMENTE'
            AND t.estado='COMPLETADO'
            AND t.fin_at=v_s.corte_operativo_at
            AND EXISTS (
              SELECT 1 FROM public.turnos tm
              WHERE tm.id=v_s.turno_id AND tm.estado='ABIERTO'
            )
          )
        )
      ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST
      LIMIT 1
    ),
    'declaracion_dinero',($new$;

  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'The expected Jornada tranche JSON block was not found exactly once.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$        'estado_aprobacion',d.estado_aprobacion,
        'declarado_at',d.declarado_at,
        'monto_contado',d.monto_contado,$old$;
  v_new := $new$        'estado_aprobacion',d.estado_aprobacion,
        'declarado_at',d.declarado_at,
        'observacion_transcripcion',(
          SELECT e.payload->>'fuente_observacion'
          FROM public.turno_eventos e
          WHERE e.turno_sesion_id=v_s.id
            AND e.turno_tramo_id=d.turno_tramo_id
            AND e.tipo IN ('DINERO_DECLARACION_TRANSCRITA_ADMIN','DINERO_DECLARACION_RETRANSCRITA_ADMIN')
          ORDER BY e.created_at DESC
          LIMIT 1
        ),
        'rectificacion_diaria',(
          SELECT jsonb_build_object(
            'entrega_diaria_id',e.payload->>'entrega_diaria_id',
            'fecha',e.payload->>'fecha',
            'motivo',e.payload->>'motivo'
          )
          FROM public.turno_eventos e
          WHERE e.turno_sesion_id=v_s.id
            AND e.turno_tramo_id=d.turno_tramo_id
            AND e.tipo='DINERO_DECLARACION_RECTIFICADA_A_ENTREGA_DIARIA'
          ORDER BY e.created_at DESC
          LIMIT 1
        ),
        'monto_contado',d.monto_contado,$new$;

  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'The expected cash declaration JSON fields were not found exactly once.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END
$migration$;

REVOKE ALL ON FUNCTION public.bc7_admin_registrar_entrega_diaria_jornada(uuid,date,numeric,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc5_admin_rectificar_declaracion_a_entrega_diaria(uuid,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_admin_registrar_entrega_diaria_jornada(uuid,date,numeric,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc5_admin_rectificar_declaracion_a_entrega_diaria(uuid,date,text) TO authenticated;

COMMENT ON FUNCTION public.bc7_admin_registrar_entrega_diaria_jornada(uuid,date,numeric,text,uuid) IS
  'Owner-only audited backfill of daily cash deliveries for an operationally sealed Jornada while the master turno remains open.';
COMMENT ON FUNCTION public.bc5_admin_rectificar_declaracion_a_entrega_diaria(uuid,date,text) IS
  'Owner-only audited conversion of an uncounted final cash declaration into one dated daily delivery; the original declaration remains as RECTIFICADA evidence.';

COMMIT;
