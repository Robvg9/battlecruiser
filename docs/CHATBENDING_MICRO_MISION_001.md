# ChatBending — Micro-misión 001 (+ corrección)
**Fecha:** 2026-08-30  
**Responsable dirección funcional:** ROBERT  
**Estado:** 🟡 IMPLEMENTADO / PENDIENTE VALIDACIÓN DE ROBERT

## Objetivo original
Reorganizar Usuarios: card Roles y Permisos fuera de la página; acceso vía botón Roles → modal → Nuevo Rol en segundo modal.

## Fallo encontrado por Robert (validación parcial)
1. El botón **+ Nuevo Usuario** desapareció de la sección Usuarios (regresión).
2. El campo de nombre en el modal **Nuevo Rol** se veía demasiado grande.

## Causa raíz
1. **Nuevo Usuario:** race entre `roles-en-usuarios.js` y `ui-usuarios-dashboard.js`. Si `injectRolesButton`/`injectHeroButtons` creaba `#ud-hero` *antes* que el dashboard, el hero quedaba solo con el botón Roles. El dashboard, al ver que `#ud-hero` ya existía, no reinyectaba `#ud-scroll-crear`.
2. **Campo Nuevo Rol:** CSS del modal aplicaba `width:100%` y padding generoso al `#rol-nombre`; se compactó a input de una línea (altura fija ~40px).

## Corrección (001-CORRECCIÓN)
- `injectHeroButtons`: garantiza **ambos** botones en orden `[ + Nuevo Usuario ] [ Roles ]`, reordena/recrea si faltan.
- Handler de Nuevo Usuario: abre el modal existente `#ud-modal-crear` / `#form-nuevo-usuario` (sin segundo sistema).
- CSS `#rol-nombre`: altura fija, una línea, sin resize; conversión textarea→input si aplica.
- Cache-bust: `roles-en-usuarios.js?v=33.2`

## Archivos afectados
| Archivo | Cambio |
|---------|--------|
| `public/js/roles-en-usuarios.js` | Restaurar Nuevo Usuario + input rol compacto |
| `public/app.js` | `roles-en-usuarios` → `33.2` |

## Verificaciones
- `node --check` OK.
- Sin cambios Supabase.
- Sin tocar listado, KPIs, permisos, navegación.

## Resultado
Corrección frontend mínima. Pendiente re-validación runtime de Robert.
