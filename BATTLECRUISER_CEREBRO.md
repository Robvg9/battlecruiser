# BATTLECRUISER — CEREBRO MAESTRO V2

## PROPÓSITO Y VISIÓN
BattleCruiser debe convertirse en un **Centro de Mando del negocio**, no solamente un POS, inventario, Excel o sistema de ventas. Debe conectar operación, inventario, dinero, turnos, responsabilidades, comunicación, auditoría, alertas, rendimiento y administración.

El nombre BattleCruiser puede cambiar en el futuro.

## CONTINUIDAD Y REGLAS
- Revisar el Cerebro y el estado actual de GitHub antes de continuar trabajos importantes.
- Claude no tiene memoria entre cuentas/sesiones nuevas: debe recibir el contexto mínimo y los archivos de trabajo necesarios.
- Si Claude dice que hizo algo, verificar GitHub antes de considerarlo implementado.
- Flujo: **Cerebro → GitHub → auditoría → decisión → misión pequeña para Claude → GitHub → verificación.**
- Dividir misiones grandes para evitar sesiones demasiado pesadas.
- No pedir al usuario archivos que puedan revisarse directamente desde GitHub.
- Antes de implementar funciones nuevas importantes, explicar qué hacen, qué datos usan y las decisiones/riesgos; preguntar antes de cambios arquitectónicos.
- Si algo no funciona, comunicarlo brevemente y volver a intentarlo.
- No inventar resultados de pruebas.

## CONTEXTO DEL NEGOCIO
El sistema se orienta a cafeterías/puntos de venta y almacenes, con ventas, inventario, dinero, entradas, reinversiones, gastos, turnos y responsabilidades.

**Movimiento interno ≠ compra externa.** Una transferencia entre nuestros almacenes/puntos es un movimiento interno; una compra que viene de fuera e incorpora mercancía al inventario es una compra/reinversión externa.

## ESTADO TÉCNICO CONOCIDO
- APP v4.1.
- Service Worker shell-v22.
- B1/B2/B2.1 implementados.
- IndexedDB + cola persistente.
- `ejecutarOperacion()` y `sincronizarCola()`.
- FIFO.
- `idempotency_key` estable por operación lógica.
- Estados PENDIENTE / SINCRONIZANDO / SINCRONIZADA / REQUIERE_ATENCION.
- Reconexión automática.
- Proyección local de stock.
- Recuperación de operaciones atrapadas en SINCRONIZANDO.
- Compra, venta, transferencia y vale conectados a la cola.
- B2.1 corrigió la proyección con presentaciones cuando el factor confiable está disponible en caché.
- Si falta el factor offline, no se inventa una cifra de stock.
- B2.1 no modificó Supabase/RPC/RLS.

## PRESENTACIONES COMERCIALES
Los productos pueden tener presentaciones diferenciadas activables/desactivables.

Ejemplo: caja de cigarros = 1000 CUP, 20 unidades; cigarro suelto = 50 CUP y representa 0.05 de una caja en stock.

Cuando existan dos presentaciones predeterminadas habilitadas, antes de agregar al carrito se debe poder preguntar cuál vender.

Reglas offline:
- LEGACY: usar las cantidades base correspondientes a cada operación.
- PRESENTACIÓN: `cantidad_presentacion × factor = unidades base`.
- El factor no es fuente de verdad del cliente.
- Usar factor solo si existe información confiable cacheada.
- Si no existe, marcar proyección como no calculable.
- La conversión real sigue dependiendo del backend/RPC.

## TURNOS, SESIONES Y CUADRE
El cuadre es por **turno general**, no cada vez que un usuario cierra sesión.

Un turno puede ser de 2, 3, 4 o más días. Normalmente son 3 días, pero el sistema no debe romperse si cambia.

Ejemplo actual:
- 3 días.
- 2 dependientas.
- Dependienta mañana: 7:00–15:00.
- Dependienta tarde: 15:00–19:00.
- 6 sesiones dentro del turno de 3 días.

Las sesiones se identifican por usuarios/roles, no deben depender rígidamente de horarios. Roles ejemplo: Dependienta de la mañana / Dependienta de la tarde.

**No se cuenta inventario al cerrar cada sesión.** El conteo físico se realiza al entregar/recibir el turno general.

Debe existir botón **Entregar turno**. La entrega debe generar como mínimo:
- dinero que se va a entregar;
- revisión de responsabilidades que debieron cumplirse;
- inventario entregado;
- información para el cuadre.

La siguiente dependienta debe revisar y aceptar el inventario inicial que recibió.

El cierre general ocurre cuando se entrega el turno al siguiente turno, después de conteo y auditoría.

