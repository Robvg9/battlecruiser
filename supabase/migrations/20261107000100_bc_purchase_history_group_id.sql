-- Use the purchase header ID so all product lots from one saved purchase list share one history card.
-- Legacy lots without a purchase header retain their own ID.

CREATE OR REPLACE FUNCTION public.movimientos_producto(p_producto_id uuid DEFAULT NULL::uuid, p_almacen_id uuid DEFAULT NULL::uuid, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_tipo text DEFAULT NULL::text, p_limite integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(fecha timestamp with time zone, tipo text, producto text, almacen text, cantidad numeric, costo_unitario numeric, usuario text, operacion_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.tiene_permiso('reportes','ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver movimientos.' USING ERRCODE='42501';
  END IF;
  IF p_desde IS NOT NULL AND p_hasta IS NOT NULL AND p_desde > p_hasta THEN
    RAISE EXCEPTION 'La fecha inicial no puede ser posterior a la fecha final.' USING ERRCODE='22007';
  END IF;
  IF p_limite IS NULL OR p_limite > 500 OR p_limite < 1 THEN p_limite:=100; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset:=0; END IF;

  RETURN QUERY
  SELECT lc.fecha_compra, 'compra'::text, p.nombre, a.nombre,
         lc.cantidad_inicial, lc.costo_unitario, u.nombre, COALESCE(lc.compra_id, lc.id)
  FROM public.lotes_compra lc
  JOIN public.productos p ON p.id=lc.producto_id
  JOIN public.almacenes a ON a.id=lc.almacen_id
  LEFT JOIN public.usuarios u ON u.id=lc.usuario_id
  WHERE lc.origen='compra'
    AND (p_desde IS NULL OR (lc.fecha_compra AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (lc.fecha_compra AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR lc.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR lc.almacen_id=p_almacen_id)
    AND (p_tipo IS NULL OR p_tipo='' OR p_tipo='compra')

  UNION ALL
  SELECT r.fecha, 'reinversion'::text, p.nombre, a.nombre,
         rl.cantidad_base, rl.costo_unitario, COALESCE(r.usuario_nombre,u.nombre), r.id
  FROM public.reinversiones r
  JOIN public.reinversiones_lineas rl ON rl.reinversion_id=r.id
  JOIN public.productos p ON p.id=rl.producto_id
  JOIN public.almacenes a ON a.id=r.almacen_id
  LEFT JOIN public.usuarios u ON u.id=r.usuario_id
  WHERE (p_desde IS NULL OR (r.fecha AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (r.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR rl.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR r.almacen_id=p_almacen_id)
    AND (p_tipo IS NULL OR p_tipo='' OR p_tipo='reinversion')

  UNION ALL
  SELECT v.fecha, 'venta'::text, p.nombre, a.nombre,
         -vl.cantidad, vl.costo_unitario_fifo, u.nombre, v.id
  FROM public.ventas_lineas vl
  JOIN public.ventas v ON v.id=vl.venta_id
  JOIN public.productos p ON p.id=vl.producto_id
  JOIN public.almacenes a ON a.id=v.almacen_id
  LEFT JOIN public.usuarios u ON u.id=v.creado_por
  WHERE (p_desde IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR vl.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR v.almacen_id=p_almacen_id)
    AND (p_tipo IS NULL OR p_tipo='' OR p_tipo='venta')

  UNION ALL
  SELECT t.fecha, 'transferencia_salida'::text, p.nombre, o.nombre,
         -tl.cantidad, NULL::numeric, u.nombre, t.id
  FROM public.transferencias_lineas tl
  JOIN public.transferencias t ON t.id=tl.transferencia_id
  JOIN public.productos p ON p.id=tl.producto_id
  JOIN public.almacenes o ON o.id=t.almacen_origen_id
  LEFT JOIN public.usuarios u ON u.id=t.creado_por
  WHERE (p_desde IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR tl.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR t.almacen_origen_id=p_almacen_id)
    AND (p_tipo IS NULL OR p_tipo='' OR p_tipo='transferencia_salida' OR p_tipo='movimiento_interno')

  UNION ALL
  SELECT t.fecha, 'transferencia_entrada'::text, p.nombre, d.nombre,
         tl.cantidad, NULL::numeric, u.nombre, t.id
  FROM public.transferencias_lineas tl
  JOIN public.transferencias t ON t.id=tl.transferencia_id
  JOIN public.productos p ON p.id=tl.producto_id
  JOIN public.almacenes d ON d.id=t.almacen_destino_id
  LEFT JOIN public.usuarios u ON u.id=t.creado_por
  WHERE (p_desde IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR tl.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR t.almacen_destino_id=p_almacen_id)
    AND (p_tipo IS NULL OR p_tipo='' OR p_tipo='transferencia_entrada' OR p_tipo='movimiento_interno')

  UNION ALL
  SELECT vs.fecha, 'vale'::text, p.nombre, a.nombre,
         -vs.cantidad, NULL::numeric, u.nombre, vs.id
  FROM public.vales_salida vs
  JOIN public.productos p ON p.id=vs.producto_id
  JOIN public.almacenes a ON a.id=vs.almacen_id
  LEFT JOIN public.usuarios u ON u.id=vs.creado_por
  WHERE (p_desde IS NULL OR (vs.fecha AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (vs.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR vs.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR vs.almacen_id=p_almacen_id)
    AND (p_tipo IS NULL OR p_tipo='' OR p_tipo='vale')

  UNION ALL
  SELECT COALESCE(m.fecha_revision,m.actualizado_en,m.creado_en),
         'merma'::text, p.nombre, a.nombre, -m.cantidad, NULL::numeric,
         COALESCE(m.revisado_nombre,m.creado_nombre), m.id
  FROM public.mermas m
  JOIN public.productos p ON p.id=m.producto_id
  JOIN public.almacenes a ON a.id=m.almacen_id
  WHERE m.estado='APROBADA'
    AND (p_desde IS NULL OR (COALESCE(m.fecha_revision,m.actualizado_en,m.creado_en) AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (COALESCE(m.fecha_revision,m.actualizado_en,m.creado_en) AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR m.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR m.almacen_id=p_almacen_id)
    AND (p_tipo IS NULL OR p_tipo='' OR p_tipo='merma' OR p_tipo='baja')

  UNION ALL
  SELECT COALESCE(b.fecha_revision,b.actualizado_en,b.creado_en),
         'baja'::text, p.nombre, a.nombre, -b.cantidad, NULL::numeric,
         COALESCE(b.revisado_nombre,b.creado_nombre), b.id
  FROM public.bajas b
  JOIN public.productos p ON p.id=b.producto_id
  JOIN public.almacenes a ON a.id=b.almacen_id
  WHERE b.estado='APROBADA'
    AND (p_desde IS NULL OR (COALESCE(b.fecha_revision,b.actualizado_en,b.creado_en) AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (COALESCE(b.fecha_revision,b.actualizado_en,b.creado_en) AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR b.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR b.almacen_id=p_almacen_id)
    AND (p_tipo IS NULL OR p_tipo='' OR p_tipo='baja')

  ORDER BY 1 DESC
  LIMIT p_limite OFFSET p_offset;
END;
$function$

