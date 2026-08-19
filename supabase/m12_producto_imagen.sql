-- Migración m12_producto_imagen — Misión 9.3, Tarea 1 (imagen por producto)
-- Ya fue APLICADA en producción (proyecto papxnkkjtkxsitcsvcme) vía
-- Supabase MCP. Este archivo queda en el repo como registro/documentación.

alter table public.productos add column if not exists imagen_url text;

create or replace function public.actualizar_imagen_producto(
  p_producto_id uuid,
  p_imagen_url text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.tiene_permiso('productos','editar') then
    raise exception 'Sin permiso para editar productos';
  end if;

  if not exists (select 1 from public.productos where id = p_producto_id) then
    raise exception 'Producto no encontrado';
  end if;

  if p_imagen_url is not null and btrim(p_imagen_url) = '' then
    p_imagen_url := null;
  end if;

  update public.productos
  set imagen_url = p_imagen_url
  where id = p_producto_id;

  return p_producto_id;
end;
$function$;

revoke all on function public.actualizar_imagen_producto(uuid, text) from public, anon;
grant execute on function public.actualizar_imagen_producto(uuid, text) to authenticated;

-- Storage: bucket público "productos" + políticas RLS sobre storage.objects
-- (también ya aplicado; se documenta aquí para reproducibilidad).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', true, 5242880, array['image/jpeg','image/png','image/jpg'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/jpg'];

create policy "productos_imagenes_select_publico"
on storage.objects for select
to public
using (bucket_id = 'productos');

create policy "productos_imagenes_insert_autorizado"
on storage.objects for insert
to authenticated
with check (bucket_id = 'productos' and public.tiene_permiso('productos','editar'));

create policy "productos_imagenes_update_autorizado"
on storage.objects for update
to authenticated
using (bucket_id = 'productos' and public.tiene_permiso('productos','editar'))
with check (bucket_id = 'productos' and public.tiene_permiso('productos','editar'));

create policy "productos_imagenes_delete_autorizado"
on storage.objects for delete
to authenticated
using (bucket_id = 'productos' and public.tiene_permiso('productos','editar'));
