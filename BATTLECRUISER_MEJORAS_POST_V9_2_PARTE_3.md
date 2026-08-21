# BATTLECRUISER — MEJORAS POST V9.2 — PARTE 3

**Tipo:** Backlog / especificación oficial de mejoras post-prueba Android  
**Origen:** Pruebas manuales reales sobre BattleCruiser **V9.2** desde teléfono Android  
**Fecha de documentación:** 2026-08-20  
**Repositorio:** `Robvg9/battlecruiser` · rama `main`  
**Estado del documento:** ESPECIFICACIÓN — no implementa nada

> Este archivo es la fuente de trabajo para la siguiente etapa de implementación.  
> **No inventa.** Cada punto se clasifica según evidencia de código/repo o se marca como pendiente de investigación cuando no se pudo confirmar.

---

## 0. Resumen ejecutivo

| Métrica | Valor |
|--------|------|
| Puntos documentados | **23** |
| Bugs confirmados por prueba manual | **7** (1, 2, 7, 18, 19, 20, 22/23) |
| Requerimientos funcionales | **9** |
| Problemas de UX / diseño | **5** |
| A investigar (infra / causa raíz) | **2** (8, partes de 11–13) |
| Cambios funcionales en esta misión | **0** |
| Supabase / SQL / RPC / migraciones | **NO** |

### Prioridad global (P0 → P3)

**P0 — Crítico / bloqueante**
1. Loading infinito (puntos 1, 19, 20 — causa común probable)
2. Error SQL `column reference "nombre" is ambiguous` (punto 18)
3. Estado de conexión incorrecto (puntos 2, 7)
4. Restricción de ventas por almacén / sesión / turno (puntos 9, 10)

**P1 — Funcional importante**  
Productos+presentaciones (3–6), transferencias multiproducto (16), compras multiproducto+FIFO (17), roles/permisos UI (21)

**P2 — UX / responsive**  
Drawer móvil (22–23), almacenes responsive/panel (11–13), ajustes (14), foto cuadrada (5), etiquetas Desde/Hasta (15)

**P3 — Organización / refinamiento**  
Catálogos (6), limpieza de acciones admin (13), resto derivado

### Contradicciones con el CEREBRO

- El Cerebro V9.2 declara módulos “COMPLETADO / IMPLEMENTADO” (ventas, almacenes, transferencias, turnos, comunicación, roles). Eso es cierto a nivel de existencia de código, **no** a nivel de aceptación real Android. Este documento registra gaps de UX, bugs de runtime y requerimientos de negocio no cerrados en prueba.
- El Cerebro documenta offline-first y `actualizarApp()`; las pruebas muestran que borrar caché “arregla” el indicador de conexión — señal de problema de estado/caché/inicialización, no de diseño correcto.
- No se encontró implementación que **obligue** el almacén de venta al turno/sesión del usuario: el frontend ofrece selector libre (`#venta-almacen`).

### Puntos ya parcialmente implementados (no cerrados)

| Área | Qué existe | Qué falta |
|------|------------|-----------|
| Presentaciones | Catálogo + `producto_presentaciones` + integración en compra/venta/transferencia/vale | UX de asignación al crear producto; no mezclar catálogo en flujo de productos |
| Transferencias multi-línea | Backend `registrar_transferencia` acepta `p_lineas` (jsonb) según reconciliación M6 | UI actual es producto-a-producto |
| Compras | `registrar_compra` + presentaciones + FIFO en consumidores | UI compra línea a línea; no documento multi-producto |
| Roles/permisos | Backend B3 + UI parcial en Config (roles) y Usuarios (asignar rol) | El usuario no encuentra flujo claro de crear/editar permisos por rol |
| Loader | `showLoading` / `hideLoading` / contador en `offline.js`; login y crear usuario usan try/finally | Loading infinito en entrada a app y re-login → fuga o promesa colgada fuera de esos finally |

### Dependencias entre puntos

```text
1 ↔ 19 ↔ 20     (loader común)
2 ↔ 7 ↔ 8       (conectividad + posible cache/SW)
3 ↔ 4 ↔ 5 ↔ 6   (productos / presentaciones / catálogos)
9 ↔ 10 ↔ 11 ↔ 12 ↔ 13   (bloque almacén operativo)
16 ↔ 17         (documentos multi-línea; no romper FIFO/idempotencia)
22 ↔ 23         (drawer scroll)
18              (causa raíz SQL compartida; no parchear por pantalla)
```

---

## 1. Criterio de cada ficha

Para cada punto: ID, Tipo, Prioridad, Problema observado, Comportamiento actual confirmado, Comportamiento deseado, Archivos FE, Funciones JS, RPC/backend, Tablas, Dependencias, Riesgo, Criterio de aceptación, Estado.

Leyenda de **Tipo**:
- BUG CONFIRMADO
- PROBLEMA DE UX CONFIRMADO
- REQUERIMIENTO FUNCIONAL
- POSIBLE BUG A INVESTIGAR
- DECISIÓN DE DISEÑO PENDIENTE

