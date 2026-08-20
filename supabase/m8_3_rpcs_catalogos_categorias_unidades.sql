-- DOCUMENTAL — YA EXISTE EN PRODUCCIÓN — NO EJECUTAR COMO MIGRACIÓN NUEVA
--
-- Extraído con pg_get_functiondef() contra Supabase producción
-- (project_ref: papxnkkjtkxsitcsvcme) el 2026-08-20.
-- Backend construido y disponible, sin caller actual en el frontend
-- (ver docs/BATTLECRUISER_AUDITORIA_RECONCILIACION_GITHUB_SUPABASE_V1.md, sección 4/15).
-- Grants reales verificados: EXECUTE solo para authenticated/postgres/service_role,
-- SIN anon (limpio, no requiere revoke adicional).

CREATE OR REPLACE FUNCTION public.crear_categoria(p_nombre text, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_idempotente uuid;
begin
  if not public.tiene_permiso('categorias','crear') then
    raise exception 'Sin permiso para crear categorías';
  end if;
  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;
  v_idempotente := private.reclamar_idempotencia(p_idempotency_key, auth.uid(), 'crear_categoria', jsonb_build_object('nombre', p_nombre));
  if v_idempotente is not null then return v_idempotente; end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre de la categoría es requerido';
  end if;

  insert into public.categorias (nombre) values (btrim(p_nombre)) returning id into v_id;

  update private.operaciones_idempotencia set resultado_id = v_id where idempotency_key = p_idempotency_key;
  perform public.registrar_auditoria('categoria', 'Categoría creada: '||btrim(p_nombre), 'exito', v_id::text, p_idempotency_key, null);
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cambiar_estado_categoria(p_categoria_id uuid, p_activo boolean, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_idempotente uuid;
begin
  if not public.tiene_permiso('categorias','editar') then
    raise exception 'Sin permiso para editar categorías';
  end if;
  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;
  if p_activo is null then
    raise exception 'El estado activo es requerido';
  end if;
  v_idempotente := private.reclamar_idempotencia(p_idempotency_key, auth.uid(), 'cambiar_estado_categoria', jsonb_build_object('categoria_id', p_categoria_id, 'activo', p_activo));
  if v_idempotente is not null then return v_idempotente; end if;

  if not exists (select 1 from public.categorias where id = p_categoria_id) then
    raise exception 'Categoría no encontrada';
  end if;

  update public.categorias set activo = p_activo where id = p_categoria_id;

  update private.operaciones_idempotencia set resultado_id = p_categoria_id where idempotency_key = p_idempotency_key;
  perform public.registrar_auditoria('categoria_estado', 'Categoría '||(case when p_activo then 'activada' else 'desactivada' end), 'exito', p_categoria_id::text, p_idempotency_key, null);
  return p_categoria_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.crear_unidad(p_nombre text, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_idempotente uuid;
begin
  if not public.tiene_permiso('unidades','crear') then
    raise exception 'Sin permiso para crear unidades';
  end if;
  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;
  v_idempotente := private.reclamar_idempotencia(p_idempotency_key, auth.uid(), 'crear_unidad', jsonb_build_object('nombre', p_nombre));
  if v_idempotente is not null then return v_idempotente; end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre de la unidad es requerido';
  end if;

  insert into public.unidades (nombre) values (btrim(p_nombre)) returning id into v_id;

  update private.operaciones_idempotencia set resultado_id = v_id where idempotency_key = p_idempotency_key;
  perform public.registrar_auditoria('unidad', 'Unidad creada: '||btrim(p_nombre), 'exito', v_id::text, p_idempotency_key, null);
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cambiar_estado_unidad(p_unidad_id uuid, p_activo boolean, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_idempotente uuid;
begin
  if not public.tiene_permiso('unidades','editar') then
    raise exception 'Sin permiso para editar unidades';
  end if;
  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;
  if p_activo is null then
    raise exception 'El estado activo es requerido';
  end if;
  v_idempotente := private.reclamar_idempotencia(p_idempotency_key, auth.uid(), 'cambiar_estado_unidad', jsonb_build_object('unidad_id', p_unidad_id, 'activo', p_activo));
  if v_idempotente is not null then return v_idempotente; end if;

  if not exists (select 1 from public.unidades where id = p_unidad_id) then
    raise exception 'Unidad no encontrada';
  end if;

  update public.unidades set activo = p_activo where id = p_unidad_id;

  update private.operaciones_idempotencia set resultado_id = p_unidad_id where idempotency_key = p_idempotency_key;
  perform public.registrar_auditoria('unidad_estado', 'Unidad '||(case when p_activo then 'activada' else 'desactivada' end), 'exito', p_unidad_id::text, p_idempotency_key, null);
  return p_unidad_id;
end;
$function$;
