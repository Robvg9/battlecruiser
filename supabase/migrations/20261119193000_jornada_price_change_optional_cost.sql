-- Optional cost correction alongside Jornada sale-price changes.
-- Both values activate only after the assigned worker confirms the physical count.
BEGIN;

ALTER TABLE public.turno_jornada_cambios_precio
  ADD COLUMN IF NOT EXISTS costo_anterior numeric(14,4),
  ADD COLUMN IF NOT EXISTS costo_nuevo numeric(14,4);

DO $constraints$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='public.turno_jornada_cambios_precio'::regclass
      AND contype='c'
      AND pg_get_constraintdef(oid) ILIKE '%precio_nuevo <> precio_anterior%'
  LOOP
    EXECUTE format('ALTER TABLE public.turno_jornada_cambios_precio DROP CONSTRAINT %I',c.conname);
  END LOOP;
END;
$constraints$;

ALTER TABLE public.turno_jornada_cambios_precio
  ADD CONSTRAINT turno_jornada_cambios_precio_values_differ
  CHECK (precio_nuevo <> precio_anterior OR costo_nuevo IS DISTINCT FROM costo_anterior),
  ADD CONSTRAINT turno_jornada_cambios_precio_cost_nonnegative
  CHECK ((costo_anterior IS NULL OR costo_anterior >= 0) AND (costo_nuevo IS NULL OR costo_nuevo >= 0));

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
      'responsable_id',jp.responsable_id,
      'productos',coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'producto_id',p.producto_id,
          'nombre',p.nombre,
          'unidad',pr.unidad,
          'precio_actual',coalesce(pr.precio_normal,0),
          'costo_actual',pr.costo_unitario_referencia,
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

CREATE OR REPLACE FUNCTION public.bc7_solicitar_cambios_precio_jornada(
  p_turno_sesion_id uuid,
  p_cambios jsonb,
  p_comentario text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_program public.turno_jornada_programacion;
  v_item jsonb;
  v_product_id uuid;
  v_new_price numeric;
  v_old_price numeric;
  v_new_cost numeric;
  v_old_cost numeric;
  v_count integer:=0;
  v_before jsonb:='[]'::jsonb;
  v_after jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede solicitar un cambio de precio.' USING ERRCODE='42501';
  END IF;
  IF p_cambios IS NULL OR jsonb_typeof(p_cambios)<>'array'
     OR jsonb_array_length(p_cambios)=0 OR jsonb_array_length(p_cambios)>100 THEN
    RAISE EXCEPTION 'Selecciona entre 1 y 100 productos.' USING ERRCODE='22023';
  END IF;
  IF length(btrim(coalesce(p_comentario,'')))<5 OR length(p_comentario)>500 THEN
    RAISE EXCEPTION 'Explica el motivo del cambio (5–500 caracteres).' USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_cambios) x(value)
    WHERE jsonb_typeof(x.value)<>'object'
      OR coalesce(x.value->>'producto_id','') !~* '^[0-9a-f-]{36}$'
      OR coalesce(x.value->>'precio_nuevo','') !~ '^([0-9]+([.][0-9]{1,4})?|[.][0-9]{1,4})$'
      OR (x.value->>'precio_nuevo')::numeric<0
      OR (
        nullif(x.value->>'costo_nuevo','') IS NOT NULL
        AND (
          nullif(x.value->>'costo_nuevo','') !~ '^([0-9]+([.][0-9]{1,4})?|[.][0-9]{1,4})$'
          OR CASE
            WHEN nullif(x.value->>'costo_nuevo','') ~ '^([0-9]+([.][0-9]{1,4})?|[.][0-9]{1,4})$'
            THEN nullif(x.value->>'costo_nuevo','')::numeric < 0
            ELSE false
          END
        )
      )
  ) THEN
    RAISE EXCEPTION 'El precio nuevo y el costo opcional deben ser números válidos y no negativos.' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_cambios))
     <> (SELECT count(DISTINCT (x.value->>'producto_id')::uuid) FROM jsonb_array_elements(p_cambios) x(value)) THEN
    RAISE EXCEPTION 'No repitas productos en el mismo cambio.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;

  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'EN_CURSO'
     OR NOT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista')
     OR NOT EXISTS(SELECT 1 FROM public.turno_tramos tr WHERE tr.turno_sesion_id=v_s.id AND tr.estado='ACTIVO') THEN
    RAISE EXCEPTION 'El cambio requiere una Jornada minorista abierta y una dependienta trabajando.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_program FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_cambios)
  LOOP
    v_product_id:=(v_item->>'producto_id')::uuid;
    v_new_price:=(v_item->>'precio_nuevo')::numeric;
    v_new_cost:=nullif(v_item->>'costo_nuevo','')::numeric;

    SELECT precio_normal,costo_unitario_referencia INTO v_old_price,v_old_cost
    FROM public.productos
    WHERE id=v_product_id AND activo=true AND producto_padre_id IS NULL
    FOR UPDATE;

    IF NOT FOUND OR v_old_price IS NULL THEN
      RAISE EXCEPTION 'El producto % no tiene un precio actual de venta confirmado o no es un producto raíz activo.',v_product_id USING ERRCODE='23503';
    END IF;
    IF v_new_cost IS NOT NULL AND v_new_cost IS NOT DISTINCT FROM v_old_cost THEN v_new_cost:=NULL; END IF;
    IF v_new_price=v_old_price AND v_new_cost IS NULL THEN
      RAISE EXCEPTION 'Indica un precio de venta o un costo que sea diferente al valor actual para %.',v_product_id USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM public.bc7_productos_ajuste_jornada(v_s.id) p
      WHERE p.producto_id=v_product_id AND p.producto_padre_id IS NULL
    ) THEN
      RAISE EXCEPTION 'El producto % no pertenece al inventario activo de esta Jornada.',v_product_id USING ERRCODE='23503';
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.turno_jornada_cambios_precio c
      WHERE c.turno_sesion_id=v_s.id AND c.producto_id=v_product_id
        AND c.estado='PENDIENTE_CONTEO'
    ) THEN
      RAISE EXCEPTION 'Ya existe un cambio pendiente de conteo para %.',v_product_id USING ERRCODE='23505';
    END IF;

    INSERT INTO public.turno_jornada_cambios_precio(
      turno_sesion_id,almacen_id,producto_id,precio_anterior,precio_nuevo,
      costo_anterior,costo_nuevo,comentario,creado_por
    ) VALUES(v_s.id,v_s.almacen_id,v_product_id,v_old_price,v_new_price,
      v_old_cost,v_new_cost,btrim(p_comentario),auth.uid());

    v_before:=v_before||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,'precio_anterior',v_old_price,'costo_anterior',v_old_cost
    ));
    v_after:=v_after||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,'precio_nuevo',v_new_price,'costo_nuevo',v_new_cost
    ));
    v_count:=v_count+1;
  END LOOP;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_s.almacen_id,v_program.id,auth.uid(),'CAMBIOS_PRECIO_SOLICITADOS',
    btrim(p_comentario),v_before,
    jsonb_build_object('cambios',v_after,'productos_pendientes_de_conteo',v_count)
  );

  RETURN jsonb_build_object(
    'ok',true,
    'productos_pendientes_de_conteo',v_count,
    'catalogo_modificado',false,
    'requiere_conteo_fisico',true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_solicitar_cambios_precio_jornada(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_solicitar_cambios_precio_jornada(uuid,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc7_mis_cambios_precio_pendientes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'sesion_id',s.id,
    'fecha',s.fecha,
    'almacen_id',s.almacen_id,
    'cambios',pending.rows
  ) ORDER BY s.fecha,s.numero_dia),'[]'::jsonb)
  FROM public.turno_sesiones s
  JOIN public.turno_tramos tr
    ON tr.turno_sesion_id=s.id
   AND tr.usuario_id=auth.uid()
   AND tr.estado='ACTIVO'
  JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,
      'producto_id',c.producto_id,
      'nombre',p.nombre,
      'unidad',p.unidad,
      'precio_anterior',c.precio_anterior,
      'precio_nuevo',c.precio_nuevo,
      'costo_anterior',c.costo_anterior,
      'costo_nuevo',c.costo_nuevo,
      'creado_en',c.creado_en,
      'comentario',c.comentario
    ) ORDER BY p.nombre,c.creado_en) rows
    FROM public.turno_jornada_cambios_precio c
    JOIN public.productos p ON p.id=c.producto_id
    WHERE c.turno_sesion_id=s.id AND c.estado='PENDIENTE_CONTEO'
  ) pending ON pending.rows IS NOT NULL
  WHERE auth.uid() IS NOT NULL
    AND s.bloque='JORNADA' AND s.estado='EN_CURSO'
    AND tr.usuario_id=auth.uid() AND tr.estado='ACTIVO';
