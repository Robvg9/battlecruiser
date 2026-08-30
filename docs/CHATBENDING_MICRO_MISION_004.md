# ChatBending — MICRO-MISIÓN 004
**Fecha:** 2026-08-30
**HEAD inicial:** d8e49990ea1978afcb4c5af6d6814e818f50891f
**Estado:** 🟡 IMPLEMENTADO / PENDIENTE VALIDACIÓN DE ROBERT (requiere aplicar SQL)

## Problemas reportados
1. HOME de Turnos muestra muchas cards vacías sin turnos reales.
2. Cuenta Dueño/ADMIN: "No se pudo crear: Solo ADMIN puede crear Turnos".

## Causa raíz

### Problema 1 — Cards vacías
- Contenedor real al pulsar Turnos (tras unificación): `#tab-ciclos` → `#ciclos-m18-root`.
- `turnos-maestro.js` y `m18-ciclos-ux.js` generan **1 card por almacén** (`warehouses().map`), incluso sin turno.
- `m24-asignaciones-operativas.js` inyecta el panel **Asignaciones operativas** en el root vía MutationObserver en cualquier re-render (incluida HOME).
- M29.1 solo ocultaba con CSS + `setTimeout`; no era dueño real del render.

### Problema 2 — Dueño rechazado al crear
- El botón FE puede mostrarse vía `tiene_permiso` / fallback de rol.
- La creación llama `TurnoAPI.crearTurno` → RPC `bc_crear_turno`.
- Todas las RPC TURNO de autoridad usan `public.bc_actor_is_admin()` (p.ej. `bc_editar_dias_turno`: `IF NOT public.bc_actor_is_admin() THEN RAISE 'Solo ADMIN...'`).
- El rol operativo del sistema (B3) se llama **`Dueño`**, no el string `ADMIN`.
- `listar_turnos` ya usa `tiene_permiso('turnos','editar_any')` como admin; `bc_actor_is_admin` no alineaba Dueño con esa autoridad → backend rechaza aunque el Dueño sea la autoridad real.
- **No es bypass FE**: se corrige la autoridad backend `bc_actor_is_admin()`.

## Solución

### FE (HOME)
- Reescritura de `m29-turnos-organizacion.js` **v29.2** como único renderizador de HOME.
- Flag `__BC_TURNOS_HOME_OWNER` / `__BC_M29_VIEW`.
- Solo cards con `id` de turno real; mensaje: "No existe ningún turno actualmente."
- Modal crear → RPC existente; asignaciones de trabajadoras en detalle.
- Reclama hooks de navegación; guard si legacy reescribe root; elimina panel m24 en HOME.

### Supabase (obligatorio aplicar en LIVE)
- `supabase/migrations/20260830_bc_actor_is_admin_align_dueno.sql`
- Redefine `bc_actor_is_admin()` con autoridad del sistema:
  - `tiene_permiso('turnos','editar_any'|'crear')`
  - `tiene_permiso('ciclos','editar_any'|'crear')` (compat)
  - rol activo `Dueño` (B3) o `admin` / `administrador`
- REVOKE anon; GRANT authenticated.
- Con esto, `bc_crear_turno` y el resto de gates `bc_actor_is_admin()` reconocen al Dueño.

## Archivos
- `public/js/m29-turnos-organizacion.js` (v29.2)
- `public/app.js` (?v=29.2)
- `supabase/migrations/20260830_bc_actor_is_admin_align_dueno.sql` (**aplicar en Supabase**)
- `docs/CHATBENDING_MICRO_MISION_004.md`

## RPC involucradas
- `bc_actor_is_admin` (corregida)
- `bc_crear_turno` (sin cambio de firma; usa bc_actor_is_admin)
- `listar_turnos`

## No-regresión
No se modificaron Usuarios, Roles, Archivado, Ventas, Inventario, offline, shell global.

## Checklist Robert
1. **Aplicar SQL** `20260830_bc_actor_is_admin_align_dueno.sql` en Supabase SQL Editor.
2. Actualizar app (borrar caché).
3. Turnos / cero datos: solo `+ Crear Turno` + "No existe ningún turno actualmente."
4. Dueño: botón visible y **crear funciona**.
5. No admin: sin botón / backend rechaza.
6. Detalle de turno y volver a HOME sin paneles ajenos.
7. Usuarios / Roles intactos.