## CUADRE DETALLADO
Debe comprobar todo lo ocurrido durante el turno:
- ventas según stock;
- gastos;
- reinversiones;
- entradas;
- bajas;
- dinero recaudado;
- dinero recibido por mañana;
- dinero recibido por tarde;
- fondos para cambios;
- movimientos internos relevantes;
- diferencias de inventario;
- incidencias;
- demás movimientos registrados.

Debe haber comprobaciones explícitas antes del cierre. Ejemplo de reinversión: producto, unidades, dinero reinvertido y total, con confirmación.

Después del cuadre realizado por la dependienta, el Admin hará una segunda revisión usando la información recopilada durante los días del turno. Al principio algunas verificaciones pueden apoyarse en grupos de WhatsApp mientras se desarrolla un sistema mejor.

## ENTREGA, RECEPCIÓN Y AUDITORÍA
El sistema automático calcula lo que debería existir. La dependienta cuenta físicamente y declara el resultado.

Primero se verifica que el conteo sea correcto. Después debe existir un proceso de revisión/juicio entre quien entrega y quien recibe para determinar la responsabilidad.

Si faltan unidades físicas respecto al sistema: **incidencia**, investigación y causa.

Si hay unidades físicas que no aparecen en sistema: determinar si hubo una venta/movimiento mal registrado o permitir una entrada/corrección con motivo. No corregir silenciosamente.

Si una diferencia implica que la persona recibió producto antes y ahora lo entrega, debe poder atribuirse la responsabilidad y reflejarse en el cuadre/total correspondiente según las reglas finales.

## RESPONSABILIDAD Y EXPEDIENTE
Trabajar implica responsabilidades, no solo ganar dinero.

Cada persona debe tener un expediente/historial con hechos positivos y negativos: ventas, cumplimiento, errores, incidencias, tareas, calidad de turnos, diferencias, aprobaciones/rechazos y otros eventos.

El sistema debe calcular un nivel/desempeño a partir del historial.

## TAREAS Y RESPONSABILIDADES
Debe existir un sistema de responsabilidades tachables/checklist por usuario o rol.

Debe existir una persona responsable de verificar que una tarea realmente se realizó.

Las tareas verificadas alimentan el historial y el sistema de recompensas.

## ALARMAS
Sistema de alarmas inmediatas para recordar responsabilidades críticas.

Ejemplo: **“Debes desconectar la nevera”** para conservar batería/energía y asegurar el funcionamiento necesario del punto.

Debe ser configurable.

## NIVELES Y RECOMPENSAS
Sistema de recompensas por desempeño: ventas, calidad de turnos, cumplimiento, responsabilidades, incidencias y desempeño general.

Puede haber dinero u otras recompensas.

La evaluación/recompensa debe estar vinculada principalmente al **rol/desempeño**, no a regalos arbitrarios por usuario.

El Admin conserva la decisión final cuando corresponda.

## CONTROL TOTAL DEL ADMIN
El Admin debe estar al tanto de **todo lo que pueda estar sucediendo**, tanto lo bueno como lo malo.

Debe recibir reportes, notificaciones, alertas, avisos, incidencias, aprobaciones pendientes, rechazos, gastos, reinversiones, bajas, entradas, diferencias, responsabilidades y cambios importantes.

El Admin debe poder aprobar, rechazar o pedir justificación según el caso.

## GASTOS, BAJAS Y APROBACIONES
Las dependientas pueden crear solicitudes de gastos, bajas y otras operaciones permitidas.

El Admin debe recibirlas y poder:
- aprobar;
- rechazar;
- pedir justificación.

Las decisiones quedan registradas. Las bajas requieren motivo.

## ENTRADAS / MOVIMIENTOS INTERNOS
Una entrada desde nuestros almacenes/puntos es movimiento interno y debe diferenciarse de una compra externa.

La persona que transporta puede crear la entrada desde teléfono/PC.

Datos definidos:
- origen;
- destino;
- productos;
- cantidades;
- precio de venta cuando corresponda.

El motivo no es obligatorio para una entrada normal según la decisión actual.

Una dependienta del destino debe aceptar la entrada; sin aceptación no se incorpora definitivamente al sistema. Debe existir siempre una responsable de recibir físicamente la mercancía.

La dependienta puede rechazarla indicando cómo ocurrió correctamente, para corregirla, o rechazarla porque nunca sucedió. Aceptaciones, rechazos y correcciones quedan registradas.

## REINVERSIONES
Existen varios tipos.

**Admin:** reinversiones realizadas personalmente.

**Dependienta:** compra a un proveedor que va directamente al punto de venta y que la dependienta paga. Debe registrar producto recibido, cantidad, dinero pagado, entrada al stock y descuento del monto/caja según la lógica del negocio.

Las reinversiones deben quedar disponibles para revisión/aprobación del Admin según el flujo definitivo.

## DINERO Y MÉTODOS DE PAGO
Actualmente se acepta efectivo.

Debe ser posible habilitar otros métodos de pago en el futuro.

