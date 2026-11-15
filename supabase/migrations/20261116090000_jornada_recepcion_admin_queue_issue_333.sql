-- Issue #333: shared inventory reception admin queue read model.
-- Adds read-only detail RPC and exposes pending receptions in listar_aprobaciones_admin
-- without changing the existing return shape consumed by Centro de Control.

BEGIN;

CREATE OR REPLACE FUNCTION public.bc7_detalle_recepcion_entrega_jornada(p_entrega_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_e public.turno_jornada_inventario_entregas;
  v_detail jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF NOT (
    public.bc_actor_is_admin()
    OR public.tiene_permiso('auditoria','editar_any')
    OR public.tiene_permiso('turnos','ver')
  ) THEN
    RAISE EXCEPTION 'Sin permiso para consultar el detalle de recepciones de jornada.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_e
  FROM public.turno_jornada_inventario_entregas
  WHERE id=p_entrega_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrega de inventario no encontrada.' USING ERRCODE='23503';
  END IF;

  -- turnos.ver is limited: non-admin/non-auditor callers may only read deliveries
  -- for jornadas/almacenes they belong to (origin or destination assignment context).
  IF NOT (
    public.bc_actor_is_admin()
    OR public.tiene_permiso('auditoria','editar_any')
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.turno_sesiones s
      LEFT JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
      LEFT JOIN public.turno_asignaciones ta ON ta.turno_sesion_id=s.id AND ta.retirado_at IS NULL
      LEFT JOIN public.turnos t ON t.id=s.turno_id
      WHERE s.id IN (v_e.origen_sesion_id, v_e.destino_sesion_id)
        AND (
          p.responsable_id=auth.uid()
          OR ta.usuario_id=auth.uid()
          OR t.creado_por=auth.uid()
          OR t.usuario_id=auth.uid()
        )
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.turno_sesiones s
      JOIN public.turno_asignaciones ta ON ta.turno_sesion_id=s.id AND ta.retirado_at IS NULL
      WHERE s.almacen_id=v_e.almacen_id
        AND ta.usuario_id=auth.uid()
    ) THEN
      RAISE EXCEPTION 'Sin permiso para consultar entregas ajenas.' USING ERRCODE='42501';
    END IF;
  END IF;

  v_detail:=public._bc7_entrega_inventario_json(v_e.id);
  RETURN v_detail || jsonb_build_object(
    'almacen_nombre',(SELECT a.nombre FROM public.almacenes a WHERE a.id=v_e.almacen_id),
    'origen_fecha',(SELECT s.fecha FROM public.turno_sesiones s WHERE s.id=v_e.origen_sesion_id),
    'destino_fecha',(SELECT s.fecha FROM public.turno_sesiones s WHERE s.id=v_e.destino_sesion_id),
    'responsable_destino_id',(SELECT p.responsable_id FROM public.turno_sesiones s
      LEFT JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
      WHERE s.id=v_e.destino_sesion_id),
    'responsable_destino_nombre',(SELECT u.nombre FROM public.turno_sesiones s
      LEFT JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
      LEFT JOIN public.usuarios u ON u.id=p.responsable_id
      WHERE s.id=v_e.destino_sesion_id),
    'diferencias_count',(SELECT count(*) FROM public.turno_jornada_inventario_recepciones r
      JOIN public.turno_jornada_inventario_recepcion_lineas rl ON rl.recepcion_id=r.id
      WHERE r.entrega_id=v_e.id AND rl.diferencia<>0
        AND r.intento=(SELECT max(r2.intento) FROM public.turno_jornada_inventario_recepciones r2 WHERE r2.entrega_id=v_e.id))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_aprobaciones_admin()
 RETURNS TABLE(tipo text, id uuid, fecha timestamp with time zone, usuario_nombre text, almacen_nombre text, producto_nombre text, resumen text, monto numeric, cantidad numeric, estado text, motivo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (
    public.tiene_permiso('auditoria','editar_any')
    OR public.tiene_permiso('gastos','editar_any')
    OR public.tiene_permiso('mermas','editar_any')
    OR public.tiene_permiso('bajas','editar_any')
    OR public.tiene_permiso('reinversiones','editar_any')
    OR public.tiene_permiso('entregas_caja','editar_any')
  ) THEN
    RAISE EXCEPTION 'Sin permiso para ver aprobaciones administrativas' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
    SELECT 'gasto'::text,g.id,g.creado_en,g.creado_nombre,a.nombre,NULL::text,
           g.concepto,g.monto,NULL::numeric,g.estado,g.descripcion
    FROM public.gastos g
    LEFT JOIN public.almacenes a ON a.id=g.almacen_id
    WHERE g.estado='PENDIENTE'
      AND (public.tiene_permiso('gastos','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT 'merma'::text,m.id,m.creado_en,m.creado_nombre,a.nombre,p.nombre,
           'Merma de inventario'::text,NULL::numeric,m.cantidad,m.estado,m.motivo
    FROM public.mermas m
    JOIN public.almacenes a ON a.id=m.almacen_id
    JOIN public.productos p ON p.id=m.producto_id
    WHERE m.estado='PENDIENTE'
      AND (public.tiene_permiso('mermas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'baja_lista'::text,
      s.id,
      s.creado_en,
      s.creado_nombre,
      a.nombre,
      ('Lista de bajas · '||count(b.id)||' productos')::text,
      'Solicitud agrupada de inventario'::text,
      NULL::numeric,
      sum(b.cantidad),
      'PENDIENTE'::text,
      s.motivo_general
    FROM public.bajas_solicitudes s
    JOIN public.almacenes a ON a.id=s.almacen_id
    JOIN public.bajas b ON b.solicitud_id=s.id AND b.estado='PENDIENTE'
    WHERE s.estado='PENDIENTE'
      AND (public.tiene_permiso('bajas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))
    GROUP BY s.id,s.creado_en,s.creado_nombre,a.nombre,s.motivo_general

    UNION ALL

    SELECT 'baja'::text,b.id,b.creado_en,b.creado_nombre,a.nombre,p.nombre,
           'Baja individual'::text,NULL::numeric,b.cantidad,b.estado,b.motivo
    FROM public.bajas b
    JOIN public.almacenes a ON a.id=b.almacen_id
    JOIN public.productos p ON p.id=b.producto_id
    WHERE b.estado='PENDIENTE'
      AND b.solicitud_id IS NULL
      AND (public.tiene_permiso('bajas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'reinversion'::text,r.id,r.fecha,r.usuario_nombre,a.nombre,
      (SELECT string_agg(p.nombre, ', ' ORDER BY p.nombre)
       FROM public.reinversiones_lineas rl JOIN public.productos p ON p.id=rl.producto_id
       WHERE rl.reinversion_id=r.id),
      coalesce((
        SELECT string_agg(
          trim(trailing '.' from trim(trailing '0' from rl.cantidad_base::text))
          ||' '||p.nombre||' × '||
          trim(trailing '.' from trim(trailing '0' from rl.costo_unitario::text))||' CUP',
          ' · ' ORDER BY p.nombre,rl.id
        )
        FROM public.reinversiones_lineas rl
        JOIN public.productos p ON p.id=rl.producto_id
        WHERE rl.reinversion_id=r.id
      ),'Reinversión')::text,
      r.total,
      (SELECT sum(rl.cantidad_base) FROM public.reinversiones_lineas rl WHERE rl.reinversion_id=r.id),
      r.estado,
      coalesce(r.proveedor,'')
    FROM public.reinversiones r
    JOIN public.almacenes a ON a.id=r.almacen_id
    WHERE r.estado='PENDIENTE'
      AND r.turno_sesion_id IS NOT NULL
      AND public.tiene_permiso('reinversiones','editar_any')

    UNION ALL

    SELECT 'entrega_diaria'::text,e.id,e.creado_en,e.creado_nombre,a.nombre,
           NULL::text,('Entrega diaria de efectivo · '||e.fecha::text)::text,
           e.monto_declarado,NULL::numeric,e.estado,e.observacion
    FROM public.turno_jornada_entregas_diarias e
    JOIN public.almacenes a ON a.id=e.almacen_id
    WHERE e.estado='PENDIENTE'
      AND public.tiene_permiso('entregas_caja','editar_any')

    UNION ALL

    SELECT
      'declaracion_jornada'::text,
      d.id,
      d.declarado_at,
      COALESCE(u.nombre,'')::text,
      a.nombre,
      NULL::text,
      ('Declaración final de efectivo · Día '||COALESCE(t.dias_turno,s.numero_dia)::text)::text,
      d.monto,
      NULL::numeric,
      CASE WHEN s.estado='COMPLETADA' THEN d.estado_aprobacion ELSE 'ESPERANDO_ENTREGA' END,
      s.estado::text
    FROM public.turno_declaraciones d
    JOIN public.turno_sesiones s ON s.id=d.turno_sesion_id
    JOIN public.turnos t ON t.id=s.turno_id
    JOIN public.almacenes a ON a.id=s.almacen_id
    LEFT JOIN public.usuarios u ON u.id=d.usuario_id
    LEFT JOIN public.turno_jornada_confirmaciones c ON c.turno_sesion_id=s.id
    WHERE s.bloque='JORNADA'
      AND d.estado_aprobacion IN ('PENDIENTE','ESPERANDO_APROBACION')
      AND d.monto_contado IS NULL
      AND (public.tiene_permiso('entregas_caja','editar_any')
        OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'recepcion_inventario_jornada'::text,
      e.id,
      coalesce(r.recibido_en,e.actualizado_en,e.creado_en),
      coalesce(ud.nombre,u.nombre,'Responsable')::text,
      a.nombre,
      ('Destino '||sd.fecha::text||' · origen '||so.fecha::text||' · '||coalesce(diff.cnt,0)::text||' diferencia(s)')::text,
      ('Recepción inventario compartido · '||coalesce(lineas.total,0)::text||' productos')::text,
      NULL::numeric,
      coalesce(lineas.total,0)::numeric,
      e.estado,
      coalesce(r.observacion,'')
    FROM public.turno_jornada_inventario_entregas e
    JOIN public.almacenes a ON a.id=e.almacen_id
    JOIN public.turno_sesiones so ON so.id=e.origen_sesion_id
    LEFT JOIN public.turno_sesiones sd ON sd.id=e.destino_sesion_id
    LEFT JOIN public.turno_jornada_programacion pd ON pd.id=sd.jornada_programacion_id
    LEFT JOIN public.usuarios ud ON ud.id=pd.responsable_id
    LEFT JOIN LATERAL (
      SELECT rec.id,rec.recibido_en,rec.recibido_por,rec.observacion
      FROM public.turno_jornada_inventario_recepciones rec
      WHERE rec.entrega_id=e.id
      ORDER BY rec.intento DESC LIMIT 1
    ) r ON true
    LEFT JOIN public.usuarios u ON u.id=r.recibido_por
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS total
      FROM public.turno_jornada_inventario_entrega_lineas dl
      WHERE dl.entrega_id=e.id
    ) lineas ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt
      FROM public.turno_jornada_inventario_recepcion_lineas rl
      WHERE rl.recepcion_id=r.id AND rl.diferencia<>0
    ) diff ON true
    WHERE e.estado='PENDIENTE_REVISION'
      AND (public.bc_actor_is_admin() OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'jornada_revision'::text,
      t.id,
      coalesce(max(t.actualizado_en),max(s.updated_at),t.creado_en),
      coalesce(max(u.nombre),'Responsable')::text,
      a.nombre,
      NULL::text,
      ('Revisión integral de jornada · '||count(*) FILTER(WHERE s.estado='COMPLETADA')::text||' día(s) completado(s)')::text,
      NULL::numeric,
      NULL::numeric,
      coalesce(t.estado_maestro,t.estado),
      ('Turno pendiente de revisión del Dueño · '||coalesce(t.estado_maestro,t.estado))::text
    FROM public.turnos t
    JOIN public.almacenes a ON a.id=t.almacen_id
    JOIN public.turno_sesiones s ON s.turno_id=t.id AND s.bloque='JORNADA'
    LEFT JOIN public.turno_asignaciones ta ON ta.turno_sesion_id=s.id AND ta.retirado_at IS NULL
    LEFT JOIN public.usuarios u ON u.id=ta.usuario_id
    WHERE t.dias_turno IS NOT NULL
      AND public.bc_actor_is_admin()
      AND coalesce(t.estado_maestro,t.estado) IN ('EN_CURSO','PENDIENTE_APROBACION')
      AND NOT EXISTS(SELECT 1 FROM public.turno_revisiones tr
        WHERE tr.turno_id=t.id AND tr.estado='APROBADO')
    GROUP BY t.id,a.nombre,t.creado_en,t.estado_maestro,t.estado
    HAVING count(*) FILTER(WHERE s.estado='COMPLETADA')>0
       AND count(*) FILTER(WHERE s.estado NOT IN ('COMPLETADA','CANCELADA'))=0

    ORDER BY 3 DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_detalle_recepcion_entrega_jornada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_detalle_recepcion_entrega_jornada(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.listar_aprobaciones_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_aprobaciones_admin() TO authenticated, service_role;

COMMIT;
