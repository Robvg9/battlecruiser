BEGIN;

-- A Jornada owns stock movements by exact session identity and effective
-- operational boundaries. Retroactive transfer exceptions are granted per
-- transfer line, never per grouped transfer.
ALTER TABLE public.turno_jornada_entradas_vinculadas
  DROP CONSTRAINT IF EXISTS turno_jornada_entrada_transferencia_unica;

CREATE TABLE IF NOT EXISTS public.turno_jornada_entradas_lineas_vinculadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrada_vinculada_id uuid NOT NULL
    REFERENCES public.turno_jornada_entradas_vinculadas(id) ON DELETE RESTRICT,
  transferencia_linea_id uuid NOT NULL
    REFERENCES public.transferencias_lineas(id) ON DELETE RESTRICT,
  vinculado_por uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  vinculado_en timestamptz NOT NULL DEFAULT now(),
  motivo text NOT NULL CHECK (length(btrim(motivo)) >= 15),
  CONSTRAINT turno_jornada_entrada_linea_unica UNIQUE (transferencia_linea_id)
);

CREATE INDEX IF NOT EXISTS turno_jornada_entrada_linea_link_idx
  ON public.turno_jornada_entradas_lineas_vinculadas (entrada_vinculada_id);

ALTER TABLE public.turno_jornada_entradas_lineas_vinculadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.turno_jornada_entradas_lineas_vinculadas FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.turno_jornada_entradas_lineas_vinculadas IS
'Explicit owner-reviewed retroactive attribution at transfer-line granularity. A line can belong to only one Jornada; a grouped transfer is never implicitly attributed in full.';

-- Preserve existing Owner-approved retroactive links, but remove the Fosforeras
-- line from the Nov 18–20 La Cueva attribution: it arrived after the cut and
-- the verified workbook treats the 50-unit receipt as the successor period.
INSERT INTO public.turno_jornada_entradas_lineas_vinculadas
  (entrada_vinculada_id,transferencia_linea_id,vinculado_por,vinculado_en,motivo)
SELECT
  link.id,
  line.id,
  link.vinculado_por,
  link.vinculado_en,
  CASE
    WHEN s.fecha=DATE '2026-11-18'
      AND program.fecha_fin=DATE '2026-11-20'
      AND warehouse.nombre ILIKE '%La Cueva%'
      AND product.nombre ILIKE 'Fosforeras'
    THEN 'Excluida de la jornada 18–20/11: la línea llegó después del corte y el Excel la registra en el período sucesor.'
    ELSE 'Atribución histórica previamente autorizada; migrada a detalle por línea para impedir que otras líneas agrupadas se hereden.'
  END
FROM public.turno_jornada_entradas_vinculadas link
JOIN public.transferencias_lineas line
  ON line.transferencia_id=link.transferencia_id
JOIN public.transferencias transfer
  ON transfer.id=line.transferencia_id
JOIN public.productos product
  ON product.id=line.producto_id
JOIN public.turno_sesiones s
  ON s.id=link.turno_sesion_id
JOIN public.turno_jornada_programacion program
  ON program.id=s.jornada_programacion_id
JOIN public.almacenes warehouse
  ON warehouse.id=s.almacen_id
WHERE NOT (
  s.fecha=DATE '2026-11-18'
  AND program.fecha_fin=DATE '2026-11-20'
  AND warehouse.nombre ILIKE '%La Cueva%'
  AND product.nombre ILIKE 'Fosforeras'
)
ON CONFLICT (transferencia_linea_id) DO NOTHING;

-- Restore reciprocal proof for inherited inventory. A previous FINAL cut is
-- a valid effective opening only when it explicitly points back to this exact
-- successor INITIAL cut. A mere one-way origin_corte_id is not proof: when
-- reciprocity is absent, the successor's own physical confirmation timestamp
-- is the safe opening boundary.
DO $patch_settlement$
DECLARE
  v_function text := pg_get_functiondef(
    'public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure
  );
  v_old_start text := $old$
          AND source_cut.tipo='FINAL'
          AND source_cut.estado='CONFIRMADO'
$old$;
  v_new_start text := $new$
          AND source_cut.tipo='FINAL'
          AND source_cut.estado='CONFIRMADO'
          AND source_cut.corte_sucesora_origen_id=v_initial.id
$new$;
  v_old_stock_reinvestment text := $old$
    WHERE r.almacen_id=v_s.almacen_id
      AND r.estado='APROBADA' AND r.fecha_revision IS NOT NULL
      AND r.creado_en>v_start_at AND r.creado_en<=v_end_at
