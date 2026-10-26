\set ON_ERROR_STOP on
-- Runs only in the fresh disposable PostgreSQL database created by the Step 7 CI harness.
INSERT INTO public.almacenes(id,nombre,tipo,activo) VALUES
 ('10000000-0000-0000-0000-000000000004','Force-close fixture D','VENTA',true),
 ('10000000-0000-0000-0000-000000000005','Force-close fixture E','VENTA',true),
 ('10000000-0000-0000-0000-000000000006','Force-close fixture F','VENTA',true);
INSERT INTO public.turnos
 (id,usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,estado_maestro,dias_turno)
VALUES
 ('90000000-0000-0000-0000-000000000041','20000000-0000-0000-0000-000000000001','Dueño fixture','10000000-0000-0000-0000-000000000001',current_date-10,'ABIERTO','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','EN_CURSO',2),
 ('90000000-0000-0000-0000-000000000042','20000000-0000-0000-0000-000000000001','Dueño fixture','10000000-0000-0000-0000-000000000002',current_date,'ABIERTO','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','EN_CURSO',1),
 ('90000000-0000-0000-0000-000000000043','20000000-0000-0000-0000-000000000001','Dueño fixture','10000000-0000-0000-0000-000000000003',current_date+2,'ABIERTO','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','EN_CURSO',1),
 ('90000000-0000-0000-0000-000000000044','20000000-0000-0000-0000-000000000001','Dueño fixture','10000000-0000-0000-0000-000000000004',current_date-10,'CERRADO','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','EN_CURSO',7),
 ('90000000-0000-0000-0000-000000000045','20000000-0000-0000-0000-000000000001','Dueño fixture','10000000-0000-0000-0000-000000000005',current_date-10,'ABIERTO','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','EN_CURSO',0),
 ('90000000-0000-0000-0000-000000000046','20000000-0000-0000-0000-000000000001','Dueño fixture','10000000-0000-0000-0000-000000000006',current_date-10,'ABIERTO','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','EN_CURSO',2);
INSERT INTO public.turno_sesiones
 (id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,updated_at,cierre_forzado)
VALUES
 ('91000000-0000-0000-0000-000000000041','90000000-0000-0000-0000-000000000041','10000000-0000-0000-0000-000000000001',1,'MANANA',current_date-10,'EN_CURSO',now(),false),
 ('91000000-0000-0000-0000-000000000042','90000000-0000-0000-0000-000000000041','10000000-0000-0000-0000-000000000001',2,'TARDE',current_date-9,'PENDIENTE',now(),false);
INSERT INTO public.turno_tramos
 (id,turno_id,turno_sesion_id,usuario_id,tipo,estado,inicio_at,fin_at)
VALUES
 ('92000000-0000-0000-0000-000000000041','90000000-0000-0000-0000-000000000041','91000000-0000-0000-0000-000000000041','20000000-0000-0000-0000-000000000001','NORMAL','ACTIVO',now()-interval '10 days',NULL);
INSERT INTO public.turno_jornada_programacion
 (id,turno_id,almacen_id,numero_dia,fecha,trabaja,responsable_id,
  hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,creado_por,actualizado_por)
