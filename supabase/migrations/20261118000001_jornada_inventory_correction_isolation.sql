-- Correct historical Jornada inventory without rewriting physical evidence.
-- 1) Add audited INITIAL overrides while keeping the original cut immutable.
-- 2) Recalculate balances from the owning jornada only; an adjacent jornada in
--    the same warehouse must never contribute its Bajas/Mermas.
-- 3) Revalidate source FINAL corrections immediately before accepting a receipt.
BEGIN;

ALTER TABLE public.turno_jornada_inventario_correcciones
  DROP CONSTRAINT IF EXISTS turno_jornada_inventario_correcciones_tipo_check;
ALTER TABLE public.turno_jornada_inventario_correcciones
  ADD CONSTRAINT turno_jornada_inventario_correcciones_tipo_check
  CHECK (tipo IN ('FINAL','INICIAL'));

CREATE OR REPLACE FUNCTION public.bc7_corregir_inventario_inicial_jornada(
  p_turno_sesion_id uuid,
  p_correcciones jsonb,
  p_comentario text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_initial public.turno_jornada_inventario_cortes;
  v_item jsonb;
  v_product_id uuid;
  v_new_qty numeric;
  v_old_qty numeric;
  v_count integer:=0;
  v_changes jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede rectificar un inventario inicial histórico.' USING ERRCODE='42501';
  END IF;
  IF p_correcciones IS NULL OR jsonb_typeof(p_correcciones)<>'array'
     OR jsonb_array_length(p_correcciones)=0 OR jsonb_array_length(p_correcciones)>200 THEN
    RAISE EXCEPTION 'Envía entre 1 y 200 correcciones de producto.' USING ERRCODE='22023';
  END IF;
  IF length(btrim(coalesce(p_comentario,'')))<5 OR length(p_comentario)>500 THEN
    RAISE EXCEPTION 'Explica el motivo de la rectificación (5–500 caracteres).' USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_correcciones) x(value)
    WHERE jsonb_typeof(x.value)<>'object'
      OR coalesce(x.value->>'producto_id','') !~* '^[0-9a-f-]{36}$'
      OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
  ) THEN
    RAISE EXCEPTION 'Producto o cantidad inválida. Usa cantidades no negativas con hasta 3 decimales.' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_correcciones))
     <> (SELECT count(DISTINCT (x.value->>'producto_id')::uuid) FROM jsonb_array_elements(p_correcciones) x(value)) THEN
    RAISE EXCEPTION 'No repitas el mismo producto en una rectificación.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'COMPLETADA' THEN
    RAISE EXCEPTION 'Solo se rectifica el inventario inicial de una jornada completada.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_initial
  FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo='INICIAL' AND estado='CONFIRMADO'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe un inventario inicial confirmado.' USING ERRCODE='23503';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_correcciones)
  LOOP
    v_product_id:=(v_item->>'producto_id')::uuid;
    v_new_qty:=(v_item->>'cantidad')::numeric;

    SELECT coalesce(c.cantidad_corregida,l.cantidad_contada)
      INTO v_old_qty
    FROM public.turno_jornada_inventario_lineas l
    LEFT JOIN public.turno_jornada_inventario_correcciones c
      ON c.turno_sesion_id=v_s.id
     AND c.tipo='INICIAL'
     AND c.producto_id=l.producto_id
     AND c.vigente
    WHERE l.corte_id=v_initial.id
      AND l.producto_id=v_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto % no pertenece al corte inicial confirmado.',v_product_id USING ERRCODE='23503';
    END IF;
    IF v_old_qty=v_new_qty THEN
      CONTINUE;
    END IF;

    UPDATE public.turno_jornada_inventario_correcciones
    SET vigente=false
    WHERE turno_sesion_id=v_s.id AND tipo='INICIAL'
      AND producto_id=v_product_id AND vigente;

    INSERT INTO public.turno_jornada_inventario_correcciones(
      turno_sesion_id,tipo,producto_id,cantidad_original,cantidad_corregida,
      comentario,creado_por
    ) VALUES(
      v_s.id,'INICIAL',v_product_id,v_old_qty,v_new_qty,btrim(p_comentario),auth.uid()
    );

    v_changes:=v_changes||jsonb_build_array(jsonb_build_object(
      'producto_id',v_product_id,
      'cantidad_original',v_old_qty,
      'cantidad_corregida',v_new_qty
    ));
    v_count:=v_count+1;
  END LOOP;

  IF v_count=0 THEN
    RAISE EXCEPTION 'No hay cantidades distintas que rectificar.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),
    'INVENTARIO_INICIAL_CORREGIDO',btrim(p_comentario),
    jsonb_build_object(
      'sesion_id',v_s.id,
      'corte_inicial_original_id',v_initial.id,
      'corte_original_conservado',true
    ),
    jsonb_build_object(
      'productos_corregidos',v_count,
      'correcciones',v_changes,
      'recepcion_original_conservada',true,
      'stock_global_modificado',false
    )
  );

  RETURN jsonb_build_object(
    'ok',true,
    'productos_corregidos',v_count,
    'corte_original_conservado',true,
    'recepcion_original_conservada',true,
    'correcciones',v_changes
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_corregir_inventario_inicial_jornada(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_corregir_inventario_inicial_jornada(uuid,jsonb,text) TO authenticated;

-- Patch the existing settlement function with guarded, exact source replacements.
DO $patch_liquidacion$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure
  ) INTO v_definition;

  v_old := $old$  WITH initial_lines AS (
    SELECT l.producto_id AS product_id,l.cantidad_contada::numeric AS qty
    FROM public.turno_jornada_inventario_lineas l
    WHERE l.corte_id=v_initial.id
  ),
  final_lines AS ($old$;
  v_new := $new$  WITH initial_lines AS (
    SELECT l.producto_id AS product_id,
      coalesce(c.cantidad_corregida,l.cantidad_contada)::numeric AS qty
    FROM public.turno_jornada_inventario_lineas l
    LEFT JOIN public.turno_jornada_inventario_correcciones c
      ON c.turno_sesion_id=v_s.id AND c.tipo='INICIAL'
      AND c.producto_id=l.producto_id AND c.vigente
    WHERE l.corte_id=v_initial.id
  ),
  final_lines AS ($new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo localizar de forma única el origen del inventario inicial en la liquidación.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$    WHERE m.almacen_id=v_s.almacen_id AND m.estado='APROBADA'
      AND ($old$;
  v_new := $new$    WHERE m.almacen_id=v_s.almacen_id AND m.estado='APROBADA'
      AND (
        m.turno_sesion_id=v_s.id
        OR EXISTS(
          SELECT 1 FROM public.turno_jornada_movimiento_revision mr
          WHERE mr.turno_sesion_id=v_s.id
            AND mr.tipo_movimiento='MERMA'
            AND mr.movimiento_id=m.id
            AND mr.clasificacion='ANTES_CORTE'
        )
      )
      AND ($new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo aislar de forma única las mermas de la jornada en la liquidación.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$    WHERE b.almacen_id=v_s.almacen_id AND b.estado='APROBADA'
      AND ($old$;
  v_new := $new$    WHERE b.almacen_id=v_s.almacen_id AND b.estado='APROBADA'
      AND (
        b.turno_sesion_id=v_s.id
        OR EXISTS(
          SELECT 1 FROM public.turno_jornada_movimiento_revision mr
          WHERE mr.turno_sesion_id=v_s.id
            AND mr.tipo_movimiento='BAJA'
            AND mr.movimiento_id=b.id
            AND mr.clasificacion='ANTES_CORTE'
        )
      )
      AND ($new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo aislar de forma única las bajas de la jornada en la liquidación.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$  price_info AS (
    SELECT p.id product_id,p.nombre,p.unidad,
      CASE
        WHEN coalesce(p.precio_normal,0)>0 THEN p.precio_normal
        WHEN count(ch.id)>0
          AND count(ch.precio_normal)=count(ch.id)
          AND min(ch.precio_normal)=max(ch.precio_normal)
          AND min(ch.precio_normal)>0 THEN min(ch.precio_normal)
        ELSE NULL
      END precio_unitario,
      CASE
        WHEN coalesce(p.precio_normal,0)>0 THEN 'PRECIO_FAMILIA'
        WHEN count(ch.id)>0
          AND count(ch.precio_normal)=count(ch.id)
          AND min(ch.precio_normal)=max(ch.precio_normal)
          AND min(ch.precio_normal)>0 THEN 'PRECIO_VARIANTES_UNIFORME'
        WHEN count(ch.id)>0 THEN 'PRECIO_VARIANTES_DIFERENTE_O_INCOMPLETO'
        ELSE 'SIN_PRECIO'
      END estado_precio
    FROM public.productos p
    LEFT JOIN public.productos ch ON ch.producto_padre_id=p.id AND ch.activo=true
    WHERE p.activo=true AND p.producto_padre_id IS NULL
    GROUP BY p.id,p.nombre,p.unidad,p.precio_normal
  ),$old$;
  v_new := $new$  price_info AS (
    SELECT p.id product_id,p.nombre,p.unidad,
      CASE
        WHEN coalesce(historical_price.precio_venta_unitario,0)>0
          THEN historical_price.precio_venta_unitario
        WHEN coalesce(p.precio_normal,0)>0 THEN p.precio_normal
        WHEN count(ch.id)>0
          AND count(ch.precio_normal)=count(ch.id)
          AND min(ch.precio_normal)=max(ch.precio_normal)
          AND min(ch.precio_normal)>0 THEN min(ch.precio_normal)
        ELSE NULL
      END precio_unitario,
      CASE
        WHEN coalesce(historical_price.precio_venta_unitario,0)>0 THEN 'PRECIO_HISTORICO_JORNADA'
        WHEN coalesce(p.precio_normal,0)>0 THEN 'PRECIO_FAMILIA'
        WHEN count(ch.id)>0
          AND count(ch.precio_normal)=count(ch.id)
          AND min(ch.precio_normal)=max(ch.precio_normal)
          AND min(ch.precio_normal)>0 THEN 'PRECIO_VARIANTES_UNIFORME'
        WHEN count(ch.id)>0 THEN 'PRECIO_VARIANTES_DIFERENTE_O_INCOMPLETO'
        ELSE 'SIN_PRECIO'
      END estado_precio
    FROM public.productos p
    LEFT JOIN LATERAL (
      SELECT correction.precio_venta_unitario
      FROM public.turno_jornada_valores_correcciones correction
      WHERE correction.turno_sesion_id=v_s.id
        AND correction.producto_id=p.id
        AND correction.vigente
      ORDER BY correction.creado_en DESC,correction.id DESC
      LIMIT 1
    ) historical_price ON true
    LEFT JOIN public.productos ch ON ch.producto_padre_id=p.id AND ch.activo=true
    WHERE p.activo=true AND p.producto_padre_id IS NULL
    GROUP BY p.id,p.nombre,p.unidad,p.precio_normal,historical_price.precio_venta_unitario
  ),$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo localizar de forma única la valoración histórica de precios en la liquidación.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old

-- Apply the same session ownership rule to the live operational balance projection.
DO $patch_saldos$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_jornada_saldos_operativos(uuid)'::regprocedure
  ) INTO v_definition;

  v_old := $old$  WITH initial_rows AS (
    SELECT
      l.producto_id,
      SUM(l.cantidad_contada)::numeric AS cantidad
    FROM public.turno_jornada_inventario_lineas l
    WHERE l.corte_id = v_initial.id
    GROUP BY l.producto_id
  ),
  movement_rows AS ($old$;
  v_new := $new$  WITH initial_rows AS (
    SELECT
      l.producto_id,
      SUM(coalesce(c.cantidad_corregida,l.cantidad_contada))::numeric AS cantidad
    FROM public.turno_jornada_inventario_lineas l
    LEFT JOIN public.turno_jornada_inventario_correcciones c
      ON c.turno_sesion_id=p_turno_sesion_id
     AND c.tipo='INICIAL'
     AND c.producto_id=l.producto_id
     AND c.vigente
    WHERE l.corte_id = v_initial.id
    GROUP BY l.producto_id
  ),
  movement_rows AS ($new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo localizar de forma única el inventario inicial del saldo operativo.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$    WHERE m.almacen_id = v_session.almacen_id
      AND m.estado = 'APROBADA'
      AND COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) > v_start_at$old$;
  v_new := $new$    WHERE m.almacen_id = v_session.almacen_id
      AND m.turno_sesion_id = p_turno_sesion_id
      AND m.estado = 'APROBADA'
      AND COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) > v_start_at$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo limitar de forma única las mermas del saldo operativo a su jornada.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$    WHERE b.almacen_id = v_session.almacen_id
      AND b.estado = 'APROBADA'
      AND COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) > v_start_at$old$;
  v_new := $new$    WHERE b.almacen_id = v_session.almacen_id
      AND b.turno_sesion_id = p_turno_sesion_id
      AND b.estado = 'APROBADA'
      AND COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) > v_start_at$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo limitar de forma única las bajas del saldo operativo a su jornada.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END;
$patch_saldos$;

-- Return corrected quantities to the inventory workspace while preserving raw counts.
DO $patch_inventario_read$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_obtener_inventario_jornada(uuid)'::regprocedure
  ) INTO v_definition;

  v_old := $old$            'producto_id',l.producto_id,'cantidad_contada',l.cantidad_contada,
            'stock_sistema',l.stock_sistema,'diferencia',l.cantidad_contada-l.stock_sistema
          ) ORDER BY p.nombre,p.id)
          FROM public.turno_jornada_inventario_lineas l
          JOIN public.productos p ON p.id=l.producto_id
          WHERE l.corte_id=c.id$old$;
  v_new := $new$            'producto_id',l.producto_id,
            'cantidad_contada',coalesce(adj.cantidad_corregida,l.cantidad_contada),
            'cantidad_original',l.cantidad_contada,
            'cantidad_corregida',adj.cantidad_corregida,
            'stock_sistema',l.stock_sistema,
            'diferencia',coalesce(adj.cantidad_corregida,l.cantidad_contada)-l.stock_sistema
          ) ORDER BY p.nombre,p.id)
          FROM public.turno_jornada_inventario_lineas l
          JOIN public.productos p ON p.id=l.producto_id
          LEFT JOIN public.turno_jornada_inventario_correcciones adj
            ON adj.turno_sesion_id=v_s.id
           AND adj.tipo=c.tipo
           AND adj.producto_id=l.producto_id
           AND adj.vigente
          WHERE l.corte_id=c.id$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo actualizar de forma única la lectura de cortes corregidos.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END;
