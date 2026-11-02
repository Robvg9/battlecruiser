-- Step 12 candidate only. This migration is NOT applied to BattleCruiser LIVE.
-- It adds a dormant, fail-closed reset gate and first-admin bootstrap protocol.
-- No gate rows or credentials are seeded by this file.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE IF NOT EXISTS private.bc_reset_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  token_hash bytea CHECK (token_hash IS NULL OR octet_length(token_hash) = 32),
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  consumed_at timestamptz,
  consumed_request_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private.bc_reset_operations (
  request_id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('started', 'completed')),
  result jsonb
);

CREATE TABLE IF NOT EXISTS private.bc_bootstrap_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  token_hash bytea CHECK (token_hash IS NULL OR octet_length(token_hash) = 32),
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  claim_request_id uuid,
  claim_expires_at timestamptz,
  consumed_at timestamptz,
  consumed_request_id uuid,
  auth_user_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.bc_reset_gate, private.bc_reset_operations, private.bc_bootstrap_gate TO postgres, service_role;

CREATE OR REPLACE FUNCTION private.bc_step12_wipe_tables()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
  SELECT ARRAY[
    'almacenes',
    'asignaciones_operativas',
    'auditoria_operaciones',
    'bajas',
    'ciclos_operativos',
    'compras',
    'conversaciones',
    'cuadres',
    'entregas_caja',
    'gastos',
    'incidencias',
    'lotes_compra',
    'mensajes',
    'mermas',
    'movimientos_caja',
    'participantes_conversacion',
    'producto_presentaciones',
    'productos',
    'reinversiones',
    'reinversiones_lineas',
    'responsabilidades',
    'sesiones_ciclo',
    'stock',
    'transferencias',
    'transferencias_lineas',
    'turno_asignaciones',
    'turno_declaraciones',
    'turno_descuentos',
    'turno_diferencias',
    'turno_entregas_inventario',
    'turno_eventos',
    'turno_jornada_configuracion',
    'turno_jornada_eventos',
    'turno_jornada_inventario_cortes',
    'turno_jornada_inventario_entrega_lineas',
    'turno_jornada_inventario_entregas',
    'turno_jornada_inventario_lineas',
    'turno_jornada_inventario_recepcion_lineas',
    'turno_jornada_inventario_recepciones',
    'turno_jornada_patron_dias',
    'turno_jornada_patrones',
    'turno_jornada_programacion',
    'turno_recepciones_compra',
    'turno_revisiones',
    'turno_sesiones',
    'turno_sucesiones',
    'turno_tramos',
    'turnos',
    'turnos_inventario_entrega_lineas',
    'turnos_inventario_entregas',
    'turnos_inventario_inicial',
    'usuarios',
    'vales_salida',
    'ventas',
    'ventas_lineas'
  ]::text[];
$function$;