$function$;


REVOKE ALL ON FUNCTION public.bc7_mis_cambios_precio_pendientes() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_mis_cambios_precio_pendientes() TO authenticated;

CREATE OR REPLACE FUNCTION public.bc7_confirmar_cambios_precio_conteo(
  p_turno_sesion_id uuid,
  p_conteos jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_program public.turno_jornada_programacion;
  v_change public.turno_jornada_cambios_precio;
  v_item jsonb;
  v_product_id uuid;
  v_counted numeric;
  v_expected numeric;
  v_sold_before numeric;
  v_previous_sold numeric;
  v_pending integer;
  v_confirmed integer:=0;
  v_before jsonb:='[]'::jsonb;
  v_after jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF p_conteos IS NULL OR jsonb_typeof(p_conteos)<>'array' OR jsonb_array_length(p_conteos)=0 THEN
    RAISE EXCEPTION 'Debes contar todos los productos pendientes.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_conteos) x(value)
    WHERE jsonb_typeof(x.value)<>'object'
      OR coalesce(x.value->>'producto_id','') !~* '^[0-9a-f-]{36}$'
      OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,4})?|[.][0-9]{1,4})$'
      OR (x.value->>'cantidad')::numeric<0
  ) THEN
    RAISE EXCEPTION 'Todas las cantidades deben ser válidas y no negativas.' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_conteos))
     <> (SELECT count(DISTINCT (x.value->>'producto_id')::uuid) FROM jsonb_array_elements(p_conteos) x(value)) THEN
    RAISE EXCEPTION 'No repitas un producto en el conteo.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'EN_CURSO'
     OR NOT EXISTS(
       SELECT 1 FROM public.turno_tramos tr
       WHERE tr.turno_sesion_id=v_s.id AND tr.usuario_id=auth.uid() AND tr.estado='ACTIVO'
     ) THEN
    RAISE EXCEPTION 'Solo la dependienta que está trabajando en esta Jornada puede confirmar el conteo.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_program FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;

  PERFORM 1 FROM public.turno_jornada_cambios_precio
  WHERE turno_sesion_id=v_s.id AND estado='PENDIENTE_CONTEO'
  FOR UPDATE;
  SELECT count(*)::integer INTO v_pending
  FROM public.turno_jornada_cambios_precio
  WHERE turno_sesion_id=v_s.id AND estado='PENDIENTE_CONTEO';

  IF v_pending=0 OR v_pending<>(SELECT count(*) FROM jsonb_array_elements(p_conteos)) THEN
    RAISE EXCEPTION 'Debes contar todos los productos pendientes en una sola confirmación.' USING ERRCODE='23514';
  END IF;

  FOR v_change IN
    SELECT * FROM public.turno_jornada_cambios_precio
    WHERE turno_sesion_id=v_s.id AND estado='PENDIENTE_CONTEO'
    ORDER BY producto_id,creado_en
    FOR UPDATE
  LOOP
    v_product_id:=v_change.producto_id;
    SELECT (x.value->>'cantidad')::numeric INTO v_counted
    FROM jsonb_array_elements(p_conteos) x(value)
    WHERE (x.value->>'producto_id')::uuid=v_product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Falta contar el producto %.',v_product_id USING ERRCODE='23514';
    END IF;

    SELECT coalesce(s.cantidad_actual,0)::numeric INTO v_expected
    FROM public.bc7_jornada_saldos_operativos(v_s.id) s
    WHERE s.producto_id=v_product_id;
    v_expected:=coalesce(v_expected,0);
    SELECT coalesce(sum(c.unidades_vendidas_precio_anterior),0)::numeric
      INTO v_previous_sold
    FROM public.turno_jornada_cambios_precio c
    WHERE c.turno_sesion_id=v_s.id AND c.producto_id=v_product_id AND c.estado='APLICADO';
    v_sold_before:=greatest(0,v_expected-v_counted-coalesce(v_previous_sold,0));

    PERFORM set_config('app.bc_product_values_source','JORNADA_CORRECTION',true);
    PERFORM set_config('app.bc_product_values_session_id',v_s.id::text,true);
    PERFORM set_config('app.bc_product_values_comment','Cambio de precio/costo confirmado tras conteo físico obligatorio.',true);

    UPDATE public.productos
    SET precio_normal=v_change.precio_nuevo,
        costo_unitario_referencia=coalesce(v_change.costo_nuevo,costo_unitario_referencia)
    WHERE id=v_product_id
      AND activo=true
      AND producto_padre_id IS NULL
      AND precio_normal=v_change.precio_anterior
      AND (v_change.costo_nuevo IS NULL OR costo_unitario_referencia IS NOT DISTINCT FROM v_change.costo_anterior);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El precio o costo de catálogo de % cambió desde que se solicitó. No se aplicó ningún cambio; Administración debe revisar el caso.',v_product_id USING ERRCODE='40001';
    END IF;

    UPDATE public.turno_jornada_cambios_precio
    SET estado='APLICADO',
        stock_sistema=v_expected,
        stock_contado=v_counted,
        unidades_vendidas_precio_anterior=v_sold_before,
        confirmado_por=auth.uid(),
        confirmado_en=now()
    WHERE id=v_change.id;

    v_before:=v_before||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,
      'precio_anterior',v_change.precio_anterior,
      'costo_anterior',v_change.costo_anterior,
      'stock_sistema',v_expected
    ));
    v_after:=v_after||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,
      'precio_nuevo',v_change.precio_nuevo,
      'costo_nuevo',v_change.costo_nuevo,
      'stock_contado',v_counted,
      'unidades_vendidas_precio_anterior',v_sold_before
    ));
    v_confirmed:=v_confirmed+1;
  END LOOP;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_s.almacen_id,v_program.id,auth.uid(),'CAMBIOS_PRECIO_APLICADOS',
    'Conteo físico obligatorio confirmado por la dependienta.',
    v_before,
    jsonb_build_object('cambios',v_after,'productos_aplicados',v_confirmed)
  );

  RETURN jsonb_build_object(
    'ok',true,
    'productos_aplicados',v_confirmed,
    'catalogo_actualizado',true,
    'ventas_anteriores_conservan_precio',true
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.bc7_confirmar_cambios_precio_conteo(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_confirmar_cambios_precio_conteo(uuid,jsonb) TO authenticated;

COMMIT;

          OR CASE
            WHEN nullif(x.value->>'costo_nuevo','') ~ '^([0-9]+([.][0-9]{1,4})?|[.][0-9]{1,4})
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_cambios))
     <> (SELECT count(DISTINCT (x.value->>'producto_id')::uuid) FROM jsonb_array_elements(p_cambios) x(value)) THEN
    RAISE EXCEPTION 'No repitas productos en el mismo cambio.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;

  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'EN_CURSO'
     OR NOT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista')
     OR NOT EXISTS(SELECT 1 FROM public.turno_tramos tr WHERE tr.turno_sesion_id=v_s.id AND tr.estado='ACTIVO') THEN
    RAISE EXCEPTION 'El cambio requiere una Jornada minorista abierta y una dependienta trabajando.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_program FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_cambios)
  LOOP
    v_product_id:=(v_item->>'producto_id')::uuid;
    v_new_price:=(v_item->>'precio_nuevo')::numeric;
    v_new_cost:=nullif(v_item->>'costo_nuevo','')::numeric;

    SELECT precio_normal,costo_unitario_referencia INTO v_old_price,v_old_cost
    FROM public.productos
    WHERE id=v_product_id AND activo=true AND producto_padre_id IS NULL
    FOR UPDATE;

    IF NOT FOUND OR v_old_price IS NULL THEN
      RAISE EXCEPTION 'El producto % no tiene un precio actual de venta confirmado o no es un producto raíz activo.',v_product_id USING ERRCODE='23503';
    END IF;
    IF v_new_cost IS NOT NULL AND v_new_cost IS NOT DISTINCT FROM v_old_cost THEN v_new_cost:=NULL; END IF;
    IF v_new_price=v_old_price AND v_new_cost IS NULL THEN
      RAISE EXCEPTION 'Indica un precio de venta o un costo que sea diferente al valor actual para %.',v_product_id USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM public.bc7_productos_ajuste_jornada(v_s.id) p
      WHERE p.producto_id=v_product_id AND p.producto_padre_id IS NULL
    ) THEN
      RAISE EXCEPTION 'El producto % no pertenece al inventario activo de esta Jornada.',v_product_id USING ERRCODE='23503';
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.turno_jornada_cambios_precio c
      WHERE c.turno_sesion_id=v_s.id AND c.producto_id=v_product_id
        AND c.estado='PENDIENTE_CONTEO'
    ) THEN
      RAISE EXCEPTION 'Ya existe un cambio pendiente de conteo para %.',v_product_id USING ERRCODE='23505';
    END IF;

    INSERT INTO public.turno_jornada_cambios_precio(
      turno_sesion_id,almacen_id,producto_id,precio_anterior,precio_nuevo,
      costo_anterior,costo_nuevo,comentario,creado_por
    ) VALUES(v_s.id,v_s.almacen_id,v_product_id,v_old_price,v_new_price,
      v_old_cost,v_new_cost,btrim(p_comentario),auth.uid());

    v_before:=v_before||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,'precio_anterior',v_old_price,'costo_anterior',v_old_cost
    ));
    v_after:=v_after||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,'precio_nuevo',v_new_price,'costo_nuevo',v_new_cost
    ));
    v_count:=v_count+1;
  END LOOP;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_s.almacen_id,v_program.id,auth.uid(),'CAMBIOS_PRECIO_SOLICITADOS',
    btrim(p_comentario),v_before,
    jsonb_build_object('cambios',v_after,'productos_pendientes_de_conteo',v_count)
  );

  RETURN jsonb_build_object(
    'ok',true,
    'productos_pendientes_de_conteo',v_count,
    'catalogo_modificado',false,
    'requiere_conteo_fisico',true
  );
