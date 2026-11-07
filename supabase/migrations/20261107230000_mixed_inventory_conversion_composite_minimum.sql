-- BattleCruiser: assisted conversion from generic stock to flavor SKUs,
-- with proportional preservation of every FIFO cost layer and composite minima.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lotes_compra_conversion_mixta (
  lote_origen_id uuid NOT NULL REFERENCES public.lotes_compra(id),
  lote_variante_id uuid NOT NULL REFERENCES public.lotes_compra(id),
  producto_padre_id uuid NOT NULL REFERENCES public.productos(id),
  producto_variante_id uuid NOT NULL REFERENCES public.productos(id),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),
  cantidad_transferida numeric NOT NULL CHECK (cantidad_transferida > 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lote_origen_id,lote_variante_id),
  UNIQUE (lote_variante_id)
);
ALTER TABLE public.lotes_compra_conversion_mixta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lotes_compra_conversion_mixta FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bc_obtener_snapshot_conversion_mixta(p_producto_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $snapshot$
DECLARE v_parent public.productos%ROWTYPE;
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF NOT public.bc_actor_is_admin() OR NOT public.tiene_permiso('productos','editar') THEN
    RAISE EXCEPTION 'Solo el administrador puede preparar la configuración por sabores.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_parent
  FROM public.productos
  WHERE id=p_producto_id AND producto_padre_id IS NULL
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto principal no encontrado.' USING ERRCODE='P0002'; END IF;

  SELECT jsonb_build_object(
    'producto_id',v_parent.id,
    'nombre',v_parent.nombre,
    'inventario_mixto',v_parent.inventario_mixto,
    'almacenes',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'almacen_id',w.id,
        'almacen',w.nombre,
        'activo',w.activo,
        'stock_generico',CASE WHEN v_parent.inventario_mixto THEN 0 ELSE coalesce(ps.cantidad,0) END,
        'lotes_abiertos_genericos',CASE WHEN v_parent.inventario_mixto THEN 0 ELSE coalesce(pl.cantidad_lotes,0) END,
        'cantidad_fifo_generica',CASE WHEN v_parent.inventario_mixto THEN 0 ELSE coalesce(pl.cantidad_fifo,0) END,
        'coherente_fifo',CASE WHEN v_parent.inventario_mixto THEN true ELSE coalesce(ps.cantidad,0)=coalesce(pl.cantidad_fifo,0) END,
        'variantes',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'producto_id',v.id,
            'nombre',v.variante_nombre,
            'cantidad',coalesce(vs.cantidad,0),
            'minimo',coalesce(vs.minimo,0),
            'lotes_abiertos',coalesce(vl.cantidad_lotes,0),
            'cantidad_fifo',coalesce(vl.cantidad_fifo,0)
          ) ORDER BY v.variante_nombre)
          FROM public.productos v
          LEFT JOIN public.stock vs ON vs.producto_id=v.id AND vs.almacen_id=w.id
          LEFT JOIN LATERAL (
            SELECT count(*) AS cantidad_lotes,coalesce(sum(l.cantidad_restante),0) AS cantidad_fifo
            FROM public.lotes_compra l
            WHERE l.producto_id=v.id AND l.almacen_id=w.id AND l.cantidad_restante>0
          ) vl ON true
          WHERE v.producto_padre_id=v_parent.id AND v.activo=true
        ),'[]'::jsonb)
      ) ORDER BY w.nombre)
      FROM (
        SELECT a.id,a.nombre,a.activo
        FROM public.almacenes a
        WHERE a.activo=true
          OR EXISTS(SELECT 1 FROM public.stock s WHERE s.producto_id=v_parent.id AND s.almacen_id=a.id)
          OR EXISTS(SELECT 1 FROM public.lotes_compra l WHERE l.producto_id=v_parent.id AND l.almacen_id=a.id AND l.cantidad_restante>0)
          OR EXISTS(SELECT 1 FROM public.productos v JOIN public.stock s ON s.producto_id=v.id WHERE v.producto_padre_id=v_parent.id AND s.almacen_id=a.id)
          OR EXISTS(SELECT 1 FROM public.productos v JOIN public.lotes_compra l ON l.producto_id=v.id WHERE v.producto_padre_id=v_parent.id AND l.almacen_id=a.id AND l.cantidad_restante>0)
      ) w
      LEFT JOIN public.stock ps ON ps.producto_id=v_parent.id AND ps.almacen_id=w.id
      LEFT JOIN LATERAL (
        SELECT count(*) AS cantidad_lotes,coalesce(sum(l.cantidad_restante),0) AS cantidad_fifo
        FROM public.lotes_compra l
        WHERE l.producto_id=v_parent.id AND l.almacen_id=w.id AND l.cantidad_restante>0
      ) pl ON true
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$snapshot$;

