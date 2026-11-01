-- Permit an assigned worker to open the next unresolved legacy session after its scheduled date.
-- Future sessions remain blocked; assignment and operational sequence checks are unchanged.
CREATE OR REPLACE FUNCTION public.bc_iniciar_turno_sesion_secuencial(p_turno_sesion_id uuid)
RETURNS turno_tramos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  s public.turno_sesiones;
  a public.turno_asignaciones;
  r public.turno_tramos;
  prev public.turno_sesiones;
  active_count integer;
  v_fecha_operativa date := (now() at time zone 'America/Puerto_Rico')::date;
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado.' using errcode = '42501';
  end if;

  select * into s from public.turno_sesiones where id = p_turno_sesion_id for update;
  if s.id is null then
    raise exception 'Sesión no encontrada.' using errcode = '23503';
  end if;

  select * into a
  from public.turno_asignaciones
  where turno_sesion_id = s.id and retirado_at is null
  order by asignado_at desc nulls last, created_at desc nulls last
  limit 1;

  if a.id is null then
    raise exception 'La sesión requiere una dependienta asignada antes de comenzar.' using errcode = '42501';
  end if;
  if a.usuario_id <> auth.uid() then
    raise exception 'Solo la dependienta asignada puede iniciar la sesión.' using errcode = '42501';
  end if;

  if s.estado = 'EN_CURSO' then
    select count(*) into active_count from public.turno_tramos where turno_sesion_id = s.id and estado = 'ACTIVO';
    if active_count > 0 then
      return (select t from public.turno_tramos t where t.turno_sesion_id=s.id and t.estado='ACTIVO' order by t.inicio_at desc limit 1);
    end if;
    raise exception 'La sesión está EN_CURSO pero no tiene un tramo activo.' using errcode = 'P0001';
  end if;

  if s.estado not in ('PENDIENTE','PROGRAMADA') then
    raise exception 'La sesión no está disponible para iniciar (estado: %).', s.estado using errcode = 'P0001';
  end if;

  -- A session can start on or after its scheduled date, never before it.
  if s.fecha > v_fecha_operativa then
    raise exception 'Esta sesión todavía no está disponible. Podés abrirla en su fecha programada: %.', s.fecha using errcode = 'P0001';
  end if;

  select * into prev
  from public.turno_sesiones x
  where x.turno_id = s.turno_id
    and x.id <> s.id
    and (x.numero_dia < s.numero_dia
      or (x.numero_dia = s.numero_dia and case when x.bloque='MANANA' then 1 else 2 end < case when s.bloque='MANANA' then 1 else 2 end))
    and x.estado not in ('COMPLETADA','CANCELADA')
  order by x.numero_dia desc,
           case when x.bloque='MANANA' then 1 else 2 end desc
  limit 1;

  if prev.id is not null then
    raise exception 'No podés iniciar esta sesión todavía. Completá antes la sesión anterior (día % · %). Estado actual: %.', prev.numero_dia, prev.bloque, prev.estado using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.turno_sesiones x
    join public.turno_tramos tr on tr.turno_sesion_id=x.id and tr.estado='ACTIVO'
    where x.turno_id=s.turno_id
  ) then
    raise exception 'Ya existe una sesión operativa abierta en este turno.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.turno_tramos tr
    where tr.usuario_id=auth.uid() and tr.estado='ACTIVO'
  ) then
    raise exception 'Ya tenés una sesión operativa abierta.' using errcode = 'P0001';
  end if;

  insert into public.turno_tramos(turno_sesion_id,turno_id,usuario_id,tipo,estado)
  values(s.id,s.turno_id,a.usuario_id,'NORMAL','ACTIVO') returning * into r;

  update public.turno_sesiones set estado='EN_CURSO', updated_at=now() where id=s.id;
  update public.turnos set estado_maestro='EN_CURSO', estado='ABIERTO', apertura_real=coalesce(apertura_real,now()), actualizado_en=now() where id=s.turno_id and estado_maestro='PROGRAMADO';
  insert into public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo) values(s.turno_id,s.id,r.id,auth.uid(),'SESION_INICIADA');
  return r;
end;
$function$;
