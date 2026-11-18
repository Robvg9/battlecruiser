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
