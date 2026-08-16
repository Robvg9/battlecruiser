# BATTLECRUISER — ADDENDUM AL CEREBRO
## Auditoría técnica consolidada — 2026-08-14

Este documento complementa `BATTLECRUISER_CEREBRO.md` con hallazgos recientes verificados sobre el estado técnico del repositorio. No sustituye al Cerebro maestro.

## ESTADO REAL CONFIRMADO (actualizado R2 — 2026-08-16)

- Repo: `Robvg9/battlecruiser`.
- Rama base: `main`.
- PR R1 frontend: **#4 abierto, draft, mergeable**. Base `main`; head `vibe/r1-frontend-b53-b8-catalogos-c16993`.
- R1 tiene `150/150` tests PASS y `node --check public/app.js` OK, según la entrega del ejecutor.
- R1 todavía NO está mergeado en `main`; por tanto, no considerarlo parte de producción hasta que sea integrado/verificado.
- PR R2 frontend: **#5 abierto, ready-for-review, mergeable**. Base `main`; head `vibe/r2-centro-control-ventas-c16993`.
- R2 es independiente de R1 y funciona sobre `main` puro.
- R2 tiene `144/144` tests PASS sobre `main` puro y `node --check public/app.js` OK, según la entrega del ejecutor.
- R2 añade al Centro de Control el resumen de ventas recientes y las ventas dentro de Últimos movimientos.
- R2 todavía NO está mergeado en `main`; no considerarlo parte de producción hasta que sea integrado/verificado.
- App/Service Worker y demás estados deben seguir verificándose contra el código real, no contra versiones antiguas del Cerebro.
- B7 implementado: turnos, cuadres, responsabilidades, incidencias. SQL en `supabase/b7-operacion-humana.sql` (pendiente de aplicar según el estado documentado).
- B8 implementado en frontend: comunicación y coordinación (conversaciones, mensajes, chat contextual, soporte). SQL en `supabase/b8-comunicacion.sql` (pendiente de aplicar según el estado documentado).

### CORRECCIÓN CRÍTICA de B6 (auditoría en vivo contra Supabase)
- `lotes_compra` **SÍ EXISTE** (columnas: id, producto_id, almacen_id, cantidad_restante, costo_unitario, fecha_compra, cantidad_inicial). Este addendum y el Cerebro B5 decían que NO existía: estaban equivocados.
- NO existen (404 real): `compras`, `compras_lineas`, `movimientos_stock`, `movimientos`, `auditoria_operaciones`.
- Los RPC `registrar_compra`, `registrar_venta`, `registrar_transferencia`, `registrar_vale_salida`, `crear_producto`, `registrar_auditoria`, `listar_auditoria_admin`, `reporte_*`, `asignar_rol_usuario`, `cambiar_estado_usuario`, `permisos_por_rol` **NO existían** en Supabase antes de B6. El SQL de B3/B4/B5 estaba versionado pero no aplicado.
- RPC que SÍ existían: `tiene_permiso`, `perfil_usuario_actual`, `permisos_usuario_actual`, `usuario_esta_activo`, `listar_usuarios_admin`, `listar_roles_admin`.
- B6 crea los RPC faltantes + las tablas `compras` y `movimientos_stock` en `supabase/b6-nucleo-operativo.sql`. Roberto debe aplicar ese SQL (y los de B3/B4/B5) en el SQL Editor.
- Arquitectura: frontend vanilla HTML/CSS/JS + Supabase + IndexedDB + Service Worker.
- Archivos principales: `public/app.js`, `public/index.html`, `public/style.css`, `public/service-worker.js`.
- `public/` es el directorio de assets servido por Cloudflare/Wrangler.

## B2.2-A — VELOCIDAD OFFLINE

CERRADA.

Optimizaciones confirmadas:
- conexión IndexedDB memoizada;
- contador mediante índice + `count()`;
- lectura de pendientes mediante índices;
- sin segunda cola/caché;
- `ejecutarOperacion()` conservado;
- `idempotency_key`, FIFO y estados conservados.

Validación con fake-indexeddb: 5 operaciones pasaron de 15 aperturas de IndexedDB a 1 apertura.
Prueba de navegador real: pendiente cuando no exista navegador disponible.

## B2.2-B.2 — PRODUCTOS OFFLINE

CERRADA.

Backend verificado en Supabase:
`public.crear_producto(p_nombre, p_categoria_id, p_unidad, p_precio_normal, p_precio_mayorista, p_idempotency_key)`.

