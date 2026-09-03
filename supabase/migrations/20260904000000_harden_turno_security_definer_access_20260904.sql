-- Harden authenticated SECURITY DEFINER Turno RPCs.
-- Prevent IDOR on the Turno detail endpoint and make authentication checks explicit
-- where NULL auth.uid() could otherwise make comparisons evaluate to NULL.

create or replace function public.bc_obtener_expediente_turno(p_turno_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_turno jsonb; v_sessions jsonb;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado.' using errcode='42501'; end if;
  if not exists (
    select 1 from public.turnos t
    where t.id=p_turno_id and t.ciclo_id is null and t.sesion_id is null
      and (public.tiene_permiso('turnos','editar_any') or t.creado_por=auth.uid()
        or exists (select 1 from public.turno_asignaciones ta where ta.turno_id=t.id and ta.usuario_id=auth.uid() and ta.retirado_at is null))
  ) then raise exception 'No tenés permiso para consultar este Turno.' using errcode='42501'; end if;
  select jsonb_build_object('id',t.id,'almacen_id',t.almacen_id,'almacen_nombre',a.nombre,'fecha_inicio',t.fecha,'dias_turno',t.dias_turno,'estado',t.estado,'estado_maestro',t.estado_maestro,'fecha_fin',(t.fecha+greatest(coalesce(t.dias_turno,1)-1,0))) into v_turno
  from public.turnos t left join public.almacenes a on a.id=t.almacen_id
  where t.id=p_turno_id and t.ciclo_id is null and t.sesion_id is null;
  if v_turno is null then raise exception 'Turno no encontrado'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'numero_dia',s.numero_dia,'bloque',s.bloque,'fecha',s.fecha,'estado',s.estado,'cierre_forzado',coalesce(s.cierre_forzado,false),'usuario_id',ta.usuario_id,'usuario_nombre',u.nombre,'dinero_declarado',d.id is not null,'dinero_id',d.id,'dinero_monto',d.monto,'dinero_estado_aprobacion',coalesce(d.estado_aprobacion,'SIN_DECLARACION'),'dinero_aprobado_por',d.aprobado_por,'dinero_aprobado_at',d.aprobado_at) order by s.numero_dia,case when s.bloque='MANANA' then 1 else 2 end),'[]'::jsonb) into v_sessions
  from public.turno_sesiones s
  left join lateral (select x.usuario_id from public.turno_asignaciones x where x.turno_sesion_id=s.id and x.retirado_at is null order by x.asignado_at desc nulls last,x.created_at desc nulls last limit 1) ta on true
  left join public.usuarios u on u.id=ta.usuario_id
  left join lateral (select y.id,y.monto,y.estado_aprobacion,y.aprobado_por,y.aprobado_at from public.turno_declaraciones y where y.turno_sesion_id=s.id order by y.declarado_at desc nulls last,y.created_at desc nulls last limit 1) d on true
  where s.turno_id=p_turno_id;
  return v_turno||jsonb_build_object('sesiones',v_sessions);
end;
$function$;