$patch_inventario_read$;

-- Never auto-accept a physical receipt against a stale handover snapshot.
-- If the source FINAL acquired a correction after this delivery was prepared,
-- refresh the declaration, mark the handover REQUIERE_RECUENTO and return before
-- inserting a reception attempt. The UI then reloads the fresh quantities.
DO $patch_receipt_freshness$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_recibir_entrega_jornada(uuid,jsonb,text,uuid)'::regprocedure
  ) INTO v_definition;

  v_old := $old$ v_attempt integer; v_hash text; v_has_diff boolean; v_initial uuid; v_grouped boolean:=false;$old$;
  v_new := $new$ v_attempt integer; v_hash text; v_has_diff boolean; v_initial uuid; v_grouped boolean:=false;
 v_stale boolean:=false; v_synced integer:=0;$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo localizar de forma única la declaración de variables de recepción.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$ SELECT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista') INTO v_grouped;$old$;
  v_new := $new$ -- The source cut is immutable, but its effective approved correction is authoritative.
 SELECT EXISTS(
  SELECT 1
  FROM public.turno_jornada_inventario_entrega_lineas dl
  JOIN public.turno_jornada_inventario_cortes source_cut
    ON source_cut.id=v_e.origen_corte_id
   AND source_cut.tipo='FINAL'
   AND source_cut.estado='CONFIRMADO'
  JOIN public.turno_jornada_inventario_lineas source_line
    ON source_line.corte_id=source_cut.id
   AND source_line.producto_id=dl.producto_id
  LEFT JOIN public.turno_jornada_inventario_correcciones correction
    ON correction.turno_sesion_id=source_cut.turno_sesion_id
   AND correction.tipo='FINAL'
   AND correction.producto_id=source_line.producto_id
   AND correction.vigente
  WHERE dl.entrega_id=v_e.id
    AND dl.cantidad_declarada IS DISTINCT FROM coalesce(correction.cantidad_corregida,source_line.cantidad_contada)
 ) INTO v_stale;

 IF v_stale THEN
  WITH source_rows AS (
    SELECT
      dl.id AS delivery_line_id,
      coalesce(correction.cantidad_corregida,source_line.cantidad_contada) AS effective_source_qty
    FROM public.turno_jornada_inventario_entrega_lineas dl
    JOIN public.turno_jornada_inventario_cortes source_cut
      ON source_cut.id=v_e.origen_corte_id
     AND source_cut.tipo='FINAL'
     AND source_cut.estado='CONFIRMADO'
    JOIN public.turno_jornada_inventario_lineas source_line
      ON source_line.corte_id=source_cut.id
     AND source_line.producto_id=dl.producto_id
    LEFT JOIN public.turno_jornada_inventario_correcciones correction
      ON correction.turno_sesion_id=source_cut.turno_sesion_id
     AND correction.tipo='FINAL'
     AND correction.producto_id=source_line.producto_id
     AND correction.vigente
    WHERE dl.entrega_id=v_e.id
  ),
  changed AS (
    UPDATE public.turno_jornada_inventario_entrega_lineas dl
    SET cantidad_declarada=source_rows.effective_source_qty,
        cantidad_efectiva=NULL
    FROM source_rows
    WHERE dl.id=source_rows.delivery_line_id
      AND dl.cantidad_declarada IS DISTINCT FROM source_rows.effective_source_qty
    RETURNING dl.producto_id
  )
  SELECT count(*)::integer INTO v_synced FROM changed;

  UPDATE public.turno_jornada_inventario_entregas
  SET estado='REQUIERE_RECUENTO',actualizado_en=now()
  WHERE id=v_e.id;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_e.almacen_id,v_s.jornada_programacion_id,v_uid,
    'INVENTARIO_ENTREGA_REQUIERE_RECUENTO_POR_CORRECCION_ORIGEN',
    'La recepción se detuvo porque el inventario FINAL de origen fue rectificado después de preparar esta entrega.',
    jsonb_build_object('entrega_id',v_e.id,'estado_anterior',v_e.estado,
      'corte_final_origen_id',v_e.origen_corte_id),
    jsonb_build_object('entrega_id',v_e.id,'estado','REQUIERE_RECUENTO',
      'lineas_actualizadas',v_synced,'recepcion_creada',false)
  );

  RETURN jsonb_build_object(
    'id',v_e.id,
    'estado','REQUIERE_RECUENTO',
    'requiere_recuento',true,
    'lineas_actualizadas',v_synced,
    'recepcion_creada',false,
    'mensaje','El inventario FINAL de origen fue corregido. Se actualizó la entrega; vuelve a abrirla y realiza el conteo físico con las cantidades vigentes.'
  );
 END IF;

 SELECT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista') INTO v_grouped;$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo localizar de forma única el punto de validación de recepción.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END;