---

## 2. Fichas (puntos 1–23)

### PUNTO 1 — Menú de carga / loading trabado

| Campo | Contenido |
|-------|-----------|
| **ID** | M-01 |
| **Tipo** | BUG CONFIRMADO |
| **Prioridad** | P0 |
| **Problema observado** | Tras login correcto, la pantalla principal muestra loading indefinido; el usuario debió usar “atrás” y reabrir la app. |
| **Comportamiento actual confirmado** | Existe loader global: `showLoading` / `hideLoading` / `loadingCount` en `public/js/offline.js` (overlay `#global-loading-overlay`). Login en `auth.js` usa `showLoading` + `finally { hideLoading() }`. La carga post-login de contexto (`cargarContextoUsuario` y refrescos de módulos) puede abrir el loader o dejar promesas sin `hideLoading` si falla a medias — **no se auditó línea a línea cada caller en esta misión**. |
| **Comportamiento deseado** | Toda carga terminada, fallida o con error de red/RPC libera el loader. Entrar al sistema no produce loader infinito. |
| **Archivos FE** | `public/js/offline.js`, `public/js/auth.js`, módulos que llaman `showLoading`/`setLoading`, `public/js/navegacion.js`, `public/js/centro-control.js` |
| **Funciones JS** | `showLoading`, `hideLoading`, `withLoading` (si existe), `cargarContextoUsuario`, refrescos iniciales |
| **RPC/backend** | Cualquier RPC invocada al abrir sesión (perfil, permisos, stock, etc.) |
| **Tablas** | N/A (síntoma FE) |
| **Dependencias** | M-19, M-20 (investigar causa común) |
| **Riesgo** | Medio-alto: tocar loader sin inventario de callers puede dejar pantallas sin feedback. |
| **Criterio de aceptación** | Login → shell visible sin overlay permanente; fallo de red no bloquea UI; reintento no requiere matar la app. |
| **Estado** | confirmado (síntoma) · investigado parcialmente · **listo para investigación profunda de causa** |

---

### PUNTO 2 — Estado de conexión incorrecto

| Campo | Contenido |
|-------|-----------|
| **ID** | M-02 |
| **Tipo** | BUG CONFIRMADO |
| **Prioridad** | P0 |
| **Problema observado** | Con Internet real, la UI mostraba “Comprobando conexión” en lugar de “Conectado”. |
| **Comportamiento actual confirmado** | `actualizarIndicadorConexion` en `offline.js`: estado D usa `_conectividadReal === null && navigator.onLine` → texto `⏳ Comprobando conexión...`. `_conectividadReal` solo pasa a `"online"`/`"offline"` vía `marcarConectividadReal` cuando hay consulta real (`withCache` / errores de red). Si ninguna lectura real completa, el estado queda en “comprobando”. Tras `actualizarApp()` (borra caches + unregister SW + reload) el usuario vio estado correcto — sugiere inicialización/caché, no “solución” de producto. |
| **Comportamiento deseado** | Distinguir: comprobando · conectado · sin conexión · backend inaccesible · sincronizando · sincronización completada/error. No dejar “comprobando” como permanente con conexión confirmada. |
| **Archivos FE** | `public/js/offline.js`, `public/index.html` (`#conn-status`, `#conn-status-app`) |
| **Funciones JS** | `actualizarIndicadorConexion`, `marcarConectividadReal`, `withCache`, `sincronizarCola` |
| **RPC/backend** | Cualquier GET/RPC que alimente `_conectividadReal` |
| **Tablas** | N/A |
| **Dependencias** | M-07, M-08 |
| **Riesgo** | Medio (lógica de estados ya frágil históricamente — Misión 9.1 corrigió anidamiento A/B/C/D). |
| **Criterio de aceptación** | Con red y backend OK, en ≤ N segundos (definir en implementación) se muestra estado conectado **sin** exigir borrar caché. |
| **Estado** | confirmado · investigado parcialmente |

---

### PUNTO 3 — Producto y presentaciones

| Campo | Contenido |
|-------|-----------|
| **ID** | M-03 |
| **Tipo** | PROBLEMA DE UX CONFIRMADO + REQUERIMIENTO FUNCIONAL |
| **Prioridad** | P1 |
| **Problema observado** | Al crear producto: nombre, categoría, unidad… el usuario espera vínculo claro con presentaciones (ej. Mantecado: 1 unidad / 1 caja = 24 u). |
| **Comportamiento actual confirmado** | Formulario producto en `index.html` + `productos.js`. Presentaciones viven en sección separada del mismo tab Productos (`presentaciones.js`: catálogo + asociaciones producto–presentación + factor). Modelo real: producto → unidad base; `producto_presentaciones` + factor; conversión vía `obtener_conversion_presentacion` en RPCs de compra/venta/transferencia/vale. |
| **Comportamiento deseado** | Al crear/configurar producto, forma clara de seleccionar una o varias presentaciones y equivalencia a unidades base, respetando el modelo existente. |
| **Archivos FE** | `public/js/productos.js`, `public/js/presentaciones.js`, `public/index.html` |
| **Funciones JS** | CRUD producto, formularios de presentación/asociación |
| **RPC/backend** | `crear_producto`, RPCs de presentaciones (M8.4), `obtener_conversion_presentacion` |
| **Tablas** | `productos`, `presentaciones`, `producto_presentaciones`, categorías, unidades |
| **Dependencias** | M-04, M-05, M-06 |
| **Riesgo** | Alto si se inventa modelo paralelo; bajo si se reutiliza `producto_presentaciones`. |
| **Criterio de aceptación** | Usuario asocia presentaciones al producto sin “descubrir” una sección aparte confusa; operaciones posteriores usan factores reales. |
| **Estado** | confirmado (gap UX) · modelo backend existe |

