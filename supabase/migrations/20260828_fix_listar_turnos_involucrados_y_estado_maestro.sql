-- BattleCruiser TURNO
-- Align listar_turnos with the live Turno contract.
-- Non-admin users can see turns they created or are actively assigned to.
-- p_estado matches both legacy estado and the authoritative estado_maestro.

CREATE OR REPLACE FUNCTION public.listar_turnos(p_usuario_id uuid DEFAULT NULL::uuid, p_estado text DEFAULT NULL::text, p_almacen_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid, usuario_nombre text, almacen_id uuid, fecha date, apertura_real timestamp with time zone, cierre_real timestamp with time zone, estado text, observacion text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  admin boolean;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.';
  END IF;
  admin := public.tiene_permiso('turnos','editar_any');
  IF p_limite IS NULL OR p_limite > 200 OR p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
  SELECT t.id, t.usuario_nombre, t.almacen_id, t.fecha,
         t.apertura_real, t.cierre_real, t.estado, t.observacion
  FROM public.turnos t
  WHERE
    (
      admin
      OR t.creado_por = uid
      OR EXISTS (
        SELECT 1 FROM public.turno_asignaciones a
        WHERE a.turno_id = t.id
          AND a.usuario_id = uid
          AND a.retirado_at IS NULL
      )
    )
    AND (
      p_usuario_id IS NULL
      OR t.usuario_id = p_usuario_id
      OR EXISTS (
        SELECT 1 FROM public.turno_asignaciones a2
        WHERE a2.turno_id = t.id
          AND a2.usuario_id = p_usuario_id
          AND a2.retirado_at IS NULL
      )
    )
    AND (
      p_estado IS NULL OR p_estado = ''
      OR t.estado = p_estado
      OR t.estado_maestro = p_estado
    )
    AND (p_almacen_id IS NULL OR t.almacen_id = p_almacen_id)
  ORDER BY t.fecha DESC, t.apertura_real DESC NULLS LAST
  LIMIT p_limite OFFSET p_offset;
END;
$function$;
