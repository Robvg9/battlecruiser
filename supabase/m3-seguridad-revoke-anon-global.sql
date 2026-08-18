-- BattleCruiser — Misión 3 — Seguridad: anon sin EXECUTE en ninguna RPC
-- Replica EXACTA de la migración ya aplicada en producción (Supabase
-- project "battlecruiser", papxnkkjtkxsitcsvcme):
--   20260817225451  m3_revoke_anon_execute_all_functions
--
-- CONTEXTO / por qué existe este archivo:
-- Todos los SQL base del repo (b3, b4, b5, b6, b7, b8) terminan con
--   GRANT EXECUTE ON FUNCTION ... TO anon, authenticated;
-- para cada RPC. Verificado directamente contra producción
-- (has_function_privilege('anon', <fn>, 'EXECUTE')): NINGUNA función de
-- public tiene hoy EXECUTE para anon — la política real es
-- "solo authenticated (y service_role donde corresponda)". Ese GRANT a
-- anon en los archivos base del repo NO refleja el estado real; producción
-- fue endurecida con esta migración puntual que nunca se retro-documentó
-- en los .sql base.
--
-- Esta migración es la fuente de verdad para "anon nunca ejecuta RPC de
-- negocio" y debe aplicarse SIEMPRE al final, después de crear/reemplazar
-- cualquier función — porque un futuro CREATE OR REPLACE FUNCTION sin este
-- paso vuelve a dejar el default (EXECUTE a PUBLIC) en Postgres. La segunda
-- sentencia (ALTER DEFAULT PRIVILEGES) es la que evita que esto se repita
-- para funciones creadas DESPUÉS de este punto.
--
-- NO reemplaza los GRANT ... TO authenticated de los archivos base (esos
-- siguen siendo necesarios); solo quita lo que nunca debió quedar abierto.

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

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
