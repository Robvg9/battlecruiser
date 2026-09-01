-- BattleCruiser — 2026-09-01 — control operativo final de Turnos
-- Bloques Mañana/Tarde, declaración/aprobación por sesión y cierre forzado ADMIN.

alter table public.turno_declaraciones add column if not exists estado_aprobacion text not null default 'ESPERANDO_APROBACION';
alter table public.turno_declaraciones add column if not exists aprobado_por uuid null;
alter table public.turno_declaraciones add column if not exists aprobado_at timestamptz null;
alter table public.turno_sesiones add column if not exists cierre_forzado boolean not null default false;

drop constraint if exists turno_declaraciones_estado_aprobacion_check;
alter table public.turno_declaraciones add constraint turno_declaraciones_estado_aprobacion_check check (estado_aprobacion in ('ESPERANDO_APROBACION','APROBADA','RECHAZADA'));

create or replace function public.bc_aprobar_declaracion(p_declaracion_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare
  v_uid uuid := auth.uid();
  d public.turno_declaraciones;
  s public.turno_sesiones;
begin
  if v_uid is null then raise exception 'Usuario no autenticado.' using errcode='42501'; end if;
  select * into d from public.turno_declaraciones where id=p_declaracion_id for update;
  if d.id is null then raise exception 'Declaración no encontrada.' using errcode='23503'; end if;
  select * into s from public.turno_sesiones where id=d.turno_sesion_id;
  if s.id is null then raise exception 'Sesión de la declaración no encontrada.' using errcode='23503'; end if;
  if d.estado_aprobacion='APROBADA' then
    return jsonb_build_object('id',d.id,'estado','APROBADA','monto',d.monto,'idempotente',true);
  end if;
  if s.estado <> 'COMPLETADA' then
    raise exception 'La declaración solo puede aprobarse cuando la sesión esté terminada.' using errcode='P0001';
  end if;
  if public.bc_actor_is_admin() then
    null;
  elsif s.bloque='MANANA' then
    if not exists (
      select 1
      from public.turno_asignaciones a
      join public.turno_sesiones ts on ts.id=a.turno_sesion_id
      where ts.turno_id=s.turno_id
        and ts.bloque='TARDE'
        and a.usuario_id=v_uid
        and a.retirado_at is null
    ) then
      raise exception 'El dinero de la mañana solo puede aprobarlo la dependienta asignada a la tarde.' using errcode='42501';
    end if;
  else
    raise exception 'El dinero de la tarde solo puede aprobarlo ADMIN.' using errcode='42501';
  end if;
  update public.turno_declaraciones
     set estado_aprobacion='APROBADA', aprobado_por=v_uid, aprobado_at=now()
   where id=d.id
   returning * into d;
  insert into public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
  values(d.turno_id,d.turno_sesion_id,d.turno_tramo_id,v_uid,'DINERO_DECLARACION_APROBADA',jsonb_build_object('declaracion_id',d.id,'monto',d.monto,'bloque',s.bloque));
  return jsonb_build_object('id',d.id,'estado',d.estado_aprobacion,'monto',d.monto,'aprobado_por',d.aprobado_por,'aprobado_at',d.aprobado_at);
end;
$function$;
revoke execute on function public.bc_aprobar_declaracion(uuid) from public,anon;
grant execute on function public.bc_aprobar_declaracion(uuid) to authenticated;

create or replace function public.bc_obtener_expediente_turno(p_turno_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_turno jsonb; v_sessions jsonb;
begin
  select jsonb_build_object('id',t.id,'almacen_id',t.almacen_id,'almacen_nombre',a.nombre,'fecha_inicio',t.fecha,'dias_turno',t.dias_turno,'estado',t.estado,'estado_maestro',t.estado_maestro,'fecha_fin',(t.fecha+greatest(coalesce(t.dias_turno,1)-1,0)))
    into v_turno
    from public.turnos t
    left join public.almacenes a on a.id=t.almacen_id
   where t.id=p_turno_id and t.ciclo_id is null and t.sesion_id is null;
  if v_turno is null then raise exception 'Turno no encontrado'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'numero_dia',s.numero_dia,'bloque',s.bloque,'fecha',s.fecha,'estado',s.estado,
    'cierre_forzado',coalesce(s.cierre_forzado,false),'usuario_id',ta.usuario_id,'usuario_nombre',u.nombre,
    'dinero_declarado',d.id is not null,'dinero_id',d.id,'dinero_monto',d.monto,
    'dinero_estado_aprobacion',coalesce(d.estado_aprobacion,'SIN_DECLARACION'),
    'dinero_aprobado_por',d.aprobado_por,'dinero_aprobado_at',d.aprobado_at
  ) order by s.numero_dia,case when s.bloque='MANANA' then 1 else 2 end),'[]'::jsonb)
    into v_sessions
    from public.turno_sesiones s
    left join lateral (
      select x.usuario_id from public.turno_asignaciones x
       where x.turno_sesion_id=s.id and x.retirado_at is null
       order by x.asignado_at desc nulls last,x.created_at desc nulls last limit 1
    ) ta on true
    left join public.usuarios u on u.id=ta.usuario_id
    left join lateral (
      select y.id,y.monto,y.estado_aprobacion,y.aprobado_por,y.aprobado_at
        from public.turno_declaraciones y
       where y.turno_sesion_id=s.id
       order by y.declarado_at desc nulls last,y.created_at desc nulls last limit 1
    ) d on true
   where s.turno_id=p_turno_id;
  return v_turno||jsonb_build_object('sesiones',v_sessions);
