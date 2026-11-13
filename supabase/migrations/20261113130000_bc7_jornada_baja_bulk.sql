BEGIN;

-- Store multiple Jornada write-offs as one atomic administrative request while
-- preserving the exact session and active work-segment provenance on every line.
CREATE OR REPLACE FUNCTION public.bc7_registrar_bajas_multiple_jornada(
  p_turno_sesion_id uuid,
  p_lineas jsonb,
  p_motivo_general text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_t public.turno_tramos;
  v_group record;
  v_line record;
  v_stock numeric;
  v_solicitud_id uuid;
  v_existing_hash text;
  v_payload_hash text;
  v_creado_nombre text;
  v_child_key uuid;
  v_baja_id uuid;
  v_result jsonb;
  v_count integer;
  v_estado_solicitud text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay una sesión autenticada para registrar la lista de Bajas.'
      USING ERRCODE='42501';
  END IF;
  IF NOT public.tiene_permiso('bajas','crear') THEN
    RAISE EXCEPTION 'Sin permiso para registrar bajas.'
      USING ERRCODE='42501';
  END IF;
  IF p_turno_sesion_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'La jornada y la referencia anti-duplicados son obligatorias.'
      USING ERRCODE='22023';
  END IF;
  IF p_motivo_general IS NULL OR btrim(p_motivo_general)='' OR length(btrim(p_motivo_general))>200 THEN
    RAISE EXCEPTION 'Escribe un motivo general válido para la lista (máximo 200 caracteres).'
      USING ERRCODE='22023';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array' THEN
    RAISE EXCEPTION 'La lista de Bajas debe contener productos.'
      USING ERRCODE='22023';
  END IF;

  v_count:=jsonb_array_length(p_lineas);
  IF v_count<1 OR v_count>100 THEN
    RAISE EXCEPTION 'La lista debe contener entre 1 y 100 productos.'
      USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1
    FROM jsonb_to_recordset(p_lineas) AS x(producto_id uuid,cantidad numeric,motivo text)
    WHERE x.producto_id IS NULL
      OR x.cantidad IS NULL OR x.cantidad<=0
      OR x.motivo IS NULL OR btrim(x.motivo)=''
      OR length(btrim(x.motivo))>200
  ) THEN
    RAISE EXCEPTION 'Cada producto necesita una cantidad positiva y un motivo válido.'
      USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT x.producto_id
    FROM jsonb_to_recordset(p_lineas) AS x(producto_id uuid)
    GROUP BY x.producto_id HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'No repitas el mismo producto. Suma sus cantidades en una sola línea.'
      USING ERRCODE='22023';
  END IF;

  v_payload_hash:=md5(p_turno_sesion_id::text||':'||btrim(p_motivo_general)||':'||p_lineas::text);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text||':'||p_idempotency_key::text,0)
  );

  -- Return the original request on an exact retry, even if the Jornada was
  -- completed after the original request committed but its response was lost.
  SELECT s.id,s.payload_hash
    INTO v_solicitud_id,v_existing_hash
  FROM public.bajas_solicitudes s
  WHERE s.creado_por=auth.uid()
    AND s.idempotency_key=p_idempotency_key
  FOR UPDATE;

  IF v_solicitud_id IS NOT NULL THEN
    IF v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'La referencia anti-duplicados ya pertenece a otra lista de Bajas.'
        USING ERRCODE='23505';
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.bajas b
      WHERE b.solicitud_id=v_solicitud_id
        AND b.turno_sesion_id IS DISTINCT FROM p_turno_sesion_id
    ) THEN
      RAISE EXCEPTION 'La lista guardada no coincide con la jornada indicada.'
        USING ERRCODE='23514';
    END IF;
    SELECT jsonb_build_object(
      'solicitud_id',s.id,
      'count',count(b.id),
      'estado',s.estado,
      'bajas',coalesce(
        jsonb_agg(jsonb_build_object('id',b.id,'estado',b.estado) ORDER BY b.creado_en,b.id)
          FILTER(WHERE b.id IS NOT NULL),
        '[]'::jsonb
      )
    )
    INTO v_result
    FROM public.bajas_solicitudes s
    LEFT JOIN public.bajas b ON b.solicitud_id=s.id
    WHERE s.id=v_solicitud_id
    GROUP BY s.id,s.estado;
    RETURN v_result;
  END IF;

  -- The helper verifies the authenticated assignee and returns the active
  -- tranche; the row lock serializes this request with Jornada closure.
  v_t:=public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);
  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'Solo se pueden registrar bajas en una Jornada EN_CURSO.'
      USING ERRCODE='23514';
  END IF;
  IF v_t.id IS NULL OR v_t.turno_sesion_id IS DISTINCT FROM v_s.id
     OR v_t.usuario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No se pudo verificar el tramo activo de esta Jornada.'
      USING ERRCODE='42501';
  END IF;

  -- Lock and validate every stock row before writing the parent or any child.
  -- This makes the multi-line request all-or-nothing when one product is short.
  FOR v_group IN
    SELECT x.producto_id,sum(x.cantidad) AS cantidad_total
    FROM jsonb_to_recordset(p_lineas) AS x(producto_id uuid,cantidad numeric)
    GROUP BY x.producto_id
    ORDER BY x.producto_id
  LOOP
    SELECT st.cantidad INTO v_stock
    FROM public.stock st
    WHERE st.almacen_id=v_s.almacen_id
      AND st.producto_id=v_group.producto_id
    FOR UPDATE;
    IF v_stock IS NULL OR v_stock<v_group.cantidad_total THEN
      RAISE EXCEPTION 'Stock insuficiente para completar la lista de Bajas. Revisa las existencias de cada producto.'
        USING ERRCODE='P0001';
    END IF;
  END LOOP;

  SELECT u.nombre INTO v_creado_nombre
  FROM public.usuarios u
  WHERE u.id=auth.uid();

  INSERT INTO public.bajas_solicitudes(
    almacen_id,creado_por,creado_nombre,motivo_general,estado,
    idempotency_key,payload_hash,total_lineas,cantidad_total
  )
  SELECT v_s.almacen_id,auth.uid(),coalesce(v_creado_nombre,''),
         btrim(p_motivo_general),'PENDIENTE',
         p_idempotency_key,v_payload_hash,v_count,sum(x.cantidad)
  FROM jsonb_to_recordset(p_lineas) AS x(producto_id uuid,cantidad numeric)
  RETURNING id INTO v_solicitud_id;

  FOR v_line IN
    SELECT x.producto_id,x.cantidad,btrim(x.motivo) AS motivo,item.ordinality
    FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS item(value,ordinality)
    CROSS JOIN LATERAL jsonb_to_record(item.value) AS x(
      producto_id uuid,cantidad numeric,motivo text
    )
    ORDER BY item.ordinality
  LOOP
    v_child_key:=md5(auth.uid()::text||':'||p_idempotency_key::text||':'||v_line.ordinality::text)::uuid;
    v_baja_id:=public.crear_baja(
      v_s.almacen_id,v_line.producto_id,v_line.cantidad,
      v_line.motivo,NULL,NULL,v_child_key
    );

    UPDATE public.bajas b
    SET solicitud_id=v_solicitud_id,
        turno_sesion_id=v_s.id,
        turno_tramo_id=v_t.id
    WHERE b.id=v_baja_id
      AND b.creado_por=auth.uid();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se pudo ligar cada producto a la lista y a su Jornada.'
        USING ERRCODE='23514';
    END IF;
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
          THEN (SELECT (array_agg(b.revisado_por) FILTER(WHERE b.revisado_por IS NOT NULL))[1]
                FROM public.bajas b WHERE b.solicitud_id=s.id)
        ELSE NULL
      END,
      revisado_nombre=CASE
        WHEN NOT EXISTS(SELECT 1 FROM public.bajas b WHERE b.solicitud_id=s.id AND b.estado='PENDIENTE')
          THEN (SELECT max(b.revisado_nombre) FROM public.bajas b WHERE b.solicitud_id=s.id)
        ELSE NULL
      END,
      fecha_revision=CASE
        WHEN NOT EXISTS(SELECT 1 FROM public.bajas b WHERE b.solicitud_id=s.id AND b.estado='PENDIENTE')
          THEN now()
        ELSE NULL
      END
  WHERE s.id=v_solicitud_id;

  SELECT estado INTO v_estado_solicitud
  FROM public.bajas_solicitudes WHERE id=v_solicitud_id;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  )
  VALUES(
    v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),'BAJA_SOLICITADA',
    btrim(p_motivo_general),
    jsonb_build_object('sesion_id',v_s.id,'tramo_id',v_t.id),
    jsonb_build_object(
      'solicitud_id',v_solicitud_id,'tipo','baja_lista',
      'productos',v_count,'estado',v_estado_solicitud
    )
  );

  SELECT jsonb_build_object(
    'solicitud_id',s.id,
    'count',count(b.id),
    'estado',s.estado,
    'bajas',coalesce(
      jsonb_agg(jsonb_build_object('id',b.id,'estado',b.estado) ORDER BY b.creado_en,b.id),
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

REVOKE ALL ON FUNCTION public.bc7_registrar_bajas_multiple_jornada(uuid,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_registrar_bajas_multiple_jornada(uuid,jsonb,text,uuid) TO authenticated,service_role;

COMMIT;
