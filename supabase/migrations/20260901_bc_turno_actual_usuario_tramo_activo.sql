-- BattleCruiser — 2026-09-01
-- Ventas debe leer la sesión operativa real del usuario desde turno_tramos.ACTIVO.
-- Mantiene fallback legacy sobre public.turnos.usuario_id.

create or replace function public.turno_actual_usuario()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  t record;
  tr record;
  c jsonb;
begin
  if uid is null then
    raise exception 'No hay sesión activa.';
  end if;

  select tr.id as tramo_id,
         tr.turno_sesion_id,
         tr.turno_id,
         tr.usuario_id,
         tr.inicio_at,
         ts.numero_dia,
         ts.bloque,
         ts.fecha
    into tr
    from public.turno_tramos tr
    join public.turno_sesiones ts on ts.id = tr.turno_sesion_id
   where tr.usuario_id = uid
     and tr.estado = 'ACTIVO'
     and ts.estado = 'EN_CURSO'
   order by tr.inicio_at desc nulls last, tr.created_at desc nulls last
   limit 1;

  if tr.turno_id is not null then
    select * into t
      from public.turnos
     where id = tr.turno_id
       and estado = 'ABIERTO'
     limit 1;
  end if;

  -- Compatibilidad legacy: si no hay tramo moderno, conservar el comportamiento anterior.
  if t.id is null then
    select * into t
      from public.turnos
     where usuario_id = uid
       and estado = 'ABIERTO'
     order by apertura_real desc nulls last, actualizado_en desc nulls last
     limit 1;
  end if;

  if t.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', cu.id,
    'estado', cu.estado,
    'dinero_esperado', cu.dinero_esperado,
    'dinero_declarado', cu.dinero_declarado,
    'diferencia', cu.diferencia
  ) into c
  from public.cuadres cu
  where cu.turno_id = t.id
  limit 1;

  return jsonb_build_object(
    'id', t.id,
    'estado', t.estado,
    'almacen_id', t.almacen_id,
    'apertura_real', t.apertura_real,
    'fecha', t.fecha,
    'usuario_nombre', coalesce(t.usuario_nombre, ''),
    'cuadre', c,
    'turno_sesion_id', tr.turno_sesion_id,
    'tramo_id', tr.tramo_id,
    'numero_dia', tr.numero_dia,
    'bloque', tr.bloque
  );
end;
$function$;
