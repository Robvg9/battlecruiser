-- BattleCruiser TURNO — duración congelada al comenzar
-- Aplicada en Supabase LIVE el 2026-08-28.
-- Regla: ADMIN puede editar los días únicamente mientras el Turno está PROGRAMADO.
-- Una vez EN_CURSO, la estructura temporal queda congelada para proteger sesiones,
-- asignaciones, inventario, sucesión y auditoría.

CREATE OR REPLACE FUNCTION public.bc_editar_dias_turno(p_turno_id uuid, p_nuevos_dias integer)
RETURNS public.turnos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare t public.turnos; cfg public.turno_configuracion; old integer; i integer; d date;
begin
 if not public.bc_actor_is_admin() then raise exception 'Solo ADMIN puede editar duración de Turno'; end if;
 if p_nuevos_dias not between 1 and 31 then raise exception 'Cantidad de días inválida'; end if;
 select * into cfg from public.turno_configuracion where id=true;
 if cfg.duracion_fija_habilitada and p_nuevos_dias<>cfg.dias_fijos then raise exception 'La duración está fijada por ADMIN en % días',cfg.dias_fijos; end if;
 select * into t from public.turnos where id=p_turno_id for update;
 if t.id is null then raise exception 'Turno no encontrado'; end if;
 if t.estado_maestro <> 'PROGRAMADO' then raise exception 'La duración solo puede editarse mientras el Turno está PROGRAMADO'; end if;
 old:=coalesce(t.dias_turno,0);
 if p_nuevos_dias<old and exists(select 1 from public.turno_sesiones s where s.turno_id=t.id and s.numero_dia>p_nuevos_dias) then raise exception 'No se puede reducir: existen sesiones en los días eliminados'; end if;
 if p_nuevos_dias<old and exists(select 1 from public.turno_asignaciones a join public.turno_sesiones s on s.id=a.turno_sesion_id where s.turno_id=t.id and s.numero_dia>p_nuevos_dias) then raise exception 'No se puede reducir: existen asignaciones en los días eliminados'; end if;
 if p_nuevos_dias<old then delete from public.turno_sesiones where turno_id=t.id and numero_dia>p_nuevos_dias; end if;
 for i in old+1..p_nuevos_dias loop d:=t.fecha+(i-1); insert into public.turno_sesiones(turno_id,almacen_id,numero_dia,bloque,fecha) values(t.id,t.almacen_id,i,'MANANA',d),(t.id,t.almacen_id,i,'TARDE',d); end loop;
 update public.turnos set dias_turno=p_nuevos_dias,actualizado_en=now() where id=t.id returning * into t;
 insert into public.turno_eventos(turno_id,actor_user_id,tipo,payload) values(t.id,auth.uid(),'DURACION_TURNO_EDITADA',jsonb_build_object('anterior',old,'nueva',p_nuevos_dias));
 return t;
end;
$function$;
