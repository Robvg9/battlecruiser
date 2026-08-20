# BATTLECRUISER_CEREBRO_V4

**Actualizado:** 2026-08-20  
**Repositorio:** `Robvg9/battlecruiser`  
**Rama:** `main`  
**Fuente de verdad:** GitHub `main` + Supabase producción + pruebas reales de Roberto.

> Único Cerebro vigente. Informes históricos en `docs/archive/`.

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
├── app.js              ← STUB / punto de entrada final (sin lógica de negocio)
├── service-worker.js   ← battlecruiser-shell-v40
├── manifest.json
├── favicon.png / icons/
└── js/                 ← módulos (scripts clásicos, scope global compartido)
    ├── core.js
    ├── auth.js
    ├── offline.js              ← IndexedDB, cola, ejecutarOperacion, sincronizarCola
    ├── centro-control.js       ← Centro de Control (tab resumen)
    ├── navegacion.js
    ├── productos.js
    ├── presentaciones.js
    ├── almacenes.js
    ├── transferencias.js
    ├── vales.js
    ├── ventas.js
    ├── catalogos.js
    ├── usuarios-permisos.js
    ├── mando.js                ← Centro de Mando (tab mando)
    ├── reportes.js
    ├── nucleo-operativo.js
    ├── operacion-humana.js
    └── comunicacion.js
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
- panel de pendientes y badges

**No duplicar esta arquitectura.**

---

## 6. SISTEMA DE PERMISOS

```text
Usuario → Rol → Permisos del Rol
```

- Comprobación frontend: `tienePermiso(recurso, accion)`
- Comprobación backend: `tiene_permiso(...)` en RPC
- **No** permisos individuales por usuario
- Protección del último Dueño (backend)

---

## 7. ESTADO REAL DE MÓDULOS

### Productos — COMPLETADO

CRUD, imágenes, categorías, presentaciones, búsqueda, stock, catálogo visual.  
Archivo: `public/js/productos.js` (+ presentaciones, catalogos).

### Ventas — COMPLETADO

Catálogo visual, buscador, carrito, historial, offline vía `ejecutarOperacion("venta")`.  
Archivo: `public/js/ventas.js`.

### Almacenes — COMPLETADO

Gestión crear/editar/activar-desactivar, panel informativo, productos por almacén, permisos. Backend M13.  
Archivo: `public/js/almacenes.js`.

### Transferencias — COMPLETADO (Misión 9.3 T4)

Archivo: `public/js/transferencias.js`.

Incluye: creación (origen/destino/producto/cantidad), validaciones (origen≠destino, cantidad, stock origen, permisos), historial, búsqueda, detalle con líneas, offline, integración con `ejecutarOperacion("transferencia")`.

**Modelo backend atómico** (`registrar_transferencia`):

- Al crear se mueve stock origen → destino (FIFO) de inmediato.
- **No existe** recepción separada, cancelación ni estados intermedios en el contrato actual.
- **No inventar** esos flujos en frontend.

### Centro de Mando — COMPLETADO (Misión 9.3 T5)

Archivo: `public/js/mando.js` (+ `centro-control.js` para el tab Resumen).

Incluye: indicadores reales desde `_cache`, resumen operativo, alertas (ops, stock crítico, transferencias en cola, offline), actividad reciente, auditoría (permiso `auditoria/ver`), navegación contextual a tabs.

Datos vacíos y offline degradan con mensajes claros; no inventa métricas.

### Otros bloques (estado general)

| Bloque | Estado |
|--------|--------|
| Offline / cola / idempotencia (B1–B2.3) | Integrado |
| Usuarios / roles / permisos (B3) | Implementado |
| Reportes (B5) | Reconciliado |
| Núcleo operativo / inventario (B6) | Reconciliado |
| Turnos / operación humana (B7) | Implementado en producción |
| Comunicación (B8) | Implementado en producción; pendiente refinamiento UX en 9.3 T7 |