create or replace function public.bc_crear_sucesor_turno(p_turno_anterior_id uuid,p_dias integer default null)
returns public.turnos language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare a public.turnos; n public.turnos; cfg public.turno_configuracion; dias integer; receptor uuid; i integer; d date;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado.' using errcode='42501'; end if;
  select * into a from public.turnos where id=p_turno_anterior_id for update;
  if a.id is null then raise exception 'Turno anterior no encontrado'; end if;
  if exists(select 1 from public.turno_sucesiones s where s.turno_anterior_id=a.id and s.turno_siguiente_id is not null) then raise exception 'El Turno sucesor ya fue creado'; end if;
  if not exists(select 1 from public.turno_sesiones s where s.turno_id=a.id) then raise exception 'El Turno no tiene sesiones'; end if;
  if exists(select 1 from public.turno_sesiones s where s.turno_id=a.id and s.estado not in ('COMPLETADA','CANCELADA')) then raise exception 'Todas las sesiones deben estar completadas o canceladas antes de crear el sucesor'; end if;
  select s.recibido_por into receptor from public.turno_sucesiones s where s.turno_anterior_id=a.id and s.estado in ('CREADO','PENDIENTE_CREACION') order by s.creado_at desc limit 1;
  if receptor is null then raise exception 'No existe receptor autorizado'; end if;
  if not public.bc_actor_is_admin() and receptor<>auth.uid() then raise exception 'Solo el receptor autorizado puede crear el Turno sucesor'; end if;
  select * into cfg from public.turno_configuracion where id=true;
  if cfg.duracion_fija_habilitada then dias:=cfg.dias_fijos; if p_dias is not null and p_dias<>dias then raise exception 'La duración está fijada en % días',dias; end if; else dias:=p_dias; end if;
  if dias is null or dias not between 1 and 31 then raise exception 'El sucesor debe indicar entre 1 y 31 días'; end if;
  insert into public.turnos(usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,estado_maestro,dias_turno) values(receptor,null,a.almacen_id,current_date,'PROGRAMADO',receptor,receptor,'PROGRAMADO',dias) returning * into n;
  for i in 1..dias loop d:=current_date+(i-1); insert into public.turno_sesiones(turno_id,almacen_id,numero_dia,bloque,fecha) values(n.id,n.almacen_id,i,'MANANA',d),(n.id,n.almacen_id,i,'TARDE',d); end loop;
  insert into public.turno_sucesiones(turno_anterior_id,entrega_id,almacen_id,recibido_por,turno_siguiente_id,estado,creado_por)
  select a.id,e.id,a.almacen_id,receptor,n.id,'CREADO',auth.uid() from public.turno_entregas_inventario e where e.turno_id=a.id and e.recibido_por=receptor order by e.recibido_at desc limit 1;
  insert into public.turno_eventos(turno_id,actor_user_id,tipo,payload) values(n.id,receptor,'TURNO_SUcesor_CREADO',jsonb_build_object('turno_anterior_id',a.id,'dias',dias,'duracion_fija',cfg.duracion_fija_habilitada));
  return n;
end;
$function$;

create or replace function public.bc_declarar_dinero(p_turno_tramo_id uuid,p_monto numeric)
returns public.turno_declaraciones language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare t public.turno_tramos; r public.turno_declaraciones;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado.' using errcode='42501'; end if;
  select * into t from public.turno_tramos where id=p_turno_tramo_id for update;
  if t.id is null or t.estado not in ('ACTIVO','INTERRUMPIDO','COMPLETADO') then raise exception 'Tramo inválido'; end if;
  if t.usuario_id<>auth.uid() then raise exception 'Solo el operador del tramo puede declarar'; end if;
  if p_monto is null or p_monto<0 then raise exception 'Monto inválido'; end if;
  if exists(select 1 from public.turno_declaraciones where turno_tramo_id=t.id) then raise exception 'Este tramo ya tiene una declaración de dinero'; end if;
  insert into public.turno_declaraciones(turno_id,turno_sesion_id,turno_tramo_id,usuario_id,monto) values(t.turno_id,t.turno_sesion_id,t.id,t.usuario_id,p_monto) returning * into r;
  insert into public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload) values(t.turno_id,t.turno_sesion_id,t.id,auth.uid(),'DINERO_DECLARADO',jsonb_build_object('monto',p_monto));
  return r;
end;
$function$;

create or replace function public.bc_iniciar_turno_sesion(p_turno_sesion_id uuid)
returns public.turno_tramos language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare r public.turno_tramos; a public.turno_asignaciones; s public.turno_sesiones;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado.' using errcode='42501'; end if;
  select * into s from public.turno_sesiones where id=p_turno_sesion_id for update;
  if s.id is null then raise exception 'Sesión no encontrada'; end if;
  select * into a from public.turno_asignaciones where turno_sesion_id=s.id and retirado_at is null order by asignado_at desc limit 1;
  if a.id is null then raise exception 'La sesión requiere una dependienta asignada antes de comenzar'; end if;
  if a.usuario_id<>auth.uid() then raise exception 'Solo la dependienta asignada puede iniciar la sesión'; end if;
  if s.estado not in ('PENDIENTE','PROGRAMADA') then raise exception 'La sesión no está disponible para iniciar'; end if;
  if exists(select 1 from public.turno_tramos where turno_sesion_id=s.id and estado='ACTIVO') then raise exception 'La sesión ya está activa'; end if;
  insert into public.turno_tramos(turno_sesion_id,turno_id,usuario_id,tipo,estado) values(s.id,s.turno_id,a.usuario_id,'NORMAL','ACTIVO') returning * into r;
  update public.turno_sesiones set estado='EN_CURSO',updated_at=now() where id=s.id;
  update public.turnos set estado_maestro='EN_CURSO',estado='ABIERTO',apertura_real=coalesce(apertura_real,now()),actualizado_en=now() where id=s.turno_id and estado_maestro='PROGRAMADO';
  insert into public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo) values(s.turno_id,s.id,r.id,auth.uid(),'SESION_INICIADA');
  return r;
