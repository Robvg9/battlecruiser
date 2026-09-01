-- BattleCruiser — 2026-09-01
-- Hotfix: la primera implementación declaraba una variable record llamada `tr`
-- mientras usaba el mismo alias SQL `tr`, provocando en ejecución autenticada:
-- "record tr is not assigned yet".
-- Se renombran todas las variables PL/pgSQL con prefijo v_ y los aliases SQL para
-- eliminar cualquier ambigüedad de resolución.

create or replace function public.turno_actual_usuario()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_t record;
  v_tr record;
  v_c jsonb;
begin
  if v_uid is null then
    raise exception 'No hay sesión activa.';
  end if;

  select trm.id as tramo_id,
         trm.turno_sesion_id,
         trm.turno_id,
         trm.usuario_id,
         trm.inicio_at,
         ts.numero_dia,
         ts.bloque,
         ts.fecha
    into v_tr
    from public.turno_tramos trm
    join public.turno_sesiones ts on ts.id = trm.turno_sesion_id
   where trm.usuario_id = v_uid
     and trm.estado = 'ACTIVO'
     and ts.estado = 'EN_CURSO'
   order by trm.inicio_at desc nulls last, trm.created_at desc nulls last
   limit 1;

  if v_tr.turno_id is not null then
    select * into v_t
      from public.turnos t
     where t.id = v_tr.turno_id
       and t.estado = 'ABIERTO'
     limit 1;
  end if;

  if v_t.id is null then
    select * into v_t
      from public.turnos t
     where t.usuario_id = v_uid
       and t.estado = 'ABIERTO'
     order by t.apertura_real desc nulls last, t.actualizado_en desc nulls last
     limit 1;
  end if;

  if v_t.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', cu.id,
    'estado', cu.estado,
    'dinero_esperado', cu.dinero_esperado,
    'dinero_declarado', cu.dinero_declarado,
    'diferencia', cu.diferencia
  ) into v_c
  from public.cuadres cu
  where cu.turno_id = v_t.id
  limit 1;

  return jsonb_build_object(
    'id', v_t.id,
    'estado', v_t.estado,
    'almacen_id', v_t.almacen_id,
    'apertura_real', v_t.apertura_real,
    'fecha', v_t.fecha,
    'usuario_nombre', coalesce(v_t.usuario_nombre, ''),
    'cuadre', v_c,
    'turno_sesion_id', v_tr.turno_sesion_id,
    'tramo_id', v_tr.tramo_id,
    'numero_dia', v_tr.numero_dia,
    'bloque', v_tr.bloque
  );
end;
$function$;
