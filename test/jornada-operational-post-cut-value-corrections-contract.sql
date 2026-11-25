-- Verify operationally closed value corrections remain session-local, while completed corrections retain global persistence.
DO $contract$
DECLARE
  v_def text;
BEGIN
  v_def:=pg_get_functiondef('public.bc7_ajustar_valores_producto_jornada(uuid,jsonb,text)'::regprocedure);
  IF position('v_s.estado NOT IN (''COMPLETADA'',''CERRADA_OPERATIVAMENTE'')' in v_def)=0 THEN
    RAISE EXCEPTION 'Value correction RPC does not accept both completed and operationally closed Jornadas.';
  END IF;
  IF position('IF v_s.estado=''COMPLETADA'' THEN' in v_def)=0 THEN
    RAISE EXCEPTION 'Global product writes are not restricted to completed Jornadas.';
  END IF;
  IF position('valores_solo_jornada' in v_def)=0
     OR position('catalogo_modificado' in v_def)=0 THEN
    RAISE EXCEPTION 'Session-local correction response flags are missing.';
  END IF;
END;
$contract$;