VALUES
 ('93000000-0000-0000-0000-000000000046','90000000-0000-0000-0000-000000000046','10000000-0000-0000-0000-000000000006',1,current_date-10,true,
  '20000000-0000-0000-0000-000000000001','07:00','23:00','America/Havana',NULL,'PROGRAMADA',
  '20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
INSERT INTO public.turno_sesiones
 (id,turno_id,almacen_id,numero_dia,bloque,fecha,estado,updated_at,cierre_forzado,jornada_programacion_id)
VALUES
 ('91000000-0000-0000-0000-000000000046','90000000-0000-0000-0000-000000000046','10000000-0000-0000-0000-000000000006',1,'JORNADA',current_date-10,'EN_CURSO',now(),false,
  '93000000-0000-0000-0000-000000000046');
INSERT INTO public.turno_tramos
 (id,turno_id,turno_sesion_id,usuario_id,tipo,estado,inicio_at,fin_at)
VALUES
 ('92000000-0000-0000-0000-000000000046','90000000-0000-0000-0000-000000000046','91000000-0000-0000-0000-000000000046','20000000-0000-0000-0000-000000000001','NORMAL','ACTIVO',now()-interval '10 days',NULL);

DO $acl$
BEGIN
 IF has_function_privilege('anon','public.bc_forzar_cierre_turno_admin(uuid,text)','EXECUTE') THEN
   RAISE EXCEPTION 'FAIL: anon must not execute the force-close RPC';
 END IF;
 IF NOT has_function_privilege('authenticated','public.bc_forzar_cierre_turno_admin(uuid,text)','EXECUTE') THEN
   RAISE EXCEPTION 'FAIL: authenticated role lacks EXECUTE';
 END IF;
END; $acl$;

SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('test.bc_admin','false',false);
DO $unauth$
DECLARE rejected boolean := false;
BEGIN
 BEGIN
   PERFORM public.bc_forzar_cierre_turno_admin('90000000-0000-0000-0000-000000000041','Motivo administrativo suficientemente largo');
 EXCEPTION WHEN SQLSTATE '42501' THEN rejected := true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL: unauthenticated call was not rejected'; END IF;
END; $unauth$;

SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
DO $nonadmin$
DECLARE rejected boolean := false;
BEGIN
 BEGIN
   PERFORM public.bc_forzar_cierre_turno_admin('90000000-0000-0000-0000-000000000041','Motivo administrativo suficientemente largo');
 EXCEPTION WHEN SQLSTATE '42501' THEN rejected := true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL: non-ADMIN call was not rejected'; END IF;
 IF (SELECT estado FROM public.turnos WHERE id='90000000-0000-0000-0000-000000000041') IS DISTINCT FROM 'ABIERTO'
    OR (SELECT estado_maestro FROM public.turnos WHERE id='90000000-0000-0000-0000-000000000041') IS DISTINCT FROM 'EN_CURSO' THEN
   RAISE EXCEPTION 'FAIL: unauthorized call mutated target turn';
 END IF;
END; $nonadmin$;

SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('test.bc_admin','true',false);
DO $reason$
DECLARE rejected boolean := false;
BEGIN
 BEGIN
   PERFORM public.bc_forzar_cierre_turno_admin('90000000-0000-0000-0000-000000000041','corto');
 EXCEPTION WHEN SQLSTATE '22023' THEN rejected := true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL: short reason was not rejected'; END IF;
 rejected := false;
 BEGIN
   PERFORM public.bc_forzar_cierre_turno_admin('90000000-0000-0000-0000-000000000041',repeat('x',1001));
 EXCEPTION WHEN SQLSTATE '22023' THEN rejected := true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL: oversized reason was not rejected'; END IF;
END; $reason$;

DO $current$
DECLARE rejected boolean := false;
BEGIN
 BEGIN
   PERFORM public.bc_forzar_cierre_turno_admin('90000000-0000-0000-0000-000000000042','Motivo válido para prueba de guardas');
 EXCEPTION WHEN SQLSTATE '22023' THEN rejected := true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL: same-day turn must not be force-closed'; END IF;
END; $current$;

DO $future$
DECLARE rejected boolean := false;
BEGIN
 BEGIN
   PERFORM public.bc_forzar_cierre_turno_admin('90000000-0000-0000-0000-000000000043','Motivo válido para prueba de guardas');
 EXCEPTION WHEN SQLSTATE '22023' THEN rejected := true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL: future turn must not be force-closed'; END IF;
END; $future$;

DO $state$
DECLARE rejected boolean := false;
BEGIN
 BEGIN
   PERFORM public.bc_forzar_cierre_turno_admin('90000000-0000-0000-0000-000000000044','Motivo válido para prueba de guardas');
 EXCEPTION WHEN SQLSTATE 'P0001' THEN rejected := true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL: inconsistent/non-operational state must be rejected'; END IF;
 IF (SELECT estado FROM public.turnos WHERE id='90000000-0000-0000-0000-000000000044') IS DISTINCT FROM 'CERRADO'
    OR (SELECT estado_maestro FROM public.turnos WHERE id='90000000-0000-0000-0000-000000000044') IS DISTINCT FROM 'EN_CURSO' THEN
   RAISE EXCEPTION 'FAIL: invalid-state test mutated target turn';
 END IF;
END; $state$;

DO $period$
DECLARE rejected boolean := false;
BEGIN
 BEGIN
   PERFORM public.bc_forzar_cierre_turno_admin('90000000-0000-0000-0000-000000000045','Motivo válido para probar período');
 EXCEPTION WHEN SQLSTATE '22023' THEN rejected := true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL: unverifiable period must be rejected'; END IF;
END; $period$;

DO $modern_normal_guard$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    UPDATE public.turno_sesiones SET estado='COMPLETADA'
    WHERE id='91000000-0000-0000-0000-000000000046';
  EXCEPTION WHEN SQLSTATE '23514' THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'FAIL: modern jornada normal close bypassed the final-inventory guard'; END IF;
  IF (SELECT estado FROM public.turno_sesiones WHERE id='91000000-0000-0000-0000-000000000046') IS DISTINCT FROM 'EN_CURSO' THEN
    RAISE EXCEPTION 'FAIL: rejected normal close mutated the modern session';
  END IF;
END;
$modern_normal_guard$;

DO $successful_close$
DECLARE result jsonb;
BEGIN
 result := public.bc_forzar_cierre_turno_admin(
   '90000000-0000-0000-0000-000000000041',
   'El turno venció y requiere recuperación administrativa en entorno desechable.'
 );
 IF result->>'estado' IS DISTINCT FROM 'CERRADO'
    OR result->>'forzado' IS DISTINCT FROM 'true'
    OR result->>'requiere_revision_manual' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'FAIL: unexpected successful-close RPC response: %',result;
 END IF;
END; $successful_close$;
DO $successful_modern_close$
DECLARE result jsonb;
BEGIN
  result := public.bc_forzar_cierre_turno_admin(
    '90000000-0000-0000-0000-000000000046',
    'Jornada vencida de prueba; recuperación ADMIN explícita y auditada.'
  );
  IF result->>'estado' IS DISTINCT FROM 'CERRADO'
     OR result->>'requiere_revision_manual' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'FAIL: modern jornada force-close failed: %', result;
  END IF;
  IF (SELECT estado FROM public.turno_sesiones WHERE id='91000000-0000-0000-0000-000000000046') IS DISTINCT FROM 'COMPLETADA'
     OR NOT (SELECT cierre_forzado FROM public.turno_sesiones WHERE id='91000000-0000-0000-0000-000000000046') THEN
    RAISE EXCEPTION 'FAIL: audited modern jornada was not completed as force-closed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.turno_jornada_inventario_cortes WHERE turno_sesion_id='91000000-0000-0000-0000-000000000046' AND tipo='FINAL') THEN
    RAISE EXCEPTION 'FAIL: modern force-close fabricated a final inventory snapshot';
  END IF;
  IF EXISTS (SELECT 1 FROM public.turno_declaraciones WHERE turno_sesion_id='91000000-0000-0000-0000-000000000046') THEN
    RAISE EXCEPTION 'FAIL: modern force-close fabricated a cash declaration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.turno_eventos
    WHERE turno_id='90000000-0000-0000-0000-000000000046'
      AND actor_user_id='20000000-0000-0000-0000-000000000001'
      AND tipo='TURNO_CIERRE_FORZADO_ADMIN'
      AND payload->'sesiones_en_curso_ids' ? '91000000-0000-0000-0000-000000000046'
      AND payload->>'cierre_jornada_forzado_sin_conteo_final'='true'
      AND payload->>'conteos_inventario_creados'='0'
  ) THEN RAISE EXCEPTION 'FAIL: modern force-close audit is not session-scoped or omits no-count proof'; END IF;
