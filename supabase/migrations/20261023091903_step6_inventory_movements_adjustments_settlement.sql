-- Step 6/15: reconcile inventory movements, approved adjustments, and settlement guards.
-- Additive behavioral corrections only: no historical data is rewritten or deleted.
BEGIN;

CREATE OR REPLACE FUNCTION public.reporte_movimiento_inventario(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_producto_id uuid DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL,
  p_limite integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  fecha timestamptz,
  tipo text,
  producto text,
  almacen text,
  cantidad numeric,
  direccion text,
  operacion_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.tiene_permiso('reportes','ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE='42501';
  END IF;
  IF p_desde IS NOT NULL AND p_hasta IS NOT NULL AND p_desde > p_hasta THEN
    RAISE EXCEPTION 'La fecha inicial no puede ser posterior a la fecha final.' USING ERRCODE='22007';
  END IF;
  IF p_limite IS NULL OR p_limite > 500 OR p_limite < 1 THEN p_limite:=100; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset:=0; END IF;

  RETURN QUERY
  SELECT lc.fecha_compra, 'compra'::text, p.nombre, a.nombre,
         lc.cantidad_inicial, 'entrada'::text, lc.id
  FROM public.lotes_compra lc
  JOIN public.productos p ON p.id=lc.producto_id
  JOIN public.almacenes a ON a.id=lc.almacen_id
  WHERE lc.origen='compra'
    AND (p_desde IS NULL OR (lc.fecha_compra AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (lc.fecha_compra AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR lc.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR lc.almacen_id=p_almacen_id)

  UNION ALL
  SELECT v.fecha, 'venta'::text, p.nombre, a.nombre,
         vl.cantidad, 'salida'::text, v.id
  FROM public.ventas_lineas vl
  JOIN public.ventas v ON v.id=vl.venta_id
  JOIN public.productos p ON p.id=vl.producto_id
  JOIN public.almacenes a ON a.id=v.almacen_id
  WHERE (p_desde IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR vl.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR v.almacen_id=p_almacen_id)

  UNION ALL
  SELECT t.fecha, 'transferencia_salida'::text, p.nombre, o.nombre,
         tl.cantidad, 'salida'::text, t.id
  FROM public.transferencias_lineas tl
  JOIN public.transferencias t ON t.id=tl.transferencia_id
  JOIN public.productos p ON p.id=tl.producto_id
  JOIN public.almacenes o ON o.id=t.almacen_origen_id
  WHERE (p_desde IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR tl.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR t.almacen_origen_id=p_almacen_id)

  UNION ALL
  SELECT t.fecha, 'transferencia_entrada'::text, p.nombre, d.nombre,
         tl.cantidad, 'entrada'::text, t.id
  FROM public.transferencias_lineas tl
  JOIN public.transferencias t ON t.id=tl.transferencia_id
  JOIN public.productos p ON p.id=tl.producto_id
  JOIN public.almacenes d ON d.id=t.almacen_destino_id
  WHERE (p_desde IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR tl.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR t.almacen_destino_id=p_almacen_id)

  UNION ALL
  SELECT vs.fecha, 'vale'::text, p.nombre, a.nombre,
         vs.cantidad, 'salida'::text, vs.id
  FROM public.vales_salida vs
  JOIN public.productos p ON p.id=vs.producto_id
  JOIN public.almacenes a ON a.id=vs.almacen_id
  WHERE (p_desde IS NULL OR (vs.fecha AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (vs.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR vs.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR vs.almacen_id=p_almacen_id)

  UNION ALL
  SELECT COALESCE(m.fecha_revision,m.actualizado_en,m.creado_en),
         'merma'::text, p.nombre, a.nombre, m.cantidad, 'salida'::text, m.id
  FROM public.mermas m
  JOIN public.productos p ON p.id=m.producto_id
  JOIN public.almacenes a ON a.id=m.almacen_id
  WHERE m.estado='APROBADA'
    AND (p_desde IS NULL OR (COALESCE(m.fecha_revision,m.actualizado_en,m.creado_en) AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (COALESCE(m.fecha_revision,m.actualizado_en,m.creado_en) AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR m.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR m.almacen_id=p_almacen_id)

  UNION ALL
  SELECT COALESCE(b.fecha_revision,b.actualizado_en,b.creado_en),
         'baja'::text, p.nombre, a.nombre, b.cantidad, 'salida'::text, b.id
  FROM public.bajas b
  JOIN public.productos p ON p.id=b.producto_id
  JOIN public.almacenes a ON a.id=b.almacen_id
  WHERE b.estado='APROBADA'
    AND (p_desde IS NULL OR (COALESCE(b.fecha_revision,b.actualizado_en,b.creado_en) AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (COALESCE(b.fecha_revision,b.actualizado_en,b.creado_en) AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR b.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR b.almacen_id=p_almacen_id)

  ORDER BY 1 DESC
  LIMIT p_limite OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.movimientos_producto(
  p_producto_id uuid DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL,
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_tipo text DEFAULT NULL,
  p_limite integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
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
BEGIN
  IF NOT public.tiene_permiso('reportes','ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver movimientos.' USING ERRCODE='42501';
  END IF;
  IF p_desde IS NOT NULL AND p_hasta IS NOT NULL AND p_desde > p_hasta THEN
    RAISE EXCEPTION 'La fecha inicial no puede ser posterior a la fecha final.' USING ERRCODE='22007';
  END IF;
  IF p_limite IS NULL OR p_limite > 500 OR p_limite < 1 THEN p_limite:=100; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset:=0; END IF;

  RETURN QUERY
  SELECT lc.fecha_compra, 'compra'::text, p.nombre, a.nombre,
         lc.cantidad_inicial, lc.costo_unitario, u.nombre, lc.id
  FROM public.lotes_compra lc
  JOIN public.productos p ON p.id=lc.producto_id
  JOIN public.almacenes a ON a.id=lc.almacen_id
  LEFT JOIN public.usuarios u ON u.id=lc.usuario_id
  WHERE lc.origen='compra'
    AND (p_desde IS NULL OR (lc.fecha_compra AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (lc.fecha_compra AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR lc.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR lc.almacen_id=p_almacen_id)
    AND (p_tipo IS NULL OR p_tipo='' OR p_tipo='compra')

  UNION ALL
  SELECT v.fecha, 'venta'::text, p.nombre, a.nombre,
         -vl.cantidad, vl.costo_unitario_fifo, u.nombre, v.id
  FROM public.ventas_lineas vl
  JOIN public.ventas v ON v.id=vl.venta_id
  JOIN public.productos p ON p.id=vl.producto_id
  JOIN public.almacenes a ON a.id=v.almacen_id
  LEFT JOIN public.usuarios u ON u.id=v.creado_por
  WHERE (p_desde IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR vl.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR v.almacen_id=p_almacen_id)
    AND (p_tipo IS NULL OR p_tipo='' OR p_tipo='venta')

  UNION ALL
  SELECT t.fecha, 'transferencia_salida'::text, p.nombre, o.nombre,
         -tl.cantidad, NULL::numeric, u.nombre, t.id
  FROM public.transferencias_lineas tl
  JOIN public.transferencias t ON t.id=tl.transferencia_id
  JOIN public.productos p ON p.id=tl.producto_id
  JOIN public.almacenes o ON o.id=t.almacen_origen_id
  LEFT JOIN public.usuarios u ON u.id=t.creado_por
  WHERE (p_desde IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR tl.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR t.almacen_origen_id=p_almacen_id)
    AND (p_tipo IS NULL OR p_tipo='' OR p_tipo='transferencia_salida')

  UNION ALL
  SELECT t.fecha, 'transferencia_entrada'::text, p.nombre, d.nombre,
         tl.cantidad, NULL::numeric, u.nombre, t.id
  FROM public.transferencias_lineas tl
  JOIN public.transferencias t ON t.id=tl.transferencia_id
  JOIN public.productos p ON p.id=tl.producto_id
  JOIN public.almacenes d ON d.id=t.almacen_destino_id
  LEFT JOIN public.usuarios u ON u.id=t.creado_por
  WHERE (p_desde IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR tl.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR t.almacen_destino_id=p_almacen_id)
    AND (p_tipo IS NULL OR p_tipo='' OR p_tipo='transferencia_entrada')

  UNION ALL
  SELECT vs.fecha, 'vale'::text, p.nombre, a.nombre,
         -vs.cantidad, NULL::numeric, u.nombre, vs.id
  FROM public.vales_salida vs
  JOIN public.productos p ON p.id=vs.producto_id
  JOIN public.almacenes a ON a.id=vs.almacen_id
  LEFT JOIN public.usuarios u ON u.id=vs.creado_por
  WHERE (p_desde IS NULL OR (vs.fecha AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (vs.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR vs.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR vs.almacen_id=p_almacen_id)
    AND (p_tipo IS NULL OR p_tipo='' OR p_tipo='vale')

  UNION ALL
  SELECT COALESCE(m.fecha_revision,m.actualizado_en,m.creado_en),
         'merma'::text, p.nombre, a.nombre, -m.cantidad, NULL::numeric,
         COALESCE(m.revisado_nombre,m.creado_nombre), m.id
  FROM public.mermas m
  JOIN public.productos p ON p.id=m.producto_id
  JOIN public.almacenes a ON a.id=m.almacen_id
  WHERE m.estado='APROBADA'
    AND (p_desde IS NULL OR (COALESCE(m.fecha_revision,m.actualizado_en,m.creado_en) AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (COALESCE(m.fecha_revision,m.actualizado_en,m.creado_en) AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR m.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR m.almacen_id=p_almacen_id)
    AND (p_tipo IS NULL OR p_tipo='' OR p_tipo='merma')

  UNION ALL
  SELECT COALESCE(b.fecha_revision,b.actualizado_en,b.creado_en),
         'baja'::text, p.nombre, a.nombre, -b.cantidad, NULL::numeric,
         COALESCE(b.revisado_nombre,b.creado_nombre), b.id
  FROM public.bajas b
  JOIN public.productos p ON p.id=b.producto_id
  JOIN public.almacenes a ON a.id=b.almacen_id
  WHERE b.estado='APROBADA'
    AND (p_desde IS NULL OR (COALESCE(b.fecha_revision,b.actualizado_en,b.creado_en) AT TIME ZONE 'America/Havana')::date>=p_desde)
    AND (p_hasta IS NULL OR (COALESCE(b.fecha_revision,b.actualizado_en,b.creado_en) AT TIME ZONE 'America/Havana')::date<=p_hasta)
    AND (p_producto_id IS NULL OR b.producto_id=p_producto_id)
    AND (p_almacen_id IS NULL OR b.almacen_id=p_almacen_id)
    AND (p_tipo IS NULL OR p_tipo='' OR p_tipo='baja')

  ORDER BY 1 DESC
  LIMIT p_limite OFFSET p_offset;
END;
$function$;

-- Keep the Data API RPC-only boundary explicit after replacing the functions.
REVOKE ALL ON FUNCTION public.reporte_movimiento_inventario(date,date,uuid,uuid,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reporte_movimiento_inventario(date,date,uuid,uuid,integer,integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.movimientos_producto(uuid,uuid,date,date,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movimientos_producto(uuid,uuid,date,date,text,integer,integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolver_aprobacion_operativa(
  p_tipo text,
  p_id uuid,
  p_decision text,
  p_comentario text DEFAULT NULL,
  p_cantidad_real numeric DEFAULT NULL,
  p_monto_real numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_nombre text;
  v_alm uuid;
  v_prod uuid;
  v_cant numeric;
  v_cant_real numeric;
  v_monto numeric;
  v_estado text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE='42501';
  END IF;

  -- Authorization is per operation type; permission to approve expenses must
  -- not implicitly grant authority over inventory waste or write-offs.
  IF p_tipo='gasto' THEN
    IF NOT (public.tiene_permiso('auditoria','editar_any') OR public.tiene_permiso('gastos','editar_any')) THEN
      RAISE EXCEPTION 'Sin permiso para revisar gastos.' USING ERRCODE='42501';
    END IF;
  ELSIF p_tipo='merma' THEN
    IF NOT (public.tiene_permiso('auditoria','editar_any') OR public.tiene_permiso('mermas','editar_any')) THEN
      RAISE EXCEPTION 'Sin permiso para revisar mermas.' USING ERRCODE='42501';
    END IF;
  ELSIF p_tipo='baja' THEN
    IF NOT (public.tiene_permiso('auditoria','editar_any') OR public.tiene_permiso('bajas','editar_any')) THEN
      RAISE EXCEPTION 'Sin permiso para revisar bajas.' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de aprobación desconocido.';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('APROBAR','RECHAZAR') THEN
    RAISE EXCEPTION 'Decisión inválida.';
  END IF;
  IF p_decision='RECHAZAR' AND NULLIF(btrim(p_comentario),'') IS NULL THEN
    RAISE EXCEPTION 'El rechazo requiere un motivo.';
  END IF;

  SELECT nombre INTO v_nombre FROM public.usuarios WHERE id=auth.uid();

  IF p_tipo='gasto' THEN
    SELECT estado,monto INTO v_estado,v_monto
    FROM public.gastos WHERE id=p_id FOR UPDATE;
    IF v_estado IS NULL OR v_estado<>'PENDIENTE' THEN
      RAISE EXCEPTION 'Gasto no pendiente o inexistente.';
    END IF;
    IF p_decision='APROBAR' AND p_monto_real IS NOT NULL AND p_monto_real<=0 THEN
      RAISE EXCEPTION 'Monto real inválido.';
    END IF;
    UPDATE public.gastos
    SET monto=CASE WHEN p_decision='APROBAR' AND p_monto_real IS NOT NULL THEN p_monto_real ELSE monto END,
        estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADO' ELSE 'RECHAZADO' END,
        revisado_por=auth.uid(),
        revisado_nombre=v_nombre,
        comentario_revision=NULLIF(btrim(p_comentario),'') ||
          CASE WHEN p_decision='APROBAR' AND p_monto_real IS NOT NULL AND p_monto_real<>v_monto
            THEN ' | Monto declarado: '||v_monto::text||' | Monto aprobado: '||p_monto_real::text ELSE '' END,
        fecha_revision=now(), actualizado_en=now()
    WHERE id=p_id;

  ELSIF p_tipo IN ('merma','baja') THEN
    IF p_tipo='merma' THEN
      SELECT estado,almacen_id,producto_id,cantidad
      INTO v_estado,v_alm,v_prod,v_cant
      FROM public.mermas WHERE id=p_id FOR UPDATE;
    ELSE
      SELECT estado,almacen_id,producto_id,cantidad
      INTO v_estado,v_alm,v_prod,v_cant
      FROM public.bajas WHERE id=p_id FOR UPDATE;
    END IF;

    IF v_estado IS NULL OR v_estado<>'PENDIENTE' THEN
      RAISE EXCEPTION 'La solicitud de ajuste no está pendiente o no existe.';
    END IF;

    IF p_decision='APROBAR' THEN
      v_cant_real:=COALESCE(p_cantidad_real,v_cant);
      IF v_cant_real IS NULL OR v_cant_real<=0 OR v_cant_real>v_cant THEN
        RAISE EXCEPTION 'Cantidad real inválida; debe ser mayor que cero y no superar la cantidad solicitada.';
      END IF;
      -- Stock and FIFO lot depletion run in this same transaction.
      PERFORM public._aplicar_salida_aprobada(v_alm,v_prod,v_cant_real);
    END IF;

    IF p_tipo='merma' THEN
      UPDATE public.mermas
      SET cantidad=CASE WHEN p_decision='APROBAR' THEN v_cant_real ELSE cantidad END,
          estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
          revisado_por=auth.uid(), revisado_nombre=v_nombre,
          comentario_revision=NULLIF(btrim(p_comentario),'') ||
            CASE WHEN p_decision='APROBAR' AND v_cant_real<>v_cant
              THEN ' | Cantidad declarada: '||v_cant::text||' | Cantidad aprobada: '||v_cant_real::text ELSE '' END,
          fecha_revision=now(), actualizado_en=now()
      WHERE id=p_id;
    ELSE
      UPDATE public.bajas
      SET cantidad=CASE WHEN p_decision='APROBAR' THEN v_cant_real ELSE cantidad END,
          estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
          revisado_por=auth.uid(), revisado_nombre=v_nombre,
          comentario_revision=NULLIF(btrim(p_comentario),'') ||
            CASE WHEN p_decision='APROBAR' AND v_cant_real<>v_cant
              THEN ' | Cantidad declarada: '||v_cant::text||' | Cantidad aprobada: '||v_cant_real::text ELSE '' END,
          fecha_revision=now(), actualizado_en=now()
      WHERE id=p_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok',true,'tipo',p_tipo,'id',p_id,'decision',p_decision,'revisado_por',v_nombre);
END;
$function$;

REVOKE ALL ON FUNCTION public.resolver_aprobacion_operativa(text,uuid,text,text,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_aprobacion_operativa(text,uuid,text,text,numeric,numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrar_cuadre(
  p_cuadre_id uuid,
  p_dinero_declarado numeric,
  p_idempotency_key uuid DEFAULT NULL,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid;
  c record;
  t record;
  diff numeric;
  v_estado_nuevo text;
  idem uuid;
BEGIN
  uid:=public._validar_usuario_operacion('turnos','crear');
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Se requiere idempotency_key'; END IF;
  IF p_dinero_declarado IS NULL OR p_dinero_declarado<0 THEN
    RAISE EXCEPTION 'El dinero declarado debe ser un valor igual o mayor que cero.' USING ERRCODE='22023';
  END IF;
  idem:=private.reclamar_idempotencia(
    p_idempotency_key,uid,'registrar_cuadre',
    jsonb_build_object('cuadre_id',p_cuadre_id,'dinero_declarado',p_dinero_declarado,'observacion',p_observacion)
  );
  IF idem IS NOT NULL THEN RETURN jsonb_build_object('id',idem,'idempotente',true); END IF;

  SELECT * INTO c FROM public.cuadres WHERE id=p_cuadre_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'El cuadre no existe.'; END IF;
  IF c.estado IN ('CUADRADO','APROBADO','RECHAZADO') THEN RAISE EXCEPTION 'El cuadre ya está cerrado o declarado sin devolución.'; END IF;
  IF c.dinero_esperado IS NULL THEN RAISE EXCEPTION 'El dinero esperado no está calculado.'; END IF;

  SELECT * INTO t FROM public.turnos WHERE id=c.turno_id;
  IF t.id IS NULL THEN RAISE EXCEPTION 'El turno asociado no existe.'; END IF;
  IF t.usuario_id IS DISTINCT FROM uid AND NOT public.tiene_permiso('turnos','editar_any') THEN
    RAISE EXCEPTION 'No podés declarar el cuadre de un turno ajeno.' USING ERRCODE='42501';
  END IF;

  diff:=p_dinero_declarado-c.dinero_esperado;
  v_estado_nuevo:=CASE WHEN diff=0 THEN 'CUADRADO' ELSE 'CON_DIFERENCIA' END;
  UPDATE public.cuadres
  SET dinero_declarado=p_dinero_declarado,diferencia=diff,estado=v_estado_nuevo,
      observacion=coalesce(p_observacion,observacion),actualizado_en=now()
  WHERE id=p_cuadre_id;

  IF diff<>0 THEN
    INSERT INTO public.incidencias(tipo,descripcion,usuario_id,turno_id,cuadre_id,estado)
    VALUES(CASE WHEN diff<0 THEN 'faltante' ELSE 'sobrante' END,
           'Diferencia de $'||diff||' en cuadre del turno '||c.turno_id,
           uid,c.turno_id,p_cuadre_id,'ABIERTA');
  END IF;

  UPDATE private.operaciones_idempotencia SET resultado_id=p_cuadre_id WHERE idempotency_key=p_idempotency_key;
  PERFORM public.registrar_auditoria('cuadre','Cuadre declarado','exito',p_cuadre_id::text,p_idempotency_key,NULL);
  RETURN jsonb_build_object('id',p_cuadre_id,'estado',v_estado_nuevo,'dinero_esperado',c.dinero_esperado,
                            'dinero_declarado',p_dinero_declarado,'diferencia',diff);
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_cuadre(uuid,numeric,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_cuadre(uuid,numeric,uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revisar_cuadre(
  p_cuadre_id uuid,
  p_decision text,
  p_comentario text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid;
  c record;
  t record;
  anterior text;
  nuevo text;
  idem uuid;
BEGIN
  uid:=public._validar_usuario_operacion('turnos','editar_any');
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Se requiere idempotency_key'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('aprobar','rechazar','devolver') THEN
    RAISE EXCEPTION 'Decisión inválida.';
  END IF;
  IF p_decision='rechazar' AND NULLIF(btrim(p_comentario),'') IS NULL THEN
    RAISE EXCEPTION 'El rechazo requiere un motivo.' USING ERRCODE='22023';
  END IF;

  idem:=private.reclamar_idempotencia(
    p_idempotency_key,uid,'revisar_cuadre',
    jsonb_build_object('cuadre_id',p_cuadre_id,'decision',p_decision,'comentario',p_comentario)
  );
  IF idem IS NOT NULL THEN RETURN jsonb_build_object('id',idem,'idempotente',true); END IF;

  SELECT * INTO c FROM public.cuadres WHERE id=p_cuadre_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'El cuadre no existe.'; END IF;
  IF c.estado IN ('APROBADO','RECHAZADO') THEN RAISE EXCEPTION 'El cuadre ya fue resuelto.'; END IF;
  IF c.dinero_declarado IS NULL OR c.estado NOT IN ('CUADRADO','CON_DIFERENCIA') THEN
    RAISE EXCEPTION 'El cuadre debe estar declarado o vuelto a declarar antes de revisarlo.';
  END IF;

  SELECT * INTO t FROM public.turnos WHERE id=c.turno_id;
  IF t.usuario_id=uid THEN
    RAISE EXCEPTION 'No podés aprobar/rechazar tu propio cuadre.' USING ERRCODE='42501';
  END IF;

  anterior:=c.estado;
  nuevo:=CASE p_decision WHEN 'aprobar' THEN 'APROBADO'
                         WHEN 'rechazar' THEN 'RECHAZADO'
                         WHEN 'devolver' THEN 'EN_REVISION' END;
  UPDATE public.cuadres
  SET estado=nuevo,revisado_por=uid,
      revisado_nombre=(SELECT nombre FROM public.usuarios WHERE id=uid),
      comentario_revision=p_comentario,fecha_revision=now(),actualizado_en=now()
  WHERE id=p_cuadre_id;

  UPDATE private.operaciones_idempotencia SET resultado_id=p_cuadre_id WHERE idempotency_key=p_idempotency_key;
  PERFORM public.registrar_auditoria(
    'cuadre','Cuadre '||p_decision,'exito',p_cuadre_id::text,p_idempotency_key,
    jsonb_build_object('estado_anterior',anterior,'estado_nuevo',nuevo)
  );
  RETURN jsonb_build_object('id',p_cuadre_id,'estado',nuevo,'estado_anterior',anterior);
END;
$function$;

REVOKE ALL ON FUNCTION public.revisar_cuadre(uuid,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisar_cuadre(uuid,text,text,uuid) TO authenticated, service_role;

COMMIT;
