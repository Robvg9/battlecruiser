BEGIN;

CREATE TABLE IF NOT EXISTS public.turno_jornada_rectificaciones_post_cierre (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id uuid NOT NULL REFERENCES public.turnos(id) ON DELETE RESTRICT,
  turno_sesion_id uuid NOT NULL REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  cantidad_vendida numeric NOT NULL CHECK (cantidad_vendida >= 0),
  tramos_precio jsonb NOT NULL CHECK (
    jsonb_typeof(tramos_precio) = 'array'
    AND jsonb_array_length(tramos_precio) > 0
  ),
  precio_promedio numeric NOT NULL CHECK (precio_promedio >= 0),
  importe_total numeric NOT NULL CHECK (importe_total >= 0),
  estado_anterior jsonb NOT NULL,
  estado_corregido jsonb NOT NULL,
  comentario text NOT NULL CHECK (length(trim(comentario)) >= 5),
  fuente_documental text NOT NULL,
  fuente_content_hash text NOT NULL,
  idempotency_key uuid NOT NULL,
  creado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (turno_sesion_id, producto_id, version),
  UNIQUE (idempotency_key, producto_id)
);

CREATE INDEX IF NOT EXISTS turno_jornada_rect_post_cierre_latest_idx
  ON public.turno_jornada_rectificaciones_post_cierre
  (turno_sesion_id, producto_id, version DESC);

CREATE INDEX IF NOT EXISTS turno_jornada_rect_post_cierre_turno_idx
  ON public.turno_jornada_rectificaciones_post_cierre (turno_id);
CREATE INDEX IF NOT EXISTS turno_jornada_rect_post_cierre_producto_idx
  ON public.turno_jornada_rectificaciones_post_cierre (producto_id);
CREATE INDEX IF NOT EXISTS turno_jornada_rect_post_cierre_actor_idx
  ON public.turno_jornada_rectificaciones_post_cierre (creado_por);

ALTER TABLE public.turno_jornada_rectificaciones_post_cierre ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.turno_jornada_rectificaciones_post_cierre FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bc7_bloquear_mutacion_rectificacion_post_cierre()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'Las rectificaciones posteriores al cierre son inmutables. Registra una nueva versión mediante la RPC auditada.'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS turno_jornada_rect_post_cierre_immutable
  ON public.turno_jornada_rectificaciones_post_cierre;
CREATE TRIGGER turno_jornada_rect_post_cierre_immutable
  BEFORE UPDATE OR DELETE ON public.turno_jornada_rectificaciones_post_cierre
  FOR EACH ROW EXECUTE FUNCTION public.bc7_bloquear_mutacion_rectificacion_post_cierre();

