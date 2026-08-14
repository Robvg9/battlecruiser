# BATTLECRUISER — CEREBRO MAESTRO

## PROPÓSITO
Documento maestro de continuidad del proyecto. Conserva visión, decisiones, arquitectura, estado, roadmap y reglas de trabajo para evitar pérdida de contexto entre sesiones y cuentas.

## REGLA DE CONTINUIDAD
Antes de cualquier misión importante: revisar este Cerebro y el estado real de GitHub. No asumir que una sesión de Claude terminó correctamente: verificar el repositorio.

Flujo de trabajo:
**Cerebro → GitHub → auditoría → decisión con Sr. Robert → misión pequeña para Claude → GitHub → verificación.**

Claude ejecuta cambios de código; la arquitectura y decisiones importantes se revisan antes de implementarse.

## REGLA DE IMPLEMENTACIÓN
Antes de implementar una función nueva, explicar brevemente qué hará, qué datos utilizará y qué riesgos/decisiones existen. Sr. Robert decide antes de cambios arquitectónicos importantes.

## ESTADO TÉCNICO ACTUAL
- APP: v4.1.
- Service Worker: shell-v22.
- B1/B2/B2.1 implementados.
- IndexedDB para lecturas y operaciones pendientes.
- Cola persistente.
- `ejecutarOperacion()`.
- `sincronizarCola()`.
- Estados: PENDIENTE / SINCRONIZANDO / SINCRONIZADA / REQUIERE_ATENCION.
- `idempotency_key` persistente por operación lógica.
- FIFO.
- Proyección local de stock.
- Reconexión automática.
- Recuperación de operaciones atrapadas en SINCRONIZANDO.
- Compras, ventas, transferencias y vales conectados a la cola.
- Presentaciones comerciales contempladas en la proyección cuando existe factor confiable en caché.
- Sin cambios a Supabase/RPC/RLS durante B2.1.

## B2.2 ACTUAL
B2.2 se dividió en misiones pequeñas para evitar sesiones demasiado grandes.

### B2.2-A — ACTUAL
Objetivo: mejorar la velocidad real del guardado Offline-First.

- Revisar IndexedDB y reducir lecturas/transacciones/refrescos innecesarios.
- Mantener FIFO, idempotencia, estados y proyección.
- No tocar productos offline ni panel Pendientes en esta misión.
- No tocar Supabase/RPC/RLS.

### B2.2-B — DESPUÉS
- Crear productos offline usando la cola existente, si es seguro.
- Si requiere cambios de backend: detenerse y consultar.

### B2.2-C — DESPUÉS
- Convertir Pendientes en botón/panel interactivo.
- Mostrar operación, producto, cantidad, presentación, fecha, estado y error/motivo.

## VISIÓN DEL SOFTWARE
BattleCruiser no debe quedarse como un simple POS, inventario o Excel. La visión es un **Centro de Mando** para controlar la operación completa del negocio.

### Operación e inventario
- Inventario actual.
- Inventario inicial de turno.
- Presentaciones comerciales diferenciadas y configurables por producto.
- Venta por presentación, por ejemplo caja vs unidad suelta.
- Movimientos internos entre puntos/almacenes.
- Diferenciar movimiento interno de compra/reinversión externa.
- Métodos de pago configurables.

### Turnos y cuadre
- Turnos configurables de 2, 3, 4 o más días.
- Normalmente 3 días, pero sin romper el sistema si cambia la duración.
- Roles como Dependienta de la mañana / Dependienta de la tarde.
- No contar inventario en cada cierre de sesión.
- Conteo físico al entregar/recibir el turno general.
- Entrega y recepción de turno mediante botones específicos.
- Inventario inicial debe ser aceptado por quien recibe después de comprobarlo.
- Auditoría entre inventario esperado por sistema y conteo físico.
- Diferencias generan incidencias y trazabilidad.
- Si falta producto: registrar incidencia y determinar causa.
- Si sobra producto físico: permitir corrección/entrada con motivo y registro.
- Cuadre completo de ventas, gastos, reinversiones, entradas, dinero recibido, fondos y demás movimientos.
- Revisión posterior del Admin.

### Responsabilidad y control del Admin
El Admin debe estar informado de todo lo relevante, tanto correcto como incorrecto.