CREATE OR REPLACE FUNCTION public.configurar_producto_inventario_mixto_con_asignaciones(
  p_producto_id uuid,
  p_habilitar boolean,
  p_variantes jsonb DEFAULT '[]'::jsonb,
  p_asignaciones jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $mixed$
DECLARE
  v_parent public.productos%ROWTYPE;
  v_item jsonb;
  v_assignment jsonb;
  v_variant jsonb;
  v_variant_id uuid;
  v_nombre text;
  v_parent_stock numeric;
  v_fifo_stock numeric;
  v_assignment_total numeric;
  v_variant_qty numeric;
  v_variant_min numeric;
  v_source_lot record;
  v_new_lot_id uuid;
  v_take numeric;
  v_row_allocated numeric;
  v_keep_ids uuid[] := ARRAY[]::uuid[];
  v_count integer := 0;
  v_assignment_count integer := 0;
  v_variant_count integer := 0;
  v_index integer := 0;
  v_variant_index integer := 0;
  v_lot_index integer := 0;
  v_lot_count integer := 0;
  v_allocated_for_variant numeric := 0;
  v_warehouse record;
  v_warehouse_ids uuid[] := ARRAY[]::uuid[];
  v_variant_ids uuid[] := ARRAY[]::uuid[];
  v_qty_by_variant jsonb;
  v_mixed_before boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  IF NOT public.bc_actor_is_admin() OR NOT public.tiene_permiso('productos','editar') THEN
    RAISE EXCEPTION 'Solo el administrador puede configurar el inventario por sabores.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_parent
  FROM public.productos
  WHERE id=p_producto_id AND producto_padre_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto principal no encontrado.' USING ERRCODE='P0002'; END IF;

  IF coalesce(p_habilitar,false)=false THEN
    RETURN public.configurar_producto_inventario_mixto(p_producto_id,false,'[]'::jsonb);
  END IF;

  IF p_variantes IS NULL OR jsonb_typeof(p_variantes)<>'array' OR jsonb_array_length(p_variantes)=0 THEN
    RAISE EXCEPTION 'Añade al menos un sabor o variante antes de activar el inventario mixto.' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_variantes)>80 THEN
    RAISE EXCEPTION 'Un producto puede tener como máximo 80 variantes.' USING ERRCODE='22023';
  END IF;
  IF p_asignaciones IS NULL OR jsonb_typeof(p_asignaciones)<>'array' THEN
    RAISE EXCEPTION 'No se recibieron las cantidades y mínimos por almacén.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_variantes) x
    GROUP BY lower(btrim(coalesce(x.value->>'nombre','')))
    HAVING lower(btrim(coalesce(x.value->>'nombre','')))='' OR count(*)>1
  ) THEN
    RAISE EXCEPTION 'Los nombres de sabores son obligatorios y no pueden repetirse.' USING ERRCODE='22023';
  END IF;

  PERFORM set_config('app.bc_mixed_product_config','on',true);
  v_mixed_before := coalesce(v_parent.inventario_mixto,false);

  -- An already mixed product can be renamed and have minimums updated, but its
  -- physical quantities are immutable through this configuration screen.
  IF v_mixed_before THEN
    PERFORM public.configurar_producto_inventario_mixto(p_producto_id,true,p_variantes);
    SELECT array_agg(id ORDER BY id) INTO v_variant_ids
    FROM public.productos WHERE producto_padre_id=p_producto_id AND activo=true;
    SELECT array_agg(id ORDER BY id) INTO v_warehouse_ids
    FROM (
      SELECT a.id FROM public.almacenes a WHERE a.activo=true
      UNION
      SELECT s.almacen_id FROM public.stock s JOIN public.productos v ON v.id=s.producto_id
      WHERE v.producto_padre_id=p_producto_id
      UNION
      SELECT l.almacen_id FROM public.lotes_compra l JOIN public.productos v ON v.id=l.producto_id
      WHERE v.producto_padre_id=p_producto_id AND l.cantidad_restante>0
    ) q;
    IF coalesce(array_length(v_warehouse_ids,1),0)<>jsonb_array_length(p_asignaciones) THEN
      RAISE EXCEPTION 'La configuración debe incluir todos los almacenes activos o con existencias.' USING ERRCODE='22023';
    END IF;
    FOR v_assignment IN SELECT value FROM jsonb_array_elements(p_asignaciones) LOOP
      IF (SELECT count(*) FROM jsonb_array_elements(p_asignaciones) x
          WHERE nullif(x.value->>'almacen_id','')::uuid=nullif(v_assignment->>'almacen_id','')::uuid)<>1 THEN
        RAISE EXCEPTION 'Hay almacenes repetidos en la asignación.' USING ERRCODE='22023';
      END IF;
      IF NOT (nullif(v_assignment->>'almacen_id','')::uuid=ANY(v_warehouse_ids)) THEN
        RAISE EXCEPTION 'La asignación contiene un almacén que no pertenece al producto.' USING ERRCODE='22023';
      END IF;
      IF jsonb_typeof(v_assignment->'variantes')<>'array'
         OR jsonb_array_length(v_assignment->'variantes')<>coalesce(array_length(v_variant_ids,1),0)
         OR (SELECT count(DISTINCT lower(btrim(coalesce(x.value->>'nombre','')))) FROM jsonb_array_elements(v_assignment->'variantes') x)<>coalesce(array_length(v_variant_ids,1),0) THEN
        RAISE EXCEPTION 'Cada almacén necesita un mínimo para todos sus sabores.' USING ERRCODE='22023';
      END IF;
      FOR v_variant IN SELECT value FROM jsonb_array_elements(v_assignment->'variantes') LOOP
        v_nombre:=nullif(btrim(v_variant->>'nombre'),'');
        SELECT id INTO v_variant_id FROM public.productos
        WHERE producto_padre_id=p_producto_id AND activo=true AND lower(variante_nombre)=lower(v_nombre)
        LIMIT 1;
        IF v_variant_id IS NULL THEN RAISE EXCEPTION 'No se encontró el sabor % en este producto.',v_nombre USING ERRCODE='22023'; END IF;
        SELECT coalesce(cantidad,0) INTO v_parent_stock FROM public.stock
        WHERE producto_id=v_variant_id AND almacen_id=nullif(v_assignment->>'almacen_id','')::uuid;
        IF NOT FOUND THEN v_parent_stock:=0; END IF;
        v_variant_qty:=nullif(v_variant->>'cantidad','')::numeric;
        v_variant_min:=nullif(v_variant->>'minimo','')::numeric;
        IF v_variant_qty IS NULL OR v_variant_qty<0 OR v_variant_qty::text IN ('NaN','Infinity','-Infinity')
           OR v_variant_qty IS DISTINCT FROM v_parent_stock THEN
          RAISE EXCEPTION 'La cantidad existente del sabor % cambió. Actualiza el catálogo y vuelve a revisar.',v_nombre USING ERRCODE='40001';
        END IF;
        IF v_variant_min IS NULL OR v_variant_min<=0 OR v_variant_min::text IN ('NaN','Infinity','-Infinity') THEN
          RAISE EXCEPTION 'Define un mínimo mayor que cero para % en cada almacén.',v_nombre USING ERRCODE='22023';
        END IF;
        UPDATE public.stock SET minimo=v_variant_min,updated_at=now()
        WHERE producto_id=v_variant_id AND almacen_id=nullif(v_assignment->>'almacen_id','')::uuid;
        IF NOT FOUND THEN
          INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
          VALUES(v_variant_id,nullif(v_assignment->>'almacen_id','')::uuid,0,v_variant_min);
        END IF;
        INSERT INTO public.productos_stock_mixto_minimos(producto_id,almacen_id,minimo,updated_at)
        VALUES(v_variant_id,nullif(v_assignment->>'almacen_id','')::uuid,v_variant_min,now())
        ON CONFLICT(producto_id,almacen_id) DO UPDATE SET minimo=EXCLUDED.minimo,updated_at=now();
      END LOOP;
    END LOOP;
    IF EXISTS(SELECT 1 FROM public.stock WHERE producto_id=p_producto_id AND cantidad<>0)
       OR EXISTS(SELECT 1 FROM public.lotes_compra WHERE producto_id=p_producto_id AND cantidad_restante>0) THEN
      RAISE EXCEPTION 'El producto mixto todavía conserva existencias genéricas o lotes FIFO sin clasificar.' USING ERRCODE='23514';
    END IF;
    DELETE FROM public.stock WHERE producto_id=p_producto_id AND cantidad=0;
    DELETE FROM public.productos_stock_mixto_minimos WHERE producto_id=p_producto_id;
    RETURN jsonb_build_object('producto_id',p_producto_id,'inventario_mixto',true,'variantes_activas',coalesce(array_length(v_variant_ids,1),0),'asignaciones_actualizadas',true);
  END IF;

  -- First conversion: active warehouses plus any warehouse that still has a
  -- generic stock row or an open generic FIFO layer must be explicitly covered.
  SELECT array_agg(id ORDER BY id) INTO v_warehouse_ids
  FROM (
    SELECT a.id FROM public.almacenes a WHERE a.activo=true
    UNION
    SELECT s.almacen_id FROM public.stock s WHERE s.producto_id=p_producto_id
    UNION
    SELECT l.almacen_id FROM public.lotes_compra l WHERE l.producto_id=p_producto_id AND l.cantidad_restante>0
  ) q;
  IF coalesce(array_length(v_warehouse_ids,1),0)<>jsonb_array_length(p_asignaciones) THEN
    RAISE EXCEPTION 'Debes revisar y asignar cantidades y mínimos en todos los almacenes activos o con inventario del producto.' USING ERRCODE='22023';
  END IF;
  FOR v_assignment IN SELECT value FROM jsonb_array_elements(p_asignaciones) LOOP
    IF nullif(v_assignment->>'almacen_id','') IS NULL
       OR (SELECT count(*) FROM jsonb_array_elements(p_asignaciones) x
           WHERE nullif(x.value->>'almacen_id','')::uuid=nullif(v_assignment->>'almacen_id','')::uuid)<>1 THEN
      RAISE EXCEPTION 'Hay almacenes vacíos o repetidos en la asignación.' USING ERRCODE='22023';
    END IF;
    IF NOT (nullif(v_assignment->>'almacen_id','')::uuid=ANY(v_warehouse_ids)) THEN
      RAISE EXCEPTION 'La asignación contiene un almacén que no pertenece al producto.' USING ERRCODE='22023';
    END IF;
    IF jsonb_typeof(v_assignment->'variantes')<>'array'
       OR jsonb_array_length(v_assignment->'variantes')<>jsonb_array_length(p_variantes)
       OR (SELECT count(DISTINCT lower(btrim(coalesce(x.value->>'nombre','')))) FROM jsonb_array_elements(v_assignment->'variantes') x)<>jsonb_array_length(p_variantes) THEN
      RAISE EXCEPTION 'Cada almacén necesita cantidad y mínimo para cada sabor.' USING ERRCODE='22023';
    END IF;
    SELECT coalesce(s.cantidad,0) INTO v_parent_stock
    FROM public.stock s
    WHERE s.producto_id=p_producto_id AND s.almacen_id=nullif(v_assignment->>'almacen_id','')::uuid
    FOR UPDATE;
    IF NOT FOUND THEN v_parent_stock:=0; END IF;

    PERFORM 1 FROM public.lotes_compra l
    WHERE l.producto_id=p_producto_id AND l.almacen_id=nullif(v_assignment->>'almacen_id','')::uuid
      AND l.cantidad_restante>0
    FOR UPDATE;
    SELECT count(*),coalesce(sum(l.cantidad_restante),0)
    INTO v_assignment_count,v_fifo_stock
    FROM public.lotes_compra l
    WHERE l.producto_id=p_producto_id AND l.almacen_id=nullif(v_assignment->>'almacen_id','')::uuid
      AND l.cantidad_restante>0;
    IF v_parent_stock IS DISTINCT FROM v_fifo_stock THEN
      RAISE EXCEPTION 'No se puede convertir %: stock genérico % y capas FIFO abiertas % no coinciden en el almacén. Primero hay que reconciliar ese inventario.',v_parent.nombre,v_parent_stock,v_fifo_stock USING ERRCODE='23514';
    END IF;

    v_assignment_total:=0;
    FOR v_variant IN SELECT value FROM jsonb_array_elements(v_assignment->'variantes') LOOP
      v_nombre:=nullif(btrim(v_variant->>'nombre'),'');
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_variantes) x WHERE lower(btrim(x.value->>'nombre'))=lower(v_nombre)) THEN
        RAISE EXCEPTION 'Hay una fila de asignación cuyo sabor no coincide con el editor.' USING ERRCODE='22023';
      END IF;
      v_variant_qty:=nullif(v_variant->>'cantidad','')::numeric;
      v_variant_min:=nullif(v_variant->>'minimo','')::numeric;
      IF v_variant_qty IS NULL OR v_variant_qty<0 OR v_variant_qty::text IN ('NaN','Infinity','-Infinity') THEN
        RAISE EXCEPTION 'Indica una cantidad válida para el sabor %.',v_nombre USING ERRCODE='22023';
      END IF;
      IF v_variant_min IS NULL OR v_variant_min<=0 OR v_variant_min::text IN ('NaN','Infinity','-Infinity') THEN
        RAISE EXCEPTION 'El mínimo de % debe ser mayor que cero en cada almacén.',v_nombre USING ERRCODE='22023';
      END IF;
      v_assignment_total:=v_assignment_total+v_variant_qty;
    END LOOP;
    IF v_assignment_total IS DISTINCT FROM v_parent_stock THEN
      RAISE EXCEPTION 'La suma de los sabores (%) debe coincidir exactamente con el stock actual del almacén (%).',v_assignment_total,v_parent_stock USING ERRCODE='23514';
    END IF;
  END LOOP;

  -- Resolve/create the flavor SKUs before moving any stock or FIFO layer.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_variantes) LOOP
    v_nombre:=nullif(btrim(v_item->>'nombre'),'');
    IF v_nombre IS NULL OR length(v_nombre)>80 THEN
      RAISE EXCEPTION 'Cada sabor necesita un nombre de 1 a 80 caracteres.' USING ERRCODE='22023';
    END IF;
    v_variant_id:=nullif(v_item->>'id','')::uuid;
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
      FROM public.producto_presentaciones pp WHERE pp.producto_id=p_producto_id;
    ELSE
      IF EXISTS(SELECT 1 FROM public.stock WHERE producto_id=v_variant_id AND cantidad<>0)
         OR EXISTS(SELECT 1 FROM public.lotes_compra WHERE producto_id=v_variant_id AND cantidad_restante>0) THEN
        RAISE EXCEPTION 'El sabor % ya conserva inventario propio. Debe revisarse antes de convertir el producto padre.',v_nombre USING ERRCODE='23514';
      END IF;
      UPDATE public.productos
      SET nombre=v_parent.nombre || ' · ' || v_nombre,variante_nombre=v_nombre,
          categoria_id=v_parent.categoria_id,unidad=v_parent.unidad,
          precio_normal=v_parent.precio_normal,precio_mayorista=v_parent.precio_mayorista,
          presentacion_id=v_parent.presentacion_id,imagen_url=v_parent.imagen_url,activo=true
      WHERE id=v_variant_id;
    END IF;
    v_keep_ids:=array_append(v_keep_ids,v_variant_id);
    v_variant_ids:=array_append(v_variant_ids,v_variant_id);
    v_count:=v_count+1;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.productos v
    WHERE v.producto_padre_id=p_producto_id AND v.activo=true
      AND NOT (v.id=ANY(v_keep_ids))
      AND (
        EXISTS(SELECT 1 FROM public.stock s WHERE s.producto_id=v.id AND s.cantidad<>0)
        OR EXISTS(SELECT 1 FROM public.lotes_compra l WHERE l.producto_id=v.id AND l.cantidad_restante>0)
      )
  ) THEN
    RAISE EXCEPTION 'No puedes quitar una variante que todavía conserva stock o lotes pendientes.' USING ERRCODE='23514';
  END IF;

  UPDATE public.productos SET inventario_mixto=true WHERE id=p_producto_id;

  -- Spread every source cost layer across flavors in the same proportion as
  -- their manually confirmed quantities. This preserves total value and the
  -- original FIFO layer sequence without pretending a generic purchase named
  -- a particular flavor. All source lots and mappings are written atomically.
  FOR v_assignment IN SELECT value FROM jsonb_array_elements(p_asignaciones) LOOP
    SELECT coalesce(sum((x.value->>'cantidad')::numeric),0)
    INTO v_parent_stock
    FROM jsonb_array_elements(v_assignment->'variantes') x;
    SELECT count(*) INTO v_lot_count
    FROM public.lotes_compra
    WHERE producto_id=p_producto_id AND almacen_id=nullif(v_assignment->>'almacen_id','')::uuid
      AND cantidad_restante>0;

    v_variant_index:=0;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_assignment->'variantes') LOOP
      v_variant_index:=v_variant_index+1;
      v_allocated_for_variant:=0;
      v_lot_index:=0;
      v_nombre:=nullif(btrim(v_item->>'nombre'),'');
      SELECT id INTO v_variant_id FROM public.productos
      WHERE producto_padre_id=p_producto_id AND activo=true AND lower(variante_nombre)=lower(v_nombre)
      LIMIT 1;
      v_variant_qty:=(v_item->>'cantidad')::numeric;
      v_variant_min:=(v_item->>'minimo')::numeric;

      IF v_parent_stock>0 THEN
        FOR v_source_lot IN
          SELECT id,cantidad_restante,cantidad_inicial,costo_unitario,fecha_compra,origen,usuario_id,compra_id
          FROM public.lotes_compra
          WHERE producto_id=p_producto_id AND almacen_id=nullif(v_assignment->>'almacen_id','')::uuid
            AND cantidad_restante>0
          ORDER BY fecha_compra,id
          FOR UPDATE
        LOOP
          v_lot_index:=v_lot_index+1;
          IF v_variant_index < v_count THEN
            -- For every non-final flavor, let the last FIFO layer absorb the
            -- numeric division residue so that the flavor quantity is exact.
            IF v_lot_index=v_lot_count THEN
              v_take:=v_variant_qty-v_allocated_for_variant;
            ELSE
              v_take:=v_source_lot.cantidad_restante*v_variant_qty/v_parent_stock;
            END IF;
            v_allocated_for_variant:=v_allocated_for_variant+v_take;
          ELSE
            -- The final flavor receives each layer's exact remaining balance.
            -- Row totals stay exact, and total assignment equality makes its
            -- overall flavor quantity exact as well.
            SELECT v_source_lot.cantidad_restante-coalesce(sum(m.cantidad_transferida),0)
            INTO v_take
            FROM public.lotes_compra_conversion_mixta m
            WHERE m.lote_origen_id=v_source_lot.id;
          END IF;
          IF v_take<0 OR v_take>v_source_lot.cantidad_restante THEN
            RAISE EXCEPTION 'La distribución proporcional produjo un residuo inválido en una capa FIFO. No se modificó el inventario.' USING ERRCODE='23514';
          END IF;
          IF v_take>0 THEN
            INSERT INTO public.lotes_compra(
              producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario,
              fecha_compra,origen,usuario_id,compra_id
            )
            VALUES(
              v_variant_id,nullif(v_assignment->>'almacen_id','')::uuid,v_take,v_take,
              v_source_lot.costo_unitario,v_source_lot.fecha_compra,'conversion_mixta',
              v_source_lot.usuario_id,v_source_lot.compra_id
            ) RETURNING id INTO v_new_lot_id;
            INSERT INTO public.lotes_compra_conversion_mixta(
              lote_origen_id,lote_variante_id,producto_padre_id,producto_variante_id,almacen_id,cantidad_transferida
            )
            VALUES(
              v_source_lot.id,v_new_lot_id,p_producto_id,v_variant_id,
              nullif(v_assignment->>'almacen_id','')::uuid,v_take
            );
          END IF;
        END LOOP;
      END IF;

      INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo,updated_at)
      SELECT v_variant_id,nullif(v_assignment->>'almacen_id','')::uuid,
        coalesce((
          SELECT sum(l.cantidad_restante) FROM public.lotes_compra l
          JOIN public.lotes_compra_conversion_mixta m ON m.lote_variante_id=l.id
          WHERE m.producto_variante_id=v_variant_id AND m.almacen_id=nullif(v_assignment->>'almacen_id','')::uuid
        ),0),v_variant_min,now()
      ON CONFLICT(producto_id,almacen_id)
      DO UPDATE SET cantidad=EXCLUDED.cantidad,minimo=EXCLUDED.minimo,updated_at=now();

      INSERT INTO public.productos_stock_mixto_minimos(producto_id,almacen_id,minimo,updated_at)
      VALUES(v_variant_id,nullif(v_assignment->>'almacen_id','')::uuid,v_variant_min,now())
      ON CONFLICT(producto_id,almacen_id) DO UPDATE SET minimo=EXCLUDED.minimo,updated_at=now();
    END LOOP;

    -- The source lot remains in the purchase history as the original record,
    -- while its remaining quantity moves to linked flavor lots for FIFO.
    UPDATE public.lotes_compra
    SET cantidad_restante=0
    WHERE producto_id=p_producto_id
      AND almacen_id=nullif(v_assignment->>'almacen_id','')::uuid
      AND cantidad_restante>0;

    DELETE FROM public.stock
    WHERE producto_id=p_producto_id AND almacen_id=nullif(v_assignment->>'almacen_id','')::uuid;
  END LOOP;

  UPDATE public.productos v SET activo=false
  WHERE v.producto_padre_id=p_producto_id AND v.activo=true
    AND NOT (v.id=ANY(v_keep_ids));
  DELETE FROM public.stock s USING public.productos v
  WHERE v.id=s.producto_id AND v.producto_padre_id=p_producto_id AND v.activo=false AND s.cantidad=0;

  -- A flavor-based parent has no independent/global minimum. Its displayed
  -- composite threshold is computed from all child thresholds by warehouse.
  DELETE FROM public.productos_stock_mixto_minimos WHERE producto_id=p_producto_id;

  RETURN jsonb_build_object(
    'producto_id',p_producto_id,'inventario_mixto',true,
    'variantes_activas',v_count,
    'almacenes_configurados',jsonb_array_length(p_asignaciones),
    'stock_generico_convertido',true,
    'fifo_lotes_convertidos',true
  );
