# BATTLECRUISER — CEREBRO MAESTRO V2

## PROPÓSITO Y VISIÓN
BattleCruiser debe convertirse en un **Centro de Mando del negocio**, no solamente un POS, inventario, Excel o sistema de ventas. Debe conectar operación, inventario, dinero, turnos, responsabilidades, comunicación, auditoría, alertas, rendimiento y administración.

El nombre BattleCruiser puede cambiar en el futuro.

## CONTINUIDAD Y REGLAS
- Revisar el Cerebro y el estado actual de GitHub antes de continuar trabajos importantes.
- Claude no tiene memoria entre cuentas/sesiones nuevas: debe recibir el contexto mínimo y los archivos de trabajo necesarios.
- Si Claude dice que hizo algo, verificar GitHub antes de considerarlo implementado.
- Flujo: **Cerebro → GitHub → auditoría → decisión → misión → GitHub → verificación.**
- Evitar dividir artificialmente el proyecto en microtareas: las misiones deben representar bloques funcionales completos y verificables.
- No pedir al usuario archivos que puedan revisarse directamente desde GitHub.
- Antes de implementar funciones nuevas importantes, explicar qué hacen, qué datos usan y las decisiones/riesgos; preguntar antes de cambios arquitectónicos.
- Si algo no funciona, comunicarlo brevemente y volver a intentarlo.
- No inventar resultados de pruebas.
- Las pruebas de usuario real se realizarán **al final de la fase de implementación**, una vez terminados los bloques funcionales previstos y los problemas técnicos que surjan durante el desarrollo.

## DOCTRINA DE TRABAJO — OBLIGATORIA
BattleCruiser es una misión continua de ingeniería. El objetivo de cada sesión es **hacer realidad la visión de BattleCruiser sin romper ni duplicar lo que ya existe**.

### Rol del analista/arquitecto
El analista debe actuar como responsable de continuidad, arquitectura y auditoría. Antes de proponer una implementación debe:
1. Leer el Cerebro.
2. Revisar GitHub real.
3. Revisar Supabase real cuando la misión afecte backend, datos, RPC, RLS o esquema.
4. Identificar cómo funciona realmente el sistema actual.
5. Comparar la propuesta con la arquitectura existente.
6. Detectar reutilización posible antes de crear sistemas nuevos.
7. Detectar contradicciones entre requisitos y código real.
8. Diseñar la misión mínima y segura para el ejecutor.
9. Verificar después que lo implementado realmente existe.

**No asumir que algo existe porque aparezca mencionado en el Cerebro. GitHub/Supabase representan el estado técnico real.**

### Rol de Claude
Claude es el ejecutor de misiones concretas. Debe implementar lo que se le indique, revisar el código real necesario para hacerlo correctamente y reportar resultados. No debe recibir el Cerebro completo como sustituto de una misión técnica ni tomar decisiones arquitectónicas grandes por su cuenta.

Si Claude encuentra una contradicción real, debe detenerse y señalarla antes de aplicar cambios destructivos o arquitectónicos.

### Regla anti-duplicación
**Antes de crear una tabla, cola, caché, helper, mecanismo de idempotencia, RPC, servicio o arquitectura nueva, comprobar si ya existe un mecanismo equivalente y reutilizarlo.**

No crear una segunda arquitectura para resolver un problema que la arquitectura existente ya resuelve.

Ejemplos:
- Una sola cola offline.
- Un solo mecanismo central de idempotencia.
- Una sola fuente real para reglas críticas del backend.
- No crear tablas de idempotencia dedicadas por operación si existe una tabla central reutilizable.
- No duplicar cachés ni proyecciones sin justificación arquitectónica.

### Regla de precedencia
Cuando exista una contradicción:
1. La seguridad e integridad del sistema tienen prioridad.
2. La arquitectura real existente tiene prioridad sobre una suposición.
3. El código/esquema real tiene prioridad sobre una descripción antigua.
4. El Cerebro se actualiza después de descubrir una decisión técnica real para que futuras sesiones no repitan el análisis.
5. Nunca resolver una contradicción inventando una tercera arquitectura sin analizar primero las dos existentes.

### Regla de honestidad
Nunca decir “implementado”, “probado” o “verificado” si no se comprobó realmente. Si una herramienta bloquea una operación, decirlo y buscar la vía correcta. No trasladar innecesariamente trabajo técnico al usuario.

## CONTEXTO DEL NEGOCIO
El sistema se orienta a cafeterías/puntos de venta y almacenes, con ventas, inventario, dinero, entradas, reinversiones, gastos, turnos y responsabilidades.

**Movimiento interno ≠ compra externa.** Una transferencia entre nuestros almacenes/puntos es un movimiento interno; una compra que viene de fuera e incorpora mercancía al inventario es una compra/reinversión externa.

