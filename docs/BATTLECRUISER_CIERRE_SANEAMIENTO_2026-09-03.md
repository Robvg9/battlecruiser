# BattleCruiser — Cierre de saneamiento

Fecha: 2026-09-03

## Resultado

21/21 bloques operativos cerrados con evidencia. La aplicación y los invariantes verificables en LIVE están cerrados. Quedan dos condiciones externas/no funcionales separadas del código: GitHub Actions continúa fallando al iniciar jobs sin steps/logs, y Supabase Auth mantiene desactivada la protección contra contraseñas comprometidas (Leaked Password Protection), que requiere configuración del proyecto fuera del SQL/conector disponible en esta sesión.

## Evidencia LIVE Supabase

Proyecto: `papxnkkjtkxsitcsvcme`

- `anon_security_definer_exec = 0`.
- Todas las tablas `public` auditadas tienen RLS habilitado.
- `v_stock_bajo_reposicion` tiene `security_invoker=true`.
- `bc_orden_bloque_sesion` tiene `search_path=public, pg_temp`.
- 27 turnos totales auditados.
- 2 turnos modernos abiertos coherentes `ABIERTO/EN_CURSO`.
- 1 caso histórico `CERRADO/EN_CURSO`, identificado previamente como residuo legacy.
- 0 turnos actuales `PENDIENTE_APROBACION`.
- 150 sesiones.
- 0 sesiones sin turno.
- 0 turnos modernos sin sesiones.
- 7 RPC críticas del flujo moderno presentes.

## GitHub / frontend

Checkpoint de código validado durante el cierre: `0e2a719e73ae02bce217f02e63293bf1b9a37e61`.

Cambios relevantes presentes en `main`:

- `public/js/turno-api.js`: solicitudes `PENDIENTE_APROBACION` enrutan a `bc_listar_turnos_maestros_home` y filtran `estado_maestro`.
- `public/app.js`: versión `9.4.77` y `turno-api.js?v=9.4.6`.
- `public/service-worker.js`: `BC_SW_VERSION = 9.4.77`.
- Migración `20260903190000_cerrar_execute_anon_rpc_legacy_restantes_20260903.sql` sincronizada con LIVE.

## Auditoría de seguridad

No quedan funciones `SECURITY DEFINER` del esquema `public` ejecutables por `anon`. Los WARN de `authenticated_security_definer_function_executable` se conservan en funciones que forman parte del contrato autenticado; el warning genérico del advisor no demuestra por sí mismo una vulnerabilidad.

Supabase Security Advisor reporta además `auth_leaked_password_protection`: protección contra contraseñas comprometidas desactivada. Supabase documenta esta opción como una configuración de Auth del proyecto; la superficie de escritura necesaria no está disponible mediante las acciones conectadas en esta sesión. No se marca como resuelto. citeturn521008search1

## Auditoría de rendimiento

El advisor reporta WARN/INFO sobre optimización RLS, políticas permisivas duplicadas, índices duplicados/no usados y foreign keys sin índices. Son hallazgos de rendimiento/limpieza, no evidencia de corrupción ni exposición actual. No se hicieron cambios masivos a ciegas porque la consolidación de políticas o eliminación de índices exige verificar predicados y constraints individuales. Supabase recomienda especialmente `(select auth.uid())` cuando la función no depende de la fila y recomienda índices para columnas usadas por RLS. citeturn521008search0turn521008search3

## CI

Quality reciente `#1218` / run `33793708968` y deploy Cloudflare reciente presentan fallos tempranos sin steps/logs en los jobs observados. Los runs inmediatamente anteriores muestran el mismo patrón. Esto se clasifica como bloqueo de infraestructura/runner y no como fallo funcional demostrado del código. No se declara CI verde.

## Regla de cierre

Implemented != validated. La fase queda cerrada en su alcance funcional, de seguridad y de coherencia verificable directamente sobre LIVE/GitHub. Los dos pendientes externos quedan explícitos: configurar Leaked Password Protection en Auth y recuperar la ejecución normal de GitHub Actions. No se ocultan bajo un ✅ artificial.
