BEGIN;

-- A sealed Jornada may receive one explicit, ADMIN-only final physical count
-- while its master Turn remains open. The original operational cutoff stays
-- immutable; this function never changes warehouse stock or prior movements.
CREATE OR REPLACE FUNCTION public.bc7_admin_registrar_inventario_final_sellado_jornada(
  p_turno_sesion_id uuid,
  p_lineas jsonb,
  p_observacion text,
  p_fuente_documental text,
  p_fuente_sha256 text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_turn public.turnos;
  v_initial_cut uuid;
  v_expected integer;
  v_received integer;
  v_distinct integer;
  v_cut_id uuid;
  v_payload_md5 text;
  v_existing jsonb;
  v_note text:=nullif(left(btrim(coalesce(p_observacion,'')),900),'');
  v_source text:=nullif(left(btrim(coalesce(p_fuente_documental,'')),300),'');
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede registrar el inventario final histórico de una Jornada sellada.'
      USING ERRCODE='42501';
  END IF;

  IF p_turno_sesion_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Jornada y clave de idempotencia son obligatorias.'
      USING ERRCODE='22023';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array'
     OR jsonb_array_length(p_lineas)=0 OR jsonb_array_length(p_lineas)>500 THEN
    RAISE EXCEPTION 'Envía la lista completa del inventario final (1–500 productos).'
      USING ERRCODE='22023';
  END IF;
  IF v_note IS NULL OR length(v_note)<5 THEN
    RAISE EXCEPTION 'Explica el origen y la fecha efectiva del conteo (mínimo 5 caracteres).'
      USING ERRCODE='22023';
  END IF;
  IF v_source IS NULL OR coalesce(p_fuente_sha256,'') !~* '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Adjunta un CSV documental y su huella SHA-256 válida.'
      USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
    WHERE jsonb_typeof(x.value)<>'object'
       OR coalesce(x.value->>'producto_id','') !~* '^[0-9a-f-]{36}$'
       OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
  ) THEN
    RAISE EXCEPTION 'Cada línea necesita producto_id y una cantidad no negativa con hasta 3 decimales.'
      USING ERRCODE='22023';
  END IF;
  SELECT count(*),count(DISTINCT (x.value->>'producto_id')::uuid)
    INTO v_received,v_distinct
  FROM jsonb_array_elements(p_lineas) x(value);
  IF v_received<>v_distinct THEN
    RAISE EXCEPTION 'El CSV repite uno o más productos. Corrige los duplicados antes de enviar.'
      USING ERRCODE='22023';
  END IF;

  -- The source hash, full line payload and idempotency key are retained in
  -- the event ledger. An exact retry is safe, even after a later Turn close.
  v_payload_md5:=md5(p_lineas::text||'|'||v_note||'|'||v_source||'|'||lower(p_fuente_sha256));
  SELECT e.payload INTO v_existing
  FROM public.turno_eventos e
  WHERE e.turno_sesion_id=p_turno_sesion_id
    AND e.tipo='INVENTARIO_FINAL_ADMIN_POST_SELLO'
    AND e.payload->>'idempotency_key'=p_idempotency_key::text
  ORDER BY e.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    IF v_existing->>'payload_md5' IS DISTINCT FROM v_payload_md5 THEN
      RAISE EXCEPTION 'La clave ya se utilizó con otro archivo o conjunto de cantidades.'
        USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object(
      'ok',true,'idempotente',true,
      'corte_id',v_existing->>'final_cut_id',
      'productos',v_existing->>'product_count',
      'fecha_efectiva',v_existing->>'corte_operativo_at'
    );
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id AND bloque='JORNADA'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la Jornada solicitada.'
      USING ERRCODE='23503';
  END IF;
  IF v_s.estado<>'CERRADA_OPERATIVAMENTE' OR v_s.corte_operativo_at IS NULL THEN
    RAISE EXCEPTION 'El registro tardío solo aplica a una Jornada sellada con corte operativo inmutable.'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_turn
  FROM public.turnos
  WHERE id=v_s.turno_id
  FOR UPDATE;
  IF NOT FOUND OR v_turn.estado<>'ABIERTO'
     OR coalesce(v_turn.estado_maestro,v_turn.estado)<>'EN_CURSO' THEN
    RAISE EXCEPTION 'El Turno maestro debe seguir abierto para recibir este inventario histórico.'
      USING ERRCODE='23514';
  END IF;

  SELECT c.id INTO v_initial_cut
  FROM public.turno_jornada_inventario_cortes c
  WHERE c.turno_sesion_id=v_s.id AND c.tipo='INICIAL' AND c.estado='CONFIRMADO'
  ORDER BY c.confirmado_en DESC NULLS LAST,c.creado_en DESC
  LIMIT 1;
  IF v_initial_cut IS NULL THEN
    RAISE EXCEPTION 'No existe inventario inicial confirmado para definir el conjunto histórico de productos.'
      USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO v_expected
  FROM public.turno_jornada_inventario_lineas
  WHERE corte_id=v_initial_cut;
  IF v_expected=0 OR v_received<>v_expected THEN
    RAISE EXCEPTION 'El archivo debe contener exactamente los % productos del inventario inicial confirmado; recibió %.',
      v_expected,v_received USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.turno_jornada_inventario_lineas initial_line
      WHERE initial_line.corte_id=v_initial_cut
        AND initial_line.producto_id=(x.value->>'producto_id')::uuid
    )
  ) OR EXISTS (
    SELECT 1 FROM public.turno_jornada_inventario_lineas initial_line
    WHERE initial_line.corte_id=v_initial_cut
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
        WHERE (x.value->>'producto_id')::uuid=initial_line.producto_id
      )
  ) THEN
    RAISE EXCEPTION 'El conjunto de productos no coincide exactamente con el inventario inicial de esta Jornada.'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=v_s.id AND c.tipo='FINAL'
  ) THEN
    RAISE EXCEPTION 'Esta Jornada ya tiene inventario final. Consulta el corte existente; no se sobrescribe.'
      USING ERRCODE='23505';
  END IF;

  INSERT INTO public.turno_jornada_inventario_cortes(
    turno_sesion_id,tipo,estado,creado_por,confirmado_por,observacion
  ) VALUES(
    v_s.id,'FINAL','CONFIRMADO',auth.uid(),auth.uid(),
    'Registro ADMIN posterior al sello · efectivo al corte '||
      to_char(v_s.corte_operativo_at AT TIME ZONE 'America/Havana','YYYY-MM-DD HH24:MI')||
      ' America/Havana · fuente '||v_source||' · '||v_note
  ) RETURNING id INTO v_cut_id;

  -- Compare the historic physical count with the sealed operational ledger,
  -- grouped by retail family. Later warehouse-wide transfers stay outside the
  -- ledger; same-session late approvals remain attributable to this Jornada.
  WITH balances AS (
    SELECT coalesce(p.producto_padre_id,p.id) AS producto_id,
           sum(b.cantidad_actual)::numeric AS cantidad_actual
    FROM public.bc7_jornada_saldos_operativos(v_s.id) b
    JOIN public.productos p ON p.id=b.producto_id
    GROUP BY coalesce(p.producto_padre_id,p.id)
  )
  INSERT INTO public.turno_jornada_inventario_lineas(
    corte_id,producto_id,cantidad_contada,stock_sistema
  )
  SELECT v_cut_id,initial_line.producto_id,
         (x.value->>'cantidad')::numeric,
         coalesce(balance.cantidad_actual,0)
  FROM public.turno_jornada_inventario_lineas initial_line
  JOIN jsonb_array_elements(p_lineas) x(value)
    ON (x.value->>'producto_id')::uuid=initial_line.producto_id
  LEFT JOIN balances balance ON balance.producto_id=initial_line.producto_id
  WHERE initial_line.corte_id=v_initial_cut;

  INSERT INTO public.turno_eventos(
    turno_id,turno_sesion_id,actor_user_id,tipo,payload
  ) VALUES(
    v_s.turno_id,v_s.id,auth.uid(),'INVENTARIO_FINAL_ADMIN_POST_SELLO',
    jsonb_build_object(
      'final_cut_id',v_cut_id,
      'idempotency_key',p_idempotency_key,
      'payload_md5',v_payload_md5,
      'source_document',v_source,
      'source_sha256',lower(p_fuente_sha256),
      'product_count',v_expected,
      'corte_operativo_at',v_s.corte_operativo_at,
      'fecha_efectiva',to_char(v_s.corte_operativo_at AT TIME ZONE 'America/Havana','YYYY-MM-DD HH24:MI'),
      'stock_global_modificado',false,
      'corte_inicial_modificado',false,
      'observacion',v_note
    )
  );

  RETURN jsonb_build_object(
    'ok',true,'idempotente',false,'corte_id',v_cut_id,
    'productos',v_expected,'corte_operativo_at',v_s.corte_operativo_at,
    'stock_global_modificado',false
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.bc7_admin_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,text,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bc7_admin_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,text,text,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.bc7_admin_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,text,text,uuid) TO authenticated;