$patch_receipt_freshness$;

COMMIT;
formula','Inicial + entradas (transferencias/compras/reinversiones) - salidas aprobadas (transferencias/vales/mermas/bajas) - final = unidades vendidas; valoradas al precio normal.'$old$;
  v_new := $new

-- Apply the same session ownership rule to the live operational balance projection.
DO $patch_saldos$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_jornada_saldos_operativos(uuid)'::regprocedure
  ) INTO v_definition;

  v_old := $old$  WITH initial_rows AS (
    SELECT
      l.producto_id,
      SUM(l.cantidad_contada)::numeric AS cantidad
    FROM public.turno_jornada_inventario_lineas l
    WHERE l.corte_id = v_initial.id
    GROUP BY l.producto_id
  ),
  movement_rows AS ($old$;
  v_new := $new$  WITH initial_rows AS (
    SELECT
      l.producto_id,
      SUM(coalesce(c.cantidad_corregida,l.cantidad_contada))::numeric AS cantidad
    FROM public.turno_jornada_inventario_lineas l
    LEFT JOIN public.turno_jornada_inventario_correcciones c
      ON c.turno_sesion_id=p_turno_sesion_id
     AND c.tipo='INICIAL'
     AND c.producto_id=l.producto_id
     AND c.vigente
    WHERE l.corte_id = v_initial.id
    GROUP BY l.producto_id
  ),
  movement_rows AS ($new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo localizar de forma única el inventario inicial del saldo operativo.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$    WHERE m.almacen_id = v_session.almacen_id
      AND m.estado = 'APROBADA'
      AND COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) > v_start_at$old$;
  v_new := $new$    WHERE m.almacen_id = v_session.almacen_id
      AND m.turno_sesion_id = p_turno_sesion_id
      AND m.estado = 'APROBADA'
      AND COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) > v_start_at$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo limitar de forma única las mermas del saldo operativo a su jornada.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$    WHERE b.almacen_id = v_session.almacen_id
      AND b.estado = 'APROBADA'
      AND COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) > v_start_at$old$;
  v_new := $new$    WHERE b.almacen_id = v_session.almacen_id
      AND b.turno_sesion_id = p_turno_sesion_id
      AND b.estado = 'APROBADA'
      AND COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) > v_start_at$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo limitar de forma única las bajas del saldo operativo a su jornada.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END;
