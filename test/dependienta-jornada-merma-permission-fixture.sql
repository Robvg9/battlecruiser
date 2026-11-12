-- Disposable CI fixture: start the existing Dependienta role with
-- merma/create disabled, then verify the migration enables only that action.
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
    RAISE EXCEPTION 'The Step 5 disposable fixture must seed a Dependienta role';
  END IF;

  INSERT INTO public.permisos(role_id,seccion,accion,permitido)
  VALUES(v_role,'mermas','crear',false)
  ON CONFLICT (role_id,seccion,accion)
  DO UPDATE SET permitido=false;
END
$fixture$;