-- A late upload records the physical count now but represents the immutable
-- operational cutoff. Inventory movements after that cutoff must not enter
-- the historical sales/liquidation calculation.
DO $patch_sealed_liquidation_end$
DECLARE
  v_definition text;
  v_old text:='  v_end_at:=coalesce(v_final.confirmado_en,v_final.creado_en,now());';
  v_new text:='  v_end_at:=CASE
    WHEN v_s.estado=''CERRADA_OPERATIVAMENTE'' AND v_s.corte_operativo_at IS NOT NULL
      THEN v_s.corte_operativo_at
    ELSE coalesce(v_final.confirmado_en,v_final.creado_en,now())
  END;';
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure
  ) INTO v_definition;
  IF position(v_old IN v_definition)=0 OR
     length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Unexpected liquidation end-time expression; sealed historical capture migration stopped safely.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END;
$patch_sealed_liquidation_end$;

-- Production applied the historical migration before its later repository edit.
-- Its LIVE function therefore has the sealed ADMIN branch but still chooses the
-- latest completed tranche, and has no V1 marker. Normalize that exact shape so
-- the V2 block below can add locks and require the immutable operational cutoff.
DO $patch_live_sealed_owner_checklist_shape$
DECLARE
  v_def text;
  v_old text := $old$    SELECT * INTO v_tramo FROM public.turno_tramos WHERE turno_sesion_id=v_s.id AND estado='COMPLETADO' ORDER BY fin_at DESC NULLS LAST LIMIT 1;$old$;
  v_new text := $new$    SELECT * INTO v_tramo FROM public.turno_tramos WHERE turno_sesion_id=v_s.id AND estado='COMPLETADO' AND fin_at=v_s.corte_operativo_at ORDER BY fin_at DESC NULLS LAST LIMIT 1;
    -- BC7_SEALED_OWNER_BLOCK_GATE_V1$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_confirmar_bloque_jornada(uuid,text,boolean)'::regprocedure
  ) INTO v_def;

  IF position('BC7_SEALED_OWNER_BLOCK_GATE_V1' IN v_def)=0
     AND position('CERRADA_OPERATIVAMENTE' IN v_def)>0
     AND position(v_old IN v_def)>0 THEN
    IF length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) THEN
      RAISE EXCEPTION 'Unexpected duplicate sealed-checklist tranche lookup; refusing ambiguous migration.';
    END IF;
    v_def:=replace(v_def,v_old,v_new);
    EXECUTE v_def;
  END IF;
