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

-- ============================================================
-- Misión 3 fix (2026-08-17): cerrar el hueco real entre este archivo y
-- producción. Cada GRANT EXECUTE ... TO anon, authenticated de los archivos
-- base (b3/b4/b5/b6/b7/b8) sigue escrito literalmente "TO anon,
-- authenticated" — pero en producción HOY ninguna función de public tiene
-- EXECUTE para anon (verificado con has_function_privilege una por una).
-- Este archivo decía "las RPC nuevas son solo para authenticated" pero
-- nunca revocaba nada: si alguien reconstruye un entorno aplicando los
-- archivos base + este de "hardening" en orden, como dice el encabezado de
-- arriba, los GRANT de los archivos base vuelven a abrir anon y esta
-- sección no lo corregía. Ahora sí: revoca anon explícitamente sobre TODAS
-- las funciones de public, para que este archivo deje el estado real de
-- producción sin importar qué haya hecho el GRANT de la base.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon;', r.sig);
  END LOOP;
END $$;

-- PUBLIC (el rol implícito) tampoco debe tener EXECUTE por defecto en
-- funciones nuevas futuras de este esquema.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