CREATE OR REPLACE FUNCTION private.bc_reset_application_data(
  p_token text,
  p_confirmation text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, auth, private, extensions, pg_temp
AS $function$
DECLARE
  v_gate private.bc_reset_gate%ROWTYPE;
  v_existing private.bc_reset_operations%ROWTYPE;
  v_wipe text[] := private.bc_step12_wipe_tables();
  v_preserve text[] := ARRAY['categorias','permisos','presentaciones','roles','turno_configuracion','unidades']::text[];
  v_expected text[];
  v_actual text[];
  v_unexpected_auth_refs integer;
  v_bucket_count integer;
  v_bucket_ok boolean;
  v_table text;
  v_count bigint;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_result jsonb;
  v_attempts integer;
  v_max integer;
BEGIN
  IF COALESCE(auth.role(), session_user::text) NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'RESET_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'code','request_id_required');
  END IF;

  PERFORM pg_advisory_xact_lock(1111707218, 12);

  SELECT * INTO v_existing
  FROM private.bc_reset_operations
  WHERE request_id = p_request_id;
  IF FOUND AND v_existing.status = 'completed' THEN
    RETURN COALESCE(v_existing.result,'{}'::jsonb) || jsonb_build_object('replayed',true);
  END IF;

  SELECT * INTO v_gate
  FROM private.bc_reset_gate
  WHERE singleton = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'code','reset_gate_not_initialized');
  END IF;
  IF v_gate.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'code','reset_gate_already_consumed');
  END IF;
  IF v_gate.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('ok',false,'code','reset_gate_expired');
  END IF;
  IF v_gate.attempts >= v_gate.max_attempts THEN
    RETURN jsonb_build_object('ok',false,'code','reset_gate_locked');
  END IF;

  IF p_token IS NULL OR p_token = '' OR
     extensions.digest(p_token,'sha256') IS DISTINCT FROM v_gate.token_hash THEN
    UPDATE private.bc_reset_gate
       SET attempts = attempts + 1, updated_at = now()
     WHERE singleton = true
     RETURNING attempts,max_attempts INTO v_attempts,v_max;
    RETURN jsonb_build_object('ok',false,'code','reset_authorization_failed',
      'attempts_remaining',GREATEST(0,v_max-v_attempts));
  END IF;

  IF p_confirmation IS DISTINCT FROM 'CONFIRMO REINICIAR BATTLECRUISER PRODUCCIÓN' THEN
    UPDATE private.bc_reset_gate
       SET attempts = attempts + 1, updated_at = now()
     WHERE singleton = true
     RETURNING attempts,max_attempts INTO v_attempts,v_max;
    RETURN jsonb_build_object('ok',false,'code','reset_authorization_failed',
      'attempts_remaining',GREATEST(0,v_max-v_attempts));
  END IF;

  SELECT array_agg(x ORDER BY x) INTO v_expected
  FROM unnest(v_wipe || v_preserve) AS x;
  SELECT array_agg(tablename::text ORDER BY tablename) INTO v_actual
  FROM pg_tables WHERE schemaname = 'public';
  IF v_actual IS DISTINCT FROM v_expected THEN
    RETURN jsonb_build_object('ok',false,'code','public_schema_drift',
      'expected_table_count',cardinality(v_expected),'actual_table_count',cardinality(COALESCE(v_actual,ARRAY[]::text[])));
  END IF;

  IF (SELECT count(*) FROM pg_tables
      WHERE schemaname='public' AND tablename=ANY(v_preserve) AND rowsecurity) <> cardinality(v_preserve) THEN
    RETURN jsonb_build_object('ok',false,'code','preserved_rls_precondition_failed');
  END IF;

  SELECT count(*), bool_and(id='productos')
    INTO v_bucket_count,v_bucket_ok
  FROM storage.buckets;
  IF v_bucket_count <> 1 OR COALESCE(v_bucket_ok,false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok',false,'code','storage_bucket_manifest_drift');
  END IF;

  SELECT count(*) INTO v_unexpected_auth_refs
  FROM pg_constraint c
  JOIN pg_class child ON child.oid=c.conrelid
  JOIN pg_namespace ns ON ns.oid=child.relnamespace
  WHERE c.contype='f' AND c.confrelid='auth.users'::regclass
    AND ns.nspname='public' AND NOT (child.relname = ANY(v_wipe));
  IF v_unexpected_auth_refs > 0 THEN
    RETURN jsonb_build_object('ok',false,'code','unexpected_auth_dependency',
      'dependency_count',v_unexpected_auth_refs);
  END IF;

  FOR v_table IN SELECT unnest(v_wipe) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',v_table) INTO v_count;
    v_before := v_before || jsonb_build_object(v_table,v_count);
  END LOOP;
  EXECUTE 'SELECT count(*) FROM auth.users' INTO v_count;
  v_before := v_before || jsonb_build_object('auth.users',v_count);
  EXECUTE 'SELECT count(*) FROM storage.objects' INTO v_count;
  v_before := v_before || jsonb_build_object('storage.objects',v_count);
  IF v_count <> 0 THEN
    RETURN jsonb_build_object('ok',false,'code','storage_cleanup_required','storage_object_count',v_count);
  END IF;

  INSERT INTO private.bc_reset_operations(request_id,status,result)
  VALUES (p_request_id,'started',NULL)
  ON CONFLICT (request_id) DO NOTHING;

  EXECUTE
    'TRUNCATE TABLE ' ||
    (SELECT string_agg(format('%I.%I','public',x),', ' ORDER BY x) FROM unnest(v_wipe) AS x) ||
    ', auth.users RESTART IDENTITY CASCADE';

  INSERT INTO public.auditoria_operaciones
    (usuario_id,usuario_nombre,tipo,descripcion,estado,entidad_id,idempotency_key,payload_resumen)
  VALUES
    (NULL,'system-reset','reset_application_data',
     'Reinicio controlado de datos operativos; esquema y catálogos base preservados.',
     'exito',p_request_id::text,p_request_id,
     jsonb_build_object('request_id',p_request_id,'preserved_tables',v_preserve,
       'cleared_tables',v_wipe,'auth_users_cleared',true,'storage_objects_cleared',true));

  FOR v_table IN SELECT unnest(v_wipe) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',v_table) INTO v_count;
    v_after := v_after || jsonb_build_object(v_table,v_count);
  END LOOP;
  EXECUTE 'SELECT count(*) FROM auth.users' INTO v_count;
  v_after := v_after || jsonb_build_object('auth.users',v_count);
  EXECUTE 'SELECT count(*) FROM storage.objects' INTO v_count;
  v_after := v_after || jsonb_build_object('storage.objects',v_count);

  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(v_after)
    WHERE key <> 'auditoria_operaciones' AND value::bigint <> 0
  ) OR (v_after->>'auditoria_operaciones')::bigint <> 1 THEN
    RAISE EXCEPTION 'RESET_POSTCONDITION_FAILED' USING ERRCODE='P0001';
  END IF;

  v_result := jsonb_build_object(
    'ok',true,'request_id',p_request_id,'completed_at',clock_timestamp(),
    'public_rows_before',v_before,'public_rows_after',v_after,
    'preserved_tables',v_preserve,'cleared_tables',v_wipe,
    'storage_bucket_preserved',true,'storage_objects_cleared',true,
    'schema_preserved',true,'rls_preserved',true
  );

  UPDATE private.bc_reset_operations
     SET status='completed',completed_at=now(),result=v_result
   WHERE request_id=p_request_id;
  UPDATE private.bc_reset_gate
     SET consumed_at=now(),consumed_request_id=p_request_id,token_hash=NULL,updated_at=now()
   WHERE singleton=true;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION private.bc_bootstrap_claim(
  p_token text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, auth, private, extensions, pg_temp
AS $function$
DECLARE
  v_gate private.bc_bootstrap_gate%ROWTYPE;
  v_attempts integer;
  v_max integer;
BEGIN
  IF COALESCE(auth.role(), session_user::text) NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'BOOTSTRAP_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'code','request_id_required');
  END IF;
  PERFORM pg_advisory_xact_lock(1111707218,13);

  SELECT * INTO v_gate FROM private.bc_bootstrap_gate WHERE singleton=true FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'code','bootstrap_gate_not_initialized');
  END IF;
  IF v_gate.consumed_at IS NOT NULL THEN
    IF v_gate.consumed_request_id=p_request_id THEN
      RETURN jsonb_build_object('ok',true,'already_completed',true,'auth_user_id',v_gate.auth_user_id);
    END IF;
    RETURN jsonb_build_object('ok',false,'code','bootstrap_already_used');
  END IF;
  IF v_gate.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('ok',false,'code','bootstrap_gate_expired');
  END IF;
  IF p_token IS NULL OR p_token='' OR
     extensions.digest(p_token,'sha256') IS DISTINCT FROM v_gate.token_hash THEN
    UPDATE private.bc_bootstrap_gate SET attempts=attempts+1,updated_at=now()
     WHERE singleton=true RETURNING attempts,max_attempts INTO v_attempts,v_max;
    RETURN jsonb_build_object('ok',false,'code','bootstrap_authorization_failed',
      'attempts_remaining',GREATEST(0,v_max-v_attempts));
  END IF;

  -- A retry with the same idempotency key may resume an Auth identity created
  -- just before a network interruption. It consumes no additional attempt.
  IF v_gate.claim_request_id=p_request_id THEN
    UPDATE private.bc_bootstrap_gate SET claim_expires_at=now()+interval '15 minutes',updated_at=now()
     WHERE singleton=true;
    RETURN jsonb_build_object('ok',true,'claimed',true,'replayed',true,'request_id',p_request_id);
  END IF;
  IF v_gate.attempts >= v_gate.max_attempts THEN
    RETURN jsonb_build_object('ok',false,'code','bootstrap_locked');
  END IF;
  IF v_gate.claim_request_id IS NOT NULL AND v_gate.claim_expires_at > now() THEN
    RETURN jsonb_build_object('ok',false,'code','bootstrap_in_progress');
  END IF;
  -- Expired claims with an Auth identity require operator recovery; do not
  -- silently create a second identity or guess which account to preserve.
  IF EXISTS(SELECT 1 FROM public.usuarios) OR EXISTS(SELECT 1 FROM auth.users) THEN
    RETURN jsonb_build_object('ok',false,'code','bootstrap_requires_empty_auth');
  END IF;
  UPDATE private.bc_bootstrap_gate
     SET attempts=attempts+1,claim_request_id=p_request_id,
         claim_expires_at=now()+interval '15 minutes',updated_at=now()
   WHERE singleton=true;
  RETURN jsonb_build_object('ok',true,'claimed',true,'replayed',false,
    'request_id',p_request_id);
