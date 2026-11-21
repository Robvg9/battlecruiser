-- Return the complete programmed work period and current unit cost to the price-change UI.
BEGIN;
CREATE OR REPLACE FUNCTION public.bc7_cambios_precio_contexto()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_context jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede preparar cambios de precio.' USING ERRCODE='42501';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'sesion_id',s.id,
      'turno_id',s.turno_id,
      'almacen_id',s.almacen_id,
      'almacen_nombre',a.nombre,
      'fecha',s.fecha,
      'fecha_inicio',coalesce((SELECT min(p2.fecha) FROM public.turno_jornada_programacion p2 WHERE p2.turno_id=s.turno_id AND p2.almacen_id=s.almacen_id AND p2.estado IN ('PROGRAMADA','DESCANSO')),s.fecha),
      'fecha_fin',coalesce((SELECT max(p2.fecha) FROM public.turno_jornada_programacion p2 WHERE p2.turno_id=s.turno_id AND p2.almacen_id=s.almacen_id AND p2.estado IN ('PROGRAMADA','DESCANSO')),s.fecha),
      'responsable_id',jp.responsable_id,
      'productos',coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'producto_id',p.producto_id,
          'nombre',p.nombre,
          'unidad',pr.unidad,
          'precio_actual',coalesce(pr.precio_normal,0),
          'costo_actual',coalesce(pr.costo_unitario_referencia,0),
          'stock_sistema',p.stock_actual
        ) ORDER BY p.nombre,p.producto_id)
        FROM public.bc7_productos_ajuste_jornada(s.id) p
        JOIN public.productos pr ON pr.id=p.producto_id
        WHERE p.producto_padre_id IS NULL
      ),'[]'::jsonb)
    ) ORDER BY s.fecha,s.numero_dia
  ),'[]'::jsonb)
  INTO v_context
  FROM public.turno_sesiones s
  JOIN public.turno_jornada_programacion jp ON jp.id=s.jornada_programacion_id
  JOIN public.almacenes a ON a.id=s.almacen_id
  WHERE s.bloque='JORNADA'
    AND s.estado='EN_CURSO'
    AND a.tipo='minorista'
    AND EXISTS(
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id=s.id AND tr.estado='ACTIVO'
    );
  RETURN v_context;
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_cambios_precio_contexto() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_cambios_precio_contexto() TO authenticated;
COMMIT;
