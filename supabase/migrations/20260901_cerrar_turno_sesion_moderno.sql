-- BattleCruiser — cierre moderno de turno_sesiones
-- Replica la corrección aplicada en producción para que el RPC existente
-- bc_cerrar_turno_sesion opere sobre turno_sesiones/turno_tramos y no sobre
-- el modelo legado sesiones_ciclo.

create or replace function public.bc_cerrar_turno_sesion(p_turno_sesion_id uuid)
returns public.turno_sesiones
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_sesion public.turno_sesiones;
  v_tramo public.turno_tramos;
  v_declarado integer;
  v_result public.turno_sesiones;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión activa.' using errcode='42501';
  end if;

  select * into v_sesion
  from public.turno_sesiones
  where id=p_turno_sesion_id
  for update;

  if v_sesion.id is null then
    raise exception 'Sesión no encontrada.';
  end if;
  if not exists (
    select 1 from public.turno_asignaciones a
    where a.turno_sesion_id=v_sesion.id
      and a.usuario_id=auth.uid()
      and a.retirado_at is null
  ) then
    raise exception 'Solo una persona asignada a esta sesión puede cerrarla.';
  end if;
  if v_sesion.estado<>'EN_CURSO' then
    raise exception 'La sesión no está en curso.';
  end if;

  select * into v_tramo
  from public.turno_tramos
  where turno_sesion_id=v_sesion.id
    and estado='ACTIVO'
  order by inicio_at desc nulls last, created_at desc nulls last
  limit 1
  for update;

  if v_tramo.id is null then
    raise exception 'La sesión EN_CURSO no tiene un tramo activo.';
  end if;

  select count(distinct d.turno_tramo_id)
    into v_declarado
  from public.turno_declaraciones d
  where d.turno_sesion_id=v_sesion.id;

  if v_declarado=0 then
    raise exception 'No se puede cerrar: el tramo debe declarar el dinero entregado.';
  end if;

  update public.turno_tramos
  set estado='COMPLETADO',fin_at=now()
  where id=v_tramo.id;

  update public.turno_sesiones
  set estado='COMPLETADA',updated_at=now()
  where id=v_sesion.id
  returning * into v_result;

  update public.turnos
  set estado='CERRADO',cierre_real=now(),actualizado_en=now()
  where id=v_sesion.turno_id and estado='ABIERTO';

  insert into public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo)
  values(v_sesion.turno_id,v_sesion.id,v_tramo.id,auth.uid(),'SESION_CERRADA');

  return v_result;
end;
$function$;

revoke execute on function public.bc_cerrar_turno_sesion(uuid) from public,anon;
grant execute on function public.bc_cerrar_turno_sesion(uuid) to authenticated;
