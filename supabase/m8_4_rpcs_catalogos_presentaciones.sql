-- DOCUMENTAL — YA EXISTE EN PRODUCCIÓN — NO EJECUTAR COMO MIGRACIÓN NUEVA
--
-- Extraído con pg_get_functiondef() contra Supabase producción
-- (project_ref: papxnkkjtkxsitcsvcme) el 2026-08-20.
-- Backend construido y disponible, sin caller actual en el frontend
-- (ver docs/BATTLECRUISER_AUDITORIA_RECONCILIACION_GITHUB_SUPABASE_V1.md, sección 4/15).
-- Grants reales verificados: EXECUTE solo para authenticated/postgres/service_role,
-- SIN anon (limpio, no requiere revoke adicional).

CREATE OR REPLACE FUNCTION public.crear_presentacion(p_nombre text, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_idempotente uuid;
begin
  if not public.tiene_permiso('presentaciones','crear') then
    raise exception 'Sin permiso para crear presentaciones';
  end if;
  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;
  v_idempotente := private.reclamar_idempotencia(p_idempotency_key, auth.uid(), 'crear_presentacion', jsonb_build_object('nombre', p_nombre));
  if v_idempotente is not null then return v_idempotente; end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre de la presentación es requerido';
  end if;

  insert into public.presentaciones (nombre) values (btrim(p_nombre)) returning id into v_id;

  update private.operaciones_idempotencia set resultado_id = v_id where idempotency_key = p_idempotency_key;
  perform public.registrar_auditoria('presentacion', 'Presentación creada: '||btrim(p_nombre), 'exito', v_id::text, p_idempotency_key, null);
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_presentacion(p_presentacion_id uuid, p_nombre text, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_idempotente uuid;
begin
  if not public.tiene_permiso('presentaciones','editar') then
    raise exception 'Sin permiso para editar presentaciones';
  end if;
  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;
  v_idempotente := private.reclamar_idempotencia(p_idempotency_key, auth.uid(), 'actualizar_presentacion', jsonb_build_object('presentacion_id', p_presentacion_id, 'nombre', p_nombre));
  if v_idempotente is not null then return v_idempotente; end if;

  if not exists (select 1 from public.presentaciones where id = p_presentacion_id) then
    raise exception 'Presentación no encontrada';
  end if;
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre de la presentación es requerido';
  end if;

  update public.presentaciones set nombre = btrim(p_nombre) where id = p_presentacion_id;

  update private.operaciones_idempotencia set resultado_id = p_presentacion_id where idempotency_key = p_idempotency_key;
  perform public.registrar_auditoria('presentacion_actualizar', 'Presentación renombrada a: '||btrim(p_nombre), 'exito', p_presentacion_id::text, p_idempotency_key, null);
  return p_presentacion_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cambiar_estado_presentacion(p_presentacion_id uuid, p_activo boolean, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_idempotente uuid;
begin
  if not public.tiene_permiso('presentaciones','editar') then
    raise exception 'Sin permiso para editar presentaciones';
  end if;
  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;
  if p_activo is null then
    raise exception 'El estado activo es requerido';
  end if;
  v_idempotente := private.reclamar_idempotencia(p_idempotency_key, auth.uid(), 'cambiar_estado_presentacion', jsonb_build_object('presentacion_id', p_presentacion_id, 'activo', p_activo));
  if v_idempotente is not null then return v_idempotente; end if;

  if not exists (select 1 from public.presentaciones where id = p_presentacion_id) then
    raise exception 'Presentación no encontrada';
  end if;

  update public.presentaciones set activo = p_activo where id = p_presentacion_id;

  update private.operaciones_idempotencia set resultado_id = p_presentacion_id where idempotency_key = p_idempotency_key;
  perform public.registrar_auditoria('presentacion_estado', 'Presentación '||(case when p_activo then 'activada' else 'desactivada' end), 'exito', p_presentacion_id::text, p_idempotency_key, null);
  return p_presentacion_id;
end;
$function$;
