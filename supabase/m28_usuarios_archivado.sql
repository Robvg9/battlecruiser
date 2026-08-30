-- ============================================================
-- M28 — Archivado de usuarios (Micro-misión 002)
-- ============================================================
-- ADITIVO. No borra registros. No rompe historial ni FKs.
-- Estados independientes: ACTIVO / INACTIVO / ARCHIVADO.
-- Aplicar en SQL Editor de Supabase. Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Columnas aditivas en usuarios
-- ------------------------------------------------------------
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS archivado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archivado_en timestamptz,
  ADD COLUMN IF NOT EXISTS archivado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_archivo text;

CREATE INDEX IF NOT EXISTS idx_usuarios_archivado
  ON public.usuarios (archivado)
  WHERE archivado = true;

-- ------------------------------------------------------------
-- 2) listar_usuarios_admin — opcional incluir archivados
--    Firma ampliada: p_incluir_archivados boolean DEFAULT false
--    Por defecto NO devuelve archivados (lista operativa).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.listar_usuarios_admin();
DROP FUNCTION IF EXISTS public.listar_usuarios_admin(boolean);

CREATE OR REPLACE FUNCTION public.listar_usuarios_admin(
  p_incluir_archivados boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  nombre text,
  activo boolean,
  role_id uuid,
  rol text,
  archivado boolean,
  archivado_en timestamptz,
  motivo_archivo text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver usuarios.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      u.id,
      u.nombre,
      u.activo,
      u.role_id,
      r.nombre AS rol,
      u.archivado,
      u.archivado_en,
      u.motivo_archivo
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id = u.role_id
    WHERE (
      CASE
        WHEN p_incluir_archivados THEN u.archivado = true
        ELSE COALESCE(u.archivado, false) = false
      END
    )
    ORDER BY u.nombre;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_usuarios_admin(boolean) TO anon, authenticated;

-- ------------------------------------------------------------
-- 3) usuario_esta_activo — false si archivado o inactivo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.usuario_esta_activo()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN u.id IS NULL THEN NULL
    WHEN COALESCE(u.archivado, false) = true THEN false
    ELSE u.activo
  END
  FROM public.usuarios u
  WHERE u.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.usuario_esta_activo() TO anon, authenticated;

-- ------------------------------------------------------------
-- 4) perfil_usuario_actual — incluye archivado
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.perfil_usuario_actual()
RETURNS TABLE (
  id uuid,
  nombre text,
  activo boolean,
  role_id uuid,
  rol text,
  archivado boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    u.id,
    u.nombre,
    u.activo,
    u.role_id,
    r.nombre AS rol,
    COALESCE(u.archivado, false) AS archivado
  FROM public.usuarios u
  LEFT JOIN public.roles r ON r.id = u.role_id
  WHERE u.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.perfil_usuario_actual() TO anon, authenticated;

-- ------------------------------------------------------------
-- 5) cambiar_estado_usuario — no opera sobre archivados
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cambiar_estado_usuario(
  p_usuario_id uuid,
  p_activo boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol_actual text;
  v_duenos_activos int;
  v_archivado boolean;
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'editar') THEN
    RAISE EXCEPTION 'No tenés permiso para editar usuarios.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(u.archivado, false), r.nombre
    INTO v_archivado, v_rol_actual
  FROM public.usuarios u
  LEFT JOIN public.roles r ON r.id = u.role_id
  WHERE u.id = p_usuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado.' USING ERRCODE = 'P0001';
  END IF;

  IF v_archivado THEN
    RAISE EXCEPTION 'No se puede activar/desactivar un usuario archivado. Restauralo primero.' USING ERRCODE = 'P0001';
  END IF;

  IF p_activo = false AND v_rol_actual = 'Dueño' THEN
    SELECT count(*) INTO v_duenos_activos
      FROM public.usuarios u
      JOIN public.roles r ON r.id = u.role_id
      WHERE r.nombre = 'Dueño'
        AND u.activo = true
        AND COALESCE(u.archivado, false) = false;
    IF v_duenos_activos <= 1 THEN
      RAISE EXCEPTION 'No se puede desactivar al único Dueño activo.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.usuarios SET activo = p_activo WHERE id = p_usuario_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cambiar_estado_usuario(uuid, boolean) TO anon, authenticated;

