-- Persistent Jornada price changes with a mandatory physical-stock checkpoint.
BEGIN;

CREATE TABLE IF NOT EXISTS public.turno_jornada_cambios_precio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_sesion_id uuid NOT NULL REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT,
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  precio_anterior numeric(14,4) NOT NULL CHECK (precio_anterior >= 0),
  precio_nuevo numeric(14,4) NOT NULL CHECK (precio_nuevo >= 0),
  estado text NOT NULL DEFAULT 'PENDIENTE_CONTEO'
    CHECK (estado IN ('PENDIENTE_CONTEO','APLICADO','CANCELADO')),
  stock_sistema numeric(14,4),
  stock_contado numeric(14,4),
  unidades_vendidas_precio_anterior numeric(14,4),
  comentario text NOT NULL CHECK (length(btrim(comentario)) BETWEEN 5 AND 500),
  creado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  confirmado_por uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  confirmado_en timestamptz,
  CHECK (precio_nuevo <> precio_anterior),
  CHECK (
    (estado='PENDIENTE_CONTEO' AND confirmado_por IS NULL AND confirmado_en IS NULL
      AND stock_contado IS NULL AND unidades_vendidas_precio_anterior IS NULL)
    OR
    (estado='APLICADO' AND confirmado_por IS NOT NULL AND confirmado_en IS NOT NULL
      AND stock_sistema IS NOT NULL AND stock_contado IS NOT NULL
      AND unidades_vendidas_precio_anterior IS NOT NULL)
    OR estado='CANCELADO'
  )
);

COMMENT ON TABLE public.turno_jornada_cambios_precio IS
  'Price transitions requested by Owner/Admin and activated only after the assigned Jornada worker physically counts the remaining stock. Each applied row is a historical sales-price tranche.';

CREATE INDEX IF NOT EXISTS turno_jornada_cambios_precio_session_idx
  ON public.turno_jornada_cambios_precio(turno_sesion_id,producto_id,confirmado_en)
  WHERE estado='APLICADO';

CREATE INDEX IF NOT EXISTS turno_jornada_cambios_precio_pending_idx
  ON public.turno_jornada_cambios_precio(turno_sesion_id,creado_en)
  WHERE estado='PENDIENTE_CONTEO';

CREATE UNIQUE INDEX IF NOT EXISTS turno_jornada_cambios_precio_unico_pendiente_idx
  ON public.turno_jornada_cambios_precio(turno_sesion_id,producto_id)
  WHERE estado='PENDIENTE_CONTEO';

ALTER TABLE public.turno_jornada_cambios_precio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.turno_jornada_cambios_precio FROM PUBLIC, anon, authenticated;

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
          'unidad',p.producto_padre_id,
          'precio_actual',coalesce(pr.precio_normal,0),
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
  JOIN public.turno_tramos tr ON tr.turno_sesion_id=s.id
  JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,
      'producto_id',c.producto_id,
      'nombre',p.nombre,
      'unidad',p.unidad,
      'precio_anterior',c.precio_anterior,
      'precio_nuevo',c.precio_nuevo,
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

  SELECT count(*)::integer INTO v_pending
  FROM public.turno_jornada_cambios_precio
  WHERE turno_sesion_id=v_s.id AND estado='PENDIENTE_CONTEO'
  FOR UPDATE;

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
    v_sold_before:=greatest(0,v_expected-v_counted);

    UPDATE public.productos
    SET precio_normal=v_change.precio_nuevo
    WHERE id=v_product_id
      AND activo=true
      AND producto_padre_id IS NULL
      AND precio_normal=v_change.precio_anterior;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El precio de catálogo de % cambió desde que se solicitó. No se aplicó ningún cambio; Administración debe revisar el caso.',v_product_id USING ERRCODE='40001';
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
      'stock_sistema',v_expected
    ));
    v_after:=v_after||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,
      'precio_nuevo',v_change.precio_nuevo,
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

CREATE OR REPLACE FUNCTION public.bc7_bloquear_cierre_con_cambios_precio_pendientes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF NEW.estado='COMPLETADA' AND OLD.estado IS DISTINCT FROM NEW.estado
     AND EXISTS(
       SELECT 1 FROM public.turno_jornada_cambios_precio c
       WHERE c.turno_sesion_id=NEW.id AND c.estado='PENDIENTE_CONTEO'
     ) THEN
    RAISE EXCEPTION 'No se puede completar la Jornada: falta el conteo físico de uno o varios cambios de precio.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bc7_jornada_precio_pendiente_close_guard ON public.turno_sesiones;
CREATE TRIGGER bc7_jornada_precio_pendiente_close_guard
BEFORE UPDATE OF estado ON public.turno_sesiones
FOR EACH ROW EXECUTE FUNCTION public.bc7_bloquear_cierre_con_cambios_precio_pendientes();

