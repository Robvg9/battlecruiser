# ChatBending — Micro-misión 001
**Fecha:** 2026-08-30  
**Responsable dirección funcional:** ROBERT  
**Estado:** 🟡 IMPLEMENTADO / PENDIENTE VALIDACIÓN DE ROBERT

## Objetivo
Reorganizar la sección Usuarios: eliminar la card inferior "Roles y Permisos" de la página principal; acceso vía botón "Roles" → modal "Roles y Permisos" → "+ Nuevo Rol" → segundo modal "Nuevo Rol". Sin duplicar sistema de roles/permisos ni tocar Supabase.

## Diagnóstico (auditoría previa)
- HTML base: `public/index.html` — `#tab-usuarios` (usuarios + form crear); roles viven en `#tab-config` (`#form-nuevo-rol`, `#lista-roles`, `#msg-roles`).
- `public/js/roles-en-usuarios.js` movía form/lista a card `#bc-roles-en-usuarios` visible en Usuarios.
- `public/js/ui-usuarios-dashboard.js` estilizaba KPIs, hero "+ Nuevo usuario", y promovía la card de roles.
- Lógica de negocio: `public/js/usuarios-permisos-rest.js` (`refrescarRolesAdmin`, `renderizarRolesAdmin`, `crear_rol` vía submit de `#form-nuevo-rol`, permisos, etc.).
- Backend ya soporta listar/crear/editar roles y permisos (RPCs existentes). **Sin cambios Supabase.**

## Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `public/js/roles-en-usuarios.js` | Card → modal Roles y Permisos; form Nuevo Rol en segundo modal; API `bcOpenRolesModal` |
| `public/js/ui-usuarios-dashboard.js` | Botón "Roles" junto a Nuevo Usuario; oculta card roles; cache-bust visual |
| `public/app.js` | Versiones módulos: roles-en-usuarios `33.1`, ui-usuarios-dashboard `46.2` |

## Archivos creados
- `docs/CHATBENDING_MICRO_MISION_001.md` (este registro)

## Funciones modificadas / reutilizadas
- Reutilizadas sin cambio: `refrescarRolesAdmin`, `renderizarRolesAdmin`, handlers `safeInit("admin-roles")`, RPCs `listar_roles_admin`, `crear_rol`, `permisos_por_rol`, etc.
- Nuevas (solo UI): `openRolesModal`, `closeRolesModal`, `openNuevoRolModal`, `closeNuevoRolModal` en roles-en-usuarios.js.

## Backend / RPC consultados
Ninguna modificación. Contrato existente suficiente.

## Tests
- `node --check` en los 3 JS modificados: OK.
- Suite `test/b3-usuarios-permisos.test.js` no ejecutada en sandbox (requiere entorno app); no se alteró la API de permisos.

## Comprobaciones de no-regresión (checklist para Robert)
Ver sección "Prueba exacta para Robert" del informe de misión.

## Problemas descubiertos pero NO corregidos
- En `index.html` el bloque "Roles y permisos" sigue en Configuración en el markup; se vacía/oculta al mover nodos al modal (comportamiento ya previo con roles-en-usuarios). No se eliminó del HTML para minimizar diff (regla de no tocar arquitectura ajena).
- No existe archivo ChatBending central previo en el repo; se registra esta micro-misión en `docs/`.

## Resultado
Implementación frontend mínima completada. Pendiente validación runtime de Robert.
