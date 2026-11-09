-- A purchase must be able to create/increase stock before its minimum is configured.
-- The minimum remains visible as pending in Inventory and can be configured afterwards.
-- The exception is scoped to the exact stock write performed by the purchase RPCs.

CREATE OR REPLACE FUNCTION public.bc_require_positive_stock_minimum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $minimum_guard$
BEGIN
  IF NEW.cantidad > 0
     AND (coalesce(NEW.minimo,0) <= 0 OR NEW.minimo::text IN ('NaN','Infinity','-Infinity')) THEN
    IF coalesce(NEW.minimo,0) = 0
       AND (
         current_setting('app.bc_transfer_destination_write',true) = 'on'
         OR current_setting('app.bc_purchase_stock_write',true) = 'on'
       ) THEN
      RETURN NEW;
    END IF;

    IF TG_OP='INSERT' OR NEW.cantidad > OLD.cantidad OR
       NEW.producto_id IS DISTINCT FROM OLD.producto_id OR
       NEW.almacen_id IS DISTINCT FROM OLD.almacen_id OR
       NEW.minimo IS DISTINCT FROM OLD.minimo THEN
      RAISE EXCEPTION 'Antes de agregar o aumentar existencias, configura un stock mínimo mayor que cero para este producto y almacén.'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$minimum_guard$;

CREATE OR REPLACE FUNCTION public.bc_apply_stock_purchase_increment(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_cantidad numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $purchase_stock$
BEGIN
  IF p_producto_id IS NULL OR p_almacen_id IS NULL OR
     p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Datos inválidos para aumentar existencias mediante compra.';
  END IF;

  PERFORM set_config('app.bc_purchase_stock_write','on',true);
  INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
  VALUES(p_producto_id,p_almacen_id,p_cantidad,0)
  ON CONFLICT(producto_id,almacen_id)
  DO UPDATE SET
    cantidad=public.stock.cantidad+EXCLUDED.cantidad,
    updated_at=now();
  PERFORM set_config('app.bc_purchase_stock_write','off',true);
END;
$purchase_stock$;

REVOKE ALL ON FUNCTION public.bc_apply_stock_purchase_increment(uuid,uuid,numeric) FROM PUBLIC,anon;

CREATE OR REPLACE FUNCTION public.registrar_compra(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_cantidad numeric,
  p_costo_unitario numeric,
  p_presentacion_id uuid DEFAULT NULL::uuid,
  p_cantidad_presentacion numeric DEFAULT NULL::numeric,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $purchase$
DECLARE
  v_lote_id uuid;
  v_cantidad_final numeric;
  v_costo_unitario_base numeric;
  v_idempotente uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa' USING ERRCODE='42501';
  END IF;
  IF NOT public.tiene_permiso('productos','crear') THEN
    RAISE EXCEPTION 'Sin permiso para registrar compras';
  END IF;
  IF NOT public.bc_actor_is_admin() AND NOT EXISTS (
    SELECT 1
    FROM public.turno_tramos tr
    JOIN public.turno_sesiones s ON s.id=tr.turno_sesion_id
    WHERE tr.usuario_id=auth.uid()
      AND tr.estado='ACTIVO'
      AND s.almacen_id=p_almacen_id
      AND s.estado IN ('EN_CURSO','ACTIVA','ACTIVO')
  ) THEN
    RAISE EXCEPTION 'La compra debe ser recibida por la persona que tiene una sesión activa en el punto de venta';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Se requiere idempotency_key';
  END IF;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key,auth.uid(),'registrar_compra',
    jsonb_build_object(
      'producto_id',p_producto_id,'almacen_id',p_almacen_id,
      'cantidad',p_cantidad,'costo_unitario',p_costo_unitario,
      'presentacion_id',p_presentacion_id,
      'cantidad_presentacion',p_cantidad_presentacion
    )
  );
  IF v_idempotente IS NOT NULL THEN
    RETURN v_idempotente;
  END IF;

  IF p_presentacion_id IS NOT NULL THEN
    IF p_cantidad_presentacion IS NULL OR p_cantidad_presentacion <= 0 THEN
      RAISE EXCEPTION 'Cantidad de presentación inválida';
    END IF;
    SELECT unidades_base INTO v_cantidad_final
    FROM public.obtener_conversion_presentacion(
      p_producto_id,p_presentacion_id,p_cantidad_presentacion
    );
  ELSE
    IF p_cantidad IS NULL THEN
      RAISE EXCEPTION 'La cantidad es requerida';
    END IF;
    v_cantidad_final := p_cantidad;
  END IF;

  IF v_cantidad_final IS NULL OR v_cantidad_final <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a cero';
  END IF;
  IF p_costo_unitario IS NULL OR p_costo_unitario < 0 THEN
    RAISE EXCEPTION 'Costo inválido';
  END IF;

  IF p_presentacion_id IS NOT NULL THEN
    v_costo_unitario_base := p_costo_unitario / (v_cantidad_final / p_cantidad_presentacion);
  ELSE
    v_costo_unitario_base := p_costo_unitario;
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.almacenes WHERE id=p_almacen_id) THEN
    RAISE EXCEPTION 'Almacén no encontrado';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.productos WHERE id=p_producto_id) THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  INSERT INTO public.lotes_compra(
    producto_id,almacen_id,cantidad_inicial,cantidad_restante,
    costo_unitario,usuario_id
  )
  VALUES(
    p_producto_id,p_almacen_id,v_cantidad_final,v_cantidad_final,
    v_costo_unitario_base,auth.uid()
  )
  RETURNING id INTO v_lote_id;

  PERFORM public.bc_apply_stock_purchase_increment(
    p_producto_id,p_almacen_id,v_cantidad_final
  );

  UPDATE private.operaciones_idempotencia
  SET resultado_id=v_lote_id
  WHERE idempotency_key=p_idempotency_key;
  RETURN v_lote_id;
