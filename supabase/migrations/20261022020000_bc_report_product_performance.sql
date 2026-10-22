-- Ranking agregado de productos por unidades o facturación histórica.
-- No calcula ganancias: la base de datos no dispone de costo FIFO fiable por producto/lote.
CREATE OR REPLACE FUNCTION public.reporte_productos_ventas(
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
  ventas bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE = '42501';
  END IF;

  IF p_orden IS NULL OR p_orden NOT IN ('unidades_desc', 'unidades_asc', 'ingresos_desc', 'ingresos_asc') THEN
    p_orden := 'unidades_desc';
  END IF;
  IF p_limite IS NULL OR p_limite < 1 THEN p_limite := 100; END IF;
  IF p_limite > 500 THEN p_limite := 500; END IF;

  RETURN QUERY
    SELECT p.nombre AS producto,
      COALESCE(sum(vl.cantidad), 0)::numeric AS unidades,
      COALESCE(sum(vl.cantidad * vl.precio_unitario), 0)::numeric AS ingresos,
      count(DISTINCT v.id)::bigint AS ventas
    FROM ventas_lineas vl
    JOIN ventas v ON v.id = vl.venta_id
    JOIN productos p ON p.id = vl.producto_id
    WHERE (p_desde IS NULL OR v.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR v.fecha::date <= p_hasta)
      AND (p_almacen_id IS NULL OR v.almacen_id = p_almacen_id)
    GROUP BY p.id, p.nombre
    ORDER BY
      CASE WHEN p_orden = 'unidades_desc' THEN sum(vl.cantidad) END DESC NULLS LAST,
      CASE WHEN p_orden = 'unidades_asc' THEN sum(vl.cantidad) END ASC NULLS LAST,
      CASE WHEN p_orden = 'ingresos_desc' THEN sum(vl.cantidad * vl.precio_unitario) END DESC NULLS LAST,
      CASE WHEN p_orden = 'ingresos_asc' THEN sum(vl.cantidad * vl.precio_unitario) END ASC NULLS LAST,
      p.nombre ASC
    LIMIT p_limite;
END;
$$;

REVOKE ALL ON FUNCTION public.reporte_productos_ventas(date, date, uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reporte_productos_ventas(date, date, uuid, text, int) TO authenticated;