END;
$function$;

CREATE OR REPLACE FUNCTION private.bc_bootstrap_auth_user_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, auth, private, pg_temp
AS $function$
DECLARE
  v_request_id uuid;
  v_gate private.bc_bootstrap_gate%ROWTYPE;
  v_owner_role uuid;
  v_nombre text;
BEGIN
  -- Only identities carrying the one-time request id use this first-owner path.
  IF NEW.raw_user_meta_data IS NULL OR NOT (NEW.raw_user_meta_data ? 'bc_bootstrap_request_id') THEN
    RETURN NEW;
  END IF;
  v_request_id := (NEW.raw_user_meta_data->>'bc_bootstrap_request_id')::uuid;
  v_nombre := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'username','')),'');
  IF v_request_id IS NULL OR v_nombre IS NULL OR length(v_nombre)>120 THEN
    RAISE EXCEPTION 'BOOTSTRAP_PROFILE_PAYLOAD_INVALID' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(1111707218,13);
  SELECT * INTO v_gate FROM private.bc_bootstrap_gate WHERE singleton=true FOR UPDATE;
  IF NOT FOUND OR v_gate.consumed_at IS NOT NULL OR
     v_gate.claim_request_id IS DISTINCT FROM v_request_id OR
     v_gate.claim_expires_at IS NULL OR v_gate.claim_expires_at<=now() THEN
    RAISE EXCEPTION 'BOOTSTRAP_CLAIM_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.usuarios) OR EXISTS(SELECT 1 FROM auth.users WHERE id<>NEW.id) THEN
    RAISE EXCEPTION 'BOOTSTRAP_REQUIRES_EMPTY_AUTH' USING ERRCODE='42501';
  END IF;
  SELECT id INTO v_owner_role FROM public.roles WHERE nombre='Dueño' AND activo=true;
  IF v_owner_role IS NULL THEN
    RAISE EXCEPTION 'BOOTSTRAP_OWNER_ROLE_MISSING' USING ERRCODE='P0001';
  END IF;
  -- This profile insert shares the Auth identity transaction; either both persist or neither.
  INSERT INTO public.usuarios(id,nombre,role_id,activo,archivado)
  VALUES(NEW.id,v_nombre,v_owner_role,true,false);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bc_bootstrap_admin_profile ON auth.users;
