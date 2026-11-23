BEGIN;

-- A post-seal final count is a historical record, not a count of today's stock.
-- Store the immutable physical cutoff and the evidence fingerprint separately
-- from the time at which the responsible person submits the record.
ALTER TABLE public.turno_jornada_inventario_cortes
  ADD COLUMN IF NOT EXISTS corte_fisico_at timestamptz,
  ADD COLUMN IF NOT EXISTS fuente_documental text,
  ADD COLUMN IF NOT EXISTS fuente_content_hash text,
  ADD COLUMN IF NOT EXISTS postseal_payload_hash text,
  ADD COLUMN IF NOT EXISTS registrado_post_sello boolean NOT NULL DEFAULT false;

UPDATE public.turno_jornada_inventario_cortes
SET corte_fisico_at=COALESCE(confirmado_en,creado_en)
WHERE tipo='FINAL' AND corte_fisico_at IS NULL;

-- The legacy writer stays locked for sealed sessions unless the new,
-- tightly validated post-seal wrapper sets the transaction-local context.
DO $patch_final_inventory_guard$
DECLARE
  v_definition text;
  v_old text := $old$  IF upper(p_tipo)='FINAL' AND v_s.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'El inventario final solo puede confirmarse durante la jornada.' USING ERRCODE='23514';
  END IF;$old$;
  v_new text := $new$  IF upper(p_tipo)='FINAL' AND v_s.estado<>'EN_CURSO' THEN
    IF v_s.estado<>'CERRADA_OPERATIVAMENTE'
       OR current_setting('bc7.postseal_inventory_session',true) IS DISTINCT FROM v_s.id::text
       OR v_s.corte_operativo_at IS NULL
       OR NOT EXISTS(
         SELECT 1 FROM public.turnos t
         WHERE t.id=v_s.turno_id AND t.estado='ABIERTO'
       )
       OR NOT EXISTS(
         SELECT 1
         FROM public.turno_jornada_programacion jp
         JOIN public.turno_asignaciones a
           ON a.turno_sesion_id=v_s.id
          AND a.usuario_id=jp.responsable_id
          AND a.retirado_at IS NULL
         JOIN public.turno_tramos tr
           ON tr.turno_sesion_id=v_s.id
          AND tr.usuario_id=jp.responsable_id
          AND tr.estado='COMPLETADO'
          AND tr.fin_at=v_s.corte_operativo_at
         WHERE jp.id=v_s.jornada_programacion_id
           AND jp.responsable_id IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'El inventario final sellado exige evidencia autorizada, tramo exacto y Turno maestro abierto.'
        USING ERRCODE='23514';
    END IF;
  END IF;$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_guardar_inventario_jornada(uuid,text,jsonb,text)'::regprocedure
  ) INTO v_definition;

  IF position(v_old IN v_definition)=0 OR
     length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Unexpected final-inventory state guard; migration stopped safely.';
  END IF;

  EXECUTE replace(v_definition,v_old,v_new);
END;
$patch_final_inventory_guard$;

-- Protect the ADMIN checklist path that was added to the already-applied
-- historical migration. Never replay or edit that migration on LIVE.
DO $patch_sealed_owner_checklist$
DECLARE
  v_definition text;
  v_old text := $old$    SELECT * INTO v_tramo FROM public.turno_tramos WHERE turno_sesion_id=v_s.id AND estado='COMPLETADO' ORDER BY fin_at DESC NULLS LAST LIMIT 1;
    IF v_tramo.id IS NULL THEN RAISE EXCEPTION 'No se encontró el tramo de la Jornada sellada.' USING ERRCODE='23514'; END IF;$old$;
  v_new text := $new$    IF v_s.corte_operativo_at IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.turnos t
      WHERE t.id=v_s.turno_id AND t.estado='ABIERTO'
    ) THEN
      RAISE EXCEPTION 'El Turno maestro ya está cerrado o no conserva un corte verificable; no se puede completar el checklist sellado.'
        USING ERRCODE='23514';
    END IF;
    SELECT tr.* INTO v_tramo
    FROM public.turno_tramos tr
    JOIN public.turno_jornada_programacion jp
      ON jp.id=v_s.jornada_programacion_id
    WHERE tr.turno_sesion_id=v_s.id
      AND tr.usuario_id=jp.responsable_id
      AND tr.estado='COMPLETADO'
      AND tr.fin_at=v_s.corte_operativo_at
      AND EXISTS(
        SELECT 1 FROM public.turno_asignaciones a
        WHERE a.turno_sesion_id=v_s.id
          AND a.usuario_id=tr.usuario_id
          AND a.retirado_at IS NULL
      )
    ORDER BY tr.fin_at DESC NULLS LAST
    LIMIT 1;
    IF v_tramo.id IS NULL THEN
      RAISE EXCEPTION 'No existe el tramo completado exacto de la responsable asignada al corte operativo.'
        USING ERRCODE='23514';
    END IF;$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_confirmar_bloque_jornada(uuid,text,boolean)'::regprocedure
  ) INTO v_definition;

  IF position(v_old IN v_definition)=0 OR
     length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Unexpected sealed Owner checklist tranche guard; migration stopped safely.';
  END IF;

  EXECUTE replace(v_definition,v_old,v_new);
