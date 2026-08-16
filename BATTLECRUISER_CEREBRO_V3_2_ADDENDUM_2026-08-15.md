# BATTLECRUISER — CEREBRO V3.2 ADDENDUM
## Actualización operativa — 2026-08-15

Este addendum actualiza la continuidad del proyecto. No reemplaza el Cerebro maestro existente: agrega las decisiones operativas más recientes que deben leerse junto al Cerebro y al estado real de GitHub/Supabase.

---

## 1. REPARTO OFICIAL DE TRABAJO

- **ChatGPT = coordinación y arquitectura:** auditoría, análisis de GitHub/Cloudflare/Supabase, seguridad, diseño de misiones y orden del roadmap.
- **Vibe = ejecución del repositorio/GitHub:** frontend, archivos `public/`, tests y cambios de código que deban quedar en GitHub. Es el ejecutor preferente para modificaciones de archivos del repositorio.
- **Claude = ejecución/verificación de Supabase:** SQL, RPC, RLS, grants, SECURITY DEFINER, migraciones y comprobaciones directas de la base de datos. Claude ha sido el ejecutor utilizado para el trabajo directo sobre Supabase.
- **Roberto = validación final real:** navegador/dispositivo, pruebas funcionales y confirmación de comportamiento real.

### Regla de reparto

- Misión que modifica **archivos del repositorio/frontend** → **Vibe**.
- Misión que modifica o necesita verificar **Supabase/backend** → **Claude**.
- Si una misión cruza ambas capas, separar primero el diseño y después ejecutar cada capa con su responsable.
- No hacer que Vibe y Claude modifiquen simultáneamente la misma capa.
- No afirmar que Vibe tuvo históricamente un problema de conexión con Supabase sin evidencia documentada. Lo confirmado es que Claude ha ejecutado/verificado trabajo directo sobre Supabase; por eso el reparto actual se mantiene por especialización y por el flujo que ya funciona.

### Flujo oficial

**ChatGPT → misión técnica → Vibe (GitHub/frontend) o Claude (Supabase/backend) → verificación → GitHub/Supabase → Cloudflare cuando corresponda → prueba de Roberto.**

---

## 2. LECCIÓN SOBRE SESIONES NUEVAS DE CLAUDE

Claude no conserva memoria entre cuentas/sesiones nuevas. Una sesión nueva debe recibir desde el inicio el contexto mínimo y los archivos necesarios para ejecutar la misión.

El Cerebro **no sustituye la misión técnica**. La misión debe indicar exactamente:
- qué revisar;
- qué modificar;
- qué NO tocar;
- qué evidencia producir;
- qué pruebas ejecutar.

Si Claude se queda sin límite antes de entregar/verificar el trabajo, el trabajo no cuenta como terminado hasta comprobarlo en Supabase/GitHub.

---

## 3. B5 — ESTADO FINAL REAL

B5 fue cerrado en Supabase mediante B5.1–B5.4.

### B5.1
`registrar_venta` ahora guarda `costo_unitario_fifo` para ventas nuevas mediante costeo FIFO real.

Se conserva:
- FIFO por `fecha_compra ASC`;
- `FOR UPDATE`;
- idempotencia central;
- stock;
- validaciones;
- SECURITY DEFINER;
- `search_path='public, pg_temp'`;
- grants sin `anon`.

Las 4 ventas históricas anteriores a B5.1 permanecen con `costo_unitario_fifo = NULL`. No se reconstruyen ni se inventan costos.

### B5.2
`historial_compras` existe sobre `lotes_compra` y está protegido por permisos/RLS/grants correctos.

### B5.3
`rentabilidad_ventas` existe y debe respetar la ausencia de costo histórico. No se debe convertir un costo NULL en cero ni presentar margen falso.

### B5.4
`reporte_resumen_ejecutivo` calcula compras desde `lotes_compra` y margen únicamente cuando existe costo FIFO disponible.

**B5 FINAL = CERRADO.**

El margen de las 4 ventas históricas permanece correctamente no disponible hasta que existan ventas nuevas con costo FIFO real.

---

## 4. AUDITORÍA FRONTEND B3–B8 — ESTADO ACTUAL