## ESTADO TÉCNICO CONSOLIDADO — 2026-08-15
- Rama principal de desarrollo: `main`.
- `main` consolidó B2.2-B.3.1, B2.2-B.3.2 y B2.2-D.
- SHA consolidado registrado: `3af997c8a52aa377e6cf04469a54fd766982b44e`.
- Las tres implementaciones fueron integradas sin conflictos en `main` y posteriormente verificadas.
- Validación automatizada reportada: **115/115 PASS, 0 FAIL**.
- `node --check public/app.js`: OK.
- Arquitectura IndexedDB: únicamente stores `lecturas` y `operaciones_pendientes`.
- Una única cola offline persistente.
- Un único `_sincronizando` para impedir sincronizaciones concurrentes.
- Un único `RPC_POR_TIPO` para enrutar operaciones.
- Una única `_cache` para los datos cacheados existentes.
- `idempotency_key` estable por operación lógica.
- Estados PENDIENTE / SINCRONIZANDO / SINCRONIZADA / REQUIERE_ATENCION.
- Reconexión automática.
- Proyección local de stock.
- Recuperación de operaciones atrapadas en SINCRONIZANDO.
- Compra, venta, transferencia y vale conectados a la cola.
- Panel de operaciones pendientes implementado.
- Gestión/reintento/atención de operaciones pendientes implementada.
- Cierre de la capa Offline-First de escritura, sincronización, reconciliación e idempotencia implementado.
- B2.3 — Centro de Control Operacional implementado (capa de lectura/acción sobre la cola Offline-First existente; 0 stores/colas/cachés/RPC nuevos).
- B3 — Sistema operacional de usuarios, roles, permisos y control implementado. Reutiliza la arquitectura real de Supabase (usuarios/roles/permisos/tiene_permiso/RLS).
- B4 — Centro de Mando + auditoría + trazabilidad operativa implementado. Reutiliza operaciones_pendientes/_cache/_usuarioActual/tiene_permiso. SQL de auditoría versionado (pendiente de aplicar).
- B5 — Reportes y análisis operativo implementado. Reutiliza tablas existentes + tiene_permiso('reportes','ver'). SQL de reportes versionado (pendiente de aplicar).
- B6 — Núcleo operativo + inventario inteligente IMPLEMENTADO. Reutiliza lotes_compra (SÍ EXISTE, ver auditoría), tiene_permiso, operaciones_idempotencia, operaciones_pendientes, _cache. Crea compras + movimientos_stock (no existían). RPC registrar_compra/venta/transferencia/vale con FIFO, costo real, atomicidad. SQL versionado (pendiente de aplicar).
- B7 — Operación humana IMPLEMENTADO. Turnos, cuadres, responsabilidades e incidencias. Reutiliza _validar_usuario_operacion (B6), tiene_permiso, registrar_auditoria (B4), operaciones_pendientes + ejecutarOperacion (B2). Crea tablas turnos/cuadres/responsabilidades/incidencias + RPC seguros (abrir_turno, cerrar_turno, registrar_cuadre, revisar_cuadre, crear_responsabilidad, crear_incidencia, etc.). SQL versionado (pendiente de aplicar).
- App v7.0, Service Worker shell-v28.
- Validación automatizada: **107/107 PASS** (16 B2.3 + 14 B3 + 12 B4 + 11 B5 + 27 B6 + 27 B7).
- La prueba real desde navegador/dispositivo todavía no se considera fase de aceptación final; queda deliberadamente para el final del desarrollo.

## IDEMPOTENCIA — ARQUITECTURA REAL
BattleCruiser ya posee un mecanismo centralizado de idempotencia compartido por las operaciones existentes.

Componentes reales confirmados:
- `private.operaciones_idempotencia`.
- `private.reclamar_idempotencia(key, usuario, tipo_operacion, payload)`.
- `idempotency_key` como clave primaria.
- `usuario_id`.
- `tipo_operacion`.
- `payload_hash`.
- `resultado_id`.

El patrón existente usa `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING` y posteriormente recupera el registro. También valida que una clave no sea reutilizada por otro usuario, otro tipo de operación o un payload diferente. Los RPC existentes registran `resultado_id` al completar la operación.

**Regla:** todo nuevo RPC que necesite idempotencia debe integrarse con este mecanismo central. No crear tablas de idempotencia paralelas por operación salvo una decisión arquitectónica explícita y documentada.

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

## B2.2 — ESTADO Y MISIONES

### B2.2-A — VELOCIDAD OFFLINE — CERRADA
Problema: guardar una operación offline era lento por múltiples aperturas/lecturas de IndexedDB.

Solución real implementada en `public/app.js`:
- `idbAbrir()` memoiza la conexión.
- Maneja `onversionchange`.
- `actualizarContadorColaPendiente()` usa el índice `estado` + `count()`.
- `refrescarOperacionesPendientesCache()` usa índices directamente.
- No se creó otra cola.
- No se creó otra caché.
- No se modificó `ejecutarOperacion()`.
- `idempotency_key` se conserva.
- FIFO se conserva.
- Estados se conservan.

Validación con fake-indexeddb: 5 operaciones pasaron de 15 aperturas de IndexedDB a 1 apertura. No había Playwright/Chromium disponible, por lo que la prueba real de navegador quedó pendiente para la fase final de pruebas.

B2.2-A está CERRADA.

### B2.2-B — PRODUCTOS OFFLINE — BLOQUE REDEFINIDO
Objetivo original: permitir crear productos sin Internet y sincronizarlos posteriormente usando la cola existente.

La arquitectura Offline-First transversal ya quedó consolidada con B2.2-B.3.1, B2.2-B.3.2 y B2.2-D. Por tanto, los futuros módulos offline deben reutilizar directamente esa infraestructura en lugar de crear otra cola, otra caché o otro mecanismo de sincronización.

#### B2.2-B.1 — BACKEND — DECISIÓN ARQUITECTÓNICA
No crear una tabla de idempotencia específica para productos.

Los RPC existentes `registrar_compra`, `registrar_venta`, `registrar_transferencia` y `registrar_vale_salida` utilizan el mecanismo central:
- `private.operaciones_idempotencia`;
- `private.reclamar_idempotencia(...)`;
- `idempotency_key`;
- `usuario_id`;
- `tipo_operacion`;
- `payload_hash`;
- `resultado_id`.

`crear_producto`, si se implementa como operación offline, debe reutilizar exactamente este mecanismo central, con un `tipo_operacion` propio como `crear_producto`. No introducir `public.operaciones_productos_idempotencia` ni ningún segundo mecanismo equivalente.

#### B2.2-B.2 — FRONTEND
Conectar el formulario real de creación de productos con `ejecutarOperacion()` y la cola existente cuando el RPC/backend correspondiente esté confirmado y probado.

No duplicar lógica de cola ni inventar IDs definitivos offline.

#### B2.2-B.3 — UX / PROYECCIÓN
Mostrar claramente productos/operaciones pendientes sin convertir una proyección local en fuente de verdad. La reconciliación debe utilizar el resultado real del backend al sincronizar.

