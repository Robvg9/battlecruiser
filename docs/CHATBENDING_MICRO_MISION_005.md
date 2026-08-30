# ChatBending — MICRO-MISIÓN 005
**Fecha:** 2026-08-30
**HEAD inicial:** a5fbd8dbf5da5e136ecfd8d951135a11c3068e6e (v9.4.25)
**Estado:** 🟢 IMPLEMENTADO — orden Step1 corregido de forma determinista

## Problema
La Parte 1 (Información) del expediente de Turno mostraba:
1. Grilla ☀️ Mañana / 🌙 Tarde (sesiones)
2. Después la información general (Almacén, Estado, Desde, Hasta, Duración, Sesiones, Dependientas, Dinero)
3. Título "Sesiones" en posición incorrecta

Orden deseado:
1. Información general
2. #### Sesiones
3. Grilla Mañana (izq) | Tarde (der)

## Causa raíz
1. **m33-turnos-final.js** construye el body de Step 1 como:
   - `.m33-summary` × 2 (info general)
   - `<h4>Sesiones</h4>`
   - nodos `.m33-session`
2. **m49-turnos-layout-definitivo.js** tomaba los `.m33-session` y hacía:
   `body.insertBefore(grid, body.firstElementChild)`
   → la grilla quedaba **siempre al inicio**, antes de la info.
3. **m50-turno-step1-order.js** buscaba `.m33-body[data-m33-step="1"]`, atributo que **nunca se escribe** en el render de m33 → el reordenador no encontraba el body y no actuaba.

No era un problema de CSS ni de datos: era ownership de inserción del DOM + selector muerto.

## Solución (determinista, sin setTimeout ni polling extra)
### m49 v49.2
- `placeGridAfterInfo(body, grid)`:
  - Si existe heading "Sesiones" → `heading.insertAdjacentElement('afterend', grid)`
  - Si no, después del último `.m33-summary`
  - Fallback: append
- Step 2 sin cambios (grid al inicio es correcto ahí)

### m50 v50.4 (red de seguridad)
- Ya no depende de `data-m33-step`
- Localiza body visible del modal
- Fuerza orden: summaries → heading Sesiones → grid
- Un solo MutationObserver

### app.js
- Versión visible: **v9.4.26**
- Cache-bust: `m49-turnos-layout-definitivo.js?v=49.2`, `m50-turno-step1-order.js?v=50.4`

## Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `public/js/m49-turnos-layout-definitivo.js` | v49.2 — insertar grid DESPUÉS de info/heading |
| `public/js/m50-turno-step1-order.js` | v50.4 — reorder robusto sin data-m33-step |
| `public/app.js` | v9.4.26 + cache-bust 49.2 / 50.4 |
| `docs/CHATBENDING_MICRO_MISION_005.md` | este documento |

## Validación esperada (Robert)
Tras hard-refresh (Actualizar app / borrar caché):
1. Turnos → abrir turno (ej. La Cueva) → Parte 1 Información
2. Orden exacto:
   - Almacén / Estado / Desde / Hasta
   - Duración / Sesiones / Dependientas / Dinero
   - **Sesiones**
   - ☀️ Mañana (izq) | 🌙 Tarde (der)
   - Día 1, 2, 3 alineados por columna
3. Step 2 (Asignaciones) sigue con grilla + checkbox "misma dependienta"
4. Botón Avanzar presente; sin sesiones duplicadas; sin scroll horizontal en desktop
5. Footer / footnote muestra **v9.4.26**

## No-regresión
No se tocaron: Asignaciones lógica, Movimientos, Inventario, Resumen, RPC, permisos, offline, navegación, Productos, Usuarios, Roles.

## HEAD
- Inicial: `a5fbd8dbf5da5e136ecfd8d951135a11c3068e6e`
- Final: (commit de esta misión en main)