El RPC:
- reutiliza `private.operaciones_idempotencia`;
- reutiliza `private.reclamar_idempotencia`;
- usa `tipo_operacion = 'crear_producto'`;
- valida permiso mediante `tiene_permiso('productos','crear')`;
- es `SECURITY DEFINER` con `search_path` fijo;
- tiene GRANT restringido al patrón establecido.

No se creó una tabla de idempotencia específica para productos.
No se modificaron los cuatro RPC existentes, RLS ni la arquitectura central.

Frontend confirmado:
- `RPC_POR_TIPO.producto = 'crear_producto'`;
- el formulario de producto usa `ejecutarOperacion('producto', ...)`;
- se eliminó el INSERT directo a `public.productos` para esta operación;
- la misma `idempotency_key` se conserva durante reintentos.

Pruebas de código reportadas y ejecutadas por el ejecutor: 25/25 aserciones OK con DOM simulado, fake-indexeddb y Supabase mockeado.
No se debe afirmar prueba de navegador real si no se ejecutó.

## B2.2-B.3 — UX DE OPERACIONES PENDIENTES

CERRADA mediante PR #1 + PR #2.

- B2.2-B.3.1: panel integrado para visualizar operaciones pendientes.
- B2.2-B.3.2: detalle, reintento y eliminación controlada.
- Reutiliza la única cola `operaciones_pendientes` y la infraestructura existente.
- No creó segunda cola, store IndexedDB, caché ni sistema paralelo.

## B2.2-D — RECONCILIACIÓN Y CONSISTENCIA

CERRADA mediante PR #3, mergeado.

- Reconciliación por tipo después de éxito/error de negocio.
- Refresco de datos reales desde backend.
- Conservación de proyección local durante errores de red.
- `idempotency_key`, FIFO, `_sincronizando` y cola existentes intactos.

## R1 — FRONTEND: RENTABILIDAD + B8 + PERMISOS

ENTREGADA EN PR #4, todavía **NO MERGEADA**.

Cambios:
- B5.3 `renderRentabilidad`: diferencia costo real de costo no disponible y evita margen 100% falso cuando el costo no existe.
- B8: `abrirSoporte()` y `abrirConversacionContextual()` reutilizan `ejecutarOperacion('conversacion')` e idempotencia existente.
- Fix de helper `esperar()` faltante.
- `tienePermiso()` ya no convierte fallo de red o usuario sin permisos en autorización falsa.
- 10 tests nuevos; total reportado 150/150 PASS.

No considerar R1 completamente cerrada hasta integrar/verificar PR #4.

## R2 — FRONTEND: CENTRO DE CONTROL + ACTIVIDAD COMERCIAL

ENTREGADA EN PR #5, todavía **NO MERGEADA**.

Objetivo cumplido: producir un avance funcional real sin depender de Supabase/Claude y sin rehacer R1.

### Cambio funcional
Antes, el Centro de Control (pantalla inicial) mostraba productos, almacenes, stock bajo y movimientos de transferencias/vales, pero no reflejaba las ventas aunque `_cache.ventas` ya existía.

Ahora:
- existe un card **Ventas recientes** con monto total vendido y cantidad de ventas;
- las ventas aparecen en **Últimos movimientos**;
- los movimientos se ordenan por fecha;
- cuando no hay ventas se muestra `$0.00` y `0 venta(s)` honestamente.

### Arquitectura respetada
- reutiliza `_cache.ventas` existente;
- no crea consultas nuevas;
- no crea segunda cola, store, caché, sincronizador ni idempotencia;
- no modifica `ejecutarOperacion`, `sincronizarCola`, `operaciones_pendientes`, `_sincronizando` ni `idempotency_key`;
- R2 funciona sobre `main` puro y es independiente de R1.

### Verificación
- `node --check public/app.js` → OK.
- Suite completa sobre `main` puro → **144/144 PASS** (140 originales + 4 tests R2).
- Tests R2 cubren monto/cantidad, caso vacío, ventas en movimientos y orden por fecha.
- No hay bloqueo de Supabase/Claude para esta funcionalidad.

No considerar R2 completamente cerrada hasta integrar/verificar PR #5 y realizar la prueba real correspondiente.

## BACKEND DE CATÁLOGOS — BACKLOG DIFERIDO

Hallazgo de R1:
- `presentaciones`;
- `producto_presentaciones`;
- `almacenes`;
- `categorias`;
- `unidades`.

Estas escrituras directas no tienen actualmente el mismo tratamiento offline/idempotente que la cola principal.

### Decisión actual
**NO es la próxima misión.**

