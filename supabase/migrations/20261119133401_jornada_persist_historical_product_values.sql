-- Persist after-the-fact Jornada price/cost corrections as product-wide values.
-- Effective-dated snapshots keep already-started and closed Jornadas immutable.
BEGIN;

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS costo_unitario_referencia numeric(14,4)
  CHECK (costo_unitario_referencia IS NULL OR costo_unitario_referencia >= 0);

COMMENT ON COLUMN public.productos.costo_unitario_referencia IS
  'Product-wide corrected unit-cost reference for future Jornadas. Purchase lots remain immutable source records; this reference is a default until corrected again.';

CREATE TABLE IF NOT EXISTS public.productos_valores_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  precio_venta_unitario numeric(14,4) CHECK (precio_venta_unitario IS NULL OR precio_venta_unitario >= 0),
  costo_unitario numeric(14,4) CHECK (costo_unitario IS NULL OR costo_unitario >= 0),
  effective_at timestamptz NOT NULL,
  origen text NOT NULL CHECK (origen IN ('BASELINE','ALTA_PRODUCTO','CATALOGO','JORNADA_CORRECTION')),
  turno_sesion_id uuid REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT,
  comentario text,
  creado_por uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productos_valores_historial_origen_session_check CHECK (
    (origen = 'JORNADA_CORRECTION' AND turno_sesion_id IS NOT NULL)
    OR (origen <> 'JORNADA_CORRECTION' AND turno_sesion_id IS NULL)
  )
);

COMMENT ON TABLE public.productos_valores_historial IS
  'Append-only, effective-dated product-wide price and cost snapshots. A Jornada reads the latest snapshot effective at its initial/final physical checkpoint, so later corrections do not rewrite earlier Jornadas.';

CREATE INDEX IF NOT EXISTS productos_valores_historial_asof_idx
  ON public.productos_valores_historial(producto_id, effective_at DESC, creado_en DESC, id DESC);

ALTER TABLE public.productos_valores_historial ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.productos_valores_historial FROM PUBLIC, anon, authenticated;

-- Freeze the pre-feature product values as the baseline for every existing Jornada.
INSERT INTO public.productos_valores_historial(
  producto_id, precio_venta_unitario, costo_unitario, effective_at, origen
)
SELECT
  p.id, p.precio_normal, p.costo_unitario_referencia, '-infinity'::timestamptz, 'BASELINE'
FROM public.productos p
WHERE NOT EXISTS (
  SELECT 1 FROM public.productos_valores_historial h
  WHERE h.producto_id = p.id AND h.origen = 'BASELINE'
);

CREATE OR REPLACE FUNCTION public.bc_productos_valores_historial_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'El historial de valores de producto es inmutable; registra una nueva versión.'
    USING ERRCODE='55000';
END;
$function$;
REVOKE ALL ON FUNCTION public.bc_productos_valores_historial_inmutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS productos_valores_historial_immutable ON public.productos_valores_historial;
CREATE TRIGGER productos_valores_historial_immutable
BEFORE UPDATE OR DELETE ON public.productos_valores_historial
FOR EACH ROW EXECUTE FUNCTION public.bc_productos_valores_historial_inmutable();