END;
$patch_live_sealed_owner_checklist_shape$;

DO $patch_owner_checklist$
DECLARE
  v_def text;
  v_pattern text;
  v_replacement text;
  v_insert_pattern text;
  v_insert_replacement text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_confirmar_bloque_jornada(uuid,text,boolean)'::regprocedure) INTO v_def;

  -- pg_get_functiondef can normalize whitespace differently by PostgreSQL version.
  -- Match the two PL/pgSQL statements semantically, then install the sealed path.
  IF strpos(v_def,'BC7_SEALED_OWNER_BLOCK_GATE_V1')=0 THEN
    v_pattern := 'v_tramo[[:space:]]*:=[[:space:]]*public[.]bc7_validar_tramo_responsable_jornada[[:space:]]*[(]p_turno_sesion_id[)][[:space:]]*;[[:space:]]*SELECT[[:space:]]+[*][[:space:]]+INTO[[:space:]]+v_s[[:space:]]+FROM[[:space:]]+public[.]turno_sesiones[[:space:]]+WHERE[[:space:]]+id[[:space:]]*=[[:space:]]*p_turno_sesion_id;';
    IF v_def !~* v_pattern THEN
      RAISE EXCEPTION 'No se pudo adaptar bc7_confirmar_bloque_jornada al sello operativo.';
    END IF;

    v_replacement :=
      'SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;' || chr(10) ||
      '  IF NOT FOUND OR v_s.bloque<>''JORNADA'' THEN RAISE EXCEPTION ''La Jornada no existe.'' USING ERRCODE=''23503''; END IF;' || chr(10) ||
      '  IF v_s.estado=''CERRADA_OPERATIVAMENTE'' THEN' || chr(10) ||
      '    IF NOT public.bc_actor_is_admin() THEN RAISE EXCEPTION ''Solo ADMIN puede confirmar bloques después del sello operativo.'' USING ERRCODE=''42501''; END IF;' || chr(10) ||
      '    IF NOT EXISTS (SELECT 1 FROM public.turnos t WHERE t.id=v_s.turno_id AND t.estado=''ABIERTO'') THEN RAISE EXCEPTION ''El Turno maestro ya está cerrado; no se admiten cambios de checklist.'' USING ERRCODE=''23514''; END IF;' || chr(10) ||
      '    SELECT * INTO v_tramo FROM public.turno_tramos WHERE turno_sesion_id=v_s.id AND estado=''COMPLETADO'' AND fin_at=v_s.corte_operativo_at ORDER BY fin_at DESC NULLS LAST LIMIT 1;' || chr(10) ||
      '    IF v_tramo.id IS NULL THEN RAISE EXCEPTION ''No se encontró el tramo de la Jornada sellada.'' USING ERRCODE=''23514''; END IF;' || chr(10) ||
      '  ELSE' || chr(10) ||
      '    v_tramo:=public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);' || chr(10) ||
      '  END IF;' || chr(10) ||
      '  -- BC7_SEALED_OWNER_BLOCK_GATE_V1';
    v_def := regexp_replace(v_def,v_pattern,v_replacement,'i');

    v_insert_pattern := 'INSERT[[:space:]]+INTO[[:space:]]+public[.]turno_jornada_confirmaciones[[:space:]]*[(]turno_sesion_id[)][[:space:]]*VALUES[[:space:]]*[(]p_turno_sesion_id[)][[:space:]]*ON[[:space:]]+CONFLICT[[:space:]]*[(]turno_sesion_id[)][[:space:]]+DO[[:space:]]+NOTHING;';
    IF v_def !~* v_insert_pattern THEN
      RAISE EXCEPTION 'No se pudo localizar el alta de confirmaciones para proteger el checklist sellado.';
    END IF;
    v_insert_replacement :=
      'IF p_completado AND v_s.estado=''CERRADA_OPERATIVAMENTE'' THEN' || chr(10) ||
      '    IF v_tipo=''gastos'' AND EXISTS(SELECT 1 FROM public.gastos g WHERE g.turno_sesion_id=v_s.id AND g.estado=''PENDIENTE'') THEN RAISE EXCEPTION ''Todavía hay gastos pendientes de revisión.'' USING ERRCODE=''23514''; END IF;' || chr(10) ||
      '    IF v_tipo=''reinversiones'' AND EXISTS(SELECT 1 FROM public.reinversiones r WHERE r.turno_sesion_id=v_s.id AND r.estado=''PENDIENTE'') THEN RAISE EXCEPTION ''Todavía hay reinversiones pendientes de revisión.'' USING ERRCODE=''23514''; END IF;' || chr(10) ||
      '    IF v_tipo=''bajas'' AND (EXISTS(SELECT 1 FROM public.bajas b WHERE b.turno_sesion_id=v_s.id AND b.estado=''PENDIENTE'') OR EXISTS(SELECT 1 FROM public.mermas m WHERE m.turno_sesion_id=v_s.id AND m.estado=''PENDIENTE'')) THEN RAISE EXCEPTION ''Todavía hay bajas o mermas pendientes de revisión.'' USING ERRCODE=''23514''; END IF;' || chr(10) ||
      '  END IF;' || chr(10) ||
      '  INSERT INTO public.turno_jornada_confirmaciones(turno_sesion_id)' || chr(10) ||
      '  VALUES(p_turno_sesion_id)' || chr(10) ||
      '  ON CONFLICT(turno_sesion_id) DO NOTHING;';
    v_def := regexp_replace(v_def,v_insert_pattern,v_insert_replacement,'i');
  END IF;

  EXECUTE v_def;
