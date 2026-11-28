-- Supply the parent-period dates and master-turn state to Jornada calendar consumers.
-- This is a PR migration only; it is not applied to the connected production project.
BEGIN;

CREATE OR REPLACE FUNCTION public.bc5_mis_jornadas(
  p_fecha_inicio date,
  p_fecha_fin date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
  v_is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE = '42501';
  END IF;
  IF p_fecha_inicio IS NULL OR p_fecha_fin IS NULL
     OR p_fecha_fin < p_fecha_inicio OR p_fecha_fin - p_fecha_inicio > 30 THEN
    RAISE EXCEPTION 'El rango de consulta debe contener entre 1 y 31 días.'
      USING ERRCODE = '22023';
  END IF;
  v_is_admin := public.bc_actor_is_admin();

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id',p.id,
      'turno_id',p.turno_id,
      'almacen_id',p.almacen_id,
      'numero_dia',p.numero_dia,
      'fecha',p.fecha,
      'trabaja',p.trabaja,
      'responsable_id',CASE WHEN v_is_admin OR p.responsable_id=auth.uid()
                            THEN p.responsable_id ELSE NULL END,
      'hora_inicio_prevista',p.hora_inicio_prevista,
      'hora_fin_prevista',p.hora_fin_prevista,
      'zona_horaria',p.zona_horaria,
      'patron_id',p.patron_id,
      'estado',p.estado,
      'motivo_ajuste',p.motivo_ajuste,
      'sesion_id',s.id,
      'sesion_estado',s.estado,
      'turno_fecha_inicio',t.fecha,
      'dias_turno',t.dias_turno,
      'turno_estado',t.estado,
      'turno_estado_maestro',coalesce(t.estado_maestro,t.estado),
      'es_responsable',p.responsable_id=auth.uid()
    ) ORDER BY p.fecha,p.numero_dia
  ),'[]'::jsonb)
  INTO v_result
  FROM public.turno_jornada_programacion p
  JOIN public.turnos t ON t.id=p.turno_id
  LEFT JOIN public.turno_sesiones s ON s.jornada_programacion_id=p.id
  WHERE p.fecha BETWEEN p_fecha_inicio AND p_fecha_fin
    AND (
      v_is_admin
      OR p.responsable_id=auth.uid()
      OR (
        p.patron_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.turno_jornada_patron_dias d
          WHERE d.patron_id=p.patron_id AND d.responsable_id=auth.uid()
        )
      )
    );

  RETURN v_result;
END;
$function$;

COMMIT;
