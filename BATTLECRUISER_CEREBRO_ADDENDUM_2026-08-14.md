# BATTLECRUISER — ADDENDUM AL CEREBRO
## Auditoría técnica consolidada — 2026-08-14

Este documento complementa `BATTLECRUISER_CEREBRO.md` con hallazgos recientes verificados sobre el estado técnico del repositorio. No sustituye al Cerebro maestro.

## ESTADO REAL CONFIRMADO (actualizado B6 — 2026-08-15)

- Repo: `Robvg9/battlecruiser`.
- Rama de trabajo actual: `main`.
- App: v8.0.
- Service Worker: shell-v29.
- B7 IMPLEMENTADO: turnos, cuadres, responsabilidades, incidencias. SQL en supabase/b7-operacion-humana.sql (pendiente de aplicar).
- B8 IMPLEMENTADO: comunicación y coordinación (conversaciones, mensajes, chat contextual, soporte). SQL en supabase/b8-comunicacion.sql (pendiente de aplicar).

### CORRECCIÓN CRÍTICA de B6 (auditoría en vivo contra Supabase)
- `lotes_compra` **SÍ EXISTE** (columnas: id, producto_id, almacen_id, cantidad_restante, costo_unitario, fecha_compra, cantidad_inicial). Este addendum y el Cerebro B5 decían que NO existía: estaban equivocados.
- NO existen (404 real): `compras`, `compras_lineas`, `movimientos_stock`, `movimientos`, `auditoria_operaciones`.
- Los RPC `registrar_compra`, `registrar_venta`, `registrar_transferencia`, `registrar_vale_salida`, `crear_producto`, `registrar_auditoria`, `listar_auditoria_admin`, `reporte_*`, `asignar_rol_usuario`, `cambiar_estado_usuario`, `permisos_por_rol` **NO existían** en Supabase antes de B6. El SQL de B3/B4/B5 estaba versionado pero no aplicado.
- RPC que SÍ existían: `tiene_permiso`, `perfil_usuario_actual`, `permisos_usuario_actual`, `usuario_esta_activo`, `listar_usuarios_admin`, `listar_roles_admin`.
- B6 crea los RPC faltantes + las tablas `compras` y `movimientos_stock` en `supabase/b6-nucleo-operativo.sql`. Roberto debe aplicar ese SQL (y los de B3/B4/B5) en el SQL Editor.
- Arquitectura: frontend vanilla HTML/CSS/JS + Supabase + IndexedDB + Service Worker.
- Archivos principales: `public/app.js`, `public/index.html`, `public/style.css`, `public/service-worker.js`.
- `public/` es el directorio de assets servido por Cloudflare/Wrangler.

## B2.2-A — VELOCIDAD OFFLINE

CERRADA.

Optimizaciones confirmadas:
- conexión IndexedDB memoizada;
- contador mediante índice + `count()`;
- lectura de pendientes mediante índices;
- sin segunda cola/caché;
- `ejecutarOperacion()` conservado;
- `idempotency_key`, FIFO y estados conservados.

Validación con fake-indexeddb: 5 operaciones pasaron de 15 aperturas de IndexedDB a 1 apertura.
Prueba de navegador real: pendiente cuando no exista navegador disponible.

## B2.2-B.2 — PRODUCTOS OFFLINE

CERRADA.

Backend verificado en Supabase:
`public.crear_producto(p_nombre, p_categoria_id, p_unidad, p_precio_normal, p_precio_mayorista, p_idempotency_key)`.

El RPC:
- reutiliza `private.operaciones_idempotencia`;
- reutiliza `private.reclamar_idempotencia`;
- usa `tipo_operacion = 'crear_producto'`;
- valida permiso mediante `tiene_permiso('productos','crear')`;
- es `SECURITY DEFINER` con `search_path` fijo;
- tiene GRANT restringido al patrón establecido.

No se creó una tabla de idempotencia específica para productos.
No se modificaron los cuatro RPC existentes, RLS ni la arquitectura central.

