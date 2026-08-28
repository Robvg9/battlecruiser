-- BattleCruiser TURNO — security hardening
-- Applied to Supabase LIVE on 2026-08-28.
-- Purpose: prevent unauthenticated invocation of SECURITY DEFINER Turno RPCs.
-- authenticated remains the application caller; functions continue enforcing
-- actor/role/state authorization internally.

REVOKE EXECUTE ON FUNCTION public.bc_actor_is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_aprobar_diferencia(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_aprobar_turno(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_asignar_turno_sesion(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_cerrar_turno_sesion(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_configurar_duracion_turnos(boolean,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_confirmar_recepcion_compra(uuid,boolean,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_crear_descuento(uuid,uuid,numeric,text,uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_crear_sucesor_turno(uuid,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_crear_turno(uuid,date,integer,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_crear_turno_sesion(uuid,integer,text,date,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_declarar_dinero(uuid,numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_editar_dias_turno(uuid,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_enviar_turno_a_aprobacion(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_iniciar_turno_sesion(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_interrumpir_y_relevar(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_obtener_configuracion_turnos() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_preparar_turno_sucesor(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_recibir_entrega_inventario(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_recibir_entrega_inventario(uuid,boolean,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_recibir_entrega_inventario_y_crear_sucesor(uuid,integer,boolean,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_registrar_entrega_inventario(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_registrar_llegada_compra(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_turno_estado(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bc_turno_transition(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.turno_actual_usuario() FROM PUBLIC, anon;
