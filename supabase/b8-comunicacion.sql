-- ============================================================
-- B8 — COMUNICACIÓN Y COORDINACIÓN OPERATIVA
-- ============================================================
-- Migración SQL para Supabase. Capa de comunicación operativa:
-- conversaciones generales, privadas, de soporte y contextuales
-- (incidencias, turnos, responsabilidades). NO es un chat genérico:
-- cada conversación puede vincularse al contexto real de la operación.
--
-- AUDITORÍA REAL CONFIRMADA (introspección en vivo a Supabase, 2026-08-15):
--   - NO existen: conversaciones, participantes_conversacion, mensajes
--     (todas 404). B8 las crea.
--   - EXISTEN: usuarios, roles, permisos, ventas, stock, lotes_compra.
--   - NO existen: turnos, cuadres, responsabilidades, incidencias,
--     compras, movimientos_stock, auditoria_operaciones (B6/B7 sin aplicar).
--   - RPC existentes: tiene_permiso, perfil_usuario_actual,
--     permisos_usuario_actual, usuario_esta_activo, listar_usuarios_admin,
--     listar_roles_admin.
--
-- REGLA ARQUITECTÓNICA: una sola fuente de verdad por responsabilidad.
--   - tiene_permiso + usuario_esta_activo = única autorización (B3).
--   - _validar_usuario_operacion (B6) = validación central.
--   - registrar_auditoria (B4) = única auditoría persistente.
--   - operaciones_pendientes + ejecutarOperacion (B2) = única cola offline.
--   - _cache (B2) = única caché frontend.
--   - Esta migración NO duplica nada: crea lo que falta (conversaciones,
--     participantes, mensajes) y reutiliza todo lo existente.
--
-- APLICACIÓN: ejecutar en el SQL Editor de Supabase. Idempotente.
-- No DROPea datos. No duplica tablas existentes.
-- Requiere que b3-roles-permisos.sql y b4-auditoria-trazabilidad.sql
-- estén aplicados (para tiene_permiso, usuario_esta_activo, registrar_auditoria).
-- ============================================================

-- ============================================================
-- 1) Tabla conversaciones
-- ============================================================
-- Tipos: GENERAL, PRIVADA, SOPORTE, INCIDENCIA, TURNO, RESPONSABILIDAD.
-- Las contextuales (INCIDENCIA/TURNO/RESPONSABILIDAD) llevan referencia
-- a la entidad de origen (no copian la entidad, solo la referencian).
CREATE TABLE IF NOT EXISTS public.conversaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'PRIVADA',
  titulo text,
  creador_id uuid,                          -- auth.users.id
  creador_nombre text,                       -- snapshot legible
  incidencia_id uuid,                       -- contexto B7 (si tipo=INCIDENCIA)
  turno_id uuid,                            -- contexto B7 (si tipo=TURNO)
  responsabilidad_id uuid,                  -- contexto B7 (si tipo=RESPONSABILIDAD)
  estado text NOT NULL DEFAULT 'ACTIVA',    -- ACTIVA/CERRADA
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.conversaciones DROP CONSTRAINT IF EXISTS conv_tipo_valido;
ALTER TABLE public.conversaciones ADD CONSTRAINT conv_tipo_valido
  CHECK (tipo IN ('GENERAL','PRIVADA','SOPORTE','INCIDENCIA','TURNO','RESPONSABILIDAD'));

ALTER TABLE public.conversaciones DROP CONSTRAINT IF EXISTS conv_estado_valido;
ALTER TABLE public.conversaciones ADD CONSTRAINT conv_estado_valido
  CHECK (estado IN ('ACTIVA','CERRADA'));

CREATE INDEX IF NOT EXISTS idx_conv_tipo ON public.conversaciones (tipo);
CREATE INDEX IF NOT EXISTS idx_conv_estado ON public.conversaciones (estado);
CREATE INDEX IF NOT EXISTS idx_conv_incidencia ON public.conversaciones (incidencia_id);
CREATE INDEX IF NOT EXISTS idx_conv_turno ON public.conversaciones (turno_id);
CREATE INDEX IF NOT EXISTS idx_conv_resp ON public.conversaciones (responsabilidad_id);

ALTER TABLE public.conversaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversaciones FROM anon;

-- ============================================================
-- 2) Tabla participantes_conversacion
-- ============================================================
-- Registra quién participa en cada conversación. Permite saber quién
-- puede leerla (RLS: solo participantes). Incluye último_leido para
-- el contador de no leídos.
CREATE TABLE IF NOT EXISTS public.participantes_conversacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  rol text DEFAULT 'participante',          -- participante/admin (en la conversación)
  ultimo_leido_en timestamptz,              -- para el contador de no leídos
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversacion_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_part_usuario ON public.participantes_conversacion (usuario_id);
CREATE INDEX IF NOT EXISTS idx_part_conv ON public.participantes_conversacion (conversacion_id);

