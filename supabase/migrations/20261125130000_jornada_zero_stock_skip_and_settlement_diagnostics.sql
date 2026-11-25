BEGIN;

-- A product is required in FINAL only when it had non-zero physical stock at the opening,

-- has non-zero final physical stock, or has at least one attributable movement in the period.

-- Zero-opening, zero-final products with no entries/exits are omitted for this Jornada only.

CREATE OR REPLACE FUNCTION public.bc7_jornada_productos_corte(p_turno_sesion_id uuid, p_tipo text)
 RETURNS TABLE(producto_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_turno public.turnos;
  v_initial public.turno_jornada_inventario_cortes;
  v_final public.turno_jornada_inventario_cortes;
  v_cutoff timestamptz;
  v_timezone text;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_retroactive boolean:=false;
  v_is_retail boolean:=false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF upper(coalesce(p_tipo,'')) NOT IN ('INICIAL','FINAL') THEN
    RAISE EXCEPTION 'Tipo de inventario inválido.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde al modelo de jornada única.' USING ERRCODE='23503';
  END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programación no encontrada.' USING ERRCODE='23503';
  END IF;
  v_timezone:=coalesce(nullif(v_p.zona_horaria,''),'America/Havana');
  v_cutoff:=((coalesce(v_p.fecha_fin,v_p.fecha)+1)::timestamp AT TIME ZONE v_timezone);
  IF upper(p_tipo)='INICIAL' THEN
    RETURN QUERY
    SELECT p.id FROM public.productos p
    WHERE p.activo=true AND p.archivado_at IS NULL
      AND p.producto_padre_id IS NULL AND p.created_at<v_cutoff
    ORDER BY p.nombre,p.id;
    RETURN;
  END IF;

  SELECT (a.tipo='minorista') INTO v_is_retail
  FROM public.almacenes a WHERE a.id=v_s.almacen_id;
  v_retroactive:=coalesce(v_s.apertura_retroactiva,false);
  SELECT * INTO v_turno FROM public.turnos WHERE id=v_s.turno_id;
  SELECT * INTO v_initial FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo='INICIAL' AND estado='CONFIRMADO';
  SELECT * INTO v_final FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo='FINAL' AND estado='CONFIRMADO';
  v_start_at:=CASE
    WHEN v_retroactive AND v_initial.origen_corte_id IS NOT NULL THEN coalesce(
      (
        SELECT coalesce(
          source_session.corte_operativo_at,
          (
            SELECT max(source_tramo.fin_at)
            FROM public.turno_tramos source_tramo
            WHERE source_tramo.turno_sesion_id=source_session.id
              AND source_tramo.fin_at IS NOT NULL
          ),
          source_cut.confirmado_en
        )
        FROM public.turno_jornada_inventario_cortes source_cut
        JOIN public.turno_sesiones source_session
          ON source_session.id=source_cut.turno_sesion_id
        WHERE source_cut.id=v_initial.origen_corte_id
          AND source_cut.tipo='FINAL'
          AND source_cut.estado='CONFIRMADO'
          AND source_cut.corte_sucesora_origen_id=v_initial.id
      ),
      v_initial.confirmado_en,v_initial.creado_en,v_turno.apertura_real
    )
    ELSE coalesce(v_initial.confirmado_en,v_initial.creado_en,v_turno.apertura_real)
  END;
  v_end_at:=CASE
    WHEN v_s.estado='CERRADA_OPERATIVAMENTE' AND v_s.corte_operativo_at IS NOT NULL
      THEN v_s.corte_operativo_at
    ELSE coalesce(v_final.confirmado_en,v_final.creado_en,now())
  END;

  RETURN QUERY
  WITH expected AS (
    SELECT period_products.producto_id
    FROM public.bc7_jornada_productos_corte(v_s.id,'INICIAL') period_products
    UNION
    SELECT DISTINCT l.producto_id
    FROM public.turno_jornada_inventario_cortes c
    JOIN public.turno_jornada_inventario_lineas l ON l.corte_id=c.id
    JOIN public.productos root ON root.id=l.producto_id
    WHERE c.turno_sesion_id=v_s.id AND c.tipo='INICIAL'
      AND root.producto_padre_id IS NULL
    UNION
    SELECT DISTINCT coalesce(p.producto_padre_id,p.id)
    FROM public.stock s
    JOIN public.productos p ON p.id=s.producto_id
    JOIN public.productos root ON root.id=coalesce(p.producto_padre_id,p.id)
    WHERE s.almacen_id=v_s.almacen_id AND p.activo=true
      AND root.activo=true AND root.archivado_at IS NULL
      AND root.producto_padre_id IS NULL AND root.created_at<v_cutoff
    UNION
    SELECT DISTINCT coalesce(p.producto_padre_id,p.id)
    FROM public.reinversiones r
    JOIN public.reinversiones_lineas rl ON rl.reinversion_id=r.id
    JOIN public.productos p ON p.id=rl.producto_id
    JOIN public.productos root ON root.id=coalesce(p.producto_padre_id,p.id)
    WHERE r.turno_sesion_id=v_s.id AND r.estado='APROBADA'
      AND root.producto_padre_id IS NULL
    UNION
    SELECT DISTINCT coalesce(p.producto_padre_id,p.id)
    FROM public.transferencias t
    JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
    JOIN public.productos p ON p.id=tl.producto_id
    JOIN public.productos root ON root.id=coalesce(p.producto_padre_id,p.id)
    WHERE t.almacen_destino_id=v_s.almacen_id
      AND lower(t.estado)='completada' AND t.fecha>=v_cutoff AND t.fecha<=now()
      AND NOT EXISTS (
        SELECT 1 FROM public.turno_jornada_entradas_vinculadas linked
        WHERE linked.transferencia_id=t.id AND linked.turno_sesion_id<>v_s.id
      )
      AND root.producto_padre_id IS NULL
  ),
  initial_lines AS (
    SELECT l.producto_id AS product_id,
      coalesce(c.cantidad_corregida,l.cantidad_contada)::numeric AS qty
    FROM public.turno_jornada_inventario_lineas l
    LEFT JOIN public.turno_jornada_inventario_correcciones c
      ON c.turno_sesion_id=v_s.id AND c.tipo='INICIAL'
      AND c.producto_id=l.producto_id AND c.vigente
    WHERE l.corte_id=v_initial.id
  ),
  final_lines AS (
    SELECT l.producto_id AS product_id,
      coalesce(c.cantidad_corregida,l.cantidad_contada)::numeric AS qty
    FROM public.turno_jornada_inventario_lineas l
    LEFT JOIN public.turno_jornada_inventario_correcciones c
      ON c.turno_sesion_id=v_s.id AND c.tipo='FINAL'
      AND c.producto_id=l.producto_id AND c.vigente
    WHERE l.corte_id=v_final.id
  ),
    movement_events AS (
      SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END product_id,
             'TRANSFERENCIA_ENTRADA'::text kind,tl.cantidad::numeric qty
      FROM public.transferencias t
      JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
      JOIN public.productos p ON p.id=tl.producto_id
      WHERE t.almacen_destino_id=v_s.almacen_id AND lower(t.estado)='completada'
        AND t.fecha>v_start_at
        AND NOT EXISTS (
          SELECT 1
          FROM public.turno_jornada_entradas_lineas_vinculadas allocated_line
          JOIN public.turno_jornada_entradas_vinculadas allocated_link
            ON allocated_link.id=allocated_line.entrada_vinculada_id
          WHERE allocated_line.transferencia_linea_id=tl.id
            AND allocated_link.turno_sesion_id<>v_s.id
        )
        AND (
          t.fecha<=v_end_at
          OR EXISTS (
            SELECT 1
            FROM public.turno_jornada_entradas_vinculadas linked_override
            JOIN public.turno_jornada_entradas_lineas_vinculadas linked_line
              ON linked_line.entrada_vinculada_id=linked_override.id
            WHERE linked_override.turno_sesion_id=v_s.id
              AND linked_override.transferencia_id=t.id
              AND linked_line.transferencia_linea_id=tl.id
          )
        )
        AND (NOT v_retroactive
          OR (t.fecha AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'))::date BETWEEN v_p.fecha AND coalesce(v_p.fecha_fin,v_p.fecha)
          OR EXISTS(
            SELECT 1
            FROM public.turno_jornada_entradas_vinculadas linked
            JOIN public.turno_jornada_entradas_lineas_vinculadas linked_line
              ON linked_line.entrada_vinculada_id=linked.id
            WHERE linked.turno_sesion_id=v_s.id
              AND linked.transferencia_id=t.id
              AND linked_line.transferencia_linea_id=tl.id
          ))
      UNION ALL
      SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
             'TRANSFERENCIA_SALIDA',tl.cantidad::numeric
      FROM public.transferencias t
      JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
      JOIN public.productos p ON p.id=tl.producto_id
      WHERE t.almacen_origen_id=v_s.almacen_id AND lower(t.estado)='completada'
        AND t.fecha>v_start_at AND t.fecha<=v_end_at
      UNION ALL
      SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
             'COMPRA',lc.cantidad_inicial::numeric
      FROM public.lotes_compra lc
      JOIN public.productos p ON p.id=lc.producto_id
      WHERE lc.almacen_id=v_s.almacen_id AND lower(lc.origen)='compra'
        AND lc.fecha_compra>v_start_at AND lc.fecha_compra<=v_end_at
      UNION ALL
      SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
             'REINVERSION',rl.cantidad_base::numeric
      FROM public.reinversiones r
      JOIN public.reinversiones_lineas rl ON rl.reinversion_id=r.id
      JOIN public.productos p ON p.id=rl.producto_id
      WHERE r.almacen_id=v_s.almacen_id
        AND r.turno_sesion_id=v_s.id
        AND r.estado='APROBADA' AND r.fecha_revision IS NOT NULL
      UNION ALL
      SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
             'VALE',vs.cantidad::numeric
      FROM public.vales_salida vs
      JOIN public.productos p ON p.id=vs.producto_id
      WHERE vs.almacen_id=v_s.almacen_id
        AND upper(coalesce(vs.estado,'REGISTRADO')) NOT IN ('PENDIENTE','RECHAZADO','CANCELADO','ANULADO')
        AND vs.fecha>v_start_at AND vs.fecha<=v_end_at
      UNION ALL
      SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
             'MERMA',m.cantidad::numeric
      FROM public.mermas m
      JOIN public.productos p ON p.id=m.producto_id
      WHERE m.almacen_id=v_s.almacen_id AND m.estado='APROBADA'
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
        AND (
          (coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_start_at
            AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)<=v_end_at
            AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
              WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA'
                AND mr.movimiento_id=m.id AND mr.clasificacion='DESPUES_CORTE'))
          OR (coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_start_at
            AND EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
              WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA'
                AND mr.movimiento_id=m.id AND mr.clasificacion='ANTES_CORTE'))
        )
      UNION ALL
      SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
             'BAJA',b.cantidad::numeric
      FROM public.bajas b
      JOIN public.productos p ON p.id=b.producto_id
      WHERE b.almacen_id=v_s.almacen_id AND b.estado='APROBADA'
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
        AND (
          (coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_start_at
            AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)<=v_end_at
            AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
              WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA'
                AND mr.movimiento_id=b.id AND mr.clasificacion='DESPUES_CORTE'))
          OR (coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_start_at
            AND EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
              WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA'
                AND mr.movimiento_id=b.id AND mr.clasificacion='ANTES_CORTE'))
        )
    )
  movement_products AS (
    SELECT DISTINCT product_id FROM movement_events
  ),
  eligible AS (
    SELECT e.producto_id
    FROM expected e
    LEFT JOIN initial_lines i ON i.product_id=e.producto_id
    LEFT JOIN final_lines f ON f.product_id=e.producto_id
    LEFT JOIN movement_products m ON m.product_id=e.producto_id
    WHERE coalesce(i.qty,0)<>0
       OR coalesce(f.qty,0)<>0
       OR m.product_id IS NOT NULL
  )
  SELECT eligible.producto_id
  FROM eligible
  ORDER BY eligible.producto_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_liquidacion_inventario_jornada(p_turno_sesion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_turno public.turnos;
  v_initial public.turno_jornada_inventario_cortes;
  v_final public.turno_jornada_inventario_cortes;
  v_is_retail boolean:=false;
  v_retroactive boolean:=false;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_rate numeric;
  v_lines jsonb:='[]'::jsonb;
  v_total_units numeric:=0;
  v_sales_total numeric;
  v_priced_lines integer:=0;
  v_total_lines integer:=0;
  v_negative_lines integer:=0;
  v_missing_price_sold integer:=0;
  v_expenses numeric:=0;
  v_reinvestments numeric:=0;
  v_daily_cash numeric:=0;
  v_daily_pending integer:=0;
  v_daily_expected integer:=0;
  v_daily_approved integer:=0;
  v_daily_missing integer:=0;
  v_pending_expenses integer:=0;
  v_pending_reinvestments integer:=0;
  v_pending_adjustments integer:=0;
  v_pending_post integer:=0;
  v_final_declared numeric;
  v_final_counted numeric;
  v_final_cash_state text;
  v_salary numeric;
  v_expected_cash numeric;
  v_cash_received numeric;
  v_difference numeric;
  v_complete boolean:=false;
  v_negative_details jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde a una jornada registrada.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS(SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL)
  ) THEN RAISE EXCEPTION 'Solo el responsable asignado o ADMIN puede consultar esta liquidación.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  SELECT * INTO v_turno FROM public.turnos WHERE id=v_s.turno_id;
  v_retroactive:=coalesce(v_s.apertura_retroactiva,false);
  SELECT (a.tipo='minorista') INTO v_is_retail FROM public.almacenes a WHERE a.id=v_s.almacen_id;
  IF NOT v_is_retail THEN
    RETURN jsonb_build_object('aplica',false,'motivo','La liquidación por diferencia de inventario está habilitada para almacenes minoristas.');
  END IF;
  SELECT * INTO v_initial FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo='INICIAL' AND estado='CONFIRMADO';
  SELECT * INTO v_final FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo='FINAL' AND estado='CONFIRMADO';
  v_start_at:=CASE
    WHEN v_retroactive AND v_initial.origen_corte_id IS NOT NULL THEN coalesce(
      (
        SELECT coalesce(
          source_session.corte_operativo_at,
          (
            SELECT max(source_tramo.fin_at)
            FROM public.turno_tramos source_tramo
            WHERE source_tramo.turno_sesion_id=source_session.id
              AND source_tramo.fin_at IS NOT NULL
          ),
          source_cut.confirmado_en
        )
        FROM public.turno_jornada_inventario_cortes source_cut
        JOIN public.turno_sesiones source_session
          ON source_session.id=source_cut.turno_sesion_id
        WHERE source_cut.id=v_initial.origen_corte_id
          AND source_cut.tipo='FINAL'
          AND source_cut.estado='CONFIRMADO'
          AND source_cut.corte_sucesora_origen_id=v_initial.id
      ),
      v_initial.confirmado_en,v_initial.creado_en,v_turno.apertura_real
    )
    ELSE coalesce(v_initial.confirmado_en,v_initial.creado_en,v_turno.apertura_real)
  END;
  v_end_at:=CASE
    WHEN v_s.estado='CERRADA_OPERATIVAMENTE' AND v_s.corte_operativo_at IS NOT NULL
      THEN v_s.corte_operativo_at
    ELSE coalesce(v_final.confirmado_en,v_final.creado_en,now())
  END;
  v_rate:=v_p.salario_porcentaje;

  -- Approved Bajas/Mermas registered or approved after the immutable final cut
  -- require an explicit Owner decision before sales/salary can be calculated.
  SELECT count(*)::integer INTO v_pending_post
  FROM (
    SELECT b.id FROM public.bajas b
    WHERE b.turno_sesion_id=v_s.id AND b.estado='APROBADA'
      AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_end_at
      AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
        WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA' AND mr.movimiento_id=b.id)
    UNION ALL
    SELECT m.id FROM public.mermas m
    WHERE m.turno_sesion_id=v_s.id AND m.estado='APROBADA'
      AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_end_at
      AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
        WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA' AND mr.movimiento_id=m.id)
  ) unresolved;

  WITH initial_lines AS (
    SELECT l.producto_id AS product_id,
      coalesce(c.cantidad_corregida,l.cantidad_contada)::numeric AS qty
    FROM public.turno_jornada_inventario_lineas l
    LEFT JOIN public.turno_jornada_inventario_correcciones c
      ON c.turno_sesion_id=v_s.id AND c.tipo='INICIAL'
      AND c.producto_id=l.producto_id AND c.vigente
    WHERE l.corte_id=v_initial.id
  ),
  final_lines AS (
    SELECT l.producto_id AS product_id,
      coalesce(c.cantidad_corregida,l.cantidad_contada)::numeric AS qty,
      l.cantidad_contada::numeric AS original_qty,
      c.cantidad_corregida AS corrected_qty
    FROM public.turno_jornada_inventario_lineas l
    LEFT JOIN public.turno_jornada_inventario_correcciones c
      ON c.turno_sesion_id=v_s.id AND c.tipo='FINAL'
      AND c.producto_id=l.producto_id AND c.vigente
    WHERE l.corte_id=v_final.id
  ),
  movement_events AS (
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END product_id,
           'TRANSFERENCIA_ENTRADA'::text kind,tl.cantidad::numeric qty
    FROM public.transferencias t
    JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
    JOIN public.productos p ON p.id=tl.producto_id
    WHERE t.almacen_destino_id=v_s.almacen_id AND lower(t.estado)='completada'
      AND t.fecha>v_start_at
      AND NOT EXISTS (
        SELECT 1
        FROM public.turno_jornada_entradas_lineas_vinculadas allocated_line
        JOIN public.turno_jornada_entradas_vinculadas allocated_link
          ON allocated_link.id=allocated_line.entrada_vinculada_id
        WHERE allocated_line.transferencia_linea_id=tl.id
          AND allocated_link.turno_sesion_id<>v_s.id
      )
      AND (
        t.fecha<=v_end_at
        OR EXISTS (
          SELECT 1
          FROM public.turno_jornada_entradas_vinculadas linked_override
          JOIN public.turno_jornada_entradas_lineas_vinculadas linked_line
            ON linked_line.entrada_vinculada_id=linked_override.id
          WHERE linked_override.turno_sesion_id=v_s.id
            AND linked_override.transferencia_id=t.id
            AND linked_line.transferencia_linea_id=tl.id
        )
      )
      AND (NOT v_retroactive
        OR (t.fecha AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'))::date BETWEEN v_p.fecha AND coalesce(v_p.fecha_fin,v_p.fecha)
        OR EXISTS(
          SELECT 1
          FROM public.turno_jornada_entradas_vinculadas linked
          JOIN public.turno_jornada_entradas_lineas_vinculadas linked_line
            ON linked_line.entrada_vinculada_id=linked.id
          WHERE linked.turno_sesion_id=v_s.id
            AND linked.transferencia_id=t.id
            AND linked_line.transferencia_linea_id=tl.id
        ))
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'TRANSFERENCIA_SALIDA',tl.cantidad::numeric
    FROM public.transferencias t
    JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
    JOIN public.productos p ON p.id=tl.producto_id
    WHERE t.almacen_origen_id=v_s.almacen_id AND lower(t.estado)='completada'
      AND t.fecha>v_start_at AND t.fecha<=v_end_at
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'COMPRA',lc.cantidad_inicial::numeric
    FROM public.lotes_compra lc
    JOIN public.productos p ON p.id=lc.producto_id
    WHERE lc.almacen_id=v_s.almacen_id AND lower(lc.origen)='compra'
      AND lc.fecha_compra>v_start_at AND lc.fecha_compra<=v_end_at
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'REINVERSION',rl.cantidad_base::numeric
    FROM public.reinversiones r
    JOIN public.reinversiones_lineas rl ON rl.reinversion_id=r.id
    JOIN public.productos p ON p.id=rl.producto_id
    WHERE r.almacen_id=v_s.almacen_id
      AND r.turno_sesion_id=v_s.id
      AND r.estado='APROBADA' AND r.fecha_revision IS NOT NULL
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'VALE',vs.cantidad::numeric
    FROM public.vales_salida vs
    JOIN public.productos p ON p.id=vs.producto_id
    WHERE vs.almacen_id=v_s.almacen_id
      AND upper(coalesce(vs.estado,'REGISTRADO')) NOT IN ('PENDIENTE','RECHAZADO','CANCELADO','ANULADO')
      AND vs.fecha>v_start_at AND vs.fecha<=v_end_at
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'MERMA',m.cantidad::numeric
    FROM public.mermas m
    JOIN public.productos p ON p.id=m.producto_id
    WHERE m.almacen_id=v_s.almacen_id AND m.estado='APROBADA'
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
      AND (
        (coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_start_at
          AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)<=v_end_at
          AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA'
              AND mr.movimiento_id=m.id AND mr.clasificacion='DESPUES_CORTE'))
        OR (coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_start_at
          AND EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA'
              AND mr.movimiento_id=m.id AND mr.clasificacion='ANTES_CORTE'))
      )
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'BAJA',b.cantidad::numeric
    FROM public.bajas b
    JOIN public.productos p ON p.id=b.producto_id
    WHERE b.almacen_id=v_s.almacen_id AND b.estado='APROBADA'
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
      AND (
        (coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_start_at
          AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)<=v_end_at
          AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA'
              AND mr.movimiento_id=b.id AND mr.clasificacion='DESPUES_CORTE'))
        OR (coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_start_at
          AND EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA'
              AND mr.movimiento_id=b.id AND mr.clasificacion='ANTES_CORTE'))
      )
  ),
  movement_totals AS (
    SELECT product_id,
      coalesce(sum(qty) FILTER(WHERE kind='TRANSFERENCIA_ENTRADA'),0) transfer_in,
      coalesce(sum(qty) FILTER(WHERE kind='COMPRA'),0) purchases_in,
      coalesce(sum(qty) FILTER(WHERE kind='REINVERSION'),0) reinvestment_in,
      coalesce(sum(qty) FILTER(WHERE kind='TRANSFERENCIA_SALIDA'),0) transfer_out,
      coalesce(sum(qty) FILTER(WHERE kind='VALE'),0) vales_out,
      coalesce(sum(qty) FILTER(WHERE kind='MERMA'),0) merma_out,
      coalesce(sum(qty) FILTER(WHERE kind='BAJA'),0) bajas_out
    FROM movement_events GROUP BY product_id
  ),
  price_info AS (
    SELECT p.id product_id,p.nombre,p.unidad,
      CASE
        WHEN coalesce(historical_price.precio_venta_unitario,0)>0
          THEN historical_price.precio_venta_unitario
        WHEN coalesce(persistent_values.precio_venta_unitario,0)>0 THEN persistent_values.precio_venta_unitario
        WHEN coalesce(p.precio_normal,0)>0 THEN p.precio_normal
        WHEN count(ch.id)>0
          AND count(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))=count(ch.id)
          AND min(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))=max(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))
          AND min(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))>0 THEN min(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))
        ELSE NULL
      END precio_unitario,
      CASE
        WHEN coalesce(historical_price.precio_venta_unitario,0)>0 THEN 'PRECIO_HISTORICO_JORNADA'
        WHEN coalesce(persistent_values.precio_venta_unitario,0)>0 THEN 'PRECIO_PRODUCTO_VIGENTE'
        WHEN coalesce(p.precio_normal,0)>0 THEN 'PRECIO_FAMILIA'
        WHEN count(ch.id)>0
          AND count(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))=count(ch.id)
          AND min(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))=max(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))
          AND min(coalesce(child_persistent_values.precio_venta_unitario,ch.precio_normal))>0 THEN 'PRECIO_VARIANTES_UNIFORME'
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
    LEFT JOIN LATERAL (
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
    ) child_persistent_values ON true
    WHERE p.activo=true AND p.producto_padre_id IS NULL
    GROUP BY p.id,p.nombre,p.unidad,p.precio_normal,
      historical_price.precio_venta_unitario,persistent_values.precio_venta_unitario
  ),
  all_product_ids AS (
    SELECT product_id FROM initial_lines
    UNION SELECT product_id FROM final_lines
    UNION SELECT product_id FROM movement_totals
  ),
  eligible_product_ids AS (
    SELECT ids.product_id
    FROM eligible_product_ids ids
    LEFT JOIN initial_lines i ON i.product_id=ids.product_id
    LEFT JOIN final_lines f ON f.product_id=ids.product_id
    LEFT JOIN movement_totals mt ON mt.product_id=ids.product_id
    WHERE coalesce(i.qty,0)<>0
       OR coalesce(f.qty,0)<>0
       OR mt.product_id IS NOT NULL
  ),
  calculated AS (
    SELECT ids.product_id,coalesce(pi.nombre,p.nombre) nombre,coalesce(pi.unidad,p.unidad) unidad,
      coalesce(i.qty,0) initial_qty,coalesce(f.qty,0) final_qty,
      f.original_qty final_qty_original,f.corrected_qty final_qty_corrected,
      coalesce(mt.transfer_in,0) transfer_in,coalesce(mt.purchases_in,0) purchases_in,
      coalesce(mt.reinvestment_in,0) reinvestment_in,coalesce(mt.transfer_out,0) transfer_out,
      coalesce(mt.vales_out,0) vales_out,coalesce(mt.merma_out,0) merma_out,coalesce(mt.bajas_out,0) bajas_out,
      (coalesce(i.qty,0)+coalesce(mt.transfer_in,0)+coalesce(mt.purchases_in,0)+coalesce(mt.reinvestment_in,0)
        -coalesce(mt.transfer_out,0)-coalesce(mt.vales_out,0)-coalesce(mt.merma_out,0)-coalesce(mt.bajas_out,0)-coalesce(f.qty,0)) sold_qty,
      pi.precio_unitario,pi.estado_precio
    FROM all_product_ids ids
    JOIN public.productos p ON p.id=ids.product_id
    LEFT JOIN price_info pi ON pi.product_id=ids.product_id
    LEFT JOIN initial_lines i ON i.product_id=ids.product_id
    LEFT JOIN final_lines f ON f.product_id=ids.product_id
    LEFT JOIN movement_totals mt ON mt.product_id=ids.product_id
  )
  SELECT count(*),
         count(*) FILTER(WHERE (precio_unitario IS NOT NULL AND sold_qty>=0) OR sold_qty=0),
         count(*) FILTER(WHERE sold_qty<0),
         count(*) FILTER(WHERE precio_unitario IS NULL AND sold_qty>0),
         coalesce(sum(sold_qty),0),
         CASE WHEN count(*) FILTER(WHERE (precio_unitario IS NULL AND sold_qty>0) OR sold_qty<0)>0 THEN NULL
              ELSE round(coalesce(sum(sold_qty*precio_unitario),0),2) END,
         coalesce(jsonb_agg(jsonb_build_object(
           'producto_id',product_id,'nombre',nombre,'unidad',unidad,
           'inventario_inicial',initial_qty,'transferencias_entrada',transfer_in,
           'compras',purchases_in,'reinversiones_entrada',reinvestment_in,
           'transferencias_salida',transfer_out,'vales_salida',vales_out,
           'mermas_aprobadas',merma_out,'bajas_aprobadas',bajas_out,
           'inventario_final',final_qty,'inventario_final_original',final_qty_original,
           'inventario_final_corregido',final_qty_corrected,'unidades_vendidas',sold_qty,
           'precio_unitario',precio_unitario,'estado_precio',estado_precio,
           'importe_estimado',CASE WHEN precio_unitario IS NOT NULL AND sold_qty>=0 THEN round(sold_qty*precio_unitario,2) ELSE NULL END
         ) ORDER BY nombre,product_id),'[]'::jsonb)
    INTO v_total_lines,v_priced_lines,v_negative_lines,v_missing_price_sold,v_total_units,v_sales_total,v_lines
  FROM calculated;

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

  -- Do not present provisional sales or salary as if the missing final stock were zero.
  IF v_initial.id IS NULL OR v_final.id IS NULL THEN
    v_total_lines:=0;
    v_priced_lines:=0;
    v_negative_lines:=0;
    v_missing_price_sold:=0;
    v_total_units:=NULL;
    v_sales_total:=NULL;
    v_lines:='[]'::jsonb;
  END IF;

  SELECT coalesce(sum(g.monto) FILTER(WHERE g.estado='APROBADO'),0),
         count(*) FILTER(WHERE g.estado='PENDIENTE')
    INTO v_expenses,v_pending_expenses
  FROM public.gastos g WHERE g.turno_sesion_id=v_s.id AND g.estado IN ('APROBADO','PENDIENTE');
  SELECT coalesce(sum(r.total) FILTER(WHERE r.estado='APROBADA'),0),
         count(*) FILTER(WHERE r.estado='PENDIENTE')
    INTO v_reinvestments,v_pending_reinvestments
  FROM public.reinversiones r
  WHERE r.almacen_id=v_s.almacen_id
    AND r.turno_sesion_id=v_s.id
    AND r.estado IN ('APROBADA','PENDIENTE');
  SELECT count(*) INTO v_pending_adjustments
  FROM (
    SELECT 1 FROM public.mermas m WHERE m.turno_sesion_id=v_s.id AND m.estado='PENDIENTE'
    UNION ALL
    SELECT 1 FROM public.bajas b WHERE b.turno_sesion_id=v_s.id AND b.estado='PENDIENTE'
  ) pending;
  v_daily_expected:=greatest(0,(coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha+1)::integer);
  SELECT coalesce(sum(e.monto_aprobado) FILTER(WHERE e.estado='APROBADA'),0),
         count(*) FILTER(WHERE e.estado='PENDIENTE'),
         count(*) FILTER(WHERE e.estado='APROBADA')
    INTO v_daily_cash,v_daily_pending,v_daily_approved
  FROM public.turno_jornada_entregas_diarias e
  WHERE e.turno_sesion_id=v_s.id
    AND e.fecha BETWEEN v_p.fecha AND coalesce(v_p.fecha_fin,v_p.fecha);
  v_daily_missing:=greatest(0,v_daily_expected-v_daily_approved);
  -- Every daily cash amount approved by the Owner is the verified cash received.
  -- A second aggregate physical count is not part of the retail Jornada workflow.
  v_final_declared:=coalesce(v_daily_cash,0);
  v_final_counted:=NULL;
  v_final_cash_state:=CASE
    WHEN v_daily_expected>0
      AND v_daily_approved=v_daily_expected
      AND v_daily_pending=0
      AND v_daily_missing=0
    THEN 'APROBADA'
    ELSE 'PENDIENTE'
  END;

  v_salary:=CASE WHEN v_rate IS NOT NULL AND v_sales_total IS NOT NULL
    THEN round(v_sales_total*v_rate/100,2) ELSE NULL END;
  v_cash_received:=CASE
    WHEN v_daily_expected>0
      AND v_daily_approved=v_daily_expected
      AND v_daily_pending=0
      AND v_daily_missing=0
    THEN coalesce(v_daily_cash,0)
    ELSE NULL
  END;
  v_expected_cash:=CASE WHEN v_sales_total IS NOT NULL
    THEN round(v_sales_total-v_expenses-v_reinvestments,2) ELSE NULL END;
  v_difference:=CASE WHEN v_cash_received IS NOT NULL AND v_expected_cash IS NOT NULL
    THEN round(v_expected_cash-v_cash_received,2) ELSE NULL END;
  -- Keep the physical inventory rows visible even while post-cutoff
  -- movements await Owner classification. Preserve a separate diagnostic
  -- for negative calculated sales, but never expose provisional sales/cash.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'producto_id',x.value->'producto_id',
    'nombre',x.value->'nombre',
    'unidades_vendidas',x.value->'unidades_vendidas',
    'inventario_inicial',x.value->'inventario_inicial',
    'transferencias_entrada',x.value->'transferencias_entrada',
    'compras',x.value->'compras',
    'reinversiones_entrada',x.value->'reinversiones_entrada',
    'transferencias_salida',x.value->'transferencias_salida',
    'vales_salida',x.value->'vales_salida',
    'mermas_aprobadas',x.value->'mermas_aprobadas',
    'bajas_aprobadas',x.value->'bajas_aprobadas',
    'inventario_final',x.value->'inventario_final',
    'inventario_final_original',x.value->'inventario_final_original',
    'inventario_final_corregido',x.value->'inventario_final_corregido'
  ) ORDER BY x.value->>'nombre'),'[]'::jsonb)
  INTO v_negative_details
  FROM jsonb_array_elements(coalesce(v_lines,'[]'::jsonb)) x(value)
  WHERE coalesce((x.value->>'unidades_vendidas')::numeric,0)<0;

  IF v_pending_post>0 THEN
    v_total_units:=NULL;
    v_sales_total:=NULL;
    v_salary:=NULL;
    v_expected_cash:=NULL;
    v_difference:=NULL;
    SELECT coalesce(jsonb_agg(
      x.value - ARRAY['unidades_vendidas','importe_estimado']
      ORDER BY x.value->>'nombre'
    ),'[]'::jsonb)
    INTO v_lines
    FROM jsonb_array_elements(coalesce(v_lines,'[]'::jsonb)) x(value);
  END IF;
  v_complete:=v_initial.id IS NOT NULL AND v_final.id IS NOT NULL
    AND v_total_lines>0 AND v_priced_lines=v_total_lines AND v_missing_price_sold=0 AND v_negative_lines=0
    AND v_rate IS NOT NULL AND v_daily_pending=0 AND v_daily_missing=0
    AND v_pending_expenses=0 AND v_pending_reinvestments=0 AND v_pending_adjustments=0
    AND v_pending_post=0
    AND v_cash_received IS NOT NULL;

  RETURN jsonb_build_object(
    'aplica',true,'calculable',v_complete,
    'formula','Inicial + entradas (transferencias/compras/reinversiones) - salidas aprobadas (transferencias/vales/mermas/bajas) - final = unidades vendidas; valoradas al precio histórico de la jornada cuando esté registrado y, en su defecto, al precio normal del catálogo.',
    'lineas',v_lines,'unidades_vendidas',v_total_units,
    'ventas_estimadas',v_sales_total,'salario_porcentaje',v_rate,'salario_calculado',v_salary,
    'gastos_aprobados',v_expenses,'reinversiones_aprobadas',v_reinvestments,
    'entregas_diarias_aprobadas',v_daily_cash,'entregas_diarias_pendientes',v_daily_pending,'entregas_diarias_faltantes',v_daily_missing,
    'dinero_final_declarado',v_final_declared,'dinero_final_contado',v_final_counted,
    'estado_dinero_final',v_final_cash_state,'dinero_recogido_total',v_cash_received,
    'efectivo_esperado_despues_de_gastos_reinversiones',v_expected_cash,
    'efectivo_esperado_despues_de_gastos_reinversiones_salario',v_expected_cash,
    'formula_efectivo','Ventas - gastos aprobados - reinversiones aprobadas. El salario se acumula y paga por separado; no se descuenta de esta caja.',
    'diferencia',v_difference,
    'faltan_cortes',NOT(v_initial.id IS NOT NULL AND v_final.id IS NOT NULL),
    'familias_sin_precio',v_missing_price_sold,
    'familias_con_vendidas_negativas',v_negative_lines,
    'familias_vendidas_negativas_detalle',v_negative_details,
    'movimientos_posteriores_pendientes',v_pending_post,
    'pendientes',jsonb_build_object(
      'gastos',v_pending_expenses,'reinversiones',v_pending_reinvestments,
      'ajustes',v_pending_adjustments,'movimientos_posteriores_corte',v_pending_post,
      'entregas_diarias',v_daily_pending,'entregas_diarias_faltantes',v_daily_missing
    )
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.bc7_clasificar_movimientos_fuera_corte(p_turno_sesion_id uuid, p_decisiones jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_final public.turno_jornada_inventario_cortes;
  v_item jsonb;
  v_tipo text;
  v_id uuid;
  v_clasificacion text;
  v_comentario text;
  v_count integer:=0;
  v_pending integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede clasificar movimientos posteriores al corte.' USING ERRCODE='42501';
  END IF;
  IF p_decisiones IS NULL OR jsonb_typeof(p_decisiones)<>'array' OR jsonb_array_length(p_decisiones)=0 THEN
    RAISE EXCEPTION 'Selecciona una clasificación para cada movimiento y escribe el motivo.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id AND bloque='JORNADA';
  IF NOT FOUND OR v_s.estado NOT IN ('COMPLETADA','CERRADA_OPERATIVAMENTE') THEN
    RAISE EXCEPTION 'Solo se pueden revisar movimientos de una jornada completada o cerrada operativamente.' USING ERRCODE='23514';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.turnos t
    WHERE t.id=v_s.turno_id AND coalesce(t.estado_maestro,t.estado) IN ('CERRADO','CANCELADO')
  ) THEN
    RAISE EXCEPTION 'El Turno está cerrado. Las bajas/mermas quedaron congeladas al aprobar la liquidación.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_final FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo='FINAL' AND estado='CONFIRMADO';
  IF v_final.id IS NULL THEN RAISE EXCEPTION 'Falta el inventario final confirmado.' USING ERRCODE='23514'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_decisiones) x(value) LOOP
    v_tipo:=upper(coalesce(v_item->>'tipo',''));
    v_id:=nullif(v_item->>'id','')::uuid;
    v_clasificacion:=upper(coalesce(v_item->>'clasificacion',''));
    v_comentario:=trim(coalesce(v_item->>'comentario',''));
    IF v_tipo NOT IN ('BAJA','MERMA') OR v_id IS NULL
       OR v_clasificacion NOT IN ('ANTES_CORTE','DESPUES_CORTE')
       OR v_comentario='' THEN
      RAISE EXCEPTION 'Cada movimiento requiere tipo, ID, clasificación y motivo.' USING ERRCODE='22023';
    END IF;
    IF v_tipo='BAJA' AND NOT EXISTS(
      SELECT 1 FROM public.bajas b WHERE b.id=v_id AND b.turno_sesion_id=v_s.id
        AND b.estado='APROBADA' AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_final.confirmado_en
    ) THEN
      RAISE EXCEPTION 'La baja indicada no pertenece a los movimientos posteriores al inventario final.' USING ERRCODE='23503';
    END IF;
    IF v_tipo='MERMA' AND NOT EXISTS(
      SELECT 1 FROM public.mermas m WHERE m.id=v_id AND m.turno_sesion_id=v_s.id
        AND m.estado='APROBADA' AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_final.confirmado_en
    ) THEN
      RAISE EXCEPTION 'La merma indicada no pertenece a los movimientos posteriores al inventario final.' USING ERRCODE='23503';
    END IF;
    INSERT INTO public.turno_jornada_movimiento_revision(
      turno_sesion_id,tipo_movimiento,movimiento_id,clasificacion,comentario,revisado_por,revisado_at
    ) VALUES(v_s.id,v_tipo,v_id,v_clasificacion,v_comentario,auth.uid(),now())
    ON CONFLICT(turno_sesion_id,tipo_movimiento,movimiento_id) DO UPDATE
      SET clasificacion=EXCLUDED.clasificacion,comentario=EXCLUDED.comentario,
          revisado_por=EXCLUDED.revisado_por,revisado_at=EXCLUDED.revisado_at;
    v_count:=v_count+1;
  END LOOP;
  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)
  VALUES(v_s.turno_id,v_s.id,auth.uid(),'MOVIMIENTOS_POST_CORTE_CLASIFICADOS',
    jsonb_build_object('movimientos_revisados',v_count,'decisiones',p_decisiones));
  SELECT count(*) INTO v_pending FROM (
    SELECT b.id FROM public.bajas b WHERE b.turno_sesion_id=v_s.id AND b.estado='APROBADA'
      AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_final.confirmado_en
      AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
        WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA' AND mr.movimiento_id=b.id)
    UNION ALL
    SELECT m.id FROM public.mermas m WHERE m.turno_sesion_id=v_s.id AND m.estado='APROBADA'
      AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_final.confirmado_en
      AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
        WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA' AND mr.movimiento_id=m.id)
  ) pending;
  RETURN jsonb_build_object('ok',true,'revisados',v_count,'pendientes',v_pending);
END;
$function$


COMMIT;