### B2.2-B.3.1 — PANEL DE OPERACIONES PENDIENTES — CERRADA
Implementado y consolidado en `main`.

Incluye:
- pestaña/panel de Pendientes;
- operación/tipo;
- producto y datos relevantes disponibles;
- cantidad/presentación cuando forman parte del payload;
- fecha;
- estado;
- error/motivo;
- indicación de requiere atención;
- contador coherente con la cola real;
- reutilización directa de `operaciones_pendientes`.

No se creó un segundo store ni una segunda cola.

### B2.2-B.3.2 — GESTIÓN Y RECUPERACIÓN — CERRADA
Implementado y consolidado en `main`.

Incluye la gestión de operaciones pendientes, reintentos controlados, atención de errores de negocio y recuperación sin modificar la `idempotency_key` ni duplicar operaciones.

### B2.2-D — CIERRE OFFLINE-FIRST — CERRADA
Implementado y consolidado en `main`.

Queda cubierta la cadena:
**operación local → cola persistente → estado → sincronización → idempotencia → eliminación/reconciliación → refresco → recuperación ante reconexión**.

Se verificaron casos de cola mixta, error de red con recuperación, errores de negocio, doble sincronización, preservación literal de `idempotency_key` y fallo de refresco sin reejecución de la operación.

Resultado reportado de la batería consolidada: **115 PASS / 0 FAIL**.

## ESTADO ACTUAL DEL MAPA
### Ya construido
1. Base POS/inventario.
2. Presentaciones comerciales.
3. Cache/lecturas offline.
4. Cola Offline-First persistente.
5. FIFO y estados de operación.
6. Idempotencia central.
7. Proyección local de stock.
8. Reconexión y recuperación.
9. Panel de Pendientes.
10. Gestión y recuperación de pendientes.
11. Reconciliación y cierre de la capa Offline-First.
12. Consolidación de todo lo anterior en `main`.

### En desarrollo inmediato
El siguiente bloque general es **B2.3 — CENTRO DE CONTROL OPERACIONAL**, cuyo objetivo es pasar de una infraestructura Offline-First ya sólida a una capa visible de control operativo que permita al sistema mostrar qué está ocurriendo, qué requiere atención y qué debe hacer cada persona, sin crear una segunda arquitectura.

### Después de B2.3
1. Operaciones de productos y demás módulos pendientes que necesiten integrarse a la infraestructura existente.
2. Turnos, entrega/recepción y cuadre.
3. Auditoría físico vs sistema y atribución de diferencias.
4. Gastos, reinversiones y bajas con aprobación.
5. Entradas/movimientos internos con aceptación/rechazo.
6. Responsabilidades, alarmas y verificación.
7. Expedientes, niveles y recompensas.
8. Centro de Mando/comunicación.
9. Métodos de pago adicionales.
10. App instalable.
11. Pruebas integrales de usuario real y aceptación final.

## B2.3 — CENTRO DE CONTROL OPERACIONAL — PRÓXIMO BLOQUE GENERAL

### Objetivo 100%
Construir la primera capa real de **control operativo visible** sobre la infraestructura existente. El Admin y los usuarios deben poder entender el estado del negocio y actuar sobre aquello que requiere atención, sin depender de revisar manualmente tablas, colas o registros técnicos.

B2.3 no debe rehacer Offline-First. Debe consumir y extender los mecanismos ya consolidados.

### B2.3-A — ESTADO OPERACIONAL GLOBAL
Crear una representación clara del estado actual de la operación:
- conexión online/offline;
- operaciones pendientes;
- operaciones que requieren atención;
- sincronizaciones en curso;
- datos locales que requieren reconciliación;
- alertas importantes;
- responsabilidades pendientes;
- solicitudes pendientes de decisión cuando ya existan.

Debe existir una jerarquía visual que diferencie información normal de problemas que requieren acción.

### B2.3-B — CENTRO DE ATENCIÓN
Convertir la información dispersa en una lista priorizada de asuntos que requieren acción.

Cada asunto debe poder indicar, cuando aplique:
- qué ocurrió;
- cuándo ocurrió;
- quién está relacionado;
- qué operación o entidad está afectada;
- estado actual;
- motivo/error;
- qué acción puede realizarse;
- quién tiene autoridad para realizarla.

No crear una nueva cola técnica. Es una capa de presentación/control sobre fuentes existentes.

### B2.3-C — ACCIONES CONTEXTUALES
Cada asunto debe llevar a la acción correcta sin obligar al usuario a navegar manualmente por múltiples secciones.

Ejemplos conceptuales:
- reintentar una operación recuperable;
- revisar una operación que requiere atención;
- abrir el producto afectado;
- revisar una solicitud;
- ver una incidencia;
- abrir la información necesaria para decidir.

Las acciones deben respetar roles/permisos y no deben ejecutar operaciones privilegiadas por simple navegación.

### B2.3-D — VISIBILIDAD DEL ADMIN
La vista Admin debe comenzar a comportarse como un verdadero centro de mando:
- resumen de lo importante;
- problemas primero;
- operaciones pendientes;
- incidencias;
- solicitudes;
- responsabilidades críticas;
- actividad relevante;
- señales de riesgo.

No convertir el dashboard en una colección de números decorativos. Cada indicador debe responder a una pregunta operativa o llevar a una acción.

### B2.3-E — VISIBILIDAD DEL USUARIO OPERATIVO
La vista de dependienta/usuario debe mostrar únicamente lo necesario para ejecutar su trabajo:
- tareas/responsabilidades pendientes cuando existan;
- operaciones pendientes propias o visibles según permisos;
- errores que debe corregir;
- solicitudes que debe completar;
- estado de turno cuando el módulo esté disponible.

La información debe estar filtrada por permisos y contexto.

