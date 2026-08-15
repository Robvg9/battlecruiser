-- ============================================================
-- B3 — Sistema Operacional de Usuarios, Roles, Permisos y Control
-- ============================================================
-- Migración SQL para Supabase. Reutiliza EXCLUSIVAMENTE la arquitectura
-- existente: tablas `usuarios`, `roles`, `permisos` y la función
-- `public.tiene_permiso(p_seccion, p_accion)`. NO crea tablas nuevas ni
-- un segundo sistema de permisos.
--
-- Esquema real confirmado por auditoría directa a Supabase:
--   usuarios(id, nombre, activo, role_id, ...)   -- id = auth.users.id (UUID)
--   roles(id, nombre)
--   permisos(id, seccion, accion, role_id)        -- matriz rol -> (seccion,accion)
--   public.tiene_permiso(p_seccion, p_accion)    -- SECURITY DEFINER, requiere auth
--   RLS en usuarios/roles/permisos invoca tiene_permiso.
--
-- Esta migración agrega las 8 RPC que el frontend de B3 necesita:
--   1) perfil_usuario_actual()
--   2) permisos_usuario_actual()
--   3) listar_usuarios_admin()   (protegida con tiene_permiso)
--   4) listar_roles_admin()       (protegida con tiene_permiso)
--   5) permisos_por_rol(p_role_id) (protegida con tiene_permiso)
--   6) asignar_rol_usuario(...)    (protegida + protección del Dueño)
--   7) cambiar_estado_usuario(...) (protegida + protección del Dueño)
--   8) usuario_esta_activo()
--
-- REVISIÓN DE SEGURIDAD (cierre B3):
--   - Se ELIMINÓ la función `listar_usuarios()` sin guarda que existía en la
--     versión anterior: era idéntica a `listar_usuarios_admin()` pero SIN
--     protección de tiene_permiso, lo que permitía a cualquier usuario
--     autenticado listar todos los usuarios llamándola directamente. Era una
--     RPC duplicada e insegura. Ahora solo existe `listar_usuarios_admin()`.
--   - Todas las funciones administrativas son SECURITY DEFINER con
--     search_path = public, pg_temp (igual que registrar_compra, crear_producto,
--     etc.) y protegen cada operación con `tiene_permiso('usuarios', <accion>)`.
--   - La autorización REAL está en el backend: ocultar botones en el frontend
--     NO es seguridad. Un usuario que manipule el frontend no puede ejecutar
--     estas operaciones sin el permiso real.
--
-- APLICACIÓN: ejecutar este script en el SQL Editor de Supabase.
-- Es idempotente (CREATE OR REPLACE / DROP FUNCTION IF EXISTS).
-- ============================================================

-- ------------------------------------------------------------
-- Limpieza de la versión anterior: eliminar la RPC insegura
-- `listar_usuarios()` (sin guarda) si llegara a existir. No la
-- recreamos: la protegida es `listar_usuarios_admin()`.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.listar_usuarios();

