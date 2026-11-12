BEGIN;

-- Dependienta may register a merma against her active assigned Jornada.
-- This is request creation only: no approval, arbitrary stock edits, or access
-- to another worker's operations is granted. The Jornada RPC enforces session
-- ownership independently of this role-level permission.
UPDATE public.permisos p
SET permitido=true
FROM public.roles r
WHERE p.role_id=r.id
  AND lower(btrim(r.nombre))='dependienta'
  AND p.seccion='mermas'
  AND p.accion='crear';

COMMIT;
