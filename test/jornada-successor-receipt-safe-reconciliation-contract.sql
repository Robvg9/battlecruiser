DO $contract$
DECLARE
  v_preview oid := 'public.bc7_previsualizar_reconciliacion_final_sucesora(uuid)'::regprocedure;
  v_apply oid := 'public.bc7_aplicar_reconciliacion_final_sucesora(uuid,text,uuid)'::regprocedure;
  v_preview_def text;
  v_apply_def text;
BEGIN
  IF NOT has_function_privilege('authenticated',v_preview,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_apply,'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role must be able to call the owner-guarded reconciliation RPCs.';
  END IF;
  IF has_function_privilege('anon',v_preview,'EXECUTE')
     OR has_function_privilege('anon',v_apply,'EXECUTE')
 THEN
    RAISE EXCEPTION 'Anonymous/public access to successor reconciliation RPCs is forbidden.';
  END IF;
  SELECT pg_get_functiondef(v_preview) INTO v_preview_def;
  SELECT pg_get_functiondef(v_apply) INTO v_apply_def;
  IF position('bc_actor_is_admin' in v_preview_def)=0
     OR position('bc_actor_is_admin' in v_apply_def)=0
     OR position('transferencias' in v_preview_def)=0
     OR position('ventas' in v_preview_def)=0
     OR position('vales_salida' in v_preview_def)=0
     OR position('lotes_compra' in v_preview_def)=0
     OR position('reinversiones' in v_preview_def)=0
     OR position('bajas' in v_preview_def)=0
     OR position('mermas' in v_preview_def)=0
     OR position('stock' in v_preview_def)=0
     OR position('cantidad_corregida' in v_apply_def)=0
     OR position('JORNADA_FINAL_RECONCILIADO_RECEPCION_SUCESORA' in v_apply_def)=0
     OR position('idempotency_key' in v_apply_def)=0 THEN
    RAISE EXCEPTION 'Successor reconciliation functions are missing their authorization, stock movement, overlay or audit contract.';
  END IF;
  IF position('UPDATE public.turno_jornada_inventario_lineas' in v_apply_def)>0
     OR position('UPDATE public.turno_jornada_inventario_recepcion_lineas' in v_apply_def)>0
     OR position('UPDATE public.stock' in v_apply_def)>0
     OR position('UPDATE public.productos' in v_apply_def)>0 THEN
    RAISE EXCEPTION 'The reconciliation RPC must not mutate original cuts, receipt lines, stock or catalogue.';
  END IF;
END
$contract$;
