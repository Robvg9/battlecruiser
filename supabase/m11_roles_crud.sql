-- ============================================================
-- M11 — CRUD real de Roles y matriz de Permisos por Rol
-- Misión 9.3, Fase 3
-- ============================================================
-- Contexto (confirmado por auditoría directa a Supabase, 2026-08-19):
--   roles(id, nombre, creado_en)              -- SIN columna activo todavía
--   permisos(id, role_id, seccion, accion, permitido)
--   usuarios(id, nombre, role_id, activo, ...)
--   tiene_permiso(p_seccion, p_accion)         -- ya existente, sin cambios
--   Matriz canónica real de permisos (57 filas para 1 rol):
--     13 secciones con [ver,crear,editar,borrar] + 'turnos' que además
--     tiene 'editar_any'. NO se inventan nuevas secciones/acciones: se
--     reutilizan los mismos CHECK existentes en la tabla permisos.
--
-- Esta migración:
--   1) Agrega roles.activo (boolean, default true) — no existía; hace
--      falta para "activar/desactivar rol" (Fase 3).
--   2) Agrega 5 RPC nuevas: crear_rol, editar_rol, activar_desactivar_rol,
--      eliminar_rol, actualizar_permisos_rol.
--   3) Reemplaza listar_roles_admin para devolver también activo y
--      cantidad_usuarios, con parámetro p_incluir_inactivos (default
--      false) para no romper el uso actual del frontend (selector de
--      "cambiar rol de usuario", que solo debe ofrecer roles activos).
--
-- NO toca: usuarios, permisos_usuario_actual, asignar_rol_usuario,
-- cambiar_estado_usuario, el trigger proteger_ultimo_dueno, ni ninguna
-- RPC fuera de administración de roles.
-- ============================================================

-- ------------------------------------------------------------
-- 1) roles.activo
-- ------------------------------------------------------------
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- ------------------------------------------------------------
-- 2) listar_roles_admin — reemplaza la versión de b3-roles-permisos.sql.
--    p_incluir_inactivos=false (comportamiento por defecto, igual que
--    antes) para no afectar el selector de "cambiar rol" que ya está en
--    producción. La pantalla nueva de administración de roles la llama
--    con true para ver también los desactivados.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.listar_roles_admin();
CREATE OR REPLACE FUNCTION public.listar_roles_admin(p_incluir_inactivos boolean DEFAULT false)
RETURNS TABLE (
  id uuid,
  nombre text,
  activo boolean,
  cantidad_usuarios bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver roles.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT r.id, r.nombre, r.activo, COUNT(u.id) AS cantidad_usuarios
    FROM public.roles r
    LEFT JOIN public.usuarios u ON u.role_id = r.id
    WHERE p_incluir_inactivos OR r.activo = true
    GROUP BY r.id, r.nombre, r.activo
    ORDER BY r.nombre;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_roles_admin(boolean) TO anon, authenticated;

-- ------------------------------------------------------------
-- 3) crear_rol(p_nombre)
--    Crea un rol nuevo y le genera automáticamente las 57 filas
--    canónicas de permisos (permitido=false por defecto: un rol nuevo
--    arranca sin acceso a nada hasta que el Dueño/Administrador le
--    otorgue permisos explícitamente con actualizar_permisos_rol).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_rol(p_nombre text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nombre text;
  v_role_id uuid;
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'crear') THEN
    RAISE EXCEPTION 'No tenés permiso para crear roles.' USING ERRCODE = '42501';
  END IF;

  v_nombre := trim(p_nombre);
  IF v_nombre IS NULL OR v_nombre = '' THEN
    RAISE EXCEPTION 'El nombre del rol es obligatorio.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.roles WHERE lower(nombre) = lower(v_nombre)) THEN
    RAISE EXCEPTION 'Ya existe un rol con ese nombre.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.roles (nombre, activo) VALUES (v_nombre, true)
    RETURNING id INTO v_role_id;

  -- Generar la matriz canónica completa en false (sin acceso por defecto):
  -- las 14 secciones reales con [ver,crear,editar,borrar] ...
  INSERT INTO public.permisos (role_id, seccion, accion, permitido)
    SELECT v_role_id, s.seccion, a.accion, false
    FROM (VALUES ('productos'),('categorias'),('almacenes'),('stock'),
                 ('transferencias'),('vales_salida'),('ventas'),('reportes'),
                 ('usuarios'),('presentaciones'),('auditoria'),('turnos'),
                 ('comunicacion'),('unidades')) AS s(seccion)
    CROSS JOIN (VALUES ('ver'),('crear'),('editar'),('borrar')) AS a(accion);

  -- ... más el 'editar_any' extra que solo existe para 'turnos' (57 filas totales).
  INSERT INTO public.permisos (role_id, seccion, accion, permitido)
    VALUES (v_role_id, 'turnos', 'editar_any', false);

  RETURN v_role_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_rol(text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 4) editar_rol(p_role_id, p_nombre) — renombrar un rol.