El trabajo de backend para crear RPC idempotentes y posteriormente conectar estos catálogos al offline-first queda **movido hacia atrás en la cola de pendientes**, porque en este momento no se dispone de una sesión de Claude/Supabase utilizable para ejecutar ese bloque con seguridad.

No inventar RPC ni intentar resolver este bloqueo únicamente desde frontend.
Cuando Claude/Supabase vuelva a estar disponible, recuperar este bloque como misión backend dedicada.

## ESTRATEGIA ACTUAL DE EJECUCIÓN — VIBE PRIMERO

Decisión operativa confirmada por Roberto:

**Continuar el desarrollo con Vibe como ejecutor principal de las tareas de GitHub/frontend y dejar las tareas dependientes de Claude/Supabase para el final.**

Motivo:
- Vibe puede editar directamente los archivos del repositorio y entregar PRs verificables.
- Las misiones frontend que no dependen de cambios de backend pueden seguir produciendo avance real.
- No tiene sentido detener el producto esperando disponibilidad de Claude/Supabase.
- Los bloques que realmente necesiten SQL/RPC/RLS o trabajo directo en Supabase se acumularán en una cola posterior.

### Regla de ejecución
Mientras exista una mejora funcional implementable desde GitHub/frontend, **Vibe continúa**.

Claude/Supabase queda reservado para:
- RPC nuevos;
- cambios SQL;
- RLS/grants/SECURITY DEFINER;
- backend de catálogos offline-first;
- cualquier otra tarea que requiera realmente la infraestructura Supabase.

No enviar a Claude una misión que Vibe pueda completar de forma segura desde el repositorio.
No enviar archivos manualmente al ejecutor cuando el repositorio ya contiene la fuente de verdad que puede leer.

## AUDITORÍA TÉCNICA — OTROS HALLAZGOS PARA BACKLOG

Estos puntos fueron detectados durante auditorías amplias. No forman parte de la misión actual y NO deben implementarse automáticamente.

### Seguridad
Revisar posteriormente funciones `SECURITY DEFINER`, grants y policies cuando se haga una auditoría específica de seguridad. No mezclar esa auditoría con una misión funcional frontend.

### Mantenibilidad
`public/app.js` concentra gran parte del frontend y es un archivo grande. La modularización puede ser futura, pero no debe introducirse como parte de una misión funcional sin decisión arquitectónica explícita.

### Pruebas
Las pruebas con fake-indexeddb no sustituyen la prueba real en navegador/dispositivo. Futuramente conviene formalizar CI y pruebas E2E, pero no deben bloquear el avance funcional actual.

### Git
El proyecto utiliza PRs para algunas entregas recientes, pero el flujo global de PR/CI todavía debe consolidarse posteriormente.

### Detalles menores
- revisar iconos referenciados por `manifest.json` si realmente faltan;
- revisar uso de `--ember` si continúa sin definición en `:root`;
- revisar `compatibility_date` de Wrangler si corresponde;
- revisar carga de scripts/CDN si se busca mayor robustez ante redes lentas.

## REGLA DE PRIORIDAD ACTUAL

La regla nueva de trabajo es: **cada misión debe producir avance funcional tangible del producto; no hacer auditorías eternas si existe una implementación concreta que pueda mejorar el producto.**

Orden actual:
1. **Integrar/verificar PR #4 (R1)** cuando corresponda; no duplicar su trabajo.
2. **Continuar con Vibe** mediante el siguiente avance funcional concreto de frontend/GitHub que pueda ejecutarse sin depender de Supabase/Claude.
3. Validación real de los escenarios offline pendientes cuando Roberto pueda ejecutarlos en navegador/dispositivo.
4. Continuar con el siguiente bloque funcional grande del producto.
5. **Backend de catálogos offline-first** queda deliberadamente más atrás y se recuperará cuando exista una sesión de Claude/Supabase utilizable.
6. Cualquier otra tarea estrictamente dependiente de Claude/Supabase se mantiene en la cola posterior.
7. Seguridad profunda, CI, modularización y detalles menores permanecen después del avance funcional principal.

## REGLA PARA FUTURAS SESIONES CON OTRAS IA

El analista/arquitecto debe:
- revisar este addendum y el Cerebro;
- verificar GitHub antes de afirmar estado;
- usar el código real como autoridad técnica;
- no pedir al usuario archivos que el analista pueda leer desde GitHub;
- entregar al ejecutor una misión concreta;
- auditar el resultado antes de considerarlo cerrado.

El ejecutor se encarga del código. El analista se encarga de continuidad, arquitectura, auditoría y definición de misiones.
