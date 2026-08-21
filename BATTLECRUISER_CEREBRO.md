# BATTLECRUISER — V9.2

**Actualizado:** 2026-08-20  
**Repositorio:** `Robvg9/battlecruiser`  
**Rama:** `main`  
**Fuente de verdad:** GitHub `main` + verificaciones reales del repo.

> Único Cerebro vigente. Informes históricos en `docs/archive/` y `BATTLECRUISER_MISION_9.1_INFORME_FINAL.md`.

---

## 1. IDENTIDAD DEL PROYECTO

**BattleCruiser** es el **Centro de Mando Digital del Negocio**.

No es solo un POS. Es la plataforma para controlar la operación completa de un negocio físico:

- ventas y catálogo
- inventario, stock, FIFO y costos
- productos, categorías, presentaciones e imágenes
- almacenes (venta / mayorista)
- transferencias entre almacenes
- vales de salida
- empleados, roles y permisos
- turnos, cuadres, responsabilidades e incidencias
- comunicación interna y soporte
- auditoría y trazabilidad
- reportes y administración

**Objetivo:** digitalizar por completo la operación diaria del negocio.

---

## 2. VISIÓN FUTURA

BattleCruiser busca ser **el sistema operativo interno del negocio**:

- saber qué ocurre en tiempo real
- reducir errores humanos
- controlar pérdidas y mermas
- tomar decisiones administrativas con datos
- trazabilidad completa de operaciones

---

## 3. ARQUITECTURA ACTUAL

### Frontend

PWA web **offline-first** (Cloudflare / static `public/`).

```text
public/
├── index.html          ← shell UI + carga ordenada de módulos
├── style.css
├── app.js              ← STUB / punto de entrada final (inyecta módulos T6/T8/T9)
├── service-worker.js   ← battlecruiser-shell-v45
├── manifest.json
├── favicon.png / icons/
└── js/                 ← módulos (scripts clásicos, scope global compartido)
    ├── core.js
    ├── auth.js
    ├── offline.js              ← IndexedDB, cola, ejecutarOperacion, sincronizarCola, consolidarRefrescosPendientes
    ├── centro-control.js
    ├── navegacion.js
    ├── productos.js
    ├── presentaciones.js
    ├── almacenes.js
    ├── transferencias.js
    ├── vales.js
    ├── ventas.js
    ├── catalogos.js
    ├── configuracion.js        ← T8
    ├── catalogo-avanzado.js    ← T9
    ├── usuarios-permisos.js
    ├── mando.js
    ├── reportes.js
    ├── nucleo-operativo.js
    ├── operacion-humana.js
    ├── comunicacion.js
    └── panel-contextual.js     ← T6
```

La **modularización** reemplazó el antiguo `app.js` monolítico. Los módulos se cargan en el mismo orden histórico; las funciones siguen siendo globales. `app.js` no debe volver a concentrar la lógica de la aplicación.

### Backend

**Supabase:** PostgreSQL, RPC, RLS, Storage, Auth, auditoría.

SQL versionado en `supabase/` (M3–M7, M11–M13, b3–b8, etc.).  
Antes de crear backend nuevo: verificar contratos existentes en producción.

### Tests

Carpeta `test/`. Script: `npm test` → `node --test test/*.test.js`.  
Dependencias de test: `jsdom`, `fake-indexeddb`.

---

## 4. REGLAS CRÍTICAS

### NO romper bajo ninguna circunstancia

- `ejecutarOperacion()`
- IndexedDB (`battlecruiser-cache` / `operaciones_pendientes`)
- cola FIFO y `sincronizarCola()`
- idempotencia (`idempotency_key` + `private.operaciones_idempotencia`)
- permisos (Usuario → Rol → Permisos del Rol)
- RLS y autenticación
- Service Worker / PWA

### NO crear

- lógica duplicada de cola u offline
- nuevas colas paralelas
- permisos individuales por usuario
- RPC paralelos innecesarios o tablas duplicadas
- `app.js` monolítico de nuevo

### Reglas de trabajo

