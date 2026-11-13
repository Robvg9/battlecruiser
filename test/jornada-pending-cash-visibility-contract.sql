DO $contract$
DECLARE
  v_definition text;
BEGIN
  v_definition := pg_get_functiondef('public.listar_aprobaciones_admin()'::regprocedure);
  IF position('ESPERANDO_ENTREGA' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Admin approval queue must expose final cash declarations awaiting employee handover';
  END IF;
  IF position('monto_contado IS NULL' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Only declarations without a physical count may appear in this queue';
  END IF;
  IF position('AND s.estado=''COMPLETADA''' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'Pending cash visibility must not be hidden until the session is COMPLETADA';
  END IF;
  IF position('tiene_permiso' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Admin approval queue must retain its permission gate';
  END IF;
END;
$contract$;