### B2.3-F — NOTIFICACIONES Y NOVEDADES
Establecer un patrón coherente para novedades:
- contador/punto rojo;
- mensajes importantes;
- operaciones que requieren atención;
- solicitudes nuevas;
- cambios de estado relevantes.

Evitar notificaciones duplicadas o persistentes sin motivo.

### B2.3-G — ARQUITECTURA Y REUTILIZACIÓN
B2.3 debe reutilizar:
- IndexedDB existente;
- `operaciones_pendientes`;
- `_cache` existente;
- `ejecutarOperacion()`;
- `sincronizarCola()`;
- mecanismos existentes de permisos/autenticación;
- RPC existentes cuando una acción requiera backend.

No crear:
- segunda cola offline;
- segundo sistema de idempotencia;
- caché paralela sin justificación;
- store de UI que duplique la fuente real;
- RPC duplicados para operaciones ya existentes.

### B2.3-H — INTEGRIDAD Y ESTADOS
Todos los estados mostrados al usuario deben corresponder con el estado real disponible.

Especialmente:
- PENDIENTE no debe aparecer como completada;
- SINCRONIZANDO no debe interpretarse como completada;
- REQUIERE_ATENCION no debe reintentarse infinitamente;
- una operación sincronizada no debe reaparecer como pendiente;
- un error de refresco no debe volver a ejecutar una operación de negocio ya completada.

### B2.3-I — RESPONSIVE / EXPERIENCIA
El Centro de Control debe funcionar en teléfono y PC, respetando el diseño existente.

Debe priorizar:
- lectura rápida;
- jerarquía visual;
- acciones claras;
- estados comprensibles;
- ausencia de scroll horizontal innecesario;
- consistencia con el sistema actual.

### B2.3-J — PRUEBAS TÉCNICAS
La misión debe terminar con pruebas automatizadas suficientes para demostrar:
- que los estados se representan correctamente;
- que las acciones no duplican operaciones;
- que la idempotencia permanece intacta;
- que los permisos se respetan;
- que no se crean stores/colas/cachés paralelos innecesarios;
- que la UI puede reconstruirse desde el estado real;
- que errores de red/negocio no producen estados falsos.

La prueba real con perfiles/dispositivos queda para la fase final de aceptación, no para cerrar cada bloque de desarrollo.

## B3 — SISTEMA OPERACIONAL DE USUARIOS, ROLES, PERMISOS Y CONTROL — IMPLEMENTADO

### Estado
B3 está IMPLEMENTADO en el frontend de extremo a extremo. El SQL de las RPCs administrativas está versionado en `supabase/b3-roles-permisos.sql` pero **NO aplicado aún en Supabase** (se requiere ejecutarlo en el SQL Editor; no había credenciales service_role disponibles durante la implementación). El frontend degrada con gracia y mensajes claros si las RPCs aún no existen.

### Esquema real confirmado por auditoría directa a Supabase
- `usuarios(id, nombre, activo, role_id)` — `id` = `auth.users.id` (UUID).
- `roles(id, nombre)`.
- `permisos(id, seccion, accion, role_id)` — matriz rol → (seccion, accion).
- `public.tiene_permiso(p_seccion, p_accion)` — SECURITY DEFINER, requiere sesión.
- RLS en `usuarios`/`roles`/`permisos` invoca `tiene_permiso`.
- Rol inicial: Dueño.

**CORRECCIÓN:** cualquier mención anterior (incluido B2.3) que dijera que "no existe sistema de roles real" está OBSOLETA. El sistema de roles/permisos SÍ existe en Supabase. B3 lo reutiliza sin reemplazarlo.

### Arquitectura B3 (reutilización, 0 sistemas duplicados)
- Contexto centralizado del usuario: `_usuarioActual` + `_permisosEfectivos` (una sola fuente).
- `tienePermiso(seccion, accion)` refleja la matriz del backend (cargada una vez por sesión vía `permisos_usuario_actual`).
- Sidebar dinámico por permiso "ver"; botones de creación por permiso "crear" (UX, no seguridad).
- Administración de usuarios (ver/cambiar rol/activar-desactivar) via RPCs protegidos con `tiene_permiso('usuarios',*)`.
- Protección del Dueño en el backend (no permitir desactivar/cambiar rol al único Dueño activo).
- Operaciones offline conservan `usuario_id` e `idempotency_key`.
- Cambio de usuario: limpieza completa del contexto (anti-contaminación A→B).
- Stores nuevos: 0. Colas nuevas: 0. Cachés nuevas: 0. RPC duplicados: 0. Sistema de permisos paralelo: 0.

### RPCs nuevas (en `supabase/b3-roles-permisos.sql`, pendientes de aplicar)
`perfil_usuario_actual`, `permisos_usuario_actual`, `listar_usuarios_admin`, `listar_roles_admin`, `permisos_por_rol`, `asignar_rol_usuario`, `cambiar_estado_usuario`, `usuario_esta_activo`. Todas SECURITY DEFINER con `search_path` fijo, GRANT a anon/authenticated, protegidas con `tiene_permiso`.

### Seguridad
La autorización REAL está en el backend (RLS + `tiene_permiso` dentro de cada RPC). El frontend solo refleja permisos para UX. Ocultar un botón NO es seguridad. Un usuario que manipule el frontend no puede ejecutar operaciones protegidas sin el permiso real.

### Limitaciones
- El SQL de B3 NO está aplicado en Supabase todavía (Roberto debe ejecutar `supabase/b3-roles-permisos.sql` en el SQL Editor). Mientras tanto, `tienePermiso` degrada a true (no bloquea la app existente; la seguridad real sigue siendo el backend/RLS).
- No hay modificación de permisos desde el frontend (B3.11): la visualización de roles/permisos usa los RPCs de lectura; modificar permisos requeriría un RPC adicional que no se creó para no introducir una solución insegura.
- Las pruebas reales con perfiles/dispositivos quedan para la fase final de aceptación.

