# RECONCILIACION_SUPABASE_GITHUB.md
Comparación entre producción real (`papxnkkjtkxsitcsvcme`, verificado por consulta directa) y los 10 archivos `.sql` de `/supabase` entregados como representación del repositorio:
`b3-roles-permisos.sql`, `b4-auditoria-trazabilidad.sql`, `b4-b8-production-hardening.sql`, `b5-reportes.sql`, `b6-nucleo-operativo.sql`, `b7-operacion-humana.sql`, `b8-comunicacion.sql`, `m3-productos-editar-estado.sql`, `m3-seguridad-revoke-anon-global.sql`, `m4-auditoria-integridad-hardening.sql`.

**Regla aplicada:** producción es la fuente de verdad. Ningún hallazgo aquí implica "arreglar" producción — implica que GitHub necesita ponerse al día con lo que ya funciona en producción, o marcar como obsoleto lo que el repo tiene pero producción no.

---

## Hallazgo 1 — El archivo `b6-nucleo-operativo.sql` es SQL antiguo/no aplicado tal cual

`b6-nucleo-operativo.sql` define 4 funciones helper (`_consumir_fifo`, `_registrar_movimiento`, `_resolver_presentacion`, `_validar_usuario_operacion`) y hace que `registrar_compra`/`registrar_venta`/`registrar_transferencia`/`registrar_vale_salida`/`crear_producto` las llamen.

**Verificado en producción:** ninguna de esas 4 funciones existe (`select proname from pg_proc where proname ilike '%fifo%' or ...` → 0 filas para los 4 nombres). Las funciones reales `registrar_compra`/`registrar_venta`/`registrar_transferencia`/`registrar_vale_salida` en producción tienen la lógica de FIFO y de conversión de presentación **escrita en línea**, y usan `private.reclamar_idempotencia(...)` (esquema que no existe en ningún archivo del repo) en vez de un helper `_validar_usuario_operacion`.

Comparé también el cuerpo completo de `registrar_compra` y `registrar_venta` reales contra la versión del archivo: difieren estructuralmente, no solo en detalles menores. La migración `schema_migrations` tampoco registra ninguna entrada llamada `b6_nucleo_operativo` — en su lugar hay ~15 migraciones incrementales con otros nombres (`crear_ventas`, `presentaciones_multiples_base`, `fn_obtener_conversion_presentacion`, `integrar_presentaciones_registrar_compra`, `registrar_venta_presentaciones`, `registrar_transferencia_presentaciones`, `registrar_vale_salida_presentaciones`, `drop_old_registrar_vale_salida_overload`, `fix_registrar_vale_salida_grants`, `crear_producto_rpc_idempotente`, `crear_producto_fix_grants`, y luego los `b3_7_exigir_idempotency_key_*` que agregaron el patrón de idempotencia real vía `private.reclamar_idempotencia`).

**Conclusión:** `b6-nucleo-operativo.sql` fue probablemente un borrador/diseño de esa capa que **nunca se aplicó como tal** — producción llegó al mismo resultado funcional por un camino incremental distinto, sesión por sesión. El archivo es SQL obsoleto/histórico, no un reflejo de producción.

**Acción:** no borrarlo (regla de la misión). Marcarlo en el repo como `DEPRECATED — ver funciones reales en la migración de reconciliación adjunta` sin eliminarlo.

## Hallazgo 2 — Funciones reales en producción sin ningún archivo `.sql` de origen en el repo

Tres funciones centrales, invocadas constantemente por RLS y por las 4 mutaciones core, no están definidas por ningún `CREATE FUNCTION` en los 10 archivos:

- **`tiene_permiso(p_seccion text, p_accion text)`** — es la base de las 24 policies RLS y de casi todos los checks de permiso dentro de las funciones. No aparece en `b3-roles-permisos.sql` pese a ser lógicamente parte de "roles y permisos" — debe haberse creado en una migración fundacional anterior a la numeración b3–b8 (`08_roles_y_permisos` u otra de las migraciones de 2026-08-10, que tampoco tienen archivo `.sql` en el repo entregado).
- **`obtener_conversion_presentacion(p_producto_id, p_presentacion_id, p_cantidad)`** — creada por la migración `fn_obtener_conversion_presentacion` (2026-08-12), sin archivo `.sql` correspondiente en el repo.
- **`proteger_ultimo_dueno()`** (trigger de `usuarios`) — creada por `b3_6_trigger_proteccion_ultimo_dueno`; tampoco tiene archivo propio, aunque conceptualmente pertenecería a `b3-roles-permisos.sql`.

**Acción:** incluidas textualmente (definición real de producción) en la migración de reconciliación adjunta, para que el repo las tenga versionadas.

## Hallazgo 3 — Esquema `private` completo, no documentado en el repo

Producción tiene un segundo esquema, `private`, con:
- tabla `private.operaciones_idempotencia` (11 filas reales)
- función `private.reclamar_idempotencia(...)`

