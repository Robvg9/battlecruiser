-- Restrict legacy read RPCs that execute as SECURITY DEFINER.
-- These functions cross table/RLS boundaries and must validate the caller.

create or replace function public.listar_movimientos_caja(p_almacen_id uuid default null,p_desde date default null,p_hasta date default null,p_limite integer default 100,p_offset integer default 0)
returns table(id uuid,fecha timestamptz,tipo text,direccion text,monto numeric,almacen_nombre text,concepto text,usuario_nombre text,referencia_tipo text,referencia_id uuid)
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
begin
  perform public._validar_usuario_operacion('entregas_caja','ver');
  return query select x.id,x.fecha,x.tipo,x.direccion,x.monto,x.almacen_nombre,x.concepto,x.usuario_nombre,x.referencia_tipo,x.referencia_id from (
    select m.id,m.creado_en as fecha,m.tipo,m.direccion,m.monto,a.nombre as almacen_nombre,m.concepto,m.creado_nombre as usuario_nombre,m.referencia_tipo,m.referencia_id from public.movimientos_caja m left join public.almacenes a on a.id=m.almacen_id where (p_almacen_id is null or m.almacen_id=p_almacen_id) and (p_desde is null or m.creado_en::date>=p_desde) and (p_hasta is null or m.creado_en::date<=p_hasta)
    union all
    select v.id,v.fecha,'VENTA'::text,'ENTRADA'::text,v.total,a.nombre,'Venta',u.nombre,'venta',v.id from public.ventas v left join public.almacenes a on a.id=v.almacen_id left join public.usuarios u on u.id=v.creado_por where (p_almacen_id is null or v.almacen_id=p_almacen_id) and (p_desde is null or v.fecha::date>=p_desde) and (p_hasta is null or v.fecha::date<=p_hasta)
  ) x order by x.fecha desc limit greatest(coalesce(p_limite,100),1) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function public.listar_reinversiones(p_almacen_id uuid default null,p_desde date default null,p_hasta date default null,p_limite integer default 50,p_offset integer default 0)
returns table(id uuid,almacen_id uuid,almacen_nombre text,proveedor text,fecha timestamptz,total numeric,usuario_nombre text,lineas jsonb)
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
begin
  perform public._validar_usuario_operacion('reinversiones','ver');
  return query select r.id,r.almacen_id,a.nombre,r.proveedor,r.fecha,r.total,r.usuario_nombre,coalesce((select jsonb_agg(jsonb_build_object('producto_id',l.producto_id,'producto_nombre',p.nombre,'presentacion_id',l.presentacion_id,'cantidad_presentacion',l.cantidad_presentacion,'cantidad_base',l.cantidad_base,'costo_total',l.costo_total,'costo_unitario',l.costo_unitario) order by l.id) from public.reinversiones_lineas l join public.productos p on p.id=l.producto_id where l.reinversion_id=r.id),'[]'::jsonb)
  from public.reinversiones r join public.almacenes a on a.id=r.almacen_id
  where (p_almacen_id is null or r.almacen_id=p_almacen_id) and (p_desde is null or r.fecha::date>=p_desde) and (p_hasta is null or r.fecha::date<=p_hasta)
  order by r.fecha desc limit greatest(coalesce(p_limite,50),1) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function public.calcular_dinero_esperado_turno(p_turno_id uuid)
returns numeric language plpgsql security definer set search_path to 'public','private','pg_temp' as $function$
declare t record; total numeric:=0; hasta timestamptz;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado.' using errcode='42501'; end if;
  if not exists(select 1 from public.turnos t0 where t0.id=p_turno_id and (public.tiene_permiso('turnos','ver') or t0.creado_por=auth.uid() or exists(select 1 from public.turno_asignaciones ta where ta.turno_id=t0.id and ta.usuario_id=auth.uid() and ta.retirado_at is null))) then raise exception 'No tenés permiso para consultar este Turno.' using errcode='42501'; end if;
  select * into t from public.turnos where id=p_turno_id; if t.id is null then return 0; end if; hasta:=coalesce(t.cierre_real,now());
  select coalesce(sum(v.total),0) into total from public.ventas v where v.fecha>=t.apertura_real and v.fecha<=hasta and v.creado_por=t.usuario_id and (t.almacen_id is null or v.almacen_id=t.almacen_id);
  total:=total-coalesce((select sum(m.monto) from public.movimientos_caja m where m.turno_id=p_turno_id and m.direccion='SALIDA'),0);
  return greatest(total,0);
end;
$function$;

create or replace function public.obtener_entrega_inventario_turno(p_ciclo_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
begin
  perform public._validar_usuario_operacion('ciclos','ver');
  return coalesce((select jsonb_build_object('entrega',to_jsonb(e),'lineas',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'producto_id',l.producto_id,'producto_nombre',p.nombre,'presentacion_id',l.presentacion_id,'presentacion_nombre',pr.nombre,'cantidad_base',l.cantidad_base,'cantidad_presentacion',l.cantidad_presentacion) order by p.nombre) from public.turnos_inventario_entrega_lineas l join public.productos p on p.id=l.producto_id left join public.presentaciones pr on pr.id=l.presentacion_id where l.entrega_id=e.id),'[]'::jsonb)) from public.turnos_inventario_entregas e where e.ciclo_origen_id=p_ciclo_id),'null'::jsonb);
end;
$function$;

create or replace function public.bc_turno_estado(p_turno_id uuid)
returns text language plpgsql stable security definer set search_path to 'public','pg_temp' as $function$
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado.' using errcode='42501'; end if;
  if not exists(select 1 from public.turnos t where t.id=p_turno_id and (public.tiene_permiso('turnos','ver') or t.creado_por=auth.uid() or exists(select 1 from public.turno_asignaciones ta where ta.turno_id=t.id and ta.usuario_id=auth.uid() and ta.retirado_at is null))) then raise exception 'No tenés permiso para consultar este Turno.' using errcode='42501'; end if;
  return (select estado_maestro from public.turnos where id=p_turno_id);
end;
$function$;

revoke execute on function public.obtener_email_login_por_nombre(text) from public,anon,authenticated;