$patch_saldos$;

-- Return corrected quantities to the inventory workspace while preserving raw counts.
DO $patch_inventario_read$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_obtener_inventario_jornada(uuid)'::regprocedure
  ) INTO v_definition;

  v_old := $old$            'producto_id',l.producto_id,'cantidad_contada',l.cantidad_contada,
            'stock_sistema',l.stock_sistema,'diferencia',l.cantidad_contada-l.stock_sistema
          ) ORDER BY p.nombre,p.id)
          FROM public.turno_jornada_inventario_lineas l
          JOIN public.productos p ON p.id=l.producto_id
          WHERE l.corte_id=c.id$old$;
  v_new := $new$            'producto_id',l.producto_id,
            'cantidad_contada',coalesce(adj.cantidad_corregida,l.cantidad_contada),
            'cantidad_original',l.cantidad_contada,
            'cantidad_corregida',adj.cantidad_corregida,
            'stock_sistema',l.stock_sistema,
            'diferencia',coalesce(adj.cantidad_corregida,l.cantidad_contada)-l.stock_sistema
          ) ORDER BY p.nombre,p.id)
          FROM public.turno_jornada_inventario_lineas l
          JOIN public.productos p ON p.id=l.producto_id
          LEFT JOIN public.turno_jornada_inventario_correcciones adj
            ON adj.turno_sesion_id=v_s.id
           AND adj.tipo=c.tipo
           AND adj.producto_id=l.producto_id
           AND adj.vigente
          WHERE l.corte_id=c.id$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo actualizar de forma única la lectura de cortes corregidos.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END;