Este es el mecanismo real de idempotencia que usan `registrar_compra`, `registrar_venta`, `registrar_transferencia`, `registrar_vale_salida` (y probablemente otras RPC con `p_idempotency_key`, a confirmar en Misión 2). **Ninguno de los 10 archivos del repo menciona el esquema `private`.** Las notas de sesiones anteriores (memoria del proyecto) hablan de idempotencia vía `idempotency_key` a nivel de IndexedDB en el cliente, pero el mecanismo de servidor (tabla + función `private.*`) es enteramente nuevo para el repo.

**Nota de seguridad (no accionable de inmediato, solo para que quede documentada):** `private.operaciones_idempotencia` tiene RLS deshabilitado. No es explotable hoy porque ni `anon` ni `authenticated` tienen `USAGE` sobre el esquema `private` — solo es alcanzable desde funciones `SECURITY DEFINER` propiedad de `postgres`. Se documenta como hallazgo de arquitectura, no se cambia nada (fuera del alcance "no agregar funcionalidades / no inventar cambios" de esta misión).

**Acción:** el esquema `private` completo se incluye en la migración de reconciliación adjunta.

## Hallazgo 4 — 8 tablas de B4/B7/B8 con RLS activo pero sin policies (por diseño)

`auditoria_operaciones`, `turnos`, `cuadres`, `responsabilidades`, `incidencias`, `conversaciones`, `participantes_conversacion`, `mensajes`: las 8 tienen RLS habilitado y **cero policies**, lo que Supabase marca como advertencia (`rls_enabled_no_policy`, nivel INFO). No es un hallazgo nuevo — coincide con lo que ya documentaba la auditoría B8.6 anterior registrada en memoria del proyecto ("acceso 100% vía RPC, sin depender de policies"). Se re-confirma aquí con evidencia fresca porque la misión pide auditar sin asumir nada como dado.

**Acción:** ninguna. Es el patrón de diseño ya validado; se deja documentado en `SUPABASE_REAL_STATE.md` para que quede explícito en el repo.

## Hallazgo 5 — Grants: coinciden con lo esperado, sin diferencias

`anon` tiene cero grants en cualquier tabla y cero `EXECUTE` en cualquier función de `public` (confirmado por consulta directa, no por inferencia de los archivos). Esto es consistente con `m3-seguridad-revoke-anon-global.sql` y con `m3_revoke_anon_execute_all_functions` en el historial de migraciones. **No se encontró ninguna función ni tabla con grant a `anon`.** Sin diferencias que reportar aquí.

## Hallazgo 6 — ~40 migraciones aplicadas sin archivo `.sql` individual en el repo

De las 61 migraciones en `schema_migrations`, solo una fracción tiene un archivo `.sql` de igual alcance entre los 10 entregados (aproximadamente los 8 bloques grandes: b3, b4, b5, b6\*, b7, b8, m3\*, m4). El resto — parches puntuales aplicados sesión a sesión vía MCP directo a producción (`b3_6_*`, `b3_7_*`, `b3_8_*`, `b3_9_*`, `b5_1`–`b5_4`, `b6_audit_*`, `b8_1`, `b8_2`, `b8_6`, `m2_*`, y las migraciones fundacionales de 2026-08-10 a 2026-08-12) — no tiene representación individual en el repo. Esto coincide con lo que ya registraba la memoria del proyecto: varias sesiones anteriores aplicaron cambios "vía MCP (no simulado)" directo a producción sin generar el archivo `.sql` correspondiente para GitHub.

**Acción:** esto es exactamente lo que la migración de reconciliación adjunta busca cerrar — no migración por migración (serían ~40 archivos triviales), sino consolidando el **estado final real** de las piezas que hoy no tienen ningún archivo de origen (Hallazgos 2 y 3), que es lo que realmente le falta al repo para poder reconstruir producción desde cero.

---

## Resumen de diferencias (tabla)

| # | Elemento | En repo (archivos) | En producción real | Acción |
|---|---|---|---|---|
| 1 | `_consumir_fifo`, `_registrar_movimiento`, `_resolver_presentacion`, `_validar_usuario_operacion` | Sí (b6-nucleo-operativo.sql) | No existen | Marcar archivo como DEPRECATED, no borrar |
| 2 | `registrar_compra`/`venta`/`transferencia`/`vale_salida` (versión real) | No (repo tiene versión distinta y obsoleta) | Sí, con lógica inline + `private.reclamar_idempotencia` | Documentar versión real en migración de reconciliación |
| 3 | `tiene_permiso()` | No | Sí (usada en 24 policies) | Agregar a migración de reconciliación |
| 4 | `obtener_conversion_presentacion()` | No | Sí | Agregar a migración de reconciliación |
| 5 | `proteger_ultimo_dueno()` + su trigger | No | Sí | Agregar a migración de reconciliación |
| 6 | Esquema `private` completo (tabla + función) | No | Sí | Agregar a migración de reconciliación |
| 7 | 8 tablas B4/B7/B8 sin policies | Implícito (diseño ya conocido) | Confirmado, sin cambios | Ninguna — solo documentar |
| 8 | Grants a `anon` | Revocados (m3-seguridad-revoke-anon-global.sql) | Cero grants confirmado | Ninguna — coincide |
| 9 | ~40 migraciones incrementales sin archivo propio | No | Sí, aplicadas | Cubierto por migración de reconciliación (estado final, no migración por migración) |
