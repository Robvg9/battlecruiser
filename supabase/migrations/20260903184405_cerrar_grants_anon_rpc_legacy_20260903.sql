REVOKE EXECUTE ON FUNCTION public.editar_almacen(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.listar_movimientos_caja(uuid, date, date, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.listar_reinversiones(uuid, date, date, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.obtener_email_login_por_nombre(text) FROM anon;