END;
$successful_modern_close$;



DO $audit_and_no_fabrication$
DECLARE declarations_count integer; cuts_count integer;
BEGIN
 IF (SELECT estado FROM public.turnos WHERE id='90000000-0000-0000-0000-000000000041') IS DISTINCT FROM 'CERRADO'
    OR (SELECT estado_maestro FROM public.turnos WHERE id='90000000-0000-0000-0000-000000000041') IS DISTINCT FROM 'CERRADO' THEN
   RAISE EXCEPTION 'FAIL: both master and legacy status fields must be reconciled';
 END IF;
 IF (SELECT estado FROM public.turno_sesiones WHERE id='91000000-0000-0000-0000-000000000041') IS DISTINCT FROM 'COMPLETADA'
    OR NOT (SELECT cierre_forzado FROM public.turno_sesiones WHERE id='91000000-0000-0000-0000-000000000041') THEN
   RAISE EXCEPTION 'FAIL: active legacy session was not marked force-closed';
 END IF;
 IF (SELECT estado FROM public.turno_sesiones WHERE id='91000000-0000-0000-0000-000000000042') IS DISTINCT FROM 'CANCELADA' THEN
   RAISE EXCEPTION 'FAIL: never-started session should be cancelled';
 END IF;
 IF (SELECT estado FROM public.turno_tramos WHERE id='92000000-0000-0000-0000-000000000041') IS DISTINCT FROM 'COMPLETADO'
    OR (SELECT fin_at FROM public.turno_tramos WHERE id='92000000-0000-0000-0000-000000000041') IS NULL THEN
   RAISE EXCEPTION 'FAIL: active work segment was not ended';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.turno_eventos
   WHERE turno_id='90000000-0000-0000-0000-000000000041'
     AND actor_user_id='20000000-0000-0000-0000-000000000001'
     AND tipo='TURNO_CIERRE_FORZADO_ADMIN'
     AND payload->>'motivo'='El turno venció y requiere recuperación administrativa en entorno desechable.'
     AND payload->>'declaraciones_dinero_creadas'='0'
     AND payload->>'conteos_inventario_creados'='0'
     AND payload->>'requiere_revision_manual'='true'
 ) THEN RAISE EXCEPTION 'FAIL: audit event is incomplete or reports fabricated amounts/counts'; END IF;
 SELECT count(*) INTO declarations_count FROM public.turno_declaraciones
  WHERE turno_id='90000000-0000-0000-0000-000000000041';
 SELECT count(*) INTO cuts_count FROM public.turno_jornada_inventario_cortes c
  JOIN public.turno_sesiones s ON s.id=c.turno_sesion_id
  WHERE s.turno_id='90000000-0000-0000-0000-000000000041';
 IF declarations_count<>0 OR cuts_count<>0 THEN
   RAISE EXCEPTION 'FAIL: forced close fabricated a cash declaration or inventory cut';
 END IF;
