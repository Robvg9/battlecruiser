CREATE OR REPLACE FUNCTION public.bc_stock_operativo()
RETURNS TABLE(id uuid, producto_id uuid, almacen_id uuid, cantidad numeric, minimo numeric, producto_nombre text, almacen_nombre text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE='42501'; END IF;
  IF NOT (public.tiene_permiso('stock','ver') OR public.tiene_permiso('ventas','ver') OR public.tiene_permiso('almacenes','ver') OR public.tiene_permiso('reportes','ver') OR public.bc_actor_is_admin()) THEN
    RAISE EXCEPTION 'No tenés permiso para consultar stock.' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT s.id,s.producto_id,s.almacen_id,s.cantidad,s.minimo,p.nombre,a.nombre FROM public.stock s JOIN public.productos p ON p.id=s.producto_id JOIN public.almacenes a ON a.id=s.almacen_id WHERE a.activo IS DISTINCT FROM false ORDER BY p.nombre,a.nombre;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.bc_stock_operativo() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc_stock_operativo() TO authenticated;

CREATE OR REPLACE FUNCTION public.bc_importar_producto(
  p_nombre text,
  p_categoria_id uuid DEFAULT NULL,
  p_precio_normal numeric DEFAULT NULL,
  p_precio_mayorista numeric DEFAULT NULL,
  p_presentacion_normal text DEFAULT NULL,
  p_presentacion_mayorista text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $function$
DECLARE
  v_producto_id uuid;
  v_presentacion_normal_id uuid;
  v_presentacion_mayorista_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE='42501'; END IF;
  IF NOT public.tiene_permiso('productos','crear') THEN RAISE EXCEPTION 'Sin permiso para crear productos'; END IF;
  IF p_nombre IS NULL OR btrim(p_nombre)='' THEN RAISE EXCEPTION 'El nombre del producto es requerido'; END IF;
  IF p_precio_normal IS NOT NULL AND p_precio_normal < 0 THEN RAISE EXCEPTION 'Precio normal inválido'; END IF;
  IF p_precio_mayorista IS NOT NULL AND p_precio_mayorista < 0 THEN RAISE EXCEPTION 'Precio mayorista inválido'; END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT resultado_id INTO v_producto_id FROM private.operaciones_idempotencia WHERE idempotency_key=p_idempotency_key LIMIT 1;
    IF v_producto_id IS NOT NULL THEN RETURN v_producto_id; END IF;
    PERFORM private.reclamar_idempotencia(p_idempotency_key,auth.uid(),'bc_importar_producto',jsonb_build_object('nombre',btrim(p_nombre),'categoria_id',p_categoria_id,'precio_normal',p_precio_normal,'precio_mayorista',p_precio_mayorista,'presentacion_normal',p_presentacion_normal,'presentacion_mayorista',p_presentacion_mayorista));
  END IF;
  INSERT INTO public.productos(nombre,categoria_id,precio_normal,precio_mayorista) VALUES(btrim(p_nombre),p_categoria_id,p_precio_normal,p_precio_mayorista) RETURNING id INTO v_producto_id;
  IF NULLIF(btrim(p_presentacion_normal),'') IS NOT NULL THEN
    INSERT INTO public.presentaciones(nombre,activo) VALUES(btrim(p_presentacion_normal),true) ON CONFLICT (nombre) DO NOTHING;
    SELECT id INTO v_presentacion_normal_id FROM public.presentaciones WHERE lower(trim(nombre))=lower(trim(p_presentacion_normal)) AND activo IS DISTINCT FROM false LIMIT 1;
    IF v_presentacion_normal_id IS NOT NULL THEN
      INSERT INTO public.producto_presentaciones(producto_id,presentacion_id,factor,activo) VALUES(v_producto_id,v_presentacion_normal_id,1,true) ON CONFLICT DO NOTHING;
      UPDATE public.productos SET presentacion_id=COALESCE(presentacion_id,v_presentacion_normal_id) WHERE id=v_producto_id;
    END IF;
  END IF;
  IF NULLIF(btrim(p_presentacion_mayorista),'') IS NOT NULL THEN
    INSERT INTO public.presentaciones(nombre,activo) VALUES(btrim(p_presentacion_mayorista),true) ON CONFLICT (nombre) DO NOTHING;
    SELECT id INTO v_presentacion_mayorista_id FROM public.presentaciones WHERE lower(trim(nombre))=lower(trim(p_presentacion_mayorista)) AND activo IS DISTINCT FROM false LIMIT 1;
    IF v_presentacion_mayorista_id IS NOT NULL THEN
      INSERT INTO public.producto_presentaciones(producto_id,presentacion_id,factor,activo) VALUES(v_producto_id,v_presentacion_mayorista_id,1,true) ON CONFLICT DO NOTHING;
      UPDATE public.productos SET presentacion_id=COALESCE(presentacion_id,v_presentacion_mayorista_id) WHERE id=v_producto_id;
    END IF;
  END IF;
  IF p_idempotency_key IS NOT NULL THEN UPDATE private.operaciones_idempotencia SET resultado_id=v_producto_id WHERE idempotency_key=p_idempotency_key; END IF;
  RETURN v_producto_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.bc_importar_producto(text,uuid,numeric,numeric,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc_importar_producto(text,uuid,numeric,numeric,text,text,uuid) TO authenticated;