Pendiente de **aceptación real** de Roberto: multiusuario, concurrencia, E2E B7/B8, PWA móvil/PC, offline intermitente.

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
- M6 mutaciones críticas: compra, venta, **transferencia**, vale
- M7 reportes inventario/movimientos/rentabilidad
- M11 roles CRUD, M12 imagen producto, M13 almacenes
- b3–b8 históricos; `b6-nucleo-operativo.sql` = **DEPRECATED**

Regla Claude: introspección de producción antes de aplicar cambios.

---

## 9. SERVICE WORKER

**Cache:** `battlecruiser-shell-v40`

Controla caché PWA, shell offline y precarga de módulos listados en `SHELL_FILES`.

Incluye todos los `public/js/*.js`, `index.html`, `style.css`, `app.js`, icons, manifest.

**Al añadir o renombrar módulos:** actualizar `SHELL_FILES` y subir el número de versión del cache.

Estrategia shell: network-first (timeout corto) con fallback a caché.  
Supabase GET: timeout; escrituras POST: red directa sin timeout artificial.

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
2. `npm test` / `node --test test/*.test.js`
3. Verificar referencias HTML ↔ JS y `SHELL_FILES`
4. Sin PLACEHOLDER / TEMPORARY / archivos truncados

Última cifra histórica documentada (pre-modularización, 2026-08-18): **212/212 PASS**. Re-ejecutar tras cambios grandes.

---

## 11. ROADMAP MISIÓN 9.3

### COMPLETADO

| Tarea | Descripción |
|-------|-------------|
| ✅ T1 | Imagen de productos |
| ✅ T2 | Catálogo visual en ventas |
| ✅ T3 | Gestión completa de almacenes |
| ✅ T4 | Transferencias (workflow + offline + permisos; modelo atómico) |
| ✅ T5 | Centro de Mando (dashboard operativo con datos reales) |

### PENDIENTE

| Tarea | Objetivo |
|-------|----------|
| **T6** Panel contextual | Panel derecho dinámico según contexto (producto, venta, almacén, transferencia, incidencia, responsabilidad, turno). Reducir navegación. Respetar permisos. No romper móvil. |
| **T7** Comunicación | Conversaciones, soporte, chat contextual, incidencias; permisos/RLS; offline donde corresponda. |
| **T8** Configuración | Usuarios, roles, permisos, herramientas admin. No inventar backup falso. |
| **T9** Catálogo avanzado | Filtros/navegación/UX del catálogo sin romper Tarea 6 productos. |
| **T10** UX global | Unificar toasts, errores, loading, confirmaciones, estados offline — coherencia, no rediseño masivo. |

Orden obligatorio: T6 → T7 → T8 → T9 → T10.  
Al cerrar T10 no inventar tareas nuevas; solo auditoría de bugs/regresiones.

---

## 12. HISTORIAL IMPORTANTE

- `app.js` monolítico se modularizó (`public/js/*`) por tamaño y riesgo de truncamiento en GitHub.
- Los módulos conservan **scope global** y el mismo orden de carga; comportamiento equivalente a la concatenación del monolito.
- Service Worker actualizado a **v40** con todos los módulos en `SHELL_FILES`.
- Tests adaptados a la estructura modular.
- T4 Transferencias (2026-08-20): validación stock/permisos, detalle con líneas; backend atómico documentado.
- T5 Centro de Mando (2026-08-20): indicadores y alertas desde `_cache` + cola; sin métricas inventadas.

---

## 13. DEFINITION OF DONE

Una misión queda cerrada cuando:

- cambio en `main` (commit + push)
- tests y `node --check` relevantes OK
- sin duplicación de arquitectura offline/permisos/RPC
- dependencias backend documentadas si faltan
- Cerebro refleja el estado real
- aceptación real de Roberto cuando corresponda

**No declarar terminado solo por palabras de una IA. Declarar terminado por evidencia.**

---

## 14. ORGANIZACIÓN DEL REPO

```text
/
├── BATTLECRUISER_CEREBRO.md   ← este archivo (V4)
├── package.json
├── public/                   ← app desplegable
├── test/
├── supabase/                 ← SQL versionado
├── .github/workflows/
└── docs/archive/             ← evidencia histórica
```

No dejar handoffs temporales en la raíz.
