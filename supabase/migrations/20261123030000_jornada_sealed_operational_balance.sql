BEGIN;

-- A sealed Jornada keeps its own immutable operational cutoff. General
-- warehouse movements after that cutoff must not leak into its historical
-- balance, while later approvals explicitly linked to the same Jornada must
-- still participate in reconciliation.
DO $patch_operational_balance$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_jornada_saldos_operativos(uuid)'::regprocedure
  ) INTO v_definition;

  v_old := $old$  v_end_at timestamptz := now();$old$;
  v_new := $new$  v_end_at timestamptz := now();
  v_linked_end_at timestamptz := now();$new$;
  IF position(v_old IN v_definition)=0 OR
     length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Unexpected bc7_jornada_saldos_operativos declaration; migration stopped safely.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$    s.id,
    s.estado,
    s.bloque,
    s.apertura_retroactiva,$old$;
  v_new := $new$    s.id,
    s.estado,
    s.bloque,
    s.corte_operativo_at,
    s.apertura_retroactiva,$new$;
  IF position(v_old IN v_definition)=0 OR
     length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Unexpected Jornada session projection; migration stopped safely.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$  IF v_session.estado <> 'EN_CURSO'
     OR v_session.bloque <> 'JORNADA'
     OR v_session.jornada_programacion_id IS NULL
     OR v_session.almacen_tipo <> 'minorista' THEN
    RAISE EXCEPTION 'El saldo operativo solo aplica a una jornada minorista activa';
  END IF;$old$;
  v_new := $new$  IF v_session.estado NOT IN ('EN_CURSO','CERRADA_OPERATIVAMENTE')
     OR v_session.bloque <> 'JORNADA'
     OR v_session.jornada_programacion_id IS NULL
     OR v_session.almacen_tipo <> 'minorista' THEN
    RAISE EXCEPTION 'El saldo operativo solo aplica a una Jornada minorista en curso o sellada.';
  END IF;

  IF v_session.estado='CERRADA_OPERATIVAMENTE' THEN
    IF v_session.corte_operativo_at IS NULL THEN
      RAISE EXCEPTION 'La Jornada sellada no conserva un corte operativo verificable.';
    END IF;
    v_end_at:=v_session.corte_operativo_at;
  END IF;$new$;
  IF position(v_old IN v_definition)=0 OR
     length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Unexpected operational balance state guard; migration stopped safely.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$      AND r.fecha_revision <= v_end_at$old$;
  v_new := $new$      AND r.fecha_revision <= v_linked_end_at$new$;
  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Unexpected reinvestment timestamp guard; migration stopped safely.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$      AND COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) <= v_end_at$old$;
  v_new := $new$      AND COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) <= v_linked_end_at$new$;
  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Unexpected mermas timestamp guard; migration stopped safely.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$      AND COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) <= v_end_at$old$;
  v_new := $new$      AND COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) <= v_linked_end_at$new$;
  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Unexpected bajas timestamp guard; migration stopped safely.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END;
$patch_operational_balance$;

-- The picker and the submit RPC must use the same operational ledger after
-- sealing. Otherwise the UI falls back to warehouse stock while the RPC uses
-- the Jornada opening count and movements.
DO $patch_adjustment_catalog$
DECLARE
  v_definition text;
  v_old text := $old$  IF v_s.estado='EN_CURSO'
     AND EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista') THEN$old$;
  v_new text := $new$  IF v_s.estado IN ('EN_CURSO','CERRADA_OPERATIVAMENTE')
     AND EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista') THEN$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_productos_ajuste_jornada(uuid)'::regprocedure
  ) INTO v_definition;
  IF position(v_old IN v_definition)=0 OR
     length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Unexpected adjustment catalog branch; migration stopped safely.';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END;
$patch_adjustment_catalog$;

