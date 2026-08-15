-- ============================================================
-- B5 — Reportes y Análisis Operativo
-- ============================================================
-- Migración SQL para Supabase. Reutiliza tablas existentes
-- (ventas, ventas_lineas, transferencias, transferencias_lineas,
-- vales_salida, stock, productos, almacenes, categorias, usuarios)
-- y la función public.tiene_permiso(p_seccion, p_accion).
-- NO crea tablas nuevas ni un segundo sistema de permisos.
--
-- AUDITORÍA REAL CONFIRMADA (introspección directa a Supabase):
--   - ventas, ventas_lineas, transferencias, transferencias_lineas,
--     vales_salida, stock, productos, almacenes, categorias, usuarios:
--     existen (RLS activo; lectura requiere permisos vía tiene_permiso).
--   - NO existe tabla `compras`, `lotes`, ni `movimientos_stock`.
--     Las compras se reflejan en stock pero no hay historial persistente
--     de compras ni trazabilidad FIFO por lote. Por eso el reporte de
--     movimiento de inventario reconstruye a partir de ventas/transferencias/
--     vales; las compras NO pueden incluirse por falta de tabla histórica.
--   - NO existe costo histórico por lote → el margen/rentabilidad NO puede
--     calcularse correctamente. No se inventa. Se documenta.
--
-- Esta migración agrega los RPC de reportes (todos SECURITY DEFINER,
-- search_path fijo, protegidos con tiene_permiso('reportes','ver')).
-- Cada RPC devuelve únicamente los datos necesarios (agregaciones SQL
-- para no traer miles de filas; paginación en los detallados).
--
-- APLICACIÓN: ejecutar en el SQL Editor de Supabase. Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1) reporte_resumen_ejecutivo(p_desde, p_hasta, p_almacen_id)
--    Resumen agregado: ventas, transferencias, vales e inventario.
--    Usa agregaciones SQL (no trae filas individuales).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reporte_resumen_ejecutivo(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ventas int;
  v_ingresos numeric;
  v_unidades_vendidas numeric;
  v_transferencias int;
  v_unidades_transferidas numeric;
  v_vales int;
  v_unidades_vales numeric;
  v_productos int;
  v_unidades_stock numeric;
  v_stock_bajo int;
  v_stock_agotado int;
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE = '42501';
  END IF;

  -- Ventas (total y unidades de ventas_lineas).
  SELECT count(*), COALESCE(sum(v.total), 0) INTO v_ventas, v_ingresos
    FROM ventas v
    WHERE (p_desde IS NULL OR v.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR v.fecha::date <= p_hasta)
      AND (p_almacen_id IS NULL OR v.almacen_id = p_almacen_id);

  SELECT COALESCE(sum(vl.cantidad), 0) INTO v_unidades_vendidas
    FROM ventas_lineas vl
    JOIN ventas v ON v.id = vl.venta_id
    WHERE (p_desde IS NULL OR v.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR v.fecha::date <= p_hasta)
      AND (p_almacen_id IS NULL OR v.almacen_id = p_almacen_id);

  -- Transferencias.
  SELECT count(*), COALESCE(sum((SELECT sum(tl.cantidad) FROM transferencias_lineas tl WHERE tl.transferencia_id = t.id)), 0)
    INTO v_transferencias, v_unidades_transferidas
    FROM transferencias t
    WHERE (p_desde IS NULL OR t.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR t.fecha::date <= p_hasta)
      AND (p_almacen_id IS NULL OR t.almacen_origen_id = p_almacen_id OR t.almacen_destino_id = p_almacen_id);

  -- Vales de salida.
  SELECT count(*), COALESCE(sum(vs.cantidad), 0) INTO v_vales, v_unidades_vales
    FROM vales_salida vs
    WHERE (p_desde IS NULL OR vs.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR vs.fecha::date <= p_hasta)
      AND (p_almacen_id IS NULL OR vs.almacen_id = p_almacen_id);

  -- Inventario (sin filtro de fecha: estado actual).
  SELECT count(*), COALESCE(sum(s.cantidad), 0) INTO v_productos, v_unidades_stock
    FROM stock s
    WHERE (p_almacen_id IS NULL OR s.almacen_id = p_almacen_id);

  SELECT count(*) INTO v_stock_bajo
    FROM stock s
    WHERE s.minimo IS NOT NULL AND s.cantidad <= s.minimo AND s.cantidad > 0
      AND (p_almacen_id IS NULL OR s.almacen_id = p_almacen_id);

  SELECT count(*) INTO v_stock_agotado
    FROM stock s
    WHERE s.cantidad <= 0
      AND (p_almacen_id IS NULL OR s.almacen_id = p_almacen_id);

  RETURN jsonb_build_object(
    'ventas', jsonb_build_object('cantidad', v_ventas, 'ingresos', v_ingresos, 'unidades', v_unidades_vendidas,
      'ticket_promedio', CASE WHEN v_ventas > 0 THEN v_ingresos / v_ventas ELSE 0 END),
    'transferencias', jsonb_build_object('cantidad', v_transferencias, 'unidades', v_unidades_transferidas),
    'vales', jsonb_build_object('cantidad', v_vales, 'unidades', v_unidades_vales),
    'inventario', jsonb_build_object('productos', v_productos, 'unidades', v_unidades_stock,
      'stock_bajo', v_stock_bajo, 'stock_agotado', v_stock_agotado),
    'compras', jsonb_build_object('disponible', false, 'nota', 'No existe tabla histórica de compras en el esquema actual.'),
    'margen', jsonb_build_object('disponible', false, 'nota', 'No existe costo histórico por lote (FIFO); no se puede calcular margen correctamente.')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reporte_resumen_ejecutivo(date, date, uuid) TO anon, authenticated;

-- ------------------------------------------------------------
-- 2) reporte_ventas(p_desde, p_hasta, p_almacen_id, p_producto_id,
--                   p_limite, p_offset)
--    Lista detallada de ventas con líneas. Respeta el precio histórico
--    real de la venta (no recalcula con precio actual del producto).
--    Paginado.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reporte_ventas(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL,
  p_producto_id uuid DEFAULT NULL,
  p_limite int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  fecha timestamptz,
  almacen_id uuid,
  almacen text,
  total numeric,
  lineas jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite > 200 THEN p_limite := 50; END IF;
  IF p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
    SELECT v.id, v.fecha, v.almacen_id, a.nombre AS almacen, v.total,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'producto_id', vl.producto_id,
          'producto', p.nombre,
          'cantidad', vl.cantidad,
          'precio_unitario', vl.precio_unitario,
          'subtotal', vl.cantidad * vl.precio_unitario
        ))
        FROM ventas_lineas vl
        JOIN productos p ON p.id = vl.producto_id
        WHERE vl.venta_id = v.id
          AND (p_producto_id IS NULL OR vl.producto_id = p_producto_id)
      ), '[]'::jsonb) AS lineas
    FROM ventas v
    LEFT JOIN almacenes a ON a.id = v.almacen_id
    WHERE (p_desde IS NULL OR v.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR v.fecha::date <= p_hasta)
      AND (p_almacen_id IS NULL OR v.almacen_id = p_almacen_id)
    ORDER BY v.fecha DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reporte_ventas(date, date, uuid, uuid, int, int) TO anon, authenticated;

