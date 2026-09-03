-- BattleCruiser — TURNO: estado único de cierre/aprobación
-- Contrato:
-- 1) Cerrar una sesión solo completa esa sesión.
-- 2) El Turno permanece EN_CURSO hasta que ADMIN lo envíe a aprobación.
-- 3) bc_enviar_turno_a_aprobacion es la única función que mueve
--    estado_maestro a PENDIENTE_APROBACION y exige todas las sesiones
--    completas + recepción válida de inventario.

create or replace function public.bc_cerrar_turno_sesion(p_turno_sesion_id uuid)
returns public.turno_sesiones
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_sesion public.turno_sesiones;
  v_tramo public.turno_tramos;
  v_result public.turno_sesiones;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado.' using errcode='42501'; end if;
  select * into v_sesion from public.turno_sesiones where id=p_turno_sesion_id for update;
  if v_sesion.id is null then raise exception 'Sesión no encontrada.' using errcode='23503'; end if;
  if not exists (select 1 from public.turno_asignaciones a where a.turno_sesion_id=v_sesion.id and a.usuario_id=auth.uid() and a.retirado_at is null) then raise exception 'Solo la persona asignada a esta sesión puede cerrarla.' using errcode='42501'; end if;
  if v_sesion.estado<>'EN_CURSO' then raise exception 'La sesión no está en curso.' using errcode='P0001'; end if;
  select * into v_tramo from public.turno_tramos where turno_sesion_id=v_sesion.id and estado='ACTIVO' order by inicio_at desc nulls last,created_at desc nulls last limit 1 for update;
  if v_tramo.id is null then raise exception 'La sesión EN_CURSO no tiene un tramo activo.' using errcode='P0001'; end if;
  if not exists (select 1 from public.turno_declaraciones d where d.turno_tramo_id=v_tramo.id and d.usuario_id=auth.uid()) then raise exception 'Antes de cerrar la sesión debés declarar el dinero entregado.' using errcode='23514'; end if;
  update public.turno_tramos set estado='COMPLETADO',fin_at=now() where id=v_tramo.id;
  update public.turno_sesiones set estado='COMPLETADA',updated_at=now() where id=v_sesion.id returning * into v_result;
  update public.turnos set estado='ABIERTO',estado_maestro='EN_CURSO',cierre_real=null,actualizado_en=now() where id=v_sesion.turno_id;
  insert into public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo) values(v_sesion.turno_id,v_sesion.id,v_tramo.id,auth.uid(),'SESION_CERRADA');
  return v_result;
end;
$function$;
revoke execute on function public.bc_cerrar_turno_sesion(uuid) from public,anon;
grant execute on function public.bc_cerrar_turno_sesion(uuid) to authenticated;

create or replace function public.bc_declarar_y_cerrar_turno_sesion(p_turno_sesion_id uuid,p_monto numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_sesion public.turno_sesiones;
  v_tramo public.turno_tramos;
  v_existing_monto numeric;
  v_created boolean:=false;
  v_declaracion_id uuid;
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
    insert into public.turno_declaraciones(turno_id,turno_sesion_id,turno_tramo_id,usuario_id,monto,estado_aprobacion) values(v_tramo.turno_id,v_tramo.turno_sesion_id,v_tramo.id,v_uid,p_monto,'ESPERANDO_APROBACION') returning id into v_declaracion_id;
    v_created:=true;
    insert into public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload) values(v_tramo.turno_id,v_tramo.turno_sesion_id,v_tramo.id,v_uid,'DINERO_DECLARADO',jsonb_build_object('monto',p_monto,'declaracion_id',v_declaracion_id));
  elsif v_existing_monto<>p_monto then raise exception 'Este tramo ya tiene una declaración de dinero diferente.' using errcode='23514'; end if;
  update public.turno_tramos set estado='COMPLETADO',fin_at=now() where id=v_tramo.id;
  update public.turno_sesiones set estado='COMPLETADA',updated_at=now() where id=v_sesion.id;
  update public.turnos set estado='ABIERTO',estado_maestro='EN_CURSO',cierre_real=null,actualizado_en=now() where id=v_sesion.turno_id;
  insert into public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload) values(v_sesion.turno_id,v_sesion.id,v_tramo.id,v_uid,'SESION_CERRADA',jsonb_build_object('declaracion_creada',v_created,'monto',coalesce(v_existing_monto,p_monto),'declaracion_id',v_declaracion_id));
  return jsonb_build_object('sesion_id',v_sesion.id,'tramo_id',v_tramo.id,'turno_id',v_sesion.turno_id,'estado_sesion','COMPLETADA','estado_tramo','COMPLETADO','estado_turno','EN_CURSO','monto',coalesce(v_existing_monto,p_monto),'declaracion_id',v_declaracion_id,'declaracion_creada',v_created);
end;
$function$;
revoke execute on function public.bc_declarar_y_cerrar_turno_sesion(uuid,numeric) from public,anon;
grant execute on function public.bc_declarar_y_cerrar_turno_sesion(uuid,numeric) to authenticated;