END;
$function$;


            OR (x.value->>'costo_nuevo')::numeric<0))
  ) THEN
    RAISE EXCEPTION 'Cada producto necesita un precio nuevo válido y no negativo.' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_cambios))
     <> (SELECT count(DISTINCT (x.value->>'producto_id')::uuid) FROM jsonb_array_elements(p_cambios) x(value)) THEN
    RAISE EXCEPTION 'No repitas productos en el mismo cambio.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;

  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'EN_CURSO'
     OR NOT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista')
     OR NOT EXISTS(SELECT 1 FROM public.turno_tramos tr WHERE tr.turno_sesion_id=v_s.id AND tr.estado='ACTIVO') THEN
    RAISE EXCEPTION 'El cambio requiere una Jornada minorista abierta y una dependienta trabajando.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_program FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_cambios)
  LOOP
    v_product_id:=(v_item->>'producto_id')::uuid;
    v_new_price:=(v_item->>'precio_nuevo')::numeric;

    SELECT precio_normal INTO v_old_price
    FROM public.productos
    WHERE id=v_product_id AND activo=true AND producto_padre_id IS NULL
    FOR UPDATE;

    IF NOT FOUND OR v_old_price IS NULL THEN
      RAISE EXCEPTION 'El producto % no tiene un precio actual de venta confirmado o no es un producto raíz activo.',v_product_id USING ERRCODE='23503';
    END IF;
    IF v_new_price=v_old_price THEN
      RAISE EXCEPTION 'El nuevo precio de % es igual al precio actual.',v_product_id USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM public.bc7_productos_ajuste_jornada(v_s.id) p
      WHERE p.producto_id=v_product_id AND p.producto_padre_id IS NULL
    ) THEN
      RAISE EXCEPTION 'El producto % no pertenece al inventario activo de esta Jornada.',v_product_id USING ERRCODE='23503';
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.turno_jornada_cambios_precio c
      WHERE c.turno_sesion_id=v_s.id AND c.producto_id=v_product_id
        AND c.estado='PENDIENTE_CONTEO'
    ) THEN
      RAISE EXCEPTION 'Ya existe un cambio pendiente de conteo para %.',v_product_id USING ERRCODE='23505';
    END IF;

    INSERT INTO public.turno_jornada_cambios_precio(
      turno_sesion_id,almacen_id,producto_id,precio_anterior,precio_nuevo,
      comentario,creado_por
    ) VALUES(v_s.id,v_s.almacen_id,v_product_id,v_old_price,v_new_price,btrim(p_comentario),auth.uid());

    v_before:=v_before||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,'precio_anterior',v_old_price
    ));
    v_after:=v_after||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,'precio_nuevo',v_new_price
    ));
    v_count:=v_count+1;
  END LOOP;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_s.almacen_id,v_program.id,auth.uid(),'CAMBIOS_PRECIO_SOLICITADOS',
    btrim(p_comentario),v_before,
    jsonb_build_object('cambios',v_after,'productos_pendientes_de_conteo',v_count)
  );

  RETURN jsonb_build_object(
    'ok',true,
    'productos_pendientes_de_conteo',v_count,
    'catalogo_modificado',false,
    'requiere_conteo_fisico',true
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.bc7_solicitar_cambios_precio_jornada(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_solicitar_cambios_precio_jornada(uuid,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc7_mis_cambios_precio_pendientes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'sesion_id',s.id,
    'fecha',s.fecha,
    'almacen_id',s.almacen_id,
    'cambios',pending.rows
  ) ORDER BY s.fecha,s.numero_dia),'[]'::jsonb)
  FROM public.turno_sesiones s
  JOIN public.turno_tramos tr
    ON tr.turno_sesion_id=s.id
   AND tr.usuario_id=auth.uid()
   AND tr.estado='ACTIVO'
  JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,
      'producto_id',c.producto_id,
      'nombre',p.nombre,
      'unidad',p.unidad,
      'precio_anterior',c.precio_anterior,
      'precio_nuevo',c.precio_nuevo,
      'costo_anterior',c.costo_anterior,
      'costo_nuevo',c.costo_nuevo,
      'creado_en',c.creado_en,
      'comentario',c.comentario
    ) ORDER BY p.nombre,c.creado_en) rows
    FROM public.turno_jornada_cambios_precio c
    JOIN public.productos p ON p.id=c.producto_id
    WHERE c.turno_sesion_id=s.id AND c.estado='PENDIENTE_CONTEO'
  ) pending ON pending.rows IS NOT NULL
  WHERE auth.uid() IS NOT NULL
    AND s.bloque='JORNADA' AND s.estado='EN_CURSO'
    AND tr.usuario_id=auth.uid() AND tr.estado='ACTIVO';