$patch_inventario_read$;

-- Never auto-accept a physical receipt against a stale handover snapshot.
-- If the source FINAL acquired a correction after this delivery was prepared,
-- refresh the declaration, mark the handover REQUIERE_RECUENTO and return before
-- inserting a reception attempt. The UI then reloads the fresh quantities.
DO $patch_receipt_freshness$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_recibir_entrega_jornada(uuid,jsonb,text,uuid)'::regprocedure
  ) INTO v_definition;

  v_old := $old$ v_attempt integer; v_hash text; v_has_diff boolean; v_initial uuid; v_grouped boolean:=false;$old$;
  v_new := $new$ v_attempt integer; v_hash text; v_has_diff boolean; v_initial uuid; v_grouped boolean:=false;
 v_stale boolean:=false; v_synced integer:=0;$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo localizar de forma única la declaración de variables de recepción.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$ SELECT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista') INTO v_grouped;$old$;
  v_new := $new$ -- The source cut is immutable, but its effective approved correction is authoritative.
 SELECT EXISTS(
  SELECT 1
  FROM public.turno_jornada_inventario_entrega_lineas dl
  JOIN public.turno_jornada_inventario_cortes source_cut
    ON source_cut.id=v_e.origen_corte_id
   AND source_cut.tipo='FINAL'
   AND source_cut.estado='CONFIRMADO'
  JOIN public.turno_jornada_inventario_lineas source_line
    ON source_line.corte_id=source_cut.id
   AND source_line.producto_id=dl.producto_id
  LEFT JOIN public.turno_jornada_inventario_correcciones correction
    ON correction.turno_sesion_id=source_cut.turno_sesion_id
   AND correction.tipo='FINAL'
   AND correction.producto_id=source_line.producto_id
   AND correction.vigente
  WHERE dl.entrega_id=v_e.id
    AND dl.cantidad_declarada IS DISTINCT FROM coalesce(correction.cantidad_corregida,source_line.cantidad_contada)
 ) INTO v_stale;

 IF v_stale THEN
  WITH source_rows AS (
    SELECT
      dl.id AS delivery_line_id,
      coalesce(correction.cantidad_corregida,source_line.cantidad_contada) AS effective_source_qty
    FROM public.turno_jornada_inventario_entrega_lineas dl
    JOIN public.turno_jornada_inventario_cortes source_cut
      ON source_cut.id=v_e.origen_corte_id
     AND source_cut.tipo='FINAL'
     AND source_cut.estado='CONFIRMADO'
    JOIN public.turno_jornada_inventario_lineas source_line
      ON source_line.corte_id=source_cut.id
     AND source_line.producto_id=dl.producto_id
    LEFT JOIN public.turno_jornada_inventario_correcciones correction
      ON correction.turno_sesion_id=source_cut.turno_sesion_id
     AND correction.tipo='FINAL'
     AND correction.producto_id=source_line.producto_id
     AND correction.vigente
    WHERE dl.entrega_id=v_e.id
  ),
  changed AS (
    UPDATE public.turno_jornada_inventario_entrega_lineas dl
    SET cantidad_declarada=source_rows.effective_source_qty,
        cantidad_efectiva=NULL
    FROM source_rows
    WHERE dl.id=source_rows.delivery_line_id
      AND dl.cantidad_declarada IS DISTINCT FROM source_rows.effective_source_qty
    RETURNING dl.producto_id
  )
  SELECT count(*)::integer INTO v_synced FROM changed;

  UPDATE public.turno_jornada_inventario_entregas
  SET estado='REQUIERE_RECUENTO',actualizado_en=now()
  WHERE id=v_e.id;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_e.almacen_id,v_s.jornada_programacion_id,v_uid,
    'INVENTARIO_ENTREGA_REQUIERE_RECUENTO_POR_CORRECCION_ORIGEN',
    'La recepción se detuvo porque el inventario FINAL de origen fue rectificado después de preparar esta entrega.',
    jsonb_build_object('entrega_id',v_e.id,'estado_anterior',v_e.estado,
      'corte_final_origen_id',v_e.origen_corte_id),
    jsonb_build_object('entrega_id',v_e.id,'estado','REQUIERE_RECUENTO',
      'lineas_actualizadas',v_synced,'recepcion_creada',false)
  );

  RETURN jsonb_build_object(
    'id',v_e.id,
    'estado','REQUIERE_RECUENTO',
    'requiere_recuento',true,
    'lineas_actualizadas',v_synced,
    'recepcion_creada',false,
    'mensaje','El inventario FINAL de origen fue corregido. Se actualizó la entrega; vuelve a abrirla y realiza el conteo físico con las cantidades vigentes.'
  );
 END IF;

 SELECT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista') INTO v_grouped;$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo localizar de forma única el punto de validación de recepción.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END;
