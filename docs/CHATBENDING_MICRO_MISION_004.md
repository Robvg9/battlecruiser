# ChatBending — MICRO-MISIÓN 004
**Fecha:** 2026-08-30
**HEAD inicial:** 34995a3170feeacab3f91ca7ecb013cc62a8b619
**Estado:** 🟡 IMPLEMENTADO / PENDIENTE VALIDACIÓN DE ROBERT (requiere aplicar SQL en LIVE)

## Problemas reportados
1. HOME de Turnos muestra muchas cards vacías sin turnos reales.
2. Cuenta Dueño/ADMIN: "No se pudo crear: Solo ADMIN puede crear Turnos".

## Causa raíz

### Problema 1 — Cards vacías
- Contenedor real: `#tab-ciclos` → `#ciclos-m18-root`.
- `turnos-maestro.js` `home()` itera `warehouses().map` y pinta **1 card por almacén** con "No hay turno creado" cuando no hay turno activo.
- `m18-ciclos-ux.js` y `m24-asignaciones-operativas.js` también escriben en el mismo root (panel asignaciones vía MutationObserver).
- M29 v29.2 reclamaba ownership, pero `turnos-maestro` hace `setTimeout(init, 400)` y **reemplaza** `window.BattleCruiserTurnosMaestro = { home, open }`, revirtiendo el claim.
- Mensaje vacío de M29 no coincidía con el texto exigido.

### Problema 2 — Dueño rechazado al crear
- FE puede mostrar el botón vía `tiene_permiso` / fallback.
- Creación: `TurnoAPI.crearTurno` → RPC `bc_crear_turno` → `IF NOT public.bc_actor_is_admin() THEN RAISE 'Solo ADMIN...'`.
- Rol operativo B3 = **`Dueño`**, no el string `ADMIN`.
- `bc_actor_is_admin()` en LIVE no alineaba Dueño ni `tiene_permiso('turnos',…)`.
- `resolveAdmin()` FE no normalizaba todas las formas de respuesta ni reconocía rol `Dueño` en fallback.

## Solución

### FE — M29 v29.3 (único dueño HOME)
- `isTurnoReal()` más estricto: exige id + señal de dominio Turno (estado/plan/almacén de turno); rechaza placeholders y objetos solo-almacén.
- Mensaje exacto vacío: **"No existe ningún turno actualmente."**
- `normalizeAdminFlag()` + `isDueñoRole()` en `resolveAdmin()` (sin bypass `state.isAdmin = true`).
- Guard MutationObserver más agresivo: si en HOME no hay `.m29-wrap` o hay `.tm-wrap` / paneles m24/m22 → re-render.
- Reclaim ampliado (20 × 250ms) para cubrir el `setTimeout(400)` de maestro.
- Claim reescribe `refrescarCiclos` / `refrescarTurnos` / `BattleCruiserTurnosMaestro.home`.

### Supabase (obligatorio aplicar en LIVE)
- `supabase/migrations/20260830_bc_actor_is_admin_align_dueno.sql` (ya en repo)
- Redefine `bc_actor_is_admin()` con autoridad B3:
  - `tiene_permiso('turnos','editar_any'|'crear')`
  - `tiene_permiso('ciclos','editar_any'|'crear')` (compat)
  - rol activo `Dueño` / `admin` / `administrador`
- REVOKE anon; GRANT authenticated.
- No se inventa un segundo sistema de permisos; se alinea la función que ya usan todas las RPC TURNO.

## Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `public/js/m29-turnos-organizacion.js` | v29.3 — filtro real, mensaje exacto, admin Dueño, guard fuerte |
| `public/app.js` | `?v=29.3` |
| `supabase/migrations/20260830_bc_actor_is_admin_align_dueno.sql` | ya presente (aplicar en LIVE) |
| `docs/CHATBENDING_MICRO_MISION_004.md` | este documento |

## RPC involucradas
- `bc_actor_is_admin` (corregida por SQL)
- `bc_crear_turno` (sin cambio de firma; usa bc_actor_is_admin)
- `listar_turnos`

## Tests ejecutados
- `node --check` OK en `m29-turnos-organizacion.js` y `app.js`.

## No-regresión
No se modificaron Usuarios, Roles, Archivado, Ventas, Inventario, offline, detalle de Turno (maestro.open intacto), shell global.

## Checklist Robert
1. **Aplicar SQL** `supabase/migrations/20260830_bc_actor_is_admin_align_dueno.sql` en Supabase SQL Editor (LIVE).
2. Actualizar app (borrar caché / hard refresh).
3. Turnos / cero datos: solo `+ Crear Turno` (si Dueño) + **"No existe ningún turno actualmente."** — **cero cards vacías**.
4. Dueño: botón visible y **crear funciona** (sin "Solo ADMIN puede crear Turnos").
5. Usuario no autorizado: sin botón / backend rechaza.
6. Con 1+ turnos reales: exactamente 1 card por turno real.
7. Entrar al detalle y volver a HOME: sin paneles Asignaciones/Secciones ni cards de almacén.
8. Usuarios / Roles / Ventas / Inventario intactos.

## HEAD
- Inicial: `34995a3170feeacab3f91ca7ecb013cc62a8b619`
- Final: (ver commit más reciente en main)
