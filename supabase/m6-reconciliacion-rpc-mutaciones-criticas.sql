-- BattleCruiser — M6 — Reconciliación profunda B6 (Misión 2/3)
--
-- Qué es este archivo:
-- Definición REAL, verificada en producción (papxnkkjtkxsitcsvcme) el
-- 2026-08-17 vía consulta directa (pg_get_functiondef), de las 4 mutaciones
-- críticas que NO tenían ninguna representación correcta en el repo:
--
--   registrar_compra, registrar_venta, registrar_transferencia,
--   registrar_vale_salida
--
-- Por qué hacía falta:
-- b6-nucleo-operativo.sql (ya marcado DEPRECATED en Misión 1/3) define estas
-- mismas 4 funciones pero con una arquitectura que producción NUNCA usó
-- (helpers _consumir_fifo/_registrar_movimiento/_resolver_presentacion). El
-- repo no tenía, hasta este archivo, ninguna copia fiel del comportamiento
-- real. crear_producto/actualizar_producto/cambiar_estado_producto SÍ ya
-- estaban correctamente versionadas en m3-productos-editar-estado.sql
-- (comparadas cuerpo a cuerpo contra producción en esta misión: coinciden
-- exactamente) — no se tocan aquí.
--
-- Naturaleza del archivo:
-- Es CREATE OR REPLACE idempotente. Aplicarlo sobre la producción actual
-- es un no-op (el cuerpo es idéntico byte a byte al ya desplegado,
-- verificado el 2026-08-17). Su propósito es que GitHub tenga, por fin,
-- una copia fiel — no modifica producción.
--
-- No incluye (ya cubierto por m5-reconciliacion-supabase-github.sql de la
-- Misión 1/3): esquema private, tiene_permiso(), 
-- obtener_conversion_presentacion(), proteger_ultimo_dueno().
-- No incluye (ya correctamente versionado en m4-auditoria-integridad-
-- hardening.sql, verificado igual en esta misión): auditar_mutacion_operativa(),
-- validar_producto_activo_en_mutacion() y sus 11 triggers.

-- ============================================================
-- 1) registrar_compra
-- ============================================================
-- Tablas que modifica: lotes_compra (INSERT), stock (INSERT/UPDATE upsert).
-- Permiso: tiene_permiso('productos','crear').
-- Idempotencia: private.reclamar_idempotencia obligatoria (p_idempotency_key
--   NOT NULL, si no se manda lanza excepción).
-- FIFO: no aplica en compra (es el punto de entrada del FIFO, no de consumo).
-- Presentaciones: si p_presentacion_id no es null, convierte vía
--   obtener_conversion_presentacion(); si no, usa p_cantidad tal cual.
-- Auditoría: vía trigger trg_auditoria_lotes_compra (AFTER INSERT en
--   lotes_compra), no dentro de esta función.
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
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lote_id uuid;
  v_cantidad_final numeric;
  v_idempotente uuid;
begin
  if not public.tiene_permiso('productos','crear') then
    raise exception 'Sin permiso para registrar compras';
  end if;

  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key,
    auth.uid(),
    'registrar_compra',
    jsonb_build_object('producto_id',p_producto_id,'almacen_id',p_almacen_id,'cantidad',p_cantidad,'costo_unitario',p_costo_unitario,'presentacion_id',p_presentacion_id,'cantidad_presentacion',p_cantidad_presentacion)
  );
  if v_idempotente is not null then
    return v_idempotente;
  end if;

  if p_presentacion_id is not null then
    select unidades_base into v_cantidad_final
    from public.obtener_conversion_presentacion(p_producto_id, p_presentacion_id, p_cantidad_presentacion);
  else
    if p_cantidad is null then
      raise exception 'La cantidad es requerida';
    end if;
    v_cantidad_final := p_cantidad;
  end if;

  if v_cantidad_final <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if not exists (select 1 from public.almacenes where id = p_almacen_id) then
    raise exception 'Almacén no encontrado';
  end if;
  if not exists (select 1 from public.productos where id = p_producto_id) then
    raise exception 'Producto no encontrado';
  end if;

  insert into public.lotes_compra (producto_id, almacen_id, cantidad_inicial, cantidad_restante, costo_unitario, usuario_id)
  values (p_producto_id, p_almacen_id, v_cantidad_final, v_cantidad_final, p_costo_unitario, auth.uid())
  returning id into v_lote_id;

  insert into public.stock (producto_id, almacen_id, cantidad, minimo)
  values (p_producto_id, p_almacen_id, v_cantidad_final, 0)
  on conflict (producto_id, almacen_id)
    do update set cantidad = public.stock.cantidad + excluded.cantidad;

  if p_idempotency_key is not null then
    update private.operaciones_idempotencia
    set resultado_id = v_lote_id
    where idempotency_key = p_idempotency_key;
  end if;

  return v_lote_id;
