-- Final Jornada inventory keeps all active root products created during the scheduled period visible.
-- This closes the gap between an inherited immutable opening cut and products added later in the same period.
CREATE OR REPLACE FUNCTION public.bc7_jornada_productos_corte(p_turno_sesion_id uuid,p_tipo text)
RETURNS TABLE(producto_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_s public.turno_sesiones; v_p public.turno_jornada_programacion; v_cutoff timestamptz; v_timezone text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  IF upper(coalesce(p_tipo,'')) NOT IN ('INICIAL','FINAL') THEN RAISE EXCEPTION 'Tipo de inventario inválido.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN RAISE EXCEPTION 'La sesión no corresponde al modelo de jornada única.' USING ERRCODE='23503'; END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programación no encontrada.' USING ERRCODE='23503'; END IF;
  v_timezone:=coalesce(nullif(v_p.zona_horaria,''),'America/Havana');
  v_cutoff:=((coalesce(v_p.fecha_fin,v_p.fecha)+1)::timestamp AT TIME ZONE v_timezone);
  IF upper(p_tipo)='INICIAL' THEN
    RETURN QUERY SELECT p.id FROM public.productos p WHERE p.activo=true AND p.archivado_at IS NULL AND p.producto_padre_id IS NULL AND p.created_at<v_cutoff ORDER BY p.nombre,p.id;
    RETURN;
  END IF;
  RETURN QUERY
  WITH expected AS (
    -- Keep every root product that belonged to the scheduled period visible in
    -- the final count, even when it was created after the inherited opening
    -- handover and therefore has no row in the immutable INICIAL cut.
    SELECT period_products.producto_id
    FROM public.bc7_jornada_productos_corte(v_s.id,'INICIAL') period_products
    UNION
    SELECT DISTINCT l.producto_id FROM public.turno_jornada_inventario_cortes c
    JOIN public.turno_jornada_inventario_lineas l ON l.corte_id=c.id
    JOIN public.productos root ON root.id=l.producto_id
    WHERE c.turno_sesion_id=v_s.id AND c.tipo='INICIAL' AND root.producto_padre_id IS NULL
    UNION
    SELECT DISTINCT coalesce(p.producto_padre_id,p.id) FROM public.stock s
    JOIN public.productos p ON p.id=s.producto_id
    JOIN public.productos root ON root.id=coalesce(p.producto_padre_id,p.id)
    WHERE s.almacen_id=v_s.almacen_id AND p.activo=true AND root.activo=true AND root.archivado_at IS NULL AND root.producto_padre_id IS NULL AND root.created_at<v_cutoff
    UNION
    SELECT DISTINCT coalesce(p.producto_padre_id,p.id) FROM public.reinversiones r
    JOIN public.reinversiones_lineas rl ON rl.reinversion_id=r.id
    JOIN public.productos p ON p.id=rl.producto_id
    JOIN public.productos root ON root.id=coalesce(p.producto_padre_id,p.id)
    WHERE r.turno_sesion_id=v_s.id AND r.estado='APROBADA' AND root.producto_padre_id IS NULL
    UNION
    SELECT DISTINCT coalesce(p.producto_padre_id,p.id) FROM public.transferencias t
    JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
    JOIN public.productos p ON p.id=tl.producto_id
    JOIN public.productos root ON root.id=coalesce(p.producto_padre_id,p.id)
    WHERE t.almacen_destino_id=v_s.almacen_id AND lower(t.estado)='completada' AND t.fecha>=v_cutoff AND t.fecha<=now()
      AND NOT EXISTS (SELECT 1 FROM public.turno_jornada_entradas_vinculadas linked WHERE linked.transferencia_id=t.id AND linked.turno_sesion_id<>v_s.id)
      AND root.producto_padre_id IS NULL
  ) SELECT e.producto_id FROM expected e ORDER BY e.producto_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_jornada_productos_corte(uuid,text) FROM PUBLIC,anon,authenticated;

-- Keep final-inventory validation and persistence aligned with the canonical read projection.
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
    SELECT count(*) INTO v_expected
    FROM public.bc7_jornada_productos_corte(v_s.id,upper(p_tipo));
  ELSE
    SELECT count(*) INTO v_expected
    FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
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
      OR (v_grouped AND (
        p.producto_padre_id IS NOT NULL
        OR NOT EXISTS (
          SELECT 1 FROM public.bc7_jornada_productos_corte(v_s.id,upper(p_tipo)) expected
          WHERE expected.producto_id=p.id
        )
      ))
      OR (NOT v_grouped AND NOT EXISTS(SELECT 1 FROM public.stock s WHERE s.almacen_id=v_s.almacen_id AND s.producto_id=p.id))
  ) THEN RAISE EXCEPTION 'Producto/familia o cantidad inválida en el conteo.' USING ERRCODE='22023'; END IF;
  IF v_grouped AND EXISTS (
    SELECT expected.producto_id
    FROM public.bc7_jornada_productos_corte(v_s.id,upper(p_tipo)) expected
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
      WHERE (x.value->>'producto_id')::uuid=expected.producto_id
    )
  ) THEN
    RAISE EXCEPTION 'El inventario debe incluir exactamente los productos/familias válidos para este corte.' USING ERRCODE='22023';
  END IF;
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
$function$;
REVOKE ALL ON FUNCTION public.bc7_guardar_inventario_jornada(uuid,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_guardar_inventario_jornada(uuid,text,jsonb,text) TO authenticated;