- Reportes.
- Notificaciones.
- Alertas.
- Gastos pendientes de aprobación.
- Reinversiones pendientes.
- Bajas pendientes.
- Entradas pendientes.
- Incidencias.
- Responsabilidades incumplidas.
- Historial completo y trazabilidad.

### Entradas y reinversiones
- Una entrada desde otro punto/almacén es movimiento interno.
- Una compra externa que entra al inventario es una compra/reinversión externa.
- Las entradas pueden ser creadas por quien transporta la mercancía.
- Deben incluir origen, destino, productos y cantidades, y precio de venta cuando corresponda.
- La dependienta del destino debe aceptar la entrada para que se incorpore al sistema.
- Puede rechazarla y registrar cómo ocurrió realmente.
- Todo rechazo/corrección queda registrado.
- Gastos y bajas pueden ser creados por dependientas pero requieren aprobación del Admin.
- Reinversiones de dependientas: pago a proveedor que lleva producto directamente al punto de venta; se descuenta el dinero pagado y entra el stock correspondiente.
- Existen también reinversiones realizadas personalmente por el Admin.

### Alarmas y responsabilidades
- Sistema de alarmas para recordatorios operativos inmediatos.
- Ejemplo: desconectar la nevera para conservar batería/energía.
- Responsabilidades/tareas tachables por usuario o rol.
- Una persona responsable debe verificar que las tareas realmente se realizaron.
- El cumplimiento se acumula para evaluación.

### Rendimiento y recompensas
- Expediente por persona.
- Historial de desempeño bueno y malo.
- Evaluación de dependientas.
- Niveles.
- Recompensas económicas u otras.
- Métricas basadas en ventas, cumplimiento y calidad de los turnos.
- Las responsabilidades y recompensas se asignan principalmente por rol, no como regalo arbitrario por usuario.

### Comunicación
- Sección de usuarios activos.
- Chat grupal.
- Pestañas privadas.
- Indicadores/puntos rojos para mensajes nuevos.
- Chats privados con privacidad para usuarios, pero con capacidad de supervisión del Admin cuando corresponda.

### Permisos
- Cada usuario ve y edita según sus permisos.
- El Admin tiene una vista superior de control.
- La aplicación debe funcionar desde teléfono, PC y otros dispositivos.

### App instalable
- Evolucionar desde PWA/navegador hacia una aplicación instalable para teléfono.

## DECISIONES IMPORTANTES
- El conteo de inventario se hace en entrega/recepción del turno general, no cada vez que una persona cierra sesión.
- Las sesiones no dependen estrictamente de horarios; los roles representan funciones como mañana/tarde.
- Solo el usuario de una sesión puede cerrarla.
- En cambios de sesión se prefieren botones de entregar turno; el cierre general corresponde al cambio de turno.
- La persona que recibe debe aceptar el inventario inicial recibido.
- Las diferencias físicas/sistema deben quedar registradas como incidencias, no corregirse silenciosamente.
- El Admin decide si las sugerencias automáticas son correctas.
- Los cambios de funciones nuevas deben ser aprobados antes de implementarse cuando impliquen decisiones importantes.

## REGLAS DE TRABAJO CON CLAUDE
- Claude no necesita ni debe recibir el Cerebro completo si solo necesita archivos concretos para una misión, salvo que el contexto sea necesario.
- Las misiones deben dividirse en piezas pequeñas.
- Claude debe trabajar sobre archivos actuales y no asumir cambios de sesiones anteriores.
- Si una sesión de Claude se corta, verificar GitHub antes de continuar.
- No pedir al usuario archivos que ya están disponibles en GitHub.
- No afirmar que algo se implementó hasta verificar el repositorio cuando sea posible.
- Si algo no funcionó: comunicarlo brevemente y volver a intentarlo.

## ROADMAP INMEDIATO
1. B2.2-A — Optimización de velocidad Offline-First.
2. B2.2-B — Productos offline.
3. B2.2-C — Panel Pendientes.
4. Auditoría molecular completa de la versión estable.
5. Continuar funciones del Centro de Mando por módulos pequeños.

## NOTA
Este documento debe actualizarse cuando exista una decisión, implementación o cambio importante de visión. No sustituye la verificación del código real de GitHub.
