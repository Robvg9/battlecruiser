-- BattleCruiser — Backend Mission 1 — Seguridad: revocar EXECUTE a anon
-- en las 7 funciones administrativas de roles/usuarios que quedaron con
-- GRANT EXECUTE ... TO anon, authenticated en m11_roles_crud.sql y
-- m10_crear_usuario_interno (posteriores a m3-seguridad-revoke-anon-global.sql,
-- que ya había establecido "anon nunca ejecuta RPC de negocio").
--
-- Verificado en la auditoría previa (Backend Mission 0): estas 7 funciones
-- validan tiene_permiso()/auth.uid() internamente, así que no eran
-- explotables hoy con la clave anon pública — pero violan la política ya
-- declarada como fuente de verdad. Esta migración solo cierra ese hallazgo.
--
-- NO se toca el grant a `authenticated`: el flujo real de administración
-- de usuarios/roles sigue operando igual para usuarios con sesión.
--
-- Funciones afectadas:
--   crear_rol(text)
--   editar_rol(uuid, text)
--   eliminar_rol(uuid)
--   activar_desactivar_rol(uuid, boolean)
--   actualizar_permisos_rol(uuid, jsonb)
--   listar_roles_admin(boolean)
--   crear_usuario_interno(uuid, text)

REVOKE EXECUTE ON FUNCTION public.crear_rol(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.editar_rol(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.eliminar_rol(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.activar_desactivar_rol(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.actualizar_permisos_rol(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.listar_roles_admin(boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.crear_usuario_interno(uuid, text) FROM anon;