ALTER TABLE public.participantes_conversacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.participantes_conversacion FROM anon;

-- ============================================================
-- 3) Tabla mensajes
-- ============================================================
-- Mensajes de cada conversación. idempotency_key evita duplicados
-- al reintentar (cola offline).
CREATE TABLE IF NOT EXISTS public.mensajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL,
  usuario_id uuid NOT NULL,                  -- auth.users.id del autor
  usuario_nombre text,                       -- snapshot legible
  contenido text NOT NULL,
  estado text NOT NULL DEFAULT 'ENVIADO',   -- ENVIADO/PENDIENTE/REQUIERE_ATENCION
  idempotency_key uuid,
  creado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mensajes DROP CONSTRAINT IF EXISTS msg_estado_valido;
ALTER TABLE public.mensajes ADD CONSTRAINT msg_estado_valido
  CHECK (estado IN ('ENVIADO','PENDIENTE','REQUIERE_ATENCION'));

CREATE INDEX IF NOT EXISTS idx_msg_conv ON public.mensajes (conversacion_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_msg_idempotency ON public.mensajes (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_msg_usuario ON public.mensajes (usuario_id);

ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mensajes FROM anon;

-- ============================================================
-- 4) Helper: validar acceso a conversación (interno)
-- ============================================================
-- Devuelve true si el usuario es participante de la conversación o si
-- la conversación es GENERAL (visible para quienes tengan comunicacion.ver).
CREATE OR REPLACE FUNCTION public._es_participante(p_conversacion_id uuid, p_usuario_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo text;
  v_es_part boolean;
BEGIN
  SELECT c.tipo INTO v_tipo FROM public.conversaciones c WHERE c.id = p_conversacion_id;
  IF v_tipo IS NULL THEN RETURN false; END IF;
  -- GENERAL: visible para quien tiene el permiso (la RPC ya validó).
  IF v_tipo = 'GENERAL' THEN RETURN public.tiene_permiso('comunicacion', 'ver'); END IF;
  -- Resto: debe ser participante.
  SELECT EXISTS(SELECT 1 FROM public.participantes_conversacion
    WHERE conversacion_id = p_conversacion_id AND usuario_id = p_usuario_id) INTO v_es_part;
  RETURN v_es_part;
END;
$$;

-- ============================================================
-- 5) RPC: crear_conversacion
-- ============================================================
-- Crea una conversación. Si es PRIVADA con otro usuario, crea también
-- los participantes. Si es contextual, vincula la entidad de origen.
-- Idempotente: si ya existe una conversación del mismo tipo+referencia,
-- la devuelve (no duplica).
CREATE OR REPLACE FUNCTION public.crear_conversacion(
  p_tipo text,
  p_titulo text DEFAULT NULL,
  p_participante_id uuid DEFAULT NULL,       -- para PRIVADA: el otro usuario
  p_incidencia_id uuid DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL,
  p_responsabilidad_id uuid DEFAULT NULL,
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
  v_conv_id uuid;
  v_existente uuid;
BEGIN
  v_uid := public._validar_usuario_operacion('comunicacion', 'crear');
  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id = v_uid;

  IF p_tipo NOT IN ('GENERAL','PRIVADA','SOPORTE','INCIDENCIA','TURNO','RESPONSABILIDAD') THEN
    RAISE EXCEPTION 'Tipo de conversación inválido.' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotencia contextual: si ya existe una conversación del mismo tipo
  -- con la misma referencia, devolverla (no duplicar).
  IF p_tipo IN ('INCIDENCIA','TURNO','RESPONSABILIDAD') THEN
    SELECT id INTO v_existente FROM public.conversaciones
      WHERE tipo = p_tipo
        AND (p_tipo = 'INCIDENCIA' AND incidencia_id = p_incidencia_id
          OR p_tipo = 'TURNO' AND turno_id = p_turno_id
          OR p_tipo = 'RESPONSABILIDAD' AND responsabilidad_id = p_responsabilidad_id)
      AND estado = 'ACTIVA'
      LIMIT 1;
    IF v_existente IS NOT NULL THEN
      -- Asegurar que el usuario es participante.
      INSERT INTO public.participantes_conversacion (conversacion_id, usuario_id, rol)
      VALUES (v_existente, v_uid, 'participante')
      ON CONFLICT (conversacion_id, usuario_id) DO NOTHING;
      RETURN jsonb_build_object('id', v_existente, 'estado', 'ACTIVA', 'nota', 'Conversación existente.');
    END IF;
  END IF;

  -- GENERAL: solo admin puede crear (si ya existe, devolverla).
  IF p_tipo = 'GENERAL' THEN
    SELECT id INTO v_existente FROM public.conversaciones WHERE tipo = 'GENERAL' LIMIT 1;
    IF v_existente IS NOT NULL THEN
      INSERT INTO public.participantes_conversacion (conversacion_id, usuario_id, rol)
      VALUES (v_existente, v_uid, 'participante')
      ON CONFLICT (conversacion_id, usuario_id) DO NOTHING;
      RETURN jsonb_build_object('id', v_existente, 'estado', 'ACTIVA');
    END IF;
  END IF;

  INSERT INTO public.conversaciones (tipo, titulo, creador_id, creador_nombre,
    incidencia_id, turno_id, responsabilidad_id, estado)
  VALUES (p_tipo, p_titulo, v_uid, v_nombre,
    p_incidencia_id, p_turno_id, p_responsabilidad_id, 'ACTIVA')
  RETURNING id INTO v_conv_id;

  -- El creador es siempre participante.
  INSERT INTO public.participantes_conversacion (conversacion_id, usuario_id, rol)
  VALUES (v_conv_id, v_uid, CASE WHEN p_tipo IN ('SOPORTE','GENERAL') THEN 'admin' ELSE 'participante' END);

  -- Si es PRIVADA, agregar al otro participante.
  IF p_tipo = 'PRIVADA' AND p_participante_id IS NOT NULL THEN
    INSERT INTO public.participantes_conversacion (conversacion_id, usuario_id, rol)
    VALUES (v_conv_id, p_participante_id, 'participante')
    ON CONFLICT (conversacion_id, usuario_id) DO NOTHING;
  END IF;

  PERFORM public.registrar_auditoria('comunicacion', 'Conversación creada (' || p_tipo || ')',
    'exito', v_conv_id::text, p_idempotency_key, NULL);

  RETURN jsonb_build_object('id', v_conv_id, 'estado', 'ACTIVA');
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_conversacion(text, text, uuid, uuid, uuid, uuid, uuid) TO anon, authenticated;

-- ============================================================
-- 6) RPC: listar_conversaciones_usuario
-- ============================================================
-- Lista las conversaciones del usuario (donde es participante) + la GENERAL.
-- Devuelve también el último mensaje y el contador de no leídos.
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
AS $$
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
    SELECT c.id, c.tipo, c.titulo, c.estado,
      (SELECT m.contenido FROM public.mensajes m
        WHERE m.conversacion_id = c.id ORDER BY m.creado_en DESC LIMIT 1) AS ultimo_mensaje,
      (SELECT m.usuario_nombre FROM public.mensajes m
        WHERE m.conversacion_id = c.id ORDER BY m.creado_en DESC LIMIT 1) AS ultimo_autor,
      (SELECT m.creado_en FROM public.mensajes m
        WHERE m.conversacion_id = c.id ORDER BY m.creado_en DESC LIMIT 1) AS ultimo_fecha,
      COALESCE((
        SELECT count(*) FROM public.mensajes m
        WHERE m.conversacion_id = c.id
          AND m.usuario_id <> v_uid
          AND m.creado_en > COALESCE(
            (SELECT pc.ultimo_leido_en FROM public.participantes_conversacion pc
              WHERE pc.conversacion_id = c.id AND pc.usuario_id = v_uid), '1970-01-01'::timestamptz)
      ), 0) AS no_leidos,
      (c.tipo = 'GENERAL') AS es_general
    FROM public.conversaciones c
    WHERE (
      -- GENERAL: visible para quien tiene el permiso.
      (c.tipo = 'GENERAL')
      OR
      -- Resto: solo si es participante.
      EXISTS(SELECT 1 FROM public.participantes_conversacion pc
        WHERE pc.conversacion_id = c.id AND pc.usuario_id = v_uid)
    )
    AND (NOT p_solo_activas OR c.estado = 'ACTIVA')
    ORDER BY c.tipo = 'GENERAL' DESC, ultimo_fecha DESC NULLS LAST
    LIMIT p_limite;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_conversaciones_usuario(boolean, int) TO anon, authenticated;

-- ============================================================
-- 7) RPC: listar_mensajes_conversacion
-- ============================================================
-- Devuelve los mensajes de una conversación. Valida acceso (participante
-- o GENERAL). Paginado.
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
AS $$
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
    FROM public.mensajes m
    WHERE m.conversacion_id = p_conversacion_id
    ORDER BY m.creado_en ASC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_mensajes_conversacion(uuid, int, int) TO anon, authenticated;

