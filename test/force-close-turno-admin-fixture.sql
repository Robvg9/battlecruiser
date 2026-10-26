-- Disposable PostgreSQL 17 fixture only; never executed against LIVE.
ALTER TABLE public.turno_sesiones
  ADD COLUMN IF NOT EXISTS cierre_forzado boolean NOT NULL DEFAULT false;
