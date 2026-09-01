-- BattleCruiser — 2026-09-01
-- Hotfix: turno_actual_usuario no debe usar RECORD para representar el tramo/turno
-- porque el caso sin filas deja el RECORD sin asignar. Variables escalares tipadas
-- + FOUND eliminan además la ambigüedad de aliases/variables y cubren ambos caminos.

create or replace function public.turno_actual_usuario()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_turno_id public.turnos.id%type;
  v_estado public.turnos.estado%type;
  v_almacen_id public.turnos.almacen_id%type;
  v_apertura_real public.turnos.apertura_real%type;
  v_turno_fecha public.turnos.fecha%type;
  v_usuario_nombre public.turnos.usuario_nombre%type;
  v_turno_sesion_id public.turno_sesiones.id%type;
  v_tramo_id public.turno_tramos.id%type;
  v_numero_dia public.turno_sesiones.numero_dia%type;
  v_bloque public.turno_sesiones.bloque%type;
  v_c jsonb;
  v_hay_tramo boolean := false;
begin
  if v_uid is null then
    raise exception 'No hay sesión activa.';
  end if;

  -- Fuente de verdad moderna: tramo ACTIVO del usuario en sesión EN_CURSO.
  select trm.id,
         trm.turno_sesion_id,
         trm.turno_id,
         ts.numero_dia,
         ts.bloque,
         ts.fecha
    into v_tramo_id,
         v_turno_sesion_id,
         v_turno_id,
         v_numero_dia,
         v_bloque,
         v_turno_fecha
    from public.turno_tramos trm
    join public.turno_sesiones ts on ts.id = trm.turno_sesion_id
   where trm.usuario_id = v_uid
     and trm.estado = 'ACTIVO'
     and ts.estado = 'EN_CURSO'
   order by trm.inicio_at desc nulls last, trm.created_at desc nulls last
   limit 1;

  v_hay_tramo := found;

  if v_hay_tramo then
    select t.estado,
           t.almacen_id,
           t.apertura_real,
           t.fecha,
           t.usuario_nombre
      into v_estado,
           v_almacen_id,
           v_apertura_real,
           v_turno_fecha,
           v_usuario_nombre
      from public.turnos t
     where t.id = v_turno_id
       and t.estado = 'ABIERTO'
     limit 1;
  end if;

  -- Compatibilidad legacy: si no hay turno moderno utilizable, conservar el comportamiento anterior.
  if v_estado is null then
    v_turno_id := null;
    v_tramo_id := null;
    v_turno_sesion_id := null;
    v_numero_dia := null;
    v_bloque := null;
    select t.id,
           t.estado,
           t.almacen_id,
           t.apertura_real,
           t.fecha,
           t.usuario_nombre
      into v_turno_id,
           v_estado,
           v_almacen_id,
           v_apertura_real,
           v_turno_fecha,
           v_usuario_nombre
      from public.turnos t
     where t.usuario_id = v_uid
       and t.estado = 'ABIERTO'
     order by t.apertura_real desc nulls last, t.actualizado_en desc nulls last
     limit 1;
  end if;

  if v_turno_id is null or v_estado is null then
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
  where cu.turno_id = v_turno_id
  limit 1;

  return jsonb_build_object(
    'id', v_turno_id,
    'estado', v_estado,
    'almacen_id', v_almacen_id,
    'apertura_real', v_apertura_real,
    'fecha', v_turno_fecha,
    'usuario_nombre', coalesce(v_usuario_nombre, ''),
    'cuadre', v_c,
    'turno_sesion_id', v_turno_sesion_id,
    'tramo_id', v_tramo_id,
    'numero_dia', v_numero_dia,
    'bloque', v_bloque
  );
end;
$function$;
