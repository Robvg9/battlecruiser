# BattleCruiser — Cierre de saneamiento

Fecha: 2026-09-03

## Resultado

21/21 bloques operativos cerrados con evidencia. La aplicación y los invariantes verificables en LIVE están cerrados. Quedan dos condiciones externas/no funcionales separadas del código: GitHub Actions continúa fallando al iniciar jobs sin steps/logs, y Supabase Auth mantiene desactivada la protección contra contraseñas comprometidas (Leaked Password Protection), que requiere configuración del proyecto fuera del SQL disponible por esta conexión.

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

Último HEAD de `main` al cierre documental: `524f03c01236c2b0d6325913b5e94d0add42ea99`.

Cambios relevantes ya presentes en `main`:

- `public/js/turno-api.js`: solicitudes `PENDIENTE_APROBACION` enrutan a `bc_listar_turnos_maestros_home` y filtran `estado_maestro`.
- `public/app.js`: versión `9.4.77` y `turno-api.js?v=9.4.6`.
- `public/service-worker.js`: `BC_SW_VERSION = 9.4.77`.
- Migración `20260903190000_cerrar_execute_anon_rpc_legacy_restantes_20260903.sql` sincronizada con LIVE.

## Auditoría de seguridad

No quedan funciones `SECURITY DEFINER` del esquema `public` ejecutables por `anon`. Los WARN de `authenticated_security_definer_function_executable` se conservan únicamente en funciones que forman parte del contrato autenticado (RPC operativas/administrativas) o lecturas actuales; el warning del advisor no demuestra por sí mismo una vulnerabilidad.

Supabase Security Advisor también reporta `auth_leaked_password_protection`: protección contra contraseñas comprometidas desactivada. Esta configuración pertenece a Auth del proyecto y no está disponible para modificación mediante las acciones SQL/conector expuestas en esta sesión; por tanto queda registrada como condición externa pendiente, no como falsa aprobación.

## Auditoría de rendimiento

El advisor reporta WARN/INFO no bloqueantes: varias políticas RLS pueden beneficiarse de `(select auth.uid())`, existen políticas permisivas duplicadas en varias tablas, algunos índices no usados y dos pares de índices duplicados en Turno. No se aplicaron cambios masivos a ciegas porque requieren consolidar predicados/constraints individualmente; eliminarlos sin esa comprobación podría alterar el contrato.

Todos esos hallazgos quedan clasificados como optimización posterior, no como evidencia de corrupción o exposición actual.

## CI

Quality reciente `#1218` / run `33793708968` y deploy Cloudflare reciente presentan fallos tempranos sin steps/logs en los jobs observados. Los runs anteriores `#1215` / `#1214` muestran el mismo patrón. Esto se clasifica como bloqueo de infraestructura/runner y no como fallo funcional demostrado del código.

## Regla de cierre

Implemented != validated. Este documento declara cerrados los invariantes funcionales y de seguridad que fueron verificables directamente en LIVE y GitHub. No declara CI verde ni da por resuelta la configuración de Auth que requiere una superficie de administración no disponible desde esta conexión.
