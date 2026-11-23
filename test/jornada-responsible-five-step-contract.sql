\set ON_ERROR_STOP on
DO $responsible_five_step_contract$
DECLARE
  v_confirm text:=pg_get_functiondef('public.bc7_confirmar_bloque_jornada(uuid,text,boolean)'::regprocedure);
  v_state text:=pg_get_functiondef('public.bc7_estado_confirmaciones_jornada(uuid)'::regprocedure);
  v_cash text:=pg_get_functiondef('public.bc5_responsable_declarar_dinero_jornada(uuid,numeric)'::regprocedure);
  v_inventory text:=pg_get_functiondef('public.bc7_responsable_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,uuid)'::regprocedure);
  v_helper text:=pg_get_functiondef('public.bc7_validar_bloque_abierto_jornada(uuid,text,uuid)'::regprocedure);
  v_gasto text:=pg_get_functiondef('public.bc7_registrar_gasto_jornada(uuid,text,numeric,text,uuid)'::regprocedure);
  v_reinversion text:=pg_get_functiondef('public.bc7_registrar_reinversion_jornada(uuid,jsonb,uuid,text)'::regprocedure);
  v_bajas text:=pg_get_functiondef('public.bc7_registrar_bajas_multiple_jornada(uuid,jsonb,text,uuid)'::regprocedure);
  v_ajuste text:=pg_get_functiondef('public.bc7_registrar_ajuste_jornada(uuid,text,uuid,numeric,text,uuid)'::regprocedure);
  v_liquidacion text:=pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure);
  v_close text:=pg_get_functiondef('public.bc5_cerrar_jornada(uuid,text)'::regprocedure);
  v_transfer text:=pg_get_functiondef('public.bc7_vincular_transferencia_jornada(uuid,uuid,text)'::regprocedure);
  v_count text:=pg_get_functiondef('public.bc7_contar_efectivo_dueno_jornada(uuid,numeric,text)'::regprocedure);
  v_read_count text:=pg_get_functiondef('public.bc7_estado_conteo_efectivo_jornada(uuid)'::regprocedure);
  v_approvals text:=pg_get_functiondef('public.listar_aprobaciones_admin()'::regprocedure);
  v_owner_review text:=pg_get_functiondef('public.bc7_obtener_revision_jornada(uuid)'::regprocedure);
  v_acl boolean;