---

### PUNTO 4 — Campos obligatorios al crear producto

| Campo | Contenido |
|-------|-----------|
| **ID** | M-04 |
| **Tipo** | REQUERIMIENTO FUNCIONAL |
| **Prioridad** | P1 |
| **Problema observado** | Se debe impedir producto incompleto (nombre, categoría, presentaciones necesarias). |
| **Comportamiento actual confirmado** | HTML: nombre y precio normal `required`; categoría es `<select>` sin evidencia de obligatoriedad fuerte en FE en esta revisión. Presentaciones **no** son parte del submit de creación de producto. Backend: `crear_producto` — firma/obligatoriedad exacta debe revalidarse en producción antes de endurecer FE. |
| **Comportamiento deseado** | FE y BE alineados: no guardar producto incompleto si el negocio lo exige. |
| **Archivos FE** | `productos.js`, `index.html` |
| **RPC** | `crear_producto` |
| **Tablas** | `productos` |
| **Dependencias** | M-03 |
| **Riesgo** | Medio si se obliga presentación cuando el backend permite producto sin asociaciones. |
| **Criterio de aceptación** | Validación explícita documentada FE+BE; mensaje claro al usuario. |
| **Estado** | requiere decisión (qué es obligatorio en BE real) |

---

### PUNTO 5 — Foto del producto

| Campo | Contenido |
|-------|-----------|
| **ID** | M-05 |
| **Tipo** | REQUERIMIENTO DE UX |
| **Prioridad** | P2 |
| **Problema observado** | Imagen individual, cuadrada, sin deformación, preview correcto. |
| **Comportamiento actual confirmado** | Existe input de imagen en formulario producto y preview; catálogo de ventas usa `imagen_url` en tarjetas. Restricciones exactas de tamaño/aspect en CSS/Storage **no auditadas en profundidad aquí**. |
| **Comportamiento deseado** | 1 imagen/producto, proporción cuadrada, preview y listados consistentes. |
| **Archivos FE** | `productos.js`, `style.css`, `ventas.js` (catálogo) |
| **Backend** | Storage + RPC imagen (M12) |
| **Dependencias** | M-03 |
| **Riesgo** | Bajo-medio (CSS/crop). |
| **Criterio de aceptación** | Preview y tarjetas sin stretch; formato/tamaño documentados. |
| **Estado** | pendiente de auditoría visual/CSS |

---

### PUNTO 6 — Catálogo de presentaciones (organización UI)

| Campo | Contenido |
|-------|-----------|
| **ID** | M-06 |
| **Tipo** | PROBLEMA DE ORGANIZACIÓN DE UI |
| **Prioridad** | P1 / P3 (organización) |
| **Problema observado** | “Agregar presentación” dentro del flujo Productos; usuario no quiere catálogos maestros mezclados ahí. |
| **Comportamiento actual confirmado** | En tab Productos: bloque “Presentaciones comerciales” (catálogo + por producto). En tab Config: categorías y unidades. Catálogos reales identificados: categorías, unidades, presentaciones, (roles en config), almacenes (módulo propio). |
| **Comportamiento deseado** | Zona de CATÁLOGOS / configuración maestra agrupada. |
| **Archivos FE** | `index.html`, `presentaciones.js`, `catalogos.js`, `configuracion.js` |
| **Dependencias** | M-03, M-04, M-21 |
| **Riesgo** | Medio (navegación y permisos de quién edita maestros). |
| **Criterio de aceptación** | Productos = operación de productos; maestros en zona de catálogos. |
| **Estado** | confirmado (deseo UX) · **decisión de diseño pendiente** (ubicación exacta) |

---

### PUNTO 7 — Conexión incorrecta durante uso