CREATE OR REPLACE FUNCTION public.bc_productos_valores_historial_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_source text;
  v_session_id uuid;
  v_session_text text;
  v_comment text;
  v_effective_at timestamptz;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.precio_normal IS NOT DISTINCT FROM NEW.precio_normal
     AND OLD.costo_unitario_referencia IS NOT DISTINCT FROM NEW.costo_unitario_referencia THEN
    RETURN NEW;
  END IF;

  v_source := nullif(current_setting('app.bc_product_values_source', true), '');
  IF v_source IS NULL THEN
    v_source := CASE WHEN TG_OP = 'INSERT' THEN 'ALTA_PRODUCTO' ELSE 'CATALOGO' END;
  END IF;
  IF v_source NOT IN ('ALTA_PRODUCTO','CATALOGO','JORNADA_CORRECTION') THEN
    RAISE EXCEPTION 'Origen de historial de producto no permitido.' USING ERRCODE='22023';
  END IF;

  v_session_text := nullif(current_setting('app.bc_product_values_session_id', true), '');
  IF v_source = 'JORNADA_CORRECTION' AND v_session_text IS NULL THEN
    RAISE EXCEPTION 'Una corrección de Jornada debe identificar su sesión.' USING ERRCODE='22023';
  END IF;
  v_session_id := CASE WHEN v_session_text IS NULL THEN NULL ELSE v_session_text::uuid END;
  v_comment := nullif(current_setting('app.bc_product_values_comment', true), '');
  v_effective_at := CASE
    WHEN TG_OP = 'INSERT' THEN coalesce(NEW.created_at, now())
    ELSE clock_timestamp()
  END;

  INSERT INTO public.productos_valores_historial(
    producto_id, precio_venta_unitario, costo_unitario, effective_at,
    origen, turno_sesion_id, comentario, creado_por
  ) VALUES (
    NEW.id, NEW.precio_normal, NEW.costo_unitario_referencia, v_effective_at,
    v_source, v_session_id, v_comment, auth.uid()
  );

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.bc_productos_valores_historial_capture() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS productos_values_history_capture ON public.productos;
CREATE TRIGGER productos_values_history_capture
AFTER INSERT OR UPDATE OF precio_normal, costo_unitario_referencia ON public.productos
FOR EACH ROW EXECUTE FUNCTION public.bc_productos_valores_historial_capture();

-- Promote only corrections on the still-open completed Jornada. Closed historical
-- sessions (e.g. earlier Sheyla/Dahiana reconciliations) remain session-only.
DO $backfill$
DECLARE
  v_session_id uuid;
  v_candidate_sessions integer;
  v_expected integer;
  v_history_rows integer;
BEGIN
  SELECT count(DISTINCT s.id)
  INTO v_candidate_sessions
  FROM public.turno_sesiones s
  JOIN public.turnos t ON t.id = s.turno_id
  WHERE s.bloque = 'JORNADA'
    AND s.estado = 'COMPLETADA'
    AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
    AND EXISTS (
      SELECT 1 FROM public.turno_jornada_valores_correcciones jv
      WHERE jv.turno_sesion_id = s.id AND jv.vigente
    );

  IF v_candidate_sessions > 1 THEN
    RAISE EXCEPTION 'Hay más de una Jornada completada pendiente de revisión con correcciones; la promoción inicial requiere revisión explícita.';
  END IF;

  IF v_candidate_sessions = 1 THEN
    SELECT s.id INTO v_session_id
    FROM public.turno_sesiones s
    JOIN public.turnos t ON t.id = s.turno_id
    WHERE s.bloque = 'JORNADA'
      AND s.estado = 'COMPLETADA'
      AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
      AND EXISTS (
        SELECT 1 FROM public.turno_jornada_valores_correcciones jv
        WHERE jv.turno_sesion_id = s.id AND jv.vigente
      )
    ORDER BY s.fecha DESC, s.numero_dia DESC
    LIMIT 1;

    SELECT count(*) INTO v_expected
    FROM public.turno_jornada_valores_correcciones jv
    WHERE jv.turno_sesion_id = v_session_id AND jv.vigente;

    PERFORM set_config('app.bc_product_values_source','JORNADA_CORRECTION',true);
    PERFORM set_config('app.bc_product_values_session_id',v_session_id::text,true);
    PERFORM set_config(
      'app.bc_product_values_comment',
      'Promoción inicial de correcciones ya verificadas: valores globales para próximas Jornadas.',
      true
    );

    UPDATE public.productos p
    SET precio_normal = coalesce(jv.precio_venta_unitario,p.precio_normal),
        costo_unitario_referencia = coalesce(jv.costo_unitario,p.costo_unitario_referencia)
    FROM public.turno_jornada_valores_correcciones jv
    WHERE jv.turno_sesion_id = v_session_id
      AND jv.vigente
      AND jv.producto_id = p.id
      AND (
        (jv.precio_venta_unitario IS NOT NULL AND p.precio_normal IS DISTINCT FROM jv.precio_venta_unitario)
        OR
        (jv.costo_unitario IS NOT NULL AND p.costo_unitario_referencia IS DISTINCT FROM jv.costo_unitario)
      );

    SELECT count(DISTINCT h.producto_id) INTO v_history_rows
    FROM public.productos_valores_historial h
    JOIN public.turno_jornada_valores_correcciones jv
      ON jv.producto_id = h.producto_id
     AND jv.turno_sesion_id = v_session_id
     AND jv.vigente
    WHERE h.turno_sesion_id = v_session_id
      AND h.origen = 'JORNADA_CORRECTION';

    IF v_history_rows <> v_expected THEN
      RAISE EXCEPTION 'La promoción inicial registró % valores de producto, pero se esperaban %.',v_history_rows,v_expected;
    END IF;
  END IF;
