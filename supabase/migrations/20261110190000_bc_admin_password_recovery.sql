BEGIN;

CREATE TABLE IF NOT EXISTS public.bc_password_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_username text NOT NULL,
  target_name text NOT NULL,
  status text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (status IN ('PENDIENTE','PROCESANDO','APROBADA','RECHAZADA','EXPIRADA')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  notification_status text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (notification_status IN ('PENDIENTE','ENVIADA','FALLIDA')),
  notification_sent_at timestamptz,
  processing_by uuid REFERENCES auth.users(id),
  processing_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id),
  rejected_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS bc_password_recovery_queue_idx
  ON public.bc_password_recovery_requests (status, requested_at DESC);

CREATE INDEX IF NOT EXISTS bc_password_recovery_target_idx
  ON public.bc_password_recovery_requests (target_user_id, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS bc_password_recovery_one_open_request_uidx
  ON public.bc_password_recovery_requests (target_user_id)
  WHERE status IN ('PENDIENTE','PROCESANDO');

ALTER TABLE public.bc_password_recovery_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bc_password_recovery_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bc_password_recovery_requests TO service_role;

COMMENT ON TABLE public.bc_password_recovery_requests IS
  'Solicitudes de recuperación de contraseña dirigidas a Administración. Acceso únicamente desde Edge Function con service_role; nunca contiene contraseñas.';

COMMIT;
