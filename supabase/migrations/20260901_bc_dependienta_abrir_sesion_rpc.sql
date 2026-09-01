-- BattleCruiser — Dependienta puede abrir SOLO su sesión asignada.
-- No concede turnos.crear. El backend sigue siendo la autoridad final.
-- Regla:
--   * sesión asignada a auth.uid() -> requiere turnos.ver
--   * sesión sin asignar -> requiere turnos.crear (claim-on-start administrativo)
-- La secuencia y el puente M14 se conservan.

CREATE OR REPLACE FUNCTION public.iniciar_sesion_operativa(
  p_sesion_id uuid,
  p_idempotency_key uuid default null,
  p_observacion text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  uid uuid;
  nombre text;
  v_sesion record;
  turno_id uuid;
  v_idempotente uuid;
  v_prev record;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Usuario no autenticado.' using errcode = '42501';
  end if;

  select sc.*, c.almacen_id, c.estado as ciclo_estado
    into v_sesion
  from public.sesiones_ciclo sc
  join public.ciclos_operativos c on c.id = sc.ciclo_id
  where sc.id = p_sesion_id
  for update;

  if not found then
    raise exception 'Sesión operativa no encontrada.' using errcode = '23503';
  end if;

  -- Una Dependienta puede abrir su sesión ya asignada con turnos.ver.
  -- Solo una sesión no asignada conserva el claim-on-start administrativo.
  if v_sesion.usuario_id is null then
    uid := public._validar_usuario_operacion('turnos','crear');
  else
    uid := public._validar_usuario_operacion('turnos','ver');
  end if;

  if p_idempotency_key is not null then
    v_idempotente := private.reclamar_idempotencia(
      p_idempotency_key,
      uid,
      'iniciar_sesion_operativa',
      jsonb_build_object('sesion_id', p_sesion_id, 'observacion', p_observacion)
    );
    if v_idempotente is not null then
      select t.id into turno_id from public.turnos t where t.sesion_id = p_sesion_id limit 1;
      return jsonb_build_object(
        'id', p_sesion_id,
        'estado', 'EN_CURSO',
        'usuario_id', uid,
        'turno_legacy_id', turno_id,
        'idempotente', true
      );
    end if;
  end if;

  if v_sesion.ciclo_estado <> 'ACTIVO' then
    raise exception 'El ciclo operativo no está activo.' using errcode = 'P0001';
  end if;

  -- Reentrada: ya EN_CURSO del mismo usuario + turno ABIERTO
  if v_sesion.estado = 'EN_CURSO' then
    if v_sesion.usuario_id <> uid then
      raise exception 'La sesión ya está siendo trabajada por otro usuario.' using errcode = '42501';
    end if;
    select t.id into turno_id
    from public.turnos t
    where t.sesion_id = p_sesion_id and t.estado = 'ABIERTO'
    limit 1;
    if turno_id is null then
      raise exception 'La sesión está EN_CURSO pero no tiene un turno ABIERTO asociado.' using errcode = 'P0001';
    end if;
    if p_idempotency_key is not null then
      update private.operaciones_idempotencia
        set resultado_id = p_sesion_id
      where idempotency_key = p_idempotency_key;
    end if;
    return jsonb_build_object(
      'id', p_sesion_id,
      'estado', 'EN_CURSO',
      'usuario_id', uid,
      'usuario_nombre', v_sesion.usuario_nombre,
      'turno_legacy_id', turno_id,
      'idempotente', false
    );
  end if;

  if v_sesion.estado <> 'PENDIENTE' then
    raise exception 'La sesión no puede iniciarse (estado: %).', v_sesion.estado using errcode = 'P0001';
  end if;

  if v_sesion.usuario_id is not null and v_sesion.usuario_id <> uid then
    raise exception 'La sesión está asignada a otro trabajador.' using errcode = '42501';
  end if;

  if public.bc_sesion_tiene_predecesora_incompleta(
       v_sesion.ciclo_id, p_sesion_id, v_sesion.dia_n, v_sesion.bloque
     ) then
    select prev.dia_n, prev.bloque, prev.estado
      into v_prev
    from public.sesiones_ciclo prev
    where prev.ciclo_id = v_sesion.ciclo_id
      and prev.id <> p_sesion_id
      and prev.estado not in ('COMPLETADA', 'CANCELADA')
      and (
        prev.dia_n < v_sesion.dia_n
        or (
          prev.dia_n = v_sesion.dia_n
          and public.bc_orden_bloque_sesion(prev.bloque)
            < public.bc_orden_bloque_sesion(v_sesion.bloque)
        )
      )
    order by prev.dia_n asc, public.bc_orden_bloque_sesion(prev.bloque) asc
    limit 1;

    raise exception
      'No podés iniciar esta sesión todavía. Completá antes la sesión anterior (día % · %). Estado actual: %.',
      v_prev.dia_n,
      v_prev.bloque,
      v_prev.estado
      using errcode = 'P0001';
  end if;

  select u.nombre into nombre from public.usuarios u where u.id = uid;

  if exists(
    select 1 from public.sesiones_ciclo x
    where x.usuario_id = uid and x.estado = 'EN_CURSO' and x.id <> p_sesion_id
  ) then
    raise exception 'Ya tenés una sesión operativa abierta.' using errcode = 'P0001';
  end if;

  if exists(
    select 1 from public.turnos x
    where x.usuario_id = uid and x.estado = 'ABIERTO'
  ) then
    raise exception 'Ya tenés un turno operativo abierto.' using errcode = 'P0001';
  end if;

  update public.turnos
    set sesion_id = null, actualizado_en = now()
  where sesion_id = p_sesion_id and estado = 'CERRADO';

  select t.id into turno_id
  from public.turnos t
  where t.sesion_id = p_sesion_id
  limit 1;
  if turno_id is not null then
    raise exception 'La sesión pendiente tiene un turno asociado en un estado no válido.' using errcode = 'P0001';
  end if;

  insert into public.turnos(
    usuario_id, usuario_nombre, almacen_id, fecha,
    hora_inicio_prevista, hora_fin_prevista, apertura_real,
    estado, observacion, creado_por, ciclo_id, sesion_id
  )
  values(
    uid, nombre, v_sesion.almacen_id, v_sesion.fecha,
    v_sesion.hora_inicio_prevista, v_sesion.hora_fin_prevista, now(),
    'ABIERTO', p_observacion, uid, v_sesion.ciclo_id, p_sesion_id
  )
  returning id into turno_id;

  update public.sesiones_ciclo
    set usuario_id = uid,
        usuario_nombre = nombre,
        apertura_real = coalesce(apertura_real, now()),
        observacion = coalesce(p_observacion, observacion),
        creado_por = coalesce(creado_por, uid),
        estado = 'EN_CURSO'
  where id = p_sesion_id;

  if p_idempotency_key is not null then
    update private.operaciones_idempotencia
      set resultado_id = p_sesion_id
    where idempotency_key = p_idempotency_key;
  end if;

  return jsonb_build_object(
    'id', p_sesion_id,
    'estado', 'EN_CURSO',
    'usuario_id', uid,
    'usuario_nombre', nombre,
    'turno_legacy_id', turno_id,
    'idempotente', false
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.iniciar_sesion_operativa(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_sesion_operativa(uuid, uuid, text) TO authenticated;