$patch_receipt_freshness$;

COMMIT;
formula','Inicial + entradas (transferencias/compras/reinversiones) - salidas aprobadas (transferencias/vales/mermas/bajas) - final = unidades vendidas; valoradas al precio histórico de la jornada cuando esté registrado y, en su defecto, al precio normal del catálogo.'$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo localizar de forma única la descripción de valoración de la liquidación.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END;
$patch_liquidacion$;

-- Apply the same session ownership rule to the live operational balance projection.
DO $patch_saldos$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_jornada_saldos_operativos(uuid)'::regprocedure
  ) INTO v_definition;

  v_old := $old$  WITH initial_rows AS (
    SELECT
      l.producto_id,
      SUM(l.cantidad_contada)::numeric AS cantidad
    FROM public.turno_jornada_inventario_lineas l
    WHERE l.corte_id = v_initial.id
    GROUP BY l.producto_id
  ),
  movement_rows AS ($old$;
  v_new := $new$  WITH initial_rows AS (
    SELECT
      l.producto_id,
      SUM(coalesce(c.cantidad_corregida,l.cantidad_contada))::numeric AS cantidad
    FROM public.turno_jornada_inventario_lineas l
    LEFT JOIN public.turno_jornada_inventario_correcciones c
      ON c.turno_sesion_id=p_turno_sesion_id
     AND c.tipo='INICIAL'
     AND c.producto_id=l.producto_id
     AND c.vigente
    WHERE l.corte_id = v_initial.id
    GROUP BY l.producto_id
  ),
  movement_rows AS ($new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo localizar de forma única el inventario inicial del saldo operativo.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$    WHERE m.almacen_id = v_session.almacen_id
      AND m.estado = 'APROBADA'
      AND COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) > v_start_at$old$;
  v_new := $new$    WHERE m.almacen_id = v_session.almacen_id
      AND m.turno_sesion_id = p_turno_sesion_id
      AND m.estado = 'APROBADA'
      AND COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) > v_start_at$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo limitar de forma única las mermas del saldo operativo a su jornada.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$    WHERE b.almacen_id = v_session.almacen_id
      AND b.estado = 'APROBADA'
      AND COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) > v_start_at$old$;
  v_new := $new$    WHERE b.almacen_id = v_session.almacen_id
      AND b.turno_sesion_id = p_turno_sesion_id
      AND b.estado = 'APROBADA'
      AND COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) > v_start_at$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo limitar de forma única las bajas del saldo operativo a su jornada.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END;
