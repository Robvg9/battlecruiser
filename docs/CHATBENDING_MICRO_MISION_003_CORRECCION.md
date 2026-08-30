# ChatBending — MICRO-MISIÓN 003-CORRECCIÓN
**Fecha:** 2026-08-30
**Estado:** 🟡 IMPLEMENTADO / PENDIENTE VALIDACIÓN DE ROBERT

## Causa raíz real

1. **Contenedor real de Turnos** = `#tab-ciclos` → `#ciclos-m18-root` (la pestaña `data-tab="ciclos"` relabelada a "Turnos").
   - `#tab-turnos` es UI legacy (abrir/cerrar turno simple) y ya se ocultaba.
2. **Cards vacías**: `turnos-maestro.js` y `m18-ciclos-ux.js` iteraban `warehouses()` y pintaban **una card por almacén** aunque no hubiera turno (`"No hay turno creado"`).
3. **Asignaciones Operativas en HOME**: `m24-asignaciones-operativas.js` montaba `#m24-asig-panel` dentro de `#ciclos-m18-root` vía MutationObserver en **cualquier** re-render del root, incluida la HOME.
4. **Carrera de HOMEs**: m18 (M21), turnos-maestro y M29.1 competían por el mismo root; M29.1 solo ocultaba con CSS y `setTimeout`, sin ownership real.

## Arquitectura anterior incorrecta

- HOME = mapa de almacenes + panel de asignaciones globales.
- M29.1 = overlay CSS + timeouts, no dueño único.

## Solución

- **M29 v29.2** es el **único dueño de la HOME** (`window.__BC_TURNOS_HOME_OWNER = 'm29'`).
- HOME renderiza **solo turnos reales** de `TurnoAPI.listarTurnos` / `listar_turnos` (filtro `isTurnoReal`).
- Cero turnos → título + `[+ Crear Turno]` + mensaje vacío. **Sin cards de almacén.**
- Modal Crear Turno → `bc_crear_turno` → abre detalle existente.
- Detalle / sesiones / asignaciones: `BattleCruiserTurnosMaestro.open` (sin tocar su lógica interna).
- Ownership: reemplaza `refrescarCiclos`, `refrescarTurnos`, `BattleCruiserTurnosMaestro.home`.
- Hook de navegación real (click en tab ciclos/turnos) + guard MutationObserver si un legacy reescribe el root.
- En HOME: elimina `#m24-asig-panel` / `#m22-sesiones-panel` y marca `data-m29-home="1"`.

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `public/js/m29-turnos-organizacion.js` | Reescrito v29.2 — dueño único HOME |
| `public/app.js` | `?v=29.2` |

## Módulos legacy afectados (sin reescritura destructiva)

- `turnos-maestro.js` — detalle/open intactos; HOME puede ser reclamada por M29.
- `m18-ciclos-ux.js` — detalle M21 intacto; HOME reclamada.
- `m24-asignaciones-operativas.js` — funcionalidad intacta; panel no permanece en HOME.

## Supabase

Sin cambios. RPC: `bc_crear_turno`, `listar_turnos`, `bc_actor_is_admin`.

## Tests

- `node --check` OK en `m29-turnos-organizacion.js`.

## Checklist Robert

1. Actualizar app (cache-bust).
2. Entrar a **Turnos**.
3. **Cero turnos**: solo título + `+ Crear Turno` (+ mensaje vacío). Sin cards vacías, sin Asignaciones, sin Secciones.
4. **Crear turno** → modal → card real → abrir detalle.
5. **Dentro del detalle**: sesiones / asignar pueden aparecer.
6. **Volver a HOME**: sin Asignaciones Operativas.
7. Usuarios / Nuevo Usuario / Roles / Ventas intactos.

## Riesgos residuales

- Si `turnos-maestro` pinta HOME antes de que M29 reclame, el guard reescribe en el siguiente tick.
- Asignaciones globales de M24 siguen existiendo en detalle/contexto no-home; no se eliminó el módulo.
