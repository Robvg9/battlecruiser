-- Step 4/15 — harmonize report-date semantics and purchase presentation costs
-- Date-only filters are interpreted in the application business timezone (America/Havana),
-- matching the dates rendered by the Reportes UI.
-- Purchase inputs with a selected presentation are costs PER PRESENTATION; lot costs must
-- be stored per base unit. This prevents multiplying the per-pack cost by the pack factor.
-- Deliberately does NOT rewrite historical lot/sale costs: those require governed reconciliation.
-- Generated from the currently installed function definitions and preserving function signatures.
BEGIN;

CREATE OR REPLACE FUNCTION public.historial_compras(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_producto_id uuid DEFAULT NULL::uuid, p_almacen_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(lote_id uuid, fecha_compra timestamp with time zone, producto text, almacen text, cantidad_inicial numeric, cantidad_restante numeric, costo_unitario numeric, costo_total numeric, estado text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.tiene_permiso('reportes','ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE='42501';
  END IF;
  IF p_limite IS NULL OR p_limite>500 OR p_limite<1 THEN p_limite:=100; END IF;
  IF p_offset IS NULL OR p_offset<0 THEN p_offset:=0; END IF;

  RETURN QUERY
  SELECT
    lc.id,
    lc.fecha_compra,
    p.nombre,
    a.nombre,
    lc.cantidad_inicial,
    lc.cantidad_restante,
    lc.costo_unitario,
    lc.cantidad_inicial * lc.costo_unitario,
    CASE
      WHEN lc.cantidad_restante > lc.cantidad_inicial THEN 'inconsistente'
      WHEN lc.cantidad_restante = 0 THEN 'agotado'
      WHEN lc.cantidad_restante = lc.cantidad_inicial THEN 'disponible'
      ELSE 'parcial'
    END
  FROM public.lotes_compra lc
  JOIN public.productos p ON p.id = lc.producto_id
  JOIN public.almacenes a ON a.id = lc.almacen_id
  WHERE lc.origen = 'compra'
    AND (p_desde IS NULL OR (lc.fecha_compra AT TIME ZONE 'America/Havana')::date >= p_desde)
    AND (p_hasta IS NULL OR (lc.fecha_compra AT TIME ZONE 'America/Havana')::date <= p_hasta)
    AND (p_producto_id IS NULL OR lc.producto_id = p_producto_id)
    AND (p_almacen_id IS NULL OR lc.almacen_id = p_almacen_id)
  ORDER BY lc.fecha_compra DESC
  LIMIT p_limite OFFSET p_offset;
END;
$function$

CREATE OR REPLACE FUNCTION public.movimientos_producto(p_producto_id uuid DEFAULT NULL::uuid, p_almacen_id uuid DEFAULT NULL::uuid, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_tipo text DEFAULT NULL::text, p_limite integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(fecha timestamp with time zone, tipo text, producto text, almacen text, cantidad numeric, costo_unitario numeric, usuario text, operacion_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver movimientos.' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite > 500 OR p_limite < 1 THEN p_limite := 100; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
    SELECT lc.fecha_compra AS fecha, 'compra'::text, p.nombre, a.nombre,
      lc.cantidad_inicial, lc.costo_unitario, u.nombre, lc.id
    FROM public.lotes_compra lc
    JOIN public.productos p ON p.id = lc.producto_id
    JOIN public.almacenes a ON a.id = lc.almacen_id
    LEFT JOIN public.usuarios u ON u.id = lc.usuario_id
    WHERE lc.origen = 'compra'
      AND (p_desde IS NULL OR (lc.fecha_compra AT TIME ZONE 'America/Havana')::date >= p_desde)
      AND (p_hasta IS NULL OR (lc.fecha_compra AT TIME ZONE 'America/Havana')::date <= p_hasta)
      AND (p_producto_id IS NULL OR lc.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR lc.almacen_id = p_almacen_id)
      AND (p_tipo IS NULL OR p_tipo = '' OR p_tipo = 'compra')

    UNION ALL
    SELECT v.fecha, 'venta'::text, p.nombre, a.nombre,
      -vl.cantidad, vl.costo_unitario_fifo, u.nombre, v.id
    FROM public.ventas_lineas vl
    JOIN public.ventas v ON v.id = vl.venta_id
    JOIN public.productos p ON p.id = vl.producto_id
    JOIN public.almacenes a ON a.id = v.almacen_id
    LEFT JOIN public.usuarios u ON u.id = v.creado_por
    WHERE (p_desde IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date >= p_desde)
      AND (p_hasta IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date <= p_hasta)
      AND (p_producto_id IS NULL OR vl.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR v.almacen_id = p_almacen_id)
      AND (p_tipo IS NULL OR p_tipo = '' OR p_tipo = 'venta')

    UNION ALL
    SELECT t.fecha, 'transferencia_salida'::text, p.nombre, o.nombre,
      -tl.cantidad, NULL::numeric, u.nombre, t.id
    FROM public.transferencias_lineas tl
    JOIN public.transferencias t ON t.id = tl.transferencia_id
    JOIN public.productos p ON p.id = tl.producto_id
    JOIN public.almacenes o ON o.id = t.almacen_origen_id
    LEFT JOIN public.usuarios u ON u.id = t.creado_por
    WHERE (p_desde IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date >= p_desde)
      AND (p_hasta IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date <= p_hasta)
      AND (p_producto_id IS NULL OR tl.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR t.almacen_origen_id = p_almacen_id)
      AND (p_tipo IS NULL OR p_tipo = '' OR p_tipo = 'transferencia_salida')

    UNION ALL
    SELECT t.fecha, 'transferencia_entrada'::text, p.nombre, d.nombre,
      tl.cantidad, NULL::numeric, u.nombre, t.id
    FROM public.transferencias_lineas tl
    JOIN public.transferencias t ON t.id = tl.transferencia_id
    JOIN public.productos p ON p.id = tl.producto_id
    JOIN public.almacenes d ON d.id = t.almacen_destino_id
    LEFT JOIN public.usuarios u ON u.id = t.creado_por
    WHERE (p_desde IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date >= p_desde)
      AND (p_hasta IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date <= p_hasta)
      AND (p_producto_id IS NULL OR tl.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR t.almacen_destino_id = p_almacen_id)
      AND (p_tipo IS NULL OR p_tipo = '' OR p_tipo = 'transferencia_entrada')

    UNION ALL
    SELECT vs.fecha, 'vale'::text, p.nombre, a.nombre,
      -vs.cantidad, NULL::numeric, u.nombre, vs.id
    FROM public.vales_salida vs
    JOIN public.productos p ON p.id = vs.producto_id
    JOIN public.almacenes a ON a.id = vs.almacen_id
    LEFT JOIN public.usuarios u ON u.id = vs.creado_por
    WHERE (p_desde IS NULL OR (vs.fecha AT TIME ZONE 'America/Havana')::date >= p_desde)
      AND (p_hasta IS NULL OR (vs.fecha AT TIME ZONE 'America/Havana')::date <= p_hasta)
      AND (p_producto_id IS NULL OR vs.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR vs.almacen_id = p_almacen_id)
      AND (p_tipo IS NULL OR p_tipo = '' OR p_tipo = 'vale')

    ORDER BY fecha DESC
    LIMIT p_limite OFFSET p_offset;
END;
$function$

CREATE OR REPLACE FUNCTION public.registrar_compra(p_producto_id uuid, p_almacen_id uuid, p_cantidad numeric, p_costo_unitario numeric, p_presentacion_id uuid DEFAULT NULL::uuid, p_cantidad_presentacion numeric DEFAULT NULL::numeric, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_lote_id uuid; v_cantidad_final numeric; v_costo_unitario_base numeric; v_idempotente uuid; begin if auth.uid() is null then raise exception 'No hay sesión activa' using errcode='42501'; end if; if not public.tiene_permiso('productos','crear') then raise exception 'Sin permiso para registrar compras'; end if; if not public.bc_actor_is_admin() and not exists(select 1 from public.turno_tramos tr join public.turno_sesiones s on s.id=tr.turno_sesion_id where tr.usuario_id=auth.uid() and tr.estado='ACTIVO' and s.almacen_id=p_almacen_id and s.estado in ('EN_CURSO','ACTIVA','ACTIVO')) then raise exception 'La compra debe ser recibida por la persona que tiene una sesión activa en el punto de venta'; end if; if p_idempotency_key is null then raise exception 'Se requiere idempotency_key'; end if; v_idempotente:=private.reclamar_idempotencia(p_idempotency_key,auth.uid(),'registrar_compra',jsonb_build_object('producto_id',p_producto_id,'almacen_id',p_almacen_id,'cantidad',p_cantidad,'costo_unitario',p_costo_unitario,'presentacion_id',p_presentacion_id,'cantidad_presentacion',p_cantidad_presentacion)); if v_idempotente is not null then return v_idempotente; end if; if p_presentacion_id is not null then
  if p_cantidad_presentacion is null or p_cantidad_presentacion <= 0 then raise exception 'Cantidad de presentación inválida'; end if;
  select unidades_base into v_cantidad_final from public.obtener_conversion_presentacion(p_producto_id,p_presentacion_id,p_cantidad_presentacion);
else
  if p_cantidad is null then raise exception 'La cantidad es requerida'; end if;
  v_cantidad_final:=p_cantidad;
end if;
if v_cantidad_final is null or v_cantidad_final<=0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
if p_costo_unitario is null or p_costo_unitario<0 then raise exception 'Costo inválido'; end if;
if p_presentacion_id is not null then
  v_costo_unitario_base := p_costo_unitario / (v_cantidad_final / p_cantidad_presentacion);
else
  v_costo_unitario_base := p_costo_unitario;
end if; if not exists(select 1 from public.almacenes where id=p_almacen_id) then raise exception 'Almacén no encontrado'; end if; if not exists(select 1 from public.productos where id=p_producto_id) then raise exception 'Producto no encontrado'; end if; insert into public.lotes_compra(producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario,usuario_id) values(p_producto_id,p_almacen_id,v_cantidad_final,v_cantidad_final,v_costo_unitario_base,auth.uid()) returning id into v_lote_id; insert into public.stock(producto_id,almacen_id,cantidad,minimo) values(p_producto_id,p_almacen_id,v_cantidad_final,0) on conflict(producto_id,almacen_id) do update set cantidad=public.stock.cantidad+excluded.cantidad,updated_at=now(); update private.operaciones_idempotencia set resultado_id=v_lote_id where idempotency_key=p_idempotency_key; return v_lote_id; end; $function$

CREATE OR REPLACE FUNCTION public.registrar_compra_multiple(p_almacen_id uuid, p_proveedor text DEFAULT NULL::text, p_fecha timestamp with time zone DEFAULT now(), p_lineas jsonb DEFAULT '[]'::jsonb, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_uid uuid:=auth.uid(); v_compra_id uuid; v_linea jsonb; v_producto_id uuid; v_cantidad numeric; v_costo numeric; v_costo_unitario_base numeric; v_presentacion_id uuid; v_cantidad_presentacion numeric; v_cantidad_final numeric; v_cantidad_documento numeric; v_total numeric:=0; v_usuario_nombre text; v_idempotente uuid; begin if v_uid is null then raise exception 'No hay sesión activa.' using errcode='42501'; end if; if not public.tiene_permiso('productos','crear') then raise exception 'Sin permiso para registrar compras' using errcode='42501'; end if; if not public.bc_actor_is_admin() and not exists(select 1 from public.turno_tramos tr join public.turno_sesiones s on s.id=tr.turno_sesion_id join public.turnos t on t.id=s.turno_id where tr.usuario_id=v_uid and tr.estado='ACTIVO' and s.almacen_id=p_almacen_id and s.estado in ('EN_CURSO','ACTIVA','ACTIVO')) then raise exception 'La compra debe ser recibida por la persona que tiene una sesión activa en el punto de venta'; end if; if p_idempotency_key is null then raise exception 'Se requiere idempotency_key'; end if; if p_lineas is null or jsonb_array_length(p_lineas)=0 then raise exception 'La compra debe tener al menos un producto'; end if; if not exists(select 1 from public.almacenes where id=p_almacen_id) then raise exception 'Almacén no encontrado'; end if; v_idempotente:=private.reclamar_idempotencia(p_idempotency_key,v_uid,'registrar_compra_multiple',jsonb_build_object('almacen_id',p_almacen_id,'proveedor',p_proveedor,'fecha',p_fecha,'lineas',p_lineas)); if v_idempotente is not null then return v_idempotente; end if; select nombre into v_usuario_nombre from public.usuarios where id=v_uid; insert into public.compras(almacen_id,proveedor,fecha,usuario_id,usuario_nombre,total,idempotency_key) values(p_almacen_id,nullif(trim(p_proveedor),''),coalesce(p_fecha,now()),v_uid,v_usuario_nombre,0,p_idempotency_key) returning id into v_compra_id; for v_linea in select * from jsonb_array_elements(p_lineas) loop v_producto_id:=nullif(v_linea->>'producto_id','')::uuid; v_cantidad:=nullif(v_linea->>'cantidad','')::numeric; v_costo:=nullif(v_linea->>'costo_unitario','')::numeric; v_presentacion_id:=nullif(v_linea->>'presentacion_id','')::uuid; v_cantidad_presentacion:=nullif(v_linea->>'cantidad_presentacion','')::numeric; if v_producto_id is null then raise exception 'Producto requerido en cada línea'; end if; if not exists(select 1 from public.productos where id=v_producto_id) then raise exception 'Producto no encontrado: %',v_producto_id; end if; if v_costo is null or v_costo<0 then raise exception 'Costo inválido en línea de compra'; end if; if v_presentacion_id is not null then
  if v_cantidad_presentacion is null or v_cantidad_presentacion <= 0 then raise exception 'Cantidad de presentación inválida en línea de compra'; end if;
  select unidades_base into v_cantidad_final from public.obtener_conversion_presentacion(v_producto_id,v_presentacion_id,v_cantidad_presentacion);
  v_cantidad_documento:=v_cantidad_presentacion;
else
  v_cantidad_final:=v_cantidad;
  v_cantidad_documento:=v_cantidad;
end if;
if v_cantidad_final is null or v_cantidad_final<=0 then raise exception 'Cantidad inválida en línea de compra'; end if;
if v_presentacion_id is not null then
  v_costo_unitario_base := v_costo / (v_cantidad_final / v_cantidad_presentacion);
else
  v_costo_unitario_base := v_costo;
end if; insert into public.lotes_compra(producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario,fecha_compra,origen,usuario_id,compra_id) values(v_producto_id,p_almacen_id,v_cantidad_final,v_cantidad_final,v_costo_unitario_base,coalesce(p_fecha,now()),'compra',v_uid,v_compra_id); insert into public.stock(producto_id,almacen_id,cantidad,minimo) values(v_producto_id,p_almacen_id,v_cantidad_final,0) on conflict(producto_id,almacen_id) do update set cantidad=public.stock.cantidad+excluded.cantidad,updated_at=now(); v_total:=v_total+(v_cantidad_documento*v_costo); end loop; update public.compras set total=v_total where id=v_compra_id; update private.operaciones_idempotencia set resultado_id=v_compra_id where idempotency_key=p_idempotency_key; return v_compra_id; end; $function$

CREATE OR REPLACE FUNCTION public.rentabilidad_ventas(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_producto_id uuid DEFAULT NULL::uuid, p_almacen_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(fecha timestamp with time zone, venta_id uuid, producto text, almacen text, cantidad numeric, precio_unitario numeric, ingreso numeric, costo_unitario_fifo numeric, costo_total numeric, margen numeric, margen_porcentaje numeric, costo_disponible boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.tiene_permiso('reportes','ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE='42501';
  END IF;
  IF p_limite IS NULL OR p_limite>500 OR p_limite<1 THEN p_limite:=100; END IF;
  IF p_offset IS NULL OR p_offset<0 THEN p_offset:=0; END IF;

  RETURN QUERY
  SELECT
    v.fecha,
    v.id,
    p.nombre,
    a.nombre,
    vl.cantidad,
    vl.precio_unitario,
    vl.cantidad * vl.precio_unitario AS ingreso,
    vl.costo_unitario_fifo,
    CASE WHEN vl.costo_unitario_fifo IS NULL THEN NULL
         ELSE vl.cantidad * vl.costo_unitario_fifo END AS costo_total,
    CASE WHEN vl.costo_unitario_fifo IS NULL THEN NULL
         ELSE (vl.cantidad * vl.precio_unitario) - (vl.cantidad * vl.costo_unitario_fifo) END AS margen,
    CASE WHEN vl.costo_unitario_fifo IS NULL THEN NULL
         WHEN (vl.cantidad * vl.precio_unitario) = 0 THEN NULL
         ELSE ((vl.cantidad * vl.precio_unitario) - (vl.cantidad * vl.costo_unitario_fifo))
              / (vl.cantidad * vl.precio_unitario) * 100 END AS margen_porcentaje,
    (vl.costo_unitario_fifo IS NOT NULL) AS costo_disponible
  FROM public.ventas_lineas vl
  JOIN public.ventas v ON v.id = vl.venta_id
  JOIN public.productos p ON p.id = vl.producto_id
  LEFT JOIN public.almacenes a ON a.id = v.almacen_id
  WHERE (p_desde IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date >= p_desde)
    AND (p_hasta IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date <= p_hasta)
    AND (p_producto_id IS NULL OR vl.producto_id = p_producto_id)
    AND (p_almacen_id IS NULL OR v.almacen_id = p_almacen_id)
  ORDER BY v.fecha DESC
  LIMIT p_limite OFFSET p_offset;
END;
$function$

CREATE OR REPLACE FUNCTION public.reporte_movimiento_inventario(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_producto_id uuid DEFAULT NULL::uuid, p_almacen_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(fecha timestamp with time zone, tipo text, producto text, almacen text, cantidad numeric, direccion text, operacion_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN IF NOT public.tiene_permiso('reportes','ver') THEN RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE='42501'; END IF; IF p_limite IS NULL OR p_limite>500 OR p_limite<1 THEN p_limite:=100; END IF; IF p_offset IS NULL OR p_offset<0 THEN p_offset:=0; END IF; RETURN QUERY
SELECT v.fecha,'venta'::text,p.nombre,a.nombre,vl.cantidad,'salida'::text,v.id FROM ventas_lineas vl JOIN ventas v ON v.id=vl.venta_id JOIN productos p ON p.id=vl.producto_id JOIN almacenes a ON a.id=v.almacen_id WHERE (p_desde IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date>=p_desde) AND (p_hasta IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta) AND (p_producto_id IS NULL OR vl.producto_id=p_producto_id) AND (p_almacen_id IS NULL OR v.almacen_id=p_almacen_id)
UNION ALL SELECT t.fecha,'transferencia_salida'::text,p.nombre,o.nombre,tl.cantidad,'salida'::text,t.id FROM transferencias_lineas tl JOIN transferencias t ON t.id=tl.transferencia_id JOIN productos p ON p.id=tl.producto_id JOIN almacenes o ON o.id=t.almacen_origen_id WHERE (p_desde IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date>=p_desde) AND (p_hasta IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta) AND (p_producto_id IS NULL OR tl.producto_id=p_producto_id) AND (p_almacen_id IS NULL OR t.almacen_origen_id=p_almacen_id)
UNION ALL SELECT t.fecha,'transferencia_entrada'::text,p.nombre,d.nombre,tl.cantidad,'entrada'::text,t.id FROM transferencias_lineas tl JOIN transferencias t ON t.id=tl.transferencia_id JOIN productos p ON p.id=tl.producto_id JOIN almacenes d ON d.id=t.almacen_destino_id WHERE (p_desde IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date>=p_desde) AND (p_hasta IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta) AND (p_producto_id IS NULL OR tl.producto_id=p_producto_id) AND (p_almacen_id IS NULL OR t.almacen_destino_id=p_almacen_id)
UNION ALL SELECT vs.fecha,'vale'::text,p.nombre,a.nombre,vs.cantidad,'salida'::text,vs.id FROM vales_salida vs JOIN productos p ON p.id=vs.producto_id JOIN almacenes a ON a.id=vs.almacen_id WHERE (p_desde IS NULL OR (vs.fecha AT TIME ZONE 'America/Havana')::date>=p_desde) AND (p_hasta IS NULL OR (vs.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta) AND (p_producto_id IS NULL OR vs.producto_id=p_producto_id) AND (p_almacen_id IS NULL OR vs.almacen_id=p_almacen_id)
ORDER BY fecha DESC LIMIT p_limite OFFSET p_offset; END; $function$

CREATE OR REPLACE FUNCTION public.reporte_resumen_ejecutivo(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_almacen_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ventas int; v_ingresos numeric; v_unidades_vendidas numeric;
  v_transferencias int; v_unidades_transferidas numeric;
  v_vales int; v_unidades_vales numeric;
  v_productos int; v_unidades_stock numeric; v_stock_bajo int; v_stock_agotado int;
  v_lotes int; v_unidades_compradas numeric; v_valor_compras numeric;
  v_lineas_totales int; v_lineas_con_costo int; v_lineas_sin_costo int;
  v_ingreso_con_costo numeric; v_costo_conocido numeric; v_margen_conocido numeric; v_margen_pct numeric;
  v_compras jsonb; v_margen jsonb;
BEGIN
  IF NOT public.tiene_permiso('reportes','ver') THEN RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE='42501'; END IF;

  SELECT count(*),coalesce(sum(v.total),0) INTO v_ventas,v_ingresos FROM ventas v WHERE (p_desde IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date>=p_desde) AND (p_hasta IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta) AND (p_almacen_id IS NULL OR v.almacen_id=p_almacen_id);
  SELECT coalesce(sum(vl.cantidad),0) INTO v_unidades_vendidas FROM ventas_lineas vl JOIN ventas v ON v.id=vl.venta_id WHERE (p_desde IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date>=p_desde) AND (p_hasta IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta) AND (p_almacen_id IS NULL OR v.almacen_id=p_almacen_id);
  SELECT count(*),coalesce(sum((SELECT sum(tl.cantidad) FROM transferencias_lineas tl WHERE tl.transferencia_id=t.id)),0) INTO v_transferencias,v_unidades_transferidas FROM transferencias t WHERE (p_desde IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date>=p_desde) AND (p_hasta IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta) AND (p_almacen_id IS NULL OR t.almacen_origen_id=p_almacen_id OR t.almacen_destino_id=p_almacen_id);
  SELECT count(*),coalesce(sum(vs.cantidad),0) INTO v_vales,v_unidades_vales FROM vales_salida vs WHERE (p_desde IS NULL OR (vs.fecha AT TIME ZONE 'America/Havana')::date>=p_desde) AND (p_hasta IS NULL OR (vs.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta) AND (p_almacen_id IS NULL OR vs.almacen_id=p_almacen_id);
  SELECT count(*),coalesce(sum(s.cantidad),0) INTO v_productos,v_unidades_stock FROM stock s WHERE p_almacen_id IS NULL OR s.almacen_id=p_almacen_id;
  SELECT count(*) INTO v_stock_bajo FROM stock s WHERE s.minimo IS NOT NULL AND s.cantidad<=s.minimo AND s.cantidad>0 AND (p_almacen_id IS NULL OR s.almacen_id=p_almacen_id);
  SELECT count(*) INTO v_stock_agotado FROM stock s WHERE s.cantidad<=0 AND (p_almacen_id IS NULL OR s.almacen_id=p_almacen_id);

  -- Compras: fuente real = lotes_compra (no existe tabla compras/compras_lineas)
  SELECT count(*), coalesce(sum(lc.cantidad_inicial),0), coalesce(sum(lc.cantidad_inicial*lc.costo_unitario),0)
  INTO v_lotes, v_unidades_compradas, v_valor_compras
  FROM lotes_compra lc
  WHERE (p_desde IS NULL OR (lc.fecha_compra AT TIME ZONE 'America/Havana')::date>=p_desde) AND (p_hasta IS NULL OR (lc.fecha_compra AT TIME ZONE 'America/Havana')::date<=p_hasta) AND (p_almacen_id IS NULL OR lc.almacen_id=p_almacen_id);

  v_compras := jsonb_build_object('disponible', true, 'lotes', v_lotes, 'unidades_compradas', v_unidades_compradas, 'valor_compras', v_valor_compras);

  -- Margen: solo sobre líneas de venta con costo_unitario_fifo histórico real disponible en el período; nunca se asume costo 0
  SELECT
    count(*),
    count(*) FILTER (WHERE vl.costo_unitario_fifo IS NOT NULL),
    count(*) FILTER (WHERE vl.costo_unitario_fifo IS NULL),
    coalesce(sum(vl.cantidad*vl.precio_unitario) FILTER (WHERE vl.costo_unitario_fifo IS NOT NULL), 0),
    coalesce(sum(vl.cantidad*vl.costo_unitario_fifo) FILTER (WHERE vl.costo_unitario_fifo IS NOT NULL), 0)
  INTO v_lineas_totales, v_lineas_con_costo, v_lineas_sin_costo, v_ingreso_con_costo, v_costo_conocido
  FROM ventas_lineas vl JOIN ventas v ON v.id=vl.venta_id
  WHERE (p_desde IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date>=p_desde) AND (p_hasta IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta) AND (p_almacen_id IS NULL OR v.almacen_id=p_almacen_id);

  IF coalesce(v_lineas_con_costo,0) = 0 THEN
    v_margen := jsonb_build_object('disponible', false, 'nota', 'No hay líneas de venta con costo FIFO histórico disponible en este período.');
  ELSE
    v_margen_conocido := v_ingreso_con_costo - v_costo_conocido;
    v_margen_pct := CASE WHEN v_ingreso_con_costo > 0 THEN v_margen_conocido / v_ingreso_con_costo * 100 ELSE NULL END;
    v_margen := jsonb_build_object(
      'disponible', true,
      'lineas_totales', v_lineas_totales,
      'lineas_con_costo', v_lineas_con_costo,
      'lineas_sin_costo', v_lineas_sin_costo,
      'ingreso_con_costo_conocido', v_ingreso_con_costo,
      'costo_conocido', v_costo_conocido,
      'margen_conocido', v_margen_conocido,
      'margen_pct_conocido', v_margen_pct,
      'nota', CASE WHEN v_lineas_sin_costo > 0
                THEN 'Calculado solo sobre líneas con costo FIFO histórico; ' || v_lineas_sin_costo || ' línea(s) sin costo histórico quedaron excluidas (no se asumió costo 0).'
                ELSE 'Calculado sobre todas las líneas del período; todas tienen costo FIFO histórico disponible.' END
    );
  END IF;

  RETURN jsonb_build_object(
    'ventas', jsonb_build_object('cantidad',v_ventas,'ingresos',v_ingresos,'unidades',v_unidades_vendidas,'ticket_promedio',CASE WHEN v_ventas>0 THEN v_ingresos/v_ventas ELSE 0 END),
    'transferencias', jsonb_build_object('cantidad',v_transferencias,'unidades',v_unidades_transferidas),
    'vales', jsonb_build_object('cantidad',v_vales,'unidades',v_unidades_vales),
    'inventario', jsonb_build_object('productos',v_productos,'unidades',v_unidades_stock,'stock_bajo',v_stock_bajo,'stock_agotado',v_stock_agotado),
    'compras', v_compras,
    'margen', v_margen
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.reporte_transferencias(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_origen_id uuid DEFAULT NULL::uuid, p_destino_id uuid DEFAULT NULL::uuid, p_estado text DEFAULT NULL::text, p_limite integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, fecha timestamp with time zone, origen text, destino text, estado text, unidades numeric, lineas jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN IF NOT public.tiene_permiso('reportes','ver') THEN RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE='42501'; END IF; IF p_limite IS NULL OR p_limite>200 OR p_limite<1 THEN p_limite:=50; END IF; IF p_offset IS NULL OR p_offset<0 THEN p_offset:=0; END IF; RETURN QUERY SELECT t.id,t.fecha,o.nombre,d.nombre,t.estado,coalesce((SELECT sum(tl.cantidad) FROM transferencias_lineas tl WHERE tl.transferencia_id=t.id),0),coalesce((SELECT jsonb_agg(jsonb_build_object('producto_id',tl.producto_id,'producto',p.nombre,'cantidad',tl.cantidad)) FROM transferencias_lineas tl JOIN productos p ON p.id=tl.producto_id WHERE tl.transferencia_id=t.id),'[]'::jsonb) FROM transferencias t LEFT JOIN almacenes o ON o.id=t.almacen_origen_id LEFT JOIN almacenes d ON d.id=t.almacen_destino_id WHERE (p_desde IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date>=p_desde) AND (p_hasta IS NULL OR (t.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta) AND (p_origen_id IS NULL OR t.almacen_origen_id=p_origen_id) AND (p_destino_id IS NULL OR t.almacen_destino_id=p_destino_id) AND (p_estado IS NULL OR p_estado='' OR t.estado=p_estado) ORDER BY t.fecha DESC LIMIT p_limite OFFSET p_offset; END; $function$

CREATE OR REPLACE FUNCTION public.reporte_vales(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_almacen_id uuid DEFAULT NULL::uuid, p_tipo text DEFAULT NULL::text, p_limite integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, fecha timestamp with time zone, producto text, almacen text, tipo text, cantidad numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN IF NOT public.tiene_permiso('reportes','ver') THEN RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE='42501'; END IF; IF p_limite IS NULL OR p_limite>200 OR p_limite<1 THEN p_limite:=50; END IF; IF p_offset IS NULL OR p_offset<0 THEN p_offset:=0; END IF; RETURN QUERY SELECT vs.id,vs.fecha,p.nombre,a.nombre,vs.tipo,vs.cantidad FROM vales_salida vs LEFT JOIN productos p ON p.id=vs.producto_id LEFT JOIN almacenes a ON a.id=vs.almacen_id WHERE (p_desde IS NULL OR (vs.fecha AT TIME ZONE 'America/Havana')::date>=p_desde) AND (p_hasta IS NULL OR (vs.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta) AND (p_almacen_id IS NULL OR vs.almacen_id=p_almacen_id) AND (p_tipo IS NULL OR p_tipo='' OR vs.tipo=p_tipo) ORDER BY vs.fecha DESC LIMIT p_limite OFFSET p_offset; END; $function$

CREATE OR REPLACE FUNCTION public.reporte_ventas(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_almacen_id uuid DEFAULT NULL::uuid, p_producto_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, fecha timestamp with time zone, almacen_id uuid, almacen text, total numeric, lineas jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN IF NOT public.tiene_permiso('reportes','ver') THEN RAISE EXCEPTION 'No tenés permiso para ver reportes.' USING ERRCODE='42501'; END IF; IF p_limite IS NULL OR p_limite>200 OR p_limite<1 THEN p_limite:=50; END IF; IF p_offset IS NULL OR p_offset<0 THEN p_offset:=0; END IF;
RETURN QUERY SELECT v.id,v.fecha,v.almacen_id,a.nombre,v.total,coalesce((SELECT jsonb_agg(jsonb_build_object('producto_id',vl.producto_id,'producto',p.nombre,'cantidad',vl.cantidad,'precio_unitario',vl.precio_unitario,'subtotal',vl.cantidad*vl.precio_unitario)) FROM ventas_lineas vl JOIN productos p ON p.id=vl.producto_id WHERE vl.venta_id=v.id AND (p_producto_id IS NULL OR vl.producto_id=p_producto_id)),'[]'::jsonb) FROM ventas v LEFT JOIN almacenes a ON a.id=v.almacen_id WHERE (p_desde IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date>=p_desde) AND (p_hasta IS NULL OR (v.fecha AT TIME ZONE 'America/Havana')::date<=p_hasta) AND (p_almacen_id IS NULL OR v.almacen_id=p_almacen_id) ORDER BY v.fecha DESC LIMIT p_limite OFFSET p_offset; END; $function$

COMMIT;
