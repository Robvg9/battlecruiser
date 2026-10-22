-- Ranking agregado de productos en el período comercial de Cuba.
-- La ganancia se calcula sólo en líneas con costo FIFO histórico disponible;
-- las líneas sin costo nunca se convierten artificialmente en ganancia cero.
DROP FUNCTION IF EXISTS public.reporte_productos_ventas(date, date, uuid, text, integer);

CREATE FUNCTION public.reporte_productos_ventas(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL,
  p_orden text DEFAULT 'unidades_desc',
  p_limite int DEFAULT 100
)
RETURNS TABLE (
  producto text,
  unidades numeric,
  ingresos numeric,
  ventas bigint,
  ganancia_conocida numeric,
  lineas_con_costo bigint,
  lineas_sin_costo bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE = '42501';
  END IF;

  IF p_orden IS NULL OR p_orden NOT IN (
    'unidades_desc', 'unidades_asc', 'ingresos_desc', 'ingresos_asc',
    'ganancia_desc', 'ganancia_asc'
  ) THEN
    p_orden := 'unidades_desc';
  END IF;
  IF p_limite IS NULL OR p_limite < 1 THEN p_limite := 100; END IF;
  IF p_limite > 500 THEN p_limite := 500; END IF;

  RETURN QUERY
    SELECT
      p.nombre AS producto,
      COALESCE(sum(vl.cantidad), 0)::numeric AS unidades,
      COALESCE(sum(vl.cantidad * vl.precio_unitario), 0)::numeric AS ingresos,
      count(DISTINCT v.id)::bigint AS ventas,
      sum(vl.cantidad * (vl.precio_unitario - vl.costo_unitario_fifo))
        FILTER (WHERE vl.costo_unitario_fifo IS NOT NULL)::numeric AS ganancia_conocida,
      count(*) FILTER (WHERE vl.costo_unitario_fifo IS NOT NULL)::bigint AS lineas_con_costo,
      count(*) FILTER (WHERE vl.costo_unitario_fifo IS NULL)::bigint AS lineas_sin_costo
    FROM public.ventas_lineas vl
    JOIN public.ventas v ON v.id = vl.venta_id
    JOIN public.productos p ON p.id = vl.producto_id
    WHERE (p_desde IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date >= p_desde)
      AND (p_hasta IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date <= p_hasta)
      AND (p_almacen_id IS NULL OR v.almacen_id = p_almacen_id)
    GROUP BY p.id, p.nombre
    ORDER BY
      CASE WHEN p_orden = 'unidades_desc' THEN sum(vl.cantidad) END DESC NULLS LAST,
      CASE WHEN p_orden = 'unidades_asc' THEN sum(vl.cantidad) END ASC NULLS LAST,
      CASE WHEN p_orden = 'ingresos_desc' THEN sum(vl.cantidad * vl.precio_unitario) END DESC NULLS LAST,
      CASE WHEN p_orden = 'ingresos_asc' THEN sum(vl.cantidad * vl.precio_unitario) END ASC NULLS LAST,
      CASE WHEN p_orden = 'ganancia_desc' THEN sum(vl.cantidad * (vl.precio_unitario - vl.costo_unitario_fifo))
        FILTER (WHERE vl.costo_unitario_fifo IS NOT NULL) END DESC NULLS LAST,
      CASE WHEN p_orden = 'ganancia_asc' THEN sum(vl.cantidad * (vl.precio_unitario - vl.costo_unitario_fifo))
        FILTER (WHERE vl.costo_unitario_fifo IS NOT NULL) END ASC NULLS LAST,
      p.nombre ASC
    LIMIT p_limite;
END;
$$;

REVOKE ALL ON FUNCTION public.reporte_productos_ventas(date, date, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reporte_productos_ventas(date, date, uuid, text, integer) TO authenticated;
