-- BattleCruiser: per-warehouse minimum stock for each mixed-inventory flavor.
-- Existing parent thresholds remain intact; child rows use the same protected table.
BEGIN;

-- Every physical stock row must carry an explicit threshold. Existing nulls become 0,
-- which is a valid deliberate "no safety stock" threshold and is editable in Inventory.
UPDATE public.stock SET minimo=0 WHERE minimo IS NULL;
ALTER TABLE public.stock ALTER COLUMN minimo SET DEFAULT 0;
ALTER TABLE public.stock ALTER COLUMN minimo SET NOT NULL;

-- Backfill one minimum row per existing flavor and warehouse without overwriting
-- any existing configured value.
INSERT INTO public.productos_stock_mixto_minimos(producto_id,almacen_id,minimo)
SELECT s.producto_id,s.almacen_id,coalesce(s.minimo,0)
FROM public.stock s
JOIN public.productos v ON v.id=s.producto_id AND v.producto_padre_id IS NOT NULL
ON CONFLICT(producto_id,almacen_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bc_seed_mixed_variant_minimum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_parent_id uuid;
BEGIN
  SELECT producto_padre_id INTO v_parent_id
  FROM public.productos WHERE id=NEW.producto_id;
  IF v_parent_id IS NOT NULL THEN
    INSERT INTO public.productos_stock_mixto_minimos(producto_id,almacen_id,minimo)
    VALUES(NEW.producto_id,NEW.almacen_id,coalesce(NEW.minimo,0))
    ON CONFLICT(producto_id,almacen_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bc_seed_mixed_variant_minimum ON public.stock;
CREATE TRIGGER bc_seed_mixed_variant_minimum
AFTER INSERT OR UPDATE OF producto_id,almacen_id,minimo ON public.stock
FOR EACH ROW EXECUTE FUNCTION public.bc_seed_mixed_variant_minimum();

CREATE OR REPLACE FUNCTION public.bc_require_positive_stock_minimum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $minimum_guard$
BEGIN
  IF NEW.cantidad > 0 AND coalesce(NEW.minimo,0) <= 0 THEN
    -- Keep legacy stock saleable while minimums are being configured. Only
    -- inserts or increases are blocked; decreases (sales, bajas, transfer-outs)
    -- remain possible during the transition.
    IF TG_OP='INSERT' OR NEW.cantidad > OLD.cantidad THEN
      RAISE EXCEPTION 'Antes de agregar o aumentar existencias, configura un stock mínimo mayor que cero para este producto y almacén.'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$minimum_guard$;

DROP TRIGGER IF EXISTS bc_require_positive_stock_minimum ON public.stock;
CREATE TRIGGER bc_require_positive_stock_minimum
BEFORE INSERT OR UPDATE OF cantidad ON public.stock
FOR EACH ROW EXECUTE FUNCTION public.bc_require_positive_stock_minimum();

REVOKE ALL ON FUNCTION public.bc_require_positive_stock_minimum() FROM PUBLIC,anon;

CREATE OR REPLACE FUNCTION public.bc_actualizar_stock_minimo_obligatorio(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_minimo numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $minimum$
DECLARE
  v_producto public.productos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay una sesión autenticada.' USING ERRCODE='42501';
  END IF;
  IF NOT public.tiene_permiso('stock','editar') THEN
    RAISE EXCEPTION 'No tienes permiso para editar el stock mínimo.' USING ERRCODE='42501';
  END IF;
  IF p_producto_id IS NULL OR p_almacen_id IS NULL OR p_minimo IS NULL OR p_minimo<=0 THEN
    RAISE EXCEPTION 'El stock mínimo es obligatorio y debe ser mayor que cero.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_producto
  FROM public.productos
  WHERE id=p_producto_id AND activo=true
  FOR SHARE;
  IF NOT FOUND OR v_producto.producto_padre_id IS NOT NULL OR v_producto.inventario_mixto THEN
    RAISE EXCEPTION 'Selecciona un producto normal para configurar su mínimo; los sabores llevan mínimos independientes.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.almacenes WHERE id=p_almacen_id AND activo=true) THEN
    RAISE EXCEPTION 'El almacén no existe o está inactivo.' USING ERRCODE='23503';
  END IF;

  UPDATE public.stock
  SET minimo=p_minimo
  WHERE producto_id=p_producto_id AND almacen_id=p_almacen_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El producto no está asignado a este almacén.' USING ERRCODE='23514';
  END IF;

  RETURN jsonb_build_object('producto_id',p_producto_id,'almacen_id',p_almacen_id,'minimo',p_minimo);
END;
$minimum$;

REVOKE ALL ON FUNCTION public.bc_actualizar_stock_minimo_obligatorio(uuid,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc_actualizar_stock_minimo_obligatorio(uuid,uuid,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc_actualizar_stock_minimo_variante(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_minimo numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_parent_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay una sesión autenticada.' USING ERRCODE='42501';
  END IF;
  IF NOT public.tiene_permiso('stock','editar') THEN
    RAISE EXCEPTION 'No tienes permiso para editar el stock mínimo.' USING ERRCODE='42501';
  END IF;
  IF p_producto_id IS NULL OR p_almacen_id IS NULL OR p_minimo IS NULL OR p_minimo<=0 THEN
    RAISE EXCEPTION 'Producto, almacén y mínimo válido son obligatorios.' USING ERRCODE='22023';
  END IF;

  SELECT v.producto_padre_id INTO v_parent_id
  FROM public.productos v
  JOIN public.productos p ON p.id=v.producto_padre_id
  WHERE v.id=p_producto_id AND v.activo=true
    AND p.inventario_mixto=true AND p.activo=true
  FOR SHARE OF v,p;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La variante no existe o no pertenece a un producto con inventario por sabores activo.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.almacenes WHERE id=p_almacen_id AND activo=true) THEN
    RAISE EXCEPTION 'El almacén no existe o está inactivo.' USING ERRCODE='23503';
  END IF;
  UPDATE public.stock SET minimo=p_minimo
  WHERE producto_id=p_producto_id AND almacen_id=p_almacen_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La variante todavía no tiene una asignación de inventario en este almacén.' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.productos_stock_mixto_minimos(producto_id,almacen_id,minimo,updated_at)
  VALUES(p_producto_id,p_almacen_id,p_minimo,now())
  ON CONFLICT(producto_id,almacen_id)
  DO UPDATE SET minimo=EXCLUDED.minimo,updated_at=now();

  RETURN jsonb_build_object('producto_id',p_producto_id,'almacen_id',p_almacen_id,'minimo',p_minimo);
END;
$$;

REVOKE ALL ON FUNCTION public.bc_actualizar_stock_minimo_variante(uuid,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc_actualizar_stock_minimo_variante(uuid,uuid,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.inventario_mixto_enriquecido(p_almacen_id uuid DEFAULT NULL)
RETURNS TABLE(
  producto_id uuid, producto text, almacen text, cantidad numeric, minimo numeric,
  estado text, costo_promedio numeric, valor_inventario numeric, unidad text, variantes jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF NOT public.tiene_permiso('reportes','ver') THEN
    RAISE EXCEPTION 'No tienes permiso para ver inventario.' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT
    p.id,
    p.nombre,
    a.nombre,
    coalesce(sum(coalesce(s.cantidad,0)),0)::numeric,
    coalesce(mm.minimo,0)::numeric,
    CASE
      WHEN bool_or(coalesce(vm.minimo,0)<=0) THEN 'sin_minimo'
      WHEN coalesce(sum(coalesce(s.cantidad,0)),0)<=0 THEN 'agotado'
      WHEN coalesce(mm.minimo,0)>0 AND sum(coalesce(s.cantidad,0))<=mm.minimo THEN 'bajo'
      ELSE 'normal'
    END,
    CASE WHEN sum(coalesce(s.cantidad,0))>0
      THEN coalesce(sum(coalesce(lv.valor_inventario,0))/nullif(sum(coalesce(s.cantidad,0)),0),0)
      ELSE 0 END,
    coalesce(sum(coalesce(lv.valor_inventario,0)),0)::numeric,
    p.unidad,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'producto_id',v.id,
        'nombre',v.variante_nombre,
        'cantidad',coalesce(s.cantidad,0),
        'minimo',coalesce(vm.minimo,0),
        'estado',CASE WHEN coalesce(vm.minimo,0)<=0 THEN 'sin_minimo'
          WHEN coalesce(s.cantidad,0)<=0 THEN 'agotado'
          WHEN coalesce(vm.minimo,0)>0 AND coalesce(s.cantidad,0)<=vm.minimo THEN 'bajo'
          ELSE 'normal' END,
        'unidad',v.unidad,
        'costo_promedio',coalesce(lv.costo_promedio,0),
        'valor_inventario',coalesce(lv.valor_inventario,0)
      ) ORDER BY v.variante_nombre
    ),'[]'::jsonb)
  FROM public.productos p
  JOIN public.almacenes a ON a.activo=true AND (p_almacen_id IS NULL OR a.id=p_almacen_id)
  JOIN public.productos v ON v.producto_padre_id=p.id AND v.activo=true
  LEFT JOIN public.stock s ON s.producto_id=v.id AND s.almacen_id=a.id
  LEFT JOIN public.productos_stock_mixto_minimos mm ON mm.producto_id=p.id AND mm.almacen_id=a.id
  LEFT JOIN public.productos_stock_mixto_minimos vm ON vm.producto_id=v.id AND vm.almacen_id=a.id
  LEFT JOIN LATERAL (
    SELECT
      CASE WHEN sum(l.cantidad_restante)>0
        THEN sum(l.cantidad_restante*l.costo_unitario)/nullif(sum(l.cantidad_restante),0)
        ELSE 0 END AS costo_promedio,
      coalesce(sum(l.cantidad_restante*l.costo_unitario),0) AS valor_inventario
    FROM public.lotes_compra l
    WHERE l.producto_id=v.id AND l.almacen_id=a.id AND l.cantidad_restante>0
  ) lv ON true
  WHERE p.inventario_mixto=true AND p.activo=true
  GROUP BY p.id,p.nombre,a.nombre,mm.minimo
  ORDER BY p.nombre,a.nombre;
END;
$$;

REVOKE ALL ON FUNCTION public.inventario_mixto_enriquecido(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inventario_mixto_enriquecido(uuid) TO authenticated;

COMMIT;
