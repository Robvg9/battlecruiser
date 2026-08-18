-- BattleCruiser — Misión 3 — Productos: editar / activar-desactivar
-- Replica EXACTA de las migraciones ya aplicadas en producción (Supabase
-- project "battlecruiser", papxnkkjtkxsitcsvcme):
--   20260817192831  productos_editar_estado_y_fix_null_mayorista
--   20260817192841  productos_editar_estado_revoke_anon
--
-- Estas dos funciones existían en producción pero NO estaban documentadas
-- en el repo (b6-nucleo-operativo.sql solo tenía crear_producto). Se
-- agregan aquí tal cual están desplegadas, sin cambiar su arquitectura ni
-- contrato. Es idempotente (CREATE OR REPLACE) y segura de correr sobre una
-- base ya actualizada.
--
-- De paso, esta misma migración de producción también corrigió un bug real
-- en crear_producto: p_precio_mayorista NULL se guardaba como si fuera un
-- valor explícito en vez de quedar NULL. Se incluye la versión corregida
-- para que el repo no quede con la versión vieja del bug.

-- 1) crear_producto — fix: precio_mayorista NULL ya no se pierde/convierte.
CREATE OR REPLACE FUNCTION public.crear_producto(
  p_nombre text,
  p_categoria_id uuid,
  p_unidad text,
  p_precio_normal numeric,
  p_precio_mayorista numeric,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_producto_id uuid;
  v_idempotente uuid;
begin
  if not public.tiene_permiso('productos','crear') then
    raise exception 'Sin permiso para crear productos';
  end if;

  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key,
    auth.uid(),
    'crear_producto',
    jsonb_build_object(
      'nombre', p_nombre,
      'categoria_id', p_categoria_id,
      'unidad', p_unidad,
      'precio_normal', p_precio_normal,
      'precio_mayorista', p_precio_mayorista
    )
  );
  if v_idempotente is not null then
    return v_idempotente;
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre del producto es requerido';
  end if;
  if p_precio_normal is null or p_precio_normal < 0 then
    raise exception 'El precio normal debe ser mayor o igual a cero';
  end if;
  if p_precio_mayorista is not null and p_precio_mayorista < 0 then
    raise exception 'El precio mayorista debe ser mayor o igual a cero';
  end if;
  if p_categoria_id is not null and not exists (select 1 from public.categorias where id = p_categoria_id) then
    raise exception 'Categoría no encontrada';
  end if;

  insert into public.productos (nombre, categoria_id, unidad, precio_normal, precio_mayorista)
  values (btrim(p_nombre), p_categoria_id, p_unidad, p_precio_normal, p_precio_mayorista)
  returning id into v_producto_id;

  if p_idempotency_key is not null then
    update private.operaciones_idempotencia
    set resultado_id = v_producto_id
    where idempotency_key = p_idempotency_key;
  end if;

  return v_producto_id;
end;
$function$;

-- 2) actualizar_producto — edición completa (nombre, categoría, unidad, precios).
CREATE OR REPLACE FUNCTION public.actualizar_producto(
  p_producto_id uuid,
  p_nombre text,
  p_categoria_id uuid,
  p_unidad text,
  p_precio_normal numeric,
  p_precio_mayorista numeric,
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
  if not public.tiene_permiso('productos','editar') then
    raise exception 'Sin permiso para editar productos';
  end if;

  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key,
    auth.uid(),
    'actualizar_producto',
    jsonb_build_object(
      'producto_id', p_producto_id,
      'nombre', p_nombre,
      'categoria_id', p_categoria_id,
      'unidad', p_unidad,
      'precio_normal', p_precio_normal,
      'precio_mayorista', p_precio_mayorista
    )
  );
  if v_idempotente is not null then
    return v_idempotente;
  end if;

  if not exists (select 1 from public.productos where id = p_producto_id) then
    raise exception 'Producto no encontrado';
  end if;
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre del producto es requerido';
  end if;
  if p_precio_normal is null or p_precio_normal < 0 then
    raise exception 'El precio normal debe ser mayor o igual a cero';
  end if;
  if p_precio_mayorista is not null and p_precio_mayorista < 0 then
    raise exception 'El precio mayorista debe ser mayor o igual a cero';
  end if;
  if p_categoria_id is not null and not exists (select 1 from public.categorias where id = p_categoria_id) then
    raise exception 'Categoría no encontrada';
  end if;

  update public.productos
  set nombre = btrim(p_nombre),
      categoria_id = p_categoria_id,
      unidad = p_unidad,
      precio_normal = p_precio_normal,
      precio_mayorista = p_precio_mayorista
  where id = p_producto_id;

  update private.operaciones_idempotencia
  set resultado_id = p_producto_id
  where idempotency_key = p_idempotency_key;

  return p_producto_id;
end;
$function$;

-- 3) cambiar_estado_producto — activar/desactivar sin borrar historial.
CREATE OR REPLACE FUNCTION public.cambiar_estado_producto(
  p_producto_id uuid,
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
  if not public.tiene_permiso('productos','editar') then
    raise exception 'Sin permiso para editar productos';
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
    'cambiar_estado_producto',
    jsonb_build_object('producto_id', p_producto_id, 'activo', p_activo)
  );
  if v_idempotente is not null then
    return v_idempotente;
  end if;

  if not exists (select 1 from public.productos where id = p_producto_id) then
    raise exception 'Producto no encontrado';
  end if;

  update public.productos
  set activo = p_activo
  where id = p_producto_id;

  update private.operaciones_idempotencia
  set resultado_id = p_producto_id
  where idempotency_key = p_idempotency_key;

  return p_producto_id;
end;
$function$;

-- Permisos: mismo patrón que el resto de RPC de escritura (sin anon).
-- (productos_editar_estado_y_fix_null_mayorista otorgó a authenticated;
--  productos_editar_estado_revoke_anon quitó explícitamente el EXECUTE a
--  anon que las funciones heredaban por defecto al momento de crearse.)
REVOKE ALL ON FUNCTION public.actualizar_producto(uuid, text, uuid, text, numeric, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_producto(uuid, text, uuid, text, numeric, numeric, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.actualizar_producto(uuid, text, uuid, text, numeric, numeric, uuid) FROM anon;

REVOKE ALL ON FUNCTION public.cambiar_estado_producto(uuid, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_producto(uuid, boolean, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cambiar_estado_producto(uuid, boolean, uuid) FROM anon;
