-- BATTLECRUISER M25.2
-- Corrige el shadowing entre el alias SQL "s" y la variable RECORD "s".
-- Evita: record "s" is not assigned yet.

create or replace function public.iniciar_sesion_operativa(
  p_sesion_id uuid,
  p_idempotency_key uuid default null,
  p_observacion text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  uid uuid; nombre text; v_sesion record; turno_id uuid; v_idempotente uuid;
begin
  uid := public._validar_usuario_operacion('ciclos','crear');
  if p_idempotency_key is not null then
    v_idempotente := private.reclamar_idempotencia(p_idempotency_key,uid,'iniciar_sesion_operativa',jsonb_build_object('sesion_id',p_sesion_id,'observacion',p_observacion));
    if v_idempotente is not null then
      select t.id into turno_id from public.turnos t where t.sesion_id=p_sesion_id limit 1;
      return jsonb_build_object('id',p_sesion_id,'estado','EN_CURSO','usuario_id',uid,'turno_legacy_id',turno_id,'idempotente',true);
    end if;
  end if;
  select sc.*,c.almacen_id,c.estado as ciclo_estado into v_sesion
  from public.sesiones_ciclo sc join public.ciclos_operativos c on c.id=sc.ciclo_id
  where sc.id=p_sesion_id for update;
  if not found then raise exception 'Sesión operativa no encontrada.' using errcode='23503'; end if;
  if v_sesion.ciclo_estado <> 'ACTIVO' then raise exception 'El ciclo operativo no está activo.' using errcode='P0001'; end if;
  if v_sesion.estado='EN_CURSO' then
    if v_sesion.usuario_id<>uid then raise exception 'La sesión ya está siendo trabajada por otro usuario.' using errcode='42501'; end if;
    select t.id into turno_id from public.turnos t where t.sesion_id=p_sesion_id and t.estado='ABIERTO' limit 1;
    if turno_id is null then raise exception 'La sesión está EN_CURSO pero no tiene un turno ABIERTO asociado.' using errcode='P0001'; end if;
    if p_idempotency_key is not null then update private.operaciones_idempotencia set resultado_id=p_sesion_id where idempotency_key=p_idempotency_key; end if;
    return jsonb_build_object('id',p_sesion_id,'estado','EN_CURSO','usuario_id',uid,'usuario_nombre',v_sesion.usuario_nombre,'turno_legacy_id',turno_id,'idempotente',false);
  end if;
  if v_sesion.estado<>'PENDIENTE' then raise exception 'La sesión no puede iniciarse (estado: %).',v_sesion.estado using errcode='P0001'; end if;
  select u.nombre into nombre from public.usuarios u where u.id=uid;
  if exists(select 1 from public.sesiones_ciclo x where x.usuario_id=uid and x.estado='EN_CURSO' and x.id<>p_sesion_id) then raise exception 'Ya tenés una sesión operativa abierta.' using errcode='P0001'; end if;
  if exists(select 1 from public.turnos x where x.usuario_id=uid and x.estado='ABIERTO') then raise exception 'Ya tenés un turno operativo abierto.' using errcode='P0001'; end if;
  update public.turnos set sesion_id=null, actualizado_en=now() where sesion_id=p_sesion_id and estado='CERRADO';
  select t.id into turno_id from public.turnos t where t.sesion_id=p_sesion_id limit 1;
  if turno_id is not null then raise exception 'La sesión pendiente tiene un turno asociado en un estado no válido.' using errcode='P0001'; end if;
  insert into public.turnos(usuario_id,usuario_nombre,almacen_id,fecha,hora_inicio_prevista,hora_fin_prevista,apertura_real,estado,observacion,creado_por,ciclo_id,sesion_id)
  values(uid,nombre,v_sesion.almacen_id,v_sesion.fecha,v_sesion.hora_inicio_prevista,v_sesion.hora_fin_prevista,now(),'ABIERTO',p_observacion,uid,v_sesion.ciclo_id,p_sesion_id)
  returning id into turno_id;
  update public.sesiones_ciclo set usuario_id=uid,usuario_nombre=nombre,apertura_real=coalesce(apertura_real,now()),observacion=coalesce(p_observacion,observacion),creado_por=coalesce(creado_por,uid),estado='EN_CURSO' where id=p_sesion_id;
  if p_idempotency_key is not null then update private.operaciones_idempotencia set resultado_id=p_sesion_id where idempotency_key=p_idempotency_key; end if;
  return jsonb_build_object('id',p_sesion_id,'estado','EN_CURSO','usuario_id',uid,'usuario_nombre',nombre,'turno_legacy_id',turno_id,'idempotente',false);
end;
$function$;

create or replace function public.cerrar_sesion_operativa(
  p_sesion_id uuid,
  p_idempotency_key uuid default null,
  p_observacion text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  uid uuid; v_sesion record; v_es_admin boolean; turno_id uuid; cuadre_id uuid; v_idempotente uuid;
begin
  uid := public._validar_usuario_operacion('ciclos','editar');
  if p_idempotency_key is not null then
    v_idempotente := private.reclamar_idempotencia(p_idempotency_key,uid,'cerrar_sesion_operativa',jsonb_build_object('sesion_id',p_sesion_id,'observacion',p_observacion));
    if v_idempotente is not null then
      select t.id into turno_id from public.turnos t where t.sesion_id=p_sesion_id limit 1;
      select cu.id into cuadre_id from public.cuadres cu where cu.turno_id=turno_id limit 1;
      return jsonb_build_object('id',p_sesion_id,'estado','COMPLETADA','turno_legacy_id',turno_id,'cuadre_id',cuadre_id,'idempotente',true);
    end if;
  end if;
  select sc.*,c.almacen_id,c.estado as ciclo_estado into v_sesion
  from public.sesiones_ciclo sc join public.ciclos_operativos c on c.id=sc.ciclo_id
  where sc.id=p_sesion_id for update;
  if not found then raise exception 'Sesión operativa no encontrada.' using errcode='23503'; end if;
  if v_sesion.estado<>'EN_CURSO' then raise exception 'La sesión no está en curso (estado: %).',v_sesion.estado using errcode='P0001'; end if;
  v_es_admin := public.tiene_permiso('ciclos','editar_any');
  if v_sesion.usuario_id<>uid and not v_es_admin then raise exception 'No podés cerrar una sesión que no es tuya.' using errcode='42501'; end if;
  select t.id into turno_id from public.turnos t where t.sesion_id=p_sesion_id and t.estado='ABIERTO' limit 1;
  if turno_id is null then raise exception 'La sesión EN_CURSO no tiene un turno ABIERTO asociado.' using errcode='P0001'; end if;
  update public.turnos t set estado='CERRADO',cierre_real=now(),observacion=coalesce(p_observacion,t.observacion),actualizado_en=now() where t.id=turno_id;
  insert into public.cuadres(turno_id,dinero_esperado,estado) values(turno_id,public.calcular_dinero_esperado_turno(turno_id),'PENDIENTE') returning id into cuadre_id;
  update public.sesiones_ciclo set estado='COMPLETADA',cierre_real=now(),observacion=coalesce(p_observacion,observacion) where id=p_sesion_id;
  if p_idempotency_key is not null then update private.operaciones_idempotencia set resultado_id=p_sesion_id where idempotency_key=p_idempotency_key; end if;
  return jsonb_build_object('id',p_sesion_id,'estado','COMPLETADA','turno_legacy_id',turno_id,'cuadre_id',cuadre_id,'idempotente',false);
end;
$function$;

revoke execute on function public.iniciar_sesion_operativa(uuid,uuid,text) from public,anon;
revoke execute on function public.cerrar_sesion_operativa(uuid,uuid,text) from public,anon;
grant execute on function public.iniciar_sesion_operativa(uuid,uuid,text) to authenticated;
grant execute on function public.cerrar_sesion_operativa(uuid,uuid,text) to authenticated;