BEGIN
  IF v_confirm NOT LIKE '%bc7_validar_tramo_responsable_jornada%'
     OR v_confirm NOT LIKE '%BC7_SEALED_WORKER_BLOCK_CONFIRM_V3%'
     OR v_confirm LIKE '%Solo ADMIN puede confirmar bloques%'
     OR v_confirm LIKE '%Todavía hay gastos pendientes de revisión%'
     OR v_confirm LIKE '%Todavía hay reinversiones pendientes de revisión%' THEN
    RAISE EXCEPTION 'FAIL: the assigned worker must be able to confirm completeness after seal, independently of Owner approvals.';
  END IF;

  IF v_state NOT LIKE '%turno_jornada_entregas_diarias%'
     OR v_state NOT LIKE '%v_daily_registered=v_daily_expected%'
     OR v_state NOT LIKE '%declaracion_registrada%'
     OR v_state NOT LIKE '%entregas_diarias_esperadas%'
     OR v_state LIKE '%public.turno_declaraciones%'
     OR v_state LIKE '%DINERO_DECLARADO%' THEN
    RAISE EXCEPTION 'FAIL: Step 5 must be completed by exactly one daily entry for each calendar date, without a separate worker final declaration.';
  END IF;

  IF v_liquidacion NOT LIKE '%turno_jornada_conteos_caja%'
     OR v_liquidacion NOT LIKE '%v_daily_cash%'
     OR v_liquidacion NOT LIKE '%THEN v_final_counted ELSE NULL END%'
     OR v_liquidacion LIKE '%v_daily_cash+v_final_counted%'
     OR v_liquidacion NOT LIKE '%coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha+1%' THEN
    RAISE EXCEPTION 'FAIL: settlement must use inclusive daily dates and the Owner physical count exactly once.';
  END IF;

  IF v_close NOT LIKE '%turno_jornada_entregas_diarias%'
     OR v_close NOT LIKE '%a.tipo=''minorista''%'
     OR v_close NOT LIKE '%Antes de entregar la Jornada debes registrar una entrega de dinero por cada fecha%'
     OR v_close NOT LIKE '%turno_declaraciones%' THEN
    RAISE EXCEPTION 'FAIL: retail close must require daily entries only while legacy non-retail declaration handling remains isolated.';
  END IF;

  IF to_regclass('public.turno_jornada_conteos_caja') IS NULL
     OR v_count NOT LIKE '%turno_jornada_conteos_caja%'
     OR v_count NOT LIKE '%v_daily_total%'
     OR v_read_count NOT LIKE '%turno_jornada_conteos_caja%' THEN
    RAISE EXCEPTION 'FAIL: the Owner count must be stored and read in its own protected table.';
  END IF;

  IF v_approvals NOT LIKE '%coalesce(a.tipo,'''')<>''minorista''%'
     OR v_approvals NOT LIKE '%''entrega_diaria''::text%'
     OR v_approvals NOT LIKE '%''declaracion_jornada''::text%' THEN
    RAISE EXCEPTION 'FAIL: daily retail deliveries remain reviewable, but legacy final-declaration rows must stay out of retail approvals without being deleted.';
  END IF;

  IF v_owner_review NOT LIKE '%''es_minorista''%'
     OR v_owner_review NOT LIKE '%a.tipo=''minorista''%' THEN
    RAISE EXCEPTION 'FAIL: Owner review must know whether each session is retail so historical declarations can be hidden from its active cash flow.';
  END IF;

  IF v_transfer NOT LIKE '%CERRADA_OPERATIVAMENTE%'
     OR v_transfer NOT LIKE '%v_s.estado NOT IN%'
     OR v_transfer NOT LIKE '%v_s.turno_id%'
     OR v_transfer NOT LIKE '%t.estado=''ABIERTO''%'
     OR v_transfer NOT LIKE '%v_t.fecha<=v_period_end%'
     OR v_transfer NOT LIKE '%v_t.almacen_destino_id<>v_s.almacen_id%'
     OR v_transfer NOT LIKE '%v_existing.turno_sesion_id=v_s.id%'
     OR v_transfer NOT LIKE '%TRANSFERENCIA_RETROACTIVA_VINCULADA%' THEN
    RAISE EXCEPTION 'FAIL: historical transfer attribution must allow sealed sessions without removing master-turn, period, date, destination, one-link idempotency or audit guards.';
  END IF;

  IF v_cash NOT LIKE '%bc7_validar_tramo_responsable_jornada%'
     OR v_cash NOT LIKE '%DINERO_DECLARACION_TRANSCRITA_ADMIN%'
     OR v_cash NOT LIKE '%DINERO_DECLARACION_RESPONSABLE_SUSTITUYE_TRANSCRIPCION%'
     OR v_cash NOT LIKE '%DINERO_DECLARACION_RESPONSABLE_RECTIFICA_RECHAZO%'
     OR v_cash NOT LIKE '%transcripcion_original_conservada%'
     OR v_cash NOT LIKE '%declarado_at=now()%' THEN
    RAISE EXCEPTION 'FAIL: worker cash declaration must replace an ADMIN transcription without erasing its audit trail.';
  END IF;

  IF v_inventory NOT LIKE '%bc7_validar_tramo_responsable_jornada%'
     OR v_inventory NOT LIKE '%CERRADA_OPERATIVAMENTE%'
     OR v_inventory NOT LIKE '%corte_operativo_at%'
     OR v_inventory NOT LIKE '%v_initial_cut%'
     OR v_inventory NOT LIKE '%bc7_jornada_saldos_operativos%'
     OR v_inventory NOT LIKE '%stock_global_modificado%'
     OR v_inventory NOT LIKE '%idempotency_key%' THEN
    RAISE EXCEPTION 'FAIL: sealed final inventory must be assigned-worker-only, anchored to the opening product set and immutable cutoff, audited and idempotent.';
  END IF;

  IF v_helper NOT LIKE '%turno_jornada_confirmaciones%'
     OR v_helper NOT LIKE '%idempotency_key%'
     OR v_gasto NOT LIKE '%bc7_validar_bloque_abierto_jornada%'
     OR v_reinversion NOT LIKE '%bc7_validar_bloque_abierto_jornada%'
     OR v_bajas NOT LIKE '%bc7_validar_bloque_abierto_jornada%'
     OR v_ajuste NOT LIKE '%bc7_validar_bloque_abierto_jornada%' THEN
    RAISE EXCEPTION 'FAIL: closed expense, reinvestment, Baja and merma blocks must be protected by server-side locks while exact idempotent retries remain valid.';
  END IF;

  SELECT has_function_privilege('authenticated',
      'public.bc5_responsable_declarar_dinero_jornada(uuid,numeric)','EXECUTE')
     AND NOT has_function_privilege('anon',
      'public.bc5_responsable_declarar_dinero_jornada(uuid,numeric)','EXECUTE')
     AND has_function_privilege('authenticated',
      'public.bc7_responsable_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,uuid)','EXECUTE')
     AND NOT has_function_privilege('anon',
      'public.bc7_responsable_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,uuid)','EXECUTE')
    INTO v_acl;
  IF NOT v_acl THEN
    RAISE EXCEPTION 'FAIL: new responsible-only RPC grants must be limited to authenticated callers.';
  END IF;

  RAISE NOTICE 'PASS Jornada contract: five-step completion, daily-only cash handover, independent Owner cash count, non-duplicated settlement, sealed transfer attribution and legacy isolation.';
END
$responsible_five_step_contract$;
