-- BattleCruiser: auditable physical stock counts + transfer receiver/share payload.
-- No stock is adjusted by this migration or by the inventory-audit RPCs.
begin;

alter table public.transferencias
  add column if not exists recibido_por uuid references public.usuarios(id) on delete set null;

create index if not exists transferencias_recibido_por_fecha_idx
  on public.transferencias(recibido_por, fecha desc)
  where recibido_por is not null;

create table if not exists public.inventario_auditorias (
  id uuid primary key default gen_random_uuid(),
  almacen_id uuid not null references public.almacenes(id) on delete restrict,
  estado text not null default 'ABIERTA'
    check (estado in ('ABIERTA','COMPLETADA','COMPLETADA_CON_DIFERENCIAS','CANCELADA')),
  creado_por uuid not null references public.usuarios(id) on delete restrict,
  creado_en timestamptz not null default now(),
  finalizado_por uuid references public.usuarios(id) on delete restrict,
  finalizado_en timestamptz,
  total_lineas integer not null default 0 check (total_lineas >= 0),
  observaciones text
);

create unique index if not exists inventario_auditoria_una_abierta_por_almacen_uidx
  on public.inventario_auditorias(almacen_id)
  where estado = 'ABIERTA';

create index if not exists inventario_auditorias_historial_idx
  on public.inventario_auditorias(almacen_id, creado_en desc);

create table if not exists public.inventario_auditoria_lineas (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references public.inventario_auditorias(id) on delete restrict,
  producto_id uuid not null references public.productos(id) on delete restrict,
  producto_nombre text not null,
  unidad text not null,
  cantidad_sistema numeric not null check (cantidad_sistema >= 0),
  cantidad_fisica numeric check (cantidad_fisica >= 0),
  motivo text,
  contado_por uuid references public.usuarios(id) on delete restrict,
  contado_en timestamptz,
  unique (auditoria_id, producto_id)
);

create index if not exists inventario_auditoria_lineas_orden_idx
  on public.inventario_auditoria_lineas(auditoria_id, producto_nombre);

alter table public.almacenes
  add column if not exists auditoria_inventario_activa_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'almacenes_auditoria_inventario_activa_fk'
      and conrelid = 'public.almacenes'::regclass
  ) then
    alter table public.almacenes
      add constraint almacenes_auditoria_inventario_activa_fk
      foreign key (auditoria_inventario_activa_id)
      references public.inventario_auditorias(id)
      on delete restrict;
  end if;
end $$;

alter table public.inventario_auditorias enable row level security;
alter table public.inventario_auditoria_lineas enable row level security;
revoke all on public.inventario_auditorias from public, anon, authenticated;
revoke all on public.inventario_auditoria_lineas from public, anon, authenticated;

create or replace function public.bc_guard_stock_during_inventory_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_almacen_id uuid;
  v_auditoria_id uuid;
begin
  if tg_op = 'INSERT' then
    for v_almacen_id in
      select distinct x.id
      from unnest(array[new.almacen_id]) as x(id)
      where x.id is not null
      order by x.id
    loop
      select a.auditoria_inventario_activa_id
        into v_auditoria_id
      from public.almacenes a
      where a.id = v_almacen_id
      for share;

      if v_auditoria_id is not null then
        raise exception 'El almacén está bloqueado por un conteo físico de inventario abierto.'
          using errcode = '55006';
      end if;
    end loop;
    return new;
  elsif tg_op = 'DELETE' then
    for v_almacen_id in
      select distinct x.id
      from unnest(array[old.almacen_id]) as x(id)
      where x.id is not null
      order by x.id
    loop
      select a.auditoria_inventario_activa_id
        into v_auditoria_id
      from public.almacenes a
      where a.id = v_almacen_id
      for share;

      if v_auditoria_id is not null then
        raise exception 'El almacén está bloqueado por un conteo físico de inventario abierto.'
          using errcode = '55006';
      end if;
    end loop;
    return old;
  else
    for v_almacen_id in
      select distinct x.id
      from unnest(array[old.almacen_id, new.almacen_id]) as x(id)
      where x.id is not null
      order by x.id
    loop
      select a.auditoria_inventario_activa_id
        into v_auditoria_id
      from public.almacenes a
      where a.id = v_almacen_id
      for share;

      if v_auditoria_id is not null then
        raise exception 'El almacén está bloqueado por un conteo físico de inventario abierto.'
          using errcode = '55006';
      end if;
    end loop;
    return new;
  end if;