-- Materialize the Jornada ledger once for the complete multi-product request.
-- Preserve the pending reservation calculation and all-or-nothing transaction.
DO $patch_bulk_baja_balance$
DECLARE
  v_definition text;
  v_old text := $old$  FOR v_group IN
    SELECT x.producto_id,sum(x.cantidad) AS cantidad_total
    FROM jsonb_to_recordset(p_lineas) AS x(producto_id uuid,cantidad numeric)
    GROUP BY x.producto_id
    ORDER BY x.producto_id
  LOOP
    SELECT GREATEST(
      0,
      COALESCE(saldo.cantidad_actual,0)-COALESCE(reservado.cantidad,0)
    )
    INTO v_stock
    FROM (SELECT 1) AS seed
    LEFT JOIN LATERAL (
      SELECT q.cantidad_actual
      FROM public.bc7_jornada_saldos_operativos(v_s.id) q
      WHERE q.producto_id=v_group.producto_id
    ) saldo ON true
    LEFT JOIN LATERAL (
      SELECT sum(b.cantidad)::numeric AS cantidad
      FROM public.bajas b
      WHERE b.turno_sesion_id=v_s.id
        AND b.producto_id=v_group.producto_id
        AND b.estado='PENDIENTE'
    ) reservado ON true;

    IF COALESCE(v_stock,0)<v_group.cantidad_total THEN
      RAISE EXCEPTION
        'Stock operativo insuficiente para la baja del producto %. Disponible: %, solicitado: %.',
        v_group.producto_id,COALESCE(v_stock,0),v_group.cantidad_total
        USING ERRCODE='P0001';
    END IF;
  END LOOP;$old$;
  v_new text := $new$  FOR v_group IN
    WITH requested AS MATERIALIZED (
      SELECT x.producto_id,sum(x.cantidad)::numeric AS cantidad_total
      FROM jsonb_to_recordset(p_lineas) AS x(producto_id uuid,cantidad numeric)
      GROUP BY x.producto_id
    ),
    saldo AS MATERIALIZED (
      SELECT q.producto_id,q.cantidad_actual
      FROM public.bc7_jornada_saldos_operativos(v_s.id) q
    ),
    reservado AS MATERIALIZED (
      SELECT b.producto_id,sum(b.cantidad)::numeric AS cantidad
      FROM public.bajas b
      WHERE b.turno_sesion_id=v_s.id AND b.estado='PENDIENTE'
      GROUP BY b.producto_id
    )
    SELECT r.producto_id,r.cantidad_total,
      GREATEST(0,coalesce(s.cantidad_actual,0)-coalesce(p.cantidad,0))::numeric
        AS stock_disponible
    FROM requested r
    LEFT JOIN saldo s ON s.producto_id=r.producto_id
    LEFT JOIN reservado p ON p.producto_id=r.producto_id
    ORDER BY r.producto_id
  LOOP
    v_stock:=v_group.stock_disponible;
    IF COALESCE(v_stock,0)<v_group.cantidad_total THEN
      RAISE EXCEPTION
        'Stock operativo insuficiente para la baja del producto %. Disponible: %, solicitado: %.',
        v_group.producto_id,COALESCE(v_stock,0),v_group.cantidad_total
        USING ERRCODE='P0001';
    END IF;
  END LOOP;$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_registrar_bajas_multiple_jornada(uuid,jsonb,text,uuid)'::regprocedure
  ) INTO v_definition;
  IF position(v_old IN v_definition)=0 OR
     length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Unexpected grouped Baja validation loop; migration stopped safely.';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END;
$patch_bulk_baja_balance$;

-- Partial indexes accelerate session-specific pending reservations and
-- approved linked movement lookups without indexing unrelated warehouse rows.
CREATE INDEX IF NOT EXISTS bajas_pending_jornada_product_idx
  ON public.bajas (turno_sesion_id,producto_id)
  WHERE estado='PENDIENTE' AND turno_sesion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bajas_approved_jornada_time_idx
  ON public.bajas (turno_sesion_id,(COALESCE(fecha_revision,actualizado_en,creado_en)))
  WHERE estado='APROBADA' AND turno_sesion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mermas_approved_jornada_time_idx
  ON public.mermas (turno_sesion_id,(COALESCE(fecha_revision,actualizado_en,creado_en)))
  WHERE estado='APROBADA' AND turno_sesion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reinversiones_approved_jornada_time_idx
  ON public.reinversiones (turno_sesion_id,fecha_revision)
  WHERE estado='APROBADA' AND turno_sesion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reinversiones_lineas_parent_product_idx
  ON public.reinversiones_lineas (reinversion_id,producto_id);

COMMIT;