Frontend confirmado:
- `RPC_POR_TIPO.producto = 'crear_producto'`;
- el formulario de producto usa `ejecutarOperacion('producto', ...)`;
- se eliminó el INSERT directo a `public.productos` para esta operación;
- la misma `idempotency_key` se conserva durante reintentos.

Pruebas de código reportadas y ejecutadas por el ejecutor: 25/25 aserciones OK con DOM simulado, fake-indexeddb y Supabase mockeado.
No se debe afirmar prueba de navegador real si no se ejecutó.

## B2.2-B.3 — UX DE OPERACIONES PENDIENTES

Misión actual.

Se decidió dividirla en dos sesiones por tamaño:

### B2.2-B.3.1
Crear una interfaz integrada para visualizar la cola existente:
- PENDIENTE;
- SINCRONIZANDO;
- REQUIERE_ATENCION.

Debe reutilizar `operaciones_pendientes` y la infraestructura existente.
No crear otra cola, store IndexedDB, caché ni sistema paralelo.

La interfaz debe mostrar tipo, estado, fecha, resumen y error cuando exista. Debe integrarse con el contador existente y actualizarse con los cambios reales de la cola.

### B2.2-B.3.2
Después de verificar B2.2-B.3.1, revisar y completar la integración/UX si es necesario. No iniciar B2.2-C ni otras funciones del roadmap hasta cerrar esta fase.

## AUDITORÍA TÉCNICA — HALLAZGOS PARA BACKLOG

Estos puntos fueron detectados durante una auditoría amplia del repositorio. No forman parte de la misión actual y NO deben implementarse automáticamente.

### Seguridad / catálogo
Existen escrituras directas desde cliente en algunas tablas de catálogo, entre ellas:
- `presentaciones`;
- `producto_presentaciones`;
- `almacenes`;
- `categorias`;
- `unidades`.

Estas operaciones no tienen actualmente el mismo tratamiento offline/idempotente que la cola principal. Debe auditarse RLS y decidir posteriormente si requieren RPC idempotentes y/o soporte offline.

La `SUPABASE_ANON_KEY` visible en frontend no debe tratarse como secreto por sí misma; la seguridad real depende de RLS/permisos y del diseño del backend.

### Mantenibilidad
`public/app.js` concentra gran parte del frontend y es un archivo grande. La modularización puede ser futura, pero no debe introducirse como parte de una misión funcional sin decisión arquitectónica explícita.

### Pruebas
Las pruebas con fake-indexeddb usadas en B2.2-A/B2.2-B.2 no constituyen por sí solas un sistema reproducible de CI dentro del repositorio. Futuramente conviene formalizar tests y CI, pero no es prioridad durante el bloque offline actual.

### Git
El proyecto utiliza actualmente commits directos a `main` y no tiene un flujo consolidado de PR/CI. Futuramente conviene mejorar trazabilidad, protección de rama y mensajes de commit.

### Detalles menores detectados
- revisar iconos referenciados por `manifest.json` si realmente faltan;
- revisar uso de `--ember` si continúa sin definición en `:root`;
- revisar `compatibility_date` de Wrangler si corresponde;
- revisar carga de scripts/CDN si se busca mayor robustez ante redes lentas.

## REGLA DE PRIORIDAD

Los hallazgos anteriores son BACKLOG. No deben distraer del bloque técnico activo.

Orden actual:
1. B2.2-B.3.1 — panel de operaciones pendientes.
2. Auditoría/verificación de B2.2-B.3.1.
3. B2.2-B.3.2 si corresponde.
4. Solo después continuar con la siguiente misión definida en el Cerebro.

## REGLA PARA FUTURAS SESIONES CON OTRAS IA

El analista/arquitecto debe:
- revisar este addendum y el Cerebro;
- verificar GitHub antes de afirmar estado;
- usar el código real como autoridad técnica;
- no pedir al usuario archivos que el analista pueda leer desde GitHub;
- entregar al ejecutor una misión pequeña y concreta;
- dividir misiones pesadas en sesiones cuando sea necesario;
- auditar el resultado antes de considerarlo cerrado.

El ejecutor (Claude, Vibe u otra IA) se encarga del código. El analista se encarga de continuidad, arquitectura, auditoría y definición de misiones.