La auditoría del frontend sobre `public/app.js`, `public/index.html` y tests encontró integración amplia de B3–B8 y Offline-First.

Validación automatizada actual:
- **140/140 PASS**;
- `node --check public/app.js` OK.

### Correcto
- B3 usuarios/roles/permisos.
- B4 auditoría/trazabilidad.
- B5 reportes y resumen ejecutivo.
- B6 operaciones críticas mediante RPC + cola/idempotencia.
- B7 turnos/cuadres/responsabilidades/incidencias.
- B8 mensajes y conversaciones en general.
- Offline-First: una cola, un IndexedDB de operaciones, un sincronizador, idempotency_key estable y reconciliación.

### Hallazgos pendientes

#### 1. B5.3 — rentabilidad
`renderRentabilidad` convierte valores ausentes mediante patrones equivalentes a `Number(r.cmv || 0)`.

Esto debe revisarse para que una ausencia real de costo no termine representada como cero ni como margen 100%.

**Regla:** el frontend debe respetar exactamente el contrato real de producción. Si el backend indica que el costo no está disponible, la UI debe mostrarlo como no disponible.

#### 2. B8 — creación de conversaciones
`abrirSoporte` y `abrirConversacionContextual` realizan llamadas directas a `crear_conversacion` sin `p_idempotency_key`, mientras que `crearConversacion` sí utiliza `ejecutarOperacion`.

Debe alinearse con la arquitectura de cola/idempotencia si el contrato real de producción exige idempotencia.

**Primera acción:** Vibe debe corregir la integración frontend sin tocar Supabase. Si se descubre que la firma/contrato real de producción necesita un cambio backend, detener esa parte y preparar una misión separada para Claude.

#### 3. Escrituras directas de catálogos
Se detectaron escrituras directas a:
- `presentaciones`;
- `producto_presentaciones`;
- `almacenes`;
- `categorias`;
- `unidades`.

No son escrituras directas a `stock`, `ventas`, `ventas_lineas`, `lotes_compra`, `transferencias` ni `vales_salida`, por lo que no rompen la regla dura de operaciones de inventario.

Sí existe una inconsistencia: bypassan la cola offline/idempotencia. Antes de migrarlas a RPC hay que revisar RLS y decidir si realmente deben ser offline-first.

#### 4. `tienePermiso()`
Existe una degradación permisiva cuando el contexto de permisos está vacío. Es una mejora de robustez UX pendiente; la seguridad real continúa dependiendo del backend/RLS.

---

## 5. ROADMAP INMEDIATO

### R1 — VIBE / FRONTEND
Corregir los hallazgos de integración frontend:
1. B5.3 rentabilidad sin convertir NULL/ausencia de costo en 0.
2. B8 creación de conversaciones mediante el flujo correcto de idempotencia.
3. Auditar las escrituras directas de catálogos y decidir si se mantienen online-only o requieren arquitectura RPC/offline separada.
4. Endurecer la degradación de `tienePermiso()` si procede.

**No tocar Supabase durante R1.** Si algún fix exige backend, detener ese punto y documentarlo para Claude.

### R2 — CLAUDE / SUPABASE
Solo si R1 demuestra que el contrato real de producción necesita cambios:
- RPC;
- RLS;
- grants;
- SECURITY DEFINER;
- firma de `crear_conversacion`;
- contrato de `rentabilidad_ventas`.

### R3 — AUDITORÍA
Después de cada bloque importante:
- revisar GitHub real;
- revisar tests;
- confirmar que no se creó arquitectura duplicada;
- actualizar este Cerebro/addendum con estado real.

### R4 — VALIDACIÓN DE ROBERTO
Cuando el bloque funcional esté terminado:
- probar en navegador/dispositivo real;
- probar online/offline según corresponda;
- confirmar visualmente;
- confirmar operaciones reales.

---

## 6. REGLA FINAL DE CONTINUIDAD

**GitHub = verdad del código.**

**Supabase producción = verdad del backend/datos.**

**El Cerebro = memoria de continuidad y decisiones.**

**La misión = instrucciones concretas para el ejecutor.**

**Roberto = prueba real final.**

Nunca considerar terminado algo únicamente porque una IA diga que lo implementó.