## B4 — CENTRO DE MANDO + AUDITORÍA + TRAZABILIDAD OPERATIVA — IMPLEMENTADO

### Estado
B4 está IMPLEMENTADO en el frontend de extremo a extremo. El SQL de auditoría está versionado en `supabase/b4-auditoria-trazabilidad.sql` pero **NO aplicado en Supabase** (pendiente de que Roberto lo ejecute en el SQL Editor). El frontend degrada con mensajes claros si las RPCs aún no existen.

### Auditoría real confirmada
- Las tablas ventas/transferencias/vales_salida **NO tienen** columna usuario_id ni idempotency_key (verificado por introspección directa).
- No existía tabla de auditoría/historial.
- Única trazabilidad existente: operaciones_pendientes (IndexedDB, se elimina al sync) y private.operaciones_idempotencia.

### Solución implementada
- Nueva tabla `auditoria_operaciones` + RPC `registrar_auditoria` y `listar_auditoria_admin` (SQL versionado, SECURITY DEFINER, protegidos con tiene_permiso).
- Registro de auditoría desde: ejecutarOperacion (exito/rechazo), sincronizarCola (sync exitosa / requiere_atencion), acciones administrativas B3 (cambiar rol/estado).
- Pestaña "Centro de Mando" (permiso auditoria.ver) con: estado general, alertas reales, actividad reciente, auditoría con filtros y paginación.

### Arquitectura (reutilización, 0 duplicados)
- Estado/alertas derivan de obtenerOperacionesVisiblesPanel + _cache + _sincronizando (B2/B3).
- Actividad reciente reutiliza construirActividadReciente (B2.3).
- Permisos reutilizan _usuarioActual/_permisosEfectivos/tienePermiso (B3).
- Stores nuevos: 0. Colas nuevas: 0. Cachés nuevas: 0. Sincronizadores nuevos: 0.

### Seguridad
- La auditoría se escribe vía RPC (SECURITY DEFINER) tomando usuario_id de auth.uid(), no del cliente (no se falsifica el autor).
- listar_auditoria_admin protegida con tiene_permiso('auditoria','ver'). La tabla tiene RLS + REVOKE a anon (no SELECT directo).
- No se almacenan secretos. payload_resumen solo lleva lo necesario.

### Limitaciones
- El SQL de B4 NO está aplicado en Supabase todavía. Roberto debe ejecutar `supabase/b4-auditoria-trazabilidad.sql`.
- Mientras tanto, la auditoría no se registra ni muestra (el frontend avisa que falta el SQL). El resto del Centro de Mando (estado, alertas, actividad) sí funciona sin el SQL.
- Las pruebas reales con perfiles/dispositivos quedan para la fase final de aceptación.

## B5 — REPORTES Y ANÁLISIS OPERATIVO — IMPLEMENTADO

### Estado
B5 está IMPLEMENTADO en el frontend de extremo a extremo. El SQL de reportes está versionado en `supabase/b5-reportes.sql` pero **NO aplicado en Supabase** (pendiente de que Roberto lo ejecute en el SQL Editor). El frontend degrada con mensajes claros si las RPCs aún no existen.

### Auditoría real confirmada (corregida en B6 con introspección en vivo)
- `ventas`, `ventas_lineas`, `transferencias`, `transferencias_lineas`, `vales_salida`, `stock`, `productos`, `almacenes`, `categorias`, **`lotes_compra`** existen (todas con RLS; responden 401 sin sesión, no 404).
- `lotes_compra` SÍ EXISTE con columnas: `id, producto_id, almacen_id, cantidad_restante, costo_unitario, fecha_compra, cantidad_inicial` (B6 agrega `operacion_id, idempotency_key, origen, activo`).
- **NO existen** (404 real): `compras`, `compras_lineas`, `movimientos_stock`, `movimientos`, `auditoria_operaciones`. B6 crea `compras` y `movimientos_stock`.
- Al momento de B5, los RPC de operaciones (`registrar_compra`, `registrar_venta`, `registrar_transferencia`, `registrar_vale_salida`, `crear_producto`) y los de reportes **NO existían** en Supabase. B6 los crea. El reporte de movimiento reconstruía desde ventas/transferencias/vales porque no había tabla histórica ni RPC.
- **CORRECCIÓN**: la afirmación anterior de B5 de que "no existe lotes_compra" era INCORRECTA. La auditoría en vivo de B6 lo confirmó.

### Implementado
- Pestaña "Reportes" (permiso `reportes.ver`) con: filtros globales (fecha/almacén), resumen ejecutivo, y sub-reportes (ventas, transferencias, vales, stock, movimiento de inventario) con paginación y exportación CSV.
- 6 RPC nuevos (todos SECURITY DEFINER, search_path fijo, protegidos con tiene_permiso('reportes','ver')): reporte_resumen_ejecutivo, reporte_ventas, reporte_transferencias, reporte_vales, reporte_stock, reporte_movimiento_inventario.
- Agregaciones SQL (no trae miles de filas); paginación en los detallados.
- Offline: no inventa datos; muestra "sin conexión". Reconexión refresca.

### Arquitectura (reutilización, 0 duplicados)
- Permisos: _usuarioActual/_permisosEfectivos/tienePermiso (B3).
- Filtros usan _cache.almacenes (sin consulta nueva).
- Stores nuevos: 0. Colas nuevas: 0. Cachés nuevas: 0. Sincronizadores nuevos: 0.

### Seguridad
- Cada RPC devuelve únicamente los datos necesarios. No hay RPC genérico que devuelva toda la base.
- Todas protegidas con tiene_permiso('reportes','ver'). El cliente no puede bypassar el permiso.
- Exportación CSV respeta filtros y permisos (solo datos ya visibles).

