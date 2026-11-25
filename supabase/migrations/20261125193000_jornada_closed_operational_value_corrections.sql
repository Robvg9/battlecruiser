-- Allow Owner corrections on an operationally closed Jornada without changing the global product catalog.
-- Completed Jornadas keep the existing global effective-dated product value behavior.
BEGIN;

DO $patch_closed_operational_values$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_ajustar_valores_producto_jornada(uuid,jsonb,text)'::regprocedure)
  INTO v_definition;

  v_old := $old$v_s.estado<>'COMPLETADA'$old$;
  v_new := $new$v_s.estado NOT IN ('COMPLETADA','CERRADA_OPERATIVAMENTE')$new$;
  IF position(v_old in v_definition)=0 THEN
    RAISE EXCEPTION 'Expected completed-Jornada state guard was not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$    PERFORM set_config('app.bc_product_values_source','JORNADA_CORRECTION',true);
    PERFORM set_config('app.bc_product_values_session_id',v_s.id::text,true);
    PERFORM set_config('app.bc_product_values_comment',btrim(p_comentario),true);
    UPDATE public.productos
    SET precio_normal=coalesce(v_price,precio_normal),
        costo_unitario_referencia=coalesce(v_cost,costo_unitario_referencia)
    WHERE id=v_product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se pudo persistir el valor vigente del producto %.',v_product_id USING ERRCODE='23503';
    END IF;
    v_after:=v_after||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,'precio_venta_unitario',v_price,'costo_unitario',v_cost
    ));$old$;
  v_new := $new$    IF v_s.estado='COMPLETADA' THEN
      PERFORM set_config('app.bc_product_values_source','JORNADA_CORRECTION',true);
      PERFORM set_config('app.bc_product_values_session_id',v_s.id::text,true);
      PERFORM set_config('app.bc_product_values_comment',btrim(p_comentario),true);
      UPDATE public.productos
      SET precio_normal=coalesce(v_price,precio_normal),
          costo_unitario_referencia=coalesce(v_cost,costo_unitario_referencia)
      WHERE id=v_product_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'No se pudo persistir el valor vigente del producto %.',v_product_id USING ERRCODE='23503';
      END IF;
    END IF;
    v_after:=v_after||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,
      'precio_venta_unitario',v_price,
      'costo_unitario',v_cost,
      'valores_solo_jornada',v_s.estado='CERRADA_OPERATIVAMENTE'
    ));$new$;
  IF position(v_old in v_definition)=0 THEN
    RAISE EXCEPTION 'Expected global product-write block was not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$    'catalogo_modificado',EXISTS(
      SELECT 1 FROM jsonb_array_elements(v_after) x(value)
      WHERE nullif(x.value->>'precio_venta_unitario','') IS NOT NULL
    ),$old$;
  v_new := $new$    'catalogo_modificado',v_s.estado='COMPLETADA' AND EXISTS(
      SELECT 1 FROM jsonb_array_elements(v_after) x(value)
      WHERE nullif(x.value->>'precio_venta_unitario','') IS NOT NULL
    ),$new$;
  IF position(v_old in v_definition)=0 THEN
    RAISE EXCEPTION 'Expected catalog mutation response field was not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$    'valores_producto_persistidos',true$old$;
  v_new := $new$    'valores_producto_persistidos',v_s.estado='COMPLETADA',
    'valores_solo_jornada',v_s.estado='CERRADA_OPERATIVAMENTE'$new$;
  IF position(v_old in v_definition)=0 THEN
    RAISE EXCEPTION 'Expected persisted-values response field was not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END;
$patch_closed_operational_values$;

COMMIT;
