# ChatBending — Micro-misión 002 (Archivado de usuarios)
**Fecha:** 2026-08-30
**Estado:** 🟡 IMPLEMENTADO / PENDIENTE VALIDACIÓN DE ROBERT

## Decisión de diseño
- Columna aditiva `usuarios.archivado` + `archivado_en`, `archivado_por`, `motivo_archivo`.
- Estados: ACTIVO, INACTIVO, ARCHIVADO (sin mezclar).
- Sin borrado físico; historial intacto.
- Login bloqueado: `usuario_esta_activo()` retorna false si archivado.
- Auditoría: `registrar_auditoria` tipos usuario_archivo / usuario_restauracion.

## Supabase
Archivo: `supabase/m28_usuarios_archivado.sql` — **aplicar en SQL Editor de Supabase**.
RPC nuevas: archivar_usuario, restaurar_usuario.
Actualiza: listar_usuarios_admin, usuario_esta_activo, perfil_usuario_actual, cambiar_estado_usuario.

## Frontend
- `public/js/m28-usuarios-archivado.js`
- `public/app.js` carga `m28-usuarios-archivado.js?v=28.1`

## Riesgo
Sin aplicar el SQL, las RPC fallarán con mensaje visible; el FE no inventa permisos.
