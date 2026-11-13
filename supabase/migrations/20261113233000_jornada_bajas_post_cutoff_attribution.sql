-- Require explicit owner attribution for approved Jornada Bajas recorded after the final inventory cut.
-- Never infer when a loss physically occurred from its approval timestamp.
BEGIN;

CREATE TABLE IF NOT EXISTS public.turno_jornada_bajas_corte_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baja_id uuid NOT NULL UNIQUE REFERENCES public.bajas(id) ON DELETE CASCADE,
  turno_sesion_id uuid NOT NULL REFERENCES public.turno_sesiones(id) ON DELETE CASCADE,
  fecha_ocurrencia timestamptz NOT NULL,
  motivo text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 8 AND 500),
  revisado_por uuid NOT NULL,
  revisado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_turno_jornada_bajas_corte_revision_sesion
  ON public.turno_jornada_bajas_corte_revision(turno_sesion_id);
ALTER TABLE public.turno_jornada_bajas_corte_revision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.turno_jornada_bajas_corte_revision FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bc7_revisar_baja_fuera_corte(
  p_baja_id uuid,
  p_fecha_ocurrencia timestamptz,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_baja record;
  v_final record;
  v_actor uuid:=auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF NOT (
    public.bc_actor_is_admin()
    OR public.tiene_permiso('bajas','editar_any')
    OR public.tiene_permiso('auditoria','editar_any')
  ) THEN
    RAISE EXCEPTION 'Solo ADMIN puede atribuir una Baja posterior al corte.' USING ERRCODE='42501';
  END IF;
  IF p_fecha_ocurrencia IS NULL OR p_motivo IS NULL
     OR length(btrim(p_motivo))<8 OR length(btrim(p_motivo))>500 THEN
    RAISE EXCEPTION 'Indica la fecha/hora real de ocurrencia y un motivo verificable (8–500 caracteres).' USING ERRCODE='22023';
  END IF;

  SELECT b.id,b.turno_sesion_id,b.estado,b.almacen_id,
         coalesce(b.fecha_revision,b.actualizado_en,b.creado_en) AS fecha_registro
    INTO v_baja
  FROM public.bajas b
  WHERE b.id=p_baja_id
  FOR UPDATE;
  IF NOT FOUND OR v_baja.turno_sesion_id IS NULL OR v_baja.estado<>'APROBADA' THEN
    RAISE EXCEPTION 'La Baja debe existir, estar aprobada y pertenecer a una Jornada.' USING ERRCODE='23514';
  END IF;
  SELECT c.confirmado_en,c.creado_en INTO v_final
  FROM public.turno_jornada_inventario_cortes c
  WHERE c.turno_sesion_id=v_baja.turno_sesion_id
    AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
  ORDER BY c.confirmado_en DESC NULLS LAST,c.creado_en DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La Jornada no tiene un corte final confirmado.' USING ERRCODE='23514';
  END IF;
  IF v_baja.fecha_registro<=coalesce(v_final.confirmado_en,v_final.creado_en) THEN
    RAISE EXCEPTION 'Esta Baja no es posterior al corte final y no necesita atribución extraordinaria.' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.turno_jornada_bajas_corte_revision r WHERE r.baja_id=p_baja_id) THEN
    RAISE EXCEPTION 'Esta Baja ya tiene una atribución de ocurrencia registrada; no se sobrescribe la evidencia.' USING ERRCODE='23505';
  END IF;

  INSERT INTO public.turno_jornada_bajas_corte_revision(
    baja_id,turno_sesion_id,fecha_ocurrencia,motivo,revisado_por
  ) VALUES(p_baja_id,v_baja.turno_sesion_id,p_fecha_ocurrencia,btrim(p_motivo),v_actor);

  RETURN jsonb_build_object(
    'baja_id',p_baja_id,'turno_sesion_id',v_baja.turno_sesion_id,
    'fecha_ocurrencia',p_fecha_ocurrencia,'motivo',btrim(p_motivo),
    'revisado_por',v_actor,'revisado_en',now()
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_revisar_baja_fuera_corte(uuid,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_revisar_baja_fuera_corte(uuid,timestamptz,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc7_liquidacion_inventario_jornada(p_turno_sesion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
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
  v_bajas_fuera_corte integer:=0;
  v_bajas_fuera_corte_detalle jsonb:='[]'::jsonb;
  v_final_declared numeric;
  v_final_counted numeric;
  v_final_cash_state text;
  v_salary numeric;
  v_expected_cash numeric;
  v_cash_received numeric;
  v_difference numeric;
  v_complete boolean:=false;
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
  v_start_at:=coalesce(v_turno.apertura_real,v_initial.confirmado_en,v_initial.creado_en);
  v_end_at:=coalesce(v_final.confirmado_en,v_final.creado_en,now());
  v_rate:=v_p.salario_porcentaje;

  -- Approved Bajas registered/reviewed after the immutable final cut cannot
  -- be assigned to this period by their approval timestamp. Require an
  -- explicit, auditable occurrence-time decision before settlement.
  SELECT count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'baja_id',b.id,'producto_id',b.producto_id,'producto',p.nombre,
           'cantidad',b.cantidad,
           'fecha_registro',b.creado_en,
           'fecha_revision',b.fecha_revision
         ) ORDER BY b.creado_en,b.id),'[]'::jsonb)
    INTO v_bajas_fuera_corte,v_bajas_fuera_corte_detalle
  FROM public.bajas b
  JOIN public.productos p ON p.id=b.producto_id
  LEFT JOIN public.turno_jornada_bajas_corte_revision r ON r.baja_id=b.id
  WHERE b.turno_sesion_id=v_s.id
    AND b.estado='APROBADA'
    AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_end_at
    AND r.baja_id IS NULL;

  WITH initial_lines AS (
    SELECT l.producto_id AS product_id,l.cantidad_contada::numeric AS qty
    FROM public.turno_jornada_inventario_lineas l
    WHERE l.corte_id=v_initial.id
  ),
  final_lines AS (
    SELECT l.producto_id AS product_id,l.cantidad_contada::numeric AS qty
    FROM public.turno_jornada_inventario_lineas l
    WHERE l.corte_id=v_final.id
  ),
  movement_events AS (
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END product_id,
           'TRANSFERENCIA_ENTRADA'::text kind,tl.cantidad::numeric qty
    FROM public.transferencias t
    JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
    JOIN public.productos p ON p.id=tl.producto_id
    WHERE t.almacen_destino_id=v_s.almacen_id AND lower(t.estado)='completada'
      AND t.fecha>v_start_at AND t.fecha<=v_end_at
      AND (NOT v_retroactive
        OR (t.fecha AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'))::date>v_p.fecha
        OR EXISTS(SELECT 1 FROM public.turno_jornada_entradas_vinculadas linked
          WHERE linked.turno_sesion_id=v_s.id AND linked.transferencia_id=t.id))
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
    WHERE r.almacen_id=v_s.almacen_id AND r.turno_sesion_id=v_s.id
      AND r.estado='APROBADA' AND r.fecha_revision IS NOT NULL
      AND r.fecha_revision>v_start_at AND r.fecha_revision<=v_end_at
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
      AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_start_at
      AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)<=v_end_at
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'BAJA',b.cantidad::numeric
    FROM public.bajas b
    JOIN public.productos p ON p.id=b.producto_id
    LEFT JOIN public.turno_jornada_bajas_corte_revision corte ON corte.baja_id=b.id
    WHERE b.almacen_id=v_s.almacen_id AND b.estado='APROBADA'
      AND coalesce(corte.fecha_ocurrencia,coalesce(b.fecha_revision,b.actualizado_en,b.creado_en))>v_start_at
      AND coalesce(corte.fecha_ocurrencia,coalesce(b.fecha_revision,b.actualizado_en,b.creado_en))<=v_end_at
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
  ),
  all_product_ids AS (
    SELECT product_id FROM initial_lines
    UNION SELECT product_id FROM final_lines
    UNION SELECT product_id FROM movement_totals
  ),
  calculated AS (
    SELECT ids.product_id,coalesce(pi.nombre,p.nombre) nombre,coalesce(pi.unidad,p.unidad) unidad,
      coalesce(i.qty,0) initial_qty,coalesce(f.qty,0) final_qty,
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
  SELECT count(*),count(*) FILTER(WHERE precio_unitario IS NOT NULL AND sold_qty>=0),
         count(*) FILTER(WHERE sold_qty<0),coalesce(sum(sold_qty),0),
         CASE WHEN count(*) FILTER(WHERE precio_unitario IS NULL OR sold_qty<0)>0 THEN NULL
              ELSE round(sum(sold_qty*precio_unitario),2) END,
         coalesce(jsonb_agg(jsonb_build_object(
           'producto_id',product_id,'nombre',nombre,'unidad',unidad,
           'inventario_inicial',initial_qty,'transferencias_entrada',transfer_in,
           'compras',purchases_in,'reinversiones_entrada',reinvestment_in,
           'transferencias_salida',transfer_out,'vales_salida',vales_out,
           'mermas_aprobadas',merma_out,'bajas_aprobadas',bajas_out,
           'inventario_final',final_qty,'unidades_vendidas',sold_qty,
           'precio_unitario',precio_unitario,'estado_precio',estado_precio,
           'importe_estimado',CASE WHEN precio_unitario IS NOT NULL AND sold_qty>=0 THEN round(sold_qty*precio_unitario,2) ELSE NULL END
         ) ORDER BY nombre,product_id),'[]'::jsonb)
    INTO v_total_lines,v_priced_lines,v_negative_lines,v_total_units,v_sales_total,v_lines
  FROM calculated;

  -- Do not present provisional sales or salary as if the missing final stock were zero.
  IF v_initial.id IS NULL OR v_final.id IS NULL THEN
    v_total_lines:=0;
    v_priced_lines:=0;
    v_negative_lines:=0;
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
  FROM public.reinversiones r WHERE r.turno_sesion_id=v_s.id AND r.estado IN ('APROBADA','PENDIENTE');
  SELECT count(*) INTO v_pending_adjustments
  FROM (
    SELECT 1 FROM public.mermas m WHERE m.turno_sesion_id=v_s.id AND m.estado='PENDIENTE'
    UNION ALL
    SELECT 1 FROM public.bajas b WHERE b.turno_sesion_id=v_s.id AND b.estado='PENDIENTE'
  ) pending;
  v_daily_expected:=greatest(0,(coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha)::integer);
  SELECT coalesce(sum(e.monto_aprobado) FILTER(WHERE e.estado='APROBADA'),0),
         count(*) FILTER(WHERE e.estado='PENDIENTE'),
         count(*) FILTER(WHERE e.estado='APROBADA')
    INTO v_daily_cash,v_daily_pending,v_daily_approved
  FROM public.turno_jornada_entregas_diarias e WHERE e.turno_sesion_id=v_s.id;
  v_daily_missing:=greatest(0,v_daily_expected-v_daily_approved);
  SELECT d.monto,d.monto_contado,d.estado_aprobacion
    INTO v_final_declared,v_final_counted,v_final_cash_state
  FROM public.turno_declaraciones d
  WHERE d.turno_sesion_id=v_s.id
  ORDER BY d.declarado_at DESC NULLS LAST,d.created_at DESC NULLS LAST LIMIT 1;

  v_salary:=CASE WHEN v_rate IS NOT NULL AND v_sales_total IS NOT NULL
    THEN round(v_sales_total*v_rate/100,2) ELSE NULL END;
  v_cash_received:=CASE WHEN v_final_counted IS NOT NULL AND v_final_cash_state='APROBADA'
    THEN v_daily_cash+v_final_counted ELSE NULL END;
  v_expected_cash:=CASE WHEN v_sales_total IS NOT NULL AND v_salary IS NOT NULL
    THEN round(v_sales_total-v_expenses-v_reinvestments-v_salary,2) ELSE NULL END;
  v_difference:=CASE WHEN v_cash_received IS NOT NULL AND v_expected_cash IS NOT NULL
    THEN round(v_cash_received-v_expected_cash,2) ELSE NULL END;
  IF v_bajas_fuera_corte>0 THEN
    -- Do not expose a partial sales/salary estimate as if the omitted Baja
    -- had not happened; the Owner must classify its physical occurrence first.
    v_total_units:=NULL;
    v_sales_total:=NULL;
    v_salary:=NULL;
    v_expected_cash:=NULL;
    v_difference:=NULL;
    v_lines:='[]'::jsonb;
  END IF;
  v_complete:=v_initial.id IS NOT NULL AND v_final.id IS NOT NULL
    AND v_total_lines>0 AND v_priced_lines=v_total_lines AND v_negative_lines=0
    AND v_rate IS NOT NULL AND v_daily_pending=0 AND v_daily_missing=0
    AND v_pending_expenses=0 AND v_pending_reinvestments=0 AND v_pending_adjustments=0
    AND v_bajas_fuera_corte=0
    AND v_cash_received IS NOT NULL;

  RETURN jsonb_build_object(
    'aplica',true,'calculable',v_complete,
    'formula','Inicial + entradas (transferencias/compras/reinversiones) - salidas aprobadas (transferencias/vales/mermas/bajas) - final = unidades vendidas; valoradas al precio normal.',
    'lineas',v_lines,'unidades_vendidas',v_total_units,
    'ventas_estimadas',v_sales_total,'salario_porcentaje',v_rate,'salario_calculado',v_salary,
    'gastos_aprobados',v_expenses,'reinversiones_aprobadas',v_reinvestments,
    'entregas_diarias_aprobadas',v_daily_cash,'entregas_diarias_pendientes',v_daily_pending,'entregas_diarias_faltantes',v_daily_missing,
    'dinero_final_declarado',v_final_declared,'dinero_final_contado',v_final_counted,
    'estado_dinero_final',v_final_cash_state,'dinero_recogido_total',v_cash_received,
    'efectivo_esperado_despues_de_gastos_reinversiones_salario',v_expected_cash,
    'diferencia',v_difference,
    'faltan_cortes',NOT(v_initial.id IS NOT NULL AND v_final.id IS NOT NULL),
    'familias_sin_precio',v_total_lines-v_priced_lines,
    'familias_con_vendidas_negativas',v_negative_lines,
    'pendientes',jsonb_build_object(
      'gastos',v_pending_expenses,'reinversiones',v_pending_reinvestments,
      'ajustes',v_pending_adjustments,'entregas_diarias',v_daily_pending,'entregas_diarias_faltantes',v_daily_missing,
      'bajas_fuera_de_corte',v_bajas_fuera_corte
    ),
    'bajas_fuera_de_corte',v_bajas_fuera_corte,
    'bajas_fuera_de_corte_detalle',v_bajas_fuera_corte_detalle
  );
END;
$function$;

COMMIT;