### Limitaciones
- El SQL de B5 NO está aplicado en Supabase. Roberto debe ejecutar `supabase/b5-reportes.sql`.
- Reporte de compras: NO disponible (no existe tabla histórica de compras).
- Margen/rentabilidad: NO disponible (no existe costo FIFO histórico por lote).
- Las pruebas reales con perfiles/dispositivos quedan para la fase final de aceptación.

## B6 — NÚCLEO OPERATIVO + INVENTARIO INTELIGENTE — IMPLEMENTADO

### Estado
B6 está IMPLEMENTADO en el frontend y el SQL está versionado en `supabase/b6-nucleo-operativo.sql`. **NO aplicado aún en Supabase** (pendiente de que Roberto lo ejecute en el SQL Editor). El frontend degrada con mensajes claros si los RPC aún no existen (no inventa datos).

### Auditoría REAL en vivo contra Supabase (2026-08-15, vía API REST con anon key)
Hallazgos que **corrigen** afirmaciones anteriores del Cerebro:

**Tablas que EXISTEN** (401 RLS, no 404):
- `lotes_compra(id, producto_id, almacen_id, cantidad_restante, costo_unitario, fecha_compra, cantidad_inicial)` — **SÍ EXISTE**. El Cerebro B5 decía que NO: estaba equivocado.
- `stock(id, producto_id, almacen_id, cantidad, minimo, updated_at)`
- `productos(id, nombre, categoria_id, unidad, precio_normal, precio_mayorista, presentacion_id, activo)`
- `almacenes(id, nombre, tipo)`
- `ventas(id, almacen_id, fecha, total)` — sin usuario_id/idempotency_key
- `ventas_lineas(id, venta_id, producto_id, cantidad, precio_unitario)` — sin costo_unitario/costo_total
- `transferencias(id, almacen_origen_id, almacen_destino_id, fecha, estado)` — sin usuario_id/idempotency_key
- `transferencias_lineas(id, transferencia_id, producto_id, cantidad)`
- `vales_salida(id, producto_id, almacen_id, fecha, tipo, cantidad)` — sin usuario_id/motivo
- `usuarios`, `roles`, `permisos`, `categorias`, `presentaciones`, `producto_presentaciones`.

**Tablas que NO existen** (404 real): `compras`, `compras_lineas`, `movimientos_stock`, `movimientos`, `auditoria_operaciones`.

**RPC que EXISTEN**: `tiene_permiso`, `perfil_usuario_actual`, `permisos_usuario_actual`, `usuario_esta_activo`, `listar_usuarios_admin`, `listar_roles_admin`.

**RPC que NO existían** (B6 los crea): `registrar_compra`, `registrar_venta`, `registrar_transferencia`, `registrar_vale_salida`, `crear_producto`, `inventario_enriquecido`, `movimientos_producto`, `rentabilidad_ventas`, `historial_compras`, más los helpers internos `_validar_usuario_operacion`, `_registrar_movimiento`, `_resolver_presentacion`, `_consumir_fifo`.

**IMPORTANTE**: el SQL de B3, B4 y B5 **NO está aplicado** en Supabase (solo algunas RPC de B3 existen). Los RPC de operaciones (registrar_compra, etc.) tampoco existían hasta B6. Roberto debe aplicar los SQL de B3, B4, B5 y B6.

### Qué se implementó
1. **lotes_compra mejorada**: se agregaron columnas de trazabilidad (`operacion_id, idempotency_key, origen, activo`) + índice FIFO. NO se duplica la tabla.
2. **Tabla `compras`** (nueva): encabezado histórico de entrada (almacén, proveedor, fecha, usuario, total, idempotency_key). Antes no existía.
3. **Tabla `movimientos_stock`** (nueva): fuente Única de trazabilidad de inventario (tipo, producto, almacén, cantidad, costo_unitario, costo_total, operacion_id, lote_id, usuario, idempotency_key). Antes no existía.
4. **RPC `registrar_compra`**: atómico (lote + stock + movimiento + encabezado), valida producto/almacén/costo, resuelve presentación en backend.
5. **RPC `registrar_venta`**: FIFO real, costo de mercancía vendida (CMV), ganancia bruta y margen. Agrega columnas `costo_unitario`, `costo_total` a `ventas_lineas`.
6. **RPC `registrar_transferencia`**: consume FIFO en origen, crea lotes en destino con el MISMO costo (no recalcula), atómica.
7. **RPC `registrar_vale_salida`**: FIFO, valida tipo/cantidad, agrega columna `motivo` a `vales_salida`.
8. **RPC `crear_producto`**: reutiliza idempotencia central.
9. **Helper `_consumir_fifo`**: FOR UPDATE, lote más antiguo primero, nunca negativo, falla si stock insuficiente (revertible).
10. **RPC de lectura**: `inventario_enriquecido` (costo promedio + valoración), `movimientos_producto` (trazabilidad), `rentabilidad_ventas` (ganancia/margen), `historial_compras`.
11. **Frontend**: nuevas pestañas Inventario y Movimientos; sub-reportes de Compras y Rentabilidad en Reportes; alertas de inventario (agotados/bajo) integradas en el Centro de Mando (B4); permisos `reportes.ver` en las nuevas pestañas.

### Arquitectura (reutilización, 0 duplicados)
- `lotes_compra` = único sistema FIFO (reutilizado, no duplicado).
- `operaciones_idempotencia` + `reclamar_idempotencia` = única idempotencia.
- `tiene_permiso` + `usuario_esta_activo` = única autorización.
- `operaciones_pendientes` + `ejecutarOperacion` + `sincronizarCola` + `_sincronizando` + `RPC_POR_TIPO` = única cola offline.
- `registrarAuditoria` (B4) = única auditoría.
- `_cache` = única caché.
- `movimientos_stock` = única trazabilidad de inventario (antes no existía; no duplica nada).
- Stores nuevos: 0. Colas nuevas: 0. Cachés nuevas: 0. Sincronizadores nuevos: 0. Sistema FIFO paralelo: 0.

