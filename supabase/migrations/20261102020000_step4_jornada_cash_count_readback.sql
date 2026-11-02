-- Step 4: expose the owner-counted cash reconciliation in the assigned Jornada read model.
-- This is a read-only JSON extension; it does not alter declarations or cash records.
BEGIN;

CREATE OR REPLACE FUNCTION public.bc7_obtener_inventario_jornada(p_turno_sesion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde al modelo de jornada única.' USING ERRCODE='23503';
  END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programación no encontrada.' USING ERRCODE='23503'; END IF;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS (
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado con turnos.ver puede consultar esta jornada.' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'sesion',jsonb_build_object(
      'id',v_s.id,'turno_id',v_s.turno_id,'almacen_id',v_s.almacen_id,
      'numero_dia',v_s.numero_dia,'fecha',v_s.fecha,'bloque',v_s.bloque,
      'estado',v_s.estado,'hora_inicio_prevista',v_p.hora_inicio_prevista,
      'hora_fin_prevista',v_p.hora_fin_prevista,'zona_horaria',v_p.zona_horaria,
      'responsable_id',v_p.responsable_id,'programacion_id',v_p.id
    ),
    'productos',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'producto_id',p.id,'nombre',p.nombre,'unidad',p.unidad,
        'stock_actual',s.cantidad,'minimo',s.minimo
      ) ORDER BY p.nombre,p.id)
      FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
      WHERE s.almacen_id=v_s.almacen_id AND p.activo=true
    ),'[]'::jsonb),
    'cortes',coalesce((
      SELECT jsonb_object_agg(c.tipo,jsonb_build_object(
        'id',c.id,'tipo',c.tipo,'estado',c.estado,'creado_por',c.creado_por,
        'confirmado_por',c.confirmado_por,'creado_en',c.creado_en,
        'confirmado_en',c.confirmado_en,'observacion',c.observacion,
        'origen_corte_id',c.origen_corte_id,
        'lineas',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'producto_id',l.producto_id,'cantidad_contada',l.cantidad_contada,
            'stock_sistema',l.stock_sistema,'diferencia',l.cantidad_contada-l.stock_sistema
          ) ORDER BY p.nombre,p.id)
          FROM public.turno_jornada_inventario_lineas l
          JOIN public.productos p ON p.id=l.producto_id
          WHERE l.corte_id=c.id
        ),'[]'::jsonb)
      ))
      FROM public.turno_jornada_inventario_cortes c
      WHERE c.turno_sesion_id=v_s.id
    ),'{}'::jsonb),
    'apertura_previa',(
      SELECT jsonb_build_object(
        'corte_id',c.id,'sesion_id',ps.id,'numero_dia',ps.numero_dia,'fecha',ps.fecha,
        'lineas',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'producto_id',l.producto_id,'cantidad_contada',l.cantidad_contada
          ) ORDER BY p.nombre,p.id)
          FROM public.turno_jornada_inventario_lineas l
          JOIN public.productos p ON p.id=l.producto_id
          WHERE l.corte_id=c.id
        ),'[]'::jsonb)
      )
      FROM public.turno_sesiones ps
      JOIN public.turno_jornada_inventario_cortes c ON c.turno_sesion_id=ps.id
      WHERE ps.turno_id=v_s.turno_id AND ps.numero_dia=v_s.numero_dia-1
        AND ps.fecha<v_s.fecha AND ps.bloque='JORNADA' AND ps.estado='COMPLETADA'
        AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
      LIMIT 1
    ),
    'tramo_activo',(
      SELECT jsonb_build_object('id',t.id,'usuario_id',t.usuario_id,'inicio_at',t.inicio_at)
      FROM public.turno_tramos t
      WHERE t.turno_sesion_id=v_s.id AND t.estado='ACTIVO'
      ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST LIMIT 1
    ),
    'declaracion_dinero',(
      SELECT jsonb_build_object(
        'id',d.id,
        'turno_tramo_id',d.turno_tramo_id,
        'monto',d.monto,
        'moneda',d.moneda,
        'estado_aprobacion',d.estado_aprobacion,
        'declarado_at',d.declarado_at,
        'monto_contado',d.monto_contado,
        'contado_por',d.contado_por,
        'contado_at',d.contado_at,
        'observacion_conteo',d.observacion_conteo,
        'diferencia',d.diferencia,
        'aprobado_por',d.aprobado_por,
        'aprobado_at',d.aprobado_at
      )
      FROM public.turno_declaraciones d
      WHERE d.turno_sesion_id=v_s.id
        AND d.turno_tramo_id=coalesce(
          (SELECT t.id FROM public.turno_tramos t
           WHERE t.turno_sesion_id=v_s.id AND t.estado='ACTIVO'
           ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST LIMIT 1),
          (SELECT t.id FROM public.turno_tramos t
           WHERE t.turno_sesion_id=v_s.id
           ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST LIMIT 1)
        )
      ORDER BY d.declarado_at DESC NULLS LAST,d.created_at DESC NULLS LAST LIMIT 1
    )
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.bc7_obtener_inventario_jornada(uuid) IS
  'Reads the assigned Jornada workspace, including declared cash and the owner-counted amount/difference from the same authorized declaration. No cash or inventory rows are changed by this function.';

COMMIT;
