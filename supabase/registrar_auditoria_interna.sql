-- DOCUMENTAL — YA EXISTE EN PRODUCCIÓN — NO EJECUTAR COMO MIGRACIÓN NUEVA
--
-- Extraído con pg_get_functiondef() contra Supabase producción
-- (project_ref: papxnkkjtkxsitcsvcme) el 2026-08-20.
-- Función interna (schema private), sin caller directo desde el frontend
-- (invocada internamente por otras funciones SECURITY DEFINER de auditoría).
-- Grants reales verificados: SIN EXECUTE para anon/authenticated/service_role;
-- solo postgres (rol de definición/owner), coherente con ser función interna
-- que otras funciones SECURITY DEFINER invocan con sus propios privilegios.

CREATE OR REPLACE FUNCTION private.registrar_auditoria_interna(p_tipo text, p_descripcion text, p_estado text DEFAULT 'exito'::text, p_entidad_id text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid, p_payload_resumen jsonb DEFAULT NULL::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id bigint;
  v_uid uuid := auth.uid();
  v_nombre text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE='42501';
  END IF;
  SELECT nombre INTO v_nombre FROM public.usuarios WHERE id = v_uid;
  INSERT INTO public.auditoria_operaciones(usuario_id, usuario_nombre, tipo, descripcion, estado, entidad_id, idempotency_key, payload_resumen)
  VALUES (v_uid, v_nombre, p_tipo, p_descripcion, p_estado, p_entidad_id, p_idempotency_key, p_payload_resumen)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
