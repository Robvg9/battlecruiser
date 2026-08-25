-- M27.5 + Misión B — Venta con tipo de precio explícito por línea y presentación mayorista obligatoria
-- Aplicado en producción sobre public.registrar_venta(uuid,jsonb,uuid,text).
CREATE OR REPLACE FUNCTION public.registrar_venta(
  p_almacen_id uuid,
  p_lineas jsonb,
  p_idempotency_key uuid,
  p_tipo_precio text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $function$
declare
  v_venta_id uuid; v_tipo_almacen text; v_linea jsonb; v_producto_id uuid; v_cantidad numeric;
  v_presentacion_id uuid; v_cantidad_presentacion numeric; v_cantidad_final numeric;
  v_precio_normal numeric; v_precio_mayorista numeric; v_precio numeric; v_tipo_precio_linea text;
  v_subtotal numeric; v_total numeric:=0; v_stock_actual numeric; v_restante numeric;
  v_lote record; v_tomar numeric; v_idempotente uuid; v_costo_total_linea numeric;
  v_costo_unitario_fifo numeric; v_uid uuid; v_turno record; v_almacen_real uuid;
  v_presentacion_producto uuid;
begin
  if not public.tiene_permiso('ventas','crear') then raise exception 'Sin permiso para registrar ventas'; end if;
  if p_lineas is null or jsonb_array_length(p_lineas)=0 then raise exception 'La venta debe tener al menos un producto'; end if;
  if p_idempotency_key is null then raise exception 'Se requiere idempotency_key'; end if;
  if p_tipo_precio not in ('normal','mayorista') then raise exception 'Tipo de precio inválido'; end if;
  v_uid:=auth.uid(); if v_uid is null then raise exception 'No hay sesión activa.' using errcode='42501'; end if;
  v_idempotente:=private.reclamar_idempotencia(p_idempotency_key,v_uid,'registrar_venta',jsonb_build_object('almacen_id',p_almacen_id,'lineas',p_lineas,'tipo_precio',p_tipo_precio));
  if v_idempotente is not null then return v_idempotente; end if;
  select * into v_turno from public.turnos where usuario_id=v_uid and estado='ABIERTO' limit 1;
  if v_turno.id is null then raise exception 'No tenés un turno abierto. No podés registrar ventas.' using errcode='42501'; end if;
  if v_turno.almacen_id is null then raise exception 'Tu turno no tiene almacén asignado. No podés registrar ventas.' using errcode='42501'; end if;
  v_almacen_real:=v_turno.almacen_id;
  if p_almacen_id is not null and p_almacen_id<>v_almacen_real then raise exception 'El almacén indicado no coincide con el de tu turno abierto.' using errcode='42501'; end if;
  select tipo into v_tipo_almacen from public.almacenes where id=v_almacen_real; if v_tipo_almacen is null then raise exception 'Almacén no encontrado'; end if;
  insert into public.ventas(almacen_id,creado_por,total) values(v_almacen_real,v_uid,0) returning id into v_venta_id;
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_producto_id:=(v_linea->>'producto_id')::uuid; v_cantidad:=(v_linea->>'cantidad')::numeric;
    v_presentacion_id:=nullif(v_linea->>'presentacion_id','')::uuid; v_cantidad_presentacion:=nullif(v_linea->>'cantidad_presentacion','')::numeric;
    if v_presentacion_id is not null then
      select unidades_base into v_cantidad_final from public.obtener_conversion_presentacion(v_producto_id,v_presentacion_id,v_cantidad_presentacion);
    else
      if v_cantidad is null or v_cantidad<=0 then raise exception 'Cantidad inválida en línea de venta'; end if; v_cantidad_final:=v_cantidad;
    end if;
    if v_cantidad_final<=0 then raise exception 'Cantidad inválida en línea de venta'; end if;
    select precio_normal,precio_mayorista,presentacion_id into v_precio_normal,v_precio_mayorista,v_presentacion_producto from public.productos where id=v_producto_id;
    if v_precio_normal is null then raise exception 'Producto no encontrado'; end if;
    v_tipo_precio_linea:=coalesce(nullif(v_linea->>'tipo_precio',''),p_tipo_precio);
    if v_tipo_precio_linea not in ('normal','mayorista') then raise exception 'Tipo de precio inválido en línea'; end if;
    if v_tipo_precio_linea='mayorista' then
      if v_precio_mayorista is null then raise exception 'El producto no tiene precio mayorista configurado'; end if;
      if v_presentacion_producto is null then raise exception 'No se puede vender mayorista el producto % sin presentación mayorista definida',v_producto_id; end if;
      if v_presentacion_id is null then v_presentacion_id:=v_presentacion_producto; end if;
      if v_presentacion_id<>v_presentacion_producto then raise exception 'La presentación mayorista indicada no coincide con la presentación definida del producto'; end if;
      v_precio:=v_precio_mayorista;
    else
      v_precio:=v_precio_normal;
    end if;
    select cantidad into v_stock_actual from public.stock where producto_id=v_producto_id and almacen_id=v_almacen_real for update;
    if v_stock_actual is null or v_stock_actual<v_cantidad_final then raise exception 'Stock insuficiente para el producto %',v_producto_id; end if;
    v_subtotal:=v_cantidad_final*v_precio; v_total:=v_total+v_subtotal; v_restante:=v_cantidad_final; v_costo_total_linea:=0;
    for v_lote in select id,cantidad_restante,costo_unitario from public.lotes_compra where producto_id=v_producto_id and almacen_id=v_almacen_real and cantidad_restante>0 order by fecha_compra asc for update loop
      exit when v_restante<=0; v_tomar:=least(v_lote.cantidad_restante,v_restante); update public.lotes_compra set cantidad_restante=cantidad_restante-v_tomar where id=v_lote.id; v_costo_total_linea:=v_costo_total_linea+(v_tomar*v_lote.costo_unitario); v_restante:=v_restante-v_tomar;
    end loop;
    if v_costo_total_linea>0 then v_costo_unitario_fifo:=v_costo_total_linea/v_cantidad_final; else v_costo_unitario_fifo:=null; end if;
    insert into public.ventas_lineas(venta_id,producto_id,cantidad,precio_unitario,subtotal,costo_unitario_fifo) values(v_venta_id,v_producto_id,v_cantidad_final,v_precio,v_subtotal,v_costo_unitario_fifo);
    update public.stock set cantidad=cantidad-v_cantidad_final where producto_id=v_producto_id and almacen_id=v_almacen_real;
  end loop;
  update public.ventas set total=v_total where id=v_venta_id;
  update private.operaciones_idempotencia set resultado_id=v_venta_id where idempotency_key=p_idempotency_key;
  return v_venta_id;
end;
$function$;
REVOKE EXECUTE ON FUNCTION public.registrar_venta(uuid,jsonb,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.registrar_venta(uuid,jsonb,uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_venta(uuid,jsonb,uuid,text) TO authenticated;