END;
$backfill$;

-- Make every future historical correction update the product-wide current values
-- in the same transaction, while retaining the existing per-Jornada audit row.
DO $patch_historical_writer$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_ajustar_valores_producto_jornada(uuid,jsonb,text)'::regprocedure)
  INTO v_definition;

  v_old := $old$    ) VALUES(v_s.id,v_product_id,v_old_price,v_old_cost,v_price,v_cost,btrim(p_comentario),auth.uid());
    v_after:=v_after||jsonb_build_array(jsonb_build_object($old$;
  v_new := $new$    ) VALUES(v_s.id,v_product_id,v_old_price,v_old_cost,v_price,v_cost,btrim(p_comentario),auth.uid());
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
    v_after:=v_after||jsonb_build_array(jsonb_build_object($new$;

  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected historical writer product-persistence insertion point not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  RETURN jsonb_build_object('ok',true,'productos_ajustados',v_count,'catalogo_modificado',false);$old$;
  v_new := $new$  RETURN jsonb_build_object(
    'ok',true,
    'productos_ajustados',v_count,
    'catalogo_modificado',EXISTS(
      SELECT 1 FROM jsonb_array_elements(v_after) x(value)
      WHERE nullif(x.value->>'precio_venta_unitario','') IS NOT NULL
    ),
    'precios_venta_persistidos',(
      SELECT count(*) FROM jsonb_array_elements(v_after) x(value)
      WHERE nullif(x.value->>'precio_venta_unitario','') IS NOT NULL
    ),
    'costos_unitarios_persistidos',(
      SELECT count(*) FROM jsonb_array_elements(v_after) x(value)
      WHERE nullif(x.value->>'costo_unitario','') IS NOT NULL
    ),
    'valores_producto_persistidos',true
  );$new$;

  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected historical writer response contract not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END;
$patch_historical_writer$;

-- Sale prices are read as-of the Jornada's first immutable inventory cut.
-- This is what prevents a later product-wide correction rewriting old sales.
DO $patch_sales_liquidation$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure)
  INTO v_definition;

  v_old := $old$WHEN coalesce(p.precio_normal,0)>0 THEN p.precio_normal$old$;
  v_new := $new$WHEN coalesce(persistent_values.precio_venta_unitario,0)>0 THEN persistent_values.precio_venta_unitario
        WHEN coalesce(p.precio_normal,0)>0 THEN p.precio_normal$new$;
  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected liquidation product-price expression not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$WHEN coalesce(p.precio_normal,0)>0 THEN 'PRECIO_FAMILIA'$old$;
  v_new := $new$WHEN coalesce(persistent_values.precio_venta_unitario,0)>0 THEN 'PRECIO_PRODUCTO_VIGENTE'
        WHEN coalesce(p.precio_normal,0)>0 THEN 'PRECIO_FAMILIA'$new$;
  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected liquidation product-price source expression not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$    LEFT JOIN public.productos ch ON ch.producto_padre_id=p.id AND ch.activo=true$old$;
  v_new := $new$    LEFT JOIN LATERAL (
      SELECT h.precio_venta_unitario
      FROM public.productos_valores_historial h
      WHERE h.producto_id=p.id
        AND h.effective_at <= coalesce(v_initial.confirmado_en,v_start_at,now())
      ORDER BY h.effective_at DESC,h.creado_en DESC,h.id DESC
      LIMIT 1
    ) persistent_values ON true
    LEFT JOIN public.productos ch ON ch.producto_padre_id=p.id AND ch.activo=true
    LEFT JOIN LATERAL (
      SELECT h.precio_venta_unitario
      FROM public.productos_valores_historial h
      WHERE h.producto_id=ch.id
        AND h.effective_at <= coalesce(v_initial.confirmado_en,v_start_at,now())
      ORDER BY h.effective_at DESC,h.creado_en DESC,h.id DESC
      LIMIT 1
    ) child_persistent_values ON true$new$;
  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected liquidation variant-price join insertion point not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$count(ch.precio_normal)$old$;
  v_new := $new$count(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))$new$;
  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected liquidation variant-price count expression not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$min(ch.precio_normal)$old$;
  v_new := $new$min(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))$new$;
  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected liquidation variant-price minimum expression not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$max(ch.precio_normal)$old$;
  v_new := $new$max(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))$new$;
  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected liquidation variant-price maximum expression not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$GROUP BY p.id,p.nombre,p.unidad,p.precio_normal,historical_price.precio_venta_unitario$old$;
  v_new := $new$GROUP BY p.id,p.nombre,p.unidad,p.precio_normal,
      historical_price.precio_venta_unitario,persistent_values.precio_venta_unitario$new$;
  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected liquidation price-history group by not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END;
