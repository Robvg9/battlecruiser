-- Read-only daily movement archive for one explicitly identified turn session.
-- Attribution uses the actor + actual turn-tramo time interval + warehouse + business date.
-- Existing rows are not changed and events with no matching tramo remain in general History.
CREATE OR REPLACE FUNCTION public.bc7_movimientos_sesion(p_turno_sesion_id uuid)
RETURNS TABLE(
  fecha timestamptz,
  tipo text,
  producto text,
  almacen text,
  cantidad numeric,
  costo_unitario numeric,
  usuario text,
  operacion_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.tiene_permiso('reportes', 'ver')
     AND NOT public.tiene_permiso('turnos', 'ver') THEN
    RAISE EXCEPTION 'No tienes permiso para consultar movimientos ni turnos.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id = p_turno_sesion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La sesión del turno no existe.' USING ERRCODE = '23503';
  END IF;

  IF NOT public.bc_actor_is_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.turnos t
       WHERE t.id = v_s.turno_id
         AND t.usuario_id = v_uid
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.turno_asignaciones a
       WHERE a.turno_sesion_id = v_s.id
         AND a.usuario_id = v_uid
         AND a.retirado_at IS NULL
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.turno_jornada_programacion p
       WHERE p.id = v_s.jornada_programacion_id
         AND p.responsable_id = v_uid
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.turno_tramos tr
       WHERE tr.turno_sesion_id = v_s.id
         AND tr.usuario_id = v_uid
     ) THEN
    RAISE EXCEPTION 'Solo el responsable, participante asignado o administrador puede consultar este archivo.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    lc.fecha_compra,
    'compra'::text,
    p.nombre::text,
    a.nombre::text,
    lc.cantidad_inicial,
    lc.costo_unitario,
    COALESCE(u.nombre, '')::text,
    lc.id
  FROM public.lotes_compra lc
  JOIN public.productos p ON p.id = lc.producto_id
  JOIN public.almacenes a ON a.id = lc.almacen_id
  LEFT JOIN public.usuarios u ON u.id = lc.usuario_id
  WHERE lc.origen = 'compra'
    AND lc.almacen_id = v_s.almacen_id
    AND (lc.fecha_compra AT TIME ZONE 'America/Havana')::date = v_s.fecha
    AND EXISTS (
      SELECT 1
      FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id = v_s.id
        AND tr.usuario_id = lc.usuario_id
        AND lc.fecha_compra >= tr.inicio_at
        AND (tr.fin_at IS NULL OR lc.fecha_compra < tr.fin_at)
    )

  UNION ALL

  SELECT
    v.fecha,
    'venta'::text,
    p.nombre::text,
    a.nombre::text,
    -vl.cantidad,
    vl.costo_unitario_fifo,
    COALESCE(u.nombre, '')::text,
    v.id
  FROM public.ventas_lineas vl
  JOIN public.ventas v ON v.id = vl.venta_id
  JOIN public.productos p ON p.id = vl.producto_id
  JOIN public.almacenes a ON a.id = v.almacen_id
  LEFT JOIN public.usuarios u ON u.id = v.creado_por
  WHERE v.almacen_id = v_s.almacen_id
    AND (v.fecha AT TIME ZONE 'America/Havana')::date = v_s.fecha
    AND EXISTS (
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id = v_s.id
        AND tr.usuario_id = v.creado_por
        AND v.fecha >= tr.inicio_at
        AND (tr.fin_at IS NULL OR v.fecha < tr.fin_at)
    )

  UNION ALL

  SELECT
    t.fecha,
    'transferencia_salida'::text,
    p.nombre::text,
    origen.nombre::text,
    -tl.cantidad,
    NULL::numeric,
    COALESCE(u.nombre, '')::text,
    t.id
  FROM public.transferencias_lineas tl
  JOIN public.transferencias t ON t.id = tl.transferencia_id
  JOIN public.productos p ON p.id = tl.producto_id
  JOIN public.almacenes origen ON origen.id = t.almacen_origen_id
  LEFT JOIN public.usuarios u ON u.id = t.creado_por
  WHERE t.almacen_origen_id = v_s.almacen_id
    AND (t.fecha AT TIME ZONE 'America/Havana')::date = v_s.fecha
    AND EXISTS (
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id = v_s.id
        AND tr.usuario_id = t.creado_por
        AND t.fecha >= tr.inicio_at
        AND (tr.fin_at IS NULL OR t.fecha < tr.fin_at)
    )

  UNION ALL

  SELECT
    t.fecha,
    'transferencia_entrada'::text,
    p.nombre::text,
    destino.nombre::text,
    tl.cantidad,
    NULL::numeric,
    COALESCE(u.nombre, '')::text,
    t.id
  FROM public.transferencias_lineas tl
  JOIN public.transferencias t ON t.id = tl.transferencia_id
  JOIN public.productos p ON p.id = tl.producto_id
  JOIN public.almacenes destino ON destino.id = t.almacen_destino_id
  LEFT JOIN public.usuarios u ON u.id = t.creado_por
  WHERE t.almacen_destino_id = v_s.almacen_id
    AND (t.fecha AT TIME ZONE 'America/Havana')::date = v_s.fecha
    AND EXISTS (
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id = v_s.id
        AND tr.usuario_id = t.creado_por
        AND t.fecha >= tr.inicio_at
        AND (tr.fin_at IS NULL OR t.fecha < tr.fin_at)
    )

  UNION ALL

  SELECT
    vs.fecha,
    'vale'::text,
    p.nombre::text,
    a.nombre::text,
    -vs.cantidad,
    NULL::numeric,
    COALESCE(u.nombre, '')::text,
    vs.id
  FROM public.vales_salida vs
  JOIN public.productos p ON p.id = vs.producto_id
  JOIN public.almacenes a ON a.id = vs.almacen_id
  LEFT JOIN public.usuarios u ON u.id = vs.creado_por
  WHERE vs.almacen_id = v_s.almacen_id
    AND (vs.fecha AT TIME ZONE 'America/Havana')::date = v_s.fecha
    AND EXISTS (
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id = v_s.id
        AND tr.usuario_id = vs.creado_por
        AND vs.fecha >= tr.inicio_at
        AND (tr.fin_at IS NULL OR vs.fecha < tr.fin_at)
    )

  UNION ALL

  SELECT
    COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en),
    'merma'::text,
    p.nombre::text,
    a.nombre::text,
    -m.cantidad,
    NULL::numeric,
    COALESCE(m.revisado_nombre, m.creado_nombre, '')::text,
    m.id
  FROM public.mermas m
  JOIN public.productos p ON p.id = m.producto_id
  JOIN public.almacenes a ON a.id = m.almacen_id
  WHERE m.estado = 'APROBADA'
    AND m.almacen_id = v_s.almacen_id
    AND (COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) AT TIME ZONE 'America/Havana')::date = v_s.fecha
    AND EXISTS (
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id = v_s.id
        AND tr.usuario_id = COALESCE(m.revisado_por, m.creado_por)
        AND COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) >= tr.inicio_at
        AND (tr.fin_at IS NULL OR COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) < tr.fin_at)
    )

  UNION ALL

  SELECT
    COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en),
    'baja'::text,
    p.nombre::text,
    a.nombre::text,
    -b.cantidad,
    NULL::numeric,
    COALESCE(b.revisado_nombre, b.creado_nombre, '')::text,
    b.id
  FROM public.bajas b
  JOIN public.productos p ON p.id = b.producto_id
  JOIN public.almacenes a ON a.id = b.almacen_id
  WHERE b.estado = 'APROBADA'
    AND b.almacen_id = v_s.almacen_id
    AND (COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) AT TIME ZONE 'America/Havana')::date = v_s.fecha
    AND EXISTS (
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id = v_s.id
        AND tr.usuario_id = COALESCE(b.revisado_por, b.creado_por)
        AND COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) >= tr.inicio_at
        AND (tr.fin_at IS NULL OR COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) < tr.fin_at)
    )
  ORDER BY 1 DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_movimientos_sesion(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bc7_movimientos_sesion(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.bc7_movimientos_sesion(uuid) TO authenticated;
