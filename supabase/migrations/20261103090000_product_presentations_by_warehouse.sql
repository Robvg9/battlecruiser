-- BattleCruiser: enforce that each sales warehouse consumes its own product presentation.
-- No schema or historical-data changes: productos.presentacion_id is the established
-- canonical pointer to the wholesale association; any other active association is retail.
BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_venta(p_almacen_id uuid, p_lineas jsonb, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_venta_id uuid;v_tipo_almacen text;v_linea jsonb;v_producto_id uuid;v_cantidad numeric;v_presentacion_id uuid;v_cantidad_presentacion numeric;v_cantidad_final numeric;v_precio_normal numeric;v_precio_mayorista numeric;v_precio numeric;v_precio_unitario numeric;v_subtotal numeric;v_total numeric:=0;v_stock_actual numeric;v_restante numeric;v_lote record;v_tomar numeric;v_idempotente uuid;v_costo_total_linea numeric;v_costo_unitario_fifo numeric;v_uid uuid;v_turno record;v_almacen_real uuid;v_factor numeric;v_presentacion_producto uuid;v_presentacion_count integer;
begin
 if not public.tiene_permiso('ventas','crear') then raise exception 'Sin permiso para registrar ventas'; end if;
 if p_lineas is null or jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas)=0 then raise exception 'La venta debe tener al menos un producto'; end if;
 if p_idempotency_key is null then raise exception 'Se requiere idempotency_key'; end if;
 v_uid:=auth.uid(); if v_uid is null then raise exception 'No hay sesión activa.' using errcode='42501'; end if;
 v_idempotente:=private.reclamar_idempotencia(p_idempotency_key,v_uid,'registrar_venta',jsonb_build_object('almacen_id',p_almacen_id,'lineas',p_lineas)); if v_idempotente is not null then return v_idempotente; end if;
 select * into v_turno from public.turnos where usuario_id=v_uid and estado='ABIERTO' limit 1; if v_turno.id is null then raise exception 'No tenés un turno abierto. No podés registrar ventas.' using errcode='42501'; end if;
 if v_turno.almacen_id is null then raise exception 'Tu turno no tiene almacén asignado. No podés registrar ventas.' using errcode='42501'; end if;
 v_almacen_real:=v_turno.almacen_id;
 if p_almacen_id is not null and p_almacen_id<>v_almacen_real then raise exception 'El almacén indicado no coincide con el de tu turno abierto.' using errcode='42501'; end if;
 select tipo into v_tipo_almacen from public.almacenes where id=v_almacen_real; if v_tipo_almacen is null then raise exception 'Almacén no encontrado'; end if;
 insert into public.ventas(almacen_id,creado_por,total) values(v_almacen_real,v_uid,0) returning id into v_venta_id;
 for v_linea in select * from jsonb_array_elements(p_lineas) loop
  v_producto_id:=(v_linea->>'producto_id')::uuid;v_cantidad:=(v_linea->>'cantidad')::numeric;v_presentacion_id:=nullif(v_linea->>'presentacion_id','')::uuid;v_cantidad_presentacion:=nullif(v_linea->>'cantidad_presentacion','')::numeric;
  if v_presentacion_id is null then raise exception 'No se puede vender el producto % sin presentación definida',v_producto_id; end if;
  select pp.factor into v_factor from public.producto_presentaciones pp where pp.producto_id=v_producto_id and pp.presentacion_id=v_presentacion_id and pp.activo is distinct from false limit 1;
  if v_factor is null or v_factor<=0 then raise exception 'La presentación indicada no está definida para el producto %',v_producto_id; end if;
  select unidades_base into v_cantidad_final from public.obtener_conversion_presentacion(v_producto_id,v_presentacion_id,v_cantidad_presentacion);
  if v_cantidad_final is null or v_cantidad_final<=0 then raise exception 'Cantidad inválida en línea de venta'; end if;
  select precio_normal,precio_mayorista,presentacion_id into v_precio_normal,v_precio_mayorista,v_presentacion_producto from public.productos where id=v_producto_id;
  if v_precio_normal is null and v_precio_mayorista is null then raise exception 'El producto % no tiene precio configurado',v_producto_id; end if;
  if v_tipo_almacen is null or v_tipo_almacen not in ('minorista','mayorista') then raise exception 'Este tipo de almacén no admite ventas'; end if;
  if v_tipo_almacen='mayorista' then
    if v_presentacion_producto is null or v_presentacion_id is distinct from v_presentacion_producto then
      raise exception 'El producto % no tiene presentación mayorista definida para este almacén',v_producto_id;
    end if;
  elsif v_presentacion_producto is not null and v_presentacion_id=v_presentacion_producto then
    raise exception 'El producto % solo tiene presentación mayorista y no puede venderse en un almacén minorista',v_producto_id;
  end if;
  
  if v_tipo_almacen='mayorista' then
    select count(*)::integer into v_presentacion_count
      from public.producto_presentaciones pp
     where pp.producto_id=v_producto_id
       and pp.presentacion_id=v_presentacion_producto
       and pp.activo is distinct from false;
  else
    select count(*)::integer into v_presentacion_count
      from public.producto_presentaciones pp
     where pp.producto_id=v_producto_id
       and pp.presentacion_id is distinct from v_presentacion_producto
       and pp.activo is distinct from false;
  end if;
  if v_presentacion_count<>1 then
    raise exception 'El producto % no tiene una única presentación activa para el almacén %',v_producto_id,v_tipo_almacen;
  end if;

  if v_tipo_almacen='mayorista' then if v_precio_mayorista is null or v_precio_mayorista<=0 then raise exception 'El producto % no tiene precio mayorista configurado',v_producto_id; end if; v_precio:=v_precio_mayorista; else if v_precio_normal is null or v_precio_normal<=0 then raise exception 'El producto % no tiene precio normal configurado',v_producto_id; end if; v_precio:=v_precio_normal; end if;
  select cantidad into v_stock_actual from public.stock where producto_id=v_producto_id and almacen_id=v_almacen_real for update; if v_stock_actual is null or v_stock_actual<v_cantidad_final then raise exception 'Stock insuficiente para el producto %',v_producto_id; end if;
  v_subtotal:=v_cantidad_presentacion*v_precio;v_precio_unitario:=v_subtotal/v_cantidad_final;v_total:=v_total+v_subtotal;v_restante:=v_cantidad_final;v_costo_total_linea:=0;
  for v_lote in select id,cantidad_restante,costo_unitario from public.lotes_compra where producto_id=v_producto_id and almacen_id=v_almacen_real and cantidad_restante>0 order by fecha_compra asc for update loop exit when v_restante<=0;v_tomar:=least(v_lote.cantidad_restante,v_restante);update public.lotes_compra set cantidad_restante=cantidad_restante-v_tomar where id=v_lote.id;v_costo_total_linea:=v_costo_total_linea+(v_tomar*v_lote.costo_unitario);v_restante:=v_restante-v_tomar;end loop;
  if v_costo_total_linea>0 then v_costo_unitario_fifo:=v_costo_total_linea/v_cantidad_final; else v_costo_unitario_fifo:=null; end if;
  insert into public.ventas_lineas(venta_id,producto_id,cantidad,precio_unitario,subtotal,costo_unitario_fifo) values(v_venta_id,v_producto_id,v_cantidad_final,v_precio_unitario,v_subtotal,v_costo_unitario_fifo);
  update public.stock set cantidad=cantidad-v_cantidad_final where producto_id=v_producto_id and almacen_id=v_almacen_real;
 end loop;
 update public.ventas set total=v_total where id=v_venta_id;update private.operaciones_idempotencia set resultado_id=v_venta_id where idempotency_key=p_idempotency_key;return v_venta_id;
