REVOKE EXECUTE ON FUNCTION public._entrega_caja_json(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._entrega_caja_json(uuid) FROM anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._validar_dia_n_sesion() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._validar_dia_n_sesion() FROM anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._validar_usuario_operacion(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._validar_usuario_operacion(text, text) FROM anon, authenticated, service_role;
