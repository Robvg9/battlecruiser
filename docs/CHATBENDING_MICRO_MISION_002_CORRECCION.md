# ChatBending — Micro-misión 002-CORRECCIÓN
**Fecha:** 2026-08-30
**Estado:** 🟡 IMPLEMENTADO / PENDIENTE VALIDACIÓN DE ROBERT

## Problemas reportados
1. Archivar no hacía desaparecer al usuario de Operativos.
2. Falta acceso a Usuarios archivados desde Ajustes.
3. Cards de usuario crecían al añadir botón Archivar (botones en dos filas).

## Causa raíz (#1)
- Backend de archivado requiere `supabase/m28_usuarios_archivado.sql` aplicado en Supabase.
- Si la RPC `archivar_usuario` no existe, el FE no debe fingir éxito (ahora mensaje explícito).
- Con SQL aplicado, `listar_usuarios_admin` excluye archivados por defecto; el refresco M28 es la autoridad de listado.

## Solución FE
- `m28-usuarios-archivado.js` v28.2: labels cortos **Archivar** / **Restaurar**, CSS `flex-wrap:nowrap` en acciones (misma fila), errores claros si falta SQL, API `window.__bcM28AbrirArchivados`.
- `m28-ajustes-archivados.js` v28.2: enlace **Usuarios archivados** en panel Ajustes → abre tab Usuarios en vista archivados.
- `app.js`: carga ambos módulos `?v=28.2`.

## Supabase
Sin cambios nuevos. Sigue siendo obligatorio aplicar `supabase/m28_usuarios_archivado.sql` si aún no está.

## No-regresión
No se tocaron 4 KPIs, Nuevo Usuario, Roles, Nuevo Rol, shell, ventas, turnos, inventario.

## Prueba Robert
1. Confirmar SQL M28 aplicado en Supabase.
2. Usuarios → [Archivar] en un usuario no-Dueño sin turno abierto → desaparece de lista.
3. Ajustes → Usuarios archivados → aparece → [Restaurar] → vuelve como Inactivo.
4. Botones [Desactivar] [Archivar] en la misma fila, card sin crecimiento vertical.
5. + Nuevo Usuario y Roles siguen OK.
