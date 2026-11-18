-- Preserve every product already captured in a retroactive opening snapshot,
-- even when its catalogue row was created after the historical period cutoff.
-- Also provide a narrowly scoped, Owner-only repair that appends missing zero-
-- or positive-count rows without rewriting the confirmed quantities or stock.

CREATE OR REPLACE FUNCTION public.bc7_jornada_productos_corte(
  p_turno_sesion_id uuid,
  p_tipo text
)
RETURNS TABLE(producto_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_cutoff timestamptz;
  v_timezone text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF upper(coalesce(p_tipo,'')) NOT IN ('INICIAL','FINAL') THEN
    RAISE EXCEPTION 'Tipo de inventario inválido.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id;

  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde al modelo de jornada única.' USING ERRCODE='23503';
  END IF;

  SELECT * INTO v_p
  FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programación no encontrada.' USING ERRCODE='23503';
  END IF;

  v_timezone:=coalesce(nullif(v_p.zona_horaria,''),'America/Havana');
  v_cutoff:=((coalesce(v_p.fecha_fin,v_p.fecha)+1)::timestamp AT TIME ZONE v_timezone);

  IF upper(p_tipo)='INICIAL' THEN
    RETURN QUERY
    WITH expected AS (
      -- Catalogue products that existed before the historical period ended.
      SELECT p.id AS producto_id
      FROM public.productos p
      WHERE p.activo=true
        AND p.archivado_at IS NULL
        AND p.producto_padre_id IS NULL
        AND p.created_at<v_cutoff

      UNION

      -- Preserve any root product that was physically recorded in the
      -- already-confirmed opening snapshot, even if the catalogue row was
      -- created later during retrospective data entry.
      SELECT l.producto_id
      FROM public.turno_jornada_inventario_cortes c
      JOIN public.turno_jornada_inventario_lineas l ON l.corte_id=c.id
      JOIN public.productos captured ON captured.id=l.producto_id
      WHERE c.turno_sesion_id=v_s.id
        AND c.tipo='INICIAL'
        AND captured.producto_padre_id IS NULL
    )
    SELECT e.producto_id
    FROM expected e
    ORDER BY e.producto_id;
    RETURN;
  END IF;

  RETURN QUERY
  WITH expected AS (
    SELECT DISTINCT l.producto_id
    FROM public.turno_jornada_inventario_cortes c
    JOIN public.turno_jornada_inventario_lineas l ON l.corte_id=c.id
    JOIN public.productos root ON root.id=l.producto_id
    WHERE c.turno_sesion_id=v_s.id
      AND c.tipo='INICIAL'
      AND root.producto_padre_id IS NULL

    UNION

    SELECT DISTINCT coalesce(p.producto_padre_id,p.id)
    FROM public.stock s
    JOIN public.productos p ON p.id=s.producto_id
    JOIN public.productos root ON root.id=coalesce(p.producto_padre_id,p.id)
    WHERE s.almacen_id=v_s.almacen_id
      AND p.activo=true
      AND root.activo=true
      AND root.archivado_at IS NULL
      AND root.producto_padre_id IS NULL
      AND root.created_at<v_cutoff

    UNION

    SELECT DISTINCT coalesce(p.producto_padre_id,p.id)
    FROM public.reinversiones r
    JOIN public.reinversiones_lineas rl ON rl.reinversion_id=r.id
    JOIN public.productos p ON p.id=rl.producto_id
    JOIN public.productos root ON root.id=coalesce(p.producto_padre_id,p.id)
    WHERE r.turno_sesion_id=v_s.id
      AND r.estado='APROBADA'
      AND root.producto_padre_id IS NULL

    UNION

    SELECT DISTINCT coalesce(p.producto_padre_id,p.id)
    FROM public.transferencias t
    JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
    JOIN public.productos p ON p.id=tl.producto_id
    JOIN public.productos root ON root.id=coalesce(p.producto_padre_id,p.id)
    WHERE t.almacen_destino_id=v_s.almacen_id
      AND lower(t.estado)='completada'
      AND t.fecha>=v_cutoff
      AND t.fecha<=now()
      AND NOT EXISTS (
        SELECT 1
        FROM public.turno_jornada_entradas_vinculadas linked
        WHERE linked.transferencia_id=t.id
          AND linked.turno_sesion_id<>v_s.id
      )
      AND root.producto_padre_id IS NULL
  )
  SELECT e.producto_id
  FROM expected e
  ORDER BY e.producto_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_jornada_productos_corte(uuid,text)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bc7_completar_lineas_inicial_jornada(
  p_turno_sesion_id uuid,
  p_lineas jsonb,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_cut public.turno_jornada_inventario_cortes;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_system_stock numeric;
  v_added integer:=0;
  v_changes jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede completar líneas de un inventario histórico.'
      USING ERRCODE='42501';
  END IF;

  IF p_lineas IS NULL
     OR jsonb_typeof(p_lineas)<>'array'
     OR jsonb_array_length(p_lineas)=0
     OR jsonb_array_length(p_lineas)>200 THEN
    RAISE EXCEPTION 'Envía entre 1 y 200 líneas de productos ausentes.'
      USING ERRCODE='22023';
  END IF;

  IF length(btrim(coalesce(p_motivo,'')))<5 OR length(p_motivo)>500 THEN
    RAISE EXCEPTION 'Indica la fuente documental de la corrección (5–500 caracteres).'
      USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_lineas) x(value)
    WHERE jsonb_typeof(x.value)<>'object'
       OR coalesce(x.value->>'producto_id','') !~* '^[0-9a-f-]{36}$'
       OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
  ) THEN
    RAISE EXCEPTION 'Cada línea requiere producto_id y cantidad no negativa con hasta 3 decimales.'
      USING ERRCODE='22023';
  END IF;

  IF (
    SELECT count(*)
    FROM jsonb_array_elements(p_lineas)
  ) <> (
    SELECT count(DISTINCT (x.value->>'producto_id')::uuid)
    FROM jsonb_array_elements(p_lineas) x(value)
  ) THEN
    RAISE EXCEPTION 'No repitas el mismo producto en la regularización.'
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_s.bloque<>'JORNADA'
     OR v_s.jornada_programacion_id IS NULL
     OR v_s.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'La regularización solo aplica a una Jornada única que continúa EN_CURSO.'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.turnos t
    WHERE t.id=v_s.turno_id
      AND coalesce(t.estado_maestro,t.estado) IN ('CERRADO','CANCELADO')
  ) THEN
    RAISE EXCEPTION 'El turno maestro ya está cerrado o cancelado.'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=v_s.id
      AND c.tipo='FINAL'
  ) THEN
    RAISE EXCEPTION 'No se pueden agregar líneas iniciales después de guardar el corte final.'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_cut
  FROM public.turno_jornada_inventario_cortes c
  WHERE c.turno_sesion_id=v_s.id
    AND c.tipo='INICIAL'
    AND c.estado='CONFIRMADO'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe un corte inicial confirmado que completar.'
      USING ERRCODE='23503';
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_lineas)
  LOOP
    v_product_id:=(v_item->>'producto_id')::uuid;
    v_quantity:=(v_item->>'cantidad')::numeric;

    IF NOT EXISTS (
      SELECT 1
      FROM public.bc7_jornada_productos_corte(v_s.id,'INICIAL') expected
      WHERE expected.producto_id=v_product_id
    ) THEN
      RAISE EXCEPTION 'El producto % no pertenece al conjunto canónico del inventario inicial.'
        ,v_product_id USING ERRCODE='23503';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.turno_jornada_inventario_lineas l
      WHERE l.corte_id=v_cut.id
        AND l.producto_id=v_product_id
    ) THEN
      RAISE EXCEPTION 'El producto % ya tiene una línea en el corte inicial; no se sobrescriben cantidades.'
        ,v_product_id USING ERRCODE='23505';
    END IF;

    SELECT coalesce(s.cantidad,0)
    INTO v_system_stock
    FROM public.productos p
    LEFT JOIN public.stock s
      ON s.producto_id=p.id
     AND s.almacen_id=v_s.almacen_id
    WHERE p.id=v_product_id
      AND p.producto_padre_id IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto % no existe como producto raíz.'
        ,v_product_id USING ERRCODE='23503';
    END IF;

    INSERT INTO public.turno_jornada_inventario_lineas(
      corte_id,producto_id,cantidad_contada,stock_sistema
    ) VALUES (
      v_cut.id,v_product_id,v_quantity,coalesce(v_system_stock,0)
    );

    v_changes:=v_changes||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,
      'cantidad_contada_agregada',v_quantity,
      'stock_sistema_observado',coalesce(v_system_stock,0),
      'linea_original_modificada',false
    ));
    v_added:=v_added+1;
  END LOOP;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES (
    v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),
    'INVENTARIO_INICIAL_LINEAS_COMPLETADAS',
    btrim(p_motivo),
    jsonb_build_object(
      'sesion_id',v_s.id,
      'corte_inicial_id',v_cut.id,
      'lineas_originales_preservadas',true
    ),
    jsonb_build_object(
      'lineas_agregadas',v_added,
      'detalle',v_changes,
      'stock_global_modificado',false,
      'corte_final_modificado',false
    )
  );

  RETURN jsonb_build_object(
    'ok',true,
    'lineas_agregadas',v_added,
    'lineas_originales_preservadas',true,
    'stock_global_modificado',false,
    'corte_final_modificado',false,
    'lineas',v_changes
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_completar_lineas_inicial_jornada(uuid,jsonb,text)
  FROM PUBLIC,anon,authenticated;
