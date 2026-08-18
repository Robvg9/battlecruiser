# RECONCILIACIÓN FINAL DE REPORTES — Misión 3/3 (Battlecruiser)

**Proyecto Supabase auditado:** `battlecruiser` (`papxnkkjtkxsitcsvcme`)
**Fecha de auditoría:** 2026-08-17
**Alcance:** los 4 reportes que quedaron fuera de la Misión 2/3 — `inventario_enriquecido`, `movimientos_producto`, `rentabilidad_ventas`, `historial_compras`.
**Método:** extracción directa de producción vía MCP (`pg_get_functiondef`, grants reales, columnas reales de las tablas fuente), sin confiar en los archivos del repo.

## Tabla de reconciliación

| RPC | Producción | GitHub | Frontend (`app.js`) | Estado | Acción |
|---|---|---|---|---|---|
| `inventario_enriquecido(uuid)` | Existe. `SECURITY DEFINER`, `search_path='public, pg_temp'`. Grants: `authenticated`, `postgres`, `service_role` (sin `anon`). | Solo existe una versión vieja en `b6-nucleo-operativo.sql` (DEPRECATED), con `GRANT ... TO anon, authenticated` — no refleja producción. Ningún otro archivo la versiona. | Llama `client.rpc("inventario_enriquecido", {p_almacen_id})`. Lee `producto, almacen, cantidad, minimo, estado, costo_promedio, valor_inventario` — coincide campo por campo con el retorno real. | ⚠️ ALINEADO PERO FALTA VERSIONADO | Versionada en `m7-reconciliacion-reportes-produccion.sql` (copia fiel, sin cambiar producción). |
| `movimientos_producto(uuid,uuid,date,date,text,int,int)` | Existe. `SECURITY DEFINER`, `search_path='public, pg_temp'`. Grants: `authenticated`, `postgres`, `service_role`. Fuente unificada: `lotes_compra`, `ventas_lineas`+`ventas`, `transferencias_lineas`+`transferencias` (x2, entrada/salida), `vales_salida`. | Solo la versión vieja en `b6-nucleo-operativo.sql` (DEPRECATED, con grant a `anon`). | Llama con `p_producto_id, p_almacen_id, p_desde, p_hasta, p_tipo, p_limite, p_offset`. Lee `fecha, tipo, producto, almacen, cantidad, costo_unitario, usuario, operacion_id` — coincide exactamente. | ⚠️ ALINEADO PERO FALTA VERSIONADO | Versionada en `m7-reconciliacion-reportes-produccion.sql`. |
| `historial_compras(date,date,uuid,uuid,int,int)` | Existe. Filtra `lc.origen='compra'` (excluye lotes espejo de transferencia). `SECURITY DEFINER`, grants correctos, sin `anon`. | La versión en `b6-nucleo-operativo.sql` tiene **firma distinta** (5 parámetros, sin `p_producto_id`) y sin el filtro `origen='compra'` — no representa el estado real. | Llama con `p_desde, p_hasta, p_almacen_id, p_limite, p_offset` (no envía `p_producto_id`, usa su default `NULL`, válido). Lee `fecha_compra, producto, almacen, cantidad_restante, cantidad_inicial, estado, costo_unitario, costo_total` — coincide exactamente. Nota en el propio código: un fix anterior (Misión 3) ya corrigió un frontend viejo que leía campos (`c.fecha`, `c.proveedor`, `c.total`) que este RPC nunca devolvió. | ⚠️ ALINEADO PERO FALTA VERSIONADO | Versionada en `m7-reconciliacion-reportes-produccion.sql`. |
| `rentabilidad_ventas(date,date,uuid,uuid,int,int)` | Existe. Usa siempre `costo_unitario_fifo` histórico de `ventas_lineas` (nunca recalcula desde `lotes_compra` actual). `costo_disponible=false` cuando no hay costo — nunca inventa margen. Grants correctos, sin `anon`. | La versión en `b6-nucleo-operativo.sql` tiene **firma distinta** (5 parámetros, sin `p_producto_id`) — no representa el estado real. | Llama con `p_desde, p_hasta, p_almacen_id, p_limite, p_offset`. Lee `ingreso, costo_total, margen, margen_porcentaje, costo_disponible` — coincide exactamente. El código deja constancia de un fix previo (Misión 3) donde el frontend leía nombres que el RPC nunca devolvió (`ingresos`, `cmv`, `ganancia_bruta`). | ⚠️ ALINEADO PERO FALTA VERSIONADO | Versionada en `m7-reconciliacion-reportes-produccion.sql`. |

**No se encontró ningún ❌ DRIFT REAL ni ❌ BUG REAL en estos 4 reportes.** Producción y frontend ya coincidían exactamente en los 4 casos (el drift que existió entre frontend y estos RPC ya había sido corregido en una sesión anterior, según los comentarios "Misión 3 fix" presentes en `app.js`).

## Detalle por fase