$function$;


REVOKE ALL ON FUNCTION public.bc7_mis_cambios_precio_pendientes() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_mis_cambios_precio_pendientes() TO authenticated;

CREATE OR REPLACE FUNCTION public.bc7_confirmar_cambios_precio_conteo(
  p_turno_sesion_id uuid,
  p_conteos jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_program public.turno_jornada_programacion;
  v_change public.turno_jornada_cambios_precio;
  v_item jsonb;
  v_product_id uuid;
  v_counted numeric;
  v_expected numeric;
  v_sold_before numeric;
  v_previous_sold numeric;
  v_pending integer;
  v_confirmed integer:=0;
  v_before jsonb:='[]'::jsonb;
  v_after jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF p_conteos IS NULL OR jsonb_typeof(p_conteos)<>'array' OR jsonb_array_length(p_conteos)=0 THEN
    RAISE EXCEPTION 'Debes contar todos los productos pendientes.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_conteos) x(value)
    WHERE jsonb_typeof(x.value)<>'object'
      OR coalesce(x.value->>'producto_id','') !~* '^[0-9a-f-]{36}$'
      OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,4})?|[.][0-9]{1,4})$'
      OR (x.value->>'cantidad')::numeric<0
  ) THEN
    RAISE EXCEPTION 'Todas las cantidades deben ser válidas y no negativas.' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_conteos))
     <> (SELECT count(DISTINCT (x.value->>'producto_id')::uuid) FROM jsonb_array_elements(p_conteos) x(value)) THEN
    RAISE EXCEPTION 'No repitas un producto en el conteo.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'EN_CURSO'
     OR NOT EXISTS(
       SELECT 1 FROM public.turno_tramos tr
       WHERE tr.turno_sesion_id=v_s.id AND tr.usuario_id=auth.uid() AND tr.estado='ACTIVO'
     ) THEN
    RAISE EXCEPTION 'Solo la dependienta que está trabajando en esta Jornada puede confirmar el conteo.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_program FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;

  PERFORM 1 FROM public.turno_jornada_cambios_precio
  WHERE turno_sesion_id=v_s.id AND estado='PENDIENTE_CONTEO'
  FOR UPDATE;
  SELECT count(*)::integer INTO v_pending
  FROM public.turno_jornada_cambios_precio
  WHERE turno_sesion_id=v_s.id AND estado='PENDIENTE_CONTEO';

  IF v_pending=0 OR v_pending<>(SELECT count(*) FROM jsonb_array_elements(p_conteos)) THEN
    RAISE EXCEPTION 'Debes contar todos los productos pendientes en una sola confirmación.' USING ERRCODE='23514';
  END IF;

  FOR v_change IN
    SELECT * FROM public.turno_jornada_cambios_precio
    WHERE turno_sesion_id=v_s.id AND estado='PENDIENTE_CONTEO'
    ORDER BY producto_id,creado_en
    FOR UPDATE
  LOOP
    v_product_id:=v_change.producto_id;
    SELECT (x.value->>'cantidad')::numeric INTO v_counted
    FROM jsonb_array_elements(p_conteos) x(value)
    WHERE (x.value->>'producto_id')::uuid=v_product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Falta contar el producto %.',v_product_id USING ERRCODE='23514';
    END IF;

    SELECT coalesce(s.cantidad_actual,0)::numeric INTO v_expected
    FROM public.bc7_jornada_saldos_operativos(v_s.id) s
    WHERE s.producto_id=v_product_id;
    v_expected:=coalesce(v_expected,0);
    SELECT coalesce(sum(c.unidades_vendidas_precio_anterior),0)::numeric
      INTO v_previous_sold
    FROM public.turno_jornada_cambios_precio c
    WHERE c.turno_sesion_id=v_s.id AND c.producto_id=v_product_id AND c.estado='APLICADO';
    v_sold_before:=greatest(0,v_expected-v_counted-coalesce(v_previous_sold,0));

    PERFORM set_config('app.bc_product_values_source','JORNADA_CORRECTION',true);
    PERFORM set_config('app.bc_product_values_session_id',v_s.id::text,true);
    PERFORM set_config('app.bc_product_values_comment','Cambio de precio/costo confirmado tras conteo físico obligatorio.',true);

    UPDATE public.productos
    SET precio_normal=v_change.precio_nuevo,
        costo_unitario_referencia=coalesce(v_change.costo_nuevo,costo_unitario_referencia)
    WHERE id=v_product_id
      AND activo=true
      AND producto_padre_id IS NULL
      AND precio_normal=v_change.precio_anterior
      AND (v_change.costo_nuevo IS NULL OR costo_unitario_referencia IS NOT DISTINCT FROM v_change.costo_anterior);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El precio o costo de catálogo de % cambió desde que se solicitó. No se aplicó ningún cambio; Administración debe revisar el caso.',v_product_id USING ERRCODE='40001';
    END IF;

    UPDATE public.turno_jornada_cambios_precio
    SET estado='APLICADO',
        stock_sistema=v_expected,
        stock_contado=v_counted,
        unidades_vendidas_precio_anterior=v_sold_before,
        confirmado_por=auth.uid(),
        confirmado_en=now()
    WHERE id=v_change.id;

    v_before:=v_before||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,
      'precio_anterior',v_change.precio_anterior,
      'costo_anterior',v_change.costo_anterior,
      'stock_sistema',v_expected
    ));
    v_after:=v_after||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,
      'precio_nuevo',v_change.precio_nuevo,
      'costo_nuevo',v_change.costo_nuevo,
      'stock_contado',v_counted,
      'unidades_vendidas_precio_anterior',v_sold_before
    ));
    v_confirmed:=v_confirmed+1;
  END LOOP;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_s.almacen_id,v_program.id,auth.uid(),'CAMBIOS_PRECIO_APLICADOS',
    'Conteo físico obligatorio confirmado por la dependienta.',
    v_before,
    jsonb_build_object('cambios',v_after,'productos_aplicados',v_confirmed)
  );

  RETURN jsonb_build_object(
    'ok',true,
    'productos_aplicados',v_confirmed,
    'catalogo_actualizado',true,
    'ventas_anteriores_conservan_precio',true
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.bc7_confirmar_cambios_precio_conteo(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_confirmar_cambios_precio_conteo(uuid,jsonb) TO authenticated;

COMMIT;

            THEN nullif(x.value->>'costo_nuevo','')::numeric < 0
            ELSE false
          END
        )
      )
  ) THEN
    RAISE EXCEPTION 'El precio nuevo y el costo opcional deben ser números válidos y no negativos.' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_cambios))
     <> (SELECT count(DISTINCT (x.value->>'producto_id')::uuid) FROM jsonb_array_elements(p_cambios) x(value)) THEN
    RAISE EXCEPTION 'No repitas productos en el mismo cambio.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;

  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'EN_CURSO'
     OR NOT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista')
     OR NOT EXISTS(SELECT 1 FROM public.turno_tramos tr WHERE tr.turno_sesion_id=v_s.id AND tr.estado='ACTIVO') THEN
    RAISE EXCEPTION 'El cambio requiere una Jornada minorista abierta y una dependienta trabajando.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_program FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_cambios)
  LOOP
    v_product_id:=(v_item->>'producto_id')::uuid;
    v_new_price:=(v_item->>'precio_nuevo')::numeric;
    v_new_cost:=nullif(v_item->>'costo_nuevo','')::numeric;

    SELECT precio_normal,costo_unitario_referencia INTO v_old_price,v_old_cost
    FROM public.productos
    WHERE id=v_product_id AND activo=true AND producto_padre_id IS NULL
    FOR UPDATE;

    IF NOT FOUND OR v_old_price IS NULL THEN
      RAISE EXCEPTION 'El producto % no tiene un precio actual de venta confirmado o no es un producto raíz activo.',v_product_id USING ERRCODE='23503';
    END IF;
    IF v_new_cost IS NOT NULL AND v_new_cost IS NOT DISTINCT FROM v_old_cost THEN v_new_cost:=NULL; END IF;
    IF v_new_price=v_old_price AND v_new_cost IS NULL THEN
      RAISE EXCEPTION 'Indica un precio de venta o un costo que sea diferente al valor actual para %.',v_product_id USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM public.bc7_productos_ajuste_jornada(v_s.id) p
      WHERE p.producto_id=v_product_id AND p.producto_padre_id IS NULL
    ) THEN
      RAISE EXCEPTION 'El producto % no pertenece al inventario activo de esta Jornada.',v_product_id USING ERRCODE='23503';
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.turno_jornada_cambios_precio c
      WHERE c.turno_sesion_id=v_s.id AND c.producto_id=v_product_id
        AND c.estado='PENDIENTE_CONTEO'
    ) THEN
      RAISE EXCEPTION 'Ya existe un cambio pendiente de conteo para %.',v_product_id USING ERRCODE='23505';
    END IF;

    INSERT INTO public.turno_jornada_cambios_precio(
      turno_sesion_id,almacen_id,producto_id,precio_anterior,precio_nuevo,
      costo_anterior,costo_nuevo,comentario,creado_por
    ) VALUES(v_s.id,v_s.almacen_id,v_product_id,v_old_price,v_new_price,
      v_old_cost,v_new_cost,btrim(p_comentario),auth.uid());

    v_before:=v_before||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,'precio_anterior',v_old_price,'costo_anterior',v_old_cost
    ));
    v_after:=v_after||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,'precio_nuevo',v_new_price,'costo_nuevo',v_new_cost
    ));
    v_count:=v_count+1;
  END LOOP;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_s.almacen_id,v_program.id,auth.uid(),'CAMBIOS_PRECIO_SOLICITADOS',
    btrim(p_comentario),v_before,
    jsonb_build_object('cambios',v_after,'productos_pendientes_de_conteo',v_count)
  );

  RETURN jsonb_build_object(
    'ok',true,
    'productos_pendientes_de_conteo',v_count,
    'catalogo_modificado',false,
    'requiere_conteo_fisico',true
  );