-- ------------------------------------------------------------
-- 1) perfil_usuario_actual()
--    Devuelve el perfil del usuario autenticado: { id, nombre, activo,
--    role_id, rol }. Filtra por auth.uid() (cada usuario ve solo el suyo).
--    No requiere permiso administrativo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.perfil_usuario_actual()
RETURNS TABLE (
  id uuid,
  nombre text,
  activo boolean,
  role_id uuid,
  rol text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.nombre, u.activo, u.role_id, r.nombre AS rol
  FROM public.usuarios u
  LEFT JOIN public.roles r ON r.id = u.role_id
  WHERE u.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.perfil_usuario_actual() TO anon, authenticated;

-- ------------------------------------------------------------
-- 2) permisos_usuario_actual()
--    Devuelve la matriz de permisos efectivos del usuario actual
--    (seccion, accion) según su role_id. Reutiliza la tabla permisos
--    existente (no recalcula ni duplica la matriz). Filtra por auth.uid().
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.permisos_usuario_actual()
RETURNS TABLE (
  seccion text,
  accion text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.seccion, p.accion
  FROM public.permisos p
  JOIN public.usuarios u ON u.role_id = p.role_id
  WHERE u.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.permisos_usuario_actual() TO anon, authenticated;

-- ------------------------------------------------------------
-- 3) listar_usuarios_admin()
--    Lista usuarios con su rol y estado, para la administración.
--    Protegida con tiene_permiso('usuarios','ver'). Un usuario sin
--    permiso recibe un error de autorización real (42501).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_usuarios_admin()
RETURNS TABLE (
  id uuid,
  nombre text,
  activo boolean,
  role_id uuid,
  rol text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver usuarios.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT u.id, u.nombre, u.activo, u.role_id, r.nombre AS rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id = u.role_id
    ORDER BY u.nombre;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_usuarios_admin() TO anon, authenticated;

-- ------------------------------------------------------------
-- 4) listar_roles_admin()
--    Lista los roles disponibles (para asignar en la administración).
--    Reutiliza la tabla roles existente. Protegida con
--    tiene_permiso('usuarios','ver').
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_roles_admin()
RETURNS TABLE (
  id uuid,
  nombre text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver roles.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT r.id, r.nombre FROM public.roles r ORDER BY r.nombre;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_roles_admin() TO anon, authenticated;

-- ------------------------------------------------------------
-- 5) permisos_por_rol(p_role_id)
--    Devuelve la matriz (seccion, accion) de un rol concreto, para
--    visualizar qué puede hacer cada rol en la administración.
--    Protegida con tiene_permiso('usuarios','ver').
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.permisos_por_rol(p_role_id uuid)
RETURNS TABLE (
  seccion text,
  accion text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver permisos.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT p.seccion, p.accion
    FROM public.permisos p
    WHERE p.role_id = p_role_id
    ORDER BY p.seccion, p.accion;
END;
$$;

GRANT EXECUTE ON FUNCTION public.permisos_por_rol(p_role_id) TO anon, authenticated;

-- ------------------------------------------------------------
-- 6) asignar_rol_usuario(p_usuario_id, p_role_id)
--    Asigna un rol existente a un usuario. Protegida con
--    tiene_permiso('usuarios','editar').
--
--    B3.12 — Protección del Dueño: impide quitarle el rol al usuario que
--    tiene el rol "Dueño" si es el ÚNICO Dueño activo, para evitar que el
--    sistema se quede sin acceso administrativo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.asignar_rol_usuario(p_usuario_id uuid, p_role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol_actual text;
  v_duenos_activos int;
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'editar') THEN
    RAISE EXCEPTION 'No tenés permiso para editar usuarios.' USING ERRCODE = '42501';
  END IF;

  SELECT r.nombre INTO v_rol_actual
    FROM public.usuarios u JOIN public.roles r ON r.id = u.role_id
    WHERE u.id = p_usuario_id;

  IF v_rol_actual = 'Dueño' THEN
    SELECT count(*) INTO v_duenos_activos
      FROM public.usuarios u JOIN public.roles r ON r.id = u.role_id
      WHERE r.nombre = 'Dueño' AND u.activo = true;
    -- Si este usuario es el único Dueño activo, no permitir cambiarle el rol:
    -- evitaría quedarse sin ningún acceso administrativo real.
    IF v_duenos_activos <= 1 THEN
      RAISE EXCEPTION 'No se puede cambiar el rol del único Dueño activo: el sistema quedaría sin acceso administrativo.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.usuarios SET role_id = p_role_id WHERE id = p_usuario_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.asignar_rol_usuario(p_usuario_id uuid, p_role_id uuid) TO anon, authenticated;

-- ------------------------------------------------------------
-- 7) cambiar_estado_usuario(p_usuario_id, p_activo)
--    Activa/desactiva un usuario. Protegida con
--    tiene_permiso('usuarios','editar').
--    B3.12: no permite desactivar al único Dueño activo.
--    B3.3: un usuario inactivo no puede operar; el backend lo impide vía
--    RLS/tiene_permiso, y el frontend valida con usuario_esta_activo()
--    antes de cada operación online.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cambiar_estado_usuario(p_usuario_id uuid, p_activo boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol_actual text;
  v_duenos_activos int;
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'editar') THEN
    RAISE EXCEPTION 'No tenés permiso para editar usuarios.' USING ERRCODE = '42501';
  END IF;

  SELECT r.nombre INTO v_rol_actual
    FROM public.usuarios u JOIN public.roles r ON r.id = u.role_id
    WHERE u.id = p_usuario_id;

  IF p_activo = false AND v_rol_actual = 'Dueño' THEN
    SELECT count(*) INTO v_duenos_activos
      FROM public.usuarios u JOIN public.roles r ON r.id = u.role_id
      WHERE r.nombre = 'Dueño' AND u.activo = true;
    IF v_duenos_activos <= 1 THEN
      RAISE EXCEPTION 'No se puede desactivar al único Dueño activo.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.usuarios SET activo = p_activo WHERE id = p_usuario_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cambiar_estado_usuario(p_usuario_id uuid, p_activo boolean) TO anon, authenticated;

-- ------------------------------------------------------------
-- 8) usuario_esta_activo()
--    Devuelve el estado activo del usuario autenticado actual.
--    Filtra por auth.uid(). Retorna NULL si no hay perfil (no inventa).
--    Usada por el frontend para bloquear operaciones de usuarios
--    inactivos de forma real (no solo ocultando botones).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.usuario_esta_activo()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.activo FROM public.usuarios u WHERE u.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.usuario_esta_activo() TO anon, authenticated;

-- ============================================================
-- Resumen de seguridad:
--   - 8 funciones, todas SECURITY DEFINER con search_path = public, pg_temp.
--   - 5 protegidas con tiene_permiso('usuarios',*) (las administrativas).
--   - 3 sin guarda administrativa pero filtradas por auth.uid() (perfil,
--     permisos y estado activo del propio usuario).
--   - NO existe ninguna función "listar_usuarios" sin protección: se eliminó.
--   - Protección del Dueño en asignar_rol_usuario y cambiar_estado_usuario.
--   - NO se modifican tablas existentes ni RLS. Reutiliza tiene_permiso.
-- ============================================================
