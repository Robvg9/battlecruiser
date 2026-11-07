-- Mixed warehouse summary windows: storage warehouses reset at Havana midnight;
-- retail warehouses retain their active or most recently completed real jornada.
-- Read-only RPC. It never creates jornadas or modifies operational history.
BEGIN;

CREATE OR REPLACE FUNCTION public.bc_movimientos_resumen_ventanas()
RETURNS TABLE(
  almacen_id uuid,
  almacen text,
  tipo text,
  desde timestamptz,
  hasta timestamptz,
  modo text,
  jornada_sesion_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Havana')::date;
  v_inicio_dia timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.tiene_permiso('reportes','ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver movimientos.' USING ERRCODE='42501';
  END IF;

  v_inicio_dia := v_hoy::timestamp without time zone AT TIME ZONE 'America/Havana';

  RETURN QUERY
  WITH jornada_candidates AS (
    SELECT
      s.almacen_id,
      s.id AS sesion_id,
      s.estado,
      COALESCE(MIN(tr.inicio_at), MIN(t.apertura_real)) AS inicio_real,
      COALESCE(MAX(tr.fin_at), MAX(t.cierre_real)) AS cierre_real
    FROM public.turno_sesiones s
    LEFT JOIN public.turno_tramos tr ON tr.turno_sesion_id=s.id
    LEFT JOIN public.turnos t ON t.id=s.turno_id
    WHERE s.bloque='JORNADA'
      AND s.jornada_programacion_id IS NOT NULL
      AND s.estado IN ('EN_CURSO','COMPLETADA')
    GROUP BY s.almacen_id,s.id,s.estado
  ),
  jornada_elegida AS (
    SELECT
      j.*,
      row_number() OVER (
        PARTITION BY j.almacen_id
        ORDER BY CASE WHEN j.estado='EN_CURSO' THEN 0 ELSE 1 END,
                 j.inicio_real DESC NULLS LAST,
                 j.sesion_id DESC
      ) AS posicion
    FROM jornada_candidates j
    WHERE j.inicio_real IS NOT NULL
  )
  SELECT
    a.id,
    a.nombre,
    a.tipo,
    CASE WHEN lower(coalesce(a.tipo,''))='minorista'
      THEN coalesce(j.inicio_real,v_inicio_dia) ELSE v_inicio_dia END,
    CASE WHEN lower(coalesce(a.tipo,''))='minorista'
      AND j.sesion_id IS NOT NULL AND j.estado='COMPLETADA'
      THEN coalesce(j.cierre_real,now()) ELSE now() END,
    CASE
      WHEN lower(coalesce(a.tipo,''))='minorista' AND j.estado='EN_CURSO' THEN 'JORNADA_ACTIVA'
      WHEN lower(coalesce(a.tipo,''))='minorista' AND j.estado='COMPLETADA' THEN 'ULTIMA_JORNADA'
      WHEN lower(coalesce(a.tipo,''))='minorista' THEN 'DIARIO_SIN_JORNADA'
      ELSE 'DIARIO'
    END,
    CASE WHEN lower(coalesce(a.tipo,''))='minorista' THEN j.sesion_id ELSE NULL::uuid END
  FROM public.almacenes a
  LEFT JOIN jornada_elegida j ON j.almacen_id=a.id AND j.posicion=1
  WHERE a.activo=true
  ORDER BY a.nombre;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc_movimientos_resumen_ventanas() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc_movimientos_resumen_ventanas() TO authenticated;

COMMIT;
