-- Migración m13_almacenes_gestion — Misión 9.3, Tarea 3 (gestión de almacenes)
-- Ya fue APLICADA en producción (proyecto papxnkkjtkxsitcsvcme).
-- Este archivo queda en el repo como registro/documentación del contrato
-- real, siguiendo el mismo patrón que m3-productos-editar-estado.sql y
-- m12_producto_imagen.sql.
--
-- NO re-ejecutar en producción si las funciones/columna ya existen.
-- Es idempotente (IF NOT EXISTS / CREATE OR REPLACE) por si se aplica
-- en un entorno limpio de desarrollo.

-- 1) Columna activo (soft-delete / activar-desactivar sin borrar historial).
ALTER TABLE public.almacenes
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- 2) crear_almacen — alta con idempotencia y permiso almacenes.crear
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
begin
  if not public.tiene_permiso('almacenes','crear') then
    raise exception 'Sin permiso para crear almacenes';
  end if;

  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key,
    auth.uid(),
    'crear_almacen',
    jsonb_build_object('nombre', p_nombre, 'tipo', p_tipo)
  );
  if v_idempotente is not null then
    return v_idempotente;
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre del almacén es requerido';
  end if;
  if p_tipo is null or p_tipo not in ('venta', 'mayorista') then
    raise exception 'El tipo de almacén debe ser venta o mayorista';
  end if;

  insert into public.almacenes (nombre, tipo, activo)
  values (btrim(p_nombre), p_tipo, true)
  returning id into v_almacen_id;

  update private.operaciones_idempotencia
  set resultado_id = v_almacen_id
  where idempotency_key = p_idempotency_key;

  return v_almacen_id;
end;
$function$;

-- 3) editar_almacen — nombre y tipo (permiso almacenes.editar)
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
begin
  if not public.tiene_permiso('almacenes','editar') then
    raise exception 'Sin permiso para editar almacenes';
  end if;

  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key,
    auth.uid(),
    'editar_almacen',
    jsonb_build_object(
      'almacen_id', p_almacen_id,
      'nombre', p_nombre,
      'tipo', p_tipo
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
  if p_tipo is null or p_tipo not in ('venta', 'mayorista') then
    raise exception 'El tipo de almacén debe ser venta o mayorista';
  end if;

  update public.almacenes
  set nombre = btrim(p_nombre),
      tipo = p_tipo
  where id = p_almacen_id;

  update private.operaciones_idempotencia
  set resultado_id = p_almacen_id
  where idempotency_key = p_idempotency_key;

  return p_almacen_id;
end;
$function$;

-- 4) activar_desactivar_almacen — soft state (permiso almacenes.editar)
CREATE OR REPLACE FUNCTION public.activar_desactivar_almacen(
  p_almacen_id uuid,
  p_activo boolean,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_idempotente uuid;
begin
  if not public.tiene_permiso('almacenes','editar') then
    raise exception 'Sin permiso para editar almacenes';
  end if;

  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;

  if p_activo is null then
    raise exception 'El estado activo es requerido';
  end if;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key,
    auth.uid(),
    'activar_desactivar_almacen',
    jsonb_build_object('almacen_id', p_almacen_id, 'activo', p_activo)
  );
  if v_idempotente is not null then
    return v_idempotente;
  end if;

  if not exists (select 1 from public.almacenes where id = p_almacen_id) then
    raise exception 'Almacén no encontrado';
  end if;

  update public.almacenes
  set activo = p_activo
  where id = p_almacen_id;

  update private.operaciones_idempotencia
  set resultado_id = p_almacen_id
  where idempotency_key = p_idempotency_key;

  return p_almacen_id;
end;
$function$;

-- 5) Grants — mismo patrón que el resto de RPC de escritura (sin anon).
REVOKE ALL ON FUNCTION public.crear_almacen(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_almacen(text, text, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.crear_almacen(text, text, uuid) FROM anon;

REVOKE ALL ON FUNCTION public.editar_almacen(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editar_almacen(uuid, text, text, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.editar_almacen(uuid, text, text, uuid) FROM anon;

REVOKE ALL ON FUNCTION public.activar_desactivar_almacen(uuid, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activar_desactivar_almacen(uuid, boolean, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.activar_desactivar_almacen(uuid, boolean, uuid) FROM anon;
