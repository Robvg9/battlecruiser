BEGIN;

-- Dependienta may submit a merma request for her assigned Jornada.
-- Insert the capability when a role/permission pair is missing (for example,
-- fresh installations); preserve the rest of the role matrix and never grant
-- review, arbitrary editing, deletion or approval.
INSERT INTO public.permisos(role_id,seccion,accion,permitido)
SELECT r.id,'mermas','crear',true
FROM public.roles r
WHERE lower(btrim(r.nombre)) IN ('dependienta','dependientas')
ON CONFLICT (role_id,seccion,accion)
DO UPDATE SET permitido=true;

COMMIT;
