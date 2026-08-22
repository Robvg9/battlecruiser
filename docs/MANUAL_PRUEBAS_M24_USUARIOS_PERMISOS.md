# BattleCruiser — M24 Usuarios + Roles + Permisos

## Usuarios
- [ ] Crear usuario con nombre, correo y contraseña.
- [ ] Confirmar que el administrador conserva su sesión.
- [ ] Confirmar usuario creado en la lista.
- [ ] Asignar rol.
- [ ] Cambiar rol.
- [ ] Desactivar usuario.
- [ ] Activar usuario.
- [ ] Intentar desactivar al único Dueño: debe rechazarse.
- [ ] Usuario inactivo no puede ejecutar operaciones.
- [ ] Cerrar sesión y entrar con el nuevo usuario.

## Roles
- [ ] Ver roles.
- [ ] Crear rol nuevo.
- [ ] Editar nombre/descripción si la interfaz lo permite.
- [ ] Activar/desactivar rol si la interfaz lo permite.
- [ ] No permitir borrar rol protegido/asignado cuando corresponda.

## Permisos
- [ ] Para un rol, probar Ver.
- [ ] Probar Crear.
- [ ] Probar Editar.
- [ ] Probar Borrar.
- [ ] Probar editar_any cuando exista.
- [ ] Quitar un permiso y comprobar que desaparece la UI correspondiente.
- [ ] Intentar la operación directamente aunque el botón esté oculto: backend debe rechazarla.
- [ ] Volver a otorgar permiso y comprobar recuperación.
- [ ] Comprobar módulos: Productos, Compras, Ventas, Inventario/Stock, Caja, Turnos, Reportes, Usuarios.

## Seguridad y regresión
- [ ] Usuario A no conserva permisos de usuario B después de logout/login.
- [ ] Usuario sin permiso no puede acceder escribiendo/manipulando la ruta/UI.
- [ ] Usuario inactivo no puede operar.
- [ ] Offline: navegación usa contexto conocido, pero operaciones protegidas no deben inventar autorización.
- [ ] Reconexión vuelve a cargar permisos reales.
- [ ] Cambios de rol/estado quedan auditados.
- [ ] Probar permisos sobre Ventas, Compras, Inventario, Caja y Turnos.
- [ ] Recargar aplicación y confirmar que los permisos persisten desde Supabase.
