-- Disposable CI fixture: create the existing plural Dependientas role and
-- its disabled merma/create permission before the permission migration runs.
DO $fixture$
DECLARE
  v_role uuid;
BEGIN
  INSERT INTO public.roles(nombre,activo)
  VALUES('Dependientas',true)
  ON CONFLICT (nombre) DO NOTHING;

  SELECT id INTO v_role
  FROM public.roles
  WHERE lower(btrim(nombre))='dependientas'
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Could not prepare the Dependientas role fixture';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.permisos
    WHERE role_id=v_role AND seccion='mermas' AND accion='crear'
  ) THEN
    INSERT INTO public.permisos(role_id,seccion,accion,permitido)
    VALUES(v_role,'mermas','crear',false);
  ELSE
    UPDATE public.permisos
    SET permitido=false
    WHERE role_id=v_role AND seccion='mermas' AND accion='crear';
  END IF;
END
$fixture$;
