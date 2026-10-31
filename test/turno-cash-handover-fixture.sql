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
