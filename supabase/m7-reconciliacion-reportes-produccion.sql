-- =====================================================================
-- M7 — RECONCILIACIÓN DE REPORTES: SUPABASE PRODUCCIÓN ↔ GITHUB
-- (Misión 3/3, Battlecruiser)
-- =====================================================================
-- Propósito: este archivo NO introduce funcionalidad nueva ni cambia
-- producción. Es la copia fiel (verificada con pg_get_functiondef
-- sobre el proyecto real papxnkkjtkxsitcsvcme, 2026-08-17) de los 4
-- RPC de reportes que quedaron fuera de la Misión 2/3:
--   - inventario_enriquecido
--   - movimientos_producto
--   - rentabilidad_ventas
--   - historial_compras
--
-- Estos 4 RPC YA funcionan correctamente en producción y ya coinciden
-- exactamente con el contrato que usa public/app.js (verificado campo
-- por campo). El único problema real era de versionado: ningún archivo
-- del repo representaba su definición ACTUAL. La única copia previa
-- vivía en supabase/b6-nucleo-operativo.sql, marcado DEPRECATED, con
-- firmas viejas (p.ej. historial_compras y rentabilidad_ventas con un
-- parámetro menos, sin p_producto_id) y con GRANT EXECUTE a anon —
-- ambas cosas ya no reflejan producción. Ese archivo NO se toca ni se
-- reemplaza aquí, según instrucción explícita de la misión.
--
-- Es seguro re-ejecutar este archivo contra producción: todo es
-- CREATE OR REPLACE sobre funciones que ya existen con exactamente
-- esta definición. Su valor real es para GitHub: deja el repo capaz
-- de reconstruir estas piezas desde cero.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. inventario_enriquecido — stock con costo promedio y valoración
--    Aplicada originalmente en B5, corregida en M2
--    (m2_fix_inventario_enriquecido_public_grant) y unificada en
--    search_path en B3.9. Grants reales verificados en producción:
--    authenticated, postgres, service_role (SIN anon).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.inventario_enriquecido(p_almacen_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(producto_id uuid, producto text, almacen text, cantidad numeric, minimo numeric, estado text, costo_promedio numeric, valor_inventario numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver inventario.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT s.producto_id, p.nombre AS producto, a.nombre AS almacen,
      s.cantidad, s.minimo,
      CASE
        WHEN s.cantidad <= 0 THEN 'agotado'
        WHEN s.minimo IS NOT NULL AND s.cantidad <= s.minimo THEN 'bajo'
        ELSE 'normal'
      END AS estado,
      COALESCE((
        SELECT round(sum(lc.cantidad_restante * lc.costo_unitario) / NULLIF(sum(lc.cantidad_restante), 0), 4)
        FROM public.lotes_compra lc
        WHERE lc.producto_id = s.producto_id AND lc.almacen_id = s.almacen_id
          AND lc.cantidad_restante > 0
      ), 0) AS costo_promedio,
      COALESCE((
        SELECT sum(lc.cantidad_restante * lc.costo_unitario)
        FROM public.lotes_compra lc
        WHERE lc.producto_id = s.producto_id AND lc.almacen_id = s.almacen_id
          AND lc.cantidad_restante > 0
      ), 0) AS valor_inventario
    FROM public.stock s
    JOIN public.productos p ON p.id = s.producto_id
    JOIN public.almacenes a ON a.id = s.almacen_id
    WHERE (p_almacen_id IS NULL OR s.almacen_id = p_almacen_id)
    ORDER BY p.nombre;
END;
$function$;

REVOKE ALL ON FUNCTION public.inventario_enriquecido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventario_enriquecido(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- 2. movimientos_producto — trazabilidad unificada (compras, ventas,
--    transferencias de entrada/salida, vales). Corregida en M2
--    (order by y grants) y unificada en search_path en B3.9.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.movimientos_producto(p_producto_id uuid DEFAULT NULL::uuid, p_almacen_id uuid DEFAULT NULL::uuid, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_tipo text DEFAULT NULL::text, p_limite integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(fecha timestamp with time zone, tipo text, producto text, almacen text, cantidad numeric, costo_unitario numeric, usuario text, operacion_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver movimientos.' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite > 500 OR p_limite < 1 THEN p_limite := 100; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
    SELECT lc.fecha_compra AS fecha, 'compra'::text, p.nombre, a.nombre,
      lc.cantidad_inicial, lc.costo_unitario, u.nombre, lc.id
    FROM public.lotes_compra lc
    JOIN public.productos p ON p.id = lc.producto_id
    JOIN public.almacenes a ON a.id = lc.almacen_id
    LEFT JOIN public.usuarios u ON u.id = lc.usuario_id
    WHERE lc.origen = 'compra'
      AND (p_desde IS NULL OR lc.fecha_compra::date >= p_desde)
      AND (p_hasta IS NULL OR lc.fecha_compra::date <= p_hasta)
      AND (p_producto_id IS NULL OR lc.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR lc.almacen_id = p_almacen_id)
      AND (p_tipo IS NULL OR p_tipo = '' OR p_tipo = 'compra')

    UNION ALL
    SELECT v.fecha, 'venta'::text, p.nombre, a.nombre,
      -vl.cantidad, vl.costo_unitario_fifo, u.nombre, v.id
    FROM public.ventas_lineas vl
    JOIN public.ventas v ON v.id = vl.venta_id
    JOIN public.productos p ON p.id = vl.producto_id
    JOIN public.almacenes a ON a.id = v.almacen_id
    LEFT JOIN public.usuarios u ON u.id = v.creado_por
    WHERE (p_desde IS NULL OR v.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR v.fecha::date <= p_hasta)
      AND (p_producto_id IS NULL OR vl.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR v.almacen_id = p_almacen_id)
      AND (p_tipo IS NULL OR p_tipo = '' OR p_tipo = 'venta')

    UNION ALL
    SELECT t.fecha, 'transferencia_salida'::text, p.nombre, o.nombre,
      -tl.cantidad, NULL::numeric, u.nombre, t.id
    FROM public.transferencias_lineas tl
    JOIN public.transferencias t ON t.id = tl.transferencia_id
    JOIN public.productos p ON p.id = tl.producto_id
    JOIN public.almacenes o ON o.id = t.almacen_origen_id
    LEFT JOIN public.usuarios u ON u.id = t.creado_por
    WHERE (p_desde IS NULL OR t.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR t.fecha::date <= p_hasta)
      AND (p_producto_id IS NULL OR tl.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR t.almacen_origen_id = p_almacen_id)
      AND (p_tipo IS NULL OR p_tipo = '' OR p_tipo = 'transferencia_salida')

    UNION ALL
    SELECT t.fecha, 'transferencia_entrada'::text, p.nombre, d.nombre,
      tl.cantidad, NULL::numeric, u.nombre, t.id
    FROM public.transferencias_lineas tl
    JOIN public.transferencias t ON t.id = tl.transferencia_id
    JOIN public.productos p ON p.id = tl.producto_id
    JOIN public.almacenes d ON d.id = t.almacen_destino_id
    LEFT JOIN public.usuarios u ON u.id = t.creado_por
    WHERE (p_desde IS NULL OR t.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR t.fecha::date <= p_hasta)
      AND (p_producto_id IS NULL OR tl.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR t.almacen_destino_id = p_almacen_id)
      AND (p_tipo IS NULL OR p_tipo = '' OR p_tipo = 'transferencia_entrada')

    UNION ALL
    SELECT vs.fecha, 'vale'::text, p.nombre, a.nombre,
      -vs.cantidad, NULL::numeric, u.nombre, vs.id
    FROM public.vales_salida vs
    JOIN public.productos p ON p.id = vs.producto_id
    JOIN public.almacenes a ON a.id = vs.almacen_id
    LEFT JOIN public.usuarios u ON u.id = vs.creado_por
    WHERE (p_desde IS NULL OR vs.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR vs.fecha::date <= p_hasta)
      AND (p_producto_id IS NULL OR vs.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR vs.almacen_id = p_almacen_id)
      AND (p_tipo IS NULL OR p_tipo = '' OR p_tipo = 'vale')

    ORDER BY fecha DESC
    LIMIT p_limite OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.movimientos_producto(uuid, uuid, date, date, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movimientos_producto(uuid, uuid, date, date, text, integer, integer) TO authenticated;


-- ---------------------------------------------------------------------
-- 3. historial_compras — reporte por LOTE real de compra (origen =
--    'compra', excluye lotes espejo de transferencia). Aplicada en
--    B5.2, ajustada en B6 (filtro por origen) y M2 (revoke anon).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.historial_compras(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_producto_id uuid DEFAULT NULL::uuid, p_almacen_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(lote_id uuid, fecha_compra timestamp with time zone, producto text, almacen text, cantidad_inicial numeric, cantidad_restante numeric, costo_unitario numeric, costo_total numeric, estado text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.tiene_permiso('reportes','ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE='42501';
  END IF;
  IF p_limite IS NULL OR p_limite>500 OR p_limite<1 THEN p_limite:=100; END IF;
  IF p_offset IS NULL OR p_offset<0 THEN p_offset:=0; END IF;

  RETURN QUERY
  SELECT
    lc.id,
    lc.fecha_compra,
    p.nombre,
    a.nombre,
    lc.cantidad_inicial,
    lc.cantidad_restante,
    lc.costo_unitario,
    lc.cantidad_inicial * lc.costo_unitario,
    CASE
      WHEN lc.cantidad_restante > lc.cantidad_inicial THEN 'inconsistente'
      WHEN lc.cantidad_restante = 0 THEN 'agotado'
      WHEN lc.cantidad_restante = lc.cantidad_inicial THEN 'disponible'
      ELSE 'parcial'
    END
  FROM public.lotes_compra lc
  JOIN public.productos p ON p.id = lc.producto_id
  JOIN public.almacenes a ON a.id = lc.almacen_id
  WHERE lc.origen = 'compra'
    AND (p_desde IS NULL OR lc.fecha_compra::date >= p_desde)
    AND (p_hasta IS NULL OR lc.fecha_compra::date <= p_hasta)
    AND (p_producto_id IS NULL OR lc.producto_id = p_producto_id)
    AND (p_almacen_id IS NULL OR lc.almacen_id = p_almacen_id)
  ORDER BY lc.fecha_compra DESC
  LIMIT p_limite OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.historial_compras(date, date, uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.historial_compras(date, date, uuid, uuid, integer, integer) TO authenticated;


-- ---------------------------------------------------------------------
-- 4. rentabilidad_ventas — ganancia y margen por línea de venta, usando
--    SIEMPRE el costo_unitario_fifo histórico ya guardado en
--    ventas_lineas (nunca recalculado desde lotes_compra actual).
--    Aplicada en B5.3. Ventas sin costo FIFO histórico (previas a
--    B5.1) devuelven costo_disponible=false y nunca inventan margen.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rentabilidad_ventas(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_producto_id uuid DEFAULT NULL::uuid, p_almacen_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(fecha timestamp with time zone, venta_id uuid, producto text, almacen text, cantidad numeric, precio_unitario numeric, ingreso numeric, costo_unitario_fifo numeric, costo_total numeric, margen numeric, margen_porcentaje numeric, costo_disponible boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.tiene_permiso('reportes','ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE='42501';
  END IF;
  IF p_limite IS NULL OR p_limite>500 OR p_limite<1 THEN p_limite:=100; END IF;
  IF p_offset IS NULL OR p_offset<0 THEN p_offset:=0; END IF;

  RETURN QUERY
  SELECT
    v.fecha,
    v.id,
    p.nombre,
    a.nombre,
    vl.cantidad,
    vl.precio_unitario,
    vl.cantidad * vl.precio_unitario AS ingreso,
    vl.costo_unitario_fifo,
    CASE WHEN vl.costo_unitario_fifo IS NULL THEN NULL
         ELSE vl.cantidad * vl.costo_unitario_fifo END AS costo_total,
    CASE WHEN vl.costo_unitario_fifo IS NULL THEN NULL
         ELSE (vl.cantidad * vl.precio_unitario) - (vl.cantidad * vl.costo_unitario_fifo) END AS margen,
    CASE WHEN vl.costo_unitario_fifo IS NULL THEN NULL
         WHEN (vl.cantidad * vl.precio_unitario) = 0 THEN NULL
         ELSE ((vl.cantidad * vl.precio_unitario) - (vl.cantidad * vl.costo_unitario_fifo))
              / (vl.cantidad * vl.precio_unitario) * 100 END AS margen_porcentaje,
    (vl.costo_unitario_fifo IS NOT NULL) AS costo_disponible
  FROM public.ventas_lineas vl
  JOIN public.ventas v ON v.id = vl.venta_id
  JOIN public.productos p ON p.id = vl.producto_id
  LEFT JOIN public.almacenes a ON a.id = v.almacen_id
  WHERE (p_desde IS NULL OR v.fecha::date >= p_desde)
    AND (p_hasta IS NULL OR v.fecha::date <= p_hasta)
    AND (p_producto_id IS NULL OR vl.producto_id = p_producto_id)
    AND (p_almacen_id IS NULL OR v.almacen_id = p_almacen_id)
  ORDER BY v.fecha DESC
  LIMIT p_limite OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.rentabilidad_ventas(date, date, uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rentabilidad_ventas(date, date, uuid, uuid, integer, integer) TO authenticated;


-- =====================================================================
-- FIN de la migración de reconciliación de reportes (Misión 3/3).
--
-- Lo que este archivo NO cubre (a propósito):
--   - No modifica ni reemplaza supabase/b6-nucleo-operativo.sql
--     (deprecated), aunque ese archivo contenga versiones viejas de
--     estas mismas 4 funciones con firmas distintas y grants a anon.
--     Queda como registro histórico, según instrucción explícita.
--   - No modifica public/app.js ni ningún otro archivo de frontend.
--   - No corrige ningún bug: no se encontró ninguno en estos 4 reportes.
-- =====================================================================