### Fase 1 — Producción (verificado vía MCP)
Se extrajo la definición completa de las 4 funciones con `pg_get_functiondef`, sus grants reales (`aclexplode`), y se confirmó que todas las columnas que consultan (`lotes_compra`, `stock`, `ventas_lineas`, `ventas`, `transferencias_lineas`, `transferencias`, `vales_salida`, `productos`, `almacenes`, `usuarios`) existen tal cual en producción. Las 4 son `SECURITY DEFINER` con `search_path` fijo (`public, pg_temp`) y dependen de la función auxiliar `public.tiene_permiso(seccion, accion)`, también auditada.

### Fase 2 — Frontend (`public/app.js`)
Se localizaron las 4 llamadas (`client.rpc(...)`) y sus funciones `render*` correspondientes. Los nombres de parámetros enviados y los nombres de campo leídos del resultado coinciden exactamente con la firma y el retorno reales de cada RPC. No se modificó `app.js`.

### Fase 3 — GitHub
- `supabase/b6-nucleo-operativo.sql`: **DEPRECATED** (confirmado, no se reactivó ni se tocó). Contiene versiones viejas de las 4 funciones con firmas distintas a producción (`historial_compras` y `rentabilidad_ventas` con 5 parámetros en vez de 6, sin `p_producto_id`) y `GRANT EXECUTE ... TO anon, authenticated` — grant que ya no existe en producción.
- `supabase/m5-reconciliacion-supabase-github.sql`: no versiona estos 4 RPC (documenta otras piezas: esquema `private`, capa de conversión de presentaciones, trigger de protección de último dueño).
- `SUPABASE_REAL_STATE.md`: documenta las firmas reales correctas (coinciden con lo verificado en Fase 1), pero es un documento descriptivo, no un SQL ejecutable/versionable.
- `RECONCILIACION_B6_PRODUCCION.md`: confirma explícitamente que estos 4 RPC "no formaban parte del alcance... quedan sin auditar contra producción" — es el hueco que cierra esta Misión 3/3.
- `supabase/m6-reconciliacion-rpc-mutaciones-criticas.sql`: mencionado en el encargo pero no estaba entre los archivos subidos a este chat, así que no se pudo inspeccionar directamente su contenido. Según `RECONCILIACION_B6_PRODUCCION.md`, tampoco cubre estos 4 reportes.

### Fase 4 — Decisión
Como producción y frontend ya coincidían exactamente y el único problema era falta de versionado en GitHub, se creó `m7-reconciliacion-reportes-produccion.sql`: una copia fiel de las 4 funciones (extraídas con `pg_get_functiondef`), con `CREATE OR REPLACE` (idempotente, no cambia nada si se re-ejecuta) y sus `REVOKE`/`GRANT` reales. **No se aplicó ningún cambio a producción** — las funciones ya existían exactamente así.

## Qué SÍ hice
- Auditar producción directamente vía MCP (definiciones, grants, columnas).
- Auditar `app.js` para los 4 reportes.
- Comparar contra los archivos de GitHub disponibles.
- Crear `RECONCILIACION_REPORTES_PRODUCCION.md` (este archivo).
- Crear `m7-reconciliacion-reportes-produccion.sql` para versionar en GitHub las 4 funciones reales.

## Qué NO hice
- No modifiqué `public/app.js` ni ningún otro archivo de frontend.
- No modifiqué ni reemplacé `b6-nucleo-operativo.sql` (sigue deprecated, intacto).
- No apliqué ningún cambio a producción (Supabase): las 4 funciones ya estaban exactamente así; el SQL creado es solo para versionado en el repo, no se ejecutó contra la base.
- No inventé ningún RPC ni corregí ningún bug (porque no se encontró ninguno).

## Pendiente / limitaciones
- **No tengo acceso de escritura a GitHub en esta sesión** (no hay conector de GitHub habilitado, solo Supabase y Netlify). Por eso no hay SHA de commit: `m7-reconciliacion-reportes-produccion.sql` y este informe quedan en `/mnt/user-data/outputs/` para que el usuario los suba manualmente al repo (`Robvg9/battlecruiser`, carpeta `supabase/`).
- No pude inspeccionar `supabase/m6-reconciliacion-rpc-mutaciones-criticas.sql` porque no fue subido a este chat; según la documentación existente, no afecta a estos 4 reportes.
- `git status` no se pudo verificar (sin acceso al repositorio local/remoto desde esta sesión); no se afirma que esté "limpio".
- No hay tests automatizados disponibles para estos RPC en el material provisto; la verificación fue manual, contra el estado real de producción.

## Estado final de los 4 reportes
Los 4 — `inventario_enriquecido`, `movimientos_producto`, `historial_compras`, `rentabilidad_ventas` — quedan: **✅ funcionando correctamente en producción, ✅ alineados con el frontend, ⚠️→✅ ahora versionados en GitHub** (pendiente solo de que el usuario suba el archivo SQL al repo).
