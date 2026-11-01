-- Supabase service role exists in production; model it in the disposable PG harness.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$roles$;

-- Match the production Turno maestro identity columns in the disposable Step 5 schema.
ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS ciclo_id uuid,
  ADD COLUMN IF NOT EXISTS sesion_id uuid;

-- Disposable-only shape for owner cash discrepancy tests.
-- Production already has turno_diferencias; the Step 7 sandbox fixture does not.
-- Minimal disposable shapes for session-bound finance/inventory records
-- checked by the legacy cancellation guard. Production has the full schemas.
CREATE TABLE IF NOT EXISTS public.turno_entregas_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id uuid NOT NULL,
  turno_sesion_id uuid NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE'
);
CREATE TABLE IF NOT EXISTS public.turno_descuentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id uuid NOT NULL,
  turno_sesion_id uuid NOT NULL,
  monto numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.turno_diferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id uuid NOT NULL,
  turno_sesion_id uuid NOT NULL,
  categoria text NOT NULL CHECK (
    categoria IN ('DINERO','INVENTARIO','MERMA','GASTO','REINVERSION','OTRO')
  ),
  referencia text,
  esperado numeric,
  declarado numeric,
  diferencia numeric NOT NULL,
  usuario_responsable uuid,
  aprobado boolean NOT NULL DEFAULT false,
  aprobado_por uuid,
  aprobado_at timestamptz,
  comentario text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Mirror the relevant LIVE RLS chain. This fixture proves the missing ACL before
-- the forward migration and verifies the narrow grant afterwards.
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT SELECT ON TABLE public.turno_asignaciones, public.turno_sesiones, public.turno_tramos TO authenticated;
REVOKE SELECT ON TABLE public.turnos FROM PUBLIC, anon, authenticated;

ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turno_asignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turno_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turno_tramos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS turno_asignaciones_select_involucrados ON public.turno_asignaciones;
CREATE POLICY turno_asignaciones_select_involucrados
ON public.turno_asignaciones FOR SELECT TO authenticated
USING (
  public.bc_actor_is_admin()
  OR usuario_id = (SELECT auth.uid())
  OR asignado_por = (SELECT auth.uid())
);

DROP POLICY IF EXISTS turnos_select_involucrados ON public.turnos;
CREATE POLICY turnos_select_involucrados
ON public.turnos FOR SELECT TO authenticated
USING (
  public.bc_actor_is_admin()
  OR creado_por = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_id = turnos.id
      AND a.usuario_id = (SELECT auth.uid())
      AND a.retirado_at IS NULL
  )
);

DROP POLICY IF EXISTS turno_sesiones_select_involucrados ON public.turno_sesiones;
CREATE POLICY turno_sesiones_select_involucrados
ON public.turno_sesiones FOR SELECT TO authenticated
USING (
  public.bc_actor_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id = turno_sesiones.id
      AND a.usuario_id = (SELECT auth.uid())
      AND a.retirado_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.turnos t
    WHERE t.id = turno_sesiones.turno_id
      AND t.creado_por = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS turno_tramos_select_involucrados ON public.turno_tramos;
CREATE POLICY turno_tramos_select_involucrados
ON public.turno_tramos FOR SELECT TO authenticated
USING (
  public.bc_actor_is_admin()
  OR usuario_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.turnos t
    WHERE t.id = turno_tramos.turno_id
      AND t.creado_por = (SELECT auth.uid())
  )
);

INSERT INTO public.turnos(
  id, usuario_id, usuario_nombre, almacen_id, fecha, estado,
  creado_por, created_by, estado_maestro, dias_turno
) VALUES (
  '95000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  'Responsable RLS fixture',
  '10000000-0000-0000-0000-000000000001',
  CURRENT_DATE, 'ABIERTO',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'EN_CURSO', NULL
);

INSERT INTO public.turno_sesiones(
  id, turno_id, almacen_id, numero_dia, bloque, fecha, estado
) VALUES (
  '96000000-0000-0000-0000-000000000001',
  '95000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  1, 'MANANA', CURRENT_DATE, 'EN_CURSO'
);

INSERT INTO public.turno_asignaciones(
  turno_sesion_id, turno_id, usuario_id, asignado_por
) VALUES (
  '96000000-0000-0000-0000-000000000001',
  '95000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001'
);

INSERT INTO public.turno_tramos(
  id, turno_sesion_id, turno_id, usuario_id, tipo, estado
) VALUES (
  '97000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000001',
  '95000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  'NORMAL', 'ACTIVO'
);

-- Regression setup: the worker is assigned and the row policy permits their
-- own tranche, but evaluation fails because the policy also reads turnos.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
SELECT set_config('test.bc_admin','false',true);
DO $before_acl_fix$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM count(*)
    FROM public.turno_tramos
    WHERE id='97000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;

  IF NOT v_denied THEN
    RAISE EXCEPTION 'FAIL: fixture did not reproduce the missing authenticated SELECT on public.turnos';
  END IF;
  RAISE NOTICE 'PASS: reproduced authenticated turnos ACL denial through turno_tramos RLS';
END
$before_acl_fix$;
ROLLBACK;