-- ------------------------------------------------------------
-- 3) reporte_transferencias(p_desde, p_hasta, p_origen_id, p_destino_id,
--                           p_estado, p_limite, p_offset)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reporte_transferencias(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_origen_id uuid DEFAULT NULL,
  p_destino_id uuid DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_limite int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  fecha timestamptz,
  origen text,
  destino text,
  estado text,
  unidades numeric,
  lineas jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite > 200 THEN p_limite := 50; END IF;
  IF p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
    SELECT t.id, t.fecha, o.nombre AS origen, d.nombre AS destino, t.estado,
      COALESCE((SELECT sum(tl.cantidad) FROM transferencias_lineas tl WHERE tl.transferencia_id = t.id), 0) AS unidades,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'producto_id', tl.producto_id,
          'producto', p.nombre,
          'cantidad', tl.cantidad
        ))
        FROM transferencias_lineas tl
        JOIN productos p ON p.id = tl.producto_id
        WHERE tl.transferencia_id = t.id
      ), '[]'::jsonb) AS lineas
    FROM transferencias t
    LEFT JOIN almacenes o ON o.id = t.almacen_origen_id
    LEFT JOIN almacenes d ON d.id = t.almacen_destino_id
    WHERE (p_desde IS NULL OR t.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR t.fecha::date <= p_hasta)
      AND (p_origen_id IS NULL OR t.almacen_origen_id = p_origen_id)
      AND (p_destino_id IS NULL OR t.almacen_destino_id = p_destino_id)
      AND (p_estado IS NULL OR p_estado = '' OR t.estado = p_estado)
    ORDER BY t.fecha DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reporte_transferencias(date, date, uuid, uuid, text, int, int) TO anon, authenticated;

