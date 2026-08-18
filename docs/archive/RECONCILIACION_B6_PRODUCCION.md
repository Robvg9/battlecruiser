# RECONCILIACION_B6_PRODUCCION.md
Misión 2/3 — Reconciliación profunda B6. Generado 2026-08-17 por auditoría directa vía MCP sobre `papxnkkjtkxsitcsvcme` (Supabase producción), comparando contra los archivos reales del repo (`b6-nucleo-operativo.sql`, `m3-productos-editar-estado.sql`, `m4-auditoria-integridad-hardening.sql`) y contra `SUPABASE_REAL_STATE.md` / `RECONCILIACION_SUPABASE_GITHUB.md` de la Misión 1/3.

**Regla aplicada:** producción es la fuente de verdad. No se modificó producción en ningún punto de esta misión — solo lectura (`pg_get_functiondef`, grants, constraints).

---

## FASE 1 — Auditoría de los 7 RPC críticos

| Función | Estado en GitHub antes de esta misión | Resultado |
|---|---|---|
| `crear_producto` | `m3-productos-editar-estado.sql` | ✅ Coincide exacto con producción (comparado cuerpo a cuerpo) |
| `actualizar_producto` | `m3-productos-editar-estado.sql` | ✅ Coincide exacto |
| `cambiar_estado_producto` | `m3-productos-editar-estado.sql` | ✅ Coincide exacto |
| `registrar_compra` | Solo en `b6-nucleo-operativo.sql` (DEPRECATED, arquitectura distinta) | ❌ Sin representación real → agregada en `m6-reconciliacion-rpc-mutaciones-criticas.sql` |
| `registrar_venta` | Solo en `b6-nucleo-operativo.sql` (DEPRECATED) | ❌ Sin representación real → agregada |
| `registrar_transferencia` | Solo en `b6-nucleo-operativo.sql` (DEPRECATED) | ❌ Sin representación real → agregada |
| `registrar_vale_salida` | Solo en `b6-nucleo-operativo.sql` (DEPRECATED) | ❌ Sin representación real → agregada |

### Comparación detallada (parámetros / retorno / tablas / FIFO / idempotencia / permisos / auditoría / triggers / SECURITY DEFINER)

Las 7 funciones en producción comparten el mismo esqueleto:
- **SECURITY DEFINER** + `SET search_path TO 'public', 'pg_temp'` sin excepción.
- **Permiso** verificado al inicio con `tiene_permiso(seccion, accion)`, antes de cualquier otra cosa (excepto `registrar_transferencia`, que valida `origen ≠ destino` justo después del permiso pero antes de la idempotencia).
- **Idempotencia obligatoria**: `p_idempotency_key` es `NOT NULL` a nivel de lógica (si llega `NULL`, `raise exception`), y `private.reclamar_idempotencia(...)` se llama siempre en segundo lugar (o tercero en transferencia). Si ya existe un resultado para esa key, la función retorna ese resultado sin re-ejecutar nada — esto es lo que hace segura la reintentabilidad desde la cola offline del frontend.
- **Auditoría**: ninguna de las 4 mutaciones de inventario escribe en `auditoria_operaciones` directamente — lo hace el trigger `auditar_mutacion_operativa()` (AFTER INSERT) sobre `lotes_compra`/`ventas`/`transferencias`/`vales_salida`. `crear_producto`/`actualizar_producto`/`cambiar_estado_producto` también dependen del mismo trigger, montado sobre `productos` (AFTER INSERT OR UPDATE).
- **Retorno**: las 7 devuelven `uuid` escalar (el id de la fila creada/afectada), nunca `jsonb`. Confirmado también en el contrato real del frontend (`ejecutarOperacion()` en `app.js` distingue explícitamente este grupo de RPC de los que devuelven `jsonb` con campo `.id`, como `crear_conversacion`).

Diferencias reales entre funciones (no son bugs, son diseño):

