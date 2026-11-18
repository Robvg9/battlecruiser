-- PostgreSQL 17 source contract for historical Jornada correction isolation.
DO $contract$
DECLARE
  v_type_check text;
  v_initial_correction text;
  v_liquidation text;
  v_balance text;
  v_inventory_read text;
  v_receipt text;
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO v_type_check
  FROM pg_constraint
  WHERE conrelid='public.turno_jornada_inventario_correcciones'::regclass
    AND conname='turno_jornada_inventario_correcciones_tipo_check';

  SELECT pg_get_functiondef(
    'public.bc7_corregir_inventario_inicial_jornada(uuid,jsonb,text)'::regprocedure
  ) INTO v_initial_correction;
  SELECT pg_get_functiondef(
    'public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure
  ) INTO v_liquidation;
  SELECT pg_get_functiondef(
    'public.bc7_jornada_saldos_operativos(uuid)'::regprocedure
  ) INTO v_balance;
  SELECT pg_get_functiondef(
    'public.bc7_obtener_inventario_jornada(uuid)'::regprocedure
  ) INTO v_inventory_read;
  SELECT pg_get_functiondef(
    'public.bc7_recibir_entrega_jornada(uuid,jsonb,text,uuid)'::regprocedure
  ) INTO v_receipt;

  IF position('INICIAL' IN coalesce(v_type_check,''))=0 THEN
    RAISE EXCEPTION 'Initial inventory corrections are not permitted by the correction table constraint.';
  END IF;

  IF position('tipo=''INICIAL''' IN v_initial_correction)=0
     OR position('INVENTARIO_INICIAL_CORREGIDO' IN v_initial_correction)=0
     OR position('corte_original_conservado' IN v_initial_correction)=0
     OR position('stock_global_modificado' IN v_initial_correction)=0 THEN
    RAISE EXCEPTION 'Initial inventory correction must be an audited overlay and preserve the source cut/global stock.';
  END IF;

  IF position('c.tipo=''INICIAL''' IN v_liquidation)=0
     OR position('historical_price.precio_venta_unitario' IN v_liquidation)=0
     OR position('correction.turno_sesion_id=v_s.id' IN v_liquidation)=0
     OR position('PRECIO_HISTORICO_JORNADA' IN v_liquidation)=0
     OR position('m.turno_sesion_id=v_s.id' IN v_liquidation)=0
     OR position('b.turno_sesion_id=v_s.id' IN v_liquidation)=0
     OR position('mr.turno_sesion_id=v_s.id' IN v_liquidation)=0 THEN
    RAISE EXCEPTION 'Jornada settlement must use the corrected initial quantity and isolate Mermas/Bajas by owning jornada.';
  END IF;

  IF position('c.tipo=''INICIAL''' IN v_balance)=0
     OR position('m.turno_sesion_id = p_turno_sesion_id' IN v_balance)=0
     OR position('b.turno_sesion_id = p_turno_sesion_id' IN v_balance)=0 THEN
    RAISE EXCEPTION 'Operational balance must use the corrected initial quantity and isolate Bajas/Mermas by session.';
  END IF;

  IF position('adj.cantidad_corregida' IN v_inventory_read)=0
     OR position('cantidad_original' IN v_inventory_read)=0
     OR position('cantidad_corregida' IN v_inventory_read)=0 THEN
    RAISE EXCEPTION 'Inventory workspace must display corrected quantities separately from immutable originals.';
  END IF;

  IF position('INVENTARIO_ENTREGA_REQUIERE_RECUENTO_POR_CORRECCION_ORIGEN' IN v_receipt)=0
     OR position('requiere_recuento' IN v_receipt)=0
     OR position('recepcion_creada'',false' IN v_receipt)=0 THEN
    RAISE EXCEPTION 'Receipt must stop and refresh a stale handover before creating a physical receipt attempt.';
  END IF;
END;
$contract$;
