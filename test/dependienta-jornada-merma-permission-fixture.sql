-- Disposable CI fixture: create the plural Dependientas role if the base
-- fixture does not seed application roles, and start its merma/create disabled.
DO $fixture$
DECLARE
  v_role uuid;
BEGIN
  SELECT id INTO v_role
  FROM public.roles
  WHERE lower(btrim(nombre)) IN ('dependienta','dependientas')
  ORDER BY CASE WHEN lower(btrim(nombre))='dependienta' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_role IS NULL THEN
    INSERT INTO public.roles(nombre,activo)
    VALUES('Dependientas',true)
    RETURNING id INTO v_role;
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