END;
$mixed$;

REVOKE ALL ON FUNCTION public.bc_obtener_snapshot_conversion_mixta(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc_obtener_snapshot_conversion_mixta(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.configurar_producto_inventario_mixto_con_asignaciones(uuid,boolean,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.configurar_producto_inventario_mixto_con_asignaciones(uuid,boolean,jsonb,jsonb) TO authenticated;

-- The historical parent purchase is displayed once, with its remaining balance
-- calculated from all linked flavor layers rather than the now-closed source layer.
CREATE OR REPLACE FUNCTION public.historial_compras(
  p_desde date DEFAULT NULL::date,
  p_hasta date DEFAULT NULL::date,
  p_producto_id uuid DEFAULT NULL::uuid,
  p_almacen_id uuid DEFAULT NULL::uuid,
  p_limite integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  lote_id uuid,fecha_compra timestamptz,producto text,almacen text,
  cantidad_inicial numeric,cantidad_restante numeric,costo_unitario numeric,costo_total numeric,estado text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $history$
BEGIN
  IF NOT public.tiene_permiso('reportes','ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE='42501';
  END IF;
  IF p_limite IS NULL OR p_limite>500 OR p_limite<1 THEN p_limite:=100; END IF;
  IF p_offset IS NULL OR p_offset<0 THEN p_offset:=0; END IF;

  RETURN QUERY
  SELECT
    lc.id,lc.fecha_compra,coalesce(vp.nombre,p.nombre),a.nombre,lc.cantidad_inicial,
    CASE WHEN coalesce(map.cantidad_mapeada,0)>0 THEN map.cantidad_restante ELSE lc.cantidad_restante END,
    lc.costo_unitario,lc.cantidad_inicial*lc.costo_unitario,
    CASE
      WHEN (CASE WHEN coalesce(map.cantidad_mapeada,0)>0 THEN map.cantidad_restante ELSE lc.cantidad_restante END)=0 THEN 'agotado'
      WHEN (CASE WHEN coalesce(map.cantidad_mapeada,0)>0 THEN map.cantidad_restante ELSE lc.cantidad_restante END)<lc.cantidad_inicial THEN 'parcial'
      ELSE 'disponible'
    END
  FROM public.lotes_compra lc
  JOIN public.productos p ON p.id=lc.producto_id
  JOIN public.almacenes a ON a.id=lc.almacen_id
  LEFT JOIN public.productos vp ON vp.id=p_producto_id AND p_producto_id<>lc.producto_id
  LEFT JOIN LATERAL (
    SELECT sum(m.cantidad_transferida) AS cantidad_mapeada,
           coalesce(sum(vl.cantidad_restante),0) AS cantidad_restante
    FROM public.lotes_compra_conversion_mixta m
    JOIN public.lotes_compra vl ON vl.id=m.lote_variante_id
    WHERE m.lote_origen_id=lc.id
      AND (p_producto_id IS NULL OR p_producto_id=lc.producto_id OR m.producto_variante_id=p_producto_id)
  ) map ON true
  WHERE lc.origen='compra'
    AND (p_desde IS NULL OR (lc.fecha_compra AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (lc.fecha_compra AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR lc.producto_id=p_producto_id
      OR EXISTS(SELECT 1 FROM public.lotes_compra_conversion_mixta m
        WHERE m.lote_origen_id=lc.id AND m.producto_variante_id=p_producto_id))
    AND (p_almacen_id IS NULL OR lc.almacen_id=p_almacen_id)
  ORDER BY lc.fecha_compra DESC,lc.id
  LIMIT p_limite OFFSET p_offset;
END;
$history$;

CREATE OR REPLACE FUNCTION public.historial_premium_detalle(p_tipo text,p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $premium$
DECLARE r jsonb;
BEGIN
  IF NOT public.tiene_permiso('reportes','ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE='42501';
  END IF;

  IF p_tipo='ventas' THEN
    SELECT jsonb_build_object(
      'id',v.id,'fecha',v.fecha,'tipo','Venta','estado',v.estado,'almacen',a.nombre,
      'usuario',coalesce(u.nombre,v.creado_por::text),'resumen','Venta por $'||trim(to_char(v.total,'FM9999999990.00')),
      'total',v.total,
      'lineas',coalesce((SELECT jsonb_agg(jsonb_build_object('producto',p.nombre,'cantidad',vl.cantidad,'precio_unitario',vl.precio_unitario,'subtotal',vl.subtotal)) FROM ventas_lineas vl JOIN productos p ON p.id=vl.producto_id WHERE vl.venta_id=v.id),'[]'::jsonb)
    ) INTO r FROM ventas v LEFT JOIN almacenes a ON a.id=v.almacen_id LEFT JOIN usuarios u ON u.id=v.creado_por WHERE v.id=p_id;
  ELSIF p_tipo='transferencias' THEN
    SELECT jsonb_build_object(
      'id',t.id,'fecha',t.fecha,'tipo','Movimiento interno','estado',t.estado,
      'origen',o.nombre,'destino',d.nombre,'usuario',coalesce(u.nombre,t.creado_por::text),
      'resumen',coalesce(o.nombre,'—')||' → '||coalesce(d.nombre,'—'),
      'lineas',coalesce((SELECT jsonb_agg(jsonb_build_object('producto',p.nombre,'cantidad',tl.cantidad)) FROM transferencias_lineas tl JOIN productos p ON p.id=tl.producto_id WHERE tl.transferencia_id=t.id),'[]'::jsonb)
    ) INTO r FROM transferencias t LEFT JOIN almacenes o ON o.id=t.almacen_origen_id LEFT JOIN almacenes d ON d.id=t.almacen_destino_id LEFT JOIN usuarios u ON u.id=t.creado_por WHERE t.id=p_id;
  ELSIF p_tipo='compras' THEN
    SELECT jsonb_build_object(
      'id',lc.id,'fecha',lc.fecha_compra,'tipo','Compra',
      'estado',CASE WHEN (CASE WHEN coalesce(map.cantidad_mapeada,0)>0 THEN map.cantidad_restante ELSE lc.cantidad_restante END)=0 THEN 'Agotado' WHEN (CASE WHEN coalesce(map.cantidad_mapeada,0)>0 THEN map.cantidad_restante ELSE lc.cantidad_restante END)<lc.cantidad_inicial THEN 'Parcial' ELSE 'Disponible' END,
      'almacen',a.nombre,'usuario',coalesce(c.usuario_nombre,u.nombre,lc.usuario_id::text),'proveedor',c.proveedor,
      'resumen',coalesce(c.proveedor,'Compra')||' · '||p.nombre,
      'producto',p.nombre,'cantidad',lc.cantidad_inicial,'cantidad_restante',CASE WHEN coalesce(map.cantidad_mapeada,0)>0 THEN map.cantidad_restante ELSE lc.cantidad_restante END,
      'costo_unitario',lc.costo_unitario,'costo_total',lc.cantidad_inicial*lc.costo_unitario,
      'asignaciones',coalesce(map.asignaciones,'[]'::jsonb)
    ) INTO r
    FROM lotes_compra lc
    JOIN productos p ON p.id=lc.producto_id
    JOIN almacenes a ON a.id=lc.almacen_id
    LEFT JOIN compras c ON c.id=lc.compra_id
    LEFT JOIN usuarios u ON u.id=lc.usuario_id
    LEFT JOIN LATERAL (
      SELECT sum(m.cantidad_transferida) AS cantidad_mapeada,
        coalesce(sum(vl.cantidad_restante),0) AS cantidad_restante,
        jsonb_agg(jsonb_build_object(
          'producto_id',m.producto_variante_id,'producto',vp.nombre,
          'cantidad_asignada',m.cantidad_transferida,'cantidad_restante',vl.cantidad_restante,
          'costo_unitario',vl.costo_unitario
        ) ORDER BY vp.nombre) AS asignaciones
      FROM lotes_compra_conversion_mixta m
      JOIN lotes_compra vl ON vl.id=m.lote_variante_id
      JOIN productos vp ON vp.id=m.producto_variante_id
      WHERE m.lote_origen_id=lc.id
    ) map ON true
    WHERE lc.id=p_id;
  ELSIF p_tipo='movimiento' THEN
    SELECT jsonb_build_object('id',v.id,'fecha',v.fecha,'tipo','Venta','estado',v.estado,'almacen',a.nombre,'usuario',coalesce(u.nombre,v.creado_por::text),'producto',p.nombre,'cantidad',vl.cantidad,'direccion','salida','resumen','Salida por venta · '||p.nombre)
    INTO r FROM ventas_lineas vl JOIN ventas v ON v.id=vl.venta_id JOIN productos p ON p.id=vl.producto_id LEFT JOIN almacenes a ON a.id=v.almacen_id LEFT JOIN usuarios u ON u.id=v.creado_por WHERE v.id=p_id LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Tipo de historial no soportado: %',p_tipo;
  END IF;

  IF r IS NULL THEN RAISE EXCEPTION 'Registro no encontrado.'; END IF;
  RETURN r;
END;
$premium$;

CREATE OR REPLACE FUNCTION public.inventario_mixto_enriquecido(p_almacen_id uuid DEFAULT NULL)
RETURNS TABLE(
  producto_id uuid,producto text,almacen text,cantidad numeric,minimo numeric,
  estado text,costo_promedio numeric,valor_inventario numeric,unidad text,variantes jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $inventory$
BEGIN
  IF NOT public.tiene_permiso('reportes','ver') THEN
    RAISE EXCEPTION 'No tienes permiso para ver inventario.' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT
    p.id,p.nombre,a.nombre,
    coalesce(sum(coalesce(s.cantidad,0)),0)::numeric,
    CASE WHEN bool_or(coalesce(vm.minimo,0)<=0) THEN NULL::numeric ELSE coalesce(sum(coalesce(vm.minimo,0)),0)::numeric END,
    CASE
      WHEN bool_or(coalesce(vm.minimo,0)<=0) THEN 'sin_minimo'
      WHEN coalesce(sum(coalesce(s.cantidad,0)),0)<=0 THEN 'agotado'
      WHEN bool_or(coalesce(s.cantidad,0)<=coalesce(vm.minimo,0)) THEN 'bajo'
      ELSE 'normal'
    END,
    CASE WHEN sum(coalesce(s.cantidad,0))>0
      THEN coalesce(sum(coalesce(lv.valor_inventario,0))/nullif(sum(coalesce(s.cantidad,0)),0),0)
      ELSE 0 END,
    coalesce(sum(coalesce(lv.valor_inventario,0)),0)::numeric,
    p.unidad,
    coalesce(jsonb_agg(jsonb_build_object(
      'producto_id',v.id,'nombre',v.variante_nombre,
      'cantidad',coalesce(s.cantidad,0),'minimo',coalesce(vm.minimo,0),
      'estado',CASE WHEN coalesce(vm.minimo,0)<=0 THEN 'sin_minimo'
        WHEN coalesce(s.cantidad,0)<=0 THEN 'agotado'
        WHEN coalesce(s.cantidad,0)<=coalesce(vm.minimo,0) THEN 'bajo'
        ELSE 'normal' END,
      'unidad',v.unidad,'costo_promedio',coalesce(lv.costo_promedio,0),
      'valor_inventario',coalesce(lv.valor_inventario,0)
    ) ORDER BY v.variante_nombre),'[]'::jsonb)
  FROM public.productos p
  JOIN public.almacenes a ON a.activo=true AND (p_almacen_id IS NULL OR a.id=p_almacen_id)
  JOIN public.productos v ON v.producto_padre_id=p.id AND v.activo=true
  LEFT JOIN public.stock s ON s.producto_id=v.id AND s.almacen_id=a.id
  LEFT JOIN public.productos_stock_mixto_minimos vm ON vm.producto_id=v.id AND vm.almacen_id=a.id
  LEFT JOIN LATERAL (
    SELECT
      CASE WHEN sum(l.cantidad_restante)>0 THEN sum(l.cantidad_restante*l.costo_unitario)/nullif(sum(l.cantidad_restante),0) ELSE 0 END AS costo_promedio,
      coalesce(sum(l.cantidad_restante*l.costo_unitario),0) AS valor_inventario
    FROM public.lotes_compra l
    WHERE l.producto_id=v.id AND l.almacen_id=a.id AND l.cantidad_restante>0
  ) lv ON true
  WHERE p.inventario_mixto=true AND p.activo=true
  GROUP BY p.id,p.nombre,a.nombre,p.unidad
  ORDER BY p.nombre,a.nombre;
END;
$inventory$;

REVOKE ALL ON FUNCTION public.bc_obtener_snapshot_conversion_mixta(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc_obtener_snapshot_conversion_mixta(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.historial_compras(date,date,uuid,uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.historial_compras(date,date,uuid,uuid,integer,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.historial_premium_detalle(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.historial_premium_detalle(text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.inventario_mixto_enriquecido(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inventario_mixto_enriquecido(uuid) TO authenticated;

COMMIT;
