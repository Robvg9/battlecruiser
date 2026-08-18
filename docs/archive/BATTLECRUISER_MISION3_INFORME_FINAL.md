# BATTLECRUISER — MISIÓN 3/3 — INFORME FINAL

## P. VEREDICTO FINAL: **MISIÓN 3/3 — CERRADA ✅**

Con una salvedad explícita en K/L (tests unitarios y concurrencia real no
ejecutables en este entorno — no es un bug, es una limitación de sandbox).
Todo lo que sí pude verificar/ejecutar quedó verde.

---

## A. Estado final
Los tres puntos pendientes de la vuelta anterior están cerrados:
1. Limpieza QA en producción → hecha y verificada con SQL directo (0 filas).
2. Auditoría campo por campo de los 10 reportes/RPC → hecha contra la
   definición real de producción. **No encontré ninguna discrepancia
   nueva** — todos los contratos ya estaban alineados desde los fixes de
   la sesión anterior (rentabilidad, compras, resumen ejecutivo).
3. Verificación final de coherencia producción↔repo↔app.js↔UI↔offline↔RPC
   → sin discrepancias.

## B. Cambios realizados
Ninguno nuevo en `app.js`/SQL esta vuelta (no hacía falta — ver E). Los
únicos cambios de esta sesión son en la base de datos:
- `DELETE` de las 5 filas QA descritas en M, en el orden correcto por FK.

## C. Bugs encontrados
Ninguno nuevo. La auditoría de reportes (obligatoria en esta vuelta) no
encontró discrepancias — confirma que los fixes previos de
`rentabilidad_ventas`, `historial_compras` y `reporte_resumen_ejecutivo`
siguen siendo correctos.

## D. Bugs corregidos
N/A esta vuelta (no había ninguno pendiente de código).

## E. Reportes auditados campo por campo
Para cada uno: `pg_get_functiondef` real de producción → columnas exactas →
grep del consumo en `app.js` → comparación 1:1.