$patch_sales_liquidation$;

-- Cost references are resolved as-of the immutable final inventory cut and
-- are product-wide. Session-only historical overrides retain highest priority;
-- lot weighted costs remain the fallback when no persistent correction exists.
DO $patch_review_costs$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_obtener_revision_jornada(uuid)'::regprocedure)
  INTO v_definition;

  v_old := $old$'costo_lote_unitario',c.costo_unitario,
        'costo_corregido_jornada',jv.costo_unitario,
        'costo_unitario_estimado',coalesce(jv.costo_unitario,c.costo_unitario),
        'estado_costo',CASE WHEN jv.costo_unitario IS NOT NULL THEN 'COSTO_CORREGIDO_JORNADA' WHEN c.costo_unitario IS NULL THEN 'SIN_COSTO_COMPROBADO' ELSE 'COSTO_PROMEDIO_PONDERADO_LOTES' END,$old$;
  v_new := $new$'costo_lote_unitario',c.costo_unitario,
        'costo_corregido_jornada',jv.costo_unitario,
        'costo_referencia_producto',persistent_values.costo_unitario,
        'costo_unitario_estimado',coalesce(jv.costo_unitario,persistent_values.costo_unitario,c.costo_unitario),
        'estado_costo',CASE WHEN jv.costo_unitario IS NOT NULL THEN 'COSTO_CORREGIDO_JORNADA' WHEN persistent_values.costo_unitario IS NOT NULL THEN 'COSTO_PERSISTENTE_PRODUCTO' WHEN c.costo_unitario IS NULL THEN 'SIN_COSTO_COMPROBADO' ELSE 'COSTO_PROMEDIO_PONDERADO_LOTES' END,$new$;
  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected Owner review persistent-cost projection not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$coalesce(jv.costo_unitario,c.costo_unitario)$old$;
  v_new := $new$coalesce(jv.costo_unitario,persistent_values.costo_unitario,c.costo_unitario)$new$;
  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected Owner review gross-profit cost expressions not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$    ) c ON true
    LEFT JOIN public.turno_jornada_valores_correcciones jv$old$;
  v_new := $new$    ) c ON true
    LEFT JOIN LATERAL (
      SELECT h.costo_unitario
      FROM public.productos_valores_historial h
      WHERE h.producto_id=(x.value->>'producto_id')::uuid
        AND h.costo_unitario IS NOT NULL
        AND h.effective_at <= coalesce(v_final.confirmado_en,now())
      ORDER BY h.effective_at DESC,h.creado_en DESC,h.id DESC
      LIMIT 1
    ) persistent_values ON true
    LEFT JOIN public.turno_jornada_valores_correcciones jv$new$;
  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected Owner review lot-cost join insertion point not found.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END;
$patch_review_costs$;

COMMIT;