--    Protege el nombre reservado "Dueño": varias funciones existentes
--    (asignar_rol_usuario, cambiar_estado_usuario, el trigger
--    proteger_ultimo_dueno) identifican al Dueño por el nombre exacto
--    'Dueño'. Renombrarlo rompería esa protección real, así que no se
--    permite ni renombrarlo a otra cosa ni ponerle "Dueño" a otro rol.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.editar_rol(p_role_id uuid, p_nombre text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nombre_actual text;
  v_nombre_nuevo text;
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'editar') THEN
    RAISE EXCEPTION 'No tenés permiso para editar roles.' USING ERRCODE = '42501';
  END IF;

  SELECT nombre INTO v_nombre_actual FROM public.roles WHERE id = p_role_id;
  IF v_nombre_actual IS NULL THEN
    RAISE EXCEPTION 'Ese rol no existe.' USING ERRCODE = 'P0002';
  END IF;

  v_nombre_nuevo := trim(p_nombre);
  IF v_nombre_nuevo IS NULL OR v_nombre_nuevo = '' THEN
    RAISE EXCEPTION 'El nombre del rol es obligatorio.' USING ERRCODE = '22023';
  END IF;

  IF v_nombre_actual = 'Dueño' OR v_nombre_nuevo = 'Dueño' THEN
    RAISE EXCEPTION 'El rol "Dueño" no se puede renombrar ni reasignar a otro rol.' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.roles WHERE lower(nombre) = lower(v_nombre_nuevo) AND id <> p_role_id) THEN
    RAISE EXCEPTION 'Ya existe un rol con ese nombre.' USING ERRCODE = '23505';
  END IF;

  UPDATE public.roles SET nombre = v_nombre_nuevo WHERE id = p_role_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.editar_rol(uuid, text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 5) activar_desactivar_rol(p_role_id, p_activo)
--    Un rol desactivado deja de ofrecerse en el selector de "cambiar
--    rol" (listar_roles_admin con p_incluir_inactivos=false), pero los
--    usuarios que ya lo tengan asignado NO pierden acceso automáticamente
--    (eso requeriría decidir a qué rol pasarlos, y no es lo que pidió
--    Robert). Protege al rol "Dueño": no se puede desactivar.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activar_desactivar_rol(p_role_id uuid, p_activo boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nombre text;
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'editar') THEN
    RAISE EXCEPTION 'No tenés permiso para editar roles.' USING ERRCODE = '42501';
  END IF;

  SELECT nombre INTO v_nombre FROM public.roles WHERE id = p_role_id;
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'Ese rol no existe.' USING ERRCODE = 'P0002';
  END IF;

  IF v_nombre = 'Dueño' AND p_activo = false THEN
    RAISE EXCEPTION 'El rol "Dueño" no se puede desactivar.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.roles SET activo = p_activo WHERE id = p_role_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activar_desactivar_rol(uuid, boolean) TO anon, authenticated;

-- ------------------------------------------------------------
-- 6) eliminar_rol(p_role_id) — borrado seguro.
--    Solo permite eliminar si: no es "Dueño" y ningún usuario lo tiene
--    asignado actualmente. Si algún usuario lo usa, se rechaza con un
--    mensaje claro (Robert debe reasignarlos primero) en vez de dejar
--    usuarios con role_id huérfano.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eliminar_rol(p_role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nombre text;
  v_usuarios_con_rol int;
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'borrar') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar roles.' USING ERRCODE = '42501';
  END IF;

  SELECT nombre INTO v_nombre FROM public.roles WHERE id = p_role_id;
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'Ese rol no existe.' USING ERRCODE = 'P0002';
  END IF;

  IF v_nombre = 'Dueño' THEN
    RAISE EXCEPTION 'El rol "Dueño" no se puede eliminar.' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_usuarios_con_rol FROM public.usuarios WHERE role_id = p_role_id;
  IF v_usuarios_con_rol > 0 THEN
    RAISE EXCEPTION 'No se puede eliminar: % usuario(s) todavía tienen este rol asignado. Reasignalos primero.', v_usuarios_con_rol USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.permisos WHERE role_id = p_role_id;
  DELETE FROM public.roles WHERE id = p_role_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eliminar_rol(uuid) TO anon, authenticated;

-- ------------------------------------------------------------
-- 7) actualizar_permisos_rol(p_role_id, p_permisos jsonb)
--    Reemplaza en bloque los permisos "permitido" de un rol.
--    p_permisos: array de objetos [{"seccion":"ventas","accion":"ver","permitido":true}, ...]
--    Solo actualiza filas EXISTENTES (seccion/accion ya validados por el
--    CHECK de la tabla al crearse el rol) — no inserta combinaciones
--    nuevas ni permite secciones/acciones inventadas por el frontend.
--    Protege al rol "Dueño": sus permisos no se pueden tocar desde acá
--    (evita que alguien se quite/le quite permisos administrativos al
--    Dueño por error y quede el sistema inoperable).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.actualizar_permisos_rol(p_role_id uuid, p_permisos jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nombre text;
  v_item jsonb;
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'editar') THEN
    RAISE EXCEPTION 'No tenés permiso para editar permisos.' USING ERRCODE = '42501';
  END IF;

  SELECT nombre INTO v_nombre FROM public.roles WHERE id = p_role_id;
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'Ese rol no existe.' USING ERRCODE = 'P0002';
  END IF;

  IF v_nombre = 'Dueño' THEN
    RAISE EXCEPTION 'Los permisos del rol "Dueño" no se pueden modificar.' USING ERRCODE = 'P0001';
  END IF;

  IF p_permisos IS NULL OR jsonb_typeof(p_permisos) <> 'array' THEN
    RAISE EXCEPTION 'Formato de permisos inválido.' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_permisos) LOOP
    UPDATE public.permisos
      SET permitido = (v_item->>'permitido')::boolean
      WHERE role_id = p_role_id
        AND seccion = (v_item->>'seccion')
        AND accion = (v_item->>'accion');
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.actualizar_permisos_rol(uuid, jsonb) TO anon, authenticated;