CREATE TRIGGER bc_bootstrap_admin_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION private.bc_bootstrap_auth_user_insert();

REVOKE ALL ON FUNCTION private.bc_bootstrap_auth_user_insert() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.bc_bootstrap_finalize(
  p_request_id uuid,
  p_auth_user_id uuid,
  p_nombre text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, auth, private, pg_temp
AS $function$
DECLARE
  v_gate private.bc_bootstrap_gate%ROWTYPE;
  v_owner_role uuid;
BEGIN
  IF COALESCE(auth.role(), session_user::text) NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'BOOTSTRAP_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR p_auth_user_id IS NULL OR
     NULLIF(btrim(COALESCE(p_nombre,'')),'') IS NULL OR length(p_nombre)>120 THEN
    RETURN jsonb_build_object('ok',false,'code','invalid_bootstrap_payload');
  END IF;
  PERFORM pg_advisory_xact_lock(1111707218,13);
  SELECT * INTO v_gate FROM private.bc_bootstrap_gate WHERE singleton=true FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'code','bootstrap_gate_not_initialized');
  END IF;
  IF v_gate.consumed_at IS NOT NULL THEN
    IF v_gate.consumed_request_id=p_request_id AND v_gate.auth_user_id=p_auth_user_id THEN
      RETURN jsonb_build_object('ok',true,'already_completed',true,'auth_user_id',p_auth_user_id);
    END IF;
    RETURN jsonb_build_object('ok',false,'code','bootstrap_already_used');
  END IF;
  IF v_gate.claim_request_id IS DISTINCT FROM p_request_id OR
     v_gate.claim_expires_at IS NULL OR v_gate.claim_expires_at<=now() THEN
    RETURN jsonb_build_object('ok',false,'code','bootstrap_claim_invalid');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_auth_user_id) OR
     (SELECT count(*) FROM auth.users)<>1 OR
     (SELECT count(*) FROM public.usuarios)<>1 OR
     NOT EXISTS(SELECT 1 FROM public.usuarios u JOIN public.roles r ON r.id=u.role_id
                 WHERE u.id=p_auth_user_id AND r.nombre='Dueño' AND u.activo=true) THEN
    RETURN jsonb_build_object('ok',false,'code','bootstrap_auth_state_invalid');
  END IF;
  SELECT id INTO v_owner_role FROM public.roles
   WHERE nombre='Dueño' AND activo=true;
  IF v_owner_role IS NULL THEN
    RETURN jsonb_build_object('ok',false,'code','owner_role_missing');
  END IF;

  -- The auth.users trigger already created the profile in the same Auth transaction.

  UPDATE private.bc_bootstrap_gate
     SET consumed_at=now(),consumed_request_id=p_request_id,
         auth_user_id=p_auth_user_id,token_hash=NULL,updated_at=now()
   WHERE singleton=true;

  INSERT INTO public.auditoria_operaciones
    (usuario_id,usuario_nombre,tipo,descripcion,estado,entidad_id,idempotency_key,payload_resumen)
  VALUES
    (p_auth_user_id,btrim(p_nombre),'bootstrap_admin',
     'Primer administrador inicializado de forma controlada.','exito',
     p_auth_user_id::text,p_request_id,
     jsonb_build_object('bootstrap_request_id',p_request_id,'role','Dueño'));

  RETURN jsonb_build_object('ok',true,'already_completed',false,'auth_user_id',p_auth_user_id,
    'role','Dueño','consumed',true);
