-- Contract: approved daily cash replaces the redundant Owner physical-count gate.
DO $$
DECLARE
  v_liquidation text:=pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure);
  v_checklist text:=pg_get_functiondef('public.bc7_estado_confirmaciones_jornada(uuid)'::regprocedure);
  v_cash_status text:=pg_get_functiondef('public.bc7_estado_conteo_efectivo_jornada(uuid)'::regprocedure);
  v_queue text:=pg_get_functiondef('public.listar_aprobaciones_admin()'::regprocedure);
BEGIN
  IF position('turno_jornada_conteos_caja' IN v_liquidation)>0 THEN
    RAISE EXCEPTION 'Retail settlement still depends on the Owner physical cash count table.';
  END IF;
  IF position('turno_jornada_conteos_caja' IN v_checklist)>0 THEN
    RAISE EXCEPTION 'The five-step checklist still depends on the Owner physical cash count table.';
  END IF;
  IF position('turno_jornada_conteos_caja' IN v_cash_status)>0 THEN
    RAISE EXCEPTION 'The daily cash status RPC still reads the physical cash count table.';
  END IF;
  IF position('v_daily_approved' IN v_checklist)=0
     OR position('v_daily_pending' IN v_checklist)=0
     OR position('PENDIENTE_APROBACION_DIARIA' IN v_checklist)=0 THEN
    RAISE EXCEPTION 'The checklist is not gated by approvals for every daily cash date.';
  END IF;
  IF position('v_daily_cash' IN v_liquidation)=0
     OR position('v_daily_approved=v_daily_expected' IN v_liquidation)=0
     OR position('v_cash_received' IN v_liquidation)=0 THEN
    RAISE EXCEPTION 'The financial settlement does not use the complete approved daily-cash total.';
  END IF;
  IF position('CERRADA_OPERATIVAMENTE' IN v_queue)=0
     OR position('HAVING count(*) FILTER(WHERE s.estado IN' IN v_queue)=0 THEN
    RAISE EXCEPTION 'The admin queue does not include sealed operational Jornada sessions correctly.';
  END IF;
  RAISE NOTICE 'PASS: approved daily cash is the sole retail cash verification; sealed Jornadas enter Admin review.';
END;
$$;