end;
$function$;

-- ============================================================
-- 2) registrar_venta
-- ============================================================
-- Tablas: ventas (INSERT), ventas_lineas (INSERT por línea), stock (UPDATE),
--   lotes_compra (UPDATE cantidad_restante — consumo FIFO por línea).
-- Permiso: tiene_permiso('ventas','crear').
-- Idempotencia: obligatoria.
-- FIFO real: por cada línea, recorre lotes_compra ordenado por
--   fecha_compra ASC (FOR UPDATE) descontando cantidad_restante hasta cubrir
--   la línea, y calcula costo_unitario_fifo = costo_total_consumido /
--   cantidad_vendida (queda NULL si no se pudo costear, nunca inventa costo).
-- Precio: usa precio_mayorista si el almacén es tipo 'mayorista' (falla si
--   no está configurado), si no usa precio_normal.
-- Presentaciones: por línea, igual patrón que registrar_compra.
-- Auditoría: vía trigger trg_auditoria_ventas.
CREATE OR REPLACE FUNCTION public.registrar_venta(
  p_almacen_id uuid,
  p_lineas jsonb,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_venta_id uuid;
  v_tipo_almacen text;
  v_linea jsonb;
  v_producto_id uuid;
  v_cantidad numeric;
  v_presentacion_id uuid;
  v_cantidad_presentacion numeric;
  v_cantidad_final numeric;
  v_precio_normal numeric;
  v_precio_mayorista numeric;
  v_precio numeric;
  v_subtotal numeric;
  v_total numeric := 0;
  v_stock_actual numeric;
  v_restante numeric;
  v_lote record;
  v_tomar numeric;
  v_idempotente uuid;
  v_costo_total_linea numeric;
  v_costo_unitario_fifo numeric;
begin
  if not public.tiene_permiso('ventas','crear') then
    raise exception 'Sin permiso para registrar ventas';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La venta debe tener al menos un producto';
  end if;

  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;

  v_idempotente := private.reclamar_idempotencia(p_idempotency_key, auth.uid(), 'registrar_venta', jsonb_build_object('almacen_id',p_almacen_id,'lineas',p_lineas));
  if v_idempotente is not null then return v_idempotente; end if;

  select tipo into v_tipo_almacen from public.almacenes where id = p_almacen_id;
  if v_tipo_almacen is null then raise exception 'Almacén no encontrado'; end if;

  insert into public.ventas (almacen_id, creado_por, total)
  values (p_almacen_id, auth.uid(), 0)
  returning id into v_venta_id;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_producto_id := (v_linea->>'producto_id')::uuid;
    v_cantidad := (v_linea->>'cantidad')::numeric;
    v_presentacion_id := nullif(v_linea->>'presentacion_id','')::uuid;
    v_cantidad_presentacion := nullif(v_linea->>'cantidad_presentacion','')::numeric;

    if v_presentacion_id is not null then
      select unidades_base into v_cantidad_final from public.obtener_conversion_presentacion(v_producto_id, v_presentacion_id, v_cantidad_presentacion);
    else
      if v_cantidad is null or v_cantidad <= 0 then raise exception 'Cantidad inválida en línea de venta'; end if;
      v_cantidad_final := v_cantidad;
    end if;
    if v_cantidad_final <= 0 then raise exception 'Cantidad inválida en línea de venta'; end if;

    select precio_normal, precio_mayorista into v_precio_normal, v_precio_mayorista from public.productos where id = v_producto_id;
    if v_precio_normal is null then raise exception 'Producto no encontrado'; end if;
    if v_tipo_almacen = 'mayorista' then
      if v_precio_mayorista is null then raise exception 'El producto no tiene precio mayorista configurado'; end if;
      v_precio := v_precio_mayorista;
    else
      v_precio := v_precio_normal;
    end if;

    select cantidad into v_stock_actual from public.stock where producto_id = v_producto_id and almacen_id = p_almacen_id for update;
    if v_stock_actual is null or v_stock_actual < v_cantidad_final then raise exception 'Stock insuficiente para el producto %', v_producto_id; end if;

    v_subtotal := v_cantidad_final * v_precio;
    v_total := v_total + v_subtotal;

    v_restante := v_cantidad_final;
    v_costo_total_linea := 0;
    for v_lote in select id, cantidad_restante, costo_unitario from public.lotes_compra where producto_id = v_producto_id and almacen_id = p_almacen_id and cantidad_restante > 0 order by fecha_compra asc for update loop
      exit when v_restante <= 0;
      v_tomar := least(v_lote.cantidad_restante, v_restante);
      update public.lotes_compra set cantidad_restante = cantidad_restante - v_tomar where id = v_lote.id;
      v_costo_total_linea := v_costo_total_linea + (v_tomar * v_lote.costo_unitario);
      v_restante := v_restante - v_tomar;
    end loop;

    if v_costo_total_linea > 0 then
      v_costo_unitario_fifo := v_costo_total_linea / v_cantidad_final;
    else
      v_costo_unitario_fifo := null;
    end if;

    insert into public.ventas_lineas (venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario_fifo) values (v_venta_id, v_producto_id, v_cantidad_final, v_precio, v_subtotal, v_costo_unitario_fifo);

    update public.stock set cantidad = cantidad - v_cantidad_final where producto_id = v_producto_id and almacen_id = p_almacen_id;
  end loop;

  update public.ventas set total = v_total where id = v_venta_id;

  if p_idempotency_key is not null then
    update private.operaciones_idempotencia set resultado_id = v_venta_id where idempotency_key = p_idempotency_key;
  end if;
  return v_venta_id;
end;
$function$;

-- ============================================================
-- 3) registrar_transferencia
-- ============================================================
-- Tablas: transferencias (INSERT), transferencias_lineas (INSERT por línea),
--   stock origen y destino (UPDATE/upsert), lotes_compra (UPDATE origen +
--   INSERT nuevo lote en destino con origen='transferencia').
-- Permiso: tiene_permiso('transferencias','crear'). Además valida
--   p_origen_id <> p_destino_id ANTES de reclamar idempotencia (a diferencia
--   de las otras 3, este chequeo de negocio va antes del idempotency guard).
-- FIFO real: consume del origen por fecha_compra ASC, y por cada lote
--   consumido crea un lote NUEVO en el destino heredando el mismo
--   costo_unitario (preserva trazabilidad de costo FIFO al cruzar de
--   almacén).
CREATE OR REPLACE FUNCTION public.registrar_transferencia(
  p_origen_id uuid,
  p_destino_id uuid,
  p_lineas jsonb,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
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
    insert into public.stock (producto_id, almacen_id, cantidad, minimo) values (v_producto_id, p_destino_id, v_cantidad_final, 0) on conflict (producto_id, almacen_id) do update set cantidad = public.stock.cantidad + excluded.cantidad;
  end loop;

  if p_idempotency_key is not null then update private.operaciones_idempotencia set resultado_id = v_transferencia_id where idempotency_key = p_idempotency_key; end if;
  return v_transferencia_id;
end;
$function$;

-- ============================================================
-- 4) registrar_vale_salida
-- ============================================================
-- Tablas: vales_salida (INSERT), stock (UPDATE), lotes_compra (UPDATE
--   cantidad_restante — consumo FIFO, sin crear lote nuevo en ningún lado:
--   a diferencia de la transferencia, el vale es salida final, no muda de
--   almacén).
-- Permiso: tiene_permiso('vales_salida','crear').
-- Nota: NO valida costo, no calcula costo_unitario_fifo (a diferencia de
--   registrar_venta) — el vale de salida no registra valor monetario, solo
--   consume FIFO para mantener cantidad_restante consistente.
CREATE OR REPLACE FUNCTION public.registrar_vale_salida(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_tipo text,
  p_cantidad numeric,
  p_presentacion_id uuid DEFAULT NULL::uuid,
  p_cantidad_presentacion numeric DEFAULT NULL::numeric,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_vale_id uuid;
  v_cantidad_final numeric;
  v_stock_actual numeric;
  v_restante numeric;
  v_lote record;
  v_tomar numeric;
  v_idempotente uuid;
begin
  if not public.tiene_permiso('vales_salida','crear') then raise exception 'Sin permiso para registrar vales de salida'; end if;
  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;
  v_idempotente := private.reclamar_idempotencia(p_idempotency_key, auth.uid(), 'registrar_vale_salida', jsonb_build_object('producto_id',p_producto_id,'almacen_id',p_almacen_id,'tipo',p_tipo,'cantidad',p_cantidad,'presentacion_id',p_presentacion_id,'cantidad_presentacion',p_cantidad_presentacion));
  if v_idempotente is not null then return v_idempotente; end if;

  if p_presentacion_id is not null then
    select unidades_base into v_cantidad_final from public.obtener_conversion_presentacion(p_producto_id, p_presentacion_id, p_cantidad_presentacion);
  else
    if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
    v_cantidad_final := p_cantidad;
  end if;
  if v_cantidad_final <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
  select cantidad into v_stock_actual from public.stock where producto_id = p_producto_id and almacen_id = p_almacen_id for update;
  if v_stock_actual is null or v_stock_actual < v_cantidad_final then raise exception 'Stock insuficiente para el vale de salida'; end if;
  insert into public.vales_salida (producto_id, almacen_id, tipo, cantidad, creado_por) values (p_producto_id, p_almacen_id, p_tipo, v_cantidad_final, auth.uid()) returning id into v_vale_id;
  v_restante := v_cantidad_final;
  for v_lote in select id, cantidad_restante from public.lotes_compra where producto_id = p_producto_id and almacen_id = p_almacen_id and cantidad_restante > 0 order by fecha_compra asc for update loop
    exit when v_restante <= 0;
    v_tomar := least(v_lote.cantidad_restante, v_restante);
    update public.lotes_compra set cantidad_restante = cantidad_restante - v_tomar where id = v_lote.id;
    v_restante := v_restante - v_tomar;
  end loop;
  update public.stock set cantidad = cantidad - v_cantidad_final where producto_id = p_producto_id and almacen_id = p_almacen_id;
  if p_idempotency_key is not null then update private.operaciones_idempotencia set resultado_id = v_vale_id where idempotency_key = p_idempotency_key; end if;
  return v_vale_id;
end;
$function$;

-- ============================================================
-- Grants (verificados en producción — no cambian, se dejan explícitos
-- para que el repo represente el estado final tal cual)
-- ============================================================
REVOKE ALL ON FUNCTION public.registrar_compra(uuid, uuid, numeric, numeric, uuid, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_compra(uuid, uuid, numeric, numeric, uuid, numeric, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.registrar_compra(uuid, uuid, numeric, numeric, uuid, numeric, uuid) FROM anon;

REVOKE ALL ON FUNCTION public.registrar_venta(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venta(uuid, jsonb, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.registrar_venta(uuid, jsonb, uuid) FROM anon;

REVOKE ALL ON FUNCTION public.registrar_transferencia(uuid, uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_transferencia(uuid, uuid, jsonb, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.registrar_transferencia(uuid, uuid, jsonb, uuid) FROM anon;

REVOKE ALL ON FUNCTION public.registrar_vale_salida(uuid, uuid, text, numeric, uuid, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_vale_salida(uuid, uuid, text, numeric, uuid, numeric, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.registrar_vale_salida(uuid, uuid, text, numeric, uuid, numeric, uuid) FROM anon;