END;
$patch_owner_checklist$;

DO $patch_sealed_owner_checklist_gate_v2$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_confirmar_bloque_jornada(uuid,text,boolean)'::regprocedure
  ) INTO v_def;

  IF position('BC7_SEALED_OWNER_BLOCK_GATE_V1' IN v_def)=0 THEN
    RAISE EXCEPTION 'The sealed ADMIN checklist gate V1 must exist before applying its concurrency-safe V2 guard.';
  END IF;

  v_old := $old$  v_tramo public.turno_tramos;$old$;
  v_new := $new$  v_tramo public.turno_tramos;
  v_master_turn public.turnos;$new$;
  IF position(v_old IN v_def)=0 OR
     length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Unexpected bc7_confirmar_bloque_jornada tranche declaration; checklist V2 stopped safely.';
  END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old := $old$  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;$old$;
  v_new := $new$  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;$new$;
  IF position(v_old IN v_def)=0 OR
     length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Unexpected bc7_confirmar_bloque_jornada session lookup; checklist V2 stopped safely.';
  END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old := $old$    SELECT * INTO v_tramo FROM public.turno_tramos WHERE turno_sesion_id=v_s.id AND estado='COMPLETADO' AND fin_at=v_s.corte_operativo_at ORDER BY fin_at DESC NULLS LAST LIMIT 1;$old$;
  v_new := $new$    IF v_s.corte_operativo_at IS NULL THEN
      RAISE EXCEPTION 'La Jornada sellada no conserva un corte operativo verificable.' USING ERRCODE='23514';
    END IF;
    SELECT * INTO v_master_turn FROM public.turnos WHERE id=v_s.turno_id FOR UPDATE;
    IF NOT FOUND OR v_master_turn.estado<>'ABIERTO'
       OR COALESCE(v_master_turn.estado_maestro,v_master_turn.estado)<>'EN_CURSO' THEN
      RAISE EXCEPTION 'El Turno maestro ya está cerrado; no se admiten cambios de checklist.' USING ERRCODE='23514';
    END IF;
    SELECT * INTO v_tramo FROM public.turno_tramos
    WHERE turno_sesion_id=v_s.id AND estado='COMPLETADO'
      AND fin_at=v_s.corte_operativo_at
    ORDER BY fin_at DESC NULLS LAST LIMIT 1;
    -- BC7_SEALED_OWNER_BLOCK_GATE_V2$new$;
  IF position(v_old IN v_def)=0 OR
     length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Unexpected bc7_confirmar_bloque_jornada sealed tranche lookup; checklist V2 stopped safely.';
  END IF;
  v_def:=replace(v_def,v_old,v_new);

  EXECUTE v_def;
END;
$patch_sealed_owner_checklist_gate_v2$;

COMMIT;
