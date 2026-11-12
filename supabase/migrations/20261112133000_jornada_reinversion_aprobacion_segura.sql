BEGIN;

-- A Jornada reinvestment is a request, not an immediate stock/cash mutation.
-- The owner approval RPC is the only path that applies FIFO stock and cash-ledger effects.
CREATE OR REPLACE FUNCTION public.bc7_registrar_reinversion_jornada(
  p_turno_sesion_id uuid,
  p_lineas jsonb,
  p_idempotency_key uuid,
  p_proveedor text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_t public.turno_tramos;
  v_id uuid;
  v_existing_session uuid;
  v_existing_tranche uuid;
  v_existing_warehouse uuid;
  v_existing_provider text;
  v_existing_total numeric;
  v_existing_line_count integer;
  v_existing_lines jsonb;
  v_sorted_incoming_lines jsonb;
  v_product uuid;
  v_presentation uuid;
  v_presentation_qty numeric;
  v_qty numeric;
  v_cost numeric;
  v_total numeric:=0;
  v_line jsonb;
  v_normalized_lines jsonb:='[]'::jsonb;
  v_name text;
  v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF NOT public.tiene_permiso('reinversiones','crear') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar reinversiones.' USING ERRCODE='42501';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'La reinversión requiere una clave de idempotencia.' USING ERRCODE='22023';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'La reinversión requiere una lista de productos.' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_lineas)=0 THEN
    RAISE EXCEPTION 'La reinversión requiere al menos un producto.' USING ERRCODE='22023';
  END IF;
  IF length(coalesce(p_proveedor,''))>180 THEN
    RAISE EXCEPTION 'El proveedor no puede superar 180 caracteres.' USING ERRCODE='22023';
  END IF;

  v_t:=public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN
    RAISE EXCEPTION 'La sesión no corresponde a una jornada válida.' USING ERRCODE='23503';
  END IF;

  -- Normalize/validate all lines before writing. Nothing touches stock or cash here.
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lineas) AS item(value)
  LOOP
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Cada línea de reinversión debe ser un objeto.' USING ERRCODE='22023';
    END IF;
    v_product:=nullif(v_line->>'producto_id','')::uuid;
    v_presentation:=nullif(v_line->>'presentacion_id','')::uuid;
    v_presentation_qty:=nullif(v_line->>'cantidad_presentacion','')::numeric;
    v_cost:=nullif(v_line->>'costo_total','')::numeric;

    IF v_product IS NULL OR v_cost IS NULL OR v_cost<=0 THEN
      RAISE EXCEPTION 'Producto y costo total mayor que cero son obligatorios en cada línea.' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.productos p WHERE p.id=v_product) THEN
      RAISE EXCEPTION 'Producto no encontrado: %',v_product USING ERRCODE='23503';
    END IF;
    IF v_presentation IS NOT NULL THEN
      IF v_presentation_qty IS NULL OR v_presentation_qty<=0 THEN
        RAISE EXCEPTION 'La cantidad de presentación debe ser mayor que cero.' USING ERRCODE='22023';
      END IF;
      SELECT conversion.unidades_base INTO v_qty
      FROM public.obtener_conversion_presentacion(v_product,v_presentation,v_presentation_qty) AS conversion;
    ELSE
      v_qty:=nullif(v_line->>'cantidad_base','')::numeric;
    END IF;
    IF v_qty IS NULL OR v_qty<=0 THEN
      RAISE EXCEPTION 'La cantidad base de cada producto debe ser mayor que cero.' USING ERRCODE='22023';
    END IF;

    v_normalized_lines:=v_normalized_lines||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product,
      'presentacion_id',v_presentation,
      'cantidad_presentacion',v_presentation_qty,
      'cantidad_base',v_qty,
      'costo_total',v_cost
    ));
    v_total:=v_total+v_cost;
  END LOOP;
  IF v_total<=0 THEN
    RAISE EXCEPTION 'La reinversión debe tener un total mayor que cero.' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text||':'||p_idempotency_key::text,0));
  SELECT id,turno_sesion_id,turno_tramo_id,almacen_id,proveedor,total
    INTO v_id,v_existing_session,v_existing_tranche,v_existing_warehouse,v_existing_provider,v_existing_total
  FROM public.reinversiones
  WHERE idempotency_key=p_idempotency_key AND usuario_id=v_uid
  LIMIT 1 FOR UPDATE;
  IF v_id IS NOT NULL THEN
    SELECT count(*) INTO v_existing_line_count
    FROM public.reinversiones_lineas WHERE reinversion_id=v_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'producto_id',rl.producto_id,
      'presentacion_id',rl.presentacion_id,
      'cantidad_presentacion',rl.cantidad_presentacion,
      'cantidad_base',rl.cantidad_base,
      'costo_total',rl.costo_total
    ) ORDER BY rl.producto_id,rl.presentacion_id NULLS FIRST,
      rl.cantidad_presentacion NULLS FIRST,rl.cantidad_base,rl.costo_total),'[]'::jsonb)
      INTO v_existing_lines
    FROM public.reinversiones_lineas rl WHERE rl.reinversion_id=v_id;
    SELECT coalesce(jsonb_agg(item.value ORDER BY
      item.value->>'producto_id',(item.value->>'presentacion_id') NULLS FIRST,
      (item.value->>'cantidad_presentacion')::numeric NULLS FIRST,
      (item.value->>'cantidad_base')::numeric,(item.value->>'costo_total')::numeric),'[]'::jsonb)
      INTO v_sorted_incoming_lines
    FROM jsonb_array_elements(v_normalized_lines) AS item(value);
    IF v_existing_session IS DISTINCT FROM v_s.id
       OR v_existing_tranche IS DISTINCT FROM v_t.id
       OR v_existing_warehouse IS DISTINCT FROM v_s.almacen_id
       OR v_existing_provider IS DISTINCT FROM nullif(btrim(coalesce(p_proveedor,'')),'')
       OR v_existing_total IS DISTINCT FROM v_total
       OR v_existing_line_count IS DISTINCT FROM jsonb_array_length(v_normalized_lines)
       OR v_existing_lines IS DISTINCT FROM v_sorted_incoming_lines THEN
      RAISE EXCEPTION 'La clave de idempotencia ya pertenece a otra reinversión o a un contenido distinto.' USING ERRCODE='23505';
    END IF;
    RETURN v_id;
  END IF;

  SELECT nombre INTO v_name FROM public.usuarios WHERE id=v_uid;
  INSERT INTO public.reinversiones(
    almacen_id,ciclo_id,sesion_id,turno_id,proveedor,fecha,total,
    usuario_id,usuario_nombre,idempotency_key,turno_sesion_id,turno_tramo_id,estado
  )
  VALUES(
    v_s.almacen_id,NULL,NULL,v_s.turno_id,
    nullif(btrim(coalesce(p_proveedor,'')),''),
    now(),v_total,v_uid,v_name,p_idempotency_key,v_s.id,v_t.id,'PENDIENTE'
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_normalized_lines) AS item(value)
  LOOP
    INSERT INTO public.reinversiones_lineas(
      reinversion_id,producto_id,presentacion_id,cantidad_presentacion,
      cantidad_base,costo_total,costo_unitario
    )
    VALUES(
      v_id,
      (v_line->>'producto_id')::uuid,
      nullif(v_line->>'presentacion_id','')::uuid,
      nullif(v_line->>'cantidad_presentacion','')::numeric,
      (v_line->>'cantidad_base')::numeric,
      (v_line->>'costo_total')::numeric,
      (v_line->>'costo_total')::numeric/(v_line->>'cantidad_base')::numeric
    );
  END LOOP;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(
    v_s.almacen_id,v_s.jornada_programacion_id,v_uid,'REINVERSION_REGISTRADA',
    nullif(btrim(coalesce(p_proveedor,'')),''),
    jsonb_build_object('sesion_id',v_s.id,'tramo_id',v_t.id),
    jsonb_build_object('reinversion_id',v_id,'total',v_total,'estado','PENDIENTE',
      'lineas',v_normalized_lines,'stock_y_caja_aplicados',false)
  );
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_registrar_reinversion_jornada(uuid,jsonb,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_registrar_reinversion_jornada(uuid,jsonb,uuid,text) TO authenticated;


-- Enforce the close gate on the server for retail Jornada sessions.
-- Final owner cash count may happen after handover, but operational inputs and stock must reconcile first.
CREATE OR REPLACE FUNCTION public.bc5_cerrar_jornada(
  p_turno_sesion_id uuid,
  p_motivo_excepcion text DEFAULT NULL
)
RETURNS public.turno_sesiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_sesion public.turno_sesiones;
  v_programacion public.turno_jornada_programacion;
  v_local timestamp without time zone;
  v_ahora_minuto time;
  v_fecha_fin date;
  v_result public.turno_sesiones;
  v_liquidacion jsonb;
  v_pendientes jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_sesion FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_sesion.bloque<>'JORNADA' OR v_sesion.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'No es una sesión de jornada única válida.' USING ERRCODE='23503';
  END IF;
  SELECT * INTO v_programacion FROM public.turno_jornada_programacion WHERE id=v_sesion.jornada_programacion_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programación de jornada no encontrada.' USING ERRCODE='23503';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_sesion.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado puede cerrar esta jornada.' USING ERRCODE='42501';
  END IF;
  IF v_sesion.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'La jornada no está en curso.' USING ERRCODE='23514';
  END IF;

  IF EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_sesion.almacen_id AND a.tipo='minorista') THEN
    v_liquidacion:=public.bc7_liquidacion_inventario_jornada(v_sesion.id);
    v_pendientes:=coalesce(v_liquidacion->'pendientes','{}'::jsonb);
    IF coalesce((v_liquidacion->>'faltan_cortes')::boolean,true) THEN
      RAISE EXCEPTION 'No se puede cerrar: falta confirmar el inventario inicial o final.' USING ERRCODE='23514';
    END IF;
    IF v_liquidacion->>'salario_porcentaje' IS NULL THEN
      RAISE EXCEPTION 'No se puede cerrar: el Dueño debe configurar el porcentaje salarial de esta jornada.' USING ERRCODE='23514';
    END IF;
    IF coalesce((v_liquidacion->>'familias_sin_precio')::integer,0)>0 THEN
      RAISE EXCEPTION 'No se puede cerrar: hay productos sin precio válido en la liquidación.' USING ERRCODE='23514';
    END IF;
    IF coalesce((v_liquidacion->>'familias_con_vendidas_negativas')::integer,0)>0 THEN
      RAISE EXCEPTION 'No se puede cerrar: el inventario tiene diferencias negativas que deben revisarse.' USING ERRCODE='23514';
    END IF;
    IF coalesce((v_pendientes->>'gastos')::integer,0)>0
       OR coalesce((v_pendientes->>'reinversiones')::integer,0)>0
       OR coalesce((v_pendientes->>'ajustes')::integer,0)>0
       OR coalesce((v_pendientes->>'entregas_diarias')::integer,0)>0
       OR coalesce((v_pendientes->>'entregas_diarias_faltantes')::integer,0)>0 THEN
      RAISE EXCEPTION 'No se puede cerrar: faltan importes diarios o aprobaciones de gastos, reinversiones, mermas o bajas.' USING ERRCODE='23514';
    END IF;
  END IF;

  v_fecha_fin:=coalesce(v_programacion.fecha_fin,v_programacion.fecha);
  v_local:=now() AT TIME ZONE v_programacion.zona_horaria;
  v_ahora_minuto:=date_trunc('minute',v_local)::time;
  IF (v_local::date<>v_fecha_fin OR v_ahora_minuto<>v_programacion.hora_fin_prevista)
     AND trim(coalesce(p_motivo_excepcion,''))='' THEN
    RAISE EXCEPTION 'Cierre anticipado o tardío: debe registrar un motivo antes de cerrar.' USING ERRCODE='23514';
  END IF;

  v_result:=public.bc_cerrar_turno_sesion(p_turno_sesion_id);
  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)
  VALUES(v_sesion.turno_id,v_sesion.id,auth.uid(),
    CASE WHEN v_local::date=v_fecha_fin AND v_ahora_minuto=v_programacion.hora_fin_prevista THEN 'JORNADA_CERRADA' ELSE 'JORNADA_CERRADA_CON_EXCEPCION' END,
    jsonb_build_object('fecha_fin_programada',v_fecha_fin,'hora_programada',v_programacion.hora_fin_prevista,
      'hora_real',v_ahora_minuto,'fecha_real',v_local::date,'zona_horaria',v_programacion.zona_horaria,
      'motivo',nullif(trim(p_motivo_excepcion),'')));
  INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(v_programacion.almacen_id,v_programacion.id,auth.uid(),
    CASE WHEN v_local::date=v_fecha_fin AND v_ahora_minuto=v_programacion.hora_fin_prevista THEN 'JORNADA_CERRADA' ELSE 'JORNADA_CERRADA_CON_EXCEPCION' END,
    nullif(trim(p_motivo_excepcion),''),jsonb_build_object('estado_sesion',v_sesion.estado),
    jsonb_build_object('estado_sesion',v_result.estado,'fecha_real',v_local::date,'fecha_fin_programada',v_fecha_fin,'hora_real',v_ahora_minuto));
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc5_cerrar_jornada(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc5_cerrar_jornada(uuid,text) TO authenticated;

COMMIT;