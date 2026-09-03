create or replace function public.crear_producto(p_nombre text, p_categoria_id uuid, p_unidad text, p_precio_normal numeric, p_precio_mayorista numeric, p_idempotency_key uuid default null::uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_producto_id uuid; v_idempotente uuid;
begin
  if not public.tiene_permiso('productos','crear') then raise exception 'Sin permiso para crear productos'; end if;
  if p_idempotency_key is null then raise exception 'Se requiere idempotency_key'; end if;
  v_idempotente:=private.reclamar_idempotencia(p_idempotency_key,auth.uid(),'crear_producto',jsonb_build_object('nombre',p_nombre,'categoria_id',p_categoria_id,'unidad',p_unidad,'precio_normal',p_precio_normal,'precio_mayorista',p_precio_mayorista));
  if v_idempotente is not null then return v_idempotente; end if;
  if p_nombre is null or btrim(p_nombre)='' then raise exception 'El nombre del producto es requerido'; end if;
  if p_precio_normal is not null and p_precio_normal < 0 then raise exception 'El precio normal debe ser mayor o igual a cero'; end if;
  if p_precio_mayorista is not null and p_precio_mayorista < 0 then raise exception 'El precio mayorista debe ser mayor o igual a cero'; end if;
  if p_categoria_id is not null and not exists(select 1 from public.categorias where id=p_categoria_id) then raise exception 'Categoría no encontrada'; end if;
  insert into public.productos(nombre,categoria_id,unidad,precio_normal,precio_mayorista) values(btrim(p_nombre),p_categoria_id,p_unidad,p_precio_normal,p_precio_mayorista) returning id into v_producto_id;
  update private.operaciones_idempotencia set resultado_id=v_producto_id where idempotency_key=p_idempotency_key;
  return v_producto_id;
end; $$;
