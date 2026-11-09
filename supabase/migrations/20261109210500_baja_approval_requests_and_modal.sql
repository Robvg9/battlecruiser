-- Treat every multi-line Baja submission as one administrative approval request.
-- Child rows remain in public.bajas so stock/FIFO approval behavior stays unchanged.
-- The parent relation is private to authenticated SECURITY DEFINER RPCs.

CREATE TABLE IF NOT EXISTS public.bajas_solicitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),
  creado_por uuid NOT NULL,
  creado_nombre text,
  motivo_general text NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA')),
  idempotency_key uuid,
  payload_hash text,
  total_lineas integer NOT NULL DEFAULT 0 CHECK (total_lineas >= 0),
  cantidad_total numeric NOT NULL DEFAULT 0 CHECK (cantidad_total >= 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  revisado_por uuid,
  revisado_nombre text,
  comentario_revision text,
  fecha_revision timestamptz
);

ALTER TABLE public.bajas
  ADD COLUMN IF NOT EXISTS solicitud_id uuid
  REFERENCES public.bajas_solicitudes(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS bajas_solicitud_id_idx
  ON public.bajas(solicitud_id)
  WHERE solicitud_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bajas_solicitudes_creador_idempotency_uidx
  ON public.bajas_solicitudes(creado_por,idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.bajas_solicitudes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bajas_solicitudes FROM PUBLIC,anon,authenticated;

-- Backfill existing multi-line requests using PostgreSQL transaction_timestamp:
-- every row created by one call to crear_bajas_multiple has the exact same
-- creado_en, creator and warehouse. Do not group by a time window.
WITH grouped AS (
  SELECT
    b.creado_por,
    b.almacen_id,
    b.creado_en,
    max(b.creado_nombre) AS creado_nombre,
    CASE
      WHEN count(DISTINCT b.motivo)=1 THEN max(b.motivo)
      ELSE 'Motivos específicos por producto'
    END AS motivo_general,
    CASE
      WHEN bool_and(b.estado='APROBADA') THEN 'APROBADA'
      WHEN bool_and(b.estado='RECHAZADA') THEN 'RECHAZADA'
      ELSE 'PENDIENTE'
    END AS estado,
    count(*)::integer AS total_lineas,
    sum(b.cantidad) AS cantidad_total,
    CASE WHEN count(DISTINCT b.revisado_por)=1 THEN (array_agg(b.revisado_por) FILTER (WHERE b.revisado_por IS NOT NULL))[1] END AS revisado_por,
    CASE WHEN count(DISTINCT b.revisado_nombre)=1 THEN max(b.revisado_nombre) END AS revisado_nombre,
    CASE WHEN count(DISTINCT b.comentario_revision)=1 THEN max(b.comentario_revision) END AS comentario_revision,
    max(b.fecha_revision) AS fecha_revision
  FROM public.bajas b
  WHERE b.solicitud_id IS NULL
    AND b.creado_por IS NOT NULL
  GROUP BY b.creado_por,b.almacen_id,b.creado_en
  HAVING count(*) > 1
),
inserted AS (
  INSERT INTO public.bajas_solicitudes(
    almacen_id,creado_por,creado_nombre,motivo_general,estado,
    total_lineas,cantidad_total,creado_en,
    revisado_por,revisado_nombre,comentario_revision,fecha_revision
  )
  SELECT
    almacen_id,creado_por,creado_nombre,motivo_general,estado,
    total_lineas,cantidad_total,creado_en,
    revisado_por,revisado_nombre,comentario_revision,fecha_revision
  FROM grouped
  RETURNING id,creado_por,almacen_id,creado_en
)
UPDATE public.bajas b
SET solicitud_id=i.id
FROM inserted i
WHERE b.creado_por=i.creado_por
  AND b.almacen_id=i.almacen_id
  AND b.creado_en=i.creado_en
  AND b.solicitud_id IS NULL;

CREATE OR REPLACE FUNCTION public.crear_bajas_multiple(
  p_lineas jsonb,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_count integer;
  v_existing integer;
  v_parent_count integer;
  v_stock numeric;
  v_group record;
  v_line record;
  v_child_key uuid;
  v_id uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_result jsonb;
  v_solicitud_id uuid;
  v_payload_hash text;
  v_existing_hash text;
  v_creado_nombre text;
  v_motivo_general text;
  v_estado text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay sesión autenticada para registrar la lista de Bajas.'
      USING ERRCODE='42501';
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
    FROM jsonb_to_recordset(p_lineas) AS x(
      almacen_id uuid,producto_id uuid,cantidad numeric,motivo text,motivo_general text
    )
    WHERE x.almacen_id IS NULL OR x.producto_id IS NULL
      OR x.cantidad IS NULL OR x.cantidad <= 0
      OR x.motivo IS NULL OR btrim(x.motivo) = '' OR length(btrim(x.motivo)) > 200
      OR (x.motivo_general IS NOT NULL AND
          (btrim(x.motivo_general)='' OR length(btrim(x.motivo_general))>200))
  ) THEN
    RAISE EXCEPTION 'Cada línea requiere almacén, producto, cantidad positiva y motivo válido.';
  END IF;

  IF (
    SELECT count(DISTINCT x.almacen_id)
    FROM jsonb_to_recordset(p_lineas) AS x(almacen_id uuid)
  ) <> 1 THEN
    RAISE EXCEPTION 'Una lista de Bajas debe pertenecer a un único almacén.';
  END IF;

  v_payload_hash := md5(p_lineas::text);

  -- Serialize retries for the same user/key before reserving the parent request.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':' || p_idempotency_key::text,0)
  );

  SELECT s.id,s.payload_hash
  INTO v_solicitud_id,v_existing_hash
  FROM public.bajas_solicitudes s
  WHERE s.creado_por=auth.uid()
    AND s.idempotency_key=p_idempotency_key
  FOR UPDATE;

  IF v_solicitud_id IS NOT NULL THEN
    IF v_existing_hash IS NOT NULL AND v_existing_hash<>v_payload_hash THEN
      RAISE EXCEPTION 'La clave anti-duplicados ya pertenece a otra lista de Bajas.';
    END IF;
    SELECT jsonb_build_object(
      'solicitud_id',v_solicitud_id,
      'count',count(*),
      'estado',max(s.estado),
      'bajas',coalesce(
        jsonb_agg(jsonb_build_object('id',b.id,'estado',b.estado) ORDER BY b.creado_en,b.id),
        '[]'::jsonb
      )
    )
    INTO v_result
    FROM public.bajas b
    JOIN public.bajas_solicitudes s ON s.id=b.solicitud_id
    WHERE b.solicitud_id=v_solicitud_id;
    RETURN v_result;
  END IF;

  -- Compatibility path for a retry whose child rows predate the parent record.
  SELECT
    count(*) FILTER (WHERE b.id IS NOT NULL),
    count(DISTINCT b.solicitud_id) FILTER (WHERE b.solicitud_id IS NOT NULL),
    min(b.solicitud_id) FILTER (WHERE b.solicitud_id IS NOT NULL)
  INTO v_existing,v_parent_count,v_solicitud_id
  FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS item(value,ordinality)
  LEFT JOIN public.bajas b
    ON b.creado_por=auth.uid()
   AND b.idempotency_key=md5(auth.uid()::text||':'||p_idempotency_key::text||':'||item.ordinality::text)::uuid;

  IF v_existing=v_count THEN
    IF coalesce(v_parent_count,0)>1 THEN
      RAISE EXCEPTION 'Las líneas de esta lista aparecen asociadas a solicitudes distintas.';
    END IF;

    SELECT nombre INTO v_creado_nombre
    FROM public.usuarios WHERE id=auth.uid();

    SELECT coalesce(
      max(nullif(btrim(x.motivo_general),'')),
      CASE WHEN count(DISTINCT x.motivo)=1 THEN max(x.motivo)
           ELSE 'Motivos específicos por producto' END
    )
    INTO v_motivo_general
    FROM jsonb_to_recordset(p_lineas) AS x(
      almacen_id uuid,producto_id uuid,cantidad numeric,motivo text,motivo_general text
    );

    IF v_solicitud_id IS NULL THEN
      INSERT INTO public.bajas_solicitudes(
        almacen_id,creado_por,creado_nombre,motivo_general,estado,
        idempotency_key,payload_hash,total_lineas,cantidad_total
      )
      SELECT
        (array_agg(x.almacen_id))[1],auth.uid(),v_creado_nombre,coalesce(v_motivo_general,'Motivos específicos por producto'),
        CASE
          WHEN bool_and(b.estado='APROBADA') THEN 'APROBADA'
          WHEN bool_and(b.estado='RECHAZADA') THEN 'RECHAZADA'
          ELSE 'PENDIENTE'
        END,
        p_idempotency_key,v_payload_hash,count(*)::integer,sum(x.cantidad)
      FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS item(value,ordinality)
      CROSS JOIN LATERAL jsonb_to_record(item.value) AS x(
        almacen_id uuid,producto_id uuid,cantidad numeric,motivo text,motivo_general text
      )
      JOIN public.bajas b
        ON b.creado_por=auth.uid()
       AND b.idempotency_key=md5(auth.uid()::text||':'||p_idempotency_key::text||':'||item.ordinality::text)::uuid
      RETURNING id INTO v_solicitud_id;

      UPDATE public.bajas b
      SET solicitud_id=v_solicitud_id
      WHERE b.creado_por=auth.uid()
        AND b.idempotency_key IN (
          SELECT md5(auth.uid()::text||':'||p_idempotency_key::text||':'||item.ordinality::text)::uuid
          FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS item(value,ordinality)
        )
        AND b.solicitud_id IS NULL;
    ELSE
      UPDATE public.bajas_solicitudes
      SET idempotency_key=coalesce(idempotency_key,p_idempotency_key),
          payload_hash=coalesce(payload_hash,v_payload_hash)
      WHERE id=v_solicitud_id
        AND (idempotency_key IS NULL OR idempotency_key=p_idempotency_key);
    END IF;

    IF v_solicitud_id IS NULL THEN
      RAISE EXCEPTION 'No se pudo recuperar el encabezado de la lista de Bajas.';
    END IF;

    SELECT jsonb_build_object(
      'solicitud_id',v_solicitud_id,
      'count',count(*),
      'estado',max(s.estado),
      'bajas',coalesce(
        jsonb_agg(jsonb_build_object('id',b.id,'estado',b.estado) ORDER BY item.ordinality),
        '[]'::jsonb
      )
    )
    INTO v_result
    FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS item(value,ordinality)
    JOIN public.bajas b
      ON b.creado_por=auth.uid()
     AND b.idempotency_key=md5(auth.uid()::text||':'||p_idempotency_key::text||':'||item.ordinality::text)::uuid
    JOIN public.bajas_solicitudes s ON s.id=v_solicitud_id;
    RETURN v_result;
  ELSIF v_existing>0 THEN
    RAISE EXCEPTION 'La clave de idempotencia coincide con una lista parcial; no se creó una segunda Baja.';
  END IF;

  -- Validate aggregate quantities by warehouse/product before inserting any line.
  FOR v_group IN
    SELECT x.almacen_id,x.producto_id,sum(x.cantidad) AS cantidad_total
    FROM jsonb_to_recordset(p_lineas) AS x(
      almacen_id uuid,producto_id uuid,cantidad numeric,motivo text,motivo_general text
    )
    GROUP BY x.almacen_id,x.producto_id
    ORDER BY x.almacen_id,x.producto_id
  LOOP
    SELECT s.cantidad INTO v_stock
    FROM public.stock s
    WHERE s.almacen_id=v_group.almacen_id
      AND s.producto_id=v_group.producto_id
    FOR UPDATE;
    IF v_stock IS NULL OR v_stock<v_group.cantidad_total THEN
      RAISE EXCEPTION 'Stock insuficiente para completar la lista de Bajas.';
    END IF;
  END LOOP;

  SELECT nombre INTO v_creado_nombre
  FROM public.usuarios WHERE id=auth.uid();

  SELECT coalesce(
    max(nullif(btrim(x.motivo_general),'')),
    CASE WHEN count(DISTINCT x.motivo)=1 THEN max(x.motivo)
         ELSE 'Motivos específicos por producto' END
  )
  INTO v_motivo_general
  FROM jsonb_to_recordset(p_lineas) AS x(
    almacen_id uuid,producto_id uuid,cantidad numeric,motivo text,motivo_general text
  );

  INSERT INTO public.bajas_solicitudes(
    almacen_id,creado_por,creado_nombre,motivo_general,estado,
    idempotency_key,payload_hash,total_lineas,cantidad_total
  )
  SELECT
    (array_agg(x.almacen_id))[1],auth.uid(),v_creado_nombre,coalesce(v_motivo_general,'Motivos específicos por producto'),
    'PENDIENTE',p_idempotency_key,v_payload_hash,v_count,sum(x.cantidad)
  FROM jsonb_to_recordset(p_lineas) AS x(
    almacen_id uuid,producto_id uuid,cantidad numeric,motivo text,motivo_general text
  )
  RETURNING id INTO v_solicitud_id;

  FOR v_line IN
    SELECT x.almacen_id,x.producto_id,x.cantidad,x.motivo,item.ordinality
    FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS item(value,ordinality)
    CROSS JOIN LATERAL jsonb_to_record(item.value) AS x(
      almacen_id uuid,producto_id uuid,cantidad numeric,motivo text,motivo_general text
    )
    ORDER BY item.ordinality
  LOOP
    v_child_key:=md5(auth.uid()::text||':'||p_idempotency_key::text||':'||v_line.ordinality::text)::uuid;
    v_id:=public.crear_baja(
      v_line.almacen_id,v_line.producto_id,v_line.cantidad,
      btrim(v_line.motivo),NULL,NULL,v_child_key
    );
    UPDATE public.bajas
    SET solicitud_id=v_solicitud_id
    WHERE id=v_id AND creado_por=auth.uid();
    v_ids:=array_append(v_ids,v_id);
  END LOOP;

  UPDATE public.bajas_solicitudes s
  SET total_lineas=(SELECT count(*) FROM public.bajas b WHERE b.solicitud_id=s.id),
      cantidad_total=(SELECT coalesce(sum(b.cantidad),0) FROM public.bajas b WHERE b.solicitud_id=s.id),
      estado=CASE
        WHEN EXISTS(SELECT 1 FROM public.bajas b WHERE b.solicitud_id=s.id AND b.estado='PENDIENTE') THEN 'PENDIENTE'
        WHEN EXISTS(SELECT 1 FROM public.bajas b WHERE b.solicitud_id=s.id AND b.estado='RECHAZADA') THEN 'RECHAZADA'
        ELSE 'APROBADA'
      END,
      revisado_por=CASE
        WHEN NOT EXISTS(SELECT 1 FROM public.bajas b WHERE b.solicitud_id=s.id AND b.estado='PENDIENTE')
        THEN (SELECT max(b.revisado_por) FROM public.bajas b WHERE b.solicitud_id=s.id)
        ELSE NULL
      END,
      revisado_nombre=CASE
        WHEN NOT EXISTS(SELECT 1 FROM public.bajas b WHERE b.solicitud_id=s.id AND b.estado='PENDIENTE')
        THEN (SELECT max(b.revisado_nombre) FROM public.bajas b WHERE b.solicitud_id=s.id)
        ELSE NULL
      END,
      fecha_revision=CASE
        WHEN NOT EXISTS(SELECT 1 FROM public.bajas b WHERE b.solicitud_id=s.id AND b.estado='PENDIENTE')
        THEN now() ELSE NULL
      END
  WHERE s.id=v_solicitud_id;

  SELECT jsonb_build_object(
    'solicitud_id',v_solicitud_id,
    'count',cardinality(v_ids),
    'estado',s.estado,
    'bajas',coalesce(
      jsonb_agg(jsonb_build_object('id',b.id,'estado',b.estado) ORDER BY array_position(v_ids,b.id)),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM public.bajas_solicitudes s
  JOIN public.bajas b ON b.solicitud_id=s.id
  WHERE s.id=v_solicitud_id
  GROUP BY s.id,s.estado;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_bajas_multiple(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crear_bajas_multiple(jsonb,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.listar_aprobaciones_admin()
RETURNS TABLE(
  tipo text,
  id uuid,
  fecha timestamptz,
  usuario_nombre text,
  almacen_nombre text,
  producto_nombre text,
  resumen text,
  monto numeric,
  cantidad numeric,
  estado text,
  motivo text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF NOT (
    public.tiene_permiso('auditoria','editar_any')
    OR public.tiene_permiso('gastos','editar_any')
    OR public.tiene_permiso('mermas','editar_any')
    OR public.tiene_permiso('bajas','editar_any')
  ) THEN
    RAISE EXCEPTION 'Sin permiso para ver aprobaciones administrativas' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
    SELECT 'gasto'::text,g.id,g.creado_en,g.creado_nombre,a.nombre,NULL::text,
           g.concepto,g.monto,NULL::numeric,g.estado,g.descripcion
    FROM public.gastos g
    LEFT JOIN public.almacenes a ON a.id=g.almacen_id
    WHERE g.estado='PENDIENTE'
      AND (public.tiene_permiso('gastos','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT 'merma'::text,m.id,m.creado_en,m.creado_nombre,a.nombre,p.nombre,
           'Merma de inventario'::text,NULL::numeric,m.cantidad,m.estado,m.motivo
    FROM public.mermas m
    JOIN public.almacenes a ON a.id=m.almacen_id
    JOIN public.productos p ON p.id=m.producto_id
    WHERE m.estado='PENDIENTE'
      AND (public.tiene_permiso('mermas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    -- One row per parent request, not one row for each product in its list.
    SELECT
      'baja_lista'::text,
      s.id,
      s.creado_en,
      s.creado_nombre,
      a.nombre,
      ('Lista de bajas · '||count(b.id)||' productos')::text,
      'Solicitud agrupada de inventario'::text,
      NULL::numeric,
      sum(b.cantidad),
      'PENDIENTE'::text,
      s.motivo_general
    FROM public.bajas_solicitudes s
    JOIN public.almacenes a ON a.id=s.almacen_id
    JOIN public.bajas b ON b.solicitud_id=s.id AND b.estado='PENDIENTE'
    WHERE (public.tiene_permiso('bajas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))
    GROUP BY s.id,s.creado_en,s.creado_nombre,a.nombre,s.motivo_general

    UNION ALL

    -- Keep standalone/legacy single Baja records individually actionable.
    SELECT 'baja'::text,b.id,b.creado_en,b.creado_nombre,a.nombre,p.nombre,
           'Baja individual'::text,NULL::numeric,b.cantidad,b.estado,b.motivo
    FROM public.bajas b
    JOIN public.almacenes a ON a.id=b.almacen_id
    JOIN public.productos p ON p.id=b.producto_id
    WHERE b.estado='PENDIENTE'
      AND b.solicitud_id IS NULL
      AND (public.tiene_permiso('bajas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    ORDER BY 3 DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.listar_aprobaciones_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.listar_aprobaciones_admin() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.obtener_detalle_solicitud_baja_admin(p_solicitud_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay sesión autenticada.' USING ERRCODE='42501';
  END IF;
  IF NOT (public.tiene_permiso('bajas','editar_any') OR public.tiene_permiso('auditoria','editar_any')) THEN
    RAISE EXCEPTION 'Sin permiso para ver el detalle de esta lista de Bajas.' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'solicitud_id',s.id,
    'fecha',s.creado_en,
    'usuario_nombre',s.creado_nombre,
    'almacen_nombre',a.nombre,
    'motivo_general',s.motivo_general,
    'estado',s.estado,
    'lineas',coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',b.id,
          'producto_id',b.producto_id,
          'producto_nombre',p.nombre,
          'cantidad',b.cantidad,
          'motivo',b.motivo,
          'estado',b.estado
        )
        ORDER BY b.creado_en,b.id
      )
      FROM public.bajas b
      JOIN public.productos p ON p.id=b.producto_id
      WHERE b.solicitud_id=s.id
    ),'[]'::jsonb)
  )
  INTO v_result
  FROM public.bajas_solicitudes s
  JOIN public.almacenes a ON a.id=s.almacen_id
  WHERE s.id=p_solicitud_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'No se encontró la lista de Bajas solicitada.';
  END IF;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.obtener_detalle_solicitud_baja_admin(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.obtener_detalle_solicitud_baja_admin(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.resolver_solicitud_bajas_admin(
  p_solicitud_id uuid,
  p_decision text,
  p_comentario text DEFAULT NULL::text,
  p_lineas_reales jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_solicitud public.bajas_solicitudes%ROWTYPE;
  v_line record;
  v_nombre text;
  v_cantidad_real numeric;
  v_total integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay sesión autenticada.' USING ERRCODE='42501';
  END IF;
  IF NOT (public.tiene_permiso('bajas','editar_any') OR public.tiene_permiso('auditoria','editar_any')) THEN
    RAISE EXCEPTION 'Sin permiso para resolver listas de Bajas.' USING ERRCODE='42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('APROBAR','RECHAZAR') THEN
    RAISE EXCEPTION 'Decisión inválida.';
  END IF;
  IF p_decision='RECHAZAR' AND NULLIF(btrim(p_comentario),'') IS NULL THEN
    RAISE EXCEPTION 'El rechazo requiere un motivo.';
  END IF;
  IF p_lineas_reales IS NULL OR jsonb_typeof(p_lineas_reales)<>'array' THEN
    RAISE EXCEPTION 'Las cantidades de las líneas deben enviarse como una lista.';
  END IF;
  IF p_decision='APROBAR' AND EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lineas_reales) AS x(id uuid,cantidad_real numeric)
    WHERE x.id IS NULL OR x.cantidad_real IS NULL OR x.cantidad_real<=0
       OR NOT EXISTS (
         SELECT 1 FROM public.bajas b
         WHERE b.id=x.id AND b.solicitud_id=p_solicitud_id AND b.estado='PENDIENTE'
       )
  ) THEN
    RAISE EXCEPTION 'Una o más cantidades reales no pertenecen a esta lista o son inválidas.';
  END IF;
  IF p_decision='APROBAR' AND EXISTS (
    SELECT x.id
    FROM jsonb_to_recordset(p_lineas_reales) AS x(id uuid,cantidad_real numeric)
    GROUP BY x.id HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'Una línea de la lista aparece más de una vez.';
  END IF;

  SELECT * INTO v_solicitud
  FROM public.bajas_solicitudes
  WHERE id=p_solicitud_id
  FOR UPDATE;
  IF NOT FOUND OR v_solicitud.estado<>'PENDIENTE' THEN
    RAISE EXCEPTION 'La lista de Bajas no está pendiente o no existe.';
  END IF;

  SELECT nombre INTO v_nombre FROM public.usuarios WHERE id=auth.uid();

  FOR v_line IN
    SELECT b.id,b.cantidad
    FROM public.bajas b
    WHERE b.solicitud_id=p_solicitud_id
      AND b.estado='PENDIENTE'
    ORDER BY b.creado_en,b.id
    FOR UPDATE
  LOOP
    v_cantidad_real:=v_line.cantidad;
    IF p_decision='APROBAR' THEN
      SELECT x.cantidad_real INTO v_cantidad_real
      FROM jsonb_to_recordset(p_lineas_reales) AS x(id uuid,cantidad_real numeric)
      WHERE x.id=v_line.id
      LIMIT 1;
      v_cantidad_real:=coalesce(v_cantidad_real,v_line.cantidad);
    END IF;

    PERFORM public.resolver_aprobacion_operativa(
      'baja',v_line.id,p_decision,p_comentario,
      CASE WHEN p_decision='APROBAR' THEN v_cantidad_real ELSE NULL END,
      NULL
    );
    v_total:=v_total+1;
  END LOOP;

  IF v_total=0 THEN
    RAISE EXCEPTION 'La lista no contiene líneas pendientes para resolver.';
  END IF;

  UPDATE public.bajas_solicitudes
  SET estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
      revisado_por=auth.uid(),
      revisado_nombre=v_nombre,
      comentario_revision=NULLIF(btrim(p_comentario),''),
      fecha_revision=now()
  WHERE id=p_solicitud_id;

  RETURN jsonb_build_object(
    'ok',true,
    'solicitud_id',p_solicitud_id,
    'decision',p_decision,
    'lineas_resueltas',v_total,
    'revisado_por',v_nombre
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.resolver_solicitud_bajas_admin(uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolver_solicitud_bajas_admin(uuid,text,text,jsonb) TO authenticated,service_role;

COMMENT ON TABLE public.bajas_solicitudes IS
  'Cabecera de cada solicitud administrativa de Baja; las líneas y sus motivos viven en public.bajas.';
