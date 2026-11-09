-- Preserve destination warehouse minimums during transfers without bypassing the stock guard.
BEGIN;
CREATE OR REPLACE FUNCTION public.registrar_transferencia(p_origen_id uuid, p_destino_id uuid, p_lineas jsonb, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
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
  v_minimo_destino numeric;
  v_idempotente uuid;
begin
  if not public.tiene_permiso('transferencias','crear') then raise exception 'Sin permiso para registrar transferencias'; end if;
  if p_origen_id = p_destino_id then raise exception 'El almacén origen y destino no pueden ser el mismo'; end if;
  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;
  v_idempotente := private.reclamar_idempotencia(p_idempotency_key, auth.uid(), 'registrar_transferencia', jsonb_build_object('origen_id',p_origen_id,'destino_id',p_destino_id,'lineas',p_lineas));
  if v_idempotente is not null then return v_idempotente; end if;

  insert into public.transferencias (almacen_origen_id, almacen_destino_id, creado_por) values (p_origen_id, p_destino_id, auth.uid()) returning id into v_transferencia_id;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_producto_id := (v_linea->>'producto_id')::uuid;
    v_cantidad := (v_linea->>'cantidad')::numeric;
    v_presentacion_id := nullif(v_linea->>'presentacion_id','')::uuid;
    v_cantidad_presentacion := nullif(v_linea->>'cantidad_presentacion','')::numeric;
    if v_presentacion_id is not null then
      select unidades_base into v_cantidad_final from public.obtener_conversion_presentacion(v_producto_id, v_presentacion_id, v_cantidad_presentacion);
    else
      if v_cantidad is null or v_cantidad <= 0 then raise exception 'Cantidad inválida en línea de transferencia'; end if;
      v_cantidad_final := v_cantidad;
    end if;
    if v_cantidad_final <= 0 then raise exception 'Cantidad inválida en línea de transferencia'; end if;
    select cantidad into v_stock_origen from public.stock where producto_id = v_producto_id and almacen_id = p_origen_id for update;
    if v_stock_origen is null or v_stock_origen < v_cantidad_final then raise exception 'Stock insuficiente en el almacén origen para el producto %', v_producto_id; end if;
    insert into public.transferencias_lineas (transferencia_id, producto_id, cantidad) values (v_transferencia_id, v_producto_id, v_cantidad_final);
    v_restante := v_cantidad_final;
    for v_lote in select id, cantidad_restante, costo_unitario from public.lotes_compra where producto_id = v_producto_id and almacen_id = p_origen_id and cantidad_restante > 0 order by fecha_compra asc for update loop
      exit when v_restante <= 0;
      v_tomar := least(v_lote.cantidad_restante, v_restante);
      update public.lotes_compra set cantidad_restante = cantidad_restante - v_tomar where id = v_lote.id;
      insert into public.lotes_compra (producto_id, almacen_id, cantidad_inicial, cantidad_restante, costo_unitario, origen, usuario_id) values (v_producto_id, p_destino_id, v_tomar, v_tomar, v_lote.costo_unitario, 'transferencia', auth.uid());
      v_restante := v_restante - v_tomar;
    end loop;
    update public.stock set cantidad = cantidad - v_cantidad_final where producto_id = v_producto_id and almacen_id = p_origen_id;
    -- Update an assigned destination row directly. INSERT ... ON CONFLICT is unsafe here:
    -- PostgreSQL runs the BEFORE INSERT minimum guard before it can resolve the conflict.
    UPDATE public.stock
       SET cantidad = cantidad + v_cantidad_final, updated_at = now()
     WHERE producto_id = v_producto_id AND almacen_id = p_destino_id;
    IF NOT FOUND THEN
      -- A flavor can be seeded from its explicit per-warehouse minimum. A normal
      -- product must already have a destination stock row created by minimum setup.
      SELECT minimo INTO v_minimo_destino
        FROM public.productos_stock_mixto_minimos
       WHERE producto_id = v_producto_id AND almacen_id = p_destino_id;
      IF v_minimo_destino IS NULL OR v_minimo_destino <= 0
         OR v_minimo_destino::text IN ('NaN','Infinity','-Infinity') THEN
        RAISE EXCEPTION 'Configura primero un stock mínimo positivo para este producto en el almacén de destino.';
      END IF;
      INSERT INTO public.stock (producto_id, almacen_id, cantidad, minimo, updated_at)
      VALUES (v_producto_id, p_destino_id, v_cantidad_final, v_minimo_destino, now());
    END IF;
  end loop;

  if p_idempotency_key is not null then update private.operaciones_idempotencia set resultado_id = v_transferencia_id where idempotency_key = p_idempotency_key; end if;

  return v_transferencia_id;
end;
$function$

REVOKE ALL ON FUNCTION public.registrar_transferencia(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_transferencia(uuid, uuid, jsonb, uuid) TO authenticated, service_role;
COMMIT;
