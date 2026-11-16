DO $contract$
DECLARE
  v_rls boolean;
BEGIN
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='turno_jornada_rectificaciones_post_cierre';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Post-close rectification table must have RLS enabled.';
  END IF;

  IF has_table_privilege('authenticated','public.turno_jornada_rectificaciones_post_cierre','SELECT')
     OR has_table_privilege('authenticated','public.turno_jornada_rectificaciones_post_cierre','INSERT')
     OR has_table_privilege('anon','public.turno_jornada_rectificaciones_post_cierre','SELECT') THEN
    RAISE EXCEPTION 'Direct access to post-close rectification table must remain revoked.';
  END IF;

  IF NOT has_function_privilege('authenticated',
       'public.bc7_registrar_rectificacion_post_cierre_jornada(uuid,jsonb,text,text,text,uuid)','EXECUTE')
     OR has_function_privilege('anon',
       'public.bc7_registrar_rectificacion_post_cierre_jornada(uuid,jsonb,text,text,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Post-close rectification writer grants are incorrect.';
  END IF;

  IF NOT has_function_privilege('authenticated',
       'public.bc7_obtener_revision_jornada_rectificada(uuid)','EXECUTE')
     OR has_function_privilege('anon',
       'public.bc7_obtener_revision_jornada_rectificada(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Post-close rectified review grants are incorrect.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.turno_jornada_rectificaciones_post_cierre'::regclass
      AND tgname='turno_jornada_rect_post_cierre_immutable'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Append-only mutation blocker trigger is missing.';
  END IF;
END;
$contract$;
