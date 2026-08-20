-- Migración m10_crear_usuario_interno
-- Ya fue APLICADA en producción (proyecto papxnkkjtkxsitcsvcme) el 2026-08-19
-- como migración `20260819021156_m10_crear_usuario_interno`.
-- Este archivo queda en el repo como registro/documentación retroactiva:
-- NO se re-ejecuta contra producción al agregarlo (Backend Mission 2).
--
-- Definición extraída EXACTA vía pg_get_functiondef() el 2026-08-20
-- (Backend Mission 2), sin modificaciones.
--
-- Contexto: crea el perfil interno en public.usuarios para un usuario que
-- ya existe en auth.users (creado vía signUp() con cliente Supabase
-- efímero desde el frontend), porque RLS en `usuarios` no permite INSERT
-- directo desde el cliente. Es el mismo patrón SECURITY DEFINER +
-- tiene_permiso() que asignar_rol_usuario. Queda con role_id = NULL
-- (el rol se asigna después vía asignar_rol_usuario).

CREATE OR REPLACE FUNCTION public.crear_usuario_interno(p_id uuid, p_nombre text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'crear') THEN
    RAISE EXCEPTION 'Sin permiso para crear usuarios';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'p_id es requerido';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_id) THEN
    RAISE EXCEPTION 'El usuario de autenticación no existe';
  END IF;

  IF EXISTS (SELECT 1 FROM public.usuarios WHERE id = p_id) THEN
    RAISE EXCEPTION 'Ya existe un perfil interno para este usuario';
  END IF;

  INSERT INTO public.usuarios (id, nombre, role_id, activo)
  VALUES (p_id, COALESCE(NULLIF(TRIM(p_nombre), ''), 'Sin nombre'), NULL, true);
END;
$function$
;

-- Grants confirmados en vivo el 2026-08-20 (post Backend Mission 1,
-- migraciones revoke_anon_roles_admin_functions / revoke_public_roles_admin_functions):
-- únicamente service_role, authenticated y postgres tienen EXECUTE.
-- anon y PUBLIC fueron revocados explícitamente. No repetir el REVOKE acá
-- (ya vive en supabase/revoke_anon_roles_admin_functions.sql) para no
-- duplicar migraciones documentales sobre el mismo objeto.
