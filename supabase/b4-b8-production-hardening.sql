-- BattleCruiser production hardening/reconciliation — 2026-08-16
-- This file documents the production-safe corrections applied after auditing
-- the B4/B5/B7/B8 specifications against the live Supabase schema.
-- It is intentionally idempotent and should be applied AFTER the base B4/B5/B7/B8 SQL if rebuilding an environment.

-- Permission vocabulary required by B4/B7/B8.
ALTER TABLE public.permisos DROP CONSTRAINT IF EXISTS permisos_seccion_check;
ALTER TABLE public.permisos ADD CONSTRAINT permisos_seccion_check CHECK (seccion = ANY (ARRAY['productos','categorias','almacenes','stock','transferencias','vales_salida','ventas','reportes','usuarios','presentaciones','auditoria','turnos','comunicacion']));
ALTER TABLE public.permisos DROP CONSTRAINT IF EXISTS permisos_accion_check;
ALTER TABLE public.permisos ADD CONSTRAINT permisos_accion_check CHECK (accion = ANY (ARRAY['ver','crear','editar','borrar','editar_any']));

INSERT INTO public.permisos(role_id,seccion,accion,permitido)
SELECT r.id,s.seccion,a.accion,true
FROM public.roles r
CROSS JOIN (VALUES ('auditoria'),('turnos'),('comunicacion')) s(seccion)
CROSS JOIN (VALUES ('ver'),('crear'),('editar'),('borrar')) a(accion)
WHERE r.nombre='Dueño'
ON CONFLICT (role_id,seccion,accion) DO UPDATE SET permitido=EXCLUDED.permitido;

INSERT INTO public.permisos(role_id,seccion,accion,permitido)
SELECT r.id,'turnos','editar_any',true FROM public.roles r WHERE r.nombre='Dueño'
ON CONFLICT (role_id,seccion,accion) DO UPDATE SET permitido=EXCLUDED.permitido;

-- Security policy: new operational RPCs are authenticated-only.
-- B7/B8 implementations require idempotency keys for state-changing operations.
-- B7 expected cash uses ventas.creado_por to isolate the worker's sales.
-- B8 messages use a UNIQUE partial index on idempotency_key.
-- See migration history for the exact production definitions.