-- ------------------------------------------------------------
-- 4) reporte_vales(p_desde, p_hasta, p_almacen_id, p_tipo,
--                  p_limite, p_offset)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reporte_vales(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL,
  p_tipo text DEFAULT NULL,
  p_limite int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  fecha timestamptz,
  producto text,
  almacen text,
  tipo text,
  cantidad numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite > 200 THEN p_limite := 50; END IF;
  IF p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
    SELECT vs.id, vs.fecha, p.nombre AS producto, a.nombre AS almacen, vs.tipo, vs.cantidad
    FROM vales_salida vs
    LEFT JOIN productos p ON p.id = vs.producto_id
    LEFT JOIN almacenes a ON a.id = vs.almacen_id
    WHERE (p_desde IS NULL OR vs.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR vs.fecha::date <= p_hasta)
      AND (p_almacen_id IS NULL OR vs.almacen_id = p_almacen_id)
      AND (p_tipo IS NULL OR p_tipo = '' OR vs.tipo = p_tipo)
    ORDER BY vs.fecha DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reporte_vales(date, date, uuid, text, int, int) TO anon, authenticated;

-- ------------------------------------------------------------
-- 5) reporte_stock(p_almacen_id, p_categoria_id)
--    Stock actual con estado (normal/bajo/agotado).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reporte_stock(
  p_almacen_id uuid DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL
)
RETURNS TABLE (
  producto_id uuid,
  producto text,
  almacen text,
  categoria text,
  cantidad numeric,
  minimo numeric,
  estado text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT s.producto_id, p.nombre AS producto, a.nombre AS almacen,
      c.nombre AS categoria, s.cantidad, s.minimo,
      CASE
        WHEN s.cantidad <= 0 THEN 'agotado'
        WHEN s.minimo IS NOT NULL AND s.cantidad <= s.minimo THEN 'bajo'
        ELSE 'normal'
      END AS estado
    FROM stock s
    JOIN productos p ON p.id = s.producto_id
    JOIN almacenes a ON a.id = s.almacen_id
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE (p_almacen_id IS NULL OR s.almacen_id = p_almacen_id)
      AND (p_categoria_id IS NULL OR p.categoria_id = p_categoria_id)
    ORDER BY p.nombre;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reporte_stock(uuid, uuid) TO anon, authenticated;

-- ------------------------------------------------------------
-- 6) reporte_movimiento_inventario(p_desde, p_hasta, p_producto_id,
--                                  p_almacen_id, p_limite, p_offset)
--    Reconstruye el movimiento de un producto/almacén combinando
--    ventas (salida), transferencias (entrada/salida) y vales (salida).
--    Las compras NO se incluyen: NO existe tabla histórica de compras
--    (verificado por auditoría). Se documenta en la nota.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reporte_movimiento_inventario(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_producto_id uuid DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL,
  p_limite int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  fecha timestamptz,
  tipo text,
  producto text,
  almacen text,
  cantidad numeric,
  direccion text,
  operacion_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite > 500 THEN p_limite := 100; END IF;
  IF p_limite < 1 THEN p_limite := 100; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
    -- Ventas (salida)
    SELECT v.fecha, 'venta'::text AS tipo, p.nombre AS producto, a.nombre AS almacen,
      vl.cantidad AS cantidad, 'salida'::text AS direccion, v.id AS operacion_id
    FROM ventas_lineas vl
    JOIN ventas v ON v.id = vl.venta_id
    JOIN productos p ON p.id = vl.producto_id
    JOIN almacenes a ON a.id = v.almacen_id
    WHERE (p_desde IS NULL OR v.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR v.fecha::date <= p_hasta)
      AND (p_producto_id IS NULL OR vl.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR v.almacen_id = p_almacen_id)

    UNION ALL

    -- Transferencias salida (origen)
    SELECT t.fecha, 'transferencia_salida'::text, p.nombre, o.nombre,
      tl.cantidad, 'salida'::text, t.id
    FROM transferencias_lineas tl
    JOIN transferencias t ON t.id = tl.transferencia_id
    JOIN productos p ON p.id = tl.producto_id
    JOIN almacenes o ON o.id = t.almacen_origen_id
    WHERE (p_desde IS NULL OR t.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR t.fecha::date <= p_hasta)
      AND (p_producto_id IS NULL OR tl.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR t.almacen_origen_id = p_almacen_id)

    UNION ALL

    -- Transferencias entrada (destino)
    SELECT t.fecha, 'transferencia_entrada'::text, p.nombre, d.nombre,
      tl.cantidad, 'entrada'::text, t.id
    FROM transferencias_lineas tl
    JOIN transferencias t ON t.id = tl.transferencia_id
    JOIN productos p ON p.id = tl.producto_id
    JOIN almacenes d ON d.id = t.almacen_destino_id
    WHERE (p_desde IS NULL OR t.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR t.fecha::date <= p_hasta)
      AND (p_producto_id IS NULL OR tl.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR t.almacen_destino_id = p_almacen_id)

    UNION ALL

    -- Vales de salida
    SELECT vs.fecha, 'vale'::text, p.nombre, a.nombre,
      vs.cantidad, 'salida'::text, vs.id
    FROM vales_salida vs
    JOIN productos p ON p.id = vs.producto_id
    JOIN almacenes a ON a.id = vs.almacen_id
    WHERE (p_desde IS NULL OR vs.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR vs.fecha::date <= p_hasta)
      AND (p_producto_id IS NULL OR vs.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR vs.almacen_id = p_almacen_id)

    ORDER BY fecha DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reporte_movimiento_inventario(date, date, uuid, uuid, int, int) TO anon, authenticated;

-- ============================================================
-- NOTAS DE SEGURIDAD Y LIMITACIONES:
--   - Todas las funciones: SECURITY DEFINER, search_path = public, pg_temp,
--     protegidas con tiene_permiso('reportes','ver'). El cliente no puede
--     bypassar el permiso llamándolas directamente.
--   - Agregaciones SQL para no traer miles de filas cuando solo se necesita
--     un resumen. Paginación (limit/offset) en los detallados.
--   - NO se crea un RPC genérico que devuelva toda la base: cada reporte
--     devuelve únicamente los datos necesarios.
--   - LIMITACIÓN REAL: no existe tabla `compras` histórica ni `lotes`.
--     El reporte de movimiento de inventario NO incluye compras (se
--     documenta). El margen/rentabilidad NO se calcula (falta costo FIFO
--     histórico). No se inventan datos.
--   - Reutiliza tablas y tiene_permiso existentes. No duplica sistemas.
-- ============================================================
