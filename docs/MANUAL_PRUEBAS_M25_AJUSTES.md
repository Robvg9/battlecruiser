# BattleCruiser — M25 Ajustes

## Ajustes básicos
- [ ] Abrir Ajustes y comprobar que carga una sola vez.
- [ ] Activar/desactivar Modo compacto; recargar y comprobar persistencia.
- [ ] Activar/desactivar Actualización automática; comprobar que no se crean timers duplicados.
- [ ] Activar/desactivar Sincronización automática; comprobar que solo cambia la preferencia y no rompe la cola offline.
- [ ] Cambiar Preferencia de conexión: Automático / Preferir online / Preferir offline.
- [ ] Cambiar Notificaciones; comprobar persistencia.
- [ ] Cambiar Apariencia: Sistema / Clara / Oscura y recargar.
- [ ] Restaurar ajustes; comprobar valores por defecto.

## Rendimiento / regresión
- [ ] Abrir/cerrar Ajustes varias veces: no duplicar controles.
- [ ] Navegar entre Centro de Control, Productos, Turnos, Historiales y Ajustes.
- [ ] Recargar aplicación después de cada cambio importante.
- [ ] Comprobar Service Worker v78.
- [ ] Comprobar que la actualización automática no funciona mientras la pestaña está oculta.
- [ ] Volver a la pestaña y comprobar que continúa sin duplicar intervalos.

## Offline / conexión
- [ ] Online: navegación y operaciones existentes funcionan.
- [ ] Offline: navegación existente conserva su comportamiento.
- [ ] Crear operación offline y comprobar cola/sincronización según reglas existentes.
- [ ] Cambiar preferencias offline/online sin borrar operaciones pendientes.
- [ ] Reconectar y comprobar que no se duplican operaciones.

## Notificaciones / apariencia
- [ ] Notificaciones activadas/desactivadas no producen errores JS.
- [ ] Apariencia clara no rompe textos, botones ni modales.
- [ ] Apariencia oscura conserva legibilidad.
- [ ] Sistema vuelve a la apariencia del dispositivo.

## Regresión crítica
- [ ] Ventas.
- [ ] Compras.
- [ ] Inventario.
- [ ] Turnos.
- [ ] Aprobaciones.
- [ ] Gastos/Mermas/Reinversiones.
- [ ] Historiales.
- [ ] Usuarios/Permisos.
