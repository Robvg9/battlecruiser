-- One atomic multi-product Baja request. Regular creators remain pending;
-- only existing global approval authority can auto-approve and consume FIFO.
BEGIN;
CREATE OR REPLACE FUNCTION public.crear_bajas_multiple(
  p_lineas jsonb,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
  v_existing integer;
  v_stock numeric;
  v_group record;
  v_line record;
  v_child_key uuid;
  v_id uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay sesión autenticada para registrar la lista de Bajas.' USING ERRCODE='42501';
  END IF;
  IF NOT public.tiene_permiso('bajas','crear') THEN
    RAISE EXCEPTION 'Sin permiso para registrar bajas' USING ERRCODE='42501';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'La clave de idempotencia de la lista es obligatoria.';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' THEN
    RAISE EXCEPTION 'La lista de Bajas debe ser un arreglo de productos.';
  END IF;
  v_count := jsonb_array_length(p_lineas);
  IF v_count < 1 OR v_count > 100 THEN
    RAISE EXCEPTION 'La lista debe contener entre 1 y 100 productos.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lineas) AS x(almacen_id uuid, producto_id uuid, cantidad numeric, motivo text)
    WHERE x.almacen_id IS NULL OR x.producto_id IS NULL
      OR x.cantidad IS NULL OR x.cantidad <= 0
      OR x.motivo IS NULL OR btrim(x.motivo) = '' OR length(btrim(x.motivo)) > 200
  ) THEN
    RAISE EXCEPTION 'Cada línea requiere almacén, producto, cantidad positiva y motivo.';
  END IF;

  -- Serialize retries for the same user/key before checking child records.
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_idempotency_key::text, 0));

  SELECT count(*) FILTER (WHERE b.id IS NOT NULL)
  INTO v_existing
  FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS item(value, ordinality)
  LEFT JOIN public.bajas b
    ON b.creado_por = auth.uid()
   AND b.idempotency_key = md5(auth.uid()::text || ':' || p_idempotency_key::text || ':' || item.ordinality::text)::uuid;

  IF v_existing = v_count THEN
    SELECT jsonb_build_object(
      'count', v_count,
      'bajas', COALESCE(jsonb_agg(jsonb_build_object('id', b.id, 'estado', b.estado) ORDER BY item.ordinality), '[]'::jsonb)
    ) INTO v_result
    FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS item(value, ordinality)
    JOIN public.bajas b
      ON b.creado_por = auth.uid()
     AND b.idempotency_key = md5(auth.uid()::text || ':' || p_idempotency_key::text || ':' || item.ordinality::text)::uuid;
    RETURN v_result;
  ELSIF v_existing > 0 THEN
    RAISE EXCEPTION 'La clave de idempotencia coincide con una lista parcial; no se creó una segunda Baja.';
  END IF;

  -- Lock and validate aggregate quantities by warehouse/product before inserting
  -- any line. A failing line aborts the entire transaction.
  FOR v_group IN
    SELECT x.almacen_id, x.producto_id, sum(x.cantidad) AS cantidad_total
    FROM jsonb_to_recordset(p_lineas) AS x(almacen_id uuid, producto_id uuid, cantidad numeric, motivo text)
    GROUP BY x.almacen_id, x.producto_id
    ORDER BY x.almacen_id, x.producto_id
  LOOP
    SELECT s.cantidad INTO v_stock
    FROM public.stock s
    WHERE s.almacen_id = v_group.almacen_id
      AND s.producto_id = v_group.producto_id
    FOR UPDATE;
    IF v_stock IS NULL OR v_stock < v_group.cantidad_total THEN
      RAISE EXCEPTION 'Stock insuficiente para completar la lista de Bajas.';
    END IF;
  END LOOP;

  FOR v_line IN
    SELECT x.almacen_id, x.producto_id, x.cantidad, x.motivo, item.ordinality
    FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS item(value, ordinality)
    CROSS JOIN LATERAL jsonb_to_record(item.value) AS x(almacen_id uuid, producto_id uuid, cantidad numeric, motivo text)
    ORDER BY item.ordinality
  LOOP
    v_child_key := md5(auth.uid()::text || ':' || p_idempotency_key::text || ':' || v_line.ordinality::text)::uuid;
    v_id := public.crear_baja(
      v_line.almacen_id, v_line.producto_id, v_line.cantidad,
      btrim(v_line.motivo), NULL, NULL, v_child_key
    );
    v_ids := array_append(v_ids, v_id);
  END LOOP;

  SELECT jsonb_build_object(
    'count', cardinality(v_ids),
    'bajas', COALESCE(jsonb_agg(jsonb_build_object('id', b.id, 'estado', b.estado) ORDER BY array_position(v_ids, b.id)), '[]'::jsonb)
  ) INTO v_result
  FROM public.bajas b
  WHERE b.id = ANY(v_ids);
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_bajas_multiple(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_bajas_multiple(jsonb, uuid) TO authenticated, service_role;
COMMIT;
