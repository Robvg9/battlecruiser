-- Inventario operativo por jornada + unidad base obligatoria.
-- El corte inicial permanece inmutable; nunca se replica en public.stock.

ALTER TABLE public.productos
  ALTER COLUMN unidad SET DEFAULT 'unidad';

CREATE OR REPLACE FUNCTION public.bc_productos_unidad_base_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $function$
BEGIN
  NEW.unidad := COALESCE(NULLIF(BTRIM(NEW.unidad), ''), 'unidad');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bc_productos_unidad_base_default ON public.productos;
CREATE TRIGGER trg_bc_productos_unidad_base_default
BEFORE INSERT OR UPDATE OF unidad ON public.productos
FOR EACH ROW
EXECUTE FUNCTION public.bc_productos_unidad_base_default();

UPDATE public.productos
SET unidad = 'unidad'
WHERE unidad IS NULL OR BTRIM(unidad) = '';

ALTER TABLE public.productos
  ALTER COLUMN unidad SET NOT NULL;

CREATE OR REPLACE FUNCTION public.bc7_jornada_saldos_operativos(p_turno_sesion_id uuid)
RETURNS TABLE (
  producto_id uuid,
  inventario_inicial numeric,
  entradas numeric,
  salidas numeric,
  cantidad_actual numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_session record;
  v_initial record;
  v_start_at timestamptz;
  v_end_at timestamptz := now();
BEGIN
  IF p_turno_sesion_id IS NULL THEN
    RAISE EXCEPTION 'turno_sesion_id requerido';
  END IF;

  SELECT
    s.id,
    s.estado,
    s.bloque,
    s.apertura_retroactiva,
    s.almacen_id,
    s.jornada_programacion_id,
    jp.fecha AS fecha_programada,
    jp.hora_inicio_prevista,
    jp.zona_horaria,
    t.apertura_real,
    a.tipo AS almacen_tipo
  INTO v_session
  FROM public.turno_sesiones s
  JOIN public.turnos t ON t.id = s.turno_id
  JOIN public.turno_jornada_programacion jp ON jp.id = s.jornada_programacion_id
  JOIN public.almacenes a ON a.id = s.almacen_id
  WHERE s.id = p_turno_sesion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la jornada solicitada';
  END IF;

  IF v_session.estado <> 'EN_CURSO'
     OR v_session.bloque <> 'JORNADA'
     OR v_session.jornada_programacion_id IS NULL
     OR v_session.almacen_tipo <> 'minorista' THEN
    RAISE EXCEPTION 'El saldo operativo solo aplica a una jornada minorista activa';
  END IF;

  SELECT c.id, c.confirmado_en, c.creado_en
  INTO v_initial
  FROM public.turno_jornada_inventario_cortes c
  WHERE c.turno_sesion_id = p_turno_sesion_id
    AND c.tipo = 'INICIAL'
    AND c.estado = 'CONFIRMADO'
  ORDER BY c.confirmado_en DESC NULLS LAST, c.creado_en DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La jornada activa no tiene un corte inicial confirmado; se bloquea el saldo global incompleto';
  END IF;

  IF COALESCE(v_session.apertura_retroactiva, false)
     AND v_session.hora_inicio_prevista IS NOT NULL THEN
    -- For retroactively opened jornadas, the programmed start defines the
    -- inventory period. A transfer before the administrative backfill/open
    -- timestamp still belongs to the shift when it happened after schedule start.
    v_start_at := (v_session.fecha_programada + v_session.hora_inicio_prevista)
      AT TIME ZONE COALESCE(NULLIF(v_session.zona_horaria, ''), 'America/Havana');
  ELSE
    v_start_at := COALESCE(v_session.apertura_real, v_initial.confirmado_en, v_initial.creado_en);
  END IF;

  IF v_start_at IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar la hora de apertura de la jornada';
  END IF;

  RETURN QUERY
  WITH initial_rows AS (
    SELECT
      l.producto_id,
      SUM(l.cantidad_contada)::numeric AS cantidad
    FROM public.turno_jornada_inventario_lineas l
    WHERE l.corte_id = v_initial.id
    GROUP BY l.producto_id
  ),
  movement_rows AS (
    -- Transferencias entrantes. En una apertura retroactiva solo se aceptan
    -- las del día siguiente o las vinculadas expresamente al corte.
    SELECT tl.producto_id, 'ENTRADA'::text AS tipo, tl.cantidad::numeric AS cantidad
    FROM public.transferencias t
    JOIN public.transferencias_lineas tl ON tl.transferencia_id = t.id
    WHERE t.almacen_destino_id = v_session.almacen_id
      AND LOWER(t.estado) = 'completada'
      AND t.fecha > v_start_at
      AND t.fecha <= v_end_at

    UNION ALL

    -- Transferencias salientes.
    SELECT tl.producto_id, 'SALIDA'::text, tl.cantidad::numeric
    FROM public.transferencias t
    JOIN public.transferencias_lineas tl ON tl.transferencia_id = t.id
    WHERE t.almacen_origen_id = v_session.almacen_id
      AND LOWER(t.estado) = 'completada'
      AND t.fecha > v_start_at
      AND t.fecha <= v_end_at

    UNION ALL

    -- Compras recibidas en el almacén.
    SELECT lc.producto_id, 'ENTRADA'::text, lc.cantidad_inicial::numeric
    FROM public.lotes_compra lc
    WHERE lc.almacen_id = v_session.almacen_id
      AND LOWER(COALESCE(lc.origen, '')) = 'compra'
      AND lc.fecha_compra > v_start_at
      AND lc.fecha_compra <= v_end_at

    UNION ALL

    -- Reinversiones aprobadas durante esta jornada.
    SELECT rl.producto_id, 'ENTRADA'::text, rl.cantidad_base::numeric
    FROM public.reinversiones r
    JOIN public.reinversiones_lineas rl ON rl.reinversion_id = r.id
    WHERE r.almacen_id = v_session.almacen_id
      AND r.turno_sesion_id = p_turno_sesion_id
      AND r.estado = 'APROBADA'
      AND r.fecha_revision IS NOT NULL
      AND r.fecha_revision > v_start_at
      AND r.fecha_revision <= v_end_at

    UNION ALL

    -- Vales de salida confirmados.
    SELECT vs.producto_id, 'SALIDA'::text, vs.cantidad::numeric
    FROM public.vales_salida vs
    WHERE vs.almacen_id = v_session.almacen_id
      AND vs.fecha > v_start_at
      AND vs.fecha <= v_end_at
      AND UPPER(COALESCE(vs.estado, 'REGISTRADO')) NOT IN
          ('PENDIENTE', 'RECHAZADO', 'CANCELADO', 'ANULADO')

    UNION ALL

    -- Bajas y mermas aprobadas; las solicitudes pendientes no descuentan.
    SELECT m.producto_id, 'SALIDA'::text, m.cantidad::numeric
    FROM public.mermas m
    WHERE m.almacen_id = v_session.almacen_id
      AND m.estado = 'APROBADA'
      AND COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) > v_start_at
      AND COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) <= v_end_at

    UNION ALL

    SELECT b.producto_id, 'SALIDA'::text, b.cantidad::numeric
    FROM public.bajas b
    WHERE b.almacen_id = v_session.almacen_id
      AND b.estado = 'APROBADA'
      AND COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) > v_start_at
      AND COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) <= v_end_at

    UNION ALL

    -- Ventas completadas, si el almacén utiliza POS.
    SELECT vl.producto_id, 'SALIDA'::text, vl.cantidad::numeric
    FROM public.ventas v
    JOIN public.ventas_lineas vl ON vl.venta_id = v.id
    WHERE v.almacen_id = v_session.almacen_id
      AND LOWER(COALESCE(v.estado, '')) IN ('completada', 'completado')
      AND v.fecha > v_start_at
      AND v.fecha <= v_end_at
  ),
  movement_totals AS (
    SELECT
      m.producto_id,
      COALESCE(SUM(m.cantidad) FILTER (WHERE m.tipo = 'ENTRADA'), 0)::numeric AS entradas,
      COALESCE(SUM(m.cantidad) FILTER (WHERE m.tipo = 'SALIDA'), 0)::numeric AS salidas
    FROM movement_rows m
    GROUP BY m.producto_id
  ),
  product_ids AS (
    SELECT i.producto_id FROM initial_rows i
    UNION
    SELECT m.producto_id FROM movement_totals m
  )
  SELECT
    ids.producto_id,
    COALESCE(i.cantidad, 0)::numeric AS inventario_inicial,
    COALESCE(m.entradas, 0)::numeric AS entradas,
    COALESCE(m.salidas, 0)::numeric AS salidas,
    (
      COALESCE(i.cantidad, 0)
      + COALESCE(m.entradas, 0)
      - COALESCE(m.salidas, 0)
    )::numeric AS cantidad_actual
  FROM product_ids ids
  LEFT JOIN initial_rows i ON i.producto_id = ids.producto_id
  LEFT JOIN movement_totals m ON m.producto_id = ids.producto_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_jornada_saldos_operativos(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.inventario_enriquecido(p_almacen_id uuid DEFAULT NULL::uuid)
RETURNS TABLE (
  producto_id uuid,
  producto text,
  almacen text,
  cantidad numeric,
  minimo numeric,
  estado text,
  costo_promedio numeric,
  valor_inventario numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tienes permiso para ver el inventario';
  END IF;

  RETURN QUERY
  WITH active_sessions AS (
    SELECT DISTINCT ON (s.almacen_id)
      s.id AS session_id,
      s.almacen_id
    FROM public.turno_sesiones s
    JOIN public.turnos t ON t.id = s.turno_id
    JOIN public.turno_jornada_programacion jp ON jp.id = s.jornada_programacion_id
    JOIN public.almacenes a ON a.id = s.almacen_id
    WHERE s.estado = 'EN_CURSO'
      AND s.bloque = 'JORNADA'
      AND s.jornada_programacion_id IS NOT NULL
      AND a.tipo = 'minorista'
      AND (p_almacen_id IS NULL OR s.almacen_id = p_almacen_id)
    ORDER BY s.almacen_id,
      COALESCE(t.apertura_real, jp.fecha::timestamp AT TIME ZONE COALESCE(NULLIF(jp.zona_horaria, ''), 'America/Havana')) DESC,
      s.id DESC
  ),
  projected AS (
    SELECT
      act.almacen_id,
      b.producto_id,
      b.cantidad_actual
    FROM active_sessions act
    CROSS JOIN LATERAL public.bc7_jornada_saldos_operativos(act.session_id) b
  ),
  inventory_rows AS (
    SELECT
      s.producto_id,
      p.nombre AS producto,
      a.nombre AS almacen,
      CASE
        WHEN act.session_id IS NOT NULL THEN COALESCE(projected.cantidad_actual, 0)
        ELSE s.cantidad
      END::numeric AS cantidad,
      s.minimo::numeric AS minimo,
      COALESCE(cost.costo_promedio, 0)::numeric AS costo_promedio,
      COALESCE(cost.valor_inventario, 0)::numeric AS valor_inventario
    FROM public.stock s
    JOIN public.productos p ON p.id = s.producto_id
    JOIN public.almacenes a ON a.id = s.almacen_id
    LEFT JOIN active_sessions act ON act.almacen_id = s.almacen_id
    LEFT JOIN projected ON projected.almacen_id = s.almacen_id
      AND projected.producto_id = s.producto_id
    LEFT JOIN LATERAL (
      SELECT
        ROUND(
          SUM(lc.cantidad_restante * lc.costo_unitario)
          / NULLIF(SUM(lc.cantidad_restante), 0),
          4
        ) AS costo_promedio,
        COALESCE(SUM(lc.cantidad_restante * lc.costo_unitario), 0) AS valor_inventario
      FROM public.lotes_compra lc
      WHERE lc.producto_id = s.producto_id
        AND lc.almacen_id = s.almacen_id
        AND lc.cantidad_restante > 0
    ) cost ON true
    WHERE p_almacen_id IS NULL OR s.almacen_id = p_almacen_id

    UNION ALL

    -- Incluye productos del corte/movimientos que aún no tienen fila en stock.
    SELECT
      projected.producto_id,
      p.nombre AS producto,
      a.nombre AS almacen,
      projected.cantidad_actual::numeric AS cantidad,
      NULL::numeric AS minimo,
      COALESCE(cost.costo_promedio, 0)::numeric AS costo_promedio,
      COALESCE(cost.valor_inventario, 0)::numeric AS valor_inventario
    FROM projected
    JOIN public.productos p ON p.id = projected.producto_id
    JOIN public.almacenes a ON a.id = projected.almacen_id
    LEFT JOIN public.stock s ON s.producto_id = projected.producto_id
      AND s.almacen_id = projected.almacen_id
    LEFT JOIN LATERAL (
      SELECT
        ROUND(
          SUM(lc.cantidad_restante * lc.costo_unitario)
          / NULLIF(SUM(lc.cantidad_restante), 0),
          4
        ) AS costo_promedio,
        COALESCE(SUM(lc.cantidad_restante * lc.costo_unitario), 0) AS valor_inventario
      FROM public.lotes_compra lc
      WHERE lc.producto_id = projected.producto_id
        AND lc.almacen_id = projected.almacen_id
        AND lc.cantidad_restante > 0
    ) cost ON true
    WHERE s.id IS NULL
  )
  SELECT
    r.producto_id,
    r.producto,
    r.almacen,
    r.cantidad,
    r.minimo,
    CASE
      WHEN r.minimo IS NULL OR r.minimo <= 0 THEN 'sin_minimo'
      WHEN r.cantidad <= 0 THEN 'agotado'
      WHEN r.cantidad <= r.minimo THEN 'bajo'
      ELSE 'normal'
    END::text AS estado,
    r.costo_promedio,
    r.valor_inventario
  FROM inventory_rows r
  ORDER BY r.producto;
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventario_mixto_enriquecido(p_almacen_id uuid DEFAULT NULL::uuid)
RETURNS TABLE (
  producto_id uuid,
  producto text,
  almacen text,
  cantidad numeric,
  minimo numeric,
  estado text,
  costo_promedio numeric,
  valor_inventario numeric,
  unidad text,
  variantes jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tienes permiso para ver el inventario';
  END IF;

  RETURN QUERY
  WITH active_sessions AS (
    SELECT DISTINCT ON (s.almacen_id)
      s.id AS session_id,
      s.almacen_id
    FROM public.turno_sesiones s
    JOIN public.turnos t ON t.id = s.turno_id
    JOIN public.turno_jornada_programacion jp ON jp.id = s.jornada_programacion_id
    JOIN public.almacenes a ON a.id = s.almacen_id
    WHERE s.estado = 'EN_CURSO'
      AND s.bloque = 'JORNADA'
      AND s.jornada_programacion_id IS NOT NULL
      AND a.tipo = 'minorista'
      AND (p_almacen_id IS NULL OR s.almacen_id = p_almacen_id)
    ORDER BY s.almacen_id,
      COALESCE(t.apertura_real, jp.fecha::timestamp AT TIME ZONE COALESCE(NULLIF(jp.zona_horaria, ''), 'America/Havana')) DESC,
      s.id DESC
  ),
  projected AS (
    SELECT
      act.almacen_id,
      b.producto_id,
      b.inventario_inicial,
      b.entradas,
      b.salidas,
      b.cantidad_actual
    FROM active_sessions act
    CROSS JOIN LATERAL public.bc7_jornada_saldos_operativos(act.session_id) b
  ),
  variant_rows AS (
    SELECT
      p.id AS parent_id,
      p.nombre AS parent_name,
      a.id AS almacen_id,
      a.nombre AS almacen_name,
      COALESCE(NULLIF(BTRIM(p.unidad), ''), 'unidad') AS parent_unit,
      v.id AS variant_id,
      COALESCE(NULLIF(BTRIM(v.variante_nombre), ''), v.nombre) AS variant_name,
      CASE
        WHEN act.session_id IS NOT NULL THEN COALESCE(child_balance.cantidad_actual, 0)
        ELSE COALESCE(s.cantidad, 0)
      END::numeric AS variant_quantity,
      COALESCE(vm.minimo, 0)::numeric AS variant_minimum,
      COALESCE(NULLIF(BTRIM(v.unidad), ''), 'unidad') AS variant_unit,
      COALESCE(child_balance.inventario_inicial, 0)::numeric AS variant_initial,
      COALESCE(child_balance.entradas, 0)::numeric AS variant_entries,
      COALESCE(child_balance.salidas, 0)::numeric AS variant_exits,
      COALESCE(variant_cost.valor_inventario, 0)::numeric AS variant_value,
      CASE
        WHEN act.session_id IS NOT NULL THEN COALESCE(parent_balance.cantidad_actual, 0)
        ELSE 0
      END::numeric AS parent_quantity,
      COALESCE(parent_balance.inventario_inicial, 0)::numeric AS parent_initial,
      COALESCE(parent_balance.entradas, 0)::numeric AS parent_entries,
      COALESCE(parent_balance.salidas, 0)::numeric AS parent_exits,
      COALESCE(parent_cost.valor_inventario, 0)::numeric AS parent_value
    FROM public.productos p
    JOIN public.almacenes a ON a.activo = true
    JOIN public.productos v ON v.producto_padre_id = p.id AND v.activo = true
    LEFT JOIN active_sessions act ON act.almacen_id = a.id
    LEFT JOIN public.stock s ON s.producto_id = v.id AND s.almacen_id = a.id
    LEFT JOIN projected child_balance ON child_balance.almacen_id = a.id
      AND child_balance.producto_id = v.id
    LEFT JOIN public.productos_stock_mixto_minimos vm
      ON vm.producto_id = v.id AND vm.almacen_id = a.id
    LEFT JOIN projected parent_balance ON parent_balance.almacen_id = a.id
      AND parent_balance.producto_id = p.id
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(lc.cantidad_restante * lc.costo_unitario), 0) AS valor_inventario
      FROM public.lotes_compra lc
      WHERE lc.producto_id = v.id
        AND lc.almacen_id = a.id
        AND lc.cantidad_restante > 0
    ) variant_cost ON true
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(lc.cantidad_restante * lc.costo_unitario), 0) AS valor_inventario
      FROM public.lotes_compra lc
      WHERE lc.producto_id = p.id
        AND lc.almacen_id = a.id
        AND lc.cantidad_restante > 0
    ) parent_cost ON true
    WHERE p.activo = true
      AND p.inventario_mixto = true
      AND p.producto_padre_id IS NULL
      AND (p_almacen_id IS NULL OR a.id = p_almacen_id)
  ),
  family_rows AS (
    SELECT
      vr.parent_id,
      vr.parent_name,
      vr.almacen_id,
      vr.almacen_name,
      vr.parent_unit,
      (SUM(vr.variant_quantity) + MAX(vr.parent_quantity))::numeric AS cantidad,
      CASE
        WHEN MAX(vr.parent_quantity) <> 0 OR BOOL_OR(vr.variant_minimum <= 0) THEN NULL::numeric
        ELSE SUM(vr.variant_minimum)::numeric
      END AS minimo,
      CASE
        WHEN MAX(vr.parent_quantity) <> 0 OR BOOL_OR(vr.variant_minimum <= 0) THEN 'sin_minimo'
        WHEN SUM(vr.variant_quantity) + MAX(vr.parent_quantity) <= 0 THEN 'agotado'
        WHEN BOOL_OR(vr.variant_quantity <= vr.variant_minimum) THEN 'bajo'
        ELSE 'normal'
      END::text AS estado,
      CASE
        WHEN SUM(vr.variant_quantity) + MAX(vr.parent_quantity) > 0
          THEN (SUM(vr.variant_value) + MAX(vr.parent_value))
            / NULLIF(SUM(vr.variant_quantity) + MAX(vr.parent_quantity), 0)
        ELSE 0
      END::numeric AS costo_promedio,
      (SUM(vr.variant_value) + MAX(vr.parent_value))::numeric AS valor_inventario,
      (
        COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'producto_id', vr.variant_id,
              'nombre', vr.variant_name,
              'cantidad', vr.variant_quantity,
              'minimo', vr.variant_minimum,
              'estado', CASE
                WHEN vr.variant_minimum <= 0 THEN 'sin_minimo'
                WHEN vr.variant_quantity <= 0 THEN 'agotado'
                WHEN vr.variant_quantity <= vr.variant_minimum THEN 'bajo'
                ELSE 'normal'
              END,
              'unidad', vr.variant_unit,
              'valor_inventario', vr.variant_value,
              'jornada_inicial', vr.variant_initial,
              'jornada_entradas', vr.variant_entries,
              'jornada_salidas', vr.variant_exits
            )
            ORDER BY vr.variant_name
          ),
          '[]'::jsonb
        )
        ||
        CASE
          WHEN MAX(vr.parent_quantity) <> 0 THEN
            JSONB_BUILD_ARRAY(
              JSONB_BUILD_OBJECT(
                'producto_id', NULL,
                'nombre', 'Inventario inicial sin distribuir',
                'cantidad', MAX(vr.parent_quantity),
                'minimo', NULL,
                'estado', 'sin_minimo',
                'unidad', vr.parent_unit,
                'valor_inventario', MAX(vr.parent_value),
                'jornada_inicial', MAX(vr.parent_initial),
                'jornada_entradas', MAX(vr.parent_entries),
                'jornada_salidas', MAX(vr.parent_exits)
              )
            )
          ELSE '[]'::jsonb
        END
      ) AS variantes
    FROM variant_rows vr
    GROUP BY vr.parent_id, vr.parent_name, vr.almacen_id, vr.almacen_name, vr.parent_unit
  )
  SELECT
    fr.parent_id AS producto_id,
    fr.parent_name AS producto,
    fr.almacen_name AS almacen,
    fr.cantidad,
    fr.minimo,
    fr.estado,
    fr.costo_promedio,
    fr.valor_inventario,
    fr.parent_unit AS unidad,
    fr.variantes
  FROM family_rows fr
  ORDER BY fr.parent_name, fr.almacen_name;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.inventario_enriquecido(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventario_mixto_enriquecido(uuid) TO authenticated;