### Seguridad
- Todos los RPC: SECURITY DEFINER, `search_path = public, pg_temp`, validan `auth.uid()`, `usuario_esta_activo()` y `tiene_permiso`.
- FIFO con `FOR UPDATE` (bloqueo en concurrencia).
- Atomicidad: toda la operación (lote + stock + movimiento + encabezado) en una transacción; si algo falla, `RAISE EXCEPTION` revierte todo.
- El factor de presentación se resuelve en el backend (`_resolver_presentacion`), no del cliente.
- RLS + REVOKE a anon en `compras` y `movimientos_stock` (solo RPC acceden).
- No se usa `service_role` en el frontend.

### Limitaciones reales
- El SQL de B6 (y B3/B4/B5) **NO está aplicado** en Supabase. Roberto debe ejecutar `supabase/b6-nucleo-operativo.sql` (y los anteriores) en el SQL Editor. Mientras tanto, el frontend avisa que faltan los RPC (no inventa datos).
- Las pruebas automatizadas de B6 validan la lógica de negocio (FIFO, costos, margen) con un mock que refleja la semóntica de los RPC. La validación SQL real contra Supabase requiere que el SQL esté aplicado (no disponible en el sandbox).
- No se pudo aplicar el SQL en vivo (sin conector Supabase service_role ni acceso al SQL Editor desde el sandbox).
- Las pruebas reales con perfiles/dispositivos quedan para la fase final de aceptación.

### Pruebas
- `test/b6-nucleo-operativo.test.js`: 27 casos (compra, lote, FIFO, venta 1/varios lotes, transferencia FIFO, vale FIFO, costo histórico, ganancia, margen, stock insuficiente, permisos, usuario inactivo, idempotencia, doble sincronización, error de red, reintento, offline, reconciliación, auditoría, compatibilidad B3/B4/B5, 0 duplicados).
- Suite global: **80/80 PASS** (B2.3 + B3 + B4 + B5 + B6).
- `node --check public/app.js`: OK.

### Versión
- App v7.0. Service Worker shell-v28. Cache-busting vía bump del SW.

## B7 — OPERACIÓN HUMANA: TURNOS + CUADRES + RESPONSABILIDADES + INCIDENCIAS — IMPLEMENTADO

### Estado
B7 está IMPLEMENTADO en el frontend y el SQL está versionado en `supabase/b7-operacion-humana.sql`. **NO aplicado aún en Supabase** (pendiente de que Roberto lo ejecute en el SQL Editor). El frontend degrada con mensajes claros si los RPC aún no existen (no inventa datos).

### Auditoría REAL en vivo contra Supabase (2026-08-15)
Confirmado que NO existen: `turnos`, `cuadres`, `responsabilidades`, `incidencias` (todas 404). B7 las crea. Los RPC de B7 tampoco existían; B7 los crea en SQL. Los RPC de B3 que sí existen (perfil/permisos/usuario/listar) se reutilizan.

### Qué se implementó
1. **Tabla `turnos`** (nueva): período de trabajo de un usuario en un almacén. Estados PROGRAMADO/ABIERTO/CERRADO/CANCELADO. Registra apertura/cierre reales, observación, usuario creador.
2. **Tabla `cuadres`** (nueva): conciliación económica de un turno. Dinero esperado (calculado de ventas reales, no introducido por el trabajador), dinero declarado, diferencia, estado. Estados PENDIENTE/EN_REVISION/CUADRADO/CON_DIFERENCIA/APROBADO/RECHAZADO.
3. **Tabla `responsabilidades`** (nueva): tareas operativas por usuario o turno. Estados PENDIENTE/EN_PROGRESO/COMPLETADA/CANCELADA. Prioridad, fecha límite, creador.
4. **Tabla `incidencias`** (nueva): excepciones operativas (faltante, sobrante, daño, error). Estados ABIERTA/EN_REVISION/RESUELTA/CERRADA. Se crean automáticamente cuando un cuadre tiene diferencia.
5. **RPC `abrir_turno`**: valida usuario activo, permiso, doble apertura (idempotente). Registra auditoría.
6. **RPC `cerrar_turno`**: valida propiedad o permiso admin, estado ABIERTO, registra cierre real. Crea cuadre PENDIENTE automáticamente. Detecta responsabilidades pendientes (no bloquea, alerta).
7. **RPC `calcular_dinero_esperado_turno`** (interno): calcula el dinero esperado de las ventas reales del usuario en el período del turno. DOCUMENTACIÓN: entran las ventas del período; NO entran compras/transferencias/vales (son inventario, no caja).
8. **RPC `registrar_cuadre`**: el trabajador declara el dinero. Calcula diferencia. Si hay diferencia → estado CON_DIFERENCIA + crea incidencia automáticamente. No permite editar cuadre cerrado/aprobado.
9. **RPC `revisar_cuadre`**: el admin aprueba/rechaza/devuelve. No permite que el trabajador apruebe su propio cuadre (validación real en backend). Registra estado anterior y nuevo + comentario.
10. **RPC `crear_responsabilidad`**, **`actualizar_responsabilidad`**: gestión de tareas. Valida propiedad o permiso admin.
11. **RPC `crear_incidencia`**, **`resolver_incidencia`**: cualquier usuario reporta; admin resuelve.
12. **RPC de lectura**: `listar_turnos`, `listar_cuadres`, `listar_responsabilidades`, `listar_incidencias`, `turno_actual_usuario`. El trabajador ve los suyos; el admin ve todos (permiso `turnos.editar_any`).
13. **Frontend**: pestañas Turnos (abrir/cerrar, historial, cuadres con declarar/revisar) y Operación (responsabilidades + incidencias). Integración de alertas en el Centro de Mando (turnos abiertos, cuadres pendientes/con diferencia, responsabilidades pendientes, incidencias abiertas). Refresco del turno actual al iniciar y reconectar.

