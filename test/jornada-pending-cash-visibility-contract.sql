DO $contract$
DECLARE
  v_definition text;
BEGIN
  v_definition := pg_get_functiondef('public.listar_aprobaciones_admin()'::regprocedure);
  IF position('d.estado_aprobacion' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Final cash declaration must keep its own approval state while the Jornada is active';
  END IF;
  IF position('monto_contado IS NULL' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Only declarations without a physical count may appear in this queue';
  END IF;
  IF position('CASE WHEN s.estado=''COMPLETADA'' THEN d.estado_aprobacion ELSE ''ESPERANDO_ENTREGA'' END' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'Final cash approval must not be tied to employee handover; the Jornada approval is separate';
  END IF;
  IF position('tiene_permiso' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Admin approval queue must retain its permission gate';
  END IF;
END;
$contract$;