END; $audit_and_no_fabrication$;


-- Leave the shared Step 7 contract fixture clean; this disposable recovery test
-- must not influence later test cases in the same PostgreSQL instance.
DELETE FROM public.turno_eventos
 WHERE turno_id IN (
  '90000000-0000-0000-0000-000000000041','90000000-0000-0000-0000-000000000042',
  '90000000-0000-0000-0000-000000000043','90000000-0000-0000-0000-000000000044',
  '90000000-0000-0000-0000-000000000045','90000000-0000-0000-0000-000000000046'
 );
DELETE FROM public.turno_tramos
 WHERE turno_id IN (
  '90000000-0000-0000-0000-000000000041','90000000-0000-0000-0000-000000000042',
  '90000000-0000-0000-0000-000000000043','90000000-0000-0000-0000-000000000044',
  '90000000-0000-0000-0000-000000000045','90000000-0000-0000-0000-000000000046'
 );
DELETE FROM public.turno_sesiones
 WHERE turno_id IN (
  '90000000-0000-0000-0000-000000000041','90000000-0000-0000-0000-000000000042',
  '90000000-0000-0000-0000-000000000043','90000000-0000-0000-0000-000000000044',
  '90000000-0000-0000-0000-000000000045','90000000-0000-0000-0000-000000000046'
 );
DELETE FROM public.turno_jornada_programacion WHERE turn_id='90000000-0000-0000-0000-000000000046';
DELETE FROM public.turnos
 WHERE id IN (
  '90000000-0000-0000-0000-000000000041','90000000-0000-0000-0000-000000000042',
  '90000000-0000-0000-0000-000000000043','90000000-0000-0000-0000-000000000044',
  '90000000-0000-0000-0000-000000000045','90000000-0000-0000-0000-000000000046'
 );
DELETE FROM public.almacenes
 WHERE id IN ('10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000006');

SELECT 'PASS force-close ADMIN ACL, reason bounds, state/period/expiry guards, audit, no-fabrication and fixture cleanup contract' AS result;
