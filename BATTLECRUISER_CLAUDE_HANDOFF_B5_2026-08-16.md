# BATTLECRUISER — HANDOFF CLAUDE / B5

Fecha: 2026-08-16
Repositorio: Robvg9/battlecruiser
Rama objetivo: main

## OBJETIVO DE ESTA MISIÓN
Completar y verificar B5 (Reportes y análisis operativo) en Supabase REAL, sin duplicar arquitectura, sin romper B3/B4/B6/B7/B8 y sin asumir que algo está aplicado solo porque exista un SQL en GitHub.

Claude tiene acceso a Supabase pero no debe asumir que el estado del repositorio equivale al estado de producción. La fuente de verdad para backend aplicado es la base real.

## REGLA PRINCIPAL
ANTES de modificar nada:
1. Leer este handoff.
2. Revisar `supabase/b5-reportes.sql` del repo.
3. Inspeccionar el estado REAL de Supabase.
4. Comparar RPC por RPC, permisos, RLS, dependencias e índices.
5. Si B5 ya está aplicado parcialmente, NO recrear ni duplicar funciones: corregir/completar solo lo necesario.
6. No tocar frontend en esta misión salvo que una incompatibilidad real con B5 lo exija.
7. No inventar pruebas ni marcar algo como terminado sin evidencia.

## ESTADO CONSOLIDADO CONOCIDO
### B2 Offline-First
Main ya integró B2.2-B.3.1, B2.2-B.3.2 y B2.2-D mediante PR #1, #2 y #3.
La implementación usa una única cola persistente `operaciones_pendientes`, una única `_sincronizando`, `RPC_POR_TIPO`, `_cache`, idempotency_key estable, estados PENDIENTE/SINCRONIZANDO/SINCRONIZADA/REQUIERE_ATENCION, reconciliación y proyección local.
PR #3 reportó 39/39 checks y `node --check public/app.js` OK.

### B3
Usuarios, roles, permisos, RLS y protección del último Dueño implementados.
Existe infraestructura real de Supabase para permisos y roles.
La protección del último Dueño existe también a nivel de trigger.

### B4
Auditoría/trazabilidad: existe `auditoria_operaciones` y RPCs de auditoría en la base real según las auditorías recientes.
`registrar_auditoria` es logging y NO debe tratarse como operación de negocio idempotente obligatoria.

### B6
Núcleo operativo cerrado en los puntos críticos:
- idempotency_key obligatoria en `registrar_compra`, `registrar_venta`, `registrar_transferencia`, `registrar_vale_salida`;
- frontend genera y persiste la key en IndexedDB;
- frontend NO escribe directamente en `stock`;
- policy directa `stock_editar` fue eliminada;
- FIFO usa lotes y `FOR UPDATE`;
- `ventas.creado_por` identifica al usuario real.

### B7
Turnos, cuadres, responsabilidades e incidencias existen en Supabase y sus RPC exigen idempotencia según la auditoría reciente.

### B8
Comunicación: conversaciones, participantes y mensajes existen en Supabase; RPCs de conversación/mensajería usan idempotencia y RLS.

## B5 — LO QUE DEBES AUDITAR
El repositorio contiene:
`supabase/b5-reportes.sql`

También existe:
`test/b5-reportes.test.js`

El SQL de B5 fue diseñado para reutilizar las tablas operativas existentes, no crear una segunda fuente de datos.

La auditoría anterior identificó RPCs de reportes como:
- `reporte_ventas`
- `reporte_transferencias`
- `reporte_vales`
- `reporte_stock`
- `reporte_movimiento_inventario`
- `reporte_resumen_ejecutivo`
- `historial_compras`
- `rentabilidad_ventas`

NO asumir que todos están realmente instalados en producción. Confirmarlo con `pg_proc`/consultas equivalentes.

## CHECKLIST B5
### 1. Existencia
Confirmar cuáles de los RPC anteriores existen realmente en Supabase.

### 2. Firma
Comparar firma real vs `supabase/b5-reportes.sql`.

### 3. Seguridad
Para cada RPC:
- `SECURITY DEFINER`;
- `search_path` seguro y coherente;
- `auth.uid()`/permisos correctamente aplicados;
- permiso `reportes.ver` donde corresponda;
- sin ejecución para `anon`;
- sin exposición accidental de datos de otros usuarios/almacenes cuando corresponda.

### 4. Consultas
Verificar que cada reporte lea las tablas correctas y no duplique lógica existente.

### 5. Rentabilidad
Confirmar que `rentabilidad_ventas` utilice el costo real/FIFO existente y no un costo inventado o precio de venta como costo.

### 6. Fechas
Revisar filtros de fecha, límites, ordenamiento y zonas horarias.

### 7. Almacenes
Confirmar que los filtros por almacén respeten permisos y relaciones reales.

### 8. Reporte ejecutivo
Verificar que no haga cálculos incompatibles con B6/B7/B4.

### 9. Historial de compras
Debe basarse en la estructura real existente. Si `compras`/`compras_lineas` no existen o el modelo real difiere del SQL, DETENERSE y documentar la discrepancia antes de inventar tablas.

### 10. Rendimiento
Revisar índices necesarios para los reportes. No crear índices por reflejo: justificar cada uno según las consultas reales.

### 11. Idempotencia
Los reportes son lectura. NO necesitan `idempotency_key` como las operaciones de escritura.

### 12. RLS / grants
Confirmar RLS activo en tablas involucradas y que `anon` no tenga acceso innecesario.

## REGLAS DE CAMBIO
- No borrar funciones existentes sin comprobar dependencias.
- No crear RPC duplicados con otro nombre.
- No crear tablas de reportes si los datos pueden calcularse correctamente desde las tablas operativas existentes.
- No tocar B6 FIFO, idempotencia ni cola offline salvo que B5 tenga una incompatibilidad real demostrable.
- Si el SQL del repo está mal respecto al esquema real, adaptar la migración y dejar constancia exacta.
- Preferir una migración B5 adicional/segura antes que editar destructivamente migraciones históricas ya aplicadas.

## PRUEBAS
Si el entorno permite ejecutar `npm test`, hacerlo.
Si no hay red/dependencias, ejecutar al menos:
- `node --check public/app.js`
- validación SQL disponible;
- consultas directas a Supabase para existencia/firmas/grants/RLS;
- pruebas controladas de RPC de lectura que no modifiquen datos.

NO crear ventas/compras/transferencias de prueba en producción salvo autorización explícita.

## ENTREGA OBLIGATORIA
Al terminar, entregar:
1. Estado real de cada RPC B5: EXISTE / FALTA / INCORRECTO.
2. Cambios SQL aplicados, con migración identificable.
3. Evidencia de permisos/RLS/SECURITY DEFINER.
4. Tests ejecutados y resultado exacto.
5. Problemas restantes.
6. Confirmación explícita de si B5 quedó COMPLETADO en producción.
7. Si hubo cambios en GitHub, commit SHA y archivos modificados.

## NO CONFUNDIR
`SQL versionado` ≠ `SQL aplicado` ≠ `función funcionando` ≠ `reporte probado`.

La misión termina únicamente cuando el estado REAL de Supabase y el código del repo estén alineados y verificados.

## PRÓXIMO PASO DESPUÉS DE B5
Una vez B5 esté realmente cerrado, NO saltar automáticamente a otra arquitectura. Hacer auditoría de integración B3→B8 y después preparar las pruebas funcionales de aceptación. La prueba física final de usuario queda para cuando el núcleo técnico completo esté estabilizado.
