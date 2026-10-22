-- Step 4/15 — audited, reversible correction of the proven Masareal factor-10 FIFO defect.
-- Root cause: purchase RPCs expanded presentation quantity to base units but stored
-- the per-presentation purchase cost as if it were the per-base-unit cost.
-- This migration changes COST FIELDS ONLY: never stock quantity or sale totals.
-- It aborts unless every identified row still matches the observed before-image.
BEGIN;

CREATE TABLE private.bc_step4_masareal_fifo_cost_reconciliation_20261022 (
  reconciliation_key text PRIMARY KEY,
  reason text NOT NULL,
  lot_ids uuid[] NOT NULL,
  sale_line_ids uuid[] NOT NULL,
  lots_before jsonb NOT NULL,
  sale_lines_before jsonb NOT NULL,
  lots_after jsonb,
  sale_lines_after jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  verified_at timestamptz
);

REVOKE ALL ON TABLE private.bc_step4_masareal_fifo_cost_reconciliation_20261022 FROM PUBLIC, anon, authenticated;

DO $reconcile$
DECLARE
  v_product_id constant uuid := '6f54e15c-68ea-446e-83ba-996b60d761c5';
  v_la_cueva_id constant uuid := '6b14338b-820f-41ad-afb7-f5a2559e4268';
  v_key constant text := 'masareal_factor10_fifo_2026-10-22';
  v_lot_ids constant uuid[] := ARRAY[
    '3ecb5800-5cbd-4b2f-9243-3b80f7cf9be8'::uuid,
    'c77ebe79-2fd3-4a55-9c4d-b829bb070503'::uuid,
    'eb2f5af4-3cb1-46f6-bcc8-2e6d3d445e25'::uuid,
    '36a47496-63d9-4f0e-a2e2-34e620c3b2e8'::uuid,
    '4ebb53e2-8526-4ea1-87dd-4b54b2fc624d'::uuid,
    '521a655a-e867-491b-a6f8-d79244e6a949'::uuid,
    'b1f6ab10-14f4-4e9a-8560-6d9e93b55ed8'::uuid
  ];
  v_sale_line_ids constant uuid[] := ARRAY[
    'e4b0e86f-ab87-4733-9451-7db3d12de267'::uuid,
    '42233e42-f831-41f7-8beb-40673ef9316b'::uuid,
    'ba1aef09-c2fc-44f9-9a7d-60b4c645790a'::uuid,
    'ecdacb6e-80b6-4dbf-a12c-0ac71c44a792'::uuid,
    '61a502d4-d603-4249-b110-b51b6a6dbd0b'::uuid,
    '2745520c-2a01-4cc5-98c3-201e1ea6a292'::uuid,
    '21928e1f-8f1b-420d-b35b-4dcf3245a4af'::uuid,
    'f6cf6298-8a4f-40f7-b733-542f13c3b3a5'::uuid,
    'f3dca385-9736-4bab-93e8-b997c149dbfa'::uuid,
    'c153e5f8-2686-4cf9-a63f-5cbe75729618'::uuid,
    'bd38653d-acc1-4cf2-87a0-fec03212bc00'::uuid,
    'ef939c0b-4694-486c-af41-121f95a3041a'::uuid
  ];
  v_count integer;
  v_units_initial numeric;
  v_units_remaining numeric;
  v_lot_value numeric;
  v_sale_units numeric;
  v_sales_revenue numeric;
  v_sale_cost_lines integer;
  v_rows integer;
  v_restored_lots integer;
  v_restored_lines integer;