END;
$function$;

REVOKE ALL ON FUNCTION private.bc_reset_application_data(text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.bc_bootstrap_claim(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.bc_bootstrap_finalize(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.bc_reset_application_data(text,text,uuid) TO service_role,postgres;
GRANT EXECUTE ON FUNCTION private.bc_bootstrap_claim(text,uuid) TO service_role,postgres;
GRANT EXECUTE ON FUNCTION private.bc_bootstrap_finalize(uuid,uuid,text) TO service_role,postgres;

CREATE OR REPLACE FUNCTION public.bc_reset_application_data(p_token text,p_confirmation text,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER
SET search_path TO pg_catalog, public, private
AS $function$ SELECT private.bc_reset_application_data(p_token,p_confirmation,p_request_id); $function$;

CREATE OR REPLACE FUNCTION public.bc_bootstrap_claim(p_token text,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER
SET search_path TO pg_catalog, public, private
AS $function$ SELECT private.bc_bootstrap_claim(p_token,p_request_id); $function$;

CREATE OR REPLACE FUNCTION public.bc_bootstrap_finalize(p_request_id uuid,p_auth_user_id uuid,p_nombre text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER
SET search_path TO pg_catalog, public, private
AS $function$ SELECT private.bc_bootstrap_finalize(p_request_id,p_auth_user_id,p_nombre); $function$;

REVOKE ALL ON FUNCTION public.bc_reset_application_data(text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc_bootstrap_claim(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc_bootstrap_finalize(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bc_reset_application_data(text,text,uuid) TO service_role,postgres;
GRANT EXECUTE ON FUNCTION public.bc_bootstrap_claim(text,uuid) TO service_role,postgres;
GRANT EXECUTE ON FUNCTION public.bc_bootstrap_finalize(uuid,uuid,text) TO service_role,postgres;
