-- Keep operational creation permission separate from owner/admin authority.
-- A worker may have turnos:crear to open their own assigned session; that must not
-- grant administrator visibility or access to owner-only cash/jornada operations.
BEGIN;

CREATE OR REPLACE FUNCTION public.bc_actor_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.tiene_permiso('turnos','editar_any')
      OR public.tiene_permiso('ciclos','editar_any');
$function$;

COMMENT ON FUNCTION public.bc_actor_is_admin() IS
  'Returns true only for owner/admin-level edit_any permissions. Creation permissions never confer administrator authority.';

COMMIT;