BEGIN
  IF to_regclass('private.bc_step4_masareal_fifo_cost_reconciliation_20261022') IS NULL THEN
    RAISE EXCEPTION 'Before-image backup table is missing; reconciliation aborted.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM private.bc_step4_masareal_fifo_cost_reconciliation_20261022
    WHERE reconciliation_key = v_key
  ) THEN
    RAISE EXCEPTION 'This Masareal reconciliation key already exists; refusing to apply twice.';
  END IF;

  -- The original source lot (300) was fully consumed: 275 transferred and 25 sold.
  -- The second source lot (200) remains intact; five transfers carry the same bad unit cost.
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('3ecb5800-5cbd-4b2f-9243-3b80f7cf9be8'::uuid,'compra'::text,'La Cueva'::text,300::numeric,0::numeric),
      ('c77ebe79-2fd3-4a55-9c4d-b829bb070503'::uuid,'compra'::text,'La Cueva'::text,200::numeric,200::numeric),
      ('eb2f5af4-3cb1-46f6-bcc8-2e6d3d445e25'::uuid,'transferencia'::text,'TuMejor Opción'::text,26::numeric,26::numeric),
      ('36a47496-63d9-4f0e-a2e2-34e620c3b2e8'::uuid,'transferencia'::text,'TuMejor Opción'::text,14::numeric,14::numeric),
      ('4ebb53e2-8526-4ea1-87dd-4b54b2fc624d'::uuid,'transferencia'::text,'TuMejor Opción'::text,5::numeric,5::numeric),
      ('521a655a-e867-491b-a6f8-d79244e6a949'::uuid,'transferencia'::text,'TuMejor Opción'::text,20::numeric,20::numeric),
      ('b1f6ab10-14f4-4e9a-8560-6d9e93b55ed8'::uuid,'transferencia'::text,'TuMejor Opción'::text,210::numeric,210::numeric)
    ) AS expected(id,origin,warehouse,initial_qty,remaining_qty)
    LEFT JOIN public.lotes_compra lc ON lc.id = expected.id
    LEFT JOIN public.almacenes a ON a.id = lc.almacen_id
    WHERE lc.id IS NULL
       OR lc.producto_id IS DISTINCT FROM v_product_id
       OR lc.origen IS DISTINCT FROM expected.origin
       OR a.nombre IS DISTINCT FROM expected.warehouse
       OR lc.cantidad_inicial IS DISTINCT FROM expected.initial_qty
       OR lc.cantidad_restante IS DISTINCT FROM expected.remaining_qty
       OR lc.costo_unitario IS DISTINCT FROM 1500::numeric
  ) THEN
    RAISE EXCEPTION 'One or more identified Masareal lots no longer match the reviewed before-image; no costs changed.';
  END IF;

  SELECT count(*)::integer,
         coalesce(sum(lc.cantidad_inicial),0),
         coalesce(sum(lc.cantidad_restante),0),
         coalesce(sum(lc.cantidad_restante*lc.costo_unitario),0)
    INTO v_count,v_units_initial,v_units_remaining,v_lot_value
  FROM public.lotes_compra lc
  WHERE lc.id = ANY(v_lot_ids) AND lc.producto_id = v_product_id AND lc.costo_unitario = 1500;

  IF v_count <> 7 OR v_units_initial <> 775 OR v_units_remaining <> 475 OR v_lot_value <> 712500 THEN
    RAISE EXCEPTION 'Lot aggregate precondition mismatch: count %, initial %, remaining %, value %.',
      v_count,v_units_initial,v_units_remaining,v_lot_value;
  END IF;

  -- Every listed sale line must still be a Masareal line at cost 1500 in La Cueva.
  IF EXISTS (
    SELECT 1
    FROM unnest(v_sale_line_ids) AS expected(id)
    LEFT JOIN public.ventas_lineas vl ON vl.id=expected.id
    LEFT JOIN public.ventas v ON v.id=vl.venta_id
    WHERE vl.id IS NULL
       OR vl.producto_id IS DISTINCT FROM v_product_id
       OR vl.costo_unitario_fifo IS DISTINCT FROM 1500::numeric
       OR v.almacen_id IS DISTINCT FROM v_la_cueva_id
       OR vl.precio_unitario IS DISTINCT FROM 200::numeric
  ) THEN
    RAISE EXCEPTION 'One or more reviewed Masareal sale lines no longer match the before-image; no costs changed.';
  END IF;

  SELECT count(*)::integer,
         coalesce(sum(vl.cantidad),0),
         coalesce(sum(vl.subtotal),0),
         count(*) FILTER (WHERE vl.costo_unitario_fifo=1500)
    INTO v_count,v_sale_units,v_sales_revenue,v_sale_cost_lines
  FROM public.ventas_lineas vl
  WHERE vl.producto_id=v_product_id AND vl.costo_unitario_fifo=1500;

  IF v_count <> 12 OR v_count <> cardinality(v_sale_line_ids)
     OR v_sale_cost_lines <> 12 OR v_sale_units <> 25 OR v_sales_revenue <> 5000 THEN
    RAISE EXCEPTION 'Sale-line aggregate precondition mismatch: count %, units %, revenue %, lines-cost1500 %.',
      v_count,v_sale_units,v_sales_revenue,v_sale_cost_lines;
  END IF;

  -- Persist immutable before-images before touching any accounting cost.
  INSERT INTO private.bc_step4_masareal_fifo_cost_reconciliation_20261022
    (reconciliation_key,reason,lot_ids,sale_line_ids,lots_before,sale_lines_before)
  VALUES (
    v_key,
    'Correct known factor-10 presentation-cost bug from 1500 per base unit to 150 per base unit; quantity and sale totals remain untouched.',
    v_lot_ids,
    v_sale_line_ids,
    (SELECT coalesce(jsonb_agg(to_jsonb(lc) ORDER BY lc.id),'[]'::jsonb)
       FROM public.lotes_compra lc WHERE lc.id=ANY(v_lot_ids)),
    (SELECT coalesce(jsonb_agg(to_jsonb(vl) ORDER BY vl.id),'[]'::jsonb)
       FROM public.ventas_lineas vl WHERE vl.id=ANY(v_sale_line_ids))
  );

  UPDATE public.lotes_compra
     SET costo_unitario=150
   WHERE id=ANY(v_lot_ids) AND producto_id=v_product_id AND costo_unitario=1500;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 7 THEN
    RAISE EXCEPTION 'Expected to update 7 lots, updated %; transaction rolled back.',v_rows;
  END IF;

  UPDATE public.ventas_lineas
     SET costo_unitario_fifo=150
   WHERE id=ANY(v_sale_line_ids) AND producto_id=v_product_id AND costo_unitario_fifo=1500;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 12 THEN
    RAISE EXCEPTION 'Expected to update 12 sale lines, updated %; transaction rolled back.',v_rows;
  END IF;

  -- Read-back verification: total sold units, retail revenue and quantities must be unchanged.
  SELECT count(*)::integer,coalesce(sum(cantidad),0),coalesce(sum(subtotal),0),
         coalesce(sum(cantidad*costo_unitario_fifo),0)
    INTO v_count,v_sale_units,v_sales_revenue,v_lot_value
  FROM public.ventas_lineas
  WHERE id=ANY(v_sale_line_ids) AND producto_id=v_product_id AND costo_unitario_fifo=150;
  IF v_count<>12 OR v_sale_units<>25 OR v_sales_revenue<>5000 OR v_lot_value<>3750 THEN
    RAISE EXCEPTION 'Sale cost read-back mismatch; transaction rolled back.';
  END IF;

  SELECT count(*)::integer,coalesce(sum(cantidad_inicial),0),coalesce(sum(cantidad_restante),0),
         coalesce(sum(cantidad_restante*costo_unitario),0)
    INTO v_count,v_units_initial,v_units_remaining,v_lot_value
  FROM public.lotes_compra
  WHERE id=ANY(v_lot_ids) AND producto_id=v_product_id AND costo_unitario=150;
  IF v_count<>7 OR v_units_initial<>775 OR v_units_remaining<>475 OR v_lot_value<>71250 THEN
    RAISE EXCEPTION 'Lot cost read-back mismatch; transaction rolled back.';
  END IF;

  UPDATE private.bc_step4_masareal_fifo_cost_reconciliation_20261022
     SET lots_after=(SELECT coalesce(jsonb_agg(to_jsonb(lc) ORDER BY lc.id),'[]'::jsonb)
                       FROM public.lotes_compra lc WHERE lc.id=ANY(v_lot_ids)),
         sale_lines_after=(SELECT coalesce(jsonb_agg(to_jsonb(vl) ORDER BY vl.id),'[]'::jsonb)
                             FROM public.ventas_lineas vl WHERE vl.id=ANY(v_sale_line_ids)),
         verified_at=clock_timestamp()
   WHERE reconciliation_key=v_key;

  RAISE NOTICE 'Masareal FIFO cost reconciliation PASS: 7 lots, 12 sale lines; 775 original units, 475 remaining; 25 sold units; sales revenue $5000; corrected line CMV $3750. No stock quantities or sale totals changed.';
END;
$reconcile$;

COMMIT;

-- Recovery reference (execute only as a controlled rollback):
-- Read lots_before and sale_lines_before from private.bc_step4_masareal_fifo_cost_reconciliation_20261022
-- where reconciliation_key='masareal_factor10_fifo_2026-10-22'; restore only those backed-up rows.
