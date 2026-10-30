-- Paso 4 — B7: cada RPC respeta el permiso específico de su módulo.
-- Additive and data-preserving. Existing grants are intentionally unchanged:
-- CREATE OR REPLACE retains existing EXECUTE grants.
-- calcular_dinero_esperado_turno is intentionally not redefined here; its
-- ownership/turno scope is hardened by 20260904000100_harden_legacy_read_rpcs.

CREATE OR REPLACE FUNCTION public.crear_responsabilidad(
  p_titulo text,
  p_descripcion text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL,
  p_fecha_limite timestamptz DEFAULT NULL,
  p_prioridad text DEFAULT 'normal',
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_nombre text;
  v_id uuid;
BEGIN
  v_uid := public._validar_usuario_operacion('responsabilidades', 'crear');
  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id = v_uid;
  IF p_titulo IS NULL OR btrim(p_titulo) = '' THEN
    RAISE EXCEPTION 'El título es obligatorio.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.responsabilidades (titulo, descripcion, usuario_id, turno_id,
    fecha_limite, prioridad, creador_id, creador_nombre, estado)
  VALUES (p_titulo, p_descripcion, p_usuario_id, p_turno_id, p_fecha_limite,
    p_prioridad, v_uid, v_nombre, 'PENDIENTE')
  RETURNING id INTO v_id;
  PERFORM public.registrar_auditoria('responsabilidad', 'Responsabilidad creada: ' || p_titulo,
    'exito', v_id::text, p_idempotency_key, NULL);
  RETURN jsonb_build_object('id', v_id, 'estado', 'PENDIENTE');
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_responsabilidad(
  p_responsabilidad_id uuid,
  p_estado text,
  p_observacion_final text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_resp record;
  v_es_admin boolean;
BEGIN
  IF p_estado IS NULL OR p_estado NOT IN ('PENDIENTE','EN_PROGRESO','COMPLETADA','CANCELADA') THEN
    RAISE EXCEPTION 'Estado de responsabilidad no válido.' USING ERRCODE = 'P0001';
  END IF;
  IF p_estado = 'CANCELADA' THEN
    v_uid := public._validar_usuario_operacion('responsabilidades', 'editar_any');
  ELSE
    v_uid := public._validar_usuario_operacion('responsabilidades', 'editar');
  END IF;
  SELECT * INTO v_resp FROM public.responsabilidades WHERE id = p_responsabilidad_id;
  IF v_resp.id IS NULL THEN
    RAISE EXCEPTION 'La responsabilidad no existe.' USING ERRCODE = 'P0001';
  END IF;
  v_es_admin := public.tiene_permiso('responsabilidades', 'editar_any');
  IF v_resp.usuario_id <> v_uid AND v_resp.creador_id <> v_uid AND NOT v_es_admin THEN
    RAISE EXCEPTION 'No podés actualizar una responsabilidad que no es tuya.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.responsabilidades SET estado = p_estado,
    observacion_final = COALESCE(p_observacion_final, observacion_final),
    completada_en = CASE WHEN p_estado = 'COMPLETADA' THEN now() ELSE completada_en END,
    actualizado_en = now()
    WHERE id = p_responsabilidad_id;

  PERFORM public.registrar_auditoria('responsabilidad',
    'Responsabilidad ' || p_estado || ': ' || v_resp.titulo,
    'exito', p_responsabilidad_id::text, p_idempotency_key, NULL);
  RETURN jsonb_build_object('id', p_responsabilidad_id, 'estado', p_estado);
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_incidencia(
  p_tipo text,
  p_descripcion text,
  p_turno_id uuid DEFAULT NULL,
  p_cuadre_id uuid DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_nombre text;
  v_id uuid;
BEGIN
  v_uid := public._validar_usuario_operacion('incidencias', 'crear');
  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id = v_uid;
  IF p_descripcion IS NULL OR btrim(p_descripcion) = '' THEN
    RAISE EXCEPTION 'La descripción es obligatoria.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.incidencias (tipo, descripcion, usuario_id, usuario_nombre,
    turno_id, cuadre_id, estado)
  VALUES (p_tipo, p_descripcion, v_uid, v_nombre, p_turno_id, p_cuadre_id, 'ABIERTA')
  RETURNING id INTO v_id;
  PERFORM public.registrar_auditoria('incidencia', 'Incidencia (' || p_tipo || '): ' || p_descripcion,
    'exito', v_id::text, p_idempotency_key, NULL);
  RETURN jsonb_build_object('id', v_id, 'estado', 'ABIERTA');
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_incidencia(
  p_incidencia_id uuid,
  p_resolucion text,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_nombre text;
  v_inc record;
BEGIN
  v_uid := public._validar_usuario_operacion('incidencias', 'editar_any');
  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id = v_uid;
  SELECT * INTO v_inc FROM public.incidencias WHERE id = p_incidencia_id;
  IF v_inc.id IS NULL THEN
    RAISE EXCEPTION 'La incidencia no existe.' USING ERRCODE = 'P0001';
  END IF;
  IF p_resolucion IS NULL OR btrim(p_resolucion) = '' THEN
    RAISE EXCEPTION 'La resolución es obligatoria.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.incidencias SET estado = 'RESUELTA', resolucion = p_resolucion,
    resuelta_por = v_uid, resuelta_nombre = v_nombre, fecha_resolucion = now(),
    actualizado_en = now()
    WHERE id = p_incidencia_id;
  PERFORM public.registrar_auditoria('incidencia', 'Incidencia resuelta: ' || v_inc.tipo,
    'exito', p_incidencia_id::text, p_idempotency_key, NULL);
  RETURN jsonb_build_object('id', p_incidencia_id, 'estado', 'RESUELTA');
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_turnos(
  p_usuario_id uuid DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL,
  p_limite int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, usuario_nombre text, almacen_id uuid, fecha date,
  apertura_real timestamptz, cierre_real timestamptz, estado text, observacion text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_es_admin boolean;
BEGIN
  v_uid := public._validar_usuario_operacion('turnos', 'ver');
  v_es_admin := public.tiene_permiso('turnos', 'editar_any');
  IF p_limite IS NULL OR p_limite > 200 THEN p_limite := 50; END IF;
  IF p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;
  RETURN QUERY
    SELECT t.id, t.usuario_nombre, t.almacen_id, t.fecha, t.apertura_real,
      t.cierre_real, t.estado, t.observacion
    FROM public.turnos t
    WHERE ((NOT v_es_admin AND t.usuario_id = v_uid) OR v_es_admin)
      AND (p_usuario_id IS NULL OR t.usuario_id = p_usuario_id)
      AND (p_estado IS NULL OR p_estado = '' OR t.estado = p_estado)
      AND (p_almacen_id IS NULL OR t.almacen_id = p_almacen_id)
    ORDER BY t.fecha DESC, t.apertura_real DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_cuadres(
  p_estado text DEFAULT NULL,
  p_limite int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, turno_id uuid, dinero_esperado numeric, dinero_declarado numeric,
  diferencia numeric, estado text, observacion text, revisado_nombre text,
  comentario_revision text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_es_admin boolean;
BEGIN
  v_uid := public._validar_usuario_operacion('turnos', 'ver');
  v_es_admin := public.tiene_permiso('turnos', 'editar_any');
  IF p_limite IS NULL OR p_limite > 200 THEN p_limite := 50; END IF;
  IF p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;
  RETURN QUERY
    SELECT c.id, c.turno_id, c.dinero_esperado, c.dinero_declarado, c.diferencia,
      c.estado, c.observacion, c.revisado_nombre, c.comentario_revision
    FROM public.cuadres c
    JOIN public.turnos t ON t.id = c.turno_id
    WHERE (v_es_admin OR t.usuario_id = v_uid)
      AND (p_estado IS NULL OR p_estado = '' OR c.estado = p_estado)
    ORDER BY c.creado_en DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_responsabilidades(
  p_usuario_id uuid DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_limite int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, titulo text, descripcion text, usuario_id uuid, turno_id uuid,
  fecha_limite timestamptz, estado text, prioridad text, creador_nombre text,
  completada_en timestamptz, observacion_final text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_es_admin boolean;
BEGIN
  v_uid := public._validar_usuario_operacion('responsabilidades', 'ver');
  v_es_admin := public.tiene_permiso('responsabilidades', 'editar_any');
  IF p_limite IS NULL OR p_limite > 200 THEN p_limite := 50; END IF;
  IF p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;
  RETURN QUERY
    SELECT r.id, r.titulo, r.descripcion, r.usuario_id, r.turno_id, r.fecha_limite,
      r.estado, r.prioridad, r.creador_nombre, r.completada_en, r.observacion_final
    FROM public.responsabilidades r
    WHERE (v_es_admin OR r.usuario_id = v_uid OR r.creador_id = v_uid)
      AND (p_usuario_id IS NULL OR r.usuario_id = p_usuario_id)
      AND (p_turno_id IS NULL OR r.turno_id = p_turno_id)
      AND (p_estado IS NULL OR p_estado = '' OR r.estado = p_estado)
    ORDER BY r.creado_en DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_incidencias(
  p_estado text DEFAULT NULL,
  p_tipo text DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL,
  p_limite int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, tipo text, descripcion text, usuario_nombre text, turno_id uuid,
  cuadre_id uuid, estado text, resolucion text, resuelta_nombre text,
  fecha_resolucion timestamptz, creado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_es_admin boolean;
BEGIN
  v_uid := public._validar_usuario_operacion('incidencias', 'ver');
  v_es_admin := public.tiene_permiso('incidencias', 'editar_any');
  IF p_limite IS NULL OR p_limite > 200 THEN p_limite := 50; END IF;
  IF p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;
  RETURN QUERY
    SELECT i.id, i.tipo, i.descripcion, i.usuario_nombre, i.turno_id, i.cuadre_id,
      i.estado, i.resolucion, i.resuelta_nombre, i.fecha_resolucion, i.creado_en
    FROM public.incidencias i
    WHERE (v_es_admin OR i.usuario_id = v_uid)
      AND (p_estado IS NULL OR p_estado = '' OR i.estado = p_estado)
      AND (p_tipo IS NULL OR p_tipo = '' OR i.tipo = p_tipo)
      AND (p_turno_id IS NULL OR p_turno_id = i.turno_id)
    ORDER BY i.creado_en DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.turno_actual_usuario()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_turno record;
  v_cuadre jsonb;
BEGIN
  v_uid := public._validar_usuario_operacion('turnos', 'ver');
  SELECT * INTO v_turno FROM public.turnos
    WHERE usuario_id = v_uid AND estado = 'ABIERTO' LIMIT 1;
  IF v_turno.id IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object('id', c.id, 'estado', c.estado, 'dinero_esperado', c.dinero_esperado,
    'dinero_declarado', c.dinero_declarado, 'diferencia', c.diferencia) INTO v_cuadre
    FROM public.cuadres c WHERE c.turno_id = v_turno.id LIMIT 1;
  RETURN jsonb_build_object(
    'id', v_turno.id, 'estado', v_turno.estado, 'almacen_id', v_turno.almacen_id,
    'apertura_real', v_turno.apertura_real, 'fecha', v_turno.fecha,
    'usuario_nombre', v_turno.usuario_nombre, 'cuadre', v_cuadre
  );
END;
$$;

COMMENT ON FUNCTION public.crear_responsabilidad(text,text,uuid,uuid,timestamptz,text,uuid)
IS 'Step 4 security fix: requires responsabilidades.crear.';
COMMENT ON FUNCTION public.actualizar_responsabilidad(uuid,text,text,uuid)
IS 'Step 4 security fix: requires responsabilidades.editar or editar_any for cancellation.';
COMMENT ON FUNCTION public.crear_incidencia(text,text,uuid,uuid,uuid)
IS 'Step 4 security fix: requires incidencias.crear.';
COMMENT ON FUNCTION public.resolver_incidencia(uuid,text,uuid)
IS 'Step 4 security fix: requires incidencias.editar_any.';
