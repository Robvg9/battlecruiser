-- Allow password login/recovery to resolve either username or account email.
-- Keep the public-to-auth mapping behind service_role only; never expose the address through the PWA.
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
    AND (
      lower(trim(au.email)) = lower(trim(p_nombre))
      OR lower(trim(u.nombre)) = lower(trim(p_nombre))
    )
  ORDER BY CASE WHEN lower(trim(au.email)) = lower(trim(p_nombre)) THEN 0 ELSE 1 END
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.obtener_email_login_por_nombre(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_email_login_por_nombre(text) TO service_role;