| Campo | Contenido |
|-------|-----------|
| **ID** | M-07 |
| **Tipo** | BUG CONFIRMADO |
| **Prioridad** | P0 |
| **Problema observado** | En uso normal con red, reaparece “Comprobando conexión”. |
| **Comportamiento actual confirmado** | Misma máquina de estados que M-02. Posibles causas a investigar (sin afirmar): `_conectividadReal` reseteado; ninguna lectura marca online; race con `sincronizarCola`; SW timeout en GET; múltiples llamadas a `actualizarIndicadorConexion`. |
| **Comportamiento deseado** | Estado estable y correcto durante sesión. |
| **Archivos FE** | `offline.js` |
| **Dependencias** | M-02, M-08 |
| **Riesgo** | Medio |
| **Criterio de aceptación** | Sesión de 15+ min con red no regresa a “comprobando” sin causa real. |
| **Estado** | confirmado · causa raíz **no** localizada |

---

### PUNTO 8 — Actualizar app / borrar caché

| Campo | Contenido |
|-------|-----------|
| **ID** | M-08 |
| **Tipo** | POSIBLE BUG A INVESTIGAR (infra/PWA) |
| **Prioridad** | P0 (como factor de M-02/M-07) |
| **Problema observado** | Tras Ajustes → Actualizar app, el estado de conexión se corrigió. |
| **Comportamiento actual confirmado** | `actualizarApp` en `auth.js`: borra solo `battlecruiser-shell-*`, unregister SW, `location.reload()`. SW: `CACHE_NAME = battlecruiser-shell-v45`, network-first con timeout, `SHELL_FILES` completo. La coincidencia puede ser: JS viejo en cache, estado en memoria, o side-effect del reload. **No se demostró** que el SW sea la causa única. |
| **Comportamiento deseado** | App actualizada y estado de conexión correcto sin acción manual de “borrar caché”. |
| **Archivos FE** | `service-worker.js`, `auth.js`, `manifest.json` |
| **Dependencias** | M-02, M-07 |
| **Riesgo** | Alto si se toca SW sin plan de versionado. |
| **Criterio de aceptación** | Publicar cambio → dispositivos reciben shell sin depender de botón de emergencia (salvo casos excepcionales). |
| **Estado** | a investigar · **NO cambiar SW en esta fase** |

---

### PUNTO 9 — Ventas restringidas por almacén

| Campo | Contenido |
|-------|-----------|
| **ID** | M-09 |
| **Tipo** | REQUERIMIENTO FUNCIONAL CRÍTICO |
| **Prioridad** | P0 |
| **Problema observado** | Quien opera en “La Cueva” no debe vender desde “Tu Mejor Opción”. |
| **Comportamiento actual confirmado** | `ventas.js`: `#venta-almacen` se llena con **todos** los almacenes (`fillSelect(..., almacenes, ...)`). La venta envía `p_almacen_id` elegido libremente. Existe turno con `almacen_id` (`abrir_turno`, `turno_actual_usuario`) pero **no** se encontró en esta revisión un amarre automático venta←turno. |
| **Comportamiento deseado** | Cadena USUARIO → SESIÓN → ALMACÉN → TURNO → VENTA. |
| **Archivos FE** | `ventas.js`, `operacion-humana.js`, `auth.js` / contexto usuario |
| **RPC** | `registrar_venta`, `turno_actual_usuario`, `abrir_turno` |
| **Tablas** | `ventas`, `turnos`, `almacenes`, permisos |
| **Dependencias** | M-10, bloque almacén |
| **Riesgo** | Alto (negocio + backend). |
| **Criterio de aceptación** | Imposible vender en almacén no autorizado aunque se manipule el DOM; backend rechaza. |
| **Estado** | confirmado (selector libre) · listo para diseño de restricción |

---

### PUNTO 10 — No permitir cambiar almacén de venta manualmente

| Campo | Contenido |
|-------|-----------|
| **ID** | M-10 |
| **Tipo** | REQUERIMIENTO FUNCIONAL CRÍTICO |
| **Prioridad** | P0 |
| **Problema observado** | No debe existir selector libre La Cueva / TuMejorOpcion en ventas. |
| **Comportamiento actual confirmado** | Selector visible y obligatorio en UI (`venta-almacen`). Comentario en código: “La venta entera pertenece a un solo almacén”. Cambio de almacén vacía el carrito (precio depende del tipo). |
| **Comportamiento deseado** | Almacén determinado por contexto; UI sin selector si el modelo es un solo almacén operativo. **Restricción también en backend.** |
| **Archivos FE** | `ventas.js`, `index.html` |
| **RPC** | `registrar_venta` (debe validar almacén permitido) |
| **Dependencias** | M-09 |
| **Riesgo** | Alto |
| **Criterio de aceptación** | Sin selector libre; RPC rechaza almacén fuera de contexto. |
| **Estado** | confirmado |

---

### PUNTO 11 — Almacenes en móvil vs PC

