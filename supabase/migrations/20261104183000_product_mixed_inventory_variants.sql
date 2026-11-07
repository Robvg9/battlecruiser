-- BattleCruiser: optional mixed inventory with admin-defined child product variants.
-- Stock movements, purchase lots, sales and transfers keep using product_id, so each
-- flavor receives an independent stock/FIFO identity without a parallel ledger.
BEGIN;

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS inventario_mixto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS producto_padre_id uuid,
  ADD COLUMN IF NOT EXISTS variante_nombre text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='productos_producto_padre_fk' AND conrelid='public.productos'::regclass) THEN
    ALTER TABLE public.productos
      ADD CONSTRAINT productos_producto_padre_fk
      FOREIGN KEY (producto_padre_id) REFERENCES public.productos(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='productos_variante_shape_check' AND conrelid='public.productos'::regclass) THEN
    ALTER TABLE public.productos
      ADD CONSTRAINT productos_variante_shape_check
      CHECK (
        (producto_padre_id IS NULL AND variante_nombre IS NULL)
        OR
        (producto_padre_id IS NOT NULL AND inventario_mixto = false
          AND nullif(btrim(variante_nombre),'') IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='productos_no_self_parent_check' AND conrelid='public.productos'::regclass) THEN
    ALTER TABLE public.productos
      ADD CONSTRAINT productos_no_self_parent_check
      CHECK (producto_padre_id IS NULL OR producto_padre_id <> id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_productos_producto_padre
  ON public.productos(producto_padre_id) WHERE producto_padre_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_variante_nombre_activa
  ON public.productos(producto_padre_id, lower(btrim(variante_nombre)))
  WHERE producto_padre_id IS NOT NULL AND activo = true;

-- Keep the parent's minimum threshold per warehouse when its stock row is replaced by variants.
CREATE TABLE IF NOT EXISTS public.productos_stock_mixto_minimos (
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id) ON DELETE CASCADE,
  minimo numeric NOT NULL DEFAULT 0 CHECK (minimo >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (producto_id, almacen_id)
);
ALTER TABLE public.productos_stock_mixto_minimos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS productos_stock_mixto_minimos_ver ON public.productos_stock_mixto_minimos;
CREATE POLICY productos_stock_mixto_minimos_ver
  ON public.productos_stock_mixto_minimos FOR SELECT TO authenticated
  USING (
    public.tiene_permiso('stock','ver')
    OR public.tiene_permiso('reportes','ver')
    OR public.tiene_permiso('productos','editar')
  );
REVOKE ALL ON public.productos_stock_mixto_minimos FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.productos_stock_mixto_minimos FROM authenticated;
GRANT SELECT ON public.productos_stock_mixto_minimos TO authenticated;

-- The extra SKU identity fields can only be managed through the authenticated RPC below.
CREATE OR REPLACE FUNCTION public.bc_guard_mixed_product_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_allowed text := current_setting('app.bc_mixed_product_config', true);
BEGIN
  IF v_allowed = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.inventario_mixto OR NEW.producto_padre_id IS NOT NULL OR NEW.variante_nombre IS NOT NULL THEN
      RAISE EXCEPTION 'La configuración de sabores solo puede modificarse desde el administrador de inventario mixto.' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.inventario_mixto IS DISTINCT FROM OLD.inventario_mixto
       OR NEW.producto_padre_id IS DISTINCT FROM OLD.producto_padre_id
       OR NEW.variante_nombre IS DISTINCT FROM OLD.variante_nombre THEN
      RAISE EXCEPTION 'La configuración de sabores solo puede modificarse desde el administrador de inventario mixto.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bc_guard_mixed_product_fields ON public.productos;
CREATE TRIGGER bc_guard_mixed_product_fields
  BEFORE INSERT OR UPDATE ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.bc_guard_mixed_product_fields();

-- A parent or inactive variant can never be mutated as a stock-bearing SKU.
CREATE OR REPLACE FUNCTION public.bc_guard_mixed_stock_sku()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_product public.productos%ROWTYPE;
DECLARE v_parent public.productos%ROWTYPE;
DECLARE v_parent_id uuid;
BEGIN
  -- Read the relationship first, then lock parent before child. Configuration
  -- locks in the same order, so stock writes cannot race mode changes or deadlock
  -- by acquiring a variant before its parent.
  SELECT producto_padre_id INTO v_parent_id
  FROM public.productos WHERE id=NEW.producto_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado.' USING ERRCODE='23503'; END IF;

  IF v_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.productos WHERE id=v_parent_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La variante ya no está disponible para movimientos de inventario.' USING ERRCODE='23514';
    END IF;
    SELECT * INTO v_product FROM public.productos WHERE id=NEW.producto_id FOR SHARE;
    IF NOT FOUND OR v_product.producto_padre_id IS DISTINCT FROM v_parent.id
       OR NOT v_parent.inventario_mixto OR NOT v_parent.activo OR NOT v_product.activo THEN
      RAISE EXCEPTION 'La variante ya no está disponible para movimientos de inventario.' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT * INTO v_product FROM public.productos WHERE id=NEW.producto_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado.' USING ERRCODE='23503'; END IF;
    IF v_product.inventario_mixto THEN
      RAISE EXCEPTION 'Este producto controla existencias por sabor. Selecciona una variante.' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bc_guard_mixed_stock_sku ON public.stock;
CREATE TRIGGER bc_guard_mixed_stock_sku
  BEFORE INSERT OR UPDATE ON public.stock
  FOR EACH ROW EXECUTE FUNCTION public.bc_guard_mixed_stock_sku();

-- Prevent hiding a mixed product while any of its flavors still has stock/FIFO value.
CREATE OR REPLACE FUNCTION public.bc_guard_mixed_product_deactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF OLD.producto_padre_id IS NULL AND OLD.inventario_mixto THEN
    IF NEW.unidad IS DISTINCT FROM OLD.unidad AND (
      EXISTS (
        SELECT 1 FROM public.stock s
        JOIN public.productos v ON v.id=s.producto_id
        WHERE v.producto_padre_id=OLD.id AND s.cantidad<>0
      ) OR EXISTS (
        SELECT 1 FROM public.lotes_compra l
        JOIN public.productos v ON v.id=l.producto_id
        WHERE v.producto_padre_id=OLD.id AND l.cantidad_restante>0
      )
    ) THEN
      RAISE EXCEPTION 'No se puede cambiar la unidad base: una o más variantes conservan existencias o lotes pendientes.' USING ERRCODE='23514';
    END IF;
    IF OLD.activo AND NOT NEW.activo THEN
      RAISE EXCEPTION 'Desactiva primero el inventario por sabores y deja todas las variantes sin existencias ni lotes pendientes.' USING ERRCODE='23514';
    END IF;
  ELSIF OLD.producto_padre_id IS NOT NULL AND OLD.activo AND NOT NEW.activo THEN
    IF EXISTS (
      SELECT 1 FROM public.stock s
      WHERE s.producto_id=OLD.id AND s.cantidad<>0
    ) OR EXISTS (
      SELECT 1 FROM public.lotes_compra l
      WHERE l.producto_id=OLD.id AND l.cantidad_restante>0
    ) THEN
      RAISE EXCEPTION 'No se puede desactivar este sabor mientras conserve existencias o lotes pendientes.' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bc_guard_mixed_product_deactivation ON public.productos;
CREATE TRIGGER bc_guard_mixed_product_deactivation
  BEFORE UPDATE OF activo, unidad ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.bc_guard_mixed_product_deactivation();

-- Parent metadata changes are reflected in each flavor's product display without
-- changing the flavor name/ID used by historical transaction lines.
CREATE OR REPLACE FUNCTION public.bc_sync_mixed_variant_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF NEW.producto_padre_id IS NULL THEN
    UPDATE public.productos v
    SET nombre=NEW.nombre || ' · ' || v.variante_nombre,
        categoria_id=NEW.categoria_id,
        unidad=NEW.unidad,
        precio_normal=NEW.precio_normal,
        precio_mayorista=NEW.precio_mayorista,
        presentacion_id=NEW.presentacion_id,
        imagen_url=NEW.imagen_url
    WHERE v.producto_padre_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bc_sync_mixed_variant_metadata ON public.productos;
CREATE TRIGGER bc_sync_mixed_variant_metadata
  AFTER UPDATE OF nombre,categoria_id,unidad,precio_normal,precio_mayorista,presentacion_id,imagen_url
  ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.bc_sync_mixed_variant_metadata();

-- Mirror the parent's presentation conversions so a flavor can be purchased in
-- the same boxes/packs and converted to the same base unit.
CREATE OR REPLACE FUNCTION public.bc_sync_mixed_variant_presentations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_parent_id uuid;
DECLARE v_variant record;
DECLARE v_presentacion_id uuid;
BEGIN
  v_parent_id := CASE WHEN TG_OP='DELETE' THEN OLD.producto_id ELSE NEW.producto_id END;
  IF TG_OP='UPDATE' AND OLD.producto_id IS DISTINCT FROM NEW.producto_id THEN
    FOR v_variant IN SELECT id FROM public.productos WHERE producto_padre_id=OLD.producto_id LOOP
      DELETE FROM public.producto_presentaciones
      WHERE producto_id=v_variant.id AND presentacion_id=OLD.presentacion_id;
    END LOOP;
  END IF;
  IF TG_OP='DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.productos WHERE id=v_parent_id AND inventario_mixto) THEN
      FOR v_variant IN SELECT id FROM public.productos WHERE producto_padre_id=v_parent_id LOOP
        DELETE FROM public.producto_presentaciones
        WHERE producto_id=v_variant.id AND presentacion_id=OLD.presentacion_id;
      END LOOP;
    END IF;
    RETURN OLD;
  END IF;

  IF EXISTS (SELECT 1 FROM public.productos WHERE id=NEW.producto_id AND inventario_mixto) THEN
    IF TG_OP='UPDATE' AND OLD.presentacion_id IS DISTINCT FROM NEW.presentacion_id THEN
      FOR v_variant IN SELECT id FROM public.productos WHERE producto_padre_id=NEW.producto_id LOOP
        DELETE FROM public.producto_presentaciones
        WHERE producto_id=v_variant.id AND presentacion_id=OLD.presentacion_id;
      END LOOP;
    END IF;
    FOR v_variant IN SELECT id FROM public.productos WHERE producto_padre_id=NEW.producto_id LOOP
      UPDATE public.producto_presentaciones
      SET factor=NEW.factor, activo=NEW.activo
      WHERE producto_id=v_variant.id AND presentacion_id=NEW.presentacion_id;
      IF NOT FOUND THEN
        INSERT INTO public.producto_presentaciones(producto_id,presentacion_id,factor,activo)
        VALUES(v_variant.id,NEW.presentacion_id,NEW.factor,NEW.activo);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bc_sync_mixed_variant_presentations ON public.producto_presentaciones;
CREATE TRIGGER bc_sync_mixed_variant_presentations
  AFTER INSERT OR UPDATE OR DELETE ON public.producto_presentaciones
  FOR EACH ROW EXECUTE FUNCTION public.bc_sync_mixed_variant_presentations();

-- Admin-only atomic configuration for a mixed parent and its named flavor SKUs.
CREATE OR REPLACE FUNCTION public.configurar_producto_inventario_mixto(
  p_producto_id uuid,
  p_habilitar boolean,
  p_variantes jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_parent public.productos%ROWTYPE;
  v_item jsonb;
  v_variant_id uuid;
  v_nombre text;
  v_keep_ids uuid[] := ARRAY[]::uuid[];
  v_count integer := 0;
  v_new boolean;
  v_warehouse record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  IF NOT public.bc_actor_is_admin() OR NOT public.tiene_permiso('productos','editar') THEN
    RAISE EXCEPTION 'Solo el administrador puede configurar el inventario por sabores.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_parent FROM public.productos WHERE id=p_producto_id AND producto_padre_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto principal no encontrado.' USING ERRCODE='P0002'; END IF;

  PERFORM set_config('app.bc_mixed_product_config','on',true);

  IF coalesce(p_habilitar,false)=false THEN
    IF EXISTS (
      SELECT 1 FROM public.stock s JOIN public.productos v ON v.id=s.producto_id
      WHERE v.producto_padre_id=p_producto_id AND s.cantidad<>0
    ) OR EXISTS (
      SELECT 1 FROM public.lotes_compra l JOIN public.productos v ON v.id=l.producto_id
      WHERE v.producto_padre_id=p_producto_id AND l.cantidad_restante>0
    ) THEN
      RAISE EXCEPTION 'Antes de desactivar el inventario mixto, todas las variantes deben quedar sin existencias ni lotes pendientes.' USING ERRCODE='23514';
    END IF;
    UPDATE public.productos SET inventario_mixto=false WHERE id=p_producto_id;
    INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
    SELECT p_producto_id,m.almacen_id,0,m.minimo
    FROM public.productos_stock_mixto_minimos m
    WHERE m.producto_id=p_producto_id
    ON CONFLICT (producto_id,almacen_id) DO UPDATE SET minimo=EXCLUDED.minimo,updated_at=now();
    UPDATE public.productos SET activo=false WHERE producto_padre_id=p_producto_id;
    DELETE FROM public.stock s USING public.productos v
    WHERE v.id=s.producto_id AND v.producto_padre_id=p_producto_id AND s.cantidad=0;
    DELETE FROM public.productos_stock_mixto_minimos WHERE producto_id=p_producto_id;
    RETURN jsonb_build_object('producto_id',p_producto_id,'inventario_mixto',false,'variantes_activas',0);
  END IF;

  IF p_variantes IS NULL OR jsonb_typeof(p_variantes)<>'array' OR jsonb_array_length(p_variantes)=0 THEN
    RAISE EXCEPTION 'Añade al menos un sabor o variante antes de activar el inventario mixto.' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_variantes)>80 THEN
    RAISE EXCEPTION 'Un producto puede tener como máximo 80 variantes.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_variantes) x
    GROUP BY lower(btrim(coalesce(x.value->>'nombre','')))
    HAVING lower(btrim(coalesce(x.value->>'nombre','')))='' OR count(*)>1
  ) THEN
    RAISE EXCEPTION 'Los nombres de sabores son obligatorios y no pueden repetirse.' USING ERRCODE='22023';
  END IF;

  -- A previously stocked generic SKU cannot silently become an unspecified flavor.
  IF EXISTS (SELECT 1 FROM public.stock WHERE producto_id=p_producto_id AND cantidad<>0)
     OR EXISTS (SELECT 1 FROM public.lotes_compra WHERE producto_id=p_producto_id AND cantidad_restante>0) THEN
    RAISE EXCEPTION 'Este producto todavía tiene stock o lotes abiertos. Vacía su stock genérico antes de activar sabores; no se repartirá automáticamente.' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.productos_stock_mixto_minimos(producto_id,almacen_id,minimo)
  SELECT p_producto_id,s.almacen_id,coalesce(s.minimo,0)
  FROM public.stock s WHERE s.producto_id=p_producto_id
  ON CONFLICT (producto_id,almacen_id) DO UPDATE SET minimo=EXCLUDED.minimo,updated_at=now();

  UPDATE public.productos SET inventario_mixto=true WHERE id=p_producto_id;
  DELETE FROM public.stock WHERE producto_id=p_producto_id AND cantidad=0;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_variantes) LOOP
    v_nombre := nullif(btrim(v_item->>'nombre'),'');
    IF v_nombre IS NULL OR length(v_nombre)>80 THEN
      RAISE EXCEPTION 'Cada sabor necesita un nombre de 1 a 80 caracteres.' USING ERRCODE='22023';
    END IF;
    v_variant_id := nullif(v_item->>'id','')::uuid;
    IF v_variant_id IS NOT NULL THEN
      PERFORM 1 FROM public.productos WHERE id=v_variant_id AND producto_padre_id=p_producto_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Una variante enviada no pertenece a este producto.' USING ERRCODE='22023'; END IF;
    ELSE
      SELECT id INTO v_variant_id FROM public.productos
      WHERE producto_padre_id=p_producto_id AND lower(variante_nombre)=lower(v_nombre)
      LIMIT 1 FOR UPDATE;
    END IF;

    IF v_variant_id IS NULL THEN
      INSERT INTO public.productos(
        nombre,categoria_id,unidad,precio_normal,precio_mayorista,activo,presentacion_id,imagen_url,
        inventario_mixto,producto_padre_id,variante_nombre
      )
      VALUES(
        v_parent.nombre || ' · ' || v_nombre,v_parent.categoria_id,v_parent.unidad,
        v_parent.precio_normal,v_parent.precio_mayorista,true,v_parent.presentacion_id,v_parent.imagen_url,
        false,p_producto_id,v_nombre
      ) RETURNING id INTO v_variant_id;
      INSERT INTO public.producto_presentaciones(producto_id,presentacion_id,factor,activo)
      SELECT v_variant_id,pp.presentacion_id,pp.factor,pp.activo
      FROM public.producto_presentaciones pp
      WHERE pp.producto_id=p_producto_id;
    ELSE
      UPDATE public.productos
      SET nombre=v_parent.nombre || ' · ' || v_nombre,
          variante_nombre=v_nombre,
          categoria_id=v_parent.categoria_id,
          unidad=v_parent.unidad,
          precio_normal=v_parent.precio_normal,
          precio_mayorista=v_parent.precio_mayorista,
          presentacion_id=v_parent.presentacion_id,
          imagen_url=v_parent.imagen_url,
          activo=true
      WHERE id=v_variant_id;
    END IF;

    v_keep_ids := array_append(v_keep_ids,v_variant_id);
    v_count := v_count+1;
    INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
    SELECT v_variant_id,a.id,0,0 FROM public.almacenes a WHERE a.activo=true
    ON CONFLICT (producto_id,almacen_id) DO NOTHING;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.productos v
    WHERE v.producto_padre_id=p_producto_id AND v.activo=true
      AND NOT (v.id = ANY(v_keep_ids))
      AND (
        EXISTS (SELECT 1 FROM public.stock s WHERE s.producto_id=v.id AND s.cantidad<>0)
        OR EXISTS (SELECT 1 FROM public.lotes_compra l WHERE l.producto_id=v.id AND l.cantidad_restante>0)
      )
  ) THEN
    RAISE EXCEPTION 'No puedes quitar una variante que todavía conserva stock o lotes pendientes.' USING ERRCODE='23514';
  END IF;

  UPDATE public.productos v SET activo=false
  WHERE v.producto_padre_id=p_producto_id AND v.activo=true
    AND NOT (v.id = ANY(v_keep_ids));
  DELETE FROM public.stock s USING public.productos v
  WHERE v.id=s.producto_id AND v.producto_padre_id=p_producto_id AND v.activo=false AND s.cantidad=0;

  RETURN jsonb_build_object(
    'producto_id',p_producto_id,'inventario_mixto',true,
    'variantes_activas',v_count,'variante_ids',to_jsonb(v_keep_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.configurar_producto_inventario_mixto(uuid,boolean,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configurar_producto_inventario_mixto(uuid,boolean,jsonb) TO authenticated;

-- Warehouses created after a mixed product also get zero-stock rows for all active flavors.
CREATE OR REPLACE FUNCTION public.bc_seed_mixed_stock_for_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF NEW.activo THEN
    INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
    SELECT v.id,NEW.id,0,0
    FROM public.productos p
    JOIN public.productos v ON v.producto_padre_id=p.id AND v.activo=true
    WHERE p.inventario_mixto AND p.activo=true
    ON CONFLICT (producto_id,almacen_id) DO NOTHING;
    INSERT INTO public.productos_stock_mixto_minimos(producto_id,almacen_id,minimo)
    SELECT p.id,NEW.id,0 FROM public.productos p WHERE p.inventario_mixto AND p.activo=true
    ON CONFLICT (producto_id,almacen_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bc_seed_mixed_stock_for_warehouse ON public.almacenes;
CREATE TRIGGER bc_seed_mixed_stock_for_warehouse
  AFTER INSERT OR UPDATE OF activo ON public.almacenes
  FOR EACH ROW EXECUTE FUNCTION public.bc_seed_mixed_stock_for_warehouse();

REVOKE ALL ON FUNCTION public.bc_guard_mixed_product_fields() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc_guard_mixed_stock_sku() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc_guard_mixed_product_deactivation() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc_sync_mixed_variant_metadata() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc_sync_mixed_variant_presentations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc_seed_mixed_stock_for_warehouse() FROM PUBLIC, anon;

-- Separate aggregate RPC for the Inventory screen; the legacy function remains unchanged.
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

REVOKE ALL ON FUNCTION public.inventario_mixto_enriquecido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventario_mixto_enriquecido(uuid) TO authenticated;

COMMIT;
