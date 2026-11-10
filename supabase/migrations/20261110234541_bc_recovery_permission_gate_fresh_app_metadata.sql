BEGIN;

-- app_metadata is copied into the JWT at issuance. Existing sessions may keep
-- an older claim until refresh, so operational authorization must read the
-- current server-controlled value from auth.users instead of auth.jwt().
CREATE OR REPLACE FUNCTION public.permisos_usuario_actual()
RETURNS TABLE(seccion text, accion text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.seccion, p.accion
  FROM public.permisos p
  JOIN public.usuarios u ON u.role_id = p.role_id
  JOIN auth.users auth_user ON auth_user.id = u.id
  WHERE u.id = auth.uid()
    AND u.activo = true
    AND coalesce(u.archivado, false) = false
    AND p.permitido = true
    AND coalesce((auth_user.raw_app_meta_data->>'bc_password_change_required')::boolean, false) = false;
$function$;

CREATE OR REPLACE FUNCTION public.tiene_permiso(p_seccion text, p_accion text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(
    (
      SELECT p.permitido
      FROM public.usuarios u
      JOIN public.permisos p ON p.role_id = u.role_id
      JOIN auth.users auth_user ON auth_user.id = u.id
      WHERE u.id = auth.uid()
        AND u.activo = true
        AND coalesce(u.archivado, false) = false
        AND p.seccion = p_seccion
        AND p.accion = p_accion
        AND coalesce((auth_user.raw_app_meta_data->>'bc_password_change_required')::boolean, false) = false
    ),
    false
  );
$function$;

COMMIT;
