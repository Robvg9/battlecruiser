-- Isolated PostgreSQL assertions for the Owner review and shift continuity migration.
DO $$
DECLARE
  v_index text;
  v_definition text;
  v_has_rls boolean;
BEGIN
  IF to_regclass('public.turno_jornada_movimiento_revision') IS NULL THEN
    RAISE EXCEPTION 'Owner movement review table was not created';
  END IF;

  SELECT c.relrowsecurity INTO v_has_rls
  FROM pg_class c WHERE c.oid='public.turno_jornada_movimiento_revision'::regclass;
  IF v_has_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Owner movement review table must keep RLS enabled';
  END IF;
  IF has_table_privilege('authenticated','public.turno_jornada_movimiento_revision','SELECT')
     OR has_table_privilege('authenticated','public.turno_jornada_movimiento_revision','INSERT')
     OR has_table_privilege('anon','public.turno_jornada_movimiento_revision','SELECT') THEN
    RAISE EXCEPTION 'Direct access to audited movement review rows must remain revoked';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='ux_turnos_maestro_unico_activo_por_almacen') THEN
    RAISE EXCEPTION 'The obsolete one-master-per-warehouse index still blocks operational continuity';
  END IF;

  SELECT indexdef INTO v_index FROM pg_indexes
  WHERE schemaname='public' AND indexname='turnos_unico_abierto_por_usuario';
  IF v_index IS NULL OR v_index NOT ILIKE '%dias_turno IS NULL%' THEN
    RAISE EXCEPTION 'Legacy open-turn uniqueness must only apply to non-Jornada legacy Turns: %',v_index;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='ux_turno_sesion_activa_almacen') THEN
    RAISE EXCEPTION 'The unique active operational session guard was removed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='turno_tramo_activo_unico') THEN
    RAISE EXCEPTION 'The active tranche guard was removed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='turno_jornada_un_responsable_dia') THEN
    RAISE EXCEPTION 'The responsible-per-day schedule guard was removed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='turno_jornada_un_registro_almacen_dia') THEN
    RAISE EXCEPTION 'The warehouse/day duplicate schedule guard was removed';
  END IF;

  SELECT pg_get_functiondef('public.bc5_crear_jornada_unica(uuid,date,integer,jsonb,text)'::regprocedure)
    INTO v_definition;
  IF position('Hay un Turno activo para este almacén; reconcílielo antes de crear la jornada nueva.' IN v_definition)>0 THEN
    RAISE EXCEPTION 'Jornada creation still depends on Owner reconciliation';
  END IF;
  SELECT pg_get_functiondef('public.bc5_cerrar_jornada(uuid,text)'::regprocedure)
    INTO v_definition;
  IF position('JORNADA_ENTREGADA_TARDE' IN v_definition)=0
     OR position('fin_operativo_at' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Late administrative handover is not separated from operational end';
  END IF;

  SELECT pg_get_functiondef('public.listar_aprobaciones_admin()'::regprocedure)
    INTO v_definition;
  IF position('jornada_revision' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Completed Jornadas are not included in the Owner approval queue';
  END IF;

  IF NOT has_function_privilege('authenticated','public.bc7_obtener_revision_jornada(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_obtener_revision_jornada(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Owner review RPC privileges are not correctly restricted';
  END IF;
  IF NOT has_function_privilege('authenticated','public.bc7_clasificar_movimientos_fuera_corte(uuid,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_clasificar_movimientos_fuera_corte(uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Post-cut movement classification RPC privileges are not correctly restricted';
  END IF;
  IF NOT has_function_privilege('authenticated','public.bc7_resolver_revision_jornada(uuid,text,text)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_resolver_revision_jornada(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Owner review resolution RPC privileges are not correctly restricted';
  END IF;

  SELECT pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure)
    INTO v_definition;
  IF position('ANTES_CORTE' IN v_definition)=0 OR position('creado_en' IN v_definition)=0
     OR position('fecha_revision' IN v_definition)=0
     OR position('v_pending_post=0' IN v_definition)=0
     OR position('movimientos_posteriores_pendientes' IN v_definition)=0
     OR position('v_lines:=''[]''::jsonb' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Settlement must use approval timestamps, cutoff classification, and suppress provisional estimates while movements remain unclassified';
  END IF;

  SELECT pg_get_functiondef('public.bc7_clasificar_movimientos_fuera_corte(uuid,jsonb)'::regprocedure)
    INTO v_definition;
  IF position('coalesce(b.fecha_revision,b.creado_en)' IN v_definition)=0
     OR position('coalesce(m.fecha_revision,m.creado_en)' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Owner classification must detect movements approved after the final cut, not only records created after it';
  END IF;

  SELECT pg_get_functiondef('public.bc7_resolver_revision_jornada(uuid,text,text)'::regprocedure)
    INTO v_definition;
  IF position('coalesce(b.fecha_revision,b.creado_en)' IN v_definition)=0
     OR position('coalesce(m.fecha_revision,m.creado_en)' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Owner resolution must block approval while post-cutoff movements remain unclassified';
  END IF;

  RAISE NOTICE 'PASS Jornada Owner review continuity, late handover, cutoff attribution, no-provisional-settlement, and ACL contract';
END $$;