| Campo | Contenido |
|-------|-----------|
| **ID** | M-11 |
| **Tipo** | PROBLEMA DE UX RESPONSIVE |
| **Prioridad** | P2 |
| **Problema observado** | En Android, al tocar el listado de almacenes aparece panel de información; el usuario espera analogía al panel lateral de PC. |
| **Comportamiento actual confirmado** | Módulo `almacenes.js` + markup en `index.html` (`alm-info-panel`, selector, menú acciones). Diseño responsive exacto **requiere auditoría CSS + flujo táctil** (no reejecutada visualmente aquí). |
| **Comportamiento deseado** | Adaptación móvil apropiada; no copiar literal el panel de escritorio si rompe navegación. |
| **Archivos FE** | `almacenes.js`, `style.css`, `index.html` |
| **Dependencias** | M-12, M-13 |
| **Riesgo** | Medio |
| **Criterio de aceptación** | Flujo claro en Android y PC sin callejones sin salida. |
| **Estado** | confirmado por usuario · detalle layout a investigar |

---

### PUNTO 12 — Botones del panel de información de almacén

| Campo | Contenido |
|-------|-----------|
| **ID** | M-12 |
| **Tipo** | PROBLEMA FUNCIONAL/UX |
| **Prioridad** | P2 |
| **Problema observado** | Tres botones: uno “Conversar” poco claro; otros parecen volver a Almacenes. |
| **Comportamiento actual confirmado** | Debe auditarse en `almacenes.js` / panel contextual (`panel-contextual.js`) cada handler. **En esta misión no se listó el HTML exacto de los tres botones con sus listeners** — no inventar nombres ni destinos. |
| **Comportamiento deseado** | Por botón: nombre, función actual, función esperada, navegación, mantener/cambiar/eliminar. |
| **Archivos FE** | `almacenes.js`, `panel-contextual.js`, `comunicacion.js` |
| **Dependencias** | M-11, M-13 |
| **Riesgo** | Bajo-medio |
| **Criterio de aceptación** | Cada control tiene propósito evidente y navegación coherente. |
| **Estado** | confirmado (síntoma) · **requiere inventario de botones en código** |

---

### PUNTO 13 — Crear/editar almacén no permanentemente visible

| Campo | Contenido |
|-------|-----------|
| **ID** | M-13 |
| **Tipo** | REQUERIMIENTO DE UX |
| **Prioridad** | P2 / P3 |
| **Problema observado** | Crear/Editar no deben estar siempre expuestos en la UI principal. |
| **Comportamiento actual confirmado** | Existe menú “Acciones ▾” (`alm-acciones-btn`) con Crear / Editar / Activar-desactivar; formulario en panel colapsable (`alm-form-panel`). Verificar en Android si el menú o el form quedan demasiado visibles. |
| **Comportamiento deseado** | Interfaz limpia; acciones admin solo al invocarlas. |
| **Archivos FE** | `almacenes.js`, `index.html` |
| **Dependencias** | M-11, M-12 |
| **Riesgo** | Bajo |
| **Criterio de aceptación** | Vista operativa sin formularios admin permanentes. |
| **Estado** | requiere verificación visual Android |

---

### PUNTO 14 — Ajustes demasiado vacíos

| Campo | Contenido |
|-------|-----------|
| **ID** | M-14 |
| **Tipo** | PROBLEMA DE UX + DECISIÓN DE DISEÑO PENDIENTE |
| **Prioridad** | P2 |
| **Problema observado** | Ajustes ≈ Actualizar app + Cerrar sesión (y cambiar contraseña en menú). |
| **Comportamiento actual confirmado** | Menú ajustes en header: cambiar contraseña, actualizar app; logout aparte. Tab Configuración tiene roles, categorías, unidades (no es el menú Ajustes). |
| **Comportamiento deseado** | Organizar conceptualmente solo lo compatible con arquitectura real: generales, conexión/PWA, preferencias UI, integraciones futuras — **sin inventar features falsas**. |
| **Archivos FE** | `auth.js`, `configuracion.js`, `index.html` |
| **Dependencias** | M-06, M-21 |
| **Riesgo** | Bajo (solo diseño) |
| **Criterio de aceptación** | Mapa de ajustes reales vs. “por construir” explícito. |
| **Estado** | requiere decisión |

---

### PUNTO 15 — Transferencias: identificar Desde/Hasta

| Campo | Contenido |
|-------|-----------|
| **ID** | M-15 |
| **Tipo** | PROBLEMA DE UX |
| **Prioridad** | P2 |
| **Problema observado** | Falta identificación visual clara DESDE / HASTA. |
| **Comportamiento actual confirmado** | Form `#form-transferencia`: selects `trf-origen`, `trf-destino`, producto, cantidad — sin etiquetas “Desde/Hasta” evidentes en el markup revisado de `index.html`. |
| **Comportamiento deseado** | Etiquetas explícitas origen → destino. |
| **Archivos FE** | `index.html`, `transferencias.js`, `style.css` |
| **Dependencias** | M-16 |
| **Riesgo** | Bajo |
| **Criterio de aceptación** | Usuario entiende origen/destino sin depender del placeholder. |
| **Estado** | confirmado |

---

### PUNTO 16 — Transferencias multiproducto