end;
$function$;

drop trigger if exists zz_bc_stock_inventory_audit_lock on public.stock;
create trigger zz_bc_stock_inventory_audit_lock
before insert or update or delete on public.stock
for each row execute function public.bc_guard_stock_during_inventory_audit();

create or replace function public.bc_set_transfer_receiver()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_receiver_text text;
  v_receiver uuid;
begin
  v_receiver_text := nullif(current_setting('app.bc_transfer_receiver_id', true), '');
  if v_receiver_text is not null then
    v_receiver := v_receiver_text::uuid;
    if not exists (
      select 1
      from public.usuarios u
      where u.id = v_receiver
        and u.activo = true
        and coalesce(u.archivado, false) = false
    ) then
      raise exception 'La persona que recibe no está activa o ya no está disponible.';
    end if;
    new.recibido_por := v_receiver;
  end if;
  return new;
end;
$function$;

drop trigger if exists bc_transfer_receiver_before_insert on public.transferencias;
create trigger bc_transfer_receiver_before_insert
before insert on public.transferencias
for each row execute function public.bc_set_transfer_receiver();

create or replace function public.registrar_transferencia(
  p_origen_id uuid,
  p_destino_id uuid,
  p_lineas jsonb,
  p_idempotency_key uuid,
  p_recibido_por uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_lineas jsonb;
  v_previous_receiver text;
  v_transferencia_id uuid;
begin
  if not public.tiene_permiso('transferencias','crear') then
    raise exception 'Sin permiso para registrar transferencias' using errcode = '42501';
  end if;
  if p_recibido_por is null then
    raise exception 'Debes indicar quién recibe la transferencia.';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La transferencia debe contener al menos un producto.';
  end if;
  if not exists (
    select 1 from public.usuarios u
    where u.id = p_recibido_por
      and u.activo = true
      and coalesce(u.archivado, false) = false
  ) then
    raise exception 'La persona que recibe no está activa o ya no está disponible.';
  end if;

  -- The metadata is included in the legacy RPC idempotency hash but ignored by
  -- its FIFO line parser. The legacy 4-argument signature remains unchanged.
  v_lineas := jsonb_set(
    p_lineas,
    '{0,_bc_recibido_por}',
    to_jsonb(p_recibido_por),
    true
  );

  v_previous_receiver := current_setting('app.bc_transfer_receiver_id', true);
  perform set_config('app.bc_transfer_receiver_id', p_recibido_por::text, true);
  v_transferencia_id := public.registrar_transferencia(
    p_origen_id, p_destino_id, v_lineas, p_idempotency_key
  );
  perform set_config('app.bc_transfer_receiver_id', coalesce(v_previous_receiver, ''), true);
  return v_transferencia_id;
end;
$function$;

create or replace function public.listar_receptores_transferencia()
returns table(id uuid, nombre text)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.tiene_permiso('transferencias','crear') then
    raise exception 'Sin permiso para consultar responsables de transferencia' using errcode = '42501';
  end if;
  return query
    select u.id, u.nombre
    from public.usuarios u
    where u.activo = true
      and coalesce(u.archivado, false) = false
    order by lower(u.nombre), u.id;
end;
$function$;

create or replace function public.obtener_transferencia_compartir(p_transferencia_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if not (
    public.tiene_permiso('transferencias','ver')
    or exists (
      select 1 from public.transferencias tx
      where tx.id = p_transferencia_id and tx.creado_por = auth.uid()
    )
  ) then
    raise exception 'Sin permiso para consultar esta transferencia' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', t.id,
    'fecha', t.fecha,
    'almacen', ad.nombre,
    'recibe', ur.nombre,
    'lineas', coalesce(
      jsonb_agg(
        jsonb_build_object('nombre', p.nombre, 'cantidad', tl.cantidad)
        order by p.nombre
      ) filter (where tl.id is not null),
      '[]'::jsonb
    )
  )
  into v_result
  from public.transferencias t
  join public.almacenes ad on ad.id = t.almacen_destino_id
  left join public.usuarios ur on ur.id = t.recibido_por
  left join public.transferencias_lineas tl on tl.transferencia_id = t.id
  left join public.productos p on p.id = tl.producto_id
  where t.id = p_transferencia_id
  group by t.id, t.fecha, ad.nombre, ur.nombre;

  if v_result is null then
    raise exception 'No se encontró la transferencia para compartir.';
  end if;
  return v_result;
end;
$function$;

create or replace function public.inventario_auditoria_iniciar(p_almacen_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_almacen public.almacenes%rowtype;
  v_auditoria_id uuid;
  v_total integer;
begin
  if auth.uid() is null then
    raise exception 'Sesión no autenticada' using errcode = '42501';
  end if;
  if not (
    public.bc_actor_is_admin()
    or public.tiene_permiso('auditoria','crear')
  ) then
    raise exception 'Sin permiso para iniciar auditorías de inventario' using errcode = '42501';
  end if;

  select * into v_almacen
  from public.almacenes
  where id = p_almacen_id
  for update;

  if not found or v_almacen.activo is not true then
    raise exception 'El almacén no existe o está inactivo.';
  end if;
  if v_almacen.tipo <> 'almacenamiento' then
    raise exception 'El conteo físico solo está disponible para almacenes de almacenamiento.';
  end if;
  if v_almacen.auditoria_inventario_activa_id is not null then
    raise exception 'Este almacén ya tiene un conteo físico abierto.';
  end if;

  insert into public.inventario_auditorias(almacen_id, creado_por, estado)
  values (p_almacen_id, auth.uid(), 'ABIERTA')
  returning id into v_auditoria_id;

  -- Snapshot all active product SKUs/variants. Products without a stock row
  -- are captured as zero so "not counted" remains distinct from a real zero.
  insert into public.inventario_auditoria_lineas(
    auditoria_id, producto_id, producto_nombre, unidad, cantidad_sistema
  )
  select
    v_auditoria_id,
    p.id,
    p.nombre,
    p.unidad,
    coalesce(s.cantidad, 0)
  from public.productos p
  left join public.stock s
    on s.producto_id = p.id and s.almacen_id = p_almacen_id
  where p.activo = true
    and p.archivado_at is null
    and (coalesce(p.inventario_mixto, false) = false or p.producto_padre_id is not null)
  order by lower(p.nombre), p.id;

  get diagnostics v_total = row_count;
  if v_total = 0 then
    raise exception 'No hay productos activos para contar en este almacén.';
  end if;

  update public.inventario_auditorias
  set total_lineas = v_total
  where id = v_auditoria_id;

  update public.almacenes
  set auditoria_inventario_activa_id = v_auditoria_id
  where id = p_almacen_id;

  return v_auditoria_id;
end;
$function$;

create or replace function public.inventario_auditoria_guardar_conteos(
  p_auditoria_id uuid,
  p_conteos jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auditoria public.inventario_auditorias%rowtype;
  v_item jsonb;
  v_linea_id uuid;
  v_cantidad numeric;
  v_motivo text;
  v_guardadas integer := 0;
begin
  if auth.uid() is null or not (
    public.bc_actor_is_admin()
    or public.tiene_permiso('auditoria','crear')
  ) then
    raise exception 'Sin permiso para registrar conteos físicos' using errcode = '42501';
  end if;
  if jsonb_typeof(p_conteos) <> 'array' then
    raise exception 'El conjunto de conteos debe ser una lista.';
  end if;

  select * into v_auditoria
  from public.inventario_auditorias
  where id = p_auditoria_id
  for update;

  if not found or v_auditoria.estado <> 'ABIERTA' then
    raise exception 'La auditoría no está abierta.';
  end if;

  -- Only the creator, an administrator, or a cross-audit editor can change counts.
  if v_auditoria.creado_por <> auth.uid()
    and not public.bc_actor_is_admin()
    and not public.tiene_permiso('auditoria','editar_any') then
    raise exception 'Solo quien inició el conteo o un responsable autorizado puede registrar conteos.' using errcode = '42501';
  end if;

  for v_item in select value from jsonb_array_elements(p_conteos)
  loop
    if not (v_item ? 'linea_id') or not (v_item ? 'cantidad_fisica') then
      raise exception 'Cada conteo debe incluir línea y cantidad física.';
    end if;
    v_linea_id := (v_item->>'linea_id')::uuid;
    v_cantidad := (v_item->>'cantidad_fisica')::numeric;
    v_motivo := nullif(btrim(coalesce(v_item->>'motivo','')), '');

    if v_cantidad is null or v_cantidad < 0 then
      raise exception 'La cantidad física debe ser cero o mayor.';
    end if;

    update public.inventario_auditoria_lineas
    set cantidad_fisica = v_cantidad,
        motivo = v_motivo,
        contado_por = auth.uid(),
        contado_en = now()
    where id = v_linea_id
      and auditoria_id = p_auditoria_id;

    if not found then
      raise exception 'Una línea no pertenece a esta auditoría.';
    end if;
    v_guardadas := v_guardadas + 1;
  end loop;

  return v_guardadas;
end;
$function$;

create or replace function public.inventario_auditoria_finalizar(p_auditoria_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auditoria public.inventario_auditorias%rowtype;
  v_sin_contar integer;
  v_sin_motivo integer;
  v_estado text;
begin
  if auth.uid() is null then
    raise exception 'Sesión no autenticada' using errcode = '42501';
  end if;

  select * into v_auditoria
  from public.inventario_auditorias
  where id = p_auditoria_id
  for update;

  if not found or v_auditoria.estado <> 'ABIERTA' then
    raise exception 'La auditoría no está abierta.';
  end if;

  -- The creator can always close the count they started. Admins and users
  -- with the cross-audit edit permission can close any open count.
  if v_auditoria.creado_por <> auth.uid()
    and not public.bc_actor_is_admin()
    and not public.tiene_permiso('auditoria','editar_any') then
    raise exception 'Solo quien inició el conteo o un responsable autorizado puede finalizarlo.' using errcode = '42501';
  end if;

  select
    count(*) filter (where cantidad_fisica is null),
    count(*) filter (
      where cantidad_fisica is distinct from cantidad_sistema
        and coalesce(btrim(motivo),'') = ''
    )
  into v_sin_contar, v_sin_motivo
  from public.inventario_auditoria_lineas
  where auditoria_id = p_auditoria_id;

  if v_sin_contar > 0 then
    raise exception 'Faltan % productos por contar. Un espacio vacío no equivale a cero.', v_sin_contar;
  end if;
  if v_sin_motivo > 0 then
    raise exception 'Debes explicar cada diferencia antes de finalizar (% pendientes).', v_sin_motivo;
  end if;

  v_estado := case when exists (
    select 1 from public.inventario_auditoria_lineas
    where auditoria_id = p_auditoria_id
      and cantidad_fisica is distinct from cantidad_sistema
  ) then 'COMPLETADA_CON_DIFERENCIAS' else 'COMPLETADA' end;

  update public.inventario_auditorias
  set estado = v_estado, finalizado_por = auth.uid(), finalizado_en = now()
  where id = p_auditoria_id;

  update public.almacenes
  set auditoria_inventario_activa_id = null
  where id = v_auditoria.almacen_id
    and auditoria_inventario_activa_id = p_auditoria_id;

  if not found then
    raise exception 'No se pudo liberar el almacén después del conteo.';
  end if;

  return v_estado;
end;
$function$;

create or replace function public.inventario_auditoria_cancelar(
  p_auditoria_id uuid,
  p_motivo text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auditoria public.inventario_auditorias%rowtype;
  v_motivo text;
begin
  if auth.uid() is null then
    raise exception 'Sesión no autenticada' using errcode = '42501';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo,'')), '');
  if v_motivo is null then
    raise exception 'Debes indicar el motivo para cancelar el conteo.';
  end if;

  select * into v_auditoria
  from public.inventario_auditorias
  where id = p_auditoria_id
  for update;

  if not found or v_auditoria.estado <> 'ABIERTA' then
    raise exception 'La auditoría no está abierta.';
  end if;

  if v_auditoria.creado_por <> auth.uid()
    and not public.bc_actor_is_admin()
    and not public.tiene_permiso('auditoria','editar_any') then
    raise exception 'Solo quien inició el conteo o un responsable autorizado puede cancelarlo.' using errcode = '42501';
  end if;

  update public.inventario_auditorias
  set estado = 'CANCELADA',
      finalizado_por = auth.uid(),
      finalizado_en = now(),
      observaciones = v_motivo
  where id = p_auditoria_id;

  update public.almacenes
  set auditoria_inventario_activa_id = null
  where id = v_auditoria.almacen_id
    and auditoria_inventario_activa_id = p_auditoria_id;

  if not found then
    raise exception 'No se pudo liberar el almacén después de cancelar el conteo.';
  end if;

  return 'CANCELADA';
end;
$function$;

create or replace function public.inventario_auditoria_listar(p_almacen_id uuid default null)
returns table(
  id uuid,
  almacen_id uuid,
  almacen text,
  estado text,
  creado_en timestamptz,
  finalizado_en timestamptz,
  total_lineas integer,
  contadas integer,
  diferencias integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not (
    public.bc_actor_is_admin()
    or public.tiene_permiso('auditoria','ver')
    or public.tiene_permiso('auditoria','crear')
    or public.tiene_permiso('auditoria','editar_any')
  ) then
    raise exception 'Sin permiso para consultar auditorías de inventario' using errcode = '42501';
  end if;

  return query
  select
    a.id, a.almacen_id, w.nombre, a.estado, a.creado_en, a.finalizado_en,
    a.total_lineas,
    count(l.id) filter (where l.cantidad_fisica is not null)::integer,
    count(l.id) filter (where l.cantidad_fisica is not null and l.cantidad_fisica is distinct from l.cantidad_sistema)::integer
  from public.inventario_auditorias a
  join public.almacenes w on w.id = a.almacen_id
  left join public.inventario_auditoria_lineas l on l.auditoria_id = a.id
  where p_almacen_id is null or a.almacen_id = p_almacen_id
  group by a.id, w.nombre
  order by a.creado_en desc
  limit 30;
end;
$function$;

create or replace function public.inventario_auditoria_detalle(p_auditoria_id uuid)
returns table(
  linea_id uuid,
  producto_id uuid,
  producto text,
  unidad text,
  cantidad_sistema numeric,
  cantidad_fisica numeric,
  motivo text,
  contado_por text,
  contado_en timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not (
    public.bc_actor_is_admin()
    or public.tiene_permiso('auditoria','ver')
    or public.tiene_permiso('auditoria','crear')
    or public.tiene_permiso('auditoria','editar_any')
  ) then
    raise exception 'Sin permiso para consultar detalle de auditoría' using errcode = '42501';
  end if;
  return query
  select l.id, l.producto_id, l.producto_nombre, l.unidad,
         l.cantidad_sistema, l.cantidad_fisica, l.motivo,
         u.nombre, l.contado_en
  from public.inventario_auditoria_lineas l
  join public.inventario_auditorias a on a.id = l.auditoria_id
  left join public.usuarios u on u.id = l.contado_por
  where l.auditoria_id = p_auditoria_id
  order by lower(l.producto_nombre), l.producto_id;
end;
$function$;

revoke all on function public.bc_guard_stock_during_inventory_audit() from public, anon, authenticated;
revoke all on function public.bc_set_transfer_receiver() from public, anon, authenticated;
revoke all on function public.registrar_transferencia(uuid,uuid,jsonb,uuid,uuid) from public, anon, authenticated;
revoke all on function public.listar_receptores_transferencia() from public, anon, authenticated;
revoke all on function public.obtener_transferencia_compartir(uuid) from public, anon, authenticated;
revoke all on function public.inventario_auditoria_iniciar(uuid) from public, anon, authenticated;
revoke all on function public.inventario_auditoria_guardar_conteos(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.inventario_auditoria_finalizar(uuid) from public, anon, authenticated;
revoke all on function public.inventario_auditoria_cancelar(uuid,text) from public, anon, authenticated;
revoke all on function public.inventario_auditoria_listar(uuid) from public, anon, authenticated;
revoke all on function public.inventario_auditoria_detalle(uuid) from public, anon, authenticated;

grant execute on function public.registrar_transferencia(uuid,uuid,jsonb,uuid,uuid) to authenticated;
grant execute on function public.listar_receptores_transferencia() to authenticated;
grant execute on function public.obtener_transferencia_compartir(uuid) to authenticated;
grant execute on function public.inventario_auditoria_iniciar(uuid) to authenticated;
grant execute on function public.inventario_auditoria_guardar_conteos(uuid,jsonb) to authenticated;
grant execute on function public.inventario_auditoria_finalizar(uuid) to authenticated;
grant execute on function public.inventario_auditoria_cancelar(uuid,text) to authenticated;
grant execute on function public.inventario_auditoria_listar(uuid) to authenticated;
grant execute on function public.inventario_auditoria_detalle(uuid) to authenticated;

comment on table public.inventario_auditorias is
  'Expediente inmutable de conteo físico. Las diferencias no actualizan stock automáticamente.';
comment on table public.inventario_auditoria_lineas is
  'Snapshot de producto/variante y cantidad del sistema; cantidad_fisica NULL significa no contado.';
comment on column public.almacenes.auditoria_inventario_activa_id is
  'Auditoría física abierta que bloquea movimientos de stock del almacén.';

commit;
