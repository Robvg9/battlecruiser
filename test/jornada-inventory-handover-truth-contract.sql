-- PostgreSQL 17 contract for shared inventory handover source-of-truth behavior.
DO $contract$
DECLARE
  v_trigger text;
  v_correction text;
  v_resolver text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_preparar_entrega_inventario_jornada()'::regprocedure
  ) INTO v_trigger;
  SELECT pg_get_functiondef(
    'public.bc7_corregir_inventario_final_jornada(uuid,jsonb,text)'::regprocedure
  ) INTO v_correction;
  SELECT pg_get_functiondef(
    'public.bc7_resolver_entrega_jornada(uuid,text,text)'::regprocedure
  ) INTO v_resolver;

  IF position('coalesce(c.cantidad_corregida,l.cantidad_contada)' IN v_trigger)=0
     OR position('ON CONFLICT (entrega_id,producto_id) DO UPDATE' IN v_trigger)=0 THEN
    RAISE EXCEPTION 'Shared handover trigger does not snapshot the effective source FINAL.';
  END IF;

  IF position('INVENTARIO_ENTREGA_SINCRONIZADA_CORRECCION_FINAL' IN v_correction)=0
     OR position('e.estado IN (''PENDIENTE_PROGRAMACION'',''PENDIENTE_RECEPCION'',''REQUIERE_RECUENTO'')' IN v_correction)=0
     OR position('r.estado IN (''PENDIENTE_REVISION'',''ACEPTADA'')' IN v_correction)=0
     OR position('FOR UPDATE OF e,dl' IN v_correction)=0
     OR position('cantidad_declarada_anterior' IN v_correction)=0
     OR position('cantidad_declarada_actualizada' IN v_correction)=0 THEN
    RAISE EXCEPTION 'Late FINAL correction does not safely synchronize and audit an unreceived handover.';
  END IF;

  IF position('PERFORM public.bc7_corregir_inventario_final_jornada' IN v_resolver)>0
     OR position('corte_final_origen_modificado'',false' IN v_resolver)=0
     OR position('diferencias_registradas_en_recepcion' IN v_resolver)=0 THEN
    RAISE EXCEPTION 'Receipt approval must preserve the closed source FINAL and record physical differences in the receipt.';
  END IF;
END;
$contract$;
