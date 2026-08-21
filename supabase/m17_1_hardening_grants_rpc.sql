-- =====================================================================
-- M17.1 — Hardening de grants RPC
-- =====================================================================
-- Alcance: SOLO estas 2 funciones (M17). No toca tablas, columnas,
-- lógica de negocio, RPC internas, ni M14/M15/M16.
--
-- Contexto (auditoría M17, 21/08/2026, papxnkkjtkxsitcsvcme):
-- finalizar_ciclo_operativo(uuid, uuid) y
-- obtener_pendientes_cierre_ciclo(uuid) tenían EXECUTE otorgado a
-- PUBLIC y anon, a diferencia del patrón ya vigente en el proyecto
-- para M14 completo (abrir_turno, cerrar_turno, registrar_venta,
-- registrar_cuadre, revisar_cuadre) y parte de M15
-- (crear_ciclo_operativo, listar_ciclos_operativos,
-- obtener_ciclo_operativo), donde solo authenticated/postgres/
-- service_role tienen acceso.
--
-- Ambas funciones ya validan la sesión y el permiso internamente vía
-- public._validar_usuario_operacion('ciclos','ver'|'editar_any')
-- (RAISE EXCEPTION si auth.uid() es NULL o si falta el permiso), así
-- que este cambio es defensa en profundidad — cierra el acceso a
-- nivel de rol de Postgres además del chequeo de permisos a nivel de
-- aplicación, y evita que un cliente no autenticado (anon) siquiera
-- pueda invocar la función.
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.finalizar_ciclo_operativo(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalizar_ciclo_operativo(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalizar_ciclo_operativo(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.obtener_pendientes_cierre_ciclo(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.obtener_pendientes_cierre_ciclo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.obtener_pendientes_cierre_ciclo(uuid) TO authenticated;

-- postgres y service_role mantienen su acceso: son dueños/roles con
-- privilegio implícito y ya tenían grants explícitos previos que este
-- script no toca (no se revoca nada de esos dos roles).
-- =====================================================================
