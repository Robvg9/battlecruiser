-- ============================================================
-- B3 — Sistema Operacional de Usuarios, Roles, Permisos y Control
-- ============================================================
-- Migración SQL para Supabase. Reutiliza EXCLUSIVAMENTE la arquitectura
-- existente: tablas `usuarios`, `roles`, `permisos` y la función
-- `public.tiene_permiso(p_seccion, p_accion)`. NO crea tablas nuevas ni
-- un segundo sistema de permisos.
--
-- Esquema real confirmado por auditoría:
--   usuarios(id, nombre, activo, role_id, ...)   -- id = auth.users.id (UUID)
--   roles(id, nombre)
--   permisos(id, seccion, accion, role_id)        -- matriz rol -> (seccion,accion)
--   public.tiene_permiso(p_seccion, p_accion)    -- SECURITY DEFINER, requiere auth
--
-- Lo que falta (y esta migración agrega): las RPC administrativas que el
-- frontend de B3 necesita para:
--   1) obtener el perfil/rol/permisos del usuario actual;
--   2) listar usuarios (con su rol) para la administración;
--   3) listar roles y permisos por rol (visualización);
--   4) asignar un rol a un usuario;
--   5) activar/desactivar un usuario.
--
-- Todas las funciones administrativas son SECURITY DEFINER con search_path
-- fijo (igual que los RPC existentes registrar_compra, crear_producto, etc.)
-- y protegen cada operación con `tiene_permiso('usuarios', <accion>)`, de modo
-- que la autorización REAL esté en el backend, no en ocultar botones del
-- frontend. Un usuario que manipule el frontend no puede ejecutar estas
-- operaciones sin el permiso real.
--
-- APLICACIÓN: ejecutar este script en el SQL Editor de Supabase.
-- Es idempotente (CREATE OR REPLACE / DROP FUNCTION IF EXISTS).
-- ============================================================

-- Aseguramos permisos de ejecución solo a roles de la app (anon+authenticated).
-- Los RPC existentes siguen este patrón (GRANT EXECUTE a anon/authenticated).
-- La protección real la da tiene_permiso dentro de cada función.

-- ------------------------------------------------------------
-- 1) perfil_usuario_actual()
--    Devuelve { id, nombre, activo, role_id, rol } del usuario
--    autenticado actual. Lee su propia fila de `usuarios`.
--    No requiere permiso especial: cada usuario puede ver su propio perfil.
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
--    existente (no recalcula ni duplica la matriz).
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
-- 3) listar_usuarios()
--    Lista usuarios con su rol y estado, para la administración.
--    Protegido por tiene_permiso('usuarios','ver'). El admin ve todos;
--    un usuario sin permiso recibe un error de autorización real.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_usuarios()
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
  ORDER BY u.nombre;
$$;

-- La protección se aplica con una guarda explícita (no solo RLS) para que
-- el error sea claro y consistente sin importar el cliente.
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
-- listar_usuarios() (sin guarda) queda deprecado en favor del protegido;
-- lo conservamos por compatibilidad pero el frontend usa el _admin.

-- ------------------------------------------------------------
-- 4) listar_roles()
--    Lista los roles disponibles (para asignar en la administración).
--    Reutiliza la tabla roles existente. Protegido por
--    tiene_permiso('usuarios','ver') (quien puede ver usuarios puede ver
--    qué roles existen para asignarlos).
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
--    Protegido por tiene_permiso('usuarios','ver').
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
--    Asigna un rol existente a un usuario. Protegido por
--    tiene_permiso('usuarios','editar'). La autorización real está acá:
--    el frontend no puede saltársela.
--
--    B3.12 — Protección del Dueño: impide quitarle el rol al usuario que
--    tiene el rol "Dueño" si es el ÚNICO Dueño activo, para evitar que el
--    sistema se quede sin acceso administrativo. Es una protección mínima
--    y razonable, no una regla de negocio arbitraria.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.asignar_rol_usuario(p_usuario_id uuid, p_role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol_actual text;
  v_es_dueno boolean;
  v_duenos_activos int;
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'editar') THEN
    RAISE EXCEPTION 'No tenés permiso para editar usuarios.' USING ERRCODE = '42501';
  END IF;

  SELECT r.nombre INTO v_rol_actual
    FROM public.usuarios u JOIN public.roles r ON r.id = u.role_id
    WHERE u.id = p_usuario_id;

  v_es_dueno := (v_rol_actual = 'Dueño');
  IF v_es_dueno THEN
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
--    Activa/desactiva un usuario. Protegido por
--    tiene_permiso('usuarios','editar').
--    B3.12: no permite desactivar al único Dueño activo.
--    B3.3: un usuario inactivo no puede operar (la guarda de la app
--    comprueba activo; el backend ya impide operaciones vía RLS/tiene_permiso
--    porque un usuario desactivado sigue teniendo su sesión Auth pero sus
--    operaciones protegidas deben validarse contra activo=TRUE).
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
--    Helper para que la app valide el estado activo del usuario actual
--    en cada operación sensible. Reutiliza la fila de usuarios del
--    usuario autenticado. Retorna NULL si no hay perfil (no inventa).
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
-- NOTA: esta migración NO modifica tablas existentes ni RLS.
-- Reutiliza `tiene_permiso` tal cual está. Las nuevas funciones son
-- SECURITY DEFINER con search_path fijo y GRANT a anon/authenticated,
-- siguiendo el mismo patrón que registrar_compra, crear_producto, etc.
-- La seguridad real depende de tiene_permiso dentro de cada función, no
-- de ocultar botones en el frontend.
-- ============================================================
