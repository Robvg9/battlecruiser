\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.usuarios (
  id uuid primary key, nombre text not null,
  activo boolean not null default true, archivado boolean not null default false
);
create table public.almacenes (
  id uuid primary key, nombre text not null,
  activo boolean not null default true, tipo text not null
);
create table public.productos (
  id uuid primary key, nombre text not null, unidad text not null default 'unidad',
  activo boolean not null default true, archivado_at timestamptz,
  inventario_mixto boolean not null default false,
  producto_padre_id uuid references public.productos(id)
);
create table public.stock (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id),
  almacen_id uuid not null references public.almacenes(id),
  cantidad numeric not null default 0,
  unique (producto_id, almacen_id)
);
create table public.transferencias (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(), estado text not null default 'COMPLETADA',
  almacen_origen_id uuid not null references public.almacenes(id),
  almacen_destino_id uuid not null references public.almacenes(id),
  creado_por uuid not null references public.usuarios(id),
  idempotency_key uuid not null unique
);
create table public.transferencias_lineas (
  id uuid primary key default gen_random_uuid(),
  transferencia_id uuid not null references public.transferencias(id),
  producto_id uuid not null references public.productos(id), cantidad numeric not null
);

create or replace function public.tiene_permiso(p_modulo text, p_accion text)
returns boolean language sql stable as $$
  select (p_modulo || ':' || p_accion) =
    any(string_to_array(coalesce(current_setting('app.test_permissions', true), ''), ','))
$$;
create or replace function public.bc_actor_is_admin()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.test_admin', true), 'false') = 'true'
$$;

-- Minimal stand-in for the legacy four-argument RPC. It reads only the FIFO
-- line fields; the receiver wrapper adds harmless metadata to the JSON object.
create or replace function public.registrar_transferencia(
  p_origen_id uuid, p_destino_id uuid, p_lineas jsonb, p_idempotency_key uuid
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_item jsonb;
begin
  if not public.tiene_permiso('transferencias','crear') then
    raise exception 'Sin permiso para registrar transferencias' using errcode = '42501';
  end if;
  insert into public.transferencias(almacen_origen_id,almacen_destino_id,creado_por,idempotency_key)
  values (p_origen_id,p_destino_id,auth.uid(),p_idempotency_key) returning id into v_id;
  for v_item in select value from jsonb_array_elements(p_lineas)
  loop
    insert into public.transferencias_lineas(transferencia_id,producto_id,cantidad)
    values (v_id,(v_item->>'producto_id')::uuid,(v_item->>'cantidad')::numeric);
  end loop;
  return v_id;
end;
$$;

create or replace function public.test_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok,false) then raise exception 'ASSERTION FAILED: %',p_message; end if;
end;
$$;

insert into public.usuarios(id,nombre,activo,archivado) values
('00000000-0000-0000-0000-000000000001','Audit Owner',true,false),
('00000000-0000-0000-0000-000000000002','Creator Without Cross Edit',true,false),
('00000000-0000-0000-0000-000000000003','Cross Audit Editor',true,false),
('00000000-0000-0000-0000-000000000004','Transfer Receiver',true,false),
('00000000-0000-0000-0000-000000000005','Inactive Receiver',false,false),
('00000000-0000-0000-0000-000000000006','Archived Receiver',true,true);
insert into public.almacenes(id,nombre,activo,tipo) values
('00000000-0000-0000-0000-000000000101','Almacén Central',true,'almacenamiento'),
('00000000-0000-0000-0000-000000000102','Punto Minorista',true,'minorista');
insert into public.productos(id,nombre,unidad,activo,archivado_at,inventario_mixto,producto_padre_id) values
('00000000-0000-0000-0000-000000000201','Agua 1L','unidad',true,null,false,null),
('00000000-0000-0000-0000-000000000202','Refresco','unidad',true,null,false,null),
('00000000-0000-0000-0000-000000000203','Cerveza Mixta','unidad',true,null,true,null),
('00000000-0000-0000-0000-000000000204','Cerveza Mixta - Variante','unidad',true,null,true,'00000000-0000-0000-0000-000000000203'),
('00000000-0000-0000-0000-000000000205','Producto Archivado','unidad',true,now(),false,null);
insert into public.stock(producto_id,almacen_id,cantidad) values
('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101',8),
('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000102',50);
