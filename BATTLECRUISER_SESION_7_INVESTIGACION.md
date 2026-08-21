# BATTLECRUISER — SESIÓN 7/30 — INVESTIGACIÓN
## Almacenes (#11, #12, #13)

**Fecha:** 2026-08-21  
**Repo auditado:** `Robvg9/battlecruiser` @ `main` (post-restore `d727d669`)  
**Alcance:** SOLO investigación. Sin cambios de código funcional, Supabase, migraciones ni commits de implementación.

---

## 1. RESUMEN EJECUTIVO

Al seleccionar un almacén en `#alm-selector` ocurren **dos reacciones en paralelo**:

1. **`almacenes.js`** actualiza el panel **inline** `#alm-info-panel` y la lista `#lista-stock` (diseño de la pestaña Almacenes).
2. **`panel-contextual.js`** abre el **drawer fijo a la derecha** `#panel-contextual` con `abrirPanelContextual("almacen", id)`.

En viewport ≤640px el drawer tiene `width:100%` y `height:100%`, por lo que en Android se percibe como **pantalla completa/modal principal**, no como “panel lateral de PC”. Eso explica el reclamo de Roberto (#11).

Los **tres botones** que ve (#12) no están en `#alm-info-panel`, sino en el **panel contextual de almacén** (`renderPanelAlmacen`):

| Texto | Acción real |
|-------|-------------|
| **Ir a Almacenes** | `irATab("almacenes")` + cierra panel |
| **Ver en Almacenes** | `irATab("almacenes")` + `seleccionarAlmacen(id)` + cierra panel |
| **Conversar** | `abrirConversacionSobreEntidad("almacen", id, …)` (si hay permiso/helper) |

Crear/editar almacén (#13): el formulario `#form-almacen` **ya está oculto por defecto** (`class="hidden"`) y solo se muestra vía menú **Acciones ▾**. La vista principal ya es selector + info + productos. El gap es principalmente de **claridad UX / percepción** (y posible confusión si el usuario no encuentra Acciones), no de un formulario siempre visible en DOM no-oculto.

**Responsable de implementación de los tres puntos: GROK (frontend).** Claude solo si se revalidan permisos/RPC de almacén (no es el núcleo de #11–#13).

---

## 2. #11 — ESTADO REAL

### Qué ocurre al seleccionar un almacén

1. Usuario cambia `#alm-selector`.
2. Listener en `almacenes.js` (`safeInit("almacenes-ui")`):
   - `seleccionarAlmacen(sel.value)`
   - actualiza `_almacenSeleccionadoId`
   - `renderPanelAlmacenSeleccionado()` → pinta `#alm-info-panel` (grid Nombre/Tipo/Estado/Productos/Unidades/Alertas)
   - `renderProductosDelAlmacen(id)` → pinta `#lista-stock`
   - habilita/deshabilita Editar y Activar/desactivar en el menú Acciones.
3. Listener **adicional** en `panel-contextual.js` (`safeInit("panel-contextual")`):
   - si `almSel.value` → `abrirPanelContextual("almacen", almSel.value)`.

### Handler / HTML / CSS del overlay

| Pieza | Ubicación |
|-------|-----------|
| Apertura | `panel-contextual.js` → `abrirPanelContextual` / `renderPanelAlmacen` |
| Shell | `#panel-contextual` + `#panel-contextual-backdrop` (inyectados en `document.body` por `_pcEnsureShell`) |
| CSS | Estilos inyectados (`#panel-contextual-styles`): fixed right, `width:min(100%,380px)`, `height:100%`; **`@media (max-width:640px){ .panel-contextual{width:100%} }`** |
| Panel inline | `#alm-info-panel` en `index.html` + CSS `.alm-info-panel` / `.alm-info-grid` en `style.css` |

### Desktop vs móvil

- **Desktop (≥641px):** drawer ~380px a la derecha — se acerca a “panel lateral”.
- **Android / ≤640px:** drawer **100% ancho + 100% alto** → experiencia de pantalla completa.
- **No hay** media query que desactive el auto-open del contextual al cambiar el selector en móvil.
- El panel **inline** `#alm-info-panel` es el diseño “en la pestaña”; el contextual es **reutilizable T6/T7** pensado para detalle desde otras listas (`data-ctx-tipo` / ventas / trf / vales).

### Bug / efecto colateral adicional

- **Doble listener** en el mismo `change` del selector: UX redundante (info inline **y** drawer).
- Si el usuario ya está en Almacenes, abrir contextual es especialmente ruidoso.
- Cierre: botón ×, backdrop, Escape — documentado en código; no validado en dispositivo real aquí.

---

## 3. #11 — CAUSA(S)

| # | Causa | Evidencia |
|---|--------|-----------|
| C1 | Auto-apertura del panel contextual al `change` de `#alm-selector` | `panel-contextual.js` final: `almSel.addEventListener("change", … abrirPanelContextual("almacen", …))` |
| C2 | En móvil el panel contextual ocupa 100% del ancho | CSS inyectado `@media (max-width:640px)` |
| C3 | No se distingue “selección operativa en tab Almacenes” vs “detalle contextual desde otro módulo” | Misma acción de selector dispara ambos caminos |

**HECHO:** C1 y C2 están en el código actual.  
**HIPÓTESIS (no probada en Android real):** Roberto interpreta el drawer como “pantalla principal” porque tapa el tab Almacenes completo.

---

## 4. #11 — SOLUCIÓN PROPUESTA

**Responsable: GROK**

1. **Quitar o condicionar** el `change` de `#alm-selector` que llama a `abrirPanelContextual` cuando el usuario **ya está en la pestaña Almacenes** (la info inline basta).
2. Mantener el panel contextual para almacén cuando se abra desde **otros contextos** (`data-ctx-tipo="almacen"` u otros entry points).
3. Opcional UX móvil: si se mantiene el drawer en otros flujos, valorar bottom-sheet / altura parcial en vez de `width:100%` full-screen (mejora global del componente, no solo Almacenes).
4. **No** eliminar `#alm-info-panel`: es la experiencia nativa del tab.

**No requiere Claude/Supabase.**

---

## 5. #12 — ESTADO REAL DE CADA BOTÓN

Fuente: `renderPanelAlmacen` en `panel-contextual.js`. Los tres botones viven en `.panel-ctx-acciones` del **panel contextual**, no en `#alm-info-panel`.

### Botón 1 — “Ir a Almacenes”

| Campo | Valor |
|-------|--------|
| ID | Sin id fijo; clase `cc-accion panel-ctx-accion` |
| `data-pc-action` | `ir-tab` |
| `data-tab` | `almacenes` |
| Handler | Delegado global: `cerrarPanelContextual()` + `irATab("almacenes")` |
| RPC | Ninguna |
| Clasificación | **C) Funciona pero su UX es confusa** — si el usuario abrió el panel **desde** Almacenes, el botón solo cierra y “vuelve” a la misma pestaña. Tiene sentido cuando el panel se abrió desde **otra** sección. |

### Botón 2 — “Ver en Almacenes”

| Campo | Valor |
|-------|--------|
| `data-pc-action` | `seleccionar-almacen` |
| `data-id` | id del almacén |
| Handler | `cerrarPanelContextual()` + `irATab("almacenes")` + `seleccionarAlmacen(id)` |
| RPC | Ninguna |
| Clasificación | **B/C** — Funciona; en contexto “ya en Almacenes + ya seleccionado” es **casi redundante** con el botón 1 y con el propio selector. Útil si el panel se abrió desde otro lado y hace falta **fijar** el almacén en el selector del tab. |

### Botón 3 — “Conversar”

| Campo | Valor |
|-------|--------|
| `data-pc-action` | `chat` |
| `data-entidad-tipo` | `almacen` |
| `data-id` / `data-titulo` | id y título |
| Render condicional | Solo si `tienePermiso("comunicacion","crear"\|"ver")` **y** existe `abrirConversacionSobreEntidad` o `abrirConversacionContextual` |
| Handler | Preferente: `abrirConversacionSobreEntidad(tipo, id, titulo)`; fallback: `irATab("comunicacion")` |
| RPC | Indirecto vía módulo comunicación (no en este archivo) |
| Clasificación | **A) Funciona y tiene sentido** como acción T7 de chat contextual; **C** en UX si el label no explica “conversación sobre este almacén”. No es código muerto si el helper y permisos existen. |

**Importante:** No asumir fallo de los botones 1–2; **sí demuestran** navegación a Almacenes, lo que Roberto interpretó como “vuelven al menú de almacenes”.

---

## 6. #12 — CAUSA(S)

1. Acciones del panel contextual de almacén están orientadas a **navegación + chat**, no a editar/activar (eso está en **Acciones ▾** del tab).
2. Desde el tab Almacenes, “Ir a Almacenes” / “Ver en Almacenes” parecen inútiles o “rotos”.
3. “Conversar” es coherente con T7 pero el copy no contextualiza.

---

## 7. #12 — SOLUCIÓN PROPUESTA

**Responsable: GROK**

1. Si se deja de auto-abrir el contextual desde el selector (#11), los botones 1–2 se usan menos en el flujo que molesta a Roberto.
2. Ajustar copy / visibilidad:
   - Ocultar “Ir a Almacenes” si `tab` actual ya es `almacenes`.
   - Renombrar “Ver en Almacenes” → p.ej. “Seleccionar en lista” solo cuando haga falta.
   - “Conversar” → “Chat sobre este almacén” (o similar).
3. Opcional: en panel contextual de almacén, añadir atajos a Editar / Activar que deleguen a `abrirFormEditarAlmacen` / toggle (sin duplicar RPC).

**Claude:** solo si el chat contextual falla por permisos/RPC de comunicación (fuera del núcleo de #12).

---

## 8. #13 — ESTADO REAL

### Crear / editar hoy

| Elemento | Estado |
|----------|--------|
| `#form-almacen` | En DOM dentro de `#tab-almacenes`, clase **`inline-form alm-form-panel hidden`** → **no visible** por defecto |
| Abrir crear | `#alm-crear-btn` → `abrirFormCrearAlmacen()` → `classList.remove("hidden")` |
| Abrir editar | `#alm-editar-btn` → `abrirFormEditarAlmacen()` (requiere `_almacenSeleccionadoId`) |
| Cerrar | `#alm-cancelar-btn` / post-submit → `cerrarFormAlmacen()` |
| Menú | `#alm-acciones-btn` + `#alm-acciones-menu` (hidden por defecto) |
| Submit crear | `ejecutarOperacion("almacen", { p_nombre, p_tipo })` |
| Submit editar | `editarAlmacen` → `ejecutarOperacion("almacen_actualizar", { p_almacen_id, p_nombre, p_tipo })` |
| Toggle activo | `activarDesactivarAlmacen` → `ejecutarOperacion("almacen_estado", { p_almacen_id, p_activo })` |

### PC vs Android (código)

- Mismo DOM; formulario se inserta **encima** del info panel al quitar `hidden` (ocupa espacio vertical en móvil).
- No es modal/drawer dedicado; es panel inline expandible.

### ¿Coincide con lo que pide Roberto?

| Deseo Roberto | Código actual |
|---------------|---------------|
| Catálogo/listado como vista principal | Parcial: hay **selector** + info + productos; `lista-almacenes` está **hidden** (compat) |
| Crear solo al invocar | **Sí** — vía Acciones |
| Editar solo al invocar | **Sí** — vía Acciones + selección |
| No siempre desplegado | **Sí** — `hidden` por defecto |

Posible gap de percepción: formulario al abrirse no es modal; o el usuario no asocia “Acciones ▾” con crear/editar.

---

## 9. #13 — CAUSA(S)

1. **No hay bug de “formulario siempre visible”** en el HTML actual post-restore.
2. El reclamo puede venir de: (a) experiencia previa, (b) confusión con el panel contextual, (c) deseo de modal/drawer en vez de expand inline, (d) falta de listado tipo catálogo (cards) frente a solo `<select>`.

---

## 10. #13 — SOLUCIÓN PROPUESTA

**Responsable: GROK** (frontend UX)

1. Mantener invocación solo desde Acciones (ya implementado).
2. Mejoras opcionales alineadas al pedido:
   - Abrir crear/editar en **modal/drawer** reutilizando patrón de panel contextual o `.pass-panel`.
   - Reforzar vista principal: listado visual de almacenes (hoy `lista-almacenes` está oculto).
3. Backend/RPC: **no tocar** salvo regresión; operaciones ya pasan por cola offline.

**Claude:** solo si hay que revisar grants/RPC `almacen` / `almacen_actualizar` / `almacen_estado`.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Rol |
|---------|-----|
| `public/js/almacenes.js` | Selector, info inline, form crear/editar, toggle, RPC vía `ejecutarOperacion` |
| `public/js/panel-contextual.js` | Drawer, auto-open en selector, 3 botones, CSS inyectado |
| `public/js/comunicacion.js` | `abrirConversacionSobreEntidad` (chat) |
| `public/js/navegacion.js` | `irATab` (asumido) |
| `public/index.html` | `#tab-almacenes`, form, selector, menú Acciones |
| `public/style.css` | `.alm-*` |
| `public/app.js` | Carga dinámica de `panel-contextual.js` |
| `public/js/offline.js` | Tipos `almacen`, `almacen_actualizar`, `almacen_estado` |
| `public/service-worker.js` | Cache de `panel-contextual.js` |

---

## 12. RESPONSABLE: GROK / CLAUDE

| Trabajo | Responsable |
|---------|-------------|
| Dejar de auto-abrir contextual desde selector en tab Almacenes | **GROK** |
| Copy/visibilidad botones panel contextual | **GROK** |
| UX móvil del drawer (width 100%) | **GROK** |
| Modal opcional para form crear/editar | **GROK** |
| RPC/permisos almacén / chat | **CLAUDE** solo si falla backend |
| Validación Android | Roberto / QA |

---

## 13. DEPENDENCIAS

- #11 → reduce ruido de #12 (menos exposición a botones redundantes).
- #13 es **independiente** de #11/#12 a nivel código; UX puede implementarse en paralelo.
- Panel contextual compartido con productos/ventas/trf/vales: cambios en CSS móvil afectan otros flujos.

---

## 14. RIESGOS

| Riesgo | Nivel | Mitigación |
|--------|-------|------------|
| Quitar auto-open y perder detalle desde selector | Bajo | Mantener info inline; contextual sigue por `data-ctx-*` |
| Cambiar CSS global del drawer | Medio | Probar también producto/venta/vale |
| Modal del form sin focus trap / scroll lock | Bajo-medio | Reutilizar patrones existentes |
| Chat sin permiso | Bajo | Botón ya es condicional |

---

## 15. CRITERIOS DE CIERRE

**#11 (Android)**  
- Seleccionar almacén en tab Almacenes **no** abre pantalla completa del contextual.  
- Sí se actualiza info inline + lista de productos.  
- Desde otro contexto (si existe), el detalle de almacén sigue abrible.

**#12**  
- Cada botón visible tiene propósito claro en su contexto.  
- No hay dos botones que parezcan “volver a Almacenes” sin diferencia útil.  
- Conversar inicia flujo de comunicación o comunica error de permiso de forma clara.

**#13**  
- Formulario crear/editar **no** visible al entrar a Almacenes.  
- Solo aparece tras Acción explícita.  
- Cancelar / éxito lo ocultan de nuevo.  
- PC y Android coherentes.

*No se inventan resultados de pruebas Android en esta sesión.*

---

## 16. SESIONES DE IMPLEMENTACIÓN ESTIMADAS

| Problema | Implementación | Validación | Notas |
|----------|----------------|------------|-------|
| #11 | 0.5–1 sesión GROK | 0.5 sesión Android | Cambio puntual listener + opcional CSS móvil |
| #12 | 0.5 sesión GROK | 0.5 sesión | Copy + hide condicional; acoplado a #11 |
| #13 | 0–1 sesión GROK | 0.5 sesión | Base ya cumple; modal/listado = opcional |

**Total orientativo:** 1–2 sesiones de implementación + 1 de validación Android para cerrar el bloque Almacenes.

---

## TABLA FINAL

| Problema | Causa confirmada | Responsable | Implementación estimada | Validación estimada |
|----------|------------------|-------------|-------------------------|---------------------|
| #11 | Auto-open de `#panel-contextual` al `change` de `#alm-selector` + drawer 100% ancho en ≤640px | GROK | 0.5–1 sesión | 0.5 sesión |
| #12 | Tres botones del contextual: 2 navegación a Almacenes (redundantes en-tab), 1 Conversar (T7) | GROK | 0.5 sesión | 0.5 sesión |
| #13 | Form ya `hidden` y solo vía Acciones; gap es UX/percepción (modal vs inline, catálogo) | GROK | 0–1 sesión | 0.5 sesión |

---

## SESIÓN 7/30 — PASS

**Archivo:** `BATTLECRUISER_SESION_7_INVESTIGACION.md`  
**Código funcional modificado:** 0  
**Supabase modificado:** NO  
**Commits funcionales:** 0  
