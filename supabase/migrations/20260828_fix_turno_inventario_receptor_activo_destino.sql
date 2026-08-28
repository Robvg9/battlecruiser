-- BattleCruiser TURNO: receptor de entrega de inventario = responsable activo del destino.
-- Corrige el deadlock entre cierre de sesiones, recepción de inventario y creación del sucesor.

CREATE OR REPLACE FUNCTION public.bc_registrar_entrega_inventario(p_turno_id uuid, p_usuario_receptor uuid DEFAULT NULL::uuid, p_comentario text DEFAULT NULL::text)
RETURNS public.turno_entregas_inventario
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
declare r public.turno_entregas_inventario; receptor uuid; almacen uuid; es_punto_venta boolean;
begin
  if not public.bc_actor_is_admin() and not exists (select 1 from public.usuarios u where u.id=auth.uid() and coalesce(u.puede_transportar_mercancia,false)=true and u.activo=true) then
    raise exception 'Solo ADMIN o transportista autorizado puede registrar una entrega';
  end if;
  select t.almacen_id into almacen from public.turnos t where t.id=p_turno_id;
  if almacen is null then raise exception 'Turno no encontrado o sin almacén'; end if;
  select coalesce(a.es_punto_venta,false) into es_punto_venta from public.almacenes a where a.id=almacen;
  if es_punto_venta then
    select tr.usuario_id into receptor
    from public.turno_tramos tr join public.turno_sesiones s on s.id=tr.turno_sesion_id
    where s.almacen_id=almacen and s.estado='EN_CURSO' and tr.estado='ACTIVO'
    order by tr.inicio_at desc limit 1;
    if receptor is null then raise exception 'No hay una persona responsable con sesión activa en el punto de venta para recibir la mercancía'; end if;
    if p_usuario_receptor is not null and p_usuario_receptor <> receptor then raise exception 'El receptor no puede ser elegido manualmente; debe ser quien tenga la sesión activa en el punto de venta'; end if;
  else
    if not public.bc_actor_is_admin() then raise exception 'En un almacén de almacenamiento solo ADMIN puede aprobar/recibir la mercancía'; end if;
    receptor := auth.uid();
  end if;
  if exists(select 1 from public.turno_entregas_inventario where turno_id=p_turno_id and estado in ('PENDIENTE','RECIBIDO','CON_DIFERENCIAS')) then raise exception 'Ya existe una entrega no cerrada para este Turno'; end if;
  insert into public.turno_entregas_inventario(turno_id,entregado_por,recibido_por,estado,comentario) values(p_turno_id,auth.uid(),receptor,'PENDIENTE',p_comentario) returning * into r;
  insert into public.turno_eventos(turno_id,actor_user_id,tipo,payload) values(p_turno_id,auth.uid(),'ENTREGA_INVENTARIO',jsonb_build_object('receptor',receptor,'punto_venta',es_punto_venta));
  return r;
end;
$$;

