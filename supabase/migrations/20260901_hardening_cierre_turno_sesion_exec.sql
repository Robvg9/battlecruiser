-- BattleCruiser — hardening
-- El cierre moderno es una operación autenticada; no debe ser ejecutable por anon/public.
revoke all on function public.bc_declarar_y_cerrar_turno_sesion(uuid,numeric) from public,anon;
grant execute on function public.bc_declarar_y_cerrar_turno_sesion(uuid,numeric) to authenticated,service_role;