END;
$purchase$;

CREATE OR REPLACE FUNCTION public.registrar_compra_multiple(
  p_almacen_id uuid,
  p_proveedor text DEFAULT NULL::text,
  p_fecha timestamp with time zone DEFAULT now(),
  p_lineas jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $purchase_multiple$
DECLARE
  v_uid uuid := auth.uid();
  v_compra_id uuid;
  v_linea jsonb;
  v_producto_id uuid;
  v_cantidad numeric;
  v_costo numeric;
  v_costo_unitario_base numeric;
  v_presentacion_id uuid;
  v_cantidad_presentacion numeric;
  v_cantidad_final numeric;
  v_cantidad_documento numeric;
  v_total numeric := 0;
  v_usuario_nombre text;
  v_idempotente uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE='42501';
  END IF;
  IF NOT public.tiene_permiso('productos','crear') THEN
    RAISE EXCEPTION 'Sin permiso para registrar compras' USING ERRCODE='42501';
  END IF;
  IF NOT public.bc_actor_is_admin() AND NOT EXISTS (
    SELECT 1
    FROM public.turno_tramos tr
    JOIN public.turno_sesiones s ON s.id=tr.turno_sesion_id
    JOIN public.turnos t ON t.id=s.turno_id
    WHERE tr.usuario_id=v_uid
      AND tr.estado='ACTIVO'
      AND s.almacen_id=p_almacen_id
      AND s.estado IN ('EN_CURSO','ACTIVA','ACTIVO')
  ) THEN
    RAISE EXCEPTION 'La compra debe ser recibida por la persona que tiene una sesión activa en el punto de venta';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Se requiere idempotency_key';
  END IF;
  IF p_lineas IS NULL OR jsonb_array_length(p_lineas)=0 THEN
    RAISE EXCEPTION 'La compra debe tener al menos un producto';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.almacenes WHERE id=p_almacen_id) THEN
    RAISE EXCEPTION 'Almacén no encontrado';
  END IF;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key,v_uid,'registrar_compra_multiple',
    jsonb_build_object(
      'almacen_id',p_almacen_id,'proveedor',p_proveedor,
      'fecha',p_fecha,'lineas',p_lineas
    )
  );
  IF v_idempotente IS NOT NULL THEN
    RETURN v_idempotente;
  END IF;

  SELECT nombre INTO v_usuario_nombre
  FROM public.usuarios WHERE id=v_uid;

  INSERT INTO public.compras(
    almacen_id,proveedor,fecha,usuario_id,usuario_nombre,total,idempotency_key
  )
  VALUES(
    p_almacen_id,nullif(trim(p_proveedor),''),coalesce(p_fecha,now()),
    v_uid,v_usuario_nombre,0,p_idempotency_key
  )
  RETURNING id INTO v_compra_id;

  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_producto_id := nullif(v_linea->>'producto_id','')::uuid;
    v_cantidad := nullif(v_linea->>'cantidad','')::numeric;
    v_costo := nullif(v_linea->>'costo_unitario','')::numeric;
    v_presentacion_id := nullif(v_linea->>'presentacion_id','')::uuid;
    v_cantidad_presentacion := nullif(v_linea->>'cantidad_presentacion','')::numeric;

    IF v_producto_id IS NULL THEN
      RAISE EXCEPTION 'Producto requerido en cada línea';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.productos WHERE id=v_producto_id) THEN
      RAISE EXCEPTION 'Producto no encontrado: %',v_producto_id;
    END IF;
    IF v_costo IS NULL OR v_costo < 0 THEN
      RAISE EXCEPTION 'Costo inválido en línea de compra';
    END IF;

    IF v_presentacion_id IS NOT NULL THEN
      IF v_cantidad_presentacion IS NULL OR v_cantidad_presentacion <= 0 THEN
        RAISE EXCEPTION 'Cantidad de presentación inválida en línea de compra';
      END IF;
      SELECT unidades_base INTO v_cantidad_final
      FROM public.obtener_conversion_presentacion(
        v_producto_id,v_presentacion_id,v_cantidad_presentacion
      );
      v_cantidad_documento := v_cantidad_presentacion;
    ELSE
      v_cantidad_final := v_cantidad;
      v_cantidad_documento := v_cantidad;
    END IF;

    IF v_cantidad_final IS NULL OR v_cantidad_final <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida en línea de compra';
    END IF;
    IF v_presentacion_id IS NOT NULL THEN
      v_costo_unitario_base := v_costo / (v_cantidad_final / v_cantidad_presentacion);
    ELSE
      v_costo_unitario_base := v_costo;
    END IF;

    INSERT INTO public.lotes_compra(
      producto_id,almacen_id,cantidad_inicial,cantidad_restante,
      costo_unitario,fecha_compra,origen,usuario_id,compra_id
    )
    VALUES(
      v_producto_id,p_almacen_id,v_cantidad_final,v_cantidad_final,
      v_costo_unitario_base,coalesce(p_fecha,now()),'compra',v_uid,v_compra_id
    );

    PERFORM public.bc_apply_stock_purchase_increment(
      v_producto_id,p_almacen_id,v_cantidad_final
    );

    v_total := v_total + (v_cantidad_documento * v_costo);
  END LOOP;

  UPDATE public.compras SET total=v_total WHERE id=v_compra_id;
  UPDATE private.operaciones_idempotencia
  SET resultado_id=v_compra_id
  WHERE idempotency_key=p_idempotency_key;
  RETURN v_compra_id;
END;
$purchase_multiple$;
