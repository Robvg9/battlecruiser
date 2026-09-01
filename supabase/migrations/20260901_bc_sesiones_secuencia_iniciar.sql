-- BattleCruiser — 2026-09-01
-- Endurecer secuencialidad de sesiones_ciclo en iniciar_sesion_operativa.
-- Autoridad: backend SQL (no FE).
--
-- Orden canónico dentro de un ciclo:
--   (dia_n ASC, bloque: MANANA=1, TARDE=2)
--
-- Regla:
--   No se puede iniciar una sesión PENDIENTE si existe otra sesión del
--   mismo ciclo_id estrictamente anterior (mismo orden) cuyo estado
--   NO esté en ('COMPLETADA','CANCELADA').
--
-- Asignación (limitación documentada):
--   Si sesiones_ciclo.usuario_id IS NOT NULL y distinto de auth.uid(),
--   se rechaza. Si es NULL, se permite claim-on-start (comportamiento
--   histórico: asignar_sesion_operativa puede pre-rellenar usuario_id).
--
-- M14 intacto:
--   Sigue insertando public.turnos con estado='ABIERTO'.
--   turno_actual_usuario / registrar_venta no se modifican.
--
-- Base: cuerpo m25_2 (alias v_sesion) + chequeos nuevos.

CREATE OR REPLACE FUNCTION public.bc_orden_bloque_sesion(p_bloque text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE upper(coalesce(p_bloque, ''))
    WHEN 'MANANA' THEN 1
    WHEN 'MAÑANA' THEN 1
    WHEN 'TARDE'  THEN 2
    ELSE 99
  END;
$fn$;

COMMENT ON FUNCTION public.bc_orden_bloque_sesion(text) IS
  'Orden canónico de bloque de sesión: MANANA=1, TARDE=2. Usado por secuencialidad de iniciar_sesion_operativa.';

CREATE OR REPLACE FUNCTION public.bc_sesion_tiene_predecesora_incompleta(
  p_ciclo_id uuid,
  p_sesion_id uuid,
  p_dia_n integer,
  p_bloque text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.sesiones_ciclo prev
    WHERE prev.ciclo_id = p_ciclo_id
      AND prev.id <> p_sesion_id
      AND prev.estado NOT IN ('COMPLETADA', 'CANCELADA')
      AND (
        prev.dia_n < p_dia_n
        OR (
          prev.dia_n = p_dia_n
          AND public.bc_orden_bloque_sesion(prev.bloque)
            < public.bc_orden_bloque_sesion(p_bloque)
        )
      )
  );
$fn$;

COMMENT ON FUNCTION public.bc_sesion_tiene_predecesora_incompleta(uuid, uuid, integer, text) IS
  'True si existe sesión anterior (mismo ciclo, orden dia_n+bloque) no COMPLETADA ni CANCELADA.';

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
  uid := public._validar_usuario_operacion('ciclos','crear');

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

  select sc.*, c.almacen_id, c.estado as ciclo_estado
    into v_sesion
  from public.sesiones_ciclo sc
  join public.ciclos_operativos c on c.id = sc.ciclo_id
  where sc.id = p_sesion_id
  for update;

  if not found then
    raise exception 'Sesión operativa no encontrada.' using errcode = '23503';
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

  -- Asignación estructural (si existe): no robar sesión de otro.
  -- Si usuario_id IS NULL → claim-on-start (histórico).
  if v_sesion.usuario_id is not null and v_sesion.usuario_id <> uid then
    raise exception 'La sesión está asignada a otro trabajador.' using errcode = '42501';
  end if;

  -- SECUENCIALIDAD (autoridad backend):
  -- No iniciar si hay predecesora del mismo ciclo aún no COMPLETADA/CANCELADA.
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

  -- Desvincular turno CERRADO histórico de esta sesión (inconsistencia previa)
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

  -- Puente M14: crear turnos ABIERTO (única fila que habilita registrar_venta)
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

REVOKE EXECUTE ON FUNCTION public.bc_orden_bloque_sesion(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc_orden_bloque_sesion(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.bc_sesion_tiene_predecesora_incompleta(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc_sesion_tiene_predecesora_incompleta(uuid, uuid, integer, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.iniciar_sesion_operativa(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_sesion_operativa(uuid, uuid, text) TO authenticated;
