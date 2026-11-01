\set ON_ERROR_STOP on
-- Static SQL contract for the production sequential legacy-session open guard.
-- This runs in the disposable Step 7 PostgreSQL 17 database after all migrations.
DO $overdue$
DECLARE
  v_definition text := lower(pg_get_functiondef(
    'public.bc_iniciar_turno_sesion_secuencial(uuid)'::regprocedure
  ));
BEGIN
  IF position('if s.fecha > v_fecha_operativa then' in v_definition)=0 THEN
    RAISE EXCEPTION 'FAIL: overdue opening must be allowed only on/after its scheduled date';
  END IF;
  IF position('if s.fecha <> v_fecha_operativa then' in v_definition)>0
     OR position('la fecha de esta sesión ya pasó' in v_definition)>0 THEN
    RAISE EXCEPTION 'FAIL: strict same-day equality still blocks overdue next sessions';
  END IF;
  IF position('a.usuario_id <> auth.uid()' in v_definition)=0
     OR position('retirado_at is null' in v_definition)=0 THEN
    RAISE EXCEPTION 'FAIL: assigned-worker validation was weakened';
  END IF;
  IF position('x.estado not in (''completada'',''cancelada'')' in v_definition)=0 THEN
    RAISE EXCEPTION 'FAIL: unresolved predecessor sequence validation is missing';
  END IF;
  IF position('ya existe una sesión operativa abierta en este turno' in v_definition)=0
     OR position('ya tenés una sesión operativa abierta' in v_definition)=0 THEN
    RAISE EXCEPTION 'FAIL: active-session uniqueness guards are missing';
  END IF;
  IF position('insert into public.turno_tramos' in v_definition)=0
     OR position('insert into public.turno_eventos' in v_definition)=0 THEN
    RAISE EXCEPTION 'FAIL: session start must persist the active tranche and audit event';
  END IF;
  RAISE NOTICE 'PASS overdue legacy-session open guard: assigned worker, next unresolved session, no future dates, no overlapping active session, and audited tranche creation.';
END;
$overdue$;