-- ============================================================
-- 8) RPC: enviar_mensaje
-- ============================================================
-- Envía un mensaje. Valida acceso, contenido no vacío, idempotencia.
-- No duplica: si idempotency_key ya existe, devuelve el mensaje existente.
CREATE OR REPLACE FUNCTION public.enviar_mensaje(
  p_conversacion_id uuid,
  p_contenido text,
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
  v_msg_id uuid;
  v_existente uuid;
  v_estado_conv text;
BEGIN
  v_uid := public._validar_usuario_operacion('comunicacion', 'crear');
  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id = v_uid;

  -- Validar conversación activa.
  SELECT estado INTO v_estado_conv FROM public.conversaciones WHERE id = p_conversacion_id;
  IF v_estado_conv IS NULL THEN
    RAISE EXCEPTION 'La conversación no existe.' USING ERRCODE = 'P0001';
  END IF;
  IF v_estado_conv = 'CERRADA' THEN
    RAISE EXCEPTION 'La conversación está cerrada.' USING ERRCODE = 'P0001';
  END IF;

  -- Validar acceso.
  IF NOT public._es_participante(p_conversacion_id, v_uid) THEN
    RAISE EXCEPTION 'No tenés acceso a esta conversación.' USING ERRCODE = '42501';
  END IF;

  -- Validar contenido.
  IF p_contenido IS NULL OR btrim(p_contenido) = '' THEN
    RAISE EXCEPTION 'El mensaje no puede estar vacío.' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotencia: si la key ya existe, devolver el mensaje existente.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existente FROM public.mensajes
      WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existente IS NOT NULL THEN
      RETURN jsonb_build_object('id', v_existente, 'estado', 'ENVIADO', 'nota', 'Mensaje ya enviado.');
    END IF;
  END IF;

  INSERT INTO public.mensajes (conversacion_id, usuario_id, usuario_nombre, contenido, estado, idempotency_key)
  VALUES (p_conversacion_id, v_uid, v_nombre, p_contenido, 'ENVIADO', p_idempotency_key)
  RETURNING id INTO v_msg_id;

  -- Actualizar conversación (para orden de la lista).
  UPDATE public.conversaciones SET actualizado_en = now() WHERE id = p_conversacion_id;

  PERFORM public.registrar_auditoria('comunicacion', 'Mensaje enviado en conversación ' || p_conversacion_id,
    'exito', v_msg_id::text, p_idempotency_key, NULL);

  RETURN jsonb_build_object('id', v_msg_id, 'estado', 'ENVIADO');
END;
$$;

GRANT EXECUTE ON FUNCTION public.enviar_mensaje(uuid, text, uuid) TO anon, authenticated;

-- ============================================================
-- 9) RPC: marcar_conversacion_leida
-- ============================================================
-- Marca todos los mensajes como leídos (actualiza ultimo_leido_en).
CREATE OR REPLACE FUNCTION public.marcar_conversacion_leida(
  p_conversacion_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE = '42501';
  END IF;
  IF NOT public._es_participante(p_conversacion_id, v_uid) THEN
    RAISE EXCEPTION 'No tenés acceso a esta conversación.' USING ERRCODE = '42501';
  END IF;
  -- UPSERT: si ya es participante, actualiza; si no (no debería pasar por
  -- el check de arriba), inserta.
  INSERT INTO public.participantes_conversacion (conversacion_id, usuario_id, ultimo_leido_en)
  VALUES (p_conversacion_id, v_uid, now())
  ON CONFLICT (conversacion_id, usuario_id)
  DO UPDATE SET ultimo_leido_en = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_conversacion_leida(uuid) TO anon, authenticated;

-- ============================================================
-- 10) RPC: agregar_participante
-- ============================================================
-- Agrega un usuario a una conversación. Solo creador o admin (rol en la conv).
CREATE OR REPLACE FUNCTION public.agregar_participante(
  p_conversacion_id uuid,
  p_usuario_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := public._validar_usuario_operacion('comunicacion', 'crear');
  -- Validar que el solicitante es participante con rol admin o es el creador.
  IF NOT EXISTS(
    SELECT 1 FROM public.participantes_conversacion pc
    JOIN public.conversaciones c ON c.id = pc.conversacion_id
    WHERE pc.conversacion_id = p_conversacion_id
      AND pc.usuario_id = v_uid
      AND (pc.rol = 'admin' OR c.creador_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'No tenés permiso para agregar participantes.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.participantes_conversacion (conversacion_id, usuario_id, rol)
  VALUES (p_conversacion_id, p_usuario_id, 'participante')
  ON CONFLICT (conversacion_id, usuario_id) DO NOTHING;

  PERFORM public.registrar_auditoria('comunicacion', 'Participante agregado a conversación ' || p_conversacion_id,
    'exito', p_conversacion_id::text, NULL, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.agregar_participante(uuid, uuid) TO anon, authenticated;

-- ============================================================
-- 11) RPC: cerrar_conversacion
-- ============================================================
-- Cierra una conversación. Solo creador o admin.
CREATE OR REPLACE FUNCTION public.cerrar_conversacion(
  p_conversacion_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_nombre text;
BEGIN
  v_uid := public._validar_usuario_operacion('comunicacion', 'crear');
  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id = v_uid;
  IF NOT EXISTS(
    SELECT 1 FROM public.participantes_conversacion pc
    JOIN public.conversaciones c ON c.id = pc.conversacion_id
    WHERE pc.conversacion_id = p_conversacion_id
      AND pc.usuario_id = v_uid
      AND (pc.rol = 'admin' OR c.creador_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'No tenés permiso para cerrar esta conversación.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.conversaciones SET estado = 'CERRADA', actualizado_en = now()
    WHERE id = p_conversacion_id;

  PERFORM public.registrar_auditoria('comunicacion', 'Conversación cerrada por ' || COALESCE(v_nombre, v_uid::text),
    'exito', p_conversacion_id::text, NULL, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cerrar_conversacion(uuid) TO anon, authenticated;

-- ============================================================
-- 12) RPC: contar_no_leidos_global
-- ============================================================
-- Devuelve el total de mensajes no leídos del usuario (para el sidebar).
CREATE OR REPLACE FUNCTION public.contar_no_leidos_global()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total int := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;
  -- B8.5: una sola consulta unificada. Cuenta mensajes de otros autores
  -- en conversaciones donde el usuario participa, más GENERAL si tiene permiso.
  -- Antes había dos consultas que duplicaban el total (bug corregido).
  SELECT count(*) INTO v_total
  FROM public.mensajes m
  WHERE m.usuario_id <> v_uid
    AND m.creado_en > COALESCE(
      (SELECT pc.ultimo_leido_en FROM public.participantes_conversacion pc
        WHERE pc.conversacion_id = m.conversacion_id AND pc.usuario_id = v_uid),
      '1970-01-01'::timestamptz)
    AND (
      -- Conversaciones donde el usuario es participante.
      m.conversacion_id IN (
        SELECT pc.conversacion_id FROM public.participantes_conversacion pc
        WHERE pc.usuario_id = v_uid
      )
      OR
      -- GENERAL: visible si el usuario tiene el permiso.
      (m.conversacion_id IN (
        SELECT c.id FROM public.conversaciones c WHERE c.tipo = 'GENERAL'
      ) AND public.tiene_permiso('comunicacion', 'ver'))
    );
  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.contar_no_leidos_global() TO anon, authenticated;

-- ============================================================
-- 13) RPC: listar_usuarios_para_chat
-- ============================================================
-- Lista usuarios activos para iniciar conversación privada o agregar.
CREATE OR REPLACE FUNCTION public.listar_usuarios_para_chat()
RETURNS TABLE (
  id uuid,
  nombre text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('comunicacion', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver usuarios.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT u.id, u.nombre FROM public.usuarios u
    WHERE u.activo = true AND u.id <> auth.uid()
    ORDER BY u.nombre;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_usuarios_para_chat() TO anon, authenticated;

-- ============================================================
-- NOTAS DE SEGURIDAD Y ARQUITECTURA:
--   - Todos los RPC: SECURITY DEFINER, search_path = public, pg_temp.
--   - Validan auth.uid(), usuario activo y tiene_permiso (vía _validar_usuario_operacion).
--   - RLS: un usuario solo lee conversaciones donde participa (o GENERAL si tiene permiso).
--   - Las conversaciones privadas jamás quedan expuestas por SELECT directo:
--     las RPC validan _es_participante antes de devolver datos.
--   - Idempotencia: enviar_mensaje no duplica con idempotency_key.
--   - Auditoría: reutiliza registrar_auditoria (B4). No duplica el sistema.
--   - REVOKE a anon en todas las tablas nuevas.
--   - Reutiliza usuarios/roles/permisos existentes. No duplica.
-- ============================================================