$old$;
  v_new_stock_reinvestment text := $new$
    WHERE r.almacen_id=v_s.almacen_id
      AND r.turno_sesion_id=v_s.id
      AND r.estado='APROBADA' AND r.fecha_revision IS NOT NULL
$new$;
  v_old_cash_reinvestment text := $old$
  WHERE r.almacen_id=v_s.almacen_id
    AND r.estado IN ('APROBADA','PENDIENTE')
    AND r.creado_en>v_start_at AND r.creado_en<=v_end_at;
$old$;
  v_new_cash_reinvestment text := $new$
  WHERE r.almacen_id=v_s.almacen_id
    AND r.turno_sesion_id=v_s.id
    AND r.estado IN ('APROBADA','PENDIENTE');
$new$;
  v_old_transfer_session_scope text := $old$
    WHERE t.almacen_destino_id=v_s.almacen_id AND lower(t.estado)='completada'
      AND t.fecha>v_start_at
$old$;
  v_new_transfer_session_scope text := $new$
    WHERE t.almacen_destino_id=v_s.almacen_id AND lower(t.estado)='completada'
      AND t.fecha>v_start_at
      AND NOT EXISTS (
        SELECT 1
        FROM public.turno_jornada_entradas_lineas_vinculadas allocated_line
        JOIN public.turno_jornada_entradas_vinculadas allocated_link
          ON allocated_link.id=allocated_line.entrada_vinculada_id
        WHERE allocated_line.transferencia_linea_id=tl.id
          AND allocated_link.turno_sesion_id<>v_s.id
      )
$new$;
  v_old_transfer_override text := $old$
        OR EXISTS (
          SELECT 1
          FROM public.turno_jornada_entradas_vinculadas linked_override
          WHERE linked_override.turno_sesion_id=v_s.id
            AND linked_override.transferencia_id=t.id
        )
$old$;
  v_new_transfer_override text := $new$
        OR EXISTS (
          SELECT 1
          FROM public.turno_jornada_entradas_vinculadas linked_override
          JOIN public.turno_jornada_entradas_lineas_vinculadas linked_line
            ON linked_line.entrada_vinculada_id=linked_override.id
          WHERE linked_override.turno_sesion_id=v_s.id
            AND linked_override.transferencia_id=t.id
            AND linked_line.transferencia_linea_id=tl.id
        )
$new$;
  v_old_retroactive_override text := $old$
        OR EXISTS(SELECT 1 FROM public.turno_jornada_entradas_vinculadas linked
          WHERE linked.turno_sesion_id=v_s.id AND linked.transferencia_id=t.id))
$old$;
  v_new_retroactive_override text := $new$
        OR EXISTS(
          SELECT 1
          FROM public.turno_jornada_entradas_vinculadas linked
          JOIN public.turno_jornada_entradas_lineas_vinculadas linked_line
            ON linked_line.entrada_vinculada_id=linked.id
          WHERE linked.turno_sesion_id=v_s.id
            AND linked.transferencia_id=t.id
            AND linked_line.transferencia_linea_id=tl.id
        ))
$new$;
BEGIN
  IF position(v_new_start IN v_function)=0 THEN
    IF position(v_old_start IN v_function)=0 THEN
      RAISE EXCEPTION 'Could not locate inherited FINAL-cut predicate; refusing a partial settlement rewrite.';
    END IF;
    v_function:=replace(v_function,v_old_start,v_new_start);
  END IF;

  IF position(v_new_stock_reinvestment IN v_function)=0 THEN
    IF position(v_old_stock_reinvestment IN v_function)=0 THEN
      RAISE EXCEPTION 'Could not locate stock reinvestment aggregation; refusing a partial settlement rewrite.';
    END IF;
    v_function:=replace(v_function,v_old_stock_reinvestment,v_new_stock_reinvestment);
  END IF;

  IF position(v_new_cash_reinvestment IN v_function)=0 THEN
    IF position(v_old_cash_reinvestment IN v_function)=0 THEN
      RAISE EXCEPTION 'Could not locate cash reinvestment aggregation; refusing a partial settlement rewrite.';
    END IF;
    v_function:=replace(v_function,v_old_cash_reinvestment,v_new_cash_reinvestment);
  END IF;

  IF position(v_new_transfer_session_scope IN v_function)=0 THEN
    IF position(v_old_transfer_session_scope IN v_function)=0 THEN
      RAISE EXCEPTION 'Could not locate inbound transfer session scope; refusing a partial settlement rewrite.';
    END IF;
    v_function:=replace(v_function,v_old_transfer_session_scope,v_new_transfer_session_scope);
  END IF;

  IF position(v_new_transfer_override IN v_function)=0 THEN
    IF position(v_old_transfer_override IN v_function)=0 THEN
      RAISE EXCEPTION 'Could not locate exact transfer override; refusing a partial settlement rewrite.';
    END IF;
    v_function:=replace(v_function,v_old_transfer_override,v_new_transfer_override);
  END IF;

  IF position(v_new_retroactive_override IN v_function)=0 THEN
    IF position(v_old_retroactive_override IN v_function)=0 THEN
      RAISE EXCEPTION 'Could not locate retroactive transfer date override; refusing a partial settlement rewrite.';
    END IF;
    v_function:=replace(v_function,v_old_retroactive_override,v_new_retroactive_override);
  END IF;

  EXECUTE v_function;
