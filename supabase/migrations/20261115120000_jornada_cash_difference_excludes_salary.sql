-- The attendant salary is accrued in CuevaCoin and settled later.
-- It must be shown as payroll, never deducted from the current Jornada cash balance.
BEGIN;
DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure)
    INTO v_definition;
  v_old := $old$v_expected_cash:=CASE WHEN v_sales_total IS NOT NULL AND v_salary IS NOT NULL
    THEN round(v_sales_total-v_expenses-v_reinvestments-v_salary,2) ELSE NULL END;$old$;
  v_new := $new$v_expected_cash:=CASE WHEN v_sales_total IS NOT NULL
    THEN round(v_sales_total-v_expenses-v_reinvestments,2) ELSE NULL END;$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Expected cash formula not found exactly once in bc7_liquidacion_inventario_jornada(uuid).';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$'efectivo_esperado_despues_de_gastos_reinversiones_salario',v_expected_cash,$old$;
  v_new := $new$'efectivo_esperado_despues_de_gastos_reinversiones',v_expected_cash,
    'efectivo_esperado_despues_de_gastos_reinversiones_salario',v_expected_cash,
    'formula_efectivo','Ventas - gastos aprobados - reinversiones aprobadas. El salario se acumula y paga por separado; no se descuenta de esta caja.',$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Expected cash JSON key not found exactly once in bc7_liquidacion_inventario_jornada(uuid).';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.bc7_obtener_revision_jornada(uuid)'::regprocedure)
    INTO v_definition;
  v_old := $old$v_adjusted_expected:=CASE WHEN v_adjusted_salary IS NOT NULL
      THEN round(v_adjusted_sales-coalesce((v_liq->>'gastos_aprobados')::numeric,0)
        -coalesce((v_liq->>'reinversiones_aprobadas')::numeric,0)-v_adjusted_salary,2) ELSE NULL END;$old$;
  v_new := $new$v_adjusted_expected:=CASE WHEN v_adjusted_sales IS NOT NULL
      THEN round(v_adjusted_sales-coalesce((v_liq->>'gastos_aprobados')::numeric,0)
        -coalesce((v_liq->>'reinversiones_aprobadas')::numeric,0),2) ELSE NULL END;$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Expected cash formula not found exactly once in bc7_obtener_revision_jornada(uuid).';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$'efectivo_esperado_despues_de_gastos_reinversiones_salario',v_adjusted_expected,$old$;
  v_new := $new$'efectivo_esperado_despues_de_gastos_reinversiones',v_adjusted_expected,
      'efectivo_esperado_despues_de_gastos_reinversiones_salario',v_adjusted_expected,
      'formula_efectivo','Ventas - gastos aprobados - reinversiones aprobadas. El salario se acumula y paga por separado; no se descuenta de esta caja.',$new$;
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'Expected cash JSON key not found exactly once in bc7_obtener_revision_jornada(uuid).';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END
$migration$;

COMMENT ON FUNCTION public.bc7_liquidacion_inventario_jornada(uuid) IS
  'Jornada inventory liquidation. Attendant salary is separate payroll and excluded from cash expectation.';
COMMENT ON FUNCTION public.bc7_obtener_revision_jornada(uuid) IS
  'Owner Jornada review. Cash reconciliation excludes accrued attendant salary; salary remains a separate payroll amount.';
COMMIT;
