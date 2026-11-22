-- Expose period metadata to administrators in the existing authenticated Jornada calendar read.
-- This lets the UI preview the complete period without widening the read window or exposing
-- master scheduling metadata to non-admin users.

BEGIN;

DO $patch$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc5_mis_jornadas(date,date)'::regprocedure)
  INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'No se encontró public.bc5_mis_jornadas(date,date).';
  END IF;

  v_old := $old$'id',p.id,'turno_id',p.turno_id,'almacen_id',p.almacen_id,$old$;
  v_new := $new$'id',p.id,'turno_id',p.turno_id,
      'dias_total',CASE WHEN v_is_admin THEN t.dias_turno ELSE NULL END,
      'estado_maestro',CASE WHEN v_is_admin THEN coalesce(t.estado_maestro,t.estado) ELSE NULL END,
      'almacen_id',p.almacen_id,$new$;

  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se localizó exactamente una salida turno_id/almacen_id en bc5_mis_jornadas.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$FROM public.turno_jornada_programacion p
  LEFT JOIN public.turno_sesiones s ON s.jornada_programacion_id=p.id
  WHERE$old$;
  v_new := $new$FROM public.turno_jornada_programacion p
  JOIN public.turnos t ON t.id=p.turno_id
  LEFT JOIN public.turno_sesiones s ON s.jornada_programacion_id=p.id
  WHERE$new$;

  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se localizó exactamente el FROM/LEFT JOIN esperado en bc5_mis_jornadas.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END;
$patch$;

COMMENT ON FUNCTION public.bc5_mis_jornadas(date,date) IS
  'Authenticated Jornada calendar read. Includes dias_total and estado_maestro only for ADMIN users to support safe full-period move previews.';

COMMIT;