END;
$function$;


            OR (x.value->>'costo_nuevo')::numeric<0))
  ) THEN
    RAISE EXCEPTION 'Cada producto necesita un precio nuevo válido y no negativo.' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_cambios))
     <> (SELECT count(DISTINCT (x.value->>'producto_id')::uuid) FROM jsonb_array_elements(p_cambios) x(value)) THEN
    RAISE EXCEPTION 'No repitas productos en el mismo cambio.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;

  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'EN_CURSO'
     OR NOT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista')
     OR NOT EXISTS(SELECT 1 FROM public.turno_tramos tr WHERE tr.turno_sesion_id=v_s.id AND tr.estado='ACTIVO') THEN
    RAISE EXCEPTION 'El cambio requiere una Jornada minorista abierta y una dependienta trabajando.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_program FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_cambios)
  LOOP
    v_product_id:=(v_item->>'producto_id')::uuid;
    v_new_price:=(v_item->>'precio_nuevo')::numeric;

    SELECT precio_normal INTO v_old_price
    FROM public.productos
    WHERE id=v_product_id AND activo=true AND producto_padre_id IS NULL
    FOR UPDATE;

    IF NOT FOUND OR v_old_price IS NULL THEN
      RAISE EXCEPTION 'El producto % no tiene un precio actual de venta confirmado o no es un producto raíz activo.',v_product_id USING ERRCODE='23503';
    END IF;
    IF v_new_price=v_old_price THEN
      RAISE EXCEPTION 'El nuevo precio de % es igual al precio actual.',v_product_id USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM public.bc7_productos_ajuste_jornada(v_s.id) p
      WHERE p.producto_id=v_product_id AND p.producto_padre_id IS NULL
    ) THEN
      RAISE EXCEPTION 'El producto % no pertenece al inventario activo de esta Jornada.',v_product_id USING ERRCODE='23503';
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.turno_jornada_cambios_precio c
      WHERE c.turno_sesion_id=v_s.id AND c.producto_id=v_product_id
        AND c.estado='PENDIENTE_CONTEO'
    ) THEN
      RAISE EXCEPTION 'Ya existe un cambio pendiente de conteo para %.',v_product_id USING ERRCODE='23505';
    END IF;

    INSERT INTO public.turno_jornada_cambios_precio(
      turno_sesion_id,almacen_id,producto_id,precio_anterior,precio_nuevo,
      comentario,creado_por
    ) VALUES(v_s.id,v_s.almacen_id,v_product_id,v_old_price,v_new_price,btrim(p_comentario),auth.uid());

    v_before:=v_before||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,'precio_anterior',v_old_price
    ));
    v_after:=v_after||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,'precio_nuevo',v_new_price
    ));
    v_count:=v_count+1;
  END LOOP;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_s.almacen_id,v_program.id,auth.uid(),'CAMBIOS_PRECIO_SOLICITADOS',
    btrim(p_comentario),v_before,
    jsonb_build_object('cambios',v_after,'productos_pendientes_de_conteo',v_count)
  );

  RETURN jsonb_build_object(
    'ok',true,
    'productos_pendientes_de_conteo',v_count,
    'catalogo_modificado',false,
    'requiere_conteo_fisico',true
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.bc7_solicitar_cambios_precio_jornada(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_solicitar_cambios_precio_jornada(uuid,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc7_mis_cambios_precio_pendientes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'sesion_id',s.id,
    'fecha',s.fecha,
    'almacen_id',s.almacen_id,
    'cambios',pending.rows
  ) ORDER BY s.fecha,s.numero_dia),'[]'::jsonb)
  FROM public.turno_sesiones s
  JOIN public.turno_tramos tr
    ON tr.turno_sesion_id=s.id
   AND tr.usuario_id=auth.uid()
   AND tr.estado='ACTIVO'
  JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,
      'producto_id',c.producto_id,
      'nombre',p.nombre,
      'unidad',p.unidad,
      'precio_anterior',c.precio_anterior,
      'precio_nuevo',c.precio_nuevo,
      'costo_anterior',c.costo_anterior,
      'costo_nuevo',c.costo_nuevo,
      'creado_en',c.creado_en,
      'comentario',c.comentario
    ) ORDER BY p.nombre,c.creado_en) rows
    FROM public.turno_jornada_cambios_precio c
    JOIN public.productos p ON p.id=c.producto_id
    WHERE c.turno_sesion_id=s.id AND c.estado='PENDIENTE_CONTEO'
  ) pending ON pending.rows IS NOT NULL
  WHERE auth.uid() IS NOT NULL
    AND s.bloque='JORNADA' AND s.estado='EN_CURSO'
    AND tr.usuario_id=auth.uid() AND tr.estado='ACTIVO';