1. Código real > memoria > promesas de una IA.
2. Código escrito ≠ commit ≠ push ≠ deploy ≠ prueba real.
3. Buscar lo existente antes de inventar.
4. Si falta contrato Supabase: documentarlo; no inventarlo en frontend.
5. Trabajar en `main` (sin ramas/PR salvo petición expresa).
6. Tras cambios: `node --check`, tests, commit, push, reportar SHA.

### Roles del equipo

| Rol | Responsabilidad |
|-----|-----------------|
| ChatGPT | Coordinación, arquitectura, misiones, roadmap |
| Vibe | Ejecución frontend/GitHub/tests en `main` |
| Claude | Supabase: RPC, SQL, RLS, introspección producción |
| Roberto | Pruebas reales, UX, aceptación final |

---

## 5. SISTEMA OFFLINE

BattleCruiser es **Offline First**.

```text
Usuario
  → ejecutarOperacion(tipo, payload)
    → con Internet: client.rpc(RPC_POR_TIPO[tipo]) inmediato
    → sin Internet / error de red: IndexedDB cola FIFO
         → sincronizarCola() al recuperar conexión
         → idempotency_key estable
         → reconciliación + proyección local de stock (ajustePendiente)
```

Componentes clave en `public/js/offline.js`:

- `ejecutarOperacion` / `sincronizarCola` / `recuperarOperacionesAtrapadas`
- mutex `_sincronizando` (+ flag multi-pestaña en localStorage)
- router `RPC_POR_TIPO`
- `consolidarRefrescosPendientes()` (incluye T7.1)
- panel de pendientes y badges

**No duplicar esta arquitectura.**

El código actual documenta que `sincronizarCola()` evita sincronizaciones simultáneas y procesa FIFO una operación a la vez.

---

## 6. SISTEMA DE PERMISOS

```text
Usuario → Rol → Permisos del Rol
```

- Comprobación frontend: `tienePermiso(recurso, accion)`
- Comprobación backend: `tiene_permiso(...)` en RPC
- **No** permisos individuales por usuario
- Protección del último Dueño (backend)

### Hardening de permisos (completado)

Ya se revocó:

```sql
REVOKE EXECUTE ON FUNCTION public._validar_usuario_operacion(text, text) FROM authenticated;
```

Los helpers `_consume_fifo` / `_consumir_fifo`, `_registrar_movimiento`, `_resolver_presentacion` fueron investigados contra Supabase real y **NO existen en producción**. Son artefactos del código deprecated de B6. No deben aparecer como pendientes.

### obtener_conversion_presentacion

`public.obtener_conversion_presentacion(...)` **SÍ existe en producción**.

- SECURITY DEFINER, owner postgres
- `authenticated EXECUTE = true`
- Callers reales: `registrar_compra`, `registrar_venta`, `registrar_transferencia`, `registrar_vale_salida`
- No tiene caller frontend actualmente
- No tiene trigger que la invoque

**MANTENER / NO TOCAR.**

Razón arquitectónica: no depende de `auth.uid()`, no protege datos sensibles, es una utilidad de conversión de catálogo; podría tener uso legítimo futuro desde UI.

### Superficie de permisos

Barrido completo posterior confirmó:

- helpers internos cerrables ya cerrados;
- RPC con caller frontend mantienen `authenticated`;
- RPC preparadas para UI futura permanecen expuestas;
- no existe otro revoke claramente accionable.

**Conclusión: NO HAY OTRO CAMBIO DE PERMISOS PENDIENTE IDENTIFICADO.**

---

## 7. ESTADO REAL DE MÓDULOS

### Productos — COMPLETADO

CRUD, imágenes, categorías, presentaciones, búsqueda, stock, catálogo visual.  
Archivo: `public/js/productos.js` (+ presentaciones, catalogos, catalogo-avanzado).

### Ventas — COMPLETADO

Catálogo visual, buscador, carrito, historial, offline vía `ejecutarOperacion("venta")`.  
Archivo: `public/js/ventas.js`.

### Almacenes — COMPLETADO

Gestión crear/editar/activar-desactivar, panel informativo, productos por almacén, permisos. Backend M13.  
Archivo: `public/js/almacenes.js`.

### Transferencias — COMPLETADO

Archivo: `public/js/transferencias.js`.

Incluye: creación (origen/destino/producto/cantidad), validaciones, historial, búsqueda, detalle, offline, integración con `ejecutarOperacion("transferencia")`.

