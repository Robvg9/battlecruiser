-- ============================================================
-- M26.12-BE.2 — Fix ambigüedad "nombre" / columnas en B8 Comunicación
-- ============================================================
-- CAUSA RAÍZ (mismo patrón que M14b turnos):
--   Esta base tiene plpgsql.variable_conflict = 'error'.
--   Si una función RETURNS TABLE declara columnas de salida llamadas
--   "nombre", "id", "estado", "tipo", etc., cualquier referencia
--   NO cualificada a esas columnas choca con la variable de salida
--   y produce:
--     ERROR 42702: column reference "nombre" is ambiguous
--
--   Además, DECLARE nombre + SELECT nombre INTO nombre FROM usuarios
--   produce el mismo error (documentado en m14b_fix_variable_conflict_nombre_turnos.sql).
--
-- EVIDENCIA DE FLUJO:
--   PRIVADA y GENERAL fallan al ABRIR → ambos pasan por crear_conversacion.
--   listar_usuarios_para_chat ya se intentó corregir; el error persiste
--   al crear/abrir → la función que aún falla en producción es
--   principalmente crear_conversacion (y en cadena enviar_mensaje /
--   listar_* si quedaron versiones viejas).
--
-- DRIFT:
--   supabase/b8-comunicacion.sql en GitHub YA usa v_nombre y u.nombre
--   en varios sitios, pero PRODUCCIÓN puede tener cuerpos antiguos.
--   Esta migración reaplica CREATE OR REPLACE de TODAS las RPC B8
--   con cualificación explícita y #variable_conflict use_column
--   en las que tienen RETURNS TABLE.
--
-- NO modifica tablas. NO modifica RLS. NO crea RPC nuevos.
-- Idempotente. Ejecutar en SQL Editor de Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1) listar_usuarios_para_chat
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_usuarios_para_chat()
RETURNS TABLE (
  id uuid,
  nombre text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT public.tiene_permiso('comunicacion', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver usuarios.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT u.id, u.nombre
    FROM public.usuarios AS u
    WHERE u.activo = true
      AND u.id <> auth.uid()
    ORDER BY u.nombre ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.listar_usuarios_para_chat() TO anon, authenticated;

-- ------------------------------------------------------------
-- 2) crear_conversacion  (punto de fallo PRIVADA + GENERAL)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_conversacion(
  p_tipo text,
  p_titulo text DEFAULT NULL,
  p_participante_id uuid DEFAULT NULL,
  p_incidencia_id uuid DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL,
  p_responsabilidad_id uuid DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid;
  v_nombre text;
  v_conv_id uuid;
  v_existente uuid;
BEGIN
  v_uid := public._validar_usuario_operacion('comunicacion', 'crear');

  -- Siempre cualificado: evita colisión con cualquier OUT/variable "nombre"
  SELECT u.nombre
    INTO v_nombre
  FROM public.usuarios AS u
  WHERE u.id = v_uid;

  IF p_tipo NOT IN ('GENERAL','PRIVADA','SOPORTE','INCIDENCIA','TURNO','RESPONSABILIDAD') THEN
    RAISE EXCEPTION 'Tipo de conversación inválido.' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotencia contextual
  IF p_tipo IN ('INCIDENCIA','TURNO','RESPONSABILIDAD') THEN
    SELECT c.id
      INTO v_existente
    FROM public.conversaciones AS c
    WHERE c.tipo = p_tipo
      AND (
        (p_tipo = 'INCIDENCIA' AND c.incidencia_id = p_incidencia_id)
        OR (p_tipo = 'TURNO' AND c.turno_id = p_turno_id)
        OR (p_tipo = 'RESPONSABILIDAD' AND c.responsabilidad_id = p_responsabilidad_id)
      )
      AND c.estado = 'ACTIVA'
    LIMIT 1;

    IF v_existente IS NOT NULL THEN
      INSERT INTO public.participantes_conversacion (conversacion_id, usuario_id, rol)
      VALUES (v_existente, v_uid, 'participante')
      ON CONFLICT (conversacion_id, usuario_id) DO NOTHING;
      RETURN jsonb_build_object('id', v_existente, 'estado', 'ACTIVA', 'nota', 'Conversación existente.');
    END IF;
  END IF;

  -- GENERAL: reutilizar si ya existe (no duplicar)
  IF p_tipo = 'GENERAL' THEN
    SELECT c.id
      INTO v_existente
    FROM public.conversaciones AS c
    WHERE c.tipo = 'GENERAL'
    LIMIT 1;

    IF v_existente IS NOT NULL THEN
      INSERT INTO public.participantes_conversacion (conversacion_id, usuario_id, rol)
      VALUES (v_existente, v_uid, 'participante')
      ON CONFLICT (conversacion_id, usuario_id) DO NOTHING;
      RETURN jsonb_build_object('id', v_existente, 'estado', 'ACTIVA');
    END IF;
  END IF;

  INSERT INTO public.conversaciones (
    tipo, titulo, creador_id, creador_nombre,
    incidencia_id, turno_id, responsabilidad_id, estado
  )
  VALUES (
    p_tipo, p_titulo, v_uid, v_nombre,
    p_incidencia_id, p_turno_id, p_responsabilidad_id, 'ACTIVA'
  )
  RETURNING conversaciones.id INTO v_conv_id;

  INSERT INTO public.participantes_conversacion (conversacion_id, usuario_id, rol)
  VALUES (
    v_conv_id,
    v_uid,
    CASE WHEN p_tipo IN ('SOPORTE','GENERAL') THEN 'admin' ELSE 'participante' END
  );

  IF p_tipo = 'PRIVADA' AND p_participante_id IS NOT NULL THEN
    INSERT INTO public.participantes_conversacion (conversacion_id, usuario_id, rol)
    VALUES (v_conv_id, p_participante_id, 'participante')
    ON CONFLICT (conversacion_id, usuario_id) DO NOTHING;
  END IF;

  PERFORM public.registrar_auditoria(
    'comunicacion',
    'Conversación creada (' || p_tipo || ')',
    'exito',
    v_conv_id::text,
    p_idempotency_key,
    NULL
  );

  RETURN jsonb_build_object('id', v_conv_id, 'estado', 'ACTIVA');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.crear_conversacion(text, text, uuid, uuid, uuid, uuid, uuid) TO anon, authenticated;

-- ------------------------------------------------------------
-- 3) listar_conversaciones_usuario
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_conversaciones_usuario(
  p_solo_activas boolean DEFAULT true,
  p_limite int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  tipo text,
  titulo text,
  estado text,
  ultimo_mensaje text,
  ultimo_autor text,
  ultimo_fecha timestamptz,
  no_leidos int,
  es_general boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.tiene_permiso('comunicacion', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver comunicación.' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite > 200 THEN p_limite := 50; END IF;
  IF p_limite < 1 THEN p_limite := 50; END IF;

  RETURN QUERY
    SELECT
      c.id,
      c.tipo,
      c.titulo,
      c.estado,
      (SELECT m.contenido
         FROM public.mensajes AS m
        WHERE m.conversacion_id = c.id
        ORDER BY m.creado_en DESC
        LIMIT 1) AS ultimo_mensaje,
      (SELECT m.usuario_nombre
         FROM public.mensajes AS m
        WHERE m.conversacion_id = c.id
        ORDER BY m.creado_en DESC
        LIMIT 1) AS ultimo_autor,
      (SELECT m.creado_en
         FROM public.mensajes AS m
        WHERE m.conversacion_id = c.id
        ORDER BY m.creado_en DESC
        LIMIT 1) AS ultimo_fecha,
      COALESCE((
        SELECT count(*)::int
          FROM public.mensajes AS m
         WHERE m.conversacion_id = c.id
           AND m.usuario_id <> v_uid
           AND m.creado_en > COALESCE(
             (SELECT pc.ultimo_leido_en
                FROM public.participantes_conversacion AS pc
               WHERE pc.conversacion_id = c.id
                 AND pc.usuario_id = v_uid),
             '1970-01-01'::timestamptz)
      ), 0) AS no_leidos,
      (c.tipo = 'GENERAL') AS es_general
    FROM public.conversaciones AS c
    WHERE (
      (c.tipo = 'GENERAL')
      OR EXISTS (
        SELECT 1
          FROM public.participantes_conversacion AS pc
         WHERE pc.conversacion_id = c.id
           AND pc.usuario_id = v_uid
      )
    )
    AND (NOT p_solo_activas OR c.estado = 'ACTIVA')
    ORDER BY (c.tipo = 'GENERAL') DESC,
             (SELECT m2.creado_en
                FROM public.mensajes AS m2
               WHERE m2.conversacion_id = c.id
               ORDER BY m2.creado_en DESC
               LIMIT 1) DESC NULLS LAST
    LIMIT p_limite;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.listar_conversaciones_usuario(boolean, int) TO anon, authenticated;

-- ------------------------------------------------------------
-- 4) listar_mensajes_conversacion
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_mensajes_conversacion(
  p_conversacion_id uuid,
  p_limite int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  usuario_id uuid,
  usuario_nombre text,
  contenido text,
  estado text,
  creado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE = '42501';
  END IF;
  IF NOT public._es_participante(p_conversacion_id, v_uid) THEN
    RAISE EXCEPTION 'No tenés acceso a esta conversación.' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite > 500 THEN p_limite := 100; END IF;
  IF p_limite < 1 THEN p_limite := 100; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
    SELECT m.id, m.usuario_id, m.usuario_nombre, m.contenido, m.estado, m.creado_en
    FROM public.mensajes AS m
    WHERE m.conversacion_id = p_conversacion_id
    ORDER BY m.creado_en ASC
    LIMIT p_limite OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.listar_mensajes_conversacion(uuid, int, int) TO anon, authenticated;

-- ------------------------------------------------------------
-- 5) enviar_mensaje
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enviar_mensaje(
  p_conversacion_id uuid,
  p_contenido text,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid;
  v_nombre text;
  v_msg_id uuid;
  v_existente uuid;
  v_estado_conv text;
BEGIN
  v_uid := public._validar_usuario_operacion('comunicacion', 'crear');

  SELECT u.nombre
    INTO v_nombre
  FROM public.usuarios AS u
  WHERE u.id = v_uid;

  SELECT c.estado
    INTO v_estado_conv
  FROM public.conversaciones AS c
  WHERE c.id = p_conversacion_id;

  IF v_estado_conv IS NULL THEN
    RAISE EXCEPTION 'La conversación no existe.' USING ERRCODE = 'P0001';
  END IF;
  IF v_estado_conv = 'CERRADA' THEN
    RAISE EXCEPTION 'La conversación está cerrada.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public._es_participante(p_conversacion_id, v_uid) THEN
    RAISE EXCEPTION 'No tenés acceso a esta conversación.' USING ERRCODE = '42501';
  END IF;

  IF p_contenido IS NULL OR btrim(p_contenido) = '' THEN
    RAISE EXCEPTION 'El mensaje no puede estar vacío.' USING ERRCODE = 'P0001';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT m.id
      INTO v_existente
    FROM public.mensajes AS m
    WHERE m.idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existente IS NOT NULL THEN
      RETURN jsonb_build_object('id', v_existente, 'estado', 'ENVIADO', 'nota', 'Mensaje ya enviado.');
    END IF;
  END IF;

  INSERT INTO public.mensajes (
    conversacion_id, usuario_id, usuario_nombre, contenido, estado, idempotency_key
  )
  VALUES (
    p_conversacion_id, v_uid, v_nombre, p_contenido, 'ENVIADO', p_idempotency_key
  )
  RETURNING mensajes.id INTO v_msg_id;

  UPDATE public.conversaciones AS c
     SET actualizado_en = now()
   WHERE c.id = p_conversacion_id;

  PERFORM public.registrar_auditoria(
    'comunicacion',
    'Mensaje enviado en conversación ' || p_conversacion_id,
    'exito',
    v_msg_id::text,
    p_idempotency_key,
    NULL
  );

  RETURN jsonb_build_object('id', v_msg_id, 'estado', 'ENVIADO');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.enviar_mensaje(uuid, text, uuid) TO anon, authenticated;

-- ------------------------------------------------------------
-- 6) Helper _es_participante (cualificación explícita)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._es_participante(p_conversacion_id uuid, p_usuario_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_tipo text;
  v_es_part boolean;
BEGIN
  SELECT c.tipo
    INTO v_tipo
  FROM public.conversaciones AS c
  WHERE c.id = p_conversacion_id;

  IF v_tipo IS NULL THEN
    RETURN false;
  END IF;

  IF v_tipo = 'GENERAL' THEN
    RETURN public.tiene_permiso('comunicacion', 'ver');
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.participantes_conversacion AS pc
     WHERE pc.conversacion_id = p_conversacion_id
       AND pc.usuario_id = p_usuario_id
  ) INTO v_es_part;

  RETURN COALESCE(v_es_part, false);
END;
$function$;

-- ------------------------------------------------------------
-- 7) cerrar_conversacion (mismo patrón nombre)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_conversacion(p_conversacion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid;
  v_nombre text;
BEGIN
  v_uid := public._validar_usuario_operacion('comunicacion', 'crear');

  SELECT u.nombre
    INTO v_nombre
  FROM public.usuarios AS u
  WHERE u.id = v_uid;

  IF NOT EXISTS (
    SELECT 1
      FROM public.participantes_conversacion AS pc
      JOIN public.conversaciones AS c ON c.id = pc.conversacion_id
     WHERE pc.conversacion_id = p_conversacion_id
       AND pc.usuario_id = v_uid
       AND (pc.rol = 'admin' OR c.creador_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'No tenés permiso para cerrar esta conversación.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.conversaciones AS c
     SET estado = 'CERRADA',
         actualizado_en = now()
   WHERE c.id = p_conversacion_id;

  PERFORM public.registrar_auditoria(
    'comunicacion',
    'Conversación cerrada por ' || COALESCE(v_nombre, v_uid::text),
    'exito',
    p_conversacion_id::text,
    NULL,
    NULL
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cerrar_conversacion(uuid) TO anon, authenticated;

-- ------------------------------------------------------------
-- 8) registrar_auditoria (por si producción tiene SELECT nombre sin alias)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_auditoria(
  p_tipo text,
  p_descripcion text,
  p_estado text DEFAULT 'exito',
  p_entidad_id text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_payload_resumen jsonb DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_id bigint;
  v_usuario_id uuid := auth.uid();
  v_usuario_nombre text;
BEGIN
  SELECT u.nombre
    INTO v_usuario_nombre
  FROM public.usuarios AS u
  WHERE u.id = v_usuario_id;

  INSERT INTO public.auditoria_operaciones
    (usuario_id, usuario_nombre, tipo, descripcion, estado, entidad_id, idempotency_key, payload_resumen)
  VALUES
    (v_usuario_id, v_usuario_nombre, p_tipo, p_descripcion, p_estado, p_entidad_id, p_idempotency_key, p_payload_resumen)
  RETURNING auditoria_operaciones.id INTO v_id;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.registrar_auditoria(text, text, text, text, uuid, jsonb) TO anon, authenticated;

-- ============================================================
-- PRUEBAS SUGERIDAS (SQL Editor, con sesión autenticada):
--   SELECT * FROM public.listar_usuarios_para_chat();
--   SELECT public.crear_conversacion('GENERAL', 'Chat grupal');
--   SELECT public.crear_conversacion('PRIVADA', 'Test', '<uuid-otro-usuario>');
--   SELECT * FROM public.listar_conversaciones_usuario(true, 50);
--   SELECT * FROM public.listar_mensajes_conversacion('<conv-id>', 100, 0);
--   SELECT public.enviar_mensaje('<conv-id>', 'hola prueba', gen_random_uuid());
-- ============================================================
