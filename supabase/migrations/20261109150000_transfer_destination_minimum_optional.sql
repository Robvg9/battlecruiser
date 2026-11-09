-- BattleCruiser: a transfer is allowed to establish destination stock even when its
-- minimum has not yet been configured. The UI warns the operator after the atomic move.
BEGIN;

CREATE OR REPLACE FUNCTION public.bc_require_positive_stock_minimum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $minimum_guard$
BEGIN
  IF NEW.cantidad > 0
     AND (coalesce(NEW.minimo,0) <= 0 OR NEW.minimo::text IN ('NaN','Infinity','-Infinity')) THEN
    -- registrar_transferencia sets this transaction-local flag only around the
    -- destination stock write. Purchases and every other stock increase remain
    -- subject to the normal positive-minimum rule.
    IF current_setting('app.bc_transfer_destination_write',true) = 'on'
       AND coalesce(NEW.minimo,0) = 0 THEN
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

CREATE OR REPLACE FUNCTION public.registrar_transferencia(
  p_origen_id uuid,
  p_destino_id uuid,
  p_lineas jsonb,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_transferencia_id uuid;
  v_linea jsonb;
  v_producto_id uuid;
  v_cantidad numeric;
  v_presentacion_id uuid;
  v_cantidad_presentacion numeric;
  v_cantidad_final numeric;
  v_restante numeric;
  v_lote record;
  v_tomar numeric;
  v_stock_origen numeric;
  v_idempotente uuid;
BEGIN
  IF NOT public.tiene_permiso('transferencias','crear') THEN
    RAISE EXCEPTION 'Sin permiso para registrar transferencias';
  END IF;
  IF p_origen_id = p_destino_id THEN
    RAISE EXCEPTION 'El almacén origen y destino no pueden ser el mismo';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Se requiere idempotency_key';
  END IF;
  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key,auth.uid(),'registrar_transferencia',
    jsonb_build_object('origen_id',p_origen_id,'destino_id',p_destino_id,'lineas',p_lineas)
  );
  IF v_idempotente IS NOT NULL THEN RETURN v_idempotente; END IF;

  INSERT INTO public.transferencias(almacen_origen_id,almacen_destino_id,creado_por)
  VALUES(p_origen_id,p_destino_id,auth.uid())
  RETURNING id INTO v_transferencia_id;

  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_producto_id := (v_linea->>'producto_id')::uuid;
    v_cantidad := (v_linea->>'cantidad')::numeric;
    v_presentacion_id := nullif(v_linea->>'presentacion_id','')::uuid;
    v_cantidad_presentacion := nullif(v_linea->>'cantidad_presentacion','')::numeric;
    IF v_presentacion_id IS NOT NULL THEN
      SELECT unidades_base INTO v_cantidad_final
      FROM public.obtener_conversion_presentacion(v_producto_id,v_presentacion_id,v_cantidad_presentacion);
    ELSE
      IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
        RAISE EXCEPTION 'Cantidad inválida en línea de transferencia';
      END IF;
      v_cantidad_final := v_cantidad;
    END IF;
    IF v_cantidad_final IS NULL OR v_cantidad_final <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida en línea de transferencia';
    END IF;

    SELECT cantidad INTO v_stock_origen
    FROM public.stock
    WHERE producto_id=v_producto_id AND almacen_id=p_origen_id
    FOR UPDATE;
    IF v_stock_origen IS NULL OR v_stock_origen < v_cantidad_final THEN
      RAISE EXCEPTION 'Stock insuficiente en el almacén origen para el producto %',v_producto_id;
    END IF;

    INSERT INTO public.transferencias_lineas(transferencia_id,producto_id,cantidad)
    VALUES(v_transferencia_id,v_producto_id,v_cantidad_final);

    v_restante := v_cantidad_final;
    FOR v_lote IN
      SELECT id,cantidad_restante,costo_unitario
      FROM public.lotes_compra
      WHERE producto_id=v_producto_id AND almacen_id=p_origen_id AND cantidad_restante>0
      ORDER BY fecha_compra ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_restante <= 0;
      v_tomar := least(v_lote.cantidad_restante,v_restante);
      UPDATE public.lotes_compra
      SET cantidad_restante=cantidad_restante-v_tomar
      WHERE id=v_lote.id;
      INSERT INTO public.lotes_compra(
        producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario,origen,usuario_id
      )
      VALUES(v_producto_id,p_destino_id,v_tomar,v_tomar,v_lote.costo_unitario,'transferencia',auth.uid());
      v_restante := v_restante-v_tomar;
    END LOOP;

    UPDATE public.stock
    SET cantidad=cantidad-v_cantidad_final
    WHERE producto_id=v_producto_id AND almacen_id=p_origen_id;

    -- Only this narrow destination write may create/increase stock with minimum 0.
    -- This preserves the movement and FIFO atomically; minimum configuration is
    -- deliberately deferred and the client reports it after success.
    PERFORM set_config('app.bc_transfer_destination_write','on',true);
    UPDATE public.stock
    SET cantidad=cantidad+v_cantidad_final,updated_at=now()
    WHERE producto_id=v_producto_id AND almacen_id=p_destino_id;
    IF NOT FOUND THEN
      INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo,updated_at)
      VALUES(v_producto_id,p_destino_id,v_cantidad_final,0,now());
    END IF;
    PERFORM set_config('app.bc_transfer_destination_write','off',true);
  END LOOP;

  UPDATE private.operaciones_idempotencia
  SET resultado_id=v_transferencia_id
  WHERE idempotency_key=p_idempotency_key;

  RETURN v_transferencia_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_transferencia(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registrar_transferencia(uuid,uuid,jsonb,uuid) TO authenticated,service_role;

COMMIT;