-- ------------------------------------------------------------
-- 6) archivar_usuario
--    Guards: permiso editar, no único Dueño, no turno/sesión abierta
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archivar_usuario(
  p_usuario_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol text;
  v_archivado boolean;
  v_duenos int;
  v_turno_abierto int;
  v_sesion_abierta int;
  v_actor uuid := auth.uid();
  v_nombre text;
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'editar') THEN
    RAISE EXCEPTION 'No tenés permiso para archivar usuarios.' USING ERRCODE = '42501';
  END IF;

  SELECT u.nombre, COALESCE(u.archivado, false), r.nombre
    INTO v_nombre, v_archivado, v_rol
  FROM public.usuarios u
  LEFT JOIN public.roles r ON r.id = u.role_id
  WHERE u.id = p_usuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado.' USING ERRCODE = 'P0001';
  END IF;

  IF v_archivado THEN
    RAISE EXCEPTION 'El usuario ya está archivado.' USING ERRCODE = 'P0001';
  END IF;

  IF v_rol = 'Dueño' THEN
    SELECT count(*) INTO v_duenos
      FROM public.usuarios u
      JOIN public.roles r ON r.id = u.role_id
      WHERE r.nombre = 'Dueño'
        AND COALESCE(u.archivado, false) = false;
    IF v_duenos <= 1 THEN
      RAISE EXCEPTION 'No se puede archivar al único Dueño del sistema.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Guard: turno ABIERTO o sesión EN_CURSO
  SELECT count(*) INTO v_turno_abierto
    FROM public.turnos t
    WHERE t.usuario_id = p_usuario_id AND t.estado = 'ABIERTO';

  SELECT count(*) INTO v_sesion_abierta
    FROM public.sesiones_ciclo s
    WHERE s.usuario_id = p_usuario_id AND s.estado = 'EN_CURSO';

  IF v_turno_abierto > 0 OR v_sesion_abierta > 0 THEN
    RAISE EXCEPTION 'No se puede archivar: el usuario tiene un turno o sesión operativa abierta. Cerrala primero.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.usuarios
  SET
    archivado = true,
    archivado_en = now(),
    archivado_por = v_actor,
    motivo_archivo = NULLIF(trim(COALESCE(p_motivo, '')), ''),
    activo = false
  WHERE id = p_usuario_id;

  -- Auditoría (estructura existente)
  PERFORM public.registrar_auditoria(
    'usuario_archivo',
    'Usuario archivado: ' || COALESCE(v_nombre, p_usuario_id::text) ||
      CASE WHEN NULLIF(trim(COALESCE(p_motivo, '')), '') IS NOT NULL
        THEN ' — Motivo: ' || trim(p_motivo)
        ELSE ''
      END,
    'exito',
    p_usuario_id::text,
    NULL,
    jsonb_build_object(
      'usuario_id', p_usuario_id,
      'motivo', NULLIF(trim(COALESCE(p_motivo, '')), ''),
      'archivado_por', v_actor
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.archivar_usuario(uuid, text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 7) restaurar_usuario
--    Queda INACTIVO (activo=false) hasta reactivación explícita
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restaurar_usuario(p_usuario_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_archivado boolean;
  v_nombre text;
  v_actor uuid := auth.uid();
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'editar') THEN
    RAISE EXCEPTION 'No tenés permiso para restaurar usuarios.' USING ERRCODE = '42501';
  END IF;

  SELECT u.nombre, COALESCE(u.archivado, false)
    INTO v_nombre, v_archivado
  FROM public.usuarios u
  WHERE u.id = p_usuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_archivado THEN
    RAISE EXCEPTION 'El usuario no está archivado.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.usuarios
  SET
    archivado = false,
    archivado_en = NULL,
    archivado_por = NULL,
    motivo_archivo = NULL,
    activo = false
  WHERE id = p_usuario_id;

  PERFORM public.registrar_auditoria(
    'usuario_restauracion',
    'Usuario restaurado: ' || COALESCE(v_nombre, p_usuario_id::text) || ' (queda Inactivo).',
    'exito',
    p_usuario_id::text,
    NULL,
    jsonb_build_object(
      'usuario_id', p_usuario_id,
      'restaurado_por', v_actor
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.restaurar_usuario(uuid) TO anon, authenticated;

-- ============================================================
-- Resumen
-- - Columnas: archivado, archivado_en, archivado_por, motivo_archivo
-- - RPC nuevas: archivar_usuario, restaurar_usuario
-- - RPC actualizadas: listar_usuarios_admin(p_incluir_archivados),
--   usuario_esta_activo, perfil_usuario_actual, cambiar_estado_usuario
-- - Guards: único Dueño, turno/sesión abierta, permiso editar
-- - Auditoría vía registrar_auditoria (tipos usuario_archivo / usuario_restauracion)
-- - Sin borrado físico; historial intacto
-- ============================================================