$patch_saldos$;

-- Return corrected quantities to the inventory workspace while preserving raw counts.
DO $patch_inventario_read$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_obtener_inventario_jornada(uuid)'::regprocedure
  ) INTO v_definition;

  v_old := $old$            'producto_id',l.producto_id,'cantidad_contada',l.cantidad_contada,
            'stock_sistema',l.stock_sistema,'diferencia',l.cantidad_contada-l.stock_sistema
          ) ORDER BY p.nombre,p.id)
          FROM public.turno_jornada_inventario_lineas l
          JOIN public.productos p ON p.id=l.producto_id
          WHERE l.corte_id=c.id$old$;
  v_new := $new$            'producto_id',l.producto_id,
            'cantidad_contada',coalesce(adj.cantidad_corregida,l.cantidad_contada),
            'cantidad_original',l.cantidad_contada,
            'cantidad_corregida',adj.cantidad_corregida,
            'stock_sistema',l.stock_sistema,
            'diferencia',coalesce(adj.cantidad_corregida,l.cantidad_contada)-l.stock_sistema
          ) ORDER BY p.nombre,p.id)
          FROM public.turno_jornada_inventario_lineas l
          JOIN public.productos p ON p.id=l.producto_id
          LEFT JOIN public.turno_jornada_inventario_correcciones adj
            ON adj.turno_sesion_id=v_s.id
           AND adj.tipo=c.tipo
           AND adj.producto_id=l.producto_id
           AND adj.vigente
          WHERE l.corte_id=c.id$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo actualizar de forma única la lectura de cortes corregidos.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END;
$patch_inventario_read$;

