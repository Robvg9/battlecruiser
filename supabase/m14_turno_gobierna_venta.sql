-- ============================================================
-- M14: El turno abierto del usuario gobierna el almacén de venta
-- Aplicada en producción (papxnkkjtkxsitcsvcme) el 2026-08-21
-- ============================================================

-- 1) abrir_turno: el almacén pasa a ser obligatorio y debe existir/estar activo
CREATE OR REPLACE FUNCTION public.abrir_turno(p_almacen_id uuid DEFAULT NULL::uuid, p_idempotency_key uuid DEFAULT NULL::uuid, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid; v_nombre text; existente uuid; idv uuid; idem uuid; payload jsonb; v_activo boolean;
BEGIN
  uid := public._validar_usuario_operacion('turnos','crear');
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Se requiere idempotency_key';
  END IF;

  IF p_almacen_id IS NULL THEN
    RAISE EXCEPTION 'Debe especificarse un almacén para abrir el turno.' USING ERRCODE = '23514';
  END IF;

  SELECT activo INTO v_activo FROM public.almacenes WHERE id = p_almacen_id;
  IF v_activo IS NULL THEN
    RAISE EXCEPTION 'Almacén no encontrado.' USING ERRCODE = '23503';
  END IF;
  IF NOT v_activo THEN
    RAISE EXCEPTION 'El almacén indicado está inactivo.' USING ERRCODE = '23514';
  END IF;

  payload := jsonb_build_object('almacen_id',p_almacen_id,'observacion',p_observacion);
  idem := private.reclamar_idempotencia(p_idempotency_key,uid,'abrir_turno',payload);
  IF idem IS NOT NULL THEN
    RETURN jsonb_build_object('id',idem,'estado','ABIERTO','idempotente',true);
  END IF;

  SELECT id INTO existente FROM public.turnos WHERE usuario_id=uid AND estado='ABIERTO' LIMIT 1;
  IF existente IS NOT NULL THEN
    UPDATE private.operaciones_idempotencia SET resultado_id=existente WHERE idempotency_key=p_idempotency_key;
    RETURN jsonb_build_object('id',existente,'estado','ABIERTO','nota','Ya tenés un turno abierto.');
  END IF;

  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id=uid;
  INSERT INTO public.turnos(usuario_id,usuario_nombre,almacen_id,fecha,apertura_real,estado,observacion,creado_por)
  VALUES(uid,v_nombre,p_almacen_id,current_date,now(),'ABIERTO',p_observacion,uid)
  RETURNING id INTO idv;

  UPDATE private.operaciones_idempotencia SET resultado_id=idv WHERE idempotency_key=p_idempotency_key;
  PERFORM public.registrar_auditoria('turno','Turno abierto por '||coalesce(v_nombre,uid::text),'exito',idv::text,p_idempotency_key,NULL);
  RETURN jsonb_build_object('id',idv,'estado','ABIERTO');
END;
$function$;

-- 2) Defensa en profundidad a nivel de tabla: un turno ABIERTO nunca puede tener almacen_id NULL
ALTER TABLE public.turnos
  ADD CONSTRAINT turnos_abierto_requiere_almacen
  CHECK (estado <> 'ABIERTO' OR almacen_id IS NOT NULL);