end;
$function$;

create or replace function public.bc_interrumpir_y_relevar(p_turno_tramo_id uuid,p_sustituto_id uuid,p_motivo text)
returns public.turno_tramos language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare old public.turno_tramos; r public.turno_tramos;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado.' using errcode='42501'; end if;
  select * into old from public.turno_tramos where id=p_turno_tramo_id for update;
  if old.id is null or old.estado<>'ACTIVO' then raise exception 'Tramo activo no encontrado'; end if;
  if old.usuario_id<>auth.uid() then raise exception 'Solo el operador activo puede interrumpir su tramo'; end if;
  if p_sustituto_id is null or p_sustituto_id=old.usuario_id then raise exception 'Sustituto inválido'; end if;
  if nullif(trim(p_motivo),'') is null then raise exception 'El motivo es obligatorio'; end if;
  if not exists(select 1 from public.usuarios u join public.roles ro on ro.id=u.role_id where u.id=p_sustituto_id and u.activo=true and ro.activo=true and ro.nombre in ('Dependienta','Dueño')) then raise exception 'El sustituto debe ser un usuario activo elegible'; end if;
  update public.turno_tramos set estado='INTERRUMPIDO',fin_at=clock_timestamp(),motivo_interrupcion=p_motivo where id=old.id;
  insert into public.turno_tramos(turno_sesion_id,turno_id,usuario_id,tipo,estado,tramo_anterior_id) values(old.turno_sesion_id,old.turno_id,p_sustituto_id,'RELEVO_INTERRUPCION','ACTIVO',old.id) returning * into r;
  insert into public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload) values(old.turno_id,old.turno_sesion_id,old.id,auth.uid(),'INTERRUPCION_RELEVO',jsonb_build_object('sustituto_id',p_sustituto_id,'motivo',p_motivo,'nuevo_tramo_id',r.id));
  return r;
end;
$function$;

create or replace function public.bc_interrumpir_y_relevar_con_declaracion(p_turno_tramo_id uuid,p_sustituto_id uuid,p_motivo text,p_monto numeric)
returns public.turno_tramos language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare old public.turno_tramos; nuevo public.turno_tramos;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado.' using errcode='42501'; end if;
  if p_monto is null or p_monto<0 then raise exception 'Monto inválido'; end if;
  if nullif(trim(p_motivo),'') is null then raise exception 'El motivo es obligatorio'; end if;
  select tr.* into old from public.turno_tramos tr where tr.turno_sesion_id=p_turno_tramo_id and tr.estado='ACTIVO' order by tr.inicio_at desc limit 1 for update;
  if old.id is null then raise exception 'No hay un tramo activo para interrumpir'; end if;
  if old.usuario_id<>auth.uid() then raise exception 'Solo el operador activo puede interrumpir su tramo'; end if;
  if p_sustituto_id is null or p_sustituto_id=old.usuario_id then raise exception 'Sustituto inválido'; end if;
  if not exists(select 1 from public.usuarios u join public.roles ro on ro.id=u.role_id where u.id=p_sustituto_id and u.activo=true and ro.activo=true and ro.nombre in ('Dependienta','Dueño')) then raise exception 'El sustituto debe ser un usuario activo elegible'; end if;
  if exists(select 1 from public.turno_declaraciones where turno_tramo_id=old.id) then raise exception 'Este tramo ya tiene una declaración de dinero'; end if;
  update public.turno_tramos set estado='INTERRUMPIDO',fin_at=clock_timestamp(),motivo_interrupcion=p_motivo where id=old.id;
  insert into public.turno_declaraciones(turno_id,turno_sesion_id,turno_tramo_id,usuario_id,monto) values(old.turno_id,old.turno_sesion_id,old.id,old.usuario_id,p_monto);
  insert into public.turno_tramos(turno_sesion_id,turno_id,usuario_id,tipo,estado,tramo_anterior_id) values(old.turno_sesion_id,old.turno_id,p_sustituto_id,'RELEVO_INTERRUPCION','ACTIVO',old.id) returning * into nuevo;
  insert into public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload) values(old.turno_id,old.turno_sesion_id,old.id,auth.uid(),'INTERRUPCION_RELEVO',jsonb_build_object('sustituto_id',p_sustituto_id,'motivo',p_motivo,'monto_declarado',p_monto,'nuevo_tramo_id',nuevo.id));
  return nuevo;
end;
$function$;