CREATE OR REPLACE FUNCTION public.bc7_registrar_rectificacion_post_cierre_jornada(
  p_turno_sesion_id uuid,
  p_rectificaciones jsonb,
  p_comentario text,
  p_fuente_documental text,
  p_fuente_content_hash text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s record;
  v_liq jsonb;
  v_before jsonb;
  v_item jsonb;
  v_producto_id uuid;
  v_vendida numeric;
  v_tramo_sum numeric;
  v_importe numeric;
  v_promedio numeric;
  v_version integer;
  v_tramos jsonb;
  v_original jsonb;
  v_inserted jsonb := '[]'::jsonb;
  v_existing jsonb;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede registrar una rectificación posterior al cierre.'
      USING ERRCODE = '42501';
  END IF;
  IF p_turno_sesion_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'La sesión y la clave de idempotencia son obligatorias.'
      USING ERRCODE = '22023';
  END IF;
  IF p_rectificaciones IS NULL
     OR jsonb_typeof(p_rectificaciones) <> 'array'
     OR jsonb_array_length(p_rectificaciones) = 0
     OR jsonb_array_length(p_rectificaciones) > 50 THEN
    RAISE EXCEPTION 'Envía entre 1 y 50 productos para rectificar.'
      USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(p_comentario,''))) < 5 OR length(p_comentario) > 1000 THEN
    RAISE EXCEPTION 'Explica el motivo de la rectificación (5–1000 caracteres).'
      USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(p_fuente_documental,''))) = 0
     OR length(p_fuente_documental) > 300
     OR length(trim(coalesce(p_fuente_content_hash,''))) = 0
     OR length(p_fuente_content_hash) > 200 THEN
    RAISE EXCEPTION 'La fuente documental y su identificador de integridad son obligatorios.'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rectificaciones) x(value)
    WHERE jsonb_typeof(x.value) <> 'object'
       OR coalesce(x.value->>'producto_id','') !~* '^[0-9a-f-]{36}$'
       OR jsonb_typeof(x.value->'tramos') IS DISTINCT FROM 'array'
       OR jsonb_array_length(coalesce(x.value->'tramos','[]'::jsonb)) < 1
       OR jsonb_array_length(coalesce(x.value->'tramos','[]'::jsonb)) > 30
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(coalesce(x.value->'tramos','[]'::jsonb)) t(value)
         WHERE jsonb_typeof(t.value) <> 'object'
            OR coalesce(t.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,4})?|[.][0-9]{1,4})$'
            OR coalesce(t.value->>'precio_unitario','') !~ '^([0-9]+([.][0-9]{1,4})?|[.][0-9]{1,4})$'
            OR (t.value->>'cantidad')::numeric <= 0
            OR (t.value->>'precio_unitario')::numeric <= 0
       )
  ) THEN
    RAISE EXCEPTION 'Cada producto requiere tramos con cantidades y precios positivos válidos.'
      USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_rectificaciones))
     <> (SELECT count(DISTINCT (x.value->>'producto_id')::uuid)
         FROM jsonb_array_elements(p_rectificaciones) x(value)) THEN
    RAISE EXCEPTION 'No repitas el mismo producto en una solicitud.'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    s.id, s.turno_id, s.almacen_id, s.jornada_programacion_id, s.estado,
    coalesce(t.estado_maestro,t.estado) AS estado_maestro
  INTO v_s
  FROM public.turno_sesiones s
  JOIN public.turnos t ON t.id = s.turno_id
  WHERE s.id = p_turno_sesion_id AND s.bloque = 'JORNADA'
  FOR UPDATE OF s, t;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La sesión de jornada no existe.'
      USING ERRCODE = '23503';
  END IF;
  IF v_s.estado <> 'COMPLETADA' OR v_s.estado_maestro <> 'CERRADO' THEN
    RAISE EXCEPTION 'La rectificación post-cierre solo aplica a una Jornada completada dentro de un Turno cerrado.'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id = v_s.id
      AND c.tipo = 'FINAL'
      AND c.estado = 'CONFIRMADO'
  ) THEN
    RAISE EXCEPTION 'No se puede rectificar un cierre sin inventario final confirmado.'
      USING ERRCODE = '23514';
  END IF;

  -- Repeated requests with the same idempotency key return the existing audit rows.
  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_rectificaciones_post_cierre r
    WHERE r.idempotency_key = p_idempotency_key
  ) THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'producto_id',r.producto_id,'version',r.version,
      'cantidad_vendida',r.cantidad_vendida,'tramos',r.tramos_precio,
      'precio_promedio',r.precio_promedio,'importe_total',r.importe_total,
      'fuente_documental',r.fuente_documental,'creado_en',r.creado_en
    ) ORDER BY r.producto_id),'[]'::jsonb)
    INTO v_existing
    FROM public.turno_jornada_rectificaciones_post_cierre r
    WHERE r.turno_sesion_id = v_s.id
      AND r.idempotency_key = p_idempotency_key;
    IF jsonb_array_length(coalesce(v_existing,'[]'::jsonb)) <> jsonb_array_length(p_rectificaciones) THEN
      RAISE EXCEPTION 'La clave de idempotencia ya fue usada con un conjunto distinto de rectificaciones.'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('ok',true,'repetida',true,'rectificaciones',v_existing);
  END IF;

  v_liq := public.bc7_liquidacion_inventario_jornada(v_s.id);
  IF coalesce((v_liq->>'faltan_cortes')::boolean,true) THEN
    RAISE EXCEPTION 'La liquidación base no tiene los dos cortes confirmados.'
      USING ERRCODE = '23514';
  END IF;
  v_before := public.bc7_obtener_revision_jornada(v_s.turno_id);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rectificaciones) LOOP
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_tramos := v_item->'tramos';

    SELECT (x.value->>'unidades_vendidas')::numeric
    INTO v_vendida
    FROM jsonb_array_elements(coalesce(v_liq->'lineas','[]'::jsonb)) x(value)
    WHERE (x.value->>'producto_id')::uuid = v_producto_id;

    IF v_vendida IS NULL OR v_vendida <= 0 THEN
      RAISE EXCEPTION 'El producto % no tiene unidades vendidas positivas comprobadas en la liquidación original.', v_producto_id
        USING ERRCODE = '23514';
    END IF;

    SELECT
      round(sum((t.value->>'cantidad')::numeric),4),
      round(sum((t.value->>'cantidad')::numeric * (t.value->>'precio_unitario')::numeric),2)
    INTO v_tramo_sum, v_importe
    FROM jsonb_array_elements(v_tramos) t(value);

    IF abs(v_tramo_sum - v_vendida) > 0.0001 THEN
      RAISE EXCEPTION 'Las cantidades de precios por tramos (%) deben sumar exactamente las unidades vendidas (%).',
        v_tramo_sum, v_vendida USING ERRCODE = '23514';
    END IF;
    v_promedio := round(v_importe / nullif(v_vendida,0),4);

    SELECT x.value
    INTO v_original
    FROM jsonb_array_elements(coalesce(v_before->'sesiones','[]'::jsonb)) s(value)
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.value->'liquidacion'->'lineas','[]'::jsonb)) x(value)
    WHERE s.value->>'id' = v_s.id::text
      AND (x.value->>'producto_id')::uuid = v_producto_id;

    IF v_original IS NULL THEN
      RAISE EXCEPTION 'No se encontró el valor previo del producto % en la revisión original.'
        , v_producto_id USING ERRCODE = '23503';
    END IF;

    SELECT coalesce(max(r.version),0) + 1
    INTO v_version
    FROM public.turno_jornada_rectificaciones_post_cierre r
    WHERE r.turno_sesion_id = v_s.id AND r.producto_id = v_producto_id;

    INSERT INTO public.turno_jornada_rectificaciones_post_cierre(
      turno_id,turno_sesion_id,producto_id,version,cantidad_vendida,
      tramos_precio,precio_promedio,importe_total,estado_anterior,estado_corregido,
      comentario,fuente_documental,fuente_content_hash,idempotency_key,creado_por
    ) VALUES (
      v_s.turno_id,v_s.id,v_producto_id,v_version,v_vendida,
      v_tramos,v_promedio,v_importe,
      jsonb_build_object(
        'precio_unitario',v_original->'precio_unitario',
        'precio_tramos',v_original->'precio_tramos',
        'importe_estimado',v_original->'importe_estimado',
        'unidades_vendidas',v_original->'unidades_vendidas'
      ),
      jsonb_build_object(
        'precio_promedio',v_promedio,'tramos',v_tramos,
        'importe_total',v_importe,'unidades_vendidas',v_vendida
      ),
      btrim(p_comentario),btrim(p_fuente_documental),btrim(p_fuente_content_hash),
      p_idempotency_key,auth.uid()
    );

    v_inserted := v_inserted || jsonb_build_array(jsonb_build_object(
      'producto_id',v_producto_id,'version',v_version,
      'cantidad_vendida',v_vendida,'tramos',v_tramos,
      'precio_promedio',v_promedio,'importe_total',v_importe,
      'estado_anterior',jsonb_build_object(
        'precio_unitario',v_original->'precio_unitario',
        'precio_tramos',v_original->'precio_tramos',
        'importe_estimado',v_original->'importe_estimado'
      ),
      'estado_corregido',jsonb_build_object(
        'precio_promedio',v_promedio,'tramos',v_tramos,'importe_total',v_importe
      )
    ));
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES (
    v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),
    'RECTIFICACION_POST_CIERRE_VENTAS_JORNADA',
    btrim(p_comentario),
    jsonb_build_object('turno_id',v_s.turno_id,'turno_sesion_id',v_s.id,'rectificaciones',v_inserted),
    jsonb_build_object('productos_rectificados',v_count,'fuente_documental',btrim(p_fuente_documental),
      'fuente_content_hash',btrim(p_fuente_content_hash),'idempotency_key',p_idempotency_key)
  );

  RETURN jsonb_build_object('ok',true,'repetida',false,'productos_rectificados',v_count,
    'turno_sesion_id',v_s.id,'turno_id',v_s.turno_id,'rectificaciones',v_inserted,
    'registros_originales_modificados',false,'catalogo_modificado',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_registrar_rectificacion_post_cierre_jornada(uuid,jsonb,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_registrar_rectificacion_post_cierre_jornada(uuid,jsonb,text,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc7_obtener_revision_jornada_rectificada(p_turno_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_report jsonb;
  v_session jsonb;
  v_liq jsonb;
  v_lines jsonb;
  v_rectifications jsonb;
  v_sessions jsonb := '[]'::jsonb;
  v_session_id uuid;
  v_missing integer;
  v_negative integer;
  v_revenue numeric;
  v_profit numeric;
  v_sales numeric;
  v_salary numeric;
  v_expected numeric;
  v_difference numeric;
  v_line_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede consultar la revisión rectificada posterior al cierre.'
      USING ERRCODE = '42501';
  END IF;

  v_report := public.bc7_obtener_revision_jornada(p_turno_id);
  FOR v_session IN
    SELECT value FROM jsonb_array_elements(coalesce(v_report->'sesiones','[]'::jsonb)) x(value)
  LOOP
    v_session_id := (v_session->>'id')::uuid;
    v_liq := coalesce(v_session->'liquidacion','{}'::jsonb);

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'producto_id',r.producto_id,'producto',p.nombre,
      'version',r.version,'cantidad_vendida',r.cantidad_vendida,
      'tramos',r.tramos_precio,'precio_promedio',r.precio_promedio,
      'importe_total',r.importe_total,'estado_anterior',r.estado_anterior,
      'estado_corregido',r.estado_corregido,'comentario',r.comentario,
      'fuente_documental',r.fuente_documental,'fuente_content_hash',r.fuente_content_hash,
      'creado_en',r.creado_en,'creado_por',r.creado_por,
      'creado_nombre',coalesce(u.nombre,'ADMIN')
    ) ORDER BY p.nombre,r.version),'[]'::jsonb)
    INTO v_rectifications
    FROM public.turno_jornada_rectificaciones_post_cierre r
    JOIN public.productos p ON p.id = r.producto_id
    LEFT JOIN public.usuarios u ON u.id = r.creado_por
    WHERE r.turno_sesion_id = v_session_id;

    SELECT coalesce(jsonb_agg(
      CASE WHEN r.id IS NULL THEN x.value
      ELSE x.value || jsonb_build_object(
        'precio_unitario',r.precio_promedio,
        'precio_corregido_jornada',r.precio_promedio,
        'precio_tramos',r.tramos_precio,
        'estado_precio','RECTIFICACION_POST_CIERRE',
        'importe_estimado',r.importe_total,
        'ganancia_bruta_estimada',CASE
          WHEN x.value->>'costo_vendido_estimado' IS NOT NULL
          THEN round(r.importe_total - (x.value->>'costo_vendido_estimado')::numeric,2)
          ELSE NULL END,
        'margen_bruto_estimado',CASE
          WHEN x.value->>'costo_vendido_estimado' IS NOT NULL AND r.importe_total <> 0
          THEN round(100*(r.importe_total-(x.value->>'costo_vendido_estimado')::numeric)/r.importe_total,2)
          ELSE NULL END,
        'rectificacion_post_cierre_id',r.id,
        'rectificacion_post_cierre_version',r.version
      ) END
      ORDER BY x.value->>'nombre'
    ),'[]'::jsonb)
    INTO v_lines
    FROM jsonb_array_elements(coalesce(v_liq->'lineas','[]'::jsonb)) x(value)
    LEFT JOIN LATERAL (
      SELECT r.id,r.tramos_precio,r.precio_promedio,r.importe_total,r.version
      FROM public.turno_jornada_rectificaciones_post_cierre r
      WHERE r.turno_sesion_id = v_session_id
        AND r.producto_id = (x.value->>'producto_id')::uuid
      ORDER BY r.version DESC,r.creado_en DESC
      LIMIT 1
    ) r ON true;

    SELECT
      count(*) FILTER (WHERE coalesce((x.value->>'unidades_vendidas')::numeric,0)>0
        AND x.value->>'importe_estimado' IS NULL),
      count(*) FILTER (WHERE coalesce((x.value->>'unidades_vendidas')::numeric,0)<0),
      round(coalesce(sum((x.value->>'importe_estimado')::numeric),0),2),
      round(coalesce(sum((x.value->>'ganancia_bruta_estimada')::numeric)
        FILTER (WHERE x.value->>'ganancia_bruta_estimada' IS NOT NULL),0),2),
      count(*)
    INTO v_missing,v_negative,v_revenue,v_profit,v_line_count
    FROM jsonb_array_elements(coalesce(v_lines,'[]'::jsonb)) x(value);

    IF coalesce((v_liq->>'faltan_cortes')::boolean,true)=false
       AND coalesce(v_missing,0)=0
       AND coalesce(v_negative,0)=0
       AND coalesce((v_liq->>'movimientos_posteriores_pendientes')::integer,0)=0
       AND v_line_count>0 THEN
      v_sales := v_revenue;
    ELSE
      v_sales := NULL;
    END IF;

    v_salary := CASE
      WHEN v_sales IS NOT NULL AND v_liq->>'salario_porcentaje' IS NOT NULL
      THEN round(v_sales*(v_liq->>'salario_porcentaje')::numeric/100,2)
      ELSE NULL END;
    v_expected := CASE
      WHEN v_sales IS NOT NULL
      THEN round(v_sales-coalesce((v_liq->>'gastos_aprobados')::numeric,0)
        -coalesce((v_liq->>'reinversiones_aprobadas')::numeric,0),2)
      ELSE NULL END;
    v_difference := CASE
      WHEN v_expected IS NOT NULL AND v_liq->>'dinero_recogido_total' IS NOT NULL
      THEN round((v_liq->>'dinero_recogido_total')::numeric-v_expected,2)
      ELSE NULL END;

    v_liq := v_liq || jsonb_build_object(
      'lineas',coalesce(v_lines,'[]'::jsonb),
      'rectificaciones_post_cierre',coalesce(v_rectifications,'[]'::jsonb),
      'rectificacion_post_cierre_aplicada',jsonb_array_length(coalesce(v_rectifications,'[]'::jsonb))>0,
      'ventas_estimadas',v_sales,
      'salario_calculado',v_salary,
      'efectivo_esperado_despues_de_gastos_reinversiones',v_expected,
      'efectivo_esperado_despues_de_gastos_reinversiones_salario',v_expected,
      'formula_efectivo','Ventas rectificadas - gastos aprobados - reinversiones aprobadas. El salario se acumula y paga por separado.',
      'diferencia',v_difference,
      'familias_sin_precio',coalesce(v_missing,0),
      'productos_vendidos_con_precio_faltante',coalesce(v_missing,0),
      'ganancia_bruta_parcial',v_profit,
      'rectificacion_post_cierre_fuente','Noviembre-09-10-Sheyla.xlsx'
    );

    v_sessions := v_sessions || jsonb_build_array(
      v_session || jsonb_build_object('liquidacion',v_liq)
    );
  END LOOP;

  RETURN v_report || jsonb_build_object('sesiones',v_sessions);
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_obtener_revision_jornada_rectificada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_obtener_revision_jornada_rectificada(uuid) TO authenticated;

COMMIT;