-- 3) registrar_venta: el almacén de la venta se deriva SIEMPRE del turno abierto del usuario.
--    p_almacen_id se conserva solo por compatibilidad con el frontend existente:
--    - si se envía y coincide con el almacén del turno -> se acepta (caso normal)
--    - si se envía y NO coincide -> se rechaza la operación completa
--    - si no se envía (NULL) -> se usa directamente el almacén del turno
CREATE OR REPLACE FUNCTION public.registrar_venta(p_almacen_id uuid, p_lineas jsonb, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_venta_id uuid;
  v_tipo_almacen text;
  v_linea jsonb;
  v_producto_id uuid;
  v_cantidad numeric;
  v_presentacion_id uuid;
  v_cantidad_presentacion numeric;
  v_cantidad_final numeric;
  v_precio_normal numeric;
  v_precio_mayorista numeric;
  v_precio numeric;
  v_subtotal numeric;
  v_total numeric := 0;
  v_stock_actual numeric;
  v_restante numeric;
  v_lote record;
  v_tomar numeric;
  v_idempotente uuid;
  v_costo_total_linea numeric;
  v_costo_unitario_fifo numeric;
  v_uid uuid;
  v_turno record;
  v_almacen_real uuid;
begin
  if not public.tiene_permiso('ventas','crear') then
    raise exception 'Sin permiso para registrar ventas';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La venta debe tener al menos un producto';
  end if;

  if p_idempotency_key is null then
    raise exception 'Se requiere idempotency_key';
  end if;

  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'No hay sesión activa.' using errcode = '42501';
  end if;

  v_idempotente := private.reclamar_idempotencia(p_idempotency_key, v_uid, 'registrar_venta', jsonb_build_object('almacen_id',p_almacen_id,'lineas',p_lineas));
  if v_idempotente is not null then return v_idempotente; end if;

  select * into v_turno from public.turnos where usuario_id = v_uid and estado = 'ABIERTO' limit 1;
  if v_turno.id is null then
    raise exception 'No tenés un turno abierto. No podés registrar ventas.' using errcode = '42501';
  end if;
  if v_turno.almacen_id is null then
    raise exception 'Tu turno no tiene almacén asignado. No podés registrar ventas.' using errcode = '42501';
  end if;

  v_almacen_real := v_turno.almacen_id;

  if p_almacen_id is not null and p_almacen_id <> v_almacen_real then
    raise exception 'El almacén indicado no coincide con el de tu turno abierto.' using errcode = '42501';
  end if;

  select tipo into v_tipo_almacen from public.almacenes where id = v_almacen_real;
  if v_tipo_almacen is null then raise exception 'Almacén no encontrado'; end if;

  insert into public.ventas (almacen_id, creado_por, total)
  values (v_almacen_real, v_uid, 0)
  returning id into v_venta_id;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_producto_id := (v_linea->>'producto_id')::uuid;
    v_cantidad := (v_linea->>'cantidad')::numeric;
    v_presentacion_id := nullif(v_linea->>'presentacion_id','')::uuid;
    v_cantidad_presentacion := nullif(v_linea->>'cantidad_presentacion','')::numeric;

    if v_presentacion_id is not null then
      select unidades_base into v_cantidad_final from public.obtener_conversion_presentacion(v_producto_id, v_presentacion_id, v_cantidad_presentacion);
    else
      if v_cantidad is null or v_cantidad <= 0 then raise exception 'Cantidad inválida en línea de venta'; end if;
      v_cantidad_final := v_cantidad;
    end if;
    if v_cantidad_final <= 0 then raise exception 'Cantidad inválida en línea de venta'; end if;

    select precio_normal, precio_mayorista into v_precio_normal, v_precio_mayorista from public.productos where id = v_producto_id;
    if v_precio_normal is null then raise exception 'Producto no encontrado'; end if;
    if v_tipo_almacen = 'mayorista' then
      if v_precio_mayorista is null then raise exception 'El producto no tiene precio mayorista configurado'; end if;
      v_precio := v_precio_mayorista;
    else
      v_precio := v_precio_normal;
    end if;

    select cantidad into v_stock_actual from public.stock where producto_id = v_producto_id and almacen_id = v_almacen_real for update;
    if v_stock_actual is null or v_stock_actual < v_cantidad_final then raise exception 'Stock insuficiente para el producto %', v_producto_id; end if;

    v_subtotal := v_cantidad_final * v_precio;
    v_total := v_total + v_subtotal;

    v_restante := v_cantidad_final;
    v_costo_total_linea := 0;
    for v_lote in select id, cantidad_restante, costo_unitario from public.lotes_compra where producto_id = v_producto_id and almacen_id = v_almacen_real and cantidad_restante > 0 order by fecha_compra asc for update loop
      exit when v_restante <= 0;
      v_tomar := least(v_lote.cantidad_restante, v_restante);
      update public.lotes_compra set cantidad_restante = cantidad_restante - v_tomar where id = v_lote.id;
      v_costo_total_linea := v_costo_total_linea + (v_tomar * v_lote.costo_unitario);
      v_restante := v_restante - v_tomar;
    end loop;

    if v_costo_total_linea > 0 then
      v_costo_unitario_fifo := v_costo_total_linea / v_cantidad_final;
    else
      v_costo_unitario_fifo := null;
    end if;

    insert into public.ventas_lineas (venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario_fifo) values (v_venta_id, v_producto_id, v_cantidad_final, v_precio, v_subtotal, v_costo_unitario_fifo);

    update public.stock set cantidad = cantidad - v_cantidad_final where producto_id = v_producto_id and almacen_id = v_almacen_real;
  end loop;

  update public.ventas set total = v_total where id = v_venta_id;

  if p_idempotency_key is not null then
    update private.operaciones_idempotencia set resultado_id = v_venta_id where idempotency_key = p_idempotency_key;
  end if;

  return v_venta_id;
end;
$function$;
