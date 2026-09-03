REVOKE EXECUTE ON FUNCTION public.bc_anular_turno(uuid, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.bc_interrumpir_y_relevar_con_declaracion(uuid, uuid, text, numeric) FROM public;
REVOKE EXECUTE ON FUNCTION public.bc_listar_turnos_maestros_home(integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.bc_anular_turno(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc_interrumpir_y_relevar_con_declaracion(uuid, uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc_listar_turnos_maestros_home(integer, integer) TO authenticated;
