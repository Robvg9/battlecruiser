BEGIN;
DO $migration$
DECLARE
  v_function text:=pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure);
  v_old_stock text:=$old$WHERE r.almacen_id=v_s.almacen_id
      AND r.turno_sesion_id=v_s.id
      AND r.estado='APROBADA' AND r.fecha_revision IS NOT NULL$old$;
  v_new_stock text:=$new$WHERE r.almacen_id=v_s.almacen_id
      AND r.estado='APROBADA' AND r.fecha_revision IS NOT NULL
      AND r.creado_en>v_start_at AND r.creado_en<=v_end_at$new$;
  v_old_cash text:=$oldcash$FROM public.reinversiones r
  WHERE r.almacen_id=v_s.almacen_id
    AND r.turno_sesion_id=v_s.id
    AND r.estado IN ('APROBADA','PENDIENTE');$oldcash$;
  v_new_cash text:=$newcash$FROM public.reinversiones r
  WHERE r.almacen_id=v_s.almacen_id
    AND r.estado IN ('APROBADA','PENDIENTE')
    AND r.creado_en>v_start_at AND r.creado_en<=v_end_at;$newcash$;
BEGIN
  IF position(v_new_stock IN v_function)=0 THEN
    IF position(v_old_stock IN v_function)=0 THEN
      RAISE EXCEPTION 'Could not locate stock reinvestment filter; refusing partial rewrite.';
    END IF;
    v_function:=replace(v_function,v_old_stock,v_new_stock);
  END IF;
  IF position(v_new_cash IN v_function)=0 THEN
    IF position(v_old_cash IN v_function)=0 THEN
      RAISE EXCEPTION 'Could not locate cash reinvestment filter; refusing partial rewrite.';
    END IF;
    v_function:=replace(v_function,v_old_cash,v_new_cash);
  END IF;
  EXECUTE v_function;
END
$migration$;
COMMIT;