| Campo | Contenido |
|-------|-----------|
| **ID** | M-16 |
| **Tipo** | REQUERIMIENTO FUNCIONAL |
| **Prioridad** | P1 |
| **Problema observado** | Hoy producto a producto; se quiere un documento con múltiples líneas + ACEPTAR. |
| **Comportamiento actual confirmado** | UI: un producto por submit. Backend (M6 / Cerebro): `registrar_transferencia` atómico con **líneas** (`p_lineas`); modelo ya orientado a multi-línea en RPC. Offline `RPC_POR_TIPO.transferencia` + payload con líneas en proyecciones de stock. |
| **Comportamiento deseado** | Una transferencia = N productos; una confirmación. |
| **Archivos FE** | `transferencias.js`, `offline.js` |
| **RPC** | `registrar_transferencia` |
| **Tablas** | `transferencias` (+ líneas si existen en prod) |
| **Dependencias** | M-15; no romper FIFO/stock |
| **Riesgo** | Alto si se cambia contrato RPC; medio si solo se alinea UI al contrato multi-línea existente. |
| **Criterio de aceptación** | Documento multi-línea; una operación offline/idempotente; stock correcto en origen y destino. |
| **Estado** | investigado parcialmente · backend parece listo · UI no |

---

### PUNTO 17 — Compras multiproducto + FIFO

| Campo | Contenido |
|-------|-----------|
| **ID** | M-17 |
| **Tipo** | REQUERIMIENTO FUNCIONAL |
| **Prioridad** | P1 |
| **Problema observado** | Compra línea a línea; se quiere tarjeta multi-producto con total invertido y costos por línea alimentando FIFO. |
| **Comportamiento actual confirmado** | Form compra en Productos: un producto/almacén/presentación/cantidad/costo por submit → `ejecutarOperacion("compra", ...)`. FIFO se consume en venta/transferencia/vale; compra crea lotes (`lotes_compra` en docs de reconciliación). **No asumir** que existe `registrar_compra` multi-línea sin verificar firma real en producción. |
| **Comportamiento deseado** | Documento de compra multi-línea con total, sin romper lotes/FIFO/costos/auditoría/idempotencia. |
| **Archivos FE** | `productos.js`, `offline.js` |
| **RPC** | `registrar_compra` |
| **Tablas** | `lotes_compra`, stock, movimientos |
| **Dependencias** | M-03 (presentaciones); riesgo FIFO |
| **Riesgo** | **Muy alto** si se cambia semántica de lotes. |
| **Criterio de aceptación** | Multi-línea o flujo equivalente UX; costos y FIFO verificables en reportes. |
| **Estado** | requiere investigación de firma RPC real |

---

### PUNTO 18 — Error `column reference "nombre" is ambiguous`

| Campo | Contenido |
|-------|-----------|
| **ID** | M-18 |
| **Tipo** | BUG CRÍTICO |
| **Prioridad** | P0 |
| **Problema observado** | Error al abrir turno, crear responsabilidad, crear incidencia y al escribir en Chat; a veces el mensaje dice “No se pudo abrir el turno…” en contextos que no son turno. |
| **Comportamiento actual confirmado** | En SQL versionado `b7-operacion-humana.sql`, varias funciones hacen `SELECT u.nombre INTO v_nombre FROM public.usuarios u` (calificado). El error **ambiguous** suele aparecer en joins donde dos tablas tienen `nombre` y se selecciona/ordena sin calificar. El mensaje “No se pudo abrir el turno” es **frontend** (wrapper de error de turno) reutilizado o propagado mal si el mismo canal de error se comparte. Comunicación (B8) y turnos comparten patrón `_validar_usuario_operacion` y auditoría. **No se localizó en esta misión el SQL exacto en producción que dispara 42702** — el archivo del repo puede diferir de producción. |
| **Comportamiento deseado** | Causa raíz única corregida; mensajes de error fidedignos por módulo. |
| **Archivos FE** | `operacion-humana.js`, `comunicacion.js`, `offline.js` (`explicarError`) |
| **RPC candidatas** | `abrir_turno`, `crear_responsabilidad`, `crear_incidencia`, `enviar_mensaje`, listados con JOIN, `_validar_usuario_operacion` |
| **Tablas** | `usuarios`, `turnos`, `responsabilidades`, `incidencias`, tablas de chat (participantes, conversaciones) — varias con columna `nombre` |
| **Dependencias** | Ninguna de implementación previa; bloquea operación humana y chat |
| **Riesgo** | Alto (SQL producción); **prohibido** parchear solo el string de error en FE |
| **Criterio de aceptación** | Identificar función + consulta exacta; un fix de calificación de columnas; turno, responsabilidad, incidencia y chat operan sin 42702; mensajes no cruzados. |
| **Estado** | confirmado (síntoma multi-módulo) · **causa raíz pendiente de introspección producción** |

**Regla:** no aceptar “poner tabla.nombre” a ciegas; primero localizar función, consulta, caller y por qué el mensaje de turno aparece en chat.

---

### PUNTO 19 — Loading al volver del login