-- Apply price-change tranches to the ordinary inventory-difference liquidation.
DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure)
  INTO v_definition;

  v_old := $old$  FROM calculated;

  -- Do not present provisional sales or salary as if the missing final stock were zero.$old$;

  v_new := $new$  FROM calculated;

  -- Each change is a physical stock checkpoint. The units no longer present at that checkpoint
  -- are valued at the price that was active immediately before it. The remaining units sold
  -- during the Jornada use the latest applied price.
  IF EXISTS(
    SELECT 1 FROM public.turno_jornada_cambios_precio c
    WHERE c.turno_sesion_id=v_s.id AND c.estado='APLICADO'
  ) THEN
    WITH price_totals AS (
      SELECT c.producto_id,
        sum(c.unidades_vendidas_precio_anterior)::numeric AS old_price_units,
        round(sum(c.unidades_vendidas_precio_anterior*c.precio_anterior),2) AS old_price_amount,
        (array_agg(c.precio_nuevo ORDER BY c.confirmado_en DESC,c.id DESC))[1] AS latest_price,
        jsonb_agg(jsonb_build_object(
          'precio_anterior',c.precio_anterior,
          'precio_nuevo',c.precio_nuevo,
          'stock_sistema',c.stock_sistema,
          'stock_contado',c.stock_contado,
          'unidades_vendidas_precio_anterior',c.unidades_vendidas_precio_anterior,
          'confirmado_en',c.confirmado_en
        ) ORDER BY c.confirmado_en,c.id) AS price_changes
      FROM public.turno_jornada_cambios_precio c
      WHERE c.turno_sesion_id=v_s.id AND c.estado='APLICADO'
      GROUP BY c.producto_id
    ),
    repriced AS (
      SELECT x.value AS line,pt.producto_id,
        coalesce((x.value->>'unidades_vendidas')::numeric,0) AS sold_qty,
        pt.old_price_units,pt.old_price_amount,pt.latest_price,pt.price_changes,
        CASE
          WHEN pt.producto_id IS NULL THEN nullif(x.value->>'importe_estimado','')::numeric
          WHEN coalesce((x.value->>'unidades_vendidas')::numeric,0)<pt.old_price_units-0.0001 THEN NULL
          WHEN coalesce((x.value->>'unidades_vendidas')::numeric,0)<0 THEN NULL
          ELSE round(pt.old_price_amount
            + greatest(0,(x.value->>'unidades_vendidas')::numeric-pt.old_price_units)*pt.latest_price,2)
        END AS repriced_amount,
        pt.producto_id IS NOT NULL
          AND coalesce((x.value->>'unidades_vendidas')::numeric,0)<pt.old_price_units-0.0001 AS inconsistent
      FROM jsonb_array_elements(coalesce(v_lines,'[]'::jsonb)) x(value)
      LEFT JOIN price_totals pt ON pt.producto_id=(x.value->>'producto_id')::uuid
    )
    SELECT
      coalesce(jsonb_agg(
        line || CASE WHEN producto_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
          'precio_unitario',latest_price,
          'estado_precio','PRECIO_CAMBIADO_CON_CONTEO',
          'precio_cambios_aplicado',true,
          'precio_cambios',price_changes,
          'precio_tramos_inconsistentes',inconsistent,
          'importe_estimado',repriced_amount
        ) END ORDER BY line->>'nombre'
      ),'[]'::jsonb),
      count(*),
      count(*) FILTER(WHERE (repriced_amount IS NOT NULL AND sold_qty>=0) OR sold_qty=0),
      count(*) FILTER(WHERE sold_qty<0),
      count(*) FILTER(WHERE sold_qty>0 AND repriced_amount IS NULL),
      coalesce(sum(sold_qty),0),
      CASE WHEN count(*) FILTER(WHERE (repriced_amount IS NULL AND sold_qty>0) OR sold_qty<0)>0
        THEN NULL ELSE round(coalesce(sum(repriced_amount),0),2) END
    INTO v_lines,v_total_lines,v_priced_lines,v_negative_lines,
         v_missing_price_sold,v_total_units,v_sales_total
    FROM repriced;
  END IF;

  -- Do not present provisional sales or salary as if the missing final stock were zero.$new$;

  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Expected liquidation insertion point not found exactly once while adding price tranches.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.bc7_obtener_revision_jornada(uuid)'::regprocedure)
  INTO v_definition;

  v_old := $old$        'importe_estimado',CASE
          WHEN jt.importe IS NOT NULL THEN jt.importe
          WHEN x.value->>'unidades_vendidas' IS NOT NULL
            AND coalesce(jv.precio_venta_unitario,nullif(x.value->>'precio_unitario','')::numeric) IS NOT NULL
            AND (x.value->>'unidades_vendidas')::numeric>=0
          THEN round((x.value->>'unidades_vendidas')::numeric*coalesce(jv.precio_venta_unitario,nullif(x.value->>'precio_unitario','')::numeric),2)
          ELSE NULL END$old$;

  v_new := $new$        'importe_estimado',CASE
          WHEN coalesce((x.value->>'precio_cambios_aplicado')::boolean,false) THEN nullif(x.value->>'importe_estimado','')::numeric
          WHEN jt.importe IS NOT NULL THEN jt.importe
          WHEN x.value->>'unidades_vendidas' IS NOT NULL
            AND coalesce(jv.precio_venta_unitario,nullif(x.value->>'precio_unitario','')::numeric) IS NOT NULL
            AND (x.value->>'unidades_vendidas')::numeric>=0
          THEN round((x.value->>'unidades_vendidas')::numeric*coalesce(jv.precio_venta_unitario,nullif(x.value->>'precio_unitario','')::numeric),2)
          ELSE NULL END$new$;

  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Expected Owner review pricing expression not found exactly once while adding price tranches.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END
$migration$;

COMMENT ON FUNCTION public.bc7_liquidacion_inventario_jornada(uuid) IS
  'Jornada inventory settlement with historical per-session price overrides and mandatory-count price-change tranches.';

COMMIT;
