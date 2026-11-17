BEGIN;

-- Keep the historic physical snapshot consistent with the session's actual
-- operational evidence. Late products are countable only when supported by
-- an approved reinvestment for this Jornada or a completed inbound transfer
-- not already attributed to a different session. Pending transfer attribution
-- remains a separate Owner action and retains the transfer's real timestamp.

CREATE OR REPLACE FUNCTION public.bc7_obtener_inventario_jornada(p_turno_sesion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_result jsonb;
  v_agrupar boolean:=false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde al modelo de jornada única.' USING ERRCODE='23503';
  END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programación no encontrada.' USING ERRCODE='23503'; END IF;
  SELECT (a.tipo='minorista') INTO v_agrupar
  FROM public.almacenes a WHERE a.id=v_s.almacen_id;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS (
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado con turnos.ver puede consultar esta jornada.' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'sesion',jsonb_build_object(
      'id',v_s.id,'turno_id',v_s.turno_id,'almacen_id',v_s.almacen_id,
      'numero_dia',v_s.numero_dia,'fecha',v_s.fecha,'fecha_fin',coalesce(v_p.fecha_fin,v_s.fecha),'bloque',v_s.bloque,
      'estado',v_s.estado,'hora_inicio_prevista',v_p.hora_inicio_prevista,
      'hora_fin_prevista',v_p.hora_fin_prevista,'zona_horaria',v_p.zona_horaria,
      'responsable_id',v_p.responsable_id,'programacion_id',v_p.id,'es_minorista',v_agrupar,
  'sucesora_retroactiva',EXISTS(
   SELECT 1 FROM public.turno_jornada_inventario_entregas e
   JOIN public.turnos ot ON ot.id=e.turno_id
   WHERE e.destino_sesion_id=v_s.id AND ot.estado_maestro='CERRADO'
  )
    ),
    'productos',CASE WHEN v_agrupar THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'producto_id',p.id,'nombre',p.nombre,'unidad',p.unidad,
        'stock_actual',coalesce((
          SELECT sum(s.cantidad) FROM public.stock s JOIN public.productos sp ON sp.id=s.producto_id
          WHERE s.almacen_id=v_s.almacen_id AND (sp.id=p.id OR sp.producto_padre_id=p.id)
        ),0),
        'minimo',coalesce((
          SELECT sum(s.minimo) FROM public.stock s JOIN public.productos sp ON sp.id=s.producto_id
          WHERE s.almacen_id=v_s.almacen_id AND (sp.id=p.id OR sp.producto_padre_id=p.id)
        ),0),
        'es_familia',EXISTS(SELECT 1 FROM public.productos h WHERE h.producto_padre_id=p.id AND h.activo=true)
      ) ORDER BY p.nombre,p.id)
      FROM public.productos p
      WHERE p.activo=true AND p.producto_padre_id IS NULL
        AND (
          p.created_at < (
            (coalesce(v_p.fecha_fin,v_p.fecha) + 1)::timestamp
            AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana')
          )
          OR EXISTS (
            SELECT 1
            FROM public.reinversiones r
            JOIN public.reinversiones_lineas rl ON rl.reinversion_id=r.id
            JOIN public.productos rp ON rp.id=rl.producto_id
            WHERE r.turno_sesion_id=v_s.id AND r.estado='APROBADA'
              AND coalesce(rp.producto_padre_id,rp.id)=p.id
          )
          OR EXISTS (
            SELECT 1
            FROM public.transferencias t
            JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
            JOIN public.productos tp ON tp.id=tl.producto_id
            WHERE t.almacen_destino_id=v_s.almacen_id
              AND lower(t.estado)='completada'
              AND t.fecha<=now()
              AND t.fecha >= (
                (coalesce(v_p.fecha_fin,v_p.fecha) + 1)::timestamp
                AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana')
              )
              AND NOT EXISTS (
                SELECT 1 FROM public.turno_jornada_entradas_vinculadas linked
                WHERE linked.transferencia_id=t.id
                  AND linked.turno_sesion_id<>v_s.id
              )
              AND coalesce(tp.producto_padre_id,tp.id)=p.id
          )
        )
    ),'[]'::jsonb) ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'producto_id',p.id,'nombre',p.nombre,'unidad',p.unidad,
        'stock_actual',s.cantidad,'minimo',s.minimo
      ) ORDER BY p.nombre,p.id)
      FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
      WHERE s.almacen_id=v_s.almacen_id AND p.activo=true
    ),'[]'::jsonb) END,
    'cortes',coalesce((
      SELECT jsonb_object_agg(c.tipo,jsonb_build_object(
        'id',c.id,'tipo',c.tipo,'estado',c.estado,'creado_por',c.creado_por,
        'confirmado_por',c.confirmado_por,'creado_en',c.creado_en,
        'confirmado_en',c.confirmado_en,'observacion',c.observacion,
        'origen_corte_id',c.origen_corte_id,
        'lineas',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'producto_id',l.producto_id,'cantidad_contada',l.cantidad_contada,
            'stock_sistema',l.stock_sistema,'diferencia',l.cantidad_contada-l.stock_sistema
          ) ORDER BY p.nombre,p.id)
          FROM public.turno_jornada_inventario_lineas l
          JOIN public.productos p ON p.id=l.producto_id
          WHERE l.corte_id=c.id
        ),'[]'::jsonb)
      ))
      FROM public.turno_jornada_inventario_cortes c
      WHERE c.turno_sesion_id=v_s.id
    ),'{}'::jsonb),
    'apertura_previa',(
      SELECT jsonb_build_object(
        'corte_id',c.id,'sesion_id',ps.id,'numero_dia',ps.numero_dia,'fecha',ps.fecha,
        'lineas',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'producto_id',l.producto_id,'cantidad_contada',l.cantidad_contada
          ) ORDER BY p.nombre,p.id)
          FROM public.turno_jornada_inventario_lineas l
          JOIN public.productos p ON p.id=l.producto_id
          WHERE l.corte_id=c.id
        ),'[]'::jsonb)
      )
      FROM public.turno_sesiones ps
      JOIN public.turno_jornada_inventario_cortes c ON c.turno_sesion_id=ps.id
      WHERE ps.turno_id=v_s.turno_id AND ps.numero_dia=v_s.numero_dia-1
        AND ps.fecha<v_s.fecha AND ps.bloque='JORNADA' AND ps.estado='COMPLETADA'
        AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
      LIMIT 1
    ),
    'entrega_compartida',public.bc7_estado_entrega_inventario_jornada(v_s.id),
    'tramo_activo',(
      SELECT jsonb_build_object('id',t.id,'usuario_id',t.usuario_id,'inicio_at',t.inicio_at)
      FROM public.turno_tramos t
      WHERE t.turno_sesion_id=v_s.id AND t.estado='ACTIVO'
      ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST LIMIT 1
    ),
    'declaracion_dinero',(
      SELECT jsonb_build_object(
        'id',d.id,
        'turno_tramo_id',d.turno_tramo_id,
        'monto',d.monto,
        'moneda',d.moneda,
        'estado_aprobacion',d.estado_aprobacion,
        'declarado_at',d.declarado_at,
        'monto_contado',d.monto_contado,
        'contado_por',d.contado_por,
        'contado_at',d.contado_at,
        'observacion_conteo',d.observacion_conteo,
        'diferencia',d.diferencia,
        'aprobado_por',d.aprobado_por,
        'aprobado_at',d.aprobado_at
      )
      FROM public.turno_declaraciones d
      WHERE d.turno_sesion_id=v_s.id
        AND d.turno_tramo_id=coalesce(
          (SELECT t.id FROM public.turno_tramos t
           WHERE t.turno_sesion_id=v_s.id AND t.estado='ACTIVO'
           ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST LIMIT 1),
          (SELECT t.id FROM public.turno_tramos t
           WHERE t.turno_sesion_id=v_s.id
           ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST LIMIT 1)
        )
      ORDER BY d.declarado_at DESC NULLS LAST,d.created_at DESC NULLS LAST LIMIT 1
    )
  ) INTO v_result;
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bc7_guardar_inventario_jornada(p_turno_sesion_id uuid, p_tipo text, p_lineas jsonb, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_period_end date;
  v_timezone text := 'America/Havana';
  v_uid uuid:=auth.uid();
  v_existing public.turno_jornada_inventario_cortes;
  v_corte_id uuid; v_origen_corte_id uuid; v_grouped boolean:=false;
  v_expected integer; v_count integer; v_distinct integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  IF upper(coalesce(p_tipo,'')) NOT IN ('INICIAL','FINAL') THEN RAISE EXCEPTION 'Tipo de inventario inválido.' USING ERRCODE='22023'; END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array' THEN RAISE EXCEPTION 'El conteo debe ser una lista de productos y cantidades.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde al modelo de jornada única.' USING ERRCODE='23503';
  END IF;
  SELECT coalesce(p.fecha_fin,p.fecha),
         coalesce(nullif(p.zona_horaria,''),'America/Havana')
  INTO v_period_end,v_timezone
  FROM public.turno_jornada_programacion p
  WHERE p.id=v_s.jornada_programacion_id;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS (SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=v_uid AND a.retirado_at IS NULL)
  ) THEN RAISE EXCEPTION 'Solo el responsable asignado con turnos.ver puede registrar este inventario.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_existing FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo=upper(p_tipo) FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('id',v_existing.id,'tipo',v_existing.tipo,'estado',v_existing.estado,
      'origen_corte_id',v_existing.origen_corte_id,'idempotente',true,
      'mensaje','El conteo ya estaba confirmado; no se sobrescribió.');
  END IF;
  IF upper(p_tipo)='INICIAL' AND v_s.estado NOT IN ('PENDIENTE','PROGRAMADA') THEN
    RAISE EXCEPTION 'El inventario inicial debe confirmarse antes de abrir la jornada.' USING ERRCODE='23514';
  END IF;
  IF upper(p_tipo)='FINAL' AND v_s.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'El inventario final solo puede confirmarse durante la jornada.' USING ERRCODE='23514';
  END IF;
  IF NULLIF(btrim(coalesce(p_observacion,'')),'') IS NOT NULL AND length(p_observacion)>1000 THEN
    RAISE EXCEPTION 'La observación no puede superar 1000 caracteres.' USING ERRCODE='22023';
  END IF;
  IF upper(p_tipo)='INICIAL' THEN
    SELECT c.id INTO v_origen_corte_id FROM public.turno_sesiones ps
    JOIN public.turno_jornada_inventario_cortes c ON c.turno_sesion_id=ps.id
    WHERE ps.turno_id=v_s.turno_id AND ps.numero_dia=v_s.numero_dia-1
      AND ps.fecha<v_s.fecha AND ps.bloque='JORNADA' AND ps.estado='COMPLETADA'
      AND c.tipo='FINAL' AND c.estado='CONFIRMADO' LIMIT 1;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista') INTO v_grouped;
  IF v_grouped THEN
    IF upper(p_tipo)='INICIAL' THEN
      SELECT count(*) INTO v_expected
      FROM public.productos p
      WHERE p.activo=true AND p.producto_padre_id IS NULL
        AND p.created_at < ((v_period_end + 1)::timestamp AT TIME ZONE v_timezone);
    ELSE
      SELECT count(*) INTO v_expected FROM (
        SELECT l.producto_id FROM public.turno_jornada_inventario_cortes c
        JOIN public.turno_jornada_inventario_lineas l ON l.corte_id=c.id
        WHERE c.turno_sesion_id=v_s.id AND c.tipo='INICIAL'
        UNION
        SELECT DISTINCT coalesce(p.producto_padre_id,p.id)
        FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
        WHERE s.almacen_id=v_s.almacen_id AND p.activo=true
          AND p.created_at < ((v_period_end + 1)::timestamp AT TIME ZONE v_timezone)
        UNION
        SELECT DISTINCT coalesce(rp.producto_padre_id,rp.id)
        FROM public.reinversiones r
        JOIN public.reinversiones_lineas rl ON rl.reinversion_id=r.id
        JOIN public.productos rp ON rp.id=rl.producto_id
        WHERE r.turno_sesion_id=v_s.id AND r.estado='APROBADA'
        UNION
        SELECT DISTINCT coalesce(tp.producto_padre_id,tp.id)
        FROM public.transferencias t
        JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
        JOIN public.productos tp ON tp.id=tl.producto_id
        WHERE t.almacen_destino_id=v_s.almacen_id
          AND lower(t.estado)='completada'
              AND t.fecha<=now()
          AND t.fecha >= ((v_period_end + 1)::timestamp AT TIME ZONE v_timezone)
          AND NOT EXISTS (
            SELECT 1 FROM public.turno_jornada_entradas_vinculadas linked
            WHERE linked.transferencia_id=t.id
              AND linked.turno_sesion_id<>v_s.id
          )
      ) expected;
    END IF;
  ELSE
    SELECT count(*) INTO v_expected FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
    WHERE s.almacen_id=v_s.almacen_id AND p.activo=true;
  END IF;
  SELECT count(*),count(DISTINCT (x.value->>'producto_id')::uuid)
    INTO v_count,v_distinct FROM jsonb_array_elements(p_lineas) x(value);
  IF v_count=0 OR v_count<>v_expected OR v_distinct<>v_count THEN
    RAISE EXCEPTION 'El conteo debe incluir una sola línea por producto/familia activa (% esperadas; % recibidas).',v_expected,v_count
      USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
    LEFT JOIN public.productos p ON p.id=(x.value->>'producto_id')::uuid AND p.activo=true
    WHERE jsonb_typeof(x.value)<>'object' OR p.id IS NULL
      OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
      OR (v_grouped AND p.producto_padre_id IS NOT NULL)
      OR (NOT v_grouped AND NOT EXISTS(SELECT 1 FROM public.stock s WHERE s.almacen_id=v_s.almacen_id AND s.producto_id=p.id))
  ) THEN RAISE EXCEPTION 'Producto/familia o cantidad inválida en el conteo.' USING ERRCODE='22023'; END IF;
  IF v_grouped AND upper(p_tipo)='FINAL' AND EXISTS (
    SELECT e.producto_id FROM (
      SELECT l.producto_id FROM public.turno_jornada_inventario_cortes c
      JOIN public.turno_jornada_inventario_lineas l ON l.corte_id=c.id
      WHERE c.turno_sesion_id=v_s.id AND c.tipo='INICIAL'
      UNION
      SELECT DISTINCT coalesce(p.producto_padre_id,p.id)
      FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
      WHERE s.almacen_id=v_s.almacen_id AND p.activo=true
        AND p.created_at < ((v_period_end + 1)::timestamp AT TIME ZONE v_timezone)
      UNION
      SELECT DISTINCT coalesce(rp.producto_padre_id,rp.id)
      FROM public.reinversiones r
      JOIN public.reinversiones_lineas rl ON rl.reinversion_id=r.id
      JOIN public.productos rp ON rp.id=rl.producto_id
      WHERE r.turno_sesion_id=v_s.id AND r.estado='APROBADA'
      UNION
      SELECT DISTINCT coalesce(tp.producto_padre_id,tp.id)
      FROM public.transferencias t
      JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
      JOIN public.productos tp ON tp.id=tl.producto_id
      WHERE t.almacen_destino_id=v_s.almacen_id
        AND lower(t.estado)='completada'
              AND t.fecha<=now()
        AND t.fecha >= ((v_period_end + 1)::timestamp AT TIME ZONE v_timezone)
        AND NOT EXISTS (
          SELECT 1 FROM public.turno_jornada_entradas_vinculadas linked
          WHERE linked.transferencia_id=t.id
            AND linked.turno_sesion_id<>v_s.id
        )
    ) e
    WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
      WHERE (x.value->>'producto_id')::uuid=e.producto_id)
  ) THEN RAISE EXCEPTION 'El inventario final debe incluir los productos de apertura y los que tengan stock durante la jornada.' USING ERRCODE='22023'; END IF;
  INSERT INTO public.turno_jornada_inventario_cortes
    (turno_sesion_id,tipo,estado,creado_por,confirmado_por,observacion,origen_corte_id)
  VALUES(v_s.id,upper(p_tipo),'CONFIRMADO',v_uid,v_uid,NULLIF(btrim(p_observacion),''),v_origen_corte_id)
  RETURNING id INTO v_corte_id;
  INSERT INTO public.turno_jornada_inventario_lineas(corte_id,producto_id,cantidad_contada,stock_sistema)
  SELECT v_corte_id,p.id,(x.value->>'cantidad')::numeric,
    CASE WHEN v_grouped THEN coalesce((
      SELECT sum(s.cantidad) FROM public.stock s JOIN public.productos sp ON sp.id=s.producto_id
      WHERE s.almacen_id=v_s.almacen_id AND (sp.id=p.id OR sp.producto_padre_id=p.id)
    ),0) ELSE s.cantidad END
  FROM jsonb_array_elements(p_lineas) x(value)
  JOIN public.productos p ON p.id=(x.value->>'producto_id')::uuid
  LEFT JOIN public.stock s ON s.almacen_id=v_s.almacen_id AND s.producto_id=p.id;
  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(v_s.almacen_id,v_s.jornada_programacion_id,v_uid,
    CASE WHEN upper(p_tipo)='INICIAL' THEN 'INVENTARIO_INICIAL_CONFIRMADO' ELSE 'INVENTARIO_FINAL_CONFIRMADO' END,
    NULLIF(btrim(p_observacion),''),jsonb_build_object('sesion_id',v_s.id,'estado',v_s.estado),
    jsonb_build_object('corte_id',v_corte_id,'tipo',upper(p_tipo),'cantidad_lineas',v_count,
      'origen_corte_id',v_origen_corte_id,'inventario_agrupado_por_familia',v_grouped));
  RETURN jsonb_build_object('id',v_corte_id,'tipo',upper(p_tipo),'estado','CONFIRMADO',
    'cantidad_lineas',v_count,'origen_corte_id',v_origen_corte_id,'inventario_agrupado_por_familia',v_grouped);
END;
$function$
;

COMMIT;