**Modelo backend atómico** (`registrar_transferencia`): al crear se mueve stock origen → destino (FIFO) de inmediato. No existe recepción separada ni estados intermedios en el contrato actual.

### Centro de Mando — COMPLETADO

Archivo: `public/js/mando.js` (+ `centro-control.js`).

### Presentaciones — IMPLEMENTADO

- catálogo de presentaciones
- producto_presentaciones
- factores
- activación/desactivación
- asociación producto-presentación
- conversión a unidades base
- integración en compras, ventas, transferencias, vales

### Comunicación — IMPLEMENTADO + T7.1

Archivo: `public/js/comunicacion.js` + refuerzo en `offline.js`.

### Otros bloques

| Bloque | Estado |
|--------|--------|
| Offline / cola / idempotencia | Integrado y estable |
| Usuarios / roles / permisos (B3) | Implementado |
| Reportes (B5) | Reconciliado |
| Núcleo operativo / inventario (B6) | Reconciliado |
| Turnos / operación humana (B7) | Implementado en producción |
| Comunicación (B8) | Implementado + T7.1 aplicado |
| Panel contextual (T6) | Implementado |
| Configuración (T8) | Implementado |
| Catálogo avanzado (T9) | Implementado |

Pendiente de **aceptación real** de Roberto: multiusuario, concurrencia, E2E B7/B8, PWA móvil/PC, offline intermitente, pruebas manuales finales.

---

## 8. BACKEND (Supabase)

- PostgreSQL + RPC SECURITY DEFINER + RLS
- Auth (usuarios)
- Storage (imágenes de producto)
- Auditoría / trazabilidad
- Idempotencia: `private.operaciones_idempotencia`

Migraciones relevantes en repo (no duplicar):

- M3 productos / revoke anon
- M4 auditoría e integridad
- M5 private + permisos + último Dueño
- M6 mutaciones críticas: compra, venta, transferencia, vale
- M7 reportes inventario/movimientos/rentabilidad
- M11 roles CRUD, M12 imagen producto, M13 almacenes
- b3–b8 históricos; `b6-nucleo-operativo.sql` = **DEPRECATED**
- `revoke_authenticated_validar_usuario_operacion.sql` (hardening)

Regla Claude: introspección de producción antes de aplicar cambios.

---

## 9. SERVICE WORKER / PWA

**Cache:** `battlecruiser-shell-v45`

Controla caché PWA, shell offline y precarga de módulos listados en `SHELL_FILES`.

Incluye todos los `public/js/*.js` relevantes, `index.html`, `style.css`, `app.js`, icons, manifest.

**Al añadir o renombrar módulos:** actualizar `SHELL_FILES` y subir el número de versión del cache.

Estrategia shell: network-first (timeout corto) con fallback a caché.  
Supabase GET: timeout; escrituras POST: red directa sin timeout artificial.

### actualizarApp()

Existe en `public/js/auth.js`.

- Botón de actualización en login (`#update-app-btn-login`)
- Botón dentro de la app (menú Ajustes)
- Borra únicamente caches `battlecruiser-shell-*`
- Desregistra Service Workers
- Fuerza reload

**NO modificar esta lógica sin necesidad explícita.**

---

## 10. TESTS

```text
test/
├── b2.3-centro-control.test.js
├── b3-usuarios-permisos.test.js
├── b4-centro-mando.test.js
├── b5-reportes.test.js
├── b6-nucleo-operativo.test.js
├── b7-operacion-humana.test.js
├── b8-comunicacion.test.js
├── fase-c-aislamiento.test.js
├── fase-c-regresion.test.js
├── m3-productos-crud.test.js
└── _leer-app-js.js
```

Antes de cerrar una tarea:

1. `node --check` de archivos modificados
2. `npm test` / `node --test test/*.test.js` (si el entorno lo permite)
3. Verificar referencias HTML ↔ JS y `SHELL_FILES`
4. Sin PLACEHOLDER / TEMPORARY / archivos truncados

**Tests históricos de Misión 9.1 (documentados en informe):** 242 PASS, 0 FAIL; `node --check public/app.js` PASS; `node --check public/service-worker.js` PASS; manifest válido.