CREATE OR REPLACE FUNCTION public.bc_recibir_entrega_inventario(p_entrega_id uuid, p_comentario text DEFAULT NULL::text)
RETURNS public.turno_entregas_inventario
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
declare e public.turno_entregas_inventario; r public.turno_entregas_inventario; receptor uuid; almacen uuid; es_punto_venta boolean;
begin
 select * into e from public.turno_entregas_inventario where id=p_entrega_id for update;
 if e.id is null then raise exception 'Entrega no encontrada'; end if;
 if e.estado <> 'PENDIENTE' then raise exception 'La entrega no está pendiente'; end if;
 if e.entregado_por=auth.uid() and not public.bc_actor_is_admin() then raise exception 'El receptor debe ser distinto del responsable que entrega'; end if;
 select t.almacen_id into almacen from public.turnos t where t.id=e.turno_id;
 if almacen is null then raise exception 'Turno no encontrado o sin almacén'; end if;
 select coalesce(a.es_punto_venta,false) into es_punto_venta from public.almacenes a where a.id=almacen;
 if es_punto_venta then
   select tr.usuario_id into receptor from public.turno_tramos tr join public.turno_sesiones s on s.id=tr.turno_sesion_id where s.almacen_id=almacen and s.estado='EN_CURSO' and tr.estado='ACTIVO' and tr.usuario_id=auth.uid() order by tr.inicio_at desc limit 1;
   if receptor is null then raise exception 'Solo puede recibir la mercancía la persona que tiene una sesión activa y es responsable en el punto de venta'; end if;
 else
   if not public.bc_actor_is_admin() then raise exception 'Solo ADMIN puede recibir mercancía en un almacén de almacenamiento'; end if;
   receptor:=auth.uid();
 end if;
 update public.turno_entregas_inventario set recibido_por=receptor,recibido_at=now(),estado='RECIBIDO',comentario=coalesce(p_comentario,comentario) where id=e.id returning * into r;
 insert into public.turno_sucesiones(turno_anterior_id,entrega_id,almacen_id,recibido_por) values(r.turno_id,r.id,almacen,receptor) on conflict(turno_anterior_id) do update set recibido_por=excluded.recibido_por,entrega_id=excluded.entrega_id;
 insert into public.turno_eventos(turno_id,actor_user_id,tipo,payload) values(r.turno_id,auth.uid(),'INVENTARIO_RECIBIDO',jsonb_build_object('entrega_id',r.id,'receptor',receptor,'punto_venta',es_punto_venta));
 return r;
end;
$$;

CREATE OR REPLACE FUNCTION public.bc_recibir_entrega_inventario(p_entrega_id uuid, p_con_diferencias boolean, p_comentario text)
RETURNS public.turno_entregas_inventario
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
declare e public.turno_entregas_inventario; r public.turno_entregas_inventario; receptor uuid; almacen uuid; es_punto_venta boolean; nuevo_estado text;
begin
 select * into e from public.turno_entregas_inventario where id=p_entrega_id for update;
 if e.id is null then raise exception 'Entrega no encontrada'; end if;
 if e.estado <> 'PENDIENTE' then raise exception 'La entrega no está pendiente'; end if;
 if e.entregado_por=auth.uid() and not public.bc_actor_is_admin() then raise exception 'El receptor debe ser distinto del responsable que entrega'; end if;
 select t.almacen_id into almacen from public.turnos t where t.id=e.turno_id;
 if almacen is null then raise exception 'Turno no encontrado o sin almacén'; end if;
 select coalesce(a.es_punto_venta,false) into es_punto_venta from public.almacenes a where a.id=almacen;
 if es_punto_venta then
   select tr.usuario_id into receptor from public.turno_tramos tr join public.turno_sesiones s on s.id=tr.turno_sesion_id where s.almacen_id=almacen and s.estado='EN_CURSO' and tr.estado='ACTIVO' and tr.usuario_id=auth.uid() order by tr.inicio_at desc limit 1;
   if receptor is null then raise exception 'Solo puede recibir la mercancía la persona que tiene una sesión activa y es responsable en el punto de venta'; end if;
 else
   if not public.bc_actor_is_admin() then raise exception 'Solo ADMIN puede recibir mercancía en un almacén de almacenamiento'; end if;
   receptor:=auth.uid();
 end if;
 nuevo_estado:=case when coalesce(p_con_diferencias,false) then 'CON_DIFERENCIAS' else 'RECIBIDO' end;
 update public.turno_entregas_inventario set recibido_por=receptor,recibido_at=now(),estado=nuevo_estado,comentario=coalesce(p_comentario,comentario) where id=e.id returning * into r;
 insert into public.turno_sucesiones(turno_anterior_id,entrega_id,almacen_id,recibido_por) values(r.turno_id,r.id,almacen,receptor) on conflict(turno_anterior_id) do update set recibido_por=excluded.recibido_por,entrega_id=excluded.entrega_id;
 insert into public.turno_eventos(turno_id,actor_user_id,tipo,payload) values(r.turno_id,auth.uid(),'INVENTARIO_RECIBIDO',jsonb_build_object('entrega_id',r.id,'receptor',receptor,'con_diferencias',coalesce(p_con_diferencias,false),'punto_venta',es_punto_venta));
 return r;
end;
$$;