END
$patch_settlement$;

-- A transfer is auto-associated with a Jornada only when its actual event
-- timestamp lies inside exactly one scheduled operational window. Never pick
-- the "latest EN_CURSO" session merely because it is still awaiting sealing.
CREATE OR REPLACE FUNCTION public.bc7_vincular_transferencia_jornada_destino_minorista()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_session_id uuid;
  v_candidates integer;
BEGIN
  IF v_actor IS NULL OR lower(coalesce(NEW.estado,''))<>'completada' THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer
    INTO v_candidates
  FROM public.turno_sesiones s
  JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
  JOIN public.almacenes a ON a.id=s.almacen_id
  WHERE s.almacen_id=NEW.almacen_destino_id
    AND a.tipo='minorista'
    AND s.bloque='JORNADA'
    AND s.jornada_programacion_id IS NOT NULL
    AND s.estado='EN_CURSO'
    AND NEW.fecha >= (
      (p.fecha::timestamp+p.hora_inicio_prevista)
      AT TIME ZONE coalesce(nullif(p.zona_horaria,''),'America/Havana')
    )
    AND NEW.fecha <= (
      (coalesce(p.fecha_fin,p.fecha)::timestamp+p.hora_fin_prevista)
      AT TIME ZONE coalesce(nullif(p.zona_horaria,''),'America/Havana')
    );

  IF v_candidates<>1 THEN
    RETURN NEW;
  END IF;

  SELECT s.id INTO v_session_id
  FROM public.turno_sesiones s
  JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
  JOIN public.almacenes a ON a.id=s.almacen_id
  WHERE s.almacen_id=NEW.almacen_destino_id
    AND a.tipo='minorista'
    AND s.bloque='JORNADA'
    AND s.jornada_programacion_id IS NOT NULL
    AND s.estado='EN_CURSO'
    AND NEW.fecha >= (
      (p.fecha::timestamp+p.hora_inicio_prevista)
      AT TIME ZONE coalesce(nullif(p.zona_horaria,''),'America/Havana')
    )
    AND NEW.fecha <= (
      (coalesce(p.fecha_fin,p.fecha)::timestamp+p.hora_fin_prevista)
      AT TIME ZONE coalesce(nullif(p.zona_horaria,''),'America/Havana')
    )
  LIMIT 1;

  INSERT INTO public.turno_jornada_entradas_vinculadas
    (turno_sesion_id,transferencia_id,vinculado_por)
  VALUES(v_session_id,NEW.id,v_actor)
  ON CONFLICT (turno_sesion_id,transferencia_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bc7_vincular_transferencia_jornada_destino_minorista
  ON public.transferencias;
CREATE TRIGGER trg_bc7_vincular_transferencia_jornada_destino_minorista
AFTER INSERT OR UPDATE ON public.transferencias
FOR EACH ROW
EXECUTE FUNCTION public.bc7_vincular_transferencia_jornada_destino_minorista();

-- The pending queue is based on the precise scheduled end clock, and returns
-- only transfer lines that have not already been attributed to any Jornada.
DROP FUNCTION IF EXISTS public.bc7_transferencias_pendientes_vinculo_jornada(uuid);
CREATE FUNCTION public.bc7_transferencias_pendientes_vinculo_jornada(p_turno_sesion_id uuid)
RETURNS TABLE(
  transferencia_id uuid,
  fecha_registro timestamptz,
  almacen_origen text,
  almacen_destino text,
  producto text,
  cantidad numeric,
  lineas_total integer,
  transferencia_linea_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_period_end timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde a una Jornada.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS(SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'Solo la responsable asignada o ADMIN puede consultar transferencias pendientes de atribución.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  v_period_end:=(
    (coalesce(v_p.fecha_fin,v_p.fecha)::timestamp+v_p.hora_fin_prevista)
    AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana')
  );

  RETURN QUERY
  SELECT t.id,t.fecha,ao.nombre::text,ad.nombre::text,p.nombre::text,tl.cantidad,
    count(*) OVER(PARTITION BY t.id)::integer,tl.id
  FROM public.transferencias t
  JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
  JOIN public.productos p ON p.id=tl.producto_id
  JOIN public.almacenes ao ON ao.id=t.almacen_origen_id
  JOIN public.almacenes ad ON ad.id=t.almacen_destino_id
  WHERE t.almacen_destino_id=v_s.almacen_id
    AND lower(t.estado)='completada'
    AND t.fecha>v_period_end
    AND t.fecha<=now()
    AND NOT EXISTS(
      SELECT 1
      FROM public.turno_jornada_entradas_lineas_vinculadas linked_line
      WHERE linked_line.transferencia_linea_id=tl.id
    )
  ORDER BY t.fecha,t.id,p.nombre;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_transferencias_pendientes_vinculo_jornada(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_transferencias_pendientes_vinculo_jornada(uuid) TO authenticated;

-- New Owner action: select exact lines, validate their transfer and destination,
-- and allocate each stock line at most once.
CREATE OR REPLACE FUNCTION public.bc7_vincular_lineas_transferencia_jornada(
  p_turno_sesion_id uuid,
  p_transferencia_id uuid,
  p_transferencia_linea_ids uuid[],
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_t public.transferencias;
  v_link_id uuid;
  v_period_end timestamptz;
  v_reason text:=nullif(left(btrim(coalesce(p_motivo,'')),1000),'');
  v_valid_count integer;
  v_existing_count integer;
  v_same_session_count integer;
  v_distinct_chars integer;
  v_lines jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede atribuir líneas históricas a una Jornada.' USING ERRCODE='42501';
  END IF;
  SELECT count(DISTINCT ch) INTO v_distinct_chars
  FROM regexp_split_to_table(coalesce(v_reason,''),'') AS chars(ch)
  WHERE ch ~ '[[:alnum:]]';
  IF v_reason IS NULL OR length(v_reason)<15 OR coalesce(v_distinct_chars,0)<6 THEN
    RAISE EXCEPTION 'Explica la atribución con un motivo real de al menos 15 caracteres.' USING ERRCODE='23514';
  END IF;
  IF coalesce(cardinality(p_transferencia_linea_ids),0)<1
     OR cardinality(p_transferencia_linea_ids)>100
     OR cardinality(p_transferencia_linea_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_transferencia_linea_ids) AS id) THEN
    RAISE EXCEPTION 'Selecciona entre 1 y 100 líneas distintas.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión destino no corresponde a una Jornada.' USING ERRCODE='23503';
  END IF;
  IF v_s.estado NOT IN ('PROGRAMADA','EN_CURSO','COMPLETADA','CERRADA_OPERATIVAMENTE') THEN
    RAISE EXCEPTION 'La sesión no admite atribuciones históricas en su estado actual.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.turnos t WHERE t.id=v_s.turno_id AND t.estado='ABIERTO') THEN
    RAISE EXCEPTION 'El Turno maestro debe seguir ABIERTO; no se altera un cierre ya aprobado.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_p
  FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id;
  v_period_end:=(
    (coalesce(v_p.fecha_fin,v_p.fecha)::timestamp+v_p.hora_fin_prevista)
    AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana')
  );
  IF coalesce(v_p.fecha_fin,v_p.fecha)>=(now() AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'))::date THEN
    RAISE EXCEPTION 'La atribución retroactiva solo aplica a períodos ya finalizados.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_t
  FROM public.transferencias
  WHERE id=p_transferencia_id
  FOR UPDATE;
  IF NOT FOUND OR lower(v_t.estado)<>'completada' OR v_t.almacen_destino_id<>v_s.almacen_id THEN
    RAISE EXCEPTION 'La transferencia debe estar completada y su destino debe ser el almacén de esta Jornada.' USING ERRCODE='23514';
  END IF;
  IF v_t.fecha<=v_period_end THEN
    RAISE EXCEPTION 'La transferencia está dentro del período; no necesita atribución retroactiva.' USING ERRCODE='23514';
  END IF;

  SELECT count(*)::integer INTO v_valid_count
  FROM public.transferencias_lineas tl
  WHERE tl.transferencia_id=v_t.id
    AND tl.id=ANY(p_transferencia_linea_ids);
  IF v_valid_count<>cardinality(p_transferencia_linea_ids) THEN
    RAISE EXCEPTION 'Una o más líneas seleccionadas no pertenecen a esta transferencia.' USING ERRCODE='23514';
  END IF;

  SELECT id INTO v_link_id
  FROM public.turno_jornada_entradas_vinculadas
  WHERE turno_sesion_id=v_s.id AND transferencia_id=v_t.id
  FOR UPDATE;

  SELECT count(*)::integer,
         count(*) FILTER(WHERE linked.entrada_vinculada_id=v_link_id)::integer
    INTO v_existing_count,v_same_session_count
  FROM public.turno_jornada_entradas_lineas_vinculadas linked
  WHERE linked.transferencia_linea_id=ANY(p_transferencia_linea_ids);

  IF v_existing_count>0 THEN
    IF v_link_id IS NOT NULL AND v_same_session_count=cardinality(p_transferencia_linea_ids) THEN
      RETURN jsonb_build_object('ok',true,'idempotente',true,'vinculo_id',v_link_id,
        'transferencia_id',v_t.id,'lineas',v_same_session_count);
    END IF;
    RAISE EXCEPTION 'Al menos una línea ya fue atribuida a otra Jornada o la selección mezcla líneas nuevas y existentes. Actualiza la lista antes de continuar.' USING ERRCODE='23505';
  END IF;

  IF v_link_id IS NULL THEN
    INSERT INTO public.turno_jornada_entradas_vinculadas
      (turno_sesion_id,transferencia_id,vinculado_por)
    VALUES(v_s.id,v_t.id,auth.uid())
    RETURNING id INTO v_link_id;
  END IF;

  INSERT INTO public.turno_jornada_entradas_lineas_vinculadas
    (entrada_vinculada_id,transferencia_linea_id,vinculado_por,motivo)
  SELECT v_link_id,tl.id,auth.uid(),v_reason
  FROM public.transferencias_lineas tl
  WHERE tl.transferencia_id=v_t.id
    AND tl.id=ANY(p_transferencia_linea_ids);

  SELECT jsonb_agg(jsonb_build_object(
    'linea_id',tl.id,'producto',p.nombre,'cantidad',tl.cantidad
  ) ORDER BY p.nombre,tl.id)
  INTO v_lines
  FROM public.transferencias_lineas tl
  JOIN public.productos p ON p.id=tl.producto_id
  WHERE tl.id=ANY(p_transferencia_linea_ids);

  INSERT INTO public.turno_eventos
    (turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
  VALUES
    (v_s.turno_id,v_s.id,NULL,auth.uid(),'TRANSFERENCIA_LINEAS_RETROACTIVAS_VINCULADAS',
     jsonb_build_object(
       'vinculo_id',v_link_id,
       'transferencia_id',v_t.id,
       'fecha_registro_real',v_t.fecha,
       'periodo_operativo_inicio',v_p.fecha,
       'periodo_operativo_fin',coalesce(v_p.fecha_fin,v_p.fecha),
       'lineas',v_lines,
       'motivo',v_reason,
       'aplicacion_unica',true,
       'atribucion_por_linea',true
     ));

  RETURN jsonb_build_object('ok',true,'idempotente',false,'vinculo_id',v_link_id,
    'transferencia_id',v_t.id,'fecha_registro_real',v_t.fecha,
    'periodo_operativo_inicio',v_p.fecha,'periodo_operativo_fin',coalesce(v_p.fecha_fin,v_p.fecha),
    'lineas',v_lines);
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_vincular_lineas_transferencia_jornada(uuid,uuid,uuid[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_vincular_lineas_transferencia_jornada(uuid,uuid,uuid[],text) TO authenticated;

-- Prevent old clients or stale cached UI from granting an entire grouped transfer.
CREATE OR REPLACE FUNCTION public.bc7_vincular_transferencia_jornada(
  p_turno_sesion_id uuid,
  p_transferencia_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'Esta acción fue retirada: selecciona las líneas exactas de producto que pertenecen a la Jornada.';
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_vincular_transferencia_jornada(uuid,uuid,text) FROM PUBLIC,anon,authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