$function$;


REVOKE ALL ON FUNCTION public.bc7_mis_cambios_precio_pendientes() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_mis_cambios_precio_pendientes() TO authenticated;

CREATE OR REPLACE FUNCTION public.bc7_confirmar_cambios_precio_conteo(
  p_turno_sesion_id uuid,
  p_conteos jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_program public.turno_jornada_programacion;
  v_change public.turno_jornada_cambios_precio;
  v_item jsonb;
  v_product_id uuid;
  v_counted numeric;
  v_expected numeric;
  v_sold_before numeric;
  v_previous_sold numeric;
  v_pending integer;
  v_confirmed integer:=0;
  v_before jsonb:='[]'::jsonb;
  v_after jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF p_conteos IS NULL OR jsonb_typeof(p_conteos)<>'array' OR jsonb_array_length(p_conteos)=0 THEN
    RAISE EXCEPTION 'Debes contar todos los productos pendientes.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_conteos) x(value)
    WHERE jsonb_typeof(x.value)<>'object'
      OR coalesce(x.value->>'producto_id','') !~* '^[0-9a-f-]{36}$'
      OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,4})?|[.][0-9]{1,4})$'
      OR (x.value->>'cantidad')::numeric<0
  ) THEN
    RAISE EXCEPTION 'Todas las cantidades deben ser válidas y no negativas.' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_conteos))
     <> (SELECT count(DISTINCT (x.value->>'producto_id')::uuid) FROM jsonb_array_elements(p_conteos) x(value)) THEN
    RAISE EXCEPTION 'No repitas un producto en el conteo.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'EN_CURSO'
     OR NOT EXISTS(
       SELECT 1 FROM public.turno_tramos tr
       WHERE tr.turno_sesion_id=v_s.id AND tr.usuario_id=auth.uid() AND tr.estado='ACTIVO'
     ) THEN
    RAISE EXCEPTION 'Solo la dependienta que está trabajando en esta Jornada puede confirmar el conteo.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_program FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;

  PERFORM 1 FROM public.turno_jornada_cambios_precio
  WHERE turno_sesion_id=v_s.id AND estado='PENDIENTE_CONTEO'
  FOR UPDATE;
  SELECT count(*)::integer INTO v_pending
  FROM public.turno_jornada_cambios_precio
  WHERE turno_sesion_id=v_s.id AND estado='PENDIENTE_CONTEO';

  IF v_pending=0 OR v_pending<>(SELECT count(*) FROM jsonb_array_elements(p_conteos)) THEN
    RAISE EXCEPTION 'Debes contar todos los productos pendientes en una sola confirmación.' USING ERRCODE='23514';
  END IF;

  FOR v_change IN
    SELECT * FROM public.turno_jornada_cambios_precio
    WHERE turno_sesion_id=v_s.id AND estado='PENDIENTE_CONTEO'
    ORDER BY producto_id,creado_en
    FOR UPDATE
  LOOP
    v_product_id:=v_change.producto_id;
    SELECT (x.value->>'cantidad')::numeric INTO v_counted
    FROM jsonb_array_elements(p_conteos) x(value)
    WHERE (x.value->>'producto_id')::uuid=v_product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Falta contar el producto %.',v_product_id USING ERRCODE='23514';
    END IF;

    SELECT coalesce(s.cantidad_actual,0)::numeric INTO v_expected
    FROM public.bc7_jornada_saldos_operativos(v_s.id) s
    WHERE s.producto_id=v_product_id;
    v_expected:=coalesce(v_expected,0);
    SELECT coalesce(sum(c.unidades_vendidas_precio_anterior),0)::numeric
      INTO v_previous_sold
    FROM public.turno_jornada_cambios_precio c
    WHERE c.turno_sesion_id=v_s.id AND c.producto_id=v_product_id AND c.estado='APLICADO';
    v_sold_before:=greatest(0,v_expected-v_counted-coalesce(v_previous_sold,0));

    PERFORM set_config('app.bc_product_values_source','JORNADA_CORRECTION',true);
    PERFORM set_config('app.bc_product_values_session_id',v_s.id::text,true);
    PERFORM set_config('app.bc_product_values_comment','Cambio de precio/costo confirmado tras conteo físico obligatorio.',true);

    UPDATE public.productos
    SET precio_normal=v_change.precio_nuevo,
        costo_unitario_referencia=coalesce(v_change.costo_nuevo,costo_unitario_referencia)
    WHERE id=v_product_id
      AND activo=true
      AND producto_padre_id IS NULL
      AND precio_normal=v_change.precio_anterior
      AND (v_change.costo_nuevo IS NULL OR costo_unitario_referencia IS NOT DISTINCT FROM v_change.costo_anterior);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El precio o costo de catálogo de % cambió desde que se solicitó. No se aplicó ningún cambio; Administración debe revisar el caso.',v_product_id USING ERRCODE='40001';
    END IF;

    UPDATE public.turno_jornada_cambios_precio
    SET estado='APLICADO',
        stock_sistema=v_expected,
        stock_contado=v_counted,
        unidades_vendidas_precio_anterior=v_sold_before,
        confirmado_por=auth.uid(),
        confirmado_en=now()
    WHERE id=v_change.id;

    v_before:=v_before||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,
      'precio_anterior',v_change.precio_anterior,
      'costo_anterior',v_change.costo_anterior,
      'stock_sistema',v_expected
    ));
    v_after:=v_after||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,
      'precio_nuevo',v_change.precio_nuevo,
      'costo_nuevo',v_change.costo_nuevo,
      'stock_contado',v_counted,
      'unidades_vendidas_precio_anterior',v_sold_before
    ));
    v_confirmed:=v_confirmed+1;
  END LOOP;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_s.almacen_id,v_program.id,auth.uid(),'CAMBIOS_PRECIO_APLICADOS',
    'Conteo físico obligatorio confirmado por la dependienta.',
    v_before,
    jsonb_build_object('cambios',v_after,'productos_aplicados',v_confirmed)
  );

  RETURN jsonb_build_object(
    'ok',true,
    'productos_aplicados',v_confirmed,
    'catalogo_actualizado',true,
    'ventas_anteriores_conservan_precio',true
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.bc7_confirmar_cambios_precio_conteo(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_confirmar_cambios_precio_conteo(uuid,jsonb) TO authenticated;

COMMIT;
