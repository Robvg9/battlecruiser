BEGIN;

CREATE TABLE IF NOT EXISTS public.bc_password_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_username text NOT NULL,
  target_name text NOT NULL,
  status text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (status IN ('PENDIENTE','PROCESANDO','APROBADA','RECHAZADA','EXPIRADA','COMPLETADA')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  notification_status text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (notification_status IN ('PENDIENTE','ENVIADA','FALLIDA')),
  notification_sent_at timestamptz,
  temporary_password_salt text,
  temporary_password_hash text,
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
  WHERE status IN ('PENDIENTE','PROCESANDO','APROBADA');

ALTER TABLE public.bc_password_recovery_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bc_password_recovery_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bc_password_recovery_requests TO service_role;

COMMENT ON TABLE public.bc_password_recovery_requests IS
  'Solicitudes de recuperación de contraseña dirigidas a Administración. Acceso únicamente desde Edge Function con service_role; nunca contiene contraseñas.';

-- A reset account remains authenticated but receives no operational
-- permissions until its owner-set temporary password has been replaced.
CREATE OR REPLACE FUNCTION public.permisos_usuario_actual()
RETURNS TABLE(seccion text, accion text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.seccion, p.accion
  FROM public.permisos p
  JOIN public.usuarios u ON u.role_id = p.role_id
  WHERE u.id = auth.uid()
    AND p.permitido = true
    AND coalesce((auth.jwt()->'app_metadata'->>'bc_password_change_required')::boolean, false) = false;
$function$;

CREATE OR REPLACE FUNCTION public.tiene_permiso(p_seccion text, p_accion text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(
    (
      SELECT p.permitido
      FROM public.usuarios u
      JOIN public.permisos p ON p.role_id = u.role_id
      WHERE u.id = auth.uid()
        AND u.activo = true
        AND p.seccion = p_seccion
        AND p.accion = p_accion
        AND coalesce((auth.jwt()->'app_metadata'->>'bc_password_change_required')::boolean, false) = false
    ),
    false
  );
$function$;

COMMIT;
