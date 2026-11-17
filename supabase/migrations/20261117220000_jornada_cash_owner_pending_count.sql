-- BattleCruiser: surface approved final declarations in the Owner's physical-count queue.
-- No cash values or counts are written by this migration.
BEGIN;
CREATE OR REPLACE FUNCTION public.bc5_listar_dinero_pendiente_contar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador puede consultar las entregas pendientes de conteo.' USING ERRCODE='42501';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.declarado_at DESC NULLS LAST,q.declaracion_id), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT
      d.id AS declaracion_id,
      d.turno_id,
      d.turno_sesion_id,
      d.turno_tramo_id,
      t.almacen_id,
      al.nombre AS almacen_nombre,
      s.fecha,
      s.numero_dia,
      s.bloque,
      s.estado AS estado_sesion,
      d.usuario_id AS responsable_id,
      coalesce(u.nombre,'Usuario') AS responsable_nombre,
      d.monto AS monto_declarado,
      d.moneda,
      d.declarado_at,
      d.monto_contado,
      d.diferencia,
      d.estado_aprobacion,
      d.contado_por,
      coalesce(cu.nombre,'') AS contador_nombre,
      d.contado_at,
      d.observacion_conteo,
      dif.id AS diferencia_id,
      coalesce(dif.aprobado,false) AS diferencia_aprobada,
      dif.comentario AS comentario_diferencia
    FROM public.turno_declaraciones d
    JOIN public.turno_sesiones s ON s.id=d.turno_sesion_id
    JOIN public.turnos t ON t.id=d.turno_id
    LEFT JOIN public.almacenes al ON al.id=t.almacen_id
    LEFT JOIN public.usuarios u ON u.id=d.usuario_id
    LEFT JOIN public.usuarios cu ON cu.id=d.contado_por
    LEFT JOIN LATERAL (
      SELECT x.id,x.aprobado,x.comentario
      FROM public.turno_diferencias x
      WHERE x.declaracion_dinero_id=d.id
      ORDER BY x.created_at DESC
      LIMIT 1
    ) dif ON true
    WHERE t.ciclo_id IS NULL AND t.sesion_id IS NULL
      AND s.estado='COMPLETADA'
      AND d.estado_aprobacion IN ('PENDIENTE','ESPERANDO_APROBACION','DECLARACION_APROBADA','CON_DIFERENCIA')
  ) q;

  RETURN coalesce(v_result,'[]'::jsonb);
END;
$function$
;
COMMIT;
