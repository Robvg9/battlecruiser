-- BattleCruiser — Turnos — cierre forzoso solo autoridad administrativa real
-- M60.4
-- La UI oculta el control a Dependienta, pero la seguridad real queda en backend.

create or replace function public.bc_puede_forzar_cierre_turno()
returns boolean
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then return false; end if;
  select r.nombre into v_role
  from public.usuarios u
  join public.roles r on r.id = u.role_id
  where u.id = v_uid
    and u.activo = true
    and r.activo = true
  limit 1;
  return lower(coalesce(v_role,'')) in ('dueño','dueno','admin','administrador');
end;
$function$;

revoke execute on function public.bc_puede_forzar_cierre_turno() from public, anon;
grant execute on function public.bc_puede_forzar_cierre_turno() to authenticated;

create or replace function public.bc_forzar_cierre_turno(p_turno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  r jsonb;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado.' using errcode='42501';
  end if;
  if not public.bc_puede_forzar_cierre_turno() then
    raise exception 'Solo ADMIN puede forzar el cierre de un turno.' using errcode='42501';
  end if;

  perform 1 from public.turnos where id=p_turno_id for update;
  if not found then
    raise exception 'Turno no encontrado.' using errcode='23503';
  end if;

  update public.turno_tramos tr
     set estado='COMPLETADO', fin_at=coalesce(fin_at,now())
   where tr.turno_id=p_turno_id and tr.estado='ACTIVO';

  update public.turno_sesiones s
     set estado=case
       when s.estado in ('PENDIENTE','PROGRAMADA') then 'CANCELADA'
       when s.estado='EN_CURSO' then 'COMPLETADA'
       else s.estado
     end,
     cierre_forzado=true,
     updated_at=now()
   where s.turno_id=p_turno_id and s.estado not in ('COMPLETADA','CANCELADA');

  update public.turnos
     set estado='CERRADO',
         estado_maestro='CERRADO',
         cierre_real=coalesce(cierre_real,now()),
         actualizado_en=now()
   where id=p_turno_id;

  insert into public.turno_eventos(turno_id,actor_user_id,tipo,payload)
  values(p_turno_id,v_uid,'TURNO_CIERRE_FORZADO',jsonb_build_object('actor_user_id',v_uid));

  select jsonb_build_object(
    'turno_id',p_turno_id,
    'estado','CERRADO',
    'forzado',true,
    'sesiones',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,
        'numero_dia',s.numero_dia,
        'bloque',s.bloque,
        'estado',s.estado,
        'cierre_forzado',s.cierre_forzado,
        'dinero_estado_aprobacion',(
          select d.estado_aprobacion
          from public.turno_declaraciones d
          where d.turno_sesion_id=s.id
          order by d.declarado_at desc nulls last
          limit 1
        )
      ) order by s.numero_dia,case when s.bloque='MANANA' then 1 else 2 end)
      from public.turno_sesiones s
      where s.turno_id=p_turno_id
    ),'[]'::jsonb)
  ) into r;

  return r;
end;
$function$;

revoke execute on function public.bc_forzar_cierre_turno(uuid) from public, anon;
grant execute on function public.bc_forzar_cierre_turno(uuid) to authenticated;
