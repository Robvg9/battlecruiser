# RECONCILIACIÓN SUPABASE ↔ GITHUB

**Proyecto:** `papxnkkjtkxsitcsvcme`
**Verificado por:** consulta directa a producción (Claude, Misión 1/3).
**Fecha:** 2026-08-17.

Comparación entre producción real (verificado por consulta directa) y los archivos `.sql` de `/supabase`.

**Regla aplicada:** producción es la fuente de verdad. Ningún hallazgo aquí implica "arreglar" producción — implica que GitHub necesita ponerse al día con lo que ya funciona en producción, o marcar como obsoleto lo que el repo tiene pero producción no.

---

## Hallazgo 1 — `b6-nucleo-operativo.sql` es SQL antiguo/no aplicado tal cual

`b6-nucleo-operativo.sql` define 4 funciones helper (`_consumir_fifo`, `_registrar_movimiento`, `_resolver_presentacion`, `_validar_usuario_operacion`) y hace que `registrar_compra`/`registrar_venta`/`registrar_transferencia`/`registrar_vale_salida`/`crear_producto` las llamen.

**Verificado en producción:** ninguna de esas 4 funciones existe. Las funciones reales en producción tienen la lógica de FIFO y de conversión de presentación escrita en línea, y usan `private.reclamar_idempotencia(...)` (esquema que no existía en ningún archivo del repo) en vez de un helper `_validar_usuario_operacion`.

La migración `schema_migrations` tampoco registra ninguna entrada llamada `b6_nucleo_operativo` — en su lugar hay ~15 migraciones incrementales con otros nombres (`crear_ventas`, `presentaciones_multiples_base`, `fn_obtener_conversion_presentacion`, `integrar_presentaciones_registrar_compra`, `registrar_venta_presentaciones`, `registrar_transferencia_presentaciones`, `registrar_vale_salida_presentaciones`, `drop_old_registrar_vale_salida_overload`, `fix_registrar_vale_salida_grants`, `crear_producto_rpc_idempotente`, `crear_producto_fix_grants`, y los `b3_7_exigir_idempotency_key_*` que agregaron el patrón de idempotencia real vía `private.reclamar_idempotencia`).

**Conclusión:** `b6-nucleo-operativo.sql` fue un borrador/diseño de esa capa que nunca se aplicó como tal — producción llegó al mismo resultado funcional por un camino incremental distinto, sesión por sesión.

**Acción:** no borrarlo (regla de la misión). Marcado en el repo como DEPRECATED. Ver `SUPABASE_REAL_STATE.md` sección 5.

---

## Hallazgo 2 — Funciones reales en producción sin ningún archivo `.sql` de origen en el repo

Tres funciones centrales, invocadas constantemente por RLS y por las 4 mutaciones core, no estaban definidas por ningún `CREATE FUNCTION` en los archivos del repo:

| Función | Creada por (migración real) | Versionada en |
|---|---|---|
| `tiene_permiso(p_seccion, p_accion)` | Migración fundacional anterior a b3–b8 | `m5-reconciliacion-supabase-github.sql` §2 |
| `obtener_conversion_presentacion(p_producto_id, p_presentacion_id, p_cantidad)` | `fn_obtener_conversion_presentacion` (2026-08-12) | `m5-reconciliacion-supabase-github.sql` §3 |
| `proteger_ultimo_dueno()` + trigger | `b3_6_trigger_proteccion_ultimo_dueno` | `m5-reconciliacion-supabase-github.sql` §4 |

**Acción:** incluidas textualmente (definición real de producción) en `supabase/m5-reconciliacion-supabase-github.sql`, para que el repo las tenga versionadas.

---

## Hallazgo 3 — Esquema `private` completo, no documentado en el repo

Producción tiene un segundo esquema, `private`, con:

- **Tabla:** `private.operaciones_idempotencia`
- **Función:** `private.reclamar_idempotencia(...)`