end;
$function$;
revoke execute on function public.bc_obtener_expediente_turno(uuid) from public,anon;
grant execute on function public.bc_obtener_expediente_turno(uuid) to authenticated;

create or replace function public.bc_declarar_y_cerrar_turno_sesion(p_turno_sesion_id uuid,p_monto numeric)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_uid uuid:=auth.uid();v_sesion public.turno_sesiones;v_tramo public.turno_tramos;v_existing_monto numeric;v_created boolean:=false;v_restantes integer;v_declaracion_id uuid;
begin
  if v_uid is null then raise exception 'Usuario no autenticado.' using errcode='42501'; end if;
  if p_monto is null or p_monto<0 then raise exception 'Monto inválido.' using errcode='22023'; end if;
  select * into v_sesion from public.turno_sesiones where id=p_turno_sesion_id for update;
  if v_sesion.id is null then raise exception 'Sesión no encontrada.' using errcode='23503'; end if;
  if v_sesion.estado<>'EN_CURSO' then raise exception 'La sesión no está en curso.' using errcode='P0001'; end if;
  if not exists(select 1 from public.turno_asignaciones a where a.turno_sesion_id=v_sesion.id and a.usuario_id=v_uid and a.retirado_at is null) then raise exception 'Solo la persona asignada a esta sesión puede cerrarla.' using errcode='42501'; end if;
  select * into v_tramo from public.turno_tramos where turno_sesion_id=v_sesion.id and estado='ACTIVO' and usuario_id=v_uid order by inicio_at desc nulls last,created_at desc nulls last limit 1 for update;
  if v_tramo.id is null then raise exception 'La sesión EN_CURSO no tiene un tramo activo propio.' using errcode='P0001'; end if;
  select d.id,d.monto into v_declaracion_id,v_existing_monto from public.turno_declaraciones d where d.turno_tramo_id=v_tramo.id and d.usuario_id=v_uid limit 1;
  if v_declaracion_id is null then
    insert into public.turno_declaraciones(turno_id,turno_sesion_id,turno_tramo_id,usuario_id,monto,estado_aprobacion)
    values(v_tramo.turno_id,v_tramo.turno_sesion_id,v_tramo.id,v_uid,p_monto,'ESPERANDO_APROBACION') returning id into v_declaracion_id;
    v_created:=true;
    insert into public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
    values(v_tramo.turno_id,v_tramo.turno_sesion_id,v_tramo.id,v_uid,'DINERO_DECLARADO',jsonb_build_object('monto',p_monto,'declaracion_id',v_declaracion_id));
  elsif v_existing_monto<>p_monto then
    raise exception 'Este tramo ya tiene una declaración de dinero diferente.' using errcode='23514';
  end if;
  update public.turno_tramos set estado='COMPLETADO',fin_at=now() where id=v_tramo.id;
  update public.turno_sesiones set estado='COMPLETADA',updated_at=now() where id=v_sesion.id;
  select count(*) into v_restantes from public.turno_sesiones where turno_id=v_sesion.turno_id and estado not in ('COMPLETADA','CANCELADA');
  if v_restantes=0 then
    update public.turnos set estado='CERRADO',estado_maestro='PENDIENTE_APROBACION',cierre_real=coalesce(cierre_real,now()),actualizado_en=now() where id=v_sesion.turno_id;
  else
    update public.turnos set estado='ABIERTO',estado_maestro='EN_CURSO',actualizado_en=now() where id=v_sesion.turno_id;
  end if;
  insert into public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
  values(v_sesion.turno_id,v_sesion.id,v_tramo.id,v_uid,'SESION_CERRADA',jsonb_build_object('declaracion_creada',v_created,'monto',coalesce(v_existing_monto,p_monto),'declaracion_id',v_declaracion_id));
  return jsonb_build_object('sesion_id',v_sesion.id,'tramo_id',v_tramo.id,'turno_id',v_sesion.turno_id,'estado_sesion','COMPLETADA','estado_tramo','COMPLETADO','estado_turno',case when v_restantes=0 then 'PENDIENTE_APROBACION' else 'EN_CURSO' end,'monto',coalesce(v_existing_monto,p_monto),'declaracion_id',v_declaracion_id,'declaracion_creada',v_created);
