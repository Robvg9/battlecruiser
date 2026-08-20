-- HARDENING — Misión 5 (2026-08-20)
--
-- public._validar_usuario_operacion(text, text) es un helper interno
-- SECURITY DEFINER (owner postgres), llamado únicamente desde 12 funciones
-- SECURITY DEFINER (owner postgres) de turnos/responsabilidades/incidencias/
-- comunicación (abrir_turno, cerrar_turno, registrar_cuadre, revisar_cuadre,
-- crear_responsabilidad, actualizar_responsabilidad, crear_incidencia,
-- resolver_incidencia, crear_conversacion, cerrar_conversacion,
-- agregar_participante, enviar_mensaje). Esas llamadas se ejecutan bajo el
-- contexto de `postgres` (propietario), no bajo `authenticated`, por lo que
-- el grant a `authenticated` es innecesario. Sin caller directo desde
-- frontend (`client.rpc(...)`). Patrón correcto ya seguido por su función
-- auxiliar equivalente, public._es_participante, que nunca tuvo EXECUTE
-- para `authenticated`.
--
-- Auditoría previa (Misión 5 — auditoría): confirma que revocar authenticated
-- no rompe ningún flujo real.

REVOKE EXECUTE
ON FUNCTION public._validar_usuario_operacion(text, text)
FROM authenticated;
