-- BattleCruiser — MICRO-MISIÓN 003 / 004
-- Alinear bc_actor_is_admin() con la autoridad real del sistema (B3 + listar_turnos).
--
-- Problema: las RPC TURNO (bc_crear_turno, bc_editar_dias_turno, etc.) usan
--   IF NOT public.bc_actor_is_admin() THEN RAISE EXCEPTION 'Solo ADMIN ...';
-- Si bc_actor_is_admin() solo reconoce el string de rol "ADMIN" y no el rol
-- operativo "Dueño" ni la matriz tiene_permiso, el Dueño ve el botón en FE
-- (via tiene_permiso / fallback) pero el backend rechaza la creación.
--
-- Autoridad reutilizada (no se inventa un segundo sistema):
--   1) public.tiene_permiso('turnos','editar_any')  — misma que listar_turnos
--   2) public.tiene_permiso('turnos','crear')
--   3) public.tiene_permiso('ciclos','editar_any')  — compatibilidad legacy
--   4) rol activo "Dueño" (B3) o variantes ADMIN / Administrador
--
-- SECURITY DEFINER + search_path fijo. Solo authenticated (no anon).

CREATE OR REPLACE FUNCTION public.bc_actor_is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_rol text;
  v_activo boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.activo, r.nombre
    INTO v_activo, v_rol
  FROM public.usuarios u
  LEFT JOIN public.roles r ON r.id = u.role_id
  WHERE u.id = uid;

  IF v_activo IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  -- Matriz de permisos (fuente de verdad B3)
  IF public.tiene_permiso('turnos', 'editar_any') THEN
    RETURN true;
  END IF;
  IF public.tiene_permiso('turnos', 'crear') THEN
    RETURN true;
  END IF;
  IF public.tiene_permiso('ciclos', 'editar_any') THEN
    RETURN true;
  END IF;
  IF public.tiene_permiso('ciclos', 'crear') THEN
    RETURN true;
  END IF;

  -- Roles administrativos del sistema (Dueño = B3; ADMIN = contrato TURNO)
  IF v_rol IS NULL THEN
    RETURN false;
  END IF;
  IF v_rol = 'Dueño' THEN
    RETURN true;
  END IF;
  IF lower(v_rol) IN ('admin', 'administrador') THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.bc_actor_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc_actor_is_admin() TO authenticated;