end;
$function$;
revoke execute on function public.bc_declarar_y_cerrar_turno_sesion(uuid,numeric) from public,anon;
grant execute on function public.bc_declarar_y_cerrar_turno_sesion(uuid,numeric) to authenticated;

create or replace function public.bc_forzar_cierre_turno(p_turno_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_uid uuid:=auth.uid();r jsonb;
begin
  if v_uid is null then raise exception 'Usuario no autenticado.' using errcode='42501'; end if;
  if not public.bc_actor_is_admin() then raise exception 'Solo ADMIN puede forzar el cierre de un turno.' using errcode='42501'; end if;
  perform 1 from public.turnos where id=p_turno_id for update;
  if not found then raise exception 'Turno no encontrado.' using errcode='23503'; end if;
  update public.turno_tramos tr set estado='COMPLETADO',fin_at=coalesce(fin_at,now()) where tr.turno_id=p_turno_id and tr.estado='ACTIVO';
  update public.turno_sesiones s set estado=case when s.estado in ('PENDIENTE','PROGRAMADA') then 'CANCELADA' when s.estado='EN_CURSO' then 'COMPLETADA' else s.estado end,cierre_forzado=true,updated_at=now() where s.turno_id=p_turno_id and s.estado not in ('COMPLETADA','CANCELADA');
  update public.turnos set estado='CERRADO',estado_maestro='CERRADO',cierre_real=coalesce(cierre_real,now()),actualizado_en=now() where id=p_turno_id;
  insert into public.turno_eventos(turno_id,actor_user_id,tipo,payload) values(p_turno_id,v_uid,'TURNO_CIERRE_FORZADO',jsonb_build_object('actor_user_id',v_uid));
  select jsonb_build_object('turno_id',p_turno_id,'estado','CERRADO','forzado',true,'sesiones',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'numero_dia',s.numero_dia,'bloque',s.bloque,'estado',s.estado,'cierre_forzado',s.cierre_forzado,'dinero_estado_aprobacion',(select d.estado_aprobacion from public.turno_declaraciones d where d.turno_sesion_id=s.id order by d.declarado_at desc nulls last limit 1)) order by s.numero_dia,case when s.bloque='MANANA' then 1 else 2 end) from public.turno_sesiones s where s.turno_id=p_turno_id),'[]'::jsonb)) into r;
  return r;
end;
$function$;
revoke execute on function public.bc_forzar_cierre_turno(uuid) from public,anon;
grant execute on function public.bc_forzar_cierre_turno(uuid) to authenticated;