END;
$patch_sealed_owner_checklist$;

-- The post-seal RPC allows the assigned responsible (or ADMIN) to submit one
-- historical final count only while the master Turn remains open. It requires
-- the exact completed tranche, a source document name, and that document's SHA-256.
-- Retries with the identical payload/evidence return the original immutable cut.
CREATE OR REPLACE FUNCTION public.bc7_guardar_inventario_final_post_sello_jornada(
  p_turno_sesion_id uuid,
  p_lineas jsonb,
  p_observacion text,
  p_fuente_documental text,
  p_fuente_content_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_turno public.turnos;
  v_tramo public.turno_tramos;
  v_existing public.turno_jornada_inventario_cortes;
  v_result jsonb;
  v_corte_id uuid;
  v_source text:=nullif(left(btrim(coalesce(p_fuente_documental,'')),300),'');
  v_hash text:=lower(btrim(coalesce(p_fuente_content_hash,'')));
  v_payload_hash text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array' THEN
    RAISE EXCEPTION 'El conteo histórico debe incluir la lista completa de productos.' USING ERRCODE='22023';
  END IF;
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Indica el nombre o referencia de la fuente documental del conteo.' USING ERRCODE='22023';
  END IF;
  IF v_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'La fuente documental debe tener una huella SHA-256 hexadecimal de 64 caracteres.' USING ERRCODE='22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_observacion,'')),'') IS NULL OR length(p_observacion)>1000 THEN
    RAISE EXCEPTION 'Describe la procedencia del conteo histórico en una observación de hasta 1000 caracteres.' USING ERRCODE='22023';
  END IF;
  v_payload_hash:=md5(p_lineas::text);

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;

  IF NOT FOUND OR v_s.bloque<>'JORNADA'
     OR v_s.jornada_programacion_id IS NULL
     OR v_s.estado<>'CERRADA_OPERATIVAMENTE'
     OR v_s.corte_operativo_at IS NULL THEN
    RAISE EXCEPTION 'Solo se puede registrar el inventario final histórico de una Jornada sellada con corte verificable.'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_turno
  FROM public.turnos
  WHERE id=v_s.turno_id
  FOR UPDATE;
  IF NOT FOUND OR v_turno.estado IS DISTINCT FROM 'ABIERTO' THEN
    RAISE EXCEPTION 'El Turno maestro debe continuar abierto para recibir el inventario final histórico.'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_p
  FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id
  FOR SHARE;
  IF NOT FOUND OR v_p.responsable_id IS NULL THEN
    RAISE EXCEPTION 'La Jornada no conserva una responsable asignada verificable.'
      USING ERRCODE='23514';
  END IF;

  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR v_p.responsable_id IS DISTINCT FROM auth.uid()
    OR NOT EXISTS(
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id
        AND a.usuario_id=auth.uid()
        AND a.retirado_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Solo la responsable asignada con permiso o ADMIN puede registrar este conteo histórico.'
      USING ERRCODE='42501';
  END IF;

  SELECT tr.* INTO v_tramo
  FROM public.turno_tramos tr
  WHERE tr.turno_sesion_id=v_s.id
    AND tr.usuario_id=v_p.responsable_id
    AND tr.estado='COMPLETADO'
    AND tr.fin_at=v_s.corte_operativo_at
    AND EXISTS(
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id
        AND a.usuario_id=tr.usuario_id
        AND a.retirado_at IS NULL
    )
  ORDER BY tr.inicio_at DESC NULLS LAST,tr.created_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el tramo completado exacto de la responsable asignada al corte operativo.'
      USING ERRCODE='23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_s.id::text||':postseal-final-inventory',0));

  SELECT * INTO v_existing
  FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo='FINAL'
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.registrado_post_sello IS TRUE
       AND v_existing.corte_fisico_at=v_s.corte_operativo_at
       AND v_existing.fuente_documental=v_source
       AND v_existing.fuente_content_hash=v_hash
       AND v_existing.postseal_payload_hash=v_payload_hash THEN
      RETURN jsonb_build_object(
        'id',v_existing.id,'tipo','FINAL','estado',v_existing.estado,
        'registrado_post_sello',true,'corte_fisico_at',v_existing.corte_fisico_at,
        'idempotente',true,'mensaje','El inventario final histórico ya estaba guardado con la misma fuente y cantidades.'
      );
    END IF;
    RAISE EXCEPTION 'Ya existe un inventario final para esta Jornada. No se sobrescribirá; requiere una rectificación auditada.'
      USING ERRCODE='23505';
  END IF;

  PERFORM set_config('bc7.postseal_inventory_session',v_s.id::text,true);

  v_result:=public.bc7_guardar_inventario_jornada(
    v_s.id,'FINAL',p_lineas,p_observacion
  );
  v_corte_id:=NULLIF(v_result->>'id','')::uuid;

  IF v_corte_id IS NULL THEN
    RAISE EXCEPTION 'No se obtuvo el identificador del inventario final histórico.'
      USING ERRCODE='23514';
  END IF;

  UPDATE public.turno_jornada_inventario_cortes
  SET corte_fisico_at=v_s.corte_operativo_at,
      fuente_documental=v_source,
      fuente_content_hash=v_hash,
      postseal_payload_hash=v_payload_hash,
      registrado_post_sello=true
  WHERE id=v_corte_id
    AND turno_sesion_id=v_s.id
    AND tipo='FINAL';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo guardar la procedencia del inventario final histórico.'
      USING ERRCODE='23514';
  END IF;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  )
  VALUES(
    v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),
    'INVENTARIO_FINAL_REGISTRADO_POST_SELLO',
    left(v_source||' · SHA-256 '||v_hash,1000),
    jsonb_build_object('sesion_id',v_s.id,'estado',v_s.estado),
    jsonb_build_object(
      'corte_id',v_corte_id,
      'corte_fisico_at',v_s.corte_operativo_at,
      'registrado_post_sello',true,
      'fuente_documental',v_source,
      'fuente_content_hash',v_hash,
      'postseal_payload_hash',v_payload_hash
    )
  );

  RETURN v_result||jsonb_build_object(
    'registrado_post_sello',true,
    'corte_fisico_at',v_s.corte_operativo_at,
    'fuente_documental',v_source,
    'fuente_content_hash',v_hash,
    'idempotente',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_guardar_inventario_final_post_sello_jornada(uuid,jsonb,text,text,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_guardar_inventario_final_post_sello_jornada(uuid,jsonb,text,text,text)
  TO authenticated;

-- A late-recorded final cut must retain the original operational cutoff for
-- general purchases/transfers/vales. The time of data entry is not the physical
-- time represented by the historical count.
DO $patch_historical_liquidation_cutoff$
DECLARE
  v_definition text;
  v_old text := $old$  v_end_at:=coalesce(v_final.confirmado_en,v_final.creado_en,now());$old$;
  v_new text := $new$  v_end_at:=CASE
    WHEN v_s.estado='CERRADA_OPERATIVAMENTE'
         AND coalesce(v_final.registrado_post_sello,false) THEN
      coalesce(v_final.corte_fisico_at,v_s.corte_operativo_at)
    ELSE coalesce(v_final.corte_fisico_at,v_final.confirmado_en,v_final.creado_en,now())
  END;$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure
  ) INTO v_definition;

  IF position(v_old IN v_definition)=0 OR
     length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Unexpected Jornada liquidation end-at declaration; migration stopped safely.';
  END IF;

  EXECUTE replace(v_definition,v_old,v_new);
END;
$patch_historical_liquidation_cutoff$;

COMMIT;
