-- m13b — Ampliar tipos de almacén aceptados por crear_almacen / editar_almacen
-- Contrato UI vigente: almacenamiento | minorista | mayorista
-- Legacy: venta ≡ minorista (se normaliza a 'venta' en escritura para no romper filas existentes).
-- APLICAR en Supabase SQL editor si aún no está. Idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.crear_almacen(
  p_nombre text,
  p_tipo text,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_almacen_id uuid;
  v_idempotente uuid;
  v_tipo text;
begin
  if not public.tiene_permiso('almacenes','crear') then
    raise exception 'Sin permiso para crear almacenes';
  end if;

  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;

  v_tipo := lower(btrim(coalesce(p_tipo, '')));
  if v_tipo = 'minorista' then
    v_tipo := 'venta';
  end if;
  if v_tipo not in ('venta', 'mayorista', 'almacenamiento') then
    raise exception 'El tipo de almacén debe ser almacenamiento, minorista (venta) o mayorista';
  end if;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key,
    auth.uid(),
    'crear_almacen',
    jsonb_build_object('nombre', p_nombre, 'tipo', v_tipo)
  );
  if v_idempotente is not null then
    return v_idempotente;
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre del almacén es requerido';
  end if;

  insert into public.almacenes (nombre, tipo, activo)
  values (btrim(p_nombre), v_tipo, true)
  returning id into v_almacen_id;

  update private.operaciones_idempotencia
  set resultado_id = v_almacen_id
  where idempotency_key = p_idempotency_key;

  return v_almacen_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.editar_almacen(
  p_almacen_id uuid,
  p_nombre text,
  p_tipo text,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_idempotente uuid;
  v_tipo text;
begin
  if not public.tiene_permiso('almacenes','editar') then
    raise exception 'Sin permiso para editar almacenes';
  end if;

  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;

  v_tipo := lower(btrim(coalesce(p_tipo, '')));
  if v_tipo = 'minorista' then
    v_tipo := 'venta';
  end if;
  if v_tipo not in ('venta', 'mayorista', 'almacenamiento') then
    raise exception 'El tipo de almacén debe ser almacenamiento, minorista (venta) o mayorista';
  end if;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key,
    auth.uid(),
    'editar_almacen',
    jsonb_build_object(
      'almacen_id', p_almacen_id,
      'nombre', p_nombre,
      'tipo', v_tipo
    )
  );
  if v_idempotente is not null then
    return v_idempotente;
  end if;

  if not exists (select 1 from public.almacenes where id = p_almacen_id) then
    raise exception 'Almacén no encontrado';
  end if;
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre del almacén es requerido';
  end if;

  update public.almacenes
  set nombre = btrim(p_nombre),
      tipo = v_tipo
  where id = p_almacen_id;

  update private.operaciones_idempotencia
  set resultado_id = p_almacen_id
  where idempotency_key = p_idempotency_key;

  return p_almacen_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.crear_almacen(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_almacen(text, text, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.crear_almacen(text, text, uuid) FROM anon;

REVOKE ALL ON FUNCTION public.editar_almacen(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editar_almacen(uuid, text, text, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.editar_almacen(uuid, text, text, uuid) FROM anon;