La dependienta de mañana comienza con fondo para cambios. La de tarde comienza con lo que entrega la de mañana.

El flujo de fondos debe formar parte del cuadre y quedar trazable.

## ROLES, PERMISOS Y DISPOSITIVOS
Cada usuario debe tener una vista según permisos de visualización y edición.

Los permisos controlan qué puede ver, editar, ejecutar y aprobar.

Las responsabilidades/configuraciones pueden asociarse al rol.

Debe funcionar desde teléfono, PC y otros dispositivos.

## CENTRO DE MANDO / COMUNICACIÓN
Debe existir una sección donde se vean los usuarios activos.

Debajo: chat grupal y posibilidad de cambiar a conversaciones privadas.

Cada chat debe mostrar punto rojo de novedad/mensaje nuevo.

Los chats privados deben ser privados para usuarios, pero el Admin debe poder supervisarlos sin que los usuarios necesariamente lo sepan, según las reglas de administración definidas.

## OFFLINE-FIRST
Flujo requerido:
1. Datos cacheados.
2. Pérdida de Internet.
3. App continúa abierta.
4. Crear operación.
5. Guardar localmente rápido.
6. Mostrar pendiente.
7. Proyectar stock razonablemente.
8. Recuperar Internet.
9. Sincronizar.
10. Actualizar datos reales desde Supabase.

Error de red → PENDIENTE y reintento.
Error de negocio → REQUIERE_ATENCION y no reintentar infinitamente.

Errores de negocio: stock insuficiente, producto/almacén/presentación inexistente o inactivo, asociación inexistente/inactiva, cantidad inválida, permisos insuficientes.

Una operación pendiente conserva la misma idempotency_key. Una sincronizada no se ejecuta otra vez. Doble evento online no debe provocar sincronizaciones simultáneas. La cola debe sobrevivir cierre/reapertura. SINCRONIZANDO debe recuperarse de forma segura.

## B2.2 — MISIÓN ACTUAL DIVIDIDA

### B2.2-A — VELOCIDAD OFFLINE
Objetivo único: que venta/compra/transferencia/vale offline se guarde localmente rápido y no frene el flujo de venta.

Revisar IndexedDB, guardarOperacionPendiente(), encolar(), refrescos, lecturas completas, transacciones repetidas y trabajo innecesario.

No tocar productos offline, Pendientes, Supabase/RPC/RLS ni Service Worker.

### B2.2-B — PRODUCTOS OFFLINE
Crear productos offline usando la cola existente si es seguro. Si requiere backend, detenerse y preguntar.

### B2.2-C — PENDIENTES
Convertir el botón/contador Pendientes en panel interactivo con operación, producto, cantidad, presentación, fecha, estado, error/motivo y requiere atención.

La sesión anterior intentó `EJECUTORES_POR_TIPO`, `insertarProductoIdempotente()` y cambios relacionados, pero esos cambios **no llegaron a GitHub**. No asumir que existen; comprobar el código actual antes de reutilizar la idea.

## APP INSTALABLE
La visión futura incluye una aplicación instalable para teléfono en lugar de depender de abrir el navegador. Debe evolucionar desde la PWA sin romper la arquitectura actual.

## ROADMAP
**Implementado/conocido:** base POS/inventario, Offline-First B1/B2, cola persistente, idempotencia, proyección local, presentaciones en lógica correspondiente, recuperación de SINCRONIZANDO.

**Actual:** B2.2-A velocidad offline.

**Siguiente:** B2.2-B productos offline; B2.2-C Pendientes.

**Futuro:** cuadre de turnos; entrega/recepción; auditoría físico/sistema; gastos/reinversiones/bajas con aprobación; entradas internas aceptadas/rechazadas; responsabilidades y alarmas; expedientes/niveles/recompensas; Centro de Mando/comunicación; métodos de pago adicionales; app instalable.

## DECISIONES A DEFINIR ANTES DE PROGRAMAR
- Fórmula exacta del cuadre final.
- Cómo se atribuyen diferencias y sobrantes/faltantes.
- Flujo exacto del juicio entre entrega y recepción.
- Quién valida cada tarea.
- Fórmula de niveles/recompensas.
- Reglas completas de supervisión de chats por Admin.
- Flujo definitivo de aprobación de reinversiones/gastos/bajas.
- Auditoría completa de entradas/rechazos.
- Métodos de pago adicionales.
- Empaquetado como app instalable.

## PRINCIPIO CENTRAL
**BattleCruiser debe registrar qué ocurrió, quién fue responsable, quién recibió, quién aprobó, qué esperaba el sistema, qué ocurrió físicamente y cómo se resolvió cada diferencia.**

El objetivo es dar al Admin control y conocimiento de la operación completa sin convertir el trabajo diario en un proceso lento o innecesariamente complicado.
