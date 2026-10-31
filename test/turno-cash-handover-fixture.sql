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
