-- BattleCruiser — M18 — Compras múltiples
-- Aplicada en producción: 2026-08-22
-- Objetivo: registrar una compra como documento con N líneas atómicas.
-- Reutiliza lotes_compra + stock existentes; no crea una segunda fuente FIFO.

create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(),
  almacen_id uuid not null references public.almacenes(id),
  proveedor text,
  fecha timestamptz not null default now(),
  usuario_id uuid references public.usuarios(id),
  usuario_nombre text,
  total numeric not null default 0,
  idempotency_key uuid,
  creado_en timestamptz not null default now()
);

create index if not exists idx_compras_fecha on public.compras(fecha desc);
create index if not exists idx_compras_almacen on public.compras(almacen_id);
create index if not exists idx_compras_usuario on public.compras(usuario_id);

alter table public.compras enable row level security;
revoke all on public.compras from anon, authenticated;

create or replace function public.registrar_compra_multiple(
  p_almacen_id uuid,
  p_proveedor text default null,
  p_fecha timestamptz default now(),
  p_lineas jsonb default '[]'::jsonb,
  p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_compra_id uuid;
  v_linea jsonb;
  v_producto_id uuid;
  v_cantidad numeric;
  v_costo numeric;
  v_presentacion_id uuid;
  v_cantidad_presentacion numeric;
  v_cantidad_final numeric;
  v_total numeric := 0;
  v_usuario_nombre text;
  v_idempotente uuid;
begin
  if v_uid is null then raise exception 'No hay sesión activa.' using errcode='42501'; end if;
  if not public.tiene_permiso('productos','crear') then raise exception 'Sin permiso para registrar compras' using errcode='42501'; end if;
  if p_idempotency_key is null then raise exception 'Se requiere idempotency_key'; end if;
  if p_lineas is null or jsonb_array_length(p_lineas)=0 then raise exception 'La compra debe tener al menos un producto'; end if;
  if not exists(select 1 from public.almacenes where id=p_almacen_id) then raise exception 'Almacén no encontrado'; end if;

  v_idempotente := private.reclamar_idempotencia(p_idempotency_key,v_uid,'registrar_compra_multiple',jsonb_build_object('almacen_id',p_almacen_id,'proveedor',p_proveedor,'fecha',p_fecha,'lineas',p_lineas));
  if v_idempotente is not null then return v_idempotente; end if;

  select nombre into v_usuario_nombre from public.usuarios where id=v_uid;

  insert into public.compras(almacen_id,proveedor,fecha,usuario_id,usuario_nombre,total,idempotency_key)
  values(p_almacen_id,nullif(trim(p_proveedor),''),coalesce(p_fecha,now()),v_uid,v_usuario_nombre,0,p_idempotency_key)
  returning id into v_compra_id;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_producto_id := nullif(v_linea->>'producto_id','')::uuid;
    v_cantidad := nullif(v_linea->>'cantidad','')::numeric;
    v_costo := nullif(v_linea->>'costo_unitario','')::numeric;
    v_presentacion_id := nullif(v_linea->>'presentacion_id','')::uuid;
    v_cantidad_presentacion := nullif(v_linea->>'cantidad_presentacion','')::numeric;

    if v_producto_id is null then raise exception 'Producto requerido en cada línea'; end if;
    if not exists(select 1 from public.productos where id=v_producto_id) then raise exception 'Producto no encontrado: %',v_producto_id; end if;
    if v_costo is null or v_costo < 0 then raise exception 'Costo inválido en línea de compra'; end if;

    if v_presentacion_id is not null then
      select unidades_base into v_cantidad_final from public.obtener_conversion_presentacion(v_producto_id,v_presentacion_id,v_cantidad_presentacion);
    else
      v_cantidad_final := v_cantidad;
    end if;
    if v_cantidad_final is null or v_cantidad_final <= 0 then raise exception 'Cantidad inválida en línea de compra'; end if;

    insert into public.lotes_compra(producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario,fecha_compra,origen,usuario_id)
    values(v_producto_id,p_almacen_id,v_cantidad_final,v_cantidad_final,v_costo,coalesce(p_fecha,now()),'compra',v_uid);

    insert into public.stock(producto_id,almacen_id,cantidad,minimo)
    values(v_producto_id,p_almacen_id,v_cantidad_final,0)
    on conflict(producto_id,almacen_id) do update set cantidad=public.stock.cantidad+excluded.cantidad,updated_at=now();

    v_total := v_total + (v_cantidad_final * v_costo);
  end loop;

  update public.compras set total=v_total where id=v_compra_id;
  update private.operaciones_idempotencia set resultado_id=v_compra_id where idempotency_key=p_idempotency_key;
  return v_compra_id;
end;
$$;

revoke execute on function public.registrar_compra_multiple(uuid,text,timestamptz,jsonb,uuid) from public, anon;
grant execute on function public.registrar_compra_multiple(uuid,text,timestamptz,jsonb,uuid) to authenticated;