### Arquitectura (reutilización, 0 duplicados)
- `_validar_usuario_operacion` (B6) = validación central de usuario/permiso/activo.
- `registrar_auditoria` (B4) = única auditoría persistente (todos los RPC de B7 la llaman).
- `operaciones_pendientes` + `ejecutarOperacion` + `sincronizarCola` + `_sincronizando` + `RPC_POR_TIPO` (B2) = única cola offline. Los tipos de B7 (`turno`, `turno_cerrar`, `cuadre`, `cuadre_revisar`, `responsabilidad`, `responsabilidad_actualizar`, `incidencia`, `incidencia_resolver`) se añadieron al MISMO `RPC_POR_TIPO`.
- `tienePermiso` (B3) = autorización frontend. Permisos `turnos.ver`, `turnos.crear`, `turnos.editar`, `turnos.editar_any`.
- `_cache` (B2/B6) = única caché (almacenes reutilizados para selects).
- Las operaciones de B7 no mueven stock (no afectan `ajustePendiente` ni FIFO).
- Stores nuevos: 0. Colas nuevas: 0. Cachés nuevas: 0. Sincronizadores nuevos: 0.

### Seguridad
- Todos los RPC: SECURITY DEFINER, `search_path = public, pg_temp`, validan `auth.uid()`, `usuario_esta_activo()` y `tiene_permiso` (vía `_validar_usuario_operacion`).
- El trabajador no puede aprobar su propio cuadre (validación real en backend, no solo ocultar botón).
- El dinero esperado se calcula de ventas reales (no lo introduce el trabajador).
- Diferencias generan incidencias automáticamente (no se ocultan).
- RLS + REVOKE a anon en todas las tablas nuevas.

### Limitaciones reales
- El SQL de B7 (y B3/B4/B5/B6) **NO está aplicado** en Supabase. Roberto debe ejecutar los SQL en orden. Mientras tanto, el frontend avisa que faltan los RPC.
- Las pruebas automatizadas de B7 validan la lógica con un mock que refleja la semántica de los RPC. La validación SQL real requiere aplicar el SQL.
- `ventas` no tiene `usuario_id` (verificado en auditoría B6); el dinero esperado se calcula por almacén + período del turno. Si se quisiera por usuario, habría que agregar `usuario_id` a `ventas` (no se hace en B7 para no romper el esquema existente).
- Las pruebas reales con perfiles/dispositivos quedan para la fase final de aceptación.

### Pruebas
- `test/b7-operacion-humana.test.js`: 27 casos (turnos, doble apertura, cierre, cuadres exacto/faltante/sobrante, aprobar/rechazar, no editar cerrado, responsabilidades, incidencias, permisos, usuario inactivo, idempotencia, offline, auditoría, compatibilidad B3/B6, 0 duplicados).
- Suite global: **107/107 PASS** (B2.3 + B3 + B4 + B5 + B6 + B7).
- `node --check public/app.js`: OK.

### Versión
- App v7.0. Service Worker shell-v28. Cache-busting vía bump del SW.

## LECCIONES ARQUITECTÓNICAS
- Auditar primero, programar después.
- Si una arquitectura existente resuelve el problema, reutilizarla.
- No crear tablas, colas, cachés o RPC duplicados por comodidad.
- La idempotencia es una propiedad transversal del sistema, no una característica aislada de cada módulo.
- El backend/RPC es la fuente de verdad para reglas críticas.
- Las proyecciones offline son temporales y nunca deben convertirse silenciosamente en verdad del sistema.
- Las misiones deben ser bloques funcionales completos, no una fragmentación artificial en microtareas.
- El analista debe anticipar contradicciones que puedan detectarse mediante auditoría; no trasladar ese trabajo al ejecutor después de haber diseñado una especificación incorrecta.
- Cuando una decisión técnica real contradice una especificación anterior, actualizar este Cerebro para que el próximo agente no repita el error.

## APP INSTALABLE
La visión futura incluye una aplicación instalable para teléfono en lugar de depender de abrir el navegador. Debe evolucionar desde la PWA sin romper la arquitectura actual.

## ROADMAP
**Implementado/conocido:** base POS/inventario, Offline-First B1/B2, cola persistente, idempotencia, proyección local, presentaciones en lógica correspondiente, recuperación de SINCRONIZANDO.

**Cerrado:** B2.2-A velocidad offline; B2.2-B.3.1 panel de pendientes; B2.2-B.3.2 gestión/recuperación; B2.2-D cierre Offline-First.

**Cerrado:** B2.3 — Centro de Control Operacional; B3 — Sistema operacional de usuarios, roles, permisos y control; B4 — Centro de Mando + auditoría + trazabilidad; B5 — Reportes y análisis operativo (frontend completo; SQL de B3/B4/B5 pendiente de aplicar en Supabase).

**Actual:** proyecto consolidado en `main` (v7.0). B7 — Operación humana (turnos, cuadres, responsabilidades, incidencias) IMPLEMENTADO (frontend + SQL versionado, pendiente de aplicar en Supabase).

**Siguiente bloque general:** aplicar los SQL de B3/B4/B5/B6/B7 en Supabase, luego pruebas reales multi-usuario/dispositivo, y módulos pendientes (comunicación/Centro de Mando, recompensas, empaquetado como app instalable).

**Posterior:** módulos operativos de negocio → turnos/cuadre → auditoría y responsabilidad → aprobaciones → comunicación/Centro de Mando → recompensas → empaquetado → aceptación final.

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

Estas decisiones no bloquean B2.3 mientras el bloque se limite a control/visibilidad sobre estados y datos ya existentes.

## PRINCIPIO CENTRAL
**BattleCruiser debe registrar qué ocurrió, quién fue responsable, quién recibió, quién aprobó, qué esperaba el sistema, qué ocurrió físicamente y cómo se resolvió cada diferencia.**

El objetivo es dar al Admin control y conocimiento de la operación completa sin convertir el trabajo diario en un proceso lento o innecesariamente complicado.