| Campo | Contenido |
|-------|-----------|
| **ID** | M-19 |
| **Tipo** | BUG CONFIRMADO |
| **Prioridad** | P0 |
| **Problema observado** | Logout → login de nuevo → loading infinito. |
| **Comportamiento actual confirmado** | Logout: `limpiarContextoUsuario` + `signOut`. Login: `showLoading`/`hideLoading` en submit. Post-sesión: `showApp` → `cargarContextoUsuario`. Posible contador `loadingCount` desbalanceado o promesa de carga inicial sin `hide`. |
| **Comportamiento deseado** | Ciclo logout/login limpio. |
| **Archivos FE** | `auth.js`, `offline.js`, contexto usuario |
| **Dependencias** | M-01, M-20 |
| **Riesgo** | Medio |
| **Criterio de aceptación** | ≥5 ciclos logout/login sin overlay atrapado. |
| **Estado** | confirmado · investigar junto a M-01 |

---

### PUNTO 20 — Creación de usuario con loading infinito

| Campo | Contenido |
|-------|-----------|
| **ID** | M-20 |
| **Tipo** | BUG CONFIRMADO |
| **Prioridad** | P0 |
| **Problema observado** | Crear usuario deja UI congelada con loading. |
| **Comportamiento actual confirmado** | `auth.js` `safeInit("nuevo-usuario")`: `showLoading()` + `try/catch/finally { hideLoading() }`. En teoría el finally siempre corre. Si el síntoma es real, posibles causas: otro `showLoading` concurrente sin hide; overlay CSS distinto; excepción fuera del handler; UI “congelada” por otro motivo interpretada como loader. |
| **Comportamiento deseado** | Todos los caminos liberan loader; lista se actualiza; mensaje éxito/error. |
| **Archivos FE** | `auth.js`, `usuarios-permisos.js` |
| **RPC** | `crear_usuario_interno`, Auth signUp |
| **Dependencias** | M-01, M-19 |
| **Riesgo** | Medio |
| **Criterio de aceptación** | Crear usuario OK y error de red/duplicado liberan loader. |
| **Estado** | confirmado por prueba · posible interacción con contador global |

---

### PUNTO 21 — Roles y permisos no encontrados

| Campo | Contenido |
|-------|-----------|
| **ID** | M-21 |
| **Tipo** | GAP FUNCIONAL / UX |
| **Prioridad** | P1 |
| **Problema observado** | No se encuentra UI clara para crear/editar roles y asignar permisos. |
| **Comportamiento actual confirmado** | Tab Config: form nuevo rol + `#lista-roles`. Tab Usuarios: crear usuario + lista (asignación de rol históricamente presente). Backend: roles, permisos, `tiene_permiso`, RPCs admin (M11). Completitud de matriz de permisos en UI **a verificar en `usuarios-permisos.js` / `configuracion.js`**. |
| **Comportamiento deseado** | Interfaz descubrible alineada al modelo Usuario→Rol→Permisos. |
| **Archivos FE** | `usuarios-permisos.js`, `configuracion.js`, `index.html` |
| **RPC** | CRUD roles/permisos (M11) |
| **Tablas** | `roles`, `permisos`, tablas de relación |
| **Dependencias** | M-06, M-14 |
| **Riesgo** | Medio |
| **Criterio de aceptación** | Admin encuentra y completa el flujo sin documentación externa. |
| **Estado** | gap UX confirmado · inventario de UI pendiente |

---

### PUNTO 22 — Drawer izquierdo: scroll incorrecto

| Campo | Contenido |
|-------|-----------|
| **ID** | M-22 |
| **Tipo** | BUG DE UX MÓVIL |
| **Prioridad** | P2 |
| **Problema observado** | Al deslizar dentro del menú, se mueve el contenido principal detrás. |
| **Comportamiento actual confirmado** | Sidebar `#sidebar`, backdrop, toggle en `navegacion.js` / CSS. Falta verificación de `touchmove` / `overflow` / `overscroll-behavior` / body scroll lock. |
| **Comportamiento deseado** | Drawer captura el gesto; fondo no se desplaza. |
| **Archivos FE** | `navegacion.js`, `style.css`, `index.html` |
| **Dependencias** | M-23 |
| **Riesgo** | Bajo-medio (CSS/touch) |
| **Criterio de aceptación** | Scroll solo dentro del drawer en Android. |
| **Estado** | confirmado por usuario |

---

### PUNTO 23 — Drawer no muestra todas las opciones

| Campo | Contenido |
|-------|-----------|
| **ID** | M-23 |
| **Tipo** | BUG DE UX MÓVIL |
| **Prioridad** | P2 |
| **Problema observado** | Opciones inferiores (ej. Configuración) no siempre accesibles. |
| **Comportamiento actual confirmado** | Muchas entradas en `#tabs`; si el drawer no scrollea de forma independiente (M-22), las últimas quedan fuera de vista. |
| **Comportamiento deseado** | Drawer completamente desplazable; todas las opciones alcanzables en pantallas bajas. |
| **Archivos FE** | mismos que M-22 |
| **Dependencias** | M-22 |
| **Riesgo** | Bajo |
| **Criterio de aceptación** | Todas las secciones del menú accesibles con touch. |
| **Estado** | confirmado · analizar junto a M-22 |

---

## 3. Bloques de investigación obligatoria (antes de implementar)

### 3.1 Loader común (M-01, M-19, M-20)

1. Inventario completo de `showLoading` / `hideLoading` / `setLoading` / overlays.
2. Diagrama: quién incrementa `loadingCount` y quién decrementa.
3. Flujos: login, post-login, logout, crear usuario, cambio de tab.
4. Comportamiento ante rechazo de promesa, timeout SW, RPC error.
5. Un solo mecanismo de liberación en `finally` donde falte — no timeouts ciegos.

### 3.2 Conectividad + PWA (M-02, M-07, M-08)

1. Transiciones de `_conectividadReal`.
2. Primera pintura post-login vs. primera RPC exitosa.
3. Efecto real de `actualizarApp` (¿JS viejo? ¿estado null?).
4. No bump de SW hasta tener hipótesis verificada.

### 3.3 SQL ambiguous nombre (M-18)

1. Reproducir en Supabase SQL con las RPC usadas por turno / responsabilidad / incidencia / mensaje.
2. `pg_get_functiondef` de la función que falle en **producción**.
3. Revisar propagación de mensajes en FE (`explicarError`, textos hardcodeados de turno).
4. Un fix de causa raíz + mensajes correctos por dominio.

### 3.4 Almacén operativo (M-09–M-13)

Separar:

| Capa | Pregunta |
|------|----------|
| A. Contexto | ¿El turno define el almacén obligatorio? |
| B. Permisos | ¿Hay permiso por almacén o solo global? |
| C. Sesión | ¿Qué guarda el frontend del usuario actual? |
| D. Turno | `turno_actual_usuario` → `almacen_id` |
| E. UI venta | Eliminar/ocultar selector |
| F. Panel almacén | Botones y responsive |
| G. Admin | Crear/editar bajo acción explícita |

### 3.5 Productos / presentaciones / catálogos (M-03–M-06)

Modelo a respetar:

```text
Producto → Categoría
        → Unidad base
        → producto_presentaciones (N) → Presentación + factor
        → conversión (obtener_conversion_presentacion)
        → minorista / mayorista vía tipo de almacén en precio
```

No duplicar conceptos.

### 3.6 Documentos multi-línea (M-16, M-17)

- Transferencia: alinear UI a `p_lineas` existente.
- Compra: verificar si multi-línea requiere nuevo contrato o N operaciones atómicas UX-agrupadas.
- No romper: `registrar_*`, FIFO, lotes, stock, auditoría, idempotencia, cola offline.

---

## 4. Orden de implementación sugerido (post-documento)

1. **P0 loader** (M-01/19/20) — desbloquea prueba
2. **P0 SQL nombre** (M-18) — desbloquea turno/ops/chat
3. **P0 conectividad** (M-02/07 ± 08)
4. **P0 almacén en venta** (M-09/10) + validación backend
5. P1 presentaciones/productos y catálogos
6. P1 transferencias multi-línea UI
7. P1 compras (tras diseño FIFO seguro)
8. P1 roles UI
9. P2 drawer + almacenes UX + etiquetas + foto + ajustes

---

## 5. Confirmación de alcance de esta misión

| Ítem | Valor |
|------|--------|
| Archivo creado | `BATTLECRUISER_MEJORAS_POST_V9_2_PARTE_3.md` |
| Archivos funcionales modificados | **0** |
| Supabase modificado | **NO** |
| SQL DDL/DML ejecutado | **NO** |
| RPC modificadas | **0** |
| Migraciones creadas | **0** |
| Frontend modificado | **NO** |
| Versión de app cambiada | **NO** |
| PR / ramas | **NO** |

---

## 6. Referencias de repo usadas

- `BATTLECRUISER_CEREBRO.md` (V9.2)
- `BATTLECRUISER_MISION_9.1_INFORME_FINAL.md`
- `public/js/offline.js` (loader, conectividad, cola, T7.1)
- `public/js/auth.js` (login, loader, crear usuario, actualizarApp)
- `public/js/ventas.js` (selector de almacén libre, carrito multi-línea de venta)
- `public/index.html` (markup tabs, formularios)
- `public/service-worker.js` (v45)
- `supabase/b7-operacion-humana.sql` (turnos, responsabilidades, incidencias)
- `supabase/m6-reconciliacion-rpc-mutaciones-criticas.sql` / docs de reconciliación (transferencia/compra/presentaciones)
- Documentación en `docs/` y `docs/archive/` (estado real Supabase histórico)

---

**Fin del documento.**  
Siguiente etapa: implementar por prioridad P0, un punto (o bloque de causa raíz) a la vez, con pruebas Android reales.