| RPC | Columnas reales (producción) | Consumo en app.js | Resultado |
|---|---|---|---|
| `reporte_ventas` | id, fecha, almacen_id, almacen, total, lineas(producto_id,producto,cantidad,precio_unitario,subtotal) | `renderVentas`: v.almacen, v.total, v.fecha, l.producto/cantidad/precio_unitario/subtotal | ✅ coincide |
| `reporte_stock` | producto_id, producto, almacen, categoria, cantidad, minimo, estado | `renderStockReporte`: s.producto/almacen/categoria/cantidad/minimo/estado | ✅ coincide |
| `reporte_transferencias` | id, fecha, origen, destino, estado, unidades, lineas(producto,cantidad) | `renderTransferencias`: t.origen/destino/estado/unidades, l.producto/cantidad | ✅ coincide |
| `reporte_vales` | id, fecha, producto, almacen, tipo, cantidad | `renderVales`: va.tipo/producto/almacen/cantidad/fecha | ✅ coincide |
| `reporte_movimiento_inventario` | fecha, tipo, producto, almacen, cantidad, direccion, operacion_id | `renderMovimiento`: m.direccion/tipo/producto/almacen/cantidad/fecha | ✅ coincide |
| `movimientos_producto` | fecha, tipo, producto, almacen, cantidad (con signo), costo_unitario, usuario, operacion_id — **sin** columna `direccion** | `renderMovimientos`: infiere entrada/salida del signo de `m.cantidad` (no busca `m.direccion`), usa m.costo_unitario/usuario/tipo/producto/almacen | ✅ coincide — el frontend correctamente NO asume `direccion` acá (esa columna solo existe en `reporte_movimiento_inventario`, otra función) |
| `rentabilidad_ventas` | fecha, venta_id, producto, almacen, cantidad, precio_unitario, ingreso, costo_unitario_fifo, costo_total, margen, margen_porcentaje, costo_disponible | `renderRentabilidad`: r.ingreso, r.costo_disponible, r.costo_total, r.margen, r.margen_porcentaje, r.almacen, r.fecha | ✅ coincide |
| `historial_compras` | lote_id, fecha_compra, producto, almacen, cantidad_inicial, cantidad_restante, costo_unitario, costo_total, estado | `renderCompras`: c.fecha_compra/estado/producto/almacen/cantidad_restante/cantidad_inicial/costo_unitario/costo_total | ✅ coincide |
| `inventario_enriquecido` | producto_id, producto, almacen, cantidad, minimo, estado, costo_promedio, valor_inventario | `renderInventario`: s.valor_inventario/cantidad/estado (+ costo_promedio se usa más abajo en el detalle) | ✅ coincide |
| `reporte_resumen_ejecutivo` | jsonb: ventas{cantidad,ingresos,unidades,ticket_promedio}, transferencias{cantidad,unidades}, vales{cantidad,unidades}, inventario{productos,unidades,stock_bajo,stock_agotado}, compras{disponible,lotes,unidades_compradas,valor_compras,nota}, margen{disponible,margen_conocido,margen_pct_conocido,lineas_sin_costo,nota} | `renderResumenEjecutivo`: lee exactamente esas claves anidadas | ✅ coincide |

Ningún ORDER BY, UNION/UNION ALL, singular/plural, `null` vs `0`, o alias
encontrado en desacuerdo. Los "fixes" que la sesión anterior documentó en
comentarios (rentabilidad, compras, resumen ejecutivo) están efectivamente
aplicados y correctos contra la definición real de hoy en producción.

## F. Supabase producción
Verificado vía MCP contra `papxnkkjtkxsitcsvcme`:
- Las 10 funciones de reporte: definición completa extraída y comparada
  (tabla de arriba).
- Limpieza QA ejecutada con `DELETE` directo (ver M) y reverificada con
  `SELECT count(*)` post-borrado.

## G. Repo ↔ producción
Sin cambios respecto a la vuelta anterior (ya reconciliado: 46 RPC de
`app.js` ↔ 53 funciones de producción, 100% de coincidencia). No hizo falta
tocar el repo esta vuelta porque los reportes no tenían discrepancias.

## H. Frontend
Sin cambios de código esta vuelta — no encontré ningún bug que lo
justificara.

## I. Offline-first
Sin cambios. Confirmé que los reportes (lectura) correctamente **no** pasan
por `RPC_POR_TIPO`/cola offline — son solo lectura online, diseño correcto,
no debían estar ahí.

## J. Seguridad / RLS / GRANTS
Sin cambios — ya cerrado en la vuelta anterior (anon sin EXECUTE en las 53
funciones, `ALTER DEFAULT PRIVILEGES` aplicado).

## K. Tests ejecutados
```
node --check public/app.js               → OK
node --check public/service-worker.js    → OK
node --check test/*.test.js (8 archivos) → OK, los 8
```

## L. Tests no ejecutables (y por qué)
`npm test` sigue sin poder correr: `npm install` da `403 Forbidden` contra
`registry.npmjs.org` (sin red en este entorno) y no hay `node_modules/`
(`jsdom`, `fake-indexeddb`) preinstalado. **Limitación real de entorno, no
resuelta** — necesitarías correrlo vos localmente/CI con red, o subir
`node_modules/` ya armado.
Concurrencia real con dos conexiones simultáneas: **no verificable en este
entorno** (sin forma de abrir dos conexiones concurrentes a Supabase desde
acá). No inventé ningún resultado de ninguna de las dos.

## M. Datos QA eliminados
Identifiqué y confirmé que TODO pertenecía exclusivamente a la prueba de
concurrencia antes de borrar (0 referencias en `transferencias_lineas`,
`vales_salida`, `producto_presentaciones`, `auditoria_operaciones`; la
venta asociada tenía exactamente 1 línea, la del producto QA):

| Tabla | Fila eliminada |
|---|---|
| `productos` | `QA_CONCURRENCIA_TEST` (id `4d79a6b5-41a1-43e7-8b98-2052aa7898c3`) |
| `ventas` | 1 venta (id `add2e317-...`) — tenía una sola línea y era la del producto QA |
| `ventas_lineas` | 1 línea (id `5725eaf0-...`) |
| `lotes_compra` | 1 lote (id `e676c937-...`, origen='compra', 5.00/u) |
| `stock` | 1 fila (4 unidades restantes en el almacén de prueba) |

Orden respetado: `ventas_lineas` → `ventas` → `stock` → `lotes_compra` →
`productos`. Verificación posterior con `SELECT count(*)`:
`productos` con nombre `%QA%`/`%TEST%`/`%prueba%` = **0**, y las 4 filas
puntuales por id = **0**. Producto real restante en la tabla: 1
(`Masareal`), intacto.

## N. Archivos modificados
Ninguno nuevo esta vuelta (los dos SQL de la vuelta anterior —
`m3-productos-editar-estado.sql` y `m3-seguridad-revoke-anon-global.sql` —
siguen siendo el estado final del repo, sin cambios adicionales).

## O. Limitaciones restantes
1. `npm test` no ejecutable en este entorno (sin red / sin `node_modules`).
2. Concurrencia real (dos conexiones simultáneas) no verificable en este
   entorno — la sesión anterior ya había dejado la aproximación secuencial
   más fuerte posible sobre `FOR UPDATE`/idempotencia, no reabrí ese punto
   porque no encontré ninguna regresión que lo justificara.

Ninguna de las dos bloquea el cierre funcional: son huecos de verificación
de entorno, no bugs conocidos ni sin corregir.