- **FIFO**: `registrar_compra` no consume FIFO (es el origen de los lotes). `registrar_venta`, `registrar_transferencia` y `registrar_vale_salida` sí consumen, todas con el mismo patrón (`SELECT ... FOR UPDATE ORDER BY fecha_compra ASC`, recorrido con `LEAST(cantidad_restante, restante)`). Solo `registrar_venta` calcula `costo_unitario_fifo` (necesario para `rentabilidad_ventas`/reportes de margen); `registrar_transferencia` en cambio *crea un lote nuevo en el destino* heredando el costo del lote origen consumido (preserva trazabilidad de costo al cruzar de almacén); `registrar_vale_salida` solo descuenta `cantidad_restante`, no crea ni copia nada (es salida definitiva, sin destino).
- **Presentaciones comerciales**: las 4 (compra/venta/transferencia/vale) aceptan `p_presentacion_id` + `p_cantidad_presentacion` opcionales; si están presentes, convierten vía `obtener_conversion_presentacion()` (ya versionada en `m5-reconciliacion-supabase-github.sql`); si no, usan la cantidad en unidades base tal cual. `registrar_transferencia` y `registrar_venta` aplican esto **por línea** (son las únicas que reciben `jsonb` con array de líneas), no a nivel de llamada completa.
- **Precio**: solo `registrar_venta` calcula precio — usa `precio_mayorista` si el almacén es de tipo `'mayorista'` (falla si el producto no tiene ese precio configurado) o `precio_normal` en caso contrario. Las otras 3 no manejan precio.
- **Tablas modificadas**: ver tabla en la sección de Fase 3 más abajo — cada una toca un set distinto (detalle completo en `m6-reconciliacion-rpc-mutaciones-criticas.sql`, comentado función por función).

No se encontró ningún parámetro, columna o comportamiento en producción que no estuviera ya cubierto por el análisis anterior — no hay lógica "escondida" adicional en estas 7 funciones más allá de lo documentado aquí y en Misión 1/3.

---

## FASE 2 — Revisión de `b6-nucleo-operativo.sql`

**Ya marcado DEPRECATED en la Misión 1/3** (encabezado del archivo explica por qué). Esta misión confirma y detalla:

1. **Qué sigue siendo válido**: nada de su arquitectura (los 4 helpers `_consumir_fifo`/`_registrar_movimiento`/`_resolver_presentacion`/`_validar_usuario_operacion` no existen en producción). El *propósito* de cada función que define (registrar_compra, registrar_venta, etc.) sigue siendo el correcto — son las mismas 7 funciones que existen hoy — pero el *cuerpo* real diverge estructuralmente.
2. **Qué está obsoleto**: los 4 helpers completos, y el cuerpo de las 7 funciones que los invocan (`registrar_compra`, `registrar_venta`, `registrar_transferencia`, `registrar_vale_salida`, `crear_producto`, más `inventario_enriquecido`, `movimientos_producto`, `rentabilidad_ventas`, `historial_compras` que también define el archivo — estas últimas 4 no estaban en el alcance de "mutaciones críticas" de esta misión, quedan para revisión futura si hiciera falta).
3. **Funciones en producción que no están en este archivo**: `actualizar_producto`, `cambiar_estado_producto` (no existían en el diseño de b6, se agregaron después vía M3), y todo lo del esquema `private` (idempotencia real de servidor, inexistente en el diseño de b6).

**Decisión (Opción A vs B):** se eligió **Opción B — migraciones adicionales**, no un `b6-nucleo-operativo-v2.sql`. Razón: un archivo "v2" con el mismo nombre de base implicaría continuar la arquitectura de helpers reutilizables que b6 proponía — y esa arquitectura **no es la que producción usa ni la que se va a migrar hacia atrás** (cambiar producción para adoptarla sería una reescritura no solicitada por esta misión, que prohíbe "no inventar arquitectura"). Documentar la realidad (lógica inline, sin helpers) bajo un nombre nuevo (`m6-reconciliacion-rpc-mutaciones-criticas.sql`) es más honesto para mantenimiento futuro: quien lea el repo no asume una capa de abstracción que no existe.

---

## FASE 3 — Elementos versionados en esta misión

| Elemento | Tipo | Dónde queda |
|---|---|---|
| `registrar_compra` (real) | Función SECURITY DEFINER | `m6-reconciliacion-rpc-mutaciones-criticas.sql` |
| `registrar_venta` (real) | Función SECURITY DEFINER | `m6-reconciliacion-rpc-mutaciones-criticas.sql` |
| `registrar_transferencia` (real) | Función SECURITY DEFINER | `m6-reconciliacion-rpc-mutaciones-criticas.sql` |
| `registrar_vale_salida` (real) | Función SECURITY DEFINER | `m6-reconciliacion-rpc-mutaciones-criticas.sql` |
| Grants de las 4 anteriores (`authenticated`+`service_role`, sin `anon`) | Grants | `m6-reconciliacion-rpc-mutaciones-criticas.sql` |

