-- Permit authenticated users to evaluate the existing involvement RLS policies on public.turnos.
-- The table remains RLS-protected; anonymous access and direct writes are not granted.
-- Both dependent policies are required because they use EXISTS (SELECT ... FROM public.turnos).
BEGIN;

DO $guard$
DECLARE
  v_turnos_rls boolean;
  v_tramos_rls boolean;
  v_sesiones_rls boolean;
BEGIN
  SELECT relrowsecurity INTO v_turnos_rls
  FROM pg_class
  WHERE oid = 'public.turnos'::regclass;

  SELECT relrowsecurity INTO v_tramos_rls
  FROM pg_class
  WHERE oid = 'public.turno_tramos'::regclass;

  SELECT relrowsecurity INTO v_sesiones_rls
  FROM pg_class
  WHERE oid = 'public.turno_sesiones'::regclass;

  IF v_turnos_rls IS DISTINCT FROM true OR v_tramos_rls IS DISTINCT FROM true
     OR v_sesiones_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Refusing authenticated SELECT grant: RLS must remain enabled on public.turnos, public.turno_tramos and public.turno_sesiones';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'turnos'
      AND policyname = 'turnos_select_involucrados'
      AND cmd = 'SELECT'
      AND 'authenticated' = ANY (roles)
  ) THEN
    RAISE EXCEPTION
      'Refusing authenticated SELECT grant: expected turnos_select_involucrados policy is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'turno_tramos'
      AND policyname = 'turno_tramos_select_involucrados'
      AND cmd = 'SELECT'
      AND 'authenticated' = ANY (roles)
  ) THEN
    RAISE EXCEPTION
      'Refusing authenticated SELECT grant: expected turno_tramos_select_involucrados policy is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'turno_sesiones'
      AND policyname = 'turno_sesiones_select_involucrados'
      AND cmd = 'SELECT'
      AND 'authenticated' = ANY (roles)
  ) THEN
    RAISE EXCEPTION
      'Refusing authenticated SELECT grant: expected turno_sesiones_select_involucrados policy is missing';
  END IF;
END
$guard$;

REVOKE SELECT ON TABLE public.turnos FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.turnos TO authenticated;

COMMIT;
