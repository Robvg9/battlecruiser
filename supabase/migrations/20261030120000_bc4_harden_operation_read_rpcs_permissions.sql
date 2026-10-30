-- BattleCruiser #222 — require view permission on operational read RPCs.
-- Additive hardening only: no role, permission, turn, stock, or financial rows change.

CREATE OR REPLACE FUNCTION public.listar_incidencias(
  p_estado text DEFAULT NULL::text,
  p_tipo text DEFAULT NULL::text,
  p_turno_id uuid DEFAULT NULL::uuid,
  p_limite integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, tipo text, descripcion text, usuario_nombre text, turno_id uuid,
  cuadre_id uuid, estado text, resolucion text, resuelta_nombre text,
  fecha_resolucion timestamp with time zone, creado_en timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid;
  admin boolean;
BEGIN
  uid := public._validar_usuario_operacion('turnos', 'ver');
  admin := public.tiene_permiso('turnos', 'editar_any');

  IF p_limite IS NULL OR p_limite > 200 OR p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
  SELECT i.id, i.tipo, i.descripcion, i.usuario_nombre, i.turno_id, i.cuadre_id,
         i.estado, i.resolucion, i.resuelta_nombre, i.fecha_resolucion, i.creado_en
  FROM public.incidencias i
  WHERE (admin OR i.usuario_id = uid)
    AND (p_estado IS NULL OR p_estado = '' OR i.estado = p_estado)
    AND (p_tipo IS NULL OR p_tipo = '' OR i.tipo = p_tipo)
    AND (p_turno_id IS NULL OR i.turno_id = p_turno_id)
  ORDER BY i.creado_en DESC
  LIMIT p_limite OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_responsabilidades(
  p_usuario_id uuid DEFAULT NULL::uuid,
  p_turno_id uuid DEFAULT NULL::uuid,
  p_estado text DEFAULT NULL::text,
  p_limite integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, titulo text, descripcion text, usuario_id uuid, turno_id uuid,
  fecha_limite timestamp with time zone, estado text, prioridad text,
  creador_nombre text, completada_en timestamp with time zone, observacion_final text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid;
  admin boolean;
BEGIN
  uid := public._validar_usuario_operacion('turnos', 'ver');
  admin := public.tiene_permiso('turnos', 'editar_any');

  IF p_limite IS NULL OR p_limite > 200 OR p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
  SELECT r.id, r.titulo, r.descripcion, r.usuario_id, r.turno_id, r.fecha_limite,
         r.estado, r.prioridad, r.creador_nombre, r.completada_en, r.observacion_final
  FROM public.responsabilidades r
  WHERE (admin OR r.usuario_id = uid OR r.creador_id = uid)
    AND (p_usuario_id IS NULL OR r.usuario_id = p_usuario_id)
    AND (p_turno_id IS NULL OR r.turno_id = p_turno_id)
    AND (p_estado IS NULL OR p_estado = '' OR r.estado = p_estado)
  ORDER BY r.creado_en DESC
  LIMIT p_limite OFFSET p_offset;
END;
$function$;
