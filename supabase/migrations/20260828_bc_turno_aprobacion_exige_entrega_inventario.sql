-- BattleCruiser — TURNO
-- No enviar a aprobación hasta completar sesiones y recepción de inventario.

create or replace function public.bc_enviar_turno_a_aprobacion(p_turno_id uuid)
returns public.turnos
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  total integer;
  completas integer;
  entregas_validas integer;
  estado_actual text;
  r public.turnos;
begin
  if not public.bc_actor_is_admin() then raise exception 'Solo ADMIN puede enviar un Turno a aprobación'; end if;
  select estado_maestro into estado_actual from public.turnos where id=p_turno_id for update;
  if estado_actual is null then raise exception 'Turno no encontrado'; end if;
  if estado_actual <> 'EN_CURSO' then raise exception 'El Turno debe estar EN_CURSO para enviarse a aprobación'; end if;
  select count(*) into total from public.turno_sesiones where turno_id=p_turno_id;
  select count(*) into completas from public.turno_sesiones where turno_id=p_turno_id and estado='COMPLETADA';
  if total=0 or total<>completas then raise exception 'Todas las sesiones deben estar completadas antes de enviar el Turno a aprobación'; end if;
  select count(*) into entregas_validas from public.turno_entregas_inventario where turno_id=p_turno_id and estado in ('RECIBIDO','CON_DIFERENCIAS');
  if entregas_validas=0 then raise exception 'El inventario debe haber sido entregado y recibido antes de enviar el Turno a aprobación'; end if;
  update public.turnos set estado_maestro='PENDIENTE_APROBACION' where id=p_turno_id returning * into r;
  insert into public.turno_revisiones(turno_id,estado) values(p_turno_id,'PENDIENTE') on conflict(turno_id) do update set estado='PENDIENTE',revisado_por=null,revisado_at=null;
  insert into public.turno_eventos(turno_id,actor_user_id,tipo) values(p_turno_id,auth.uid(),'TURNO_ENVIADO_APROBACION');
  return r;
end;
$function$;