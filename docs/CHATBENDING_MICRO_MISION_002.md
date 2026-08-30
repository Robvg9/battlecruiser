# ChatBending — Micro-misión 002 (Archivado de usuarios)
**Fecha:** 2026-08-30
**Estado:** 🟡 IMPLEMENTADO / PENDIENTE VALIDACIÓN DE ROBERT (aplicar SQL)

## Decisión de diseño
- Columna aditiva `usuarios.archivado` + `archivado_en`, `archivado_por`, `motivo_archivo`.
- Estados independientes: **ACTIVO** (activo=true, archivado=false), **INACTIVO** (activo=false, archivado=false), **ARCHIVADO** (archivado=true; activo forzado a false).
- Sin borrado físico; historial y FKs intactos.
- Login bloqueado: `usuario_esta_activo()` retorna false si archivado.
- Al restaurar queda **Inactivo** hasta reactivación explícita.
- Auditoría: `registrar_auditoria` tipos `usuario_archivo` / `usuario_restauracion` (tabla existente).

## Arquitectura
- Backend = autoridad real (SECURITY DEFINER + `tiene_permiso('usuarios','editar')`).
- FE solo UI: filtro Operativos/Archivados + botones Archivar/Restaurar.
- Guards backend:
  - No archivar al único Dueño no archivado.
  - No archivar si tiene turno `ABIERTO` o sesión `EN_CURSO`.
  - No activar/desactivar un archivado (hay que restaurar primero).

## Supabase
Archivo: `supabase/m28_usuarios_archivado.sql` — **Robert debe ejecutarlo en el SQL Editor de Supabase antes de probar archivado real.**

RPC nuevas:
- `archivar_usuario(p_usuario_id uuid, p_motivo text DEFAULT NULL)`
- `restaurar_usuario(p_usuario_id uuid)`

RPC actualizadas:
- `listar_usuarios_admin(p_incluir_archivados boolean DEFAULT false)` — por defecto solo operativos; con true solo archivados.
- `usuario_esta_activo()` — false si archivado.
- `perfil_usuario_actual()` — incluye columna `archivado`.
- `cambiar_estado_usuario` — rechaza si el usuario está archivado.

## Frontend
- `public/js/m28-usuarios-archivado.js` (parche sobre refrescarUsuarios / render)
- `public/app.js` carga `m28-usuarios-archivado.js?v=28.1`

## No-regresión
- No se tocan cards de Usuarios, Nuevo Usuario, Roles, creación, asignación de roles, shell, historial, sesiones, ventas, inventario.
- Usuario archivado sigue visible en registros históricos (solo se oculta de lista operativa).

## Riesgo
Sin aplicar el SQL, las RPC fallarán con mensaje visible; el FE no inventa permisos ni estados.

## Pruebas pendientes (Robert)
- [ ] Usuario activo aparece en Operativos
- [ ] Archivar requiere permiso editar
- [ ] Archivado desaparece de Operativos y aparece en Archivados
- [ ] Archivado no puede iniciar sesión (usuario_esta_activo = false)
- [ ] No se puede archivar único Dueño ni con turno/sesión abierta
- [ ] Historial intacto
- [ ] Restaurar → vuelve como Inactivo; Activar lo recupera
- [ ] Auditoría registra archivo/restauración
- [ ] Nuevo Usuario y Roles siguen funcionando