Este es el mecanismo real de idempotencia que usan `registrar_compra`, `registrar_venta`, `registrar_transferencia`, `registrar_vale_salida` (y las RPC de M3). Ningún archivo previo del repo mencionaba el esquema `private`.

**Nota de seguridad (documentada, no accionable):** `private.operaciones_idempotencia` tiene RLS deshabilitado. No es explotable hoy porque ni `anon` ni `authenticated` tienen `USAGE` sobre el esquema `private`. Ver `SUPABASE_REAL_STATE.md` sección 1.

**Acción:** el esquema `private` completo se incluye en `supabase/m5-reconciliacion-supabase-github.sql` §1.

---

## Hallazgo 4 — 8 tablas de B4/B7/B8 con RLS activo pero sin policies (por diseño)

`auditoria_operaciones`, `turnos`, `cuadres`, `responsabilidades`, `incidencias`, `conversaciones`, `participantes_conversacion`, `mensajes`: las 8 tienen RLS habilitado y cero policies. Supabase marca esto como advertencia `rls_enabled_no_policy` (nivel INFO). No es un error — es el patrón de diseño validado: acceso 100% vía RPC `SECURITY DEFINER`.

**Acción:** ninguna. Documentado en `SUPABASE_REAL_STATE.md` sección 3.

---

## Hallazgo 5 — Grants: coinciden con lo esperado, sin diferencias

`anon` tiene cero grants en cualquier tabla y cero `EXECUTE` en cualquier función de `public` (confirmado por consulta directa). Consistente con `m3-seguridad-revoke-anon-global.sql`. No se encontró ninguna función ni tabla con grant a `anon`.

**Acción:** ninguna. Documentado en `SUPABASE_REAL_STATE.md` sección 4.

---

## Hallazgo 6 — ~40 migraciones aplicadas sin archivo `.sql` individual en el repo

De las 61 migraciones en `schema_migrations`, solo una fracción tiene un archivo `.sql` de igual alcance entre los del repo. El resto —parches puntuales aplicados sesión a sesión vía MCP directo a producción— no tiene representación individual.

**Acción:** la migración `m5-reconciliacion-supabase-github.sql` cierra esto consolidando el estado final de las piezas que no tenían ningún archivo de origen (Hallazgos 2 y 3), no migración por migración.

---

## Resumen de diferencias

| # | Elemento | En repo (archivos) | En producción real | Acción |
|---|---|---|---|---|
| 1 | `_consumir_fifo`, `_registrar_movimiento`, `_resolver_presentacion`, `_validar_usuario_operacion` | Sí (`b6-nucleo-operativo.sql`) | No existen | Marcar archivo como DEPRECATED, no borrar |
| 2 | `registrar_compra/venta/transferencia/vale_salida` (versión real) | No (repo tiene versión distinta y obsoleta) | Sí, con lógica inline + `private.reclamar_idempotencia` | Documentar versión real en M5 (estado parcial; versión completa en Misión 2/3) |
| 3 | `tiene_permiso()` | No | Sí (usada en 24 policies) | Agregar a `m5-reconciliacion-supabase-github.sql` §2 |
| 4 | `obtener_conversion_presentacion()` | No | Sí | Agregar a `m5-reconciliacion-supabase-github.sql` §3 |
| 5 | `proteger_ultimo_dueno()` + su trigger | No | Sí | Agregar a `m5-reconciliacion-supabase-github.sql` §4 |
| 6 | Esquema `private` completo (tabla + función) | No | Sí | Agregar a `m5-reconciliacion-supabase-github.sql` §1 |
| 7 | 8 tablas B4/B7/B8 sin policies | Implícito (diseño ya conocido) | Confirmado, sin cambios | Ninguna — solo documentar |
| 8 | Grants a `anon` | Revocados (`m3-seguridad-revoke-anon-global.sql`) | Cero grants confirmado | Ninguna — coincide |
| 9 | ~40 migraciones incrementales sin archivo propio | No | Sí, aplicadas | Cubierto por `m5-reconciliacion-supabase-github.sql` (estado final) |
