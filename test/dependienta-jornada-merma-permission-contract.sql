-- The role may submit an adjustment request; it cannot approve it or edit any stock.
DO $test$
DECLARE
  v_allowed boolean;
BEGIN
  SELECT p.permitido INTO v_allowed
  FROM public.permisos p
  JOIN public.roles r ON r.id=p.role_id
  WHERE lower(btrim(r.nombre))='dependienta'
    AND p.seccion='mermas'
    AND p.accion='crear';
  IF v_allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Dependienta must be able to submit a merma request from her assigned Jornada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.permisos p
    JOIN public.roles r ON r.id=p.role_id
    WHERE lower(btrim(r.nombre))='dependienta'
      AND p.seccion='mermas'
      AND p.accion IN ('editar','editar_any','borrar')
      AND p.permitido=true
  ) THEN
    RAISE EXCEPTION 'Dependienta must not receive merma approval or direct editing permissions';
  END IF;
END
$test$;