end;$function$;


CREATE OR REPLACE FUNCTION public.registrar_venta(p_almacen_id uuid, p_lineas jsonb, p_idempotency_key uuid, p_tipo_precio text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_venta_id uuid;v_linea jsonb;v_producto_id uuid;v_cantidad numeric;v_presentacion_id uuid;v_cantidad_presentacion numeric;v_cantidad_final numeric;v_precio_normal numeric;v_precio_mayorista numeric;v_precio numeric;v_precio_unitario numeric;v_tipo_precio_linea text;v_subtotal numeric;v_total numeric:=0;v_stock_actual numeric;v_restante numeric;v_lote record;v_tomar numeric;v_idempotente uuid;v_costo_total_linea numeric;v_costo_unitario_fifo numeric;v_uid uuid;v_tramo record;v_almacen_real uuid;v_presentacion_producto uuid;v_factor numeric;v_tipo_almacen text;v_presentacion_count integer;
begin
 if not public.tiene_permiso('ventas','crear') then raise exception 'Sin permiso para registrar ventas';end if;
 if p_lineas is null or jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas)=0 then raise exception 'La venta debe tener al menos un producto';end if;
 if p_idempotency_key is null then raise exception 'Se requiere idempotency_key';end if;
 if p_tipo_precio not in ('normal','mayorista') then raise exception 'Tipo de precio inválido';end if;
 v_uid:=auth.uid();if v_uid is null then raise exception 'No hay sesión activa.' using errcode='42501';end if;
 select tt.*,ts.id as sesion_id,ts.estado as sesion_estado,ts.fecha as sesion_fecha,ts.numero_dia,ts.bloque as sesion_bloque,ts.almacen_id as sesion_almacen_id,t.almacen_id as turno_almacen_id,t.estado as turno_estado,t.usuario_id as turno_usuario_id into v_tramo from public.turno_tramos tt join public.turno_sesiones ts on ts.id=tt.turno_sesion_id join public.turnos t on t.id=ts.turno_id where tt.usuario_id=v_uid and tt.estado='ACTIVO' and ts.estado='EN_CURSO' and t.estado='ABIERTO' order by tt.inicio_at desc limit 1;
 if v_tramo.id is null then raise exception 'No tenés una sesión operativa abierta. No podés registrar ventas.' using errcode='42501';end if;
 v_almacen_real:=coalesce(v_tramo.turno_almacen_id,v_tramo.sesion_almacen_id);if v_almacen_real is null then raise exception 'La sesión operativa no tiene almacén asignado. No podés registrar ventas.' using errcode='42501';end if;
 if p_almacen_id is not null and p_almacen_id<>v_almacen_real then raise exception 'El almacén indicado no coincide con el de tu sesión operativa.' using errcode='42501';end if;
 select tipo into v_tipo_almacen from public.almacenes where id=v_almacen_real;
 if v_tipo_almacen not in ('minorista','mayorista') then raise exception 'Este tipo de almacén no admite ventas'; end if;
 v_idempotente:=private.reclamar_idempotencia(p_idempotency_key,v_uid,'registrar_venta',jsonb_build_object('almacen_id',v_almacen_real,'lineas',p_lineas,'tipo_precio',p_tipo_precio));if v_idempotente is not null then return v_idempotente;end if;
 insert into public.ventas(almacen_id,creado_por,total) values(v_almacen_real,v_uid,0) returning id into v_venta_id;
 for v_linea in select * from jsonb_array_elements(p_lineas) loop
  v_producto_id:=(v_linea->>'producto_id')::uuid;v_cantidad:=(v_linea->>'cantidad')::numeric;v_presentacion_id:=nullif(v_linea->>'presentacion_id','')::uuid;v_cantidad_presentacion:=nullif(v_linea->>'cantidad_presentacion','')::numeric;
  if v_presentacion_id is null then raise exception 'No se puede vender el producto % sin presentación definida',v_producto_id;end if;
  select pp.factor into v_factor from public.producto_presentaciones pp where pp.producto_id=v_producto_id and pp.presentacion_id=v_presentacion_id and pp.activo is distinct from false limit 1;
  if v_factor is null or v_factor<=0 then raise exception 'La presentación indicada no está definida para el producto %',v_producto_id;end if;
  select unidades_base into v_cantidad_final from public.obtener_conversion_presentacion(v_producto_id,v_presentacion_id,v_cantidad_presentacion);if v_cantidad_final is null or v_cantidad_final<=0 then raise exception 'Cantidad inválida en línea de venta';end if;
  select precio_normal,precio_mayorista,presentacion_id into v_precio_normal,v_precio_mayorista,v_presentacion_producto from public.productos where id=v_producto_id; if v_precio_normal is null and v_precio_mayorista is null then raise exception 'El producto % no tiene precio configurado',v_producto_id;end if;
  v_tipo_precio_linea:=coalesce(nullif(v_linea->>'tipo_precio',''),p_tipo_precio);if v_tipo_precio_linea not in ('normal','mayorista') then raise exception 'Tipo de precio inválido en línea';end if;
  if v_tipo_almacen='mayorista' then
    if v_presentacion_producto is null or v_presentacion_id is distinct from v_presentacion_producto then
      raise exception 'El producto % no tiene presentación mayorista definida para este almacén',v_producto_id;
    end if;
  elsif v_presentacion_producto is not null and v_presentacion_id=v_presentacion_producto then
    raise exception 'El producto % solo tiene presentación mayorista y no puede venderse en un almacén minorista',v_producto_id;
  end if;
  
  if v_tipo_almacen='mayorista' then
    select count(*)::integer into v_presentacion_count
      from public.producto_presentaciones pp
     where pp.producto_id=v_producto_id
       and pp.presentacion_id=v_presentacion_producto
       and pp.activo is distinct from false;
  else
    select count(*)::integer into v_presentacion_count
      from public.producto_presentaciones pp
     where pp.producto_id=v_producto_id
       and pp.presentacion_id is distinct from v_presentacion_producto
       and pp.activo is distinct from false;
  end if;
  if v_presentacion_count<>1 then
    raise exception 'El producto % no tiene una única presentación activa para el almacén %',v_producto_id,v_tipo_almacen;
  end if;

  if v_tipo_precio_linea='mayorista' then if v_precio_mayorista is null or v_precio_mayorista<=0 then raise exception 'El producto % no tiene precio mayorista configurado',v_producto_id;end if;v_precio:=v_precio_mayorista;else if v_precio_normal is null or v_precio_normal<=0 then raise exception 'El producto % no tiene precio normal configurado',v_producto_id;end if;v_precio:=v_precio_normal;end if;
  select cantidad into v_stock_actual from public.stock where producto_id=v_producto_id and almacen_id=v_almacen_real for update;if v_stock_actual is null or v_stock_actual<v_cantidad_final then raise exception 'Stock insuficiente para el producto %',v_producto_id;end if;
  v_subtotal:=v_cantidad_presentacion*v_precio;v_precio_unitario:=v_subtotal/v_cantidad_final;v_total:=v_total+v_subtotal;v_restante:=v_cantidad_final;v_costo_total_linea:=0;
  for v_lote in select id,cantidad_restante,costo_unitario from public.lotes_compra where producto_id=v_producto_id and almacen_id=v_almacen_real and cantidad_restante>0 order by fecha_compra asc for update loop exit when v_restante<=0;v_tomar:=least(v_lote.cantidad_restante,v_restante);update public.lotes_compra set cantidad_restante=cantidad_restante-v_tomar where id=v_lote.id;v_costo_total_linea:=v_costo_total_linea+(v_tomar*v_lote.costo_unitario);v_restante:=v_restante-v_tomar;end loop;
  if v_costo_total_linea>0 then v_costo_unitario_fifo:=v_costo_total_linea/v_cantidad_final;else v_costo_unitario_fifo:=null;end if;
  insert into public.ventas_lineas(venta_id,producto_id,cantidad,precio_unitario,subtotal,costo_unitario_fifo) values(v_venta_id,v_producto_id,v_cantidad_final,v_precio_unitario,v_subtotal,v_costo_unitario_fifo);update public.stock set cantidad=cantidad-v_cantidad_final where producto_id=v_producto_id and almacen_id=v_almacen_real;
 end loop;
 update public.ventas set total=v_total where id=v_venta_id;update private.operaciones_idempotencia set resultado_id=v_venta_id where idempotency_key=p_idempotency_key;return v_venta_id;
