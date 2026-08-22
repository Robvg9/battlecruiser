-- Login por nombre de usuario
-- Aplicada en producción como migración: login_por_nombre_usuario
-- Fecha: 2026-08-22
--
-- Supabase Auth sigue autenticando mediante email/password internamente.
-- Esta RPC resuelve el nombre interno (public.usuarios.nombre) al email
-- correspondiente de auth.users sin exponer una lectura directa de auth.users.

CREATE OR REPLACE FUNCTION public.obtener_email_login_por_nombre(p_nombre text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT au.email
  FROM public.usuarios u
  JOIN auth.users au ON au.id = u.id
  WHERE u.activo = true
    AND lower(trim(u.nombre)) = lower(trim(p_nombre))
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.obtener_email_login_por_nombre(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_email_login_por_nombre(text) TO anon, authenticated;
