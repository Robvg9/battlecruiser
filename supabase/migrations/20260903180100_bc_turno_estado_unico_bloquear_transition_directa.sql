-- BattleCruiser — TURNO: estado único de cierre/aprobación
-- Evita que bc_turno_transition sea una segunda puerta hacia PENDIENTE_APROBACION.

create or replace function public.bc_turno_transition(p_turno_id uuid, p_new_estado text)
returns public.turnos
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  r public.turnos;
  old text;
  rev text;
begin
  if not public.bc_actor_is_admin() then
    raise exception 'Solo ADMIN puede ejecutar esta transición';
  end if;

  select estado_maestro into old
  from public.turnos
  where id=p_turno_id
  for update;

  if old is null then
    raise exception 'Turno no encontrado';
  end if;

  if p_new_estado not in ('EN_CURSO','PENDIENTE_APROBACION','CERRADO') then
    raise exception 'Estado no permitido';
  end if;

  if old='PROGRAMADO' and p_new_estado='EN_CURSO' then
    if not exists (
      select 1 from public.turno_sesiones
      where turno_id=p_turno_id and estado='EN_CURSO'
    ) then
      raise exception 'No se puede marcar EN_CURSO sin una sesión iniciada';
    end if;
  elsif old='PENDIENTE_APROBACION' and p_new_estado='CERRADO' then
    select estado into rev
    from public.turno_revisiones
    where turno_id=p_turno_id
    order by creado_at desc
    limit 1;
    if rev<>'APROBADO' then
      raise exception 'El Turno requiere revisión aprobada antes de cerrarse';
    end if;
  else
    raise exception 'Transición de estado no permitida: % -> %',old,p_new_estado;
  end if;

  update public.turnos
  set estado_maestro=p_new_estado,
      actualizado_en=now()
  where id=p_turno_id
  returning * into r;

  insert into public.turno_eventos(turno_id,actor_user_id,tipo,payload)
  values(p_turno_id,auth.uid(),'TRANSICION_ESTADO',jsonb_build_object('anterior',old,'nuevo_estado',p_new_estado));

  return r;
end;
$function$;

revoke execute on function public.bc_turno_transition(uuid,text) from public,anon;
grant execute on function public.bc_turno_transition(uuid,text) to authenticated;