No se encontraron, en esta pasada específica sobre los 7 RPC críticos, triggers/policies/helpers privados adicionales sin representar — los que existen (`auditar_mutacion_operativa`, `validar_producto_activo_en_mutacion`, sus 11 triggers, y el trío `tiene_permiso`/`obtener_conversion_presentacion`/`proteger_ultimo_dueno` + esquema `private`) ya estaban correctamente versionados por `m4-auditoria-integridad-hardening.sql` y `m5-reconciliacion-supabase-github.sql` respectivamente — verificado comparando cuerpo a cuerpo, no solo por nombre.

No se ejecutó ningún cambio destructivo ni de ningún tipo en producción.

---

## FASE 4 — Resumen de diferencias

| # | Elemento | Antes de esta misión | Ahora |
|---|---|---|---|
| 1 | `registrar_compra`/`venta`/`transferencia`/`vale_salida` reales | Sin archivo fiel (solo la versión obsoleta de b6) | Versionadas en `m6-reconciliacion-rpc-mutaciones-criticas.sql` |
| 2 | `crear_producto`/`actualizar_producto`/`cambiar_estado_producto` | Correctas en `m3-productos-editar-estado.sql` | Sin cambios (verificadas, coinciden) |
| 3 | Triggers de auditoría/validación + sus funciones | Correctos en `m4-auditoria-integridad-hardening.sql` | Sin cambios (verificados, coinciden) |
| 4 | `b6-nucleo-operativo.sql` | DEPRECATED (Misión 1/3) | Sin cambios — se mantiene como histórico, no se creó v2 |

---

## Corregido en esta sesión
- Se agregó al repo la única pieza real que faltaba de los 7 RPC prioritarios: los cuerpos reales de `registrar_compra`, `registrar_venta`, `registrar_transferencia`, `registrar_vale_salida`.

## Pendiente
- `inventario_enriquecido`, `movimientos_producto`, `rentabilidad_ventas`, `historial_compras` también están definidas (con arquitectura obsoleta) dentro de `b6-nucleo-operativo.sql` pero no formaban parte del alcance "mutaciones críticas" de esta misión — quedan sin auditar contra producción.
- Ninguna de las ~40 migraciones incrementales sin archivo individual (documentado en Misión 1/3, Hallazgo 6) tiene archivo `.sql` propio uno-a-uno; se sigue cubriendo solo por el "estado final" consolidado, no migración por migración (decisión ya tomada en Misión 1/3, se mantiene).
- Nada de lo entregado en esta misión fue probado en uso real por el usuario todavía (regla de oro del proyecto) — es un archivo de documentación/reconciliación aplicado en modo lectura, no un cambio funcional, así que el riesgo de romper algo en producción es nulo, pero la exactitud de la transcripción no ha sido validada por una segunda fuente además de esta auditoría.

## Riesgos actuales
- Ninguno nuevo introducido por esta misión (solo lectura + documentación).
- Riesgo ya conocido y sin cambios: `private.operaciones_idempotencia` tiene RLS deshabilitado (no explotable hoy porque `anon`/`authenticated` no tienen `USAGE` sobre el esquema `private`), documentado desde Misión 1/3.

---

## Estado final

VERIFICADO:
- `registrar_compra`, `registrar_venta`, `registrar_transferencia`, `registrar_vale_salida`: cuerpo real extraído de producción y versionado por primera vez con fidelidad.
- `crear_producto`, `actualizar_producto`, `cambiar_estado_producto`: ya representadas fielmente en `m3-productos-editar-estado.sql` (confirmado, sin cambios necesarios).
- `auditar_mutacion_operativa`, `validar_producto_activo_en_mutacion` + sus 11 triggers: ya representados fielmente en `m4-auditoria-integridad-hardening.sql` (confirmado, sin cambios necesarios).
- Grants de las 4 mutaciones críticas (`anon`: sin acceso; `authenticated`/`service_role`: EXECUTE) — coinciden con el patrón ya documentado en Misión 1/3.
- `b6-nucleo-operativo.sql` permanece como histórico marcado DEPRECATED, no se le agregó ni quitó nada; se optó por migración adicional (`m6-...`) en vez de un `-v2` que hubiera implicado inventar arquitectura no usada en producción.

PENDIENTE:
- Auditar `inventario_enriquecido`, `movimientos_producto`, `rentabilidad_ventas`, `historial_compras` (también definidas de forma obsoleta en b6, fuera del alcance de "mutaciones críticas" de esta misión) — candidato natural para Misión 3/3.
- Prueba real del usuario sobre los archivos entregados (regla de oro del proyecto): pendiente, como con toda entrega de esta y misiones anteriores.
- Las ~40 migraciones incrementales sin archivo `.sql` individual (Hallazgo 6 de Misión 1/3) siguen sin representación uno-a-uno, por decisión ya tomada de cubrir solo el estado final consolidado.