Esta misión (V9.2 versionado + Cerebro) **no re-ejecuta** `npm test` ni inventa resultados. Distinguir siempre tests históricos vs. ejecución actual.

---

## 11. HISTORIAL RECIENTE Y ESTADO V9.2

### A. Cierre funcional previo (Misión 9.1)

La Misión 9.1 quedó cerrada.

El informe `BATTLECRUISER_MISION_9.1_INFORME_FINAL.md` registra:

- 242 tests PASS
- 0 FAIL
- `node --check public/app.js` PASS
- `node --check public/service-worker.js` PASS
- manifest válido

Son **tests históricos ejecutados en Misión 9.1**, no una nueva ejecución de esta misión.

### B. T7.1 — Comunicación offline

**T7.1 está aplicado en `main`.**

Commit conocido de la corrección original: `d2e0aafc499ca9ab26d19a36c754430d837efbb5` (y consolidaciones posteriores; HEAD de verificación incluye el cambio).

Cambio:

`consolidarRefrescosPendientes()` ahora refresca la conversación abierta mediante:

```js
refrescarMensajes(_comConvActual)
```

cuando existe una conversación abierta y la categoría `comunicacion` fue marcada para refresco.

Esto resuelve:

ENVIAR MENSAJE OFFLINE → queda pendiente → recuperar Internet → sincronizar → operación confirmada → refrescar lista + badge → refrescar conversación abierta → desaparece el estado visual ⏳ Pendiente.

**T7.1 NO modificó:**

- IndexedDB
- FIFO
- idempotencia
- `sincronizarCola()` (más allá del uso de consolidación)
- `ejecutarOperacion()`
- RPC
- Supabase

### C. Incidente de offline.js

Existió un incidente donde `public/js/offline.js` fue sobrescrito accidentalmente con `PLACEHOLDER_WILL_FAIL` y posteriormente restaurado.

**Estado FINAL actual (verificado en GitHub):**

- `PLACEHOLDER_WILL_FAIL` → **0 resultados**
- `offline.js` íntegro
- Existen: `sincronizarCola`, `consolidarRefrescosPendientes`, `RPC_POR_TIPO`

El Cerebro refleja el estado final, no el placeholder.

### D–F. Seguridad / permisos

Ver sección 6 (Hardening completado, `obtener_conversion_presentacion` mantener, sin más revokes pendientes).

### G. Offline-first

Implementado y estable:

- IndexedDB
- operaciones_pendientes
- estados PENDIENTE / SINCRONIZANDO / SINCRONIZADA / REQUIERE_ATENCION
- idempotency_key
- FIFO
- `sincronizarCola()`
- reconciliación
- consolidación de refrescos (T7.1 incluido)
- recuperación de operaciones atrapadas
- panel de operaciones pendientes

### H. Presentaciones

Estado real implementado (ver sección 7).

### I. PWA / Actualizar app

Ver sección 9 (`actualizarApp()` documentado; no modificado en esta misión).

### J. Estado final V9.2

**V9.2 = CIERRE FUNCIONAL + HARDENING + T7.1 + VERSIONADO**

El proyecto queda listo para **PRUEBAS MANUALES FINALES**.

No abrir otra misión de desarrollo salvo que una prueba manual encuentre un bug real.

---

## 12. DEFINITION OF DONE

Una misión queda cerrada cuando:

- cambio en `main` (commit + push)
- tests y `node --check` relevantes OK (cuando el entorno lo permite)
- sin duplicación de arquitectura offline/permisos/RPC
- dependencias backend documentadas si faltan
- Cerebro refleja el estado real
- aceptación real de Roberto cuando corresponda

**No declarar terminado solo por palabras de una IA. Declarar terminado por evidencia.**

---

## 13. ORGANIZACIÓN DEL REPO

```text
/
├── BATTLECRUISER_CEREBRO.md          ← este archivo (V9.2)
├── BATTLECRUISER_MISION_9.1_INFORME_FINAL.md
├── package.json
├── public/                           ← app desplegable
├── test/
├── supabase/                         ← SQL versionado
├── .github/workflows/
└── docs/archive/                     ← evidencia histórica
```

No dejar handoffs temporales en la raíz.