end;$function$;


COMMENT ON FUNCTION public.registrar_venta(uuid,jsonb,uuid) IS
  'Registers sales using the selected package count for revenue and converted base units for stock/FIFO; presentation must match the warehouse channel.';

COMMENT ON FUNCTION public.registrar_venta(uuid,jsonb,uuid,text) IS
  'Registers sales using selected package count for revenue and converted base units for stock/FIFO; price override remains independent from warehouse channel.';

CREATE OR REPLACE FUNCTION public.bc_guardar_producto_catalogo(p_producto_id uuid DEFAULT NULL::uuid, p_nombre text DEFAULT NULL::text, p_categoria_id uuid DEFAULT NULL::uuid, p_unidad text DEFAULT NULL::text, p_precio_normal numeric DEFAULT NULL::numeric, p_precio_mayorista numeric DEFAULT NULL::numeric, p_presentacion_normal text DEFAULT NULL::text, p_factor_normal numeric DEFAULT NULL::numeric, p_presentacion_mayorista text DEFAULT NULL::text, p_factor_mayorista numeric DEFAULT NULL::numeric, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_pres_normal uuid;
  v_pres_mayorista uuid;
  v_norm_name text := nullif(btrim(p_presentacion_normal), '');
  v_wh_name text := nullif(btrim(p_presentacion_mayorista), '');
  v_idem uuid;
begin
  if auth.uid() is null then raise exception 'No hay sesión activa.' using errcode='42501'; end if;
  if p_idempotency_key is null then raise exception 'Se requiere idempotency_key'; end if;
  if p_nombre is null or btrim(p_nombre)='' then raise exception 'El nombre del producto es requerido'; end if;
  if p_precio_normal is not null and p_precio_normal < 0 then raise exception 'El precio normal debe ser mayor o igual a cero'; end if;
  if p_precio_mayorista is not null and p_precio_mayorista < 0 then raise exception 'El precio mayorista debe ser mayor o igual a cero'; end if;
  if v_norm_name is not null and (p_factor_normal is null or p_factor_normal <= 0) then raise exception 'El factor de la presentación normal debe ser mayor que cero'; end if;
  if (v_norm_name is null) <> (p_factor_normal is null) then
    raise exception 'La presentación minorista debe tener etiqueta y factor, o ambos campos vacíos';
  end if;
  if (v_wh_name is null) <> (p_factor_mayorista is null) then
    raise exception 'La presentación mayorista debe tener etiqueta y factor, o ambos campos vacíos';
  end if;
  if v_norm_name is not null and v_wh_name is not null
     and lower(v_norm_name)=lower(v_wh_name) then
    raise exception 'Las etiquetas minorista y mayorista deben ser distintas';
  end if;
  if v_wh_name is not null and (p_factor_mayorista is null or p_factor_mayorista <= 0) then raise exception 'El factor de la presentación mayorista debe ser mayor que cero'; end if;
  if p_factor_normal is not null and p_factor_normal <= 0 then raise exception 'Factor de presentación normal inválido'; end if;
  if p_factor_mayorista is not null and p_factor_mayorista <= 0 then raise exception 'Factor de presentación mayorista inválido'; end if;
  if p_categoria_id is not null and not exists(select 1 from public.categorias where id=p_categoria_id) then raise exception 'Categoría no encontrada'; end if;
  if not public.tiene_permiso('productos','crear') and not public.tiene_permiso('productos','editar') then raise exception 'Sin permiso para guardar productos' using errcode='42501'; end if;

  v_idem := private.reclamar_idempotencia(p_idempotency_key, auth.uid(),'bc_guardar_producto_catalogo',jsonb_build_object('producto_id',p_producto_id,'nombre',p_nombre));
  if v_idem is not null then return v_idem; end if;

  if p_producto_id is null then
    if not public.tiene_permiso('productos','crear') then raise exception 'Sin permiso para crear productos' using errcode='42501'; end if;
    insert into public.productos(nombre,categoria_id,unidad,precio_normal,precio_mayorista)
    values(btrim(p_nombre),p_categoria_id,nullif(btrim(p_unidad),''),coalesce(p_precio_normal,0),p_precio_mayorista)
    returning id into v_id;
  else
    if not public.tiene_permiso('productos','editar') then raise exception 'Sin permiso para editar productos' using errcode='42501'; end if;
    update public.productos set nombre=btrim(p_nombre),categoria_id=p_categoria_id,unidad=nullif(btrim(p_unidad),''),precio_normal=coalesce(p_precio_normal,0),precio_mayorista=p_precio_mayorista where id=p_producto_id returning id into v_id;
    if v_id is null then raise exception 'Producto no encontrado'; end if;
  end if;

  if v_norm_name is not null then
    select id into v_pres_normal from public.presentaciones where lower(btrim(nombre))=lower(v_norm_name) and activo=true order by created_at asc limit 1;
    if v_pres_normal is null then insert into public.presentaciones(nombre) values(v_norm_name) returning id into v_pres_normal; end if;
  end if;
  if v_wh_name is not null then
    select id into v_pres_mayorista from public.presentaciones where lower(btrim(nombre))=lower(v_wh_name) and activo=true order by created_at asc limit 1;
    if v_pres_mayorista is null then insert into public.presentaciones(nombre) values(v_wh_name) returning id into v_pres_mayorista; end if;
  end if;

  delete from public.producto_presentaciones where producto_id=v_id;
  if v_pres_normal is not null then
    insert into public.producto_presentaciones(producto_id,presentacion_id,factor,activo) values(v_id,v_pres_normal,p_factor_normal,true);
  end if;
  if v_pres_mayorista is not null then
    if v_pres_normal is not null and v_pres_mayorista=v_pres_normal and p_factor_mayorista<>p_factor_normal then
      raise exception 'La misma presentación no puede tener dos factores para un producto';
    end if;
    insert into public.producto_presentaciones(producto_id,presentacion_id,factor,activo) values(v_id,v_pres_mayorista,p_factor_mayorista,true);
    update public.productos set presentacion_id=v_pres_mayorista where id=v_id;
  else
    update public.productos set presentacion_id=null where id=v_id;
  end if;

  update private.operaciones_idempotencia set resultado_id=v_id where idempotency_key=p_idempotency_key;
  return v_id;
end;
$function$;


COMMIT;