-- Never auto-accept a physical receipt against a stale handover snapshot.
-- If the source FINAL acquired a correction after this delivery was prepared,
-- refresh the declaration, mark the handover REQUIERE_RECUENTO and return before
-- inserting a reception attempt. The UI then reloads the fresh quantities.
DO $patch_receipt_freshness$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_recibir_entrega_jornada(uuid,jsonb,text,uuid)'::regprocedure
  ) INTO v_definition;

  v_old := $old$ v_attempt integer; v_hash text; v_has_diff boolean; v_initial uuid; v_grouped boolean:=false;$old$;
  v_new := $new$ v_attempt integer; v_hash text; v_has_diff boolean; v_initial uuid; v_grouped boolean:=false;
 v_stale boolean:=false; v_synced integer:=0;$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo localizar de forma única la declaración de variables de recepción.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$ SELECT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista') INTO v_grouped;$old$;
  v_new := $new$ -- The source cut is immutable, but its effective approved correction is authoritative.
 SELECT EXISTS(
  SELECT 1
  FROM public.turno_jornada_inventario_entrega_lineas dl
  JOIN public.turno_jornada_inventario_cortes source_cut
    ON source_cut.id=v_e.origen_corte_id
   AND source_cut.tipo='FINAL'
   AND source_cut.estado='CONFIRMADO'
  JOIN public.turno_jornada_inventario_lineas source_line
    ON source_line.corte_id=source_cut.id
   AND source_line.producto_id=dl.producto_id
  LEFT JOIN public.turno_jornada_inventario_correcciones correction
    ON correction.turno_sesion_id=source_cut.turno_sesion_id
   AND correction.tipo='FINAL'
   AND correction.producto_id=source_line.producto_id
   AND correction.vigente
  WHERE dl.entrega_id=v_e.id
    AND dl.cantidad_declarada IS DISTINCT FROM coalesce(correction.cantidad_corregida,source_line.cantidad_contada)
 ) INTO v_stale;

 IF v_stale THEN
  WITH source_rows AS (
    SELECT
      dl.id AS delivery_line_id,
      coalesce(correction.cantidad_corregida,source_line.cantidad_contada) AS effective_source_qty
    FROM public.turno_jornada_inventario_entrega_lineas dl
    JOIN public.turno_jornada_inventario_cortes source_cut
      ON source_cut.id=v_e.origen_corte_id
     AND source_cut.tipo='FINAL'
     AND source_cut.estado='CONFIRMADO'
    JOIN public.turno_jornada_inventario_lineas source_line
      ON source_line.corte_id=source_cut.id
     AND source_line.producto_id=dl.producto_id
    LEFT JOIN public.turno_jornada_inventario_correcciones correction
      ON correction.turno_sesion_id=source_cut.turno_sesion_id
     AND correction.tipo='FINAL'
     AND correction.producto_id=source_line.producto_id
     AND correction.vigente
    WHERE dl.entrega_id=v_e.id
  ),
  changed AS (
    UPDATE public.turno_jornada_inventario_entrega_lineas dl
    SET cantidad_declarada=source_rows.effective_source_qty,
        cantidad_efectiva=NULL
    FROM source_rows
    WHERE dl.id=source_rows.delivery_line_id
      AND dl.cantidad_declarada IS DISTINCT FROM source_rows.effective_source_qty
    RETURNING dl.producto_id
  )
  SELECT count(*)::integer INTO v_synced FROM changed;

  UPDATE public.turno_jornada_inventario_entregas
  SET estado='REQUIERE_RECUENTO',actualizado_en=now()
  WHERE id=v_e.id;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_e.almacen_id,v_s.jornada_programacion_id,v_uid,
    'INVENTARIO_ENTREGA_REQUIERE_RECUENTO_POR_CORRECCION_ORIGEN',
    'La recepción se detuvo porque el inventario FINAL de origen fue rectificado después de preparar esta entrega.',
    jsonb_build_object('entrega_id',v_e.id,'estado_anterior',v_e.estado,
      'corte_final_origen_id',v_e.origen_corte_id),
    jsonb_build_object('entrega_id',v_e.id,'estado','REQUIERE_RECUENTO',
      'lineas_actualizadas',v_synced,'recepcion_creada',false)
  );

  RETURN jsonb_build_object(
    'id',v_e.id,
    'estado','REQUIERE_RECUENTO',
    'requiere_recuento',true,
    'lineas_actualizadas',v_synced,
    'recepcion_creada',false,
    'mensaje','El inventario FINAL de origen fue corregido. Se actualizó la entrega; vuelve a abrirla y realiza el conteo físico con las cantidades vigentes.'
  );
 END IF;

 SELECT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista') INTO v_grouped;$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'No se pudo localizar de forma única el punto de validación de recepción.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END;
$patch_receipt_freshness$;

COMMIT;
