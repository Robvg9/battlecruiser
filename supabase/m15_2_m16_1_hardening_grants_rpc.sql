-- =================================================================
-- M15.2 / M16.1 — HARDENING DE GRANTS (patrón M17.1)
--
-- Verificado en vivo el 2026-08-21 (pg_proc.proacl / aclexplode)
-- contra producción (papxnkkjtkxsitcsvcme):
--
-- Ya en el patrón correcto (sin PUBLIC ni anon) — NO SE TOCAN:
--   crear_ciclo_operativo, listar_ciclos_operativos,
--   obtener_ciclo_operativo, crear_rol, finalizar_ciclo_operativo,
--   obtener_pendientes_cierre_ciclo
--
-- Todavía con EXECUTE explícito a PUBLIC y anon (inconsistente con
-- el patrón ya aplicado en M17.1) — SE CORRIGEN AQUÍ:
--   M15: iniciar_ciclo_operativo, iniciar_validacion_ciclo_operativo
--   M16: declarar_entrega_caja, registrar_conteo_entrega_caja,
--        registrar_recepcion_entrega_caja, revisar_entrega_caja,
--        listar_entregas_caja, obtener_entrega_caja
--
-- Nota de riesgo real (no cero, pero bajo): cada una de estas RPC
-- exige sesión vía _validar_usuario_operacion() -> auth.uid() no
-- nulo, así que 'anon' nunca pasa la validación interna hoy. Este
-- hardening no cambia comportamiento funcional para usuarios
-- autenticados; solo cierra la superficie de invocación pública
-- (rate-limit/DoS de intentos, ruido en logs, y consistencia con el
-- resto del esquema ya hardeneado).
--
-- Se incluye también registrar_conteo_entrega_caja (la huérfana):
-- se revoca igual que su par vigente por prolijidad, aunque no se
-- elimina la función (ver docs/BATTLECRUISER_M16_FUNCION_HUERFANA.md).
--
-- No modifica tablas, RLS, ni lógica de negocio. No borra funciones.
-- =================================================================

-- ---- M15 ----
REVOKE EXECUTE ON FUNCTION public.iniciar_ciclo_operativo(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.iniciar_ciclo_operativo(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.iniciar_ciclo_operativo(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.iniciar_validacion_ciclo_operativo(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.iniciar_validacion_ciclo_operativo(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.iniciar_validacion_ciclo_operativo(uuid, uuid) TO authenticated;

-- ---- M16 ----
REVOKE EXECUTE ON FUNCTION public.declarar_entrega_caja(uuid, numeric, uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.declarar_entrega_caja(uuid, numeric, uuid, uuid, uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.declarar_entrega_caja(uuid, numeric, uuid, uuid, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.registrar_conteo_entrega_caja(uuid, numeric, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.registrar_conteo_entrega_caja(uuid, numeric, text, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.registrar_conteo_entrega_caja(uuid, numeric, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.registrar_recepcion_entrega_caja(uuid, numeric, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.registrar_recepcion_entrega_caja(uuid, numeric, text, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.registrar_recepcion_entrega_caja(uuid, numeric, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.revisar_entrega_caja(uuid, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revisar_entrega_caja(uuid, text, text, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.revisar_entrega_caja(uuid, text, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.listar_entregas_caja(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.listar_entregas_caja(uuid, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.listar_entregas_caja(uuid, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.obtener_entrega_caja(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.obtener_entrega_caja(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.obtener_entrega_caja(uuid) TO authenticated;

-- =================================================================
-- FIN M15.2 / M16.1
-- =================================================================
