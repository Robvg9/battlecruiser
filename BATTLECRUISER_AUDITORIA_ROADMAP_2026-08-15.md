# BATTLECRUISER — AUDITORÍA PROFUNDA + ROADMAP MAESTRO

Fecha: 2026-08-15
Rama auditada: main
HEAD auditado: 27d12c670bc50f9ab0d3100398684ed92c0a399e

## 1. ESTADO REAL

BattleCruiser ya no es un POS simple. La arquitectura actual cubre:

- Offline-First de lectura y escritura.
- Cola única `operaciones_pendientes`.
- Un único `_sincronizando`.
- Idempotencia central (`private.operaciones_idempotencia`).
- Reconciliación posterior a sincronización.
- Usuarios/roles/permisos.
- Centro de Control / Centro de Mando.
- Auditoría y trazabilidad.
- Reportes.
- FIFO y costos históricos.
- Inventario enriquecido.
- Turnos/cuadres/responsabilidades/incidencias.
- Comunicación/chat contextual.

B8 es el último bloque funcional implementado. GitHub confirma `main` en 27d12c6 y el repositorio contiene B3-B8 versionados en SQL.

## 2. VALIDACIÓN DE GITHUB

Estructura actual pequeña y controlada:

- `public/app.js` ~289 KB — principal punto de deuda técnica/performance.
- `public/index.html` ~31 KB.
- `public/style.css` ~48 KB.
- 6 migraciones SQL B3-B8 (~126 KB acumulados).
- 7 suites de pruebas B2.3-B8.
- `package-lock.json` presente para reproducibilidad.
- No aparecen archivos temporales, dumps ni artefactos grandes en el árbol auditado.
- `docs/B2.3-CENTRO-DE-CONTROL.md` era documentación histórica ya absorbida por el Cerebro; se elimina para evitar documentación duplicada.

## 3. RESULTADOS AUTOMATIZADOS DOCUMENTADOS

Último estado reportado por el ejecutor:

- B8: 30/30 PASS.
- Suite global: 137/137 PASS.
- `node --check public/app.js`: OK.
- `node --check public/service-worker.js`: OK.

IMPORTANTE: desde este conector puedo auditar GitHub y el código, pero no ejecutar el runtime local del repositorio en esta sesión. Por tanto no se debe presentar una nueva ejecución de `npm test` como realizada por esta auditoría.

## 4. HALLAZGOS CRÍTICOS

### CRÍTICO-01 — Arranque con consultas duplicadas
`showApp` dispara varios refrescos independientes y algunos vuelven a cargar productos/almacenes/categorías. `refrescarVentas` vuelve a cargar productos y almacenes; `refrescarStockYSelects` también; además existen cargas iniciales separadas.

Impacto: consumo de red, tiempo de arranque y renders innecesarios.

Acción recomendada: crear un único orquestador de bootstrap que cargue una sola vez las dependencias compartidas y después renderice cada módulo. No crear una segunda caché.

### CRÍTICO-02 — `actualizarApp()` borra cachés y Service Workers globalmente
Actualmente elimina todas las caches del origen y desregistra todos los Service Workers del origen.

Impacto: puede afectar otras aplicaciones alojadas en el mismo origen en el futuro.

Acción: limitar la limpieza al prefijo `battlecruiser-shell-*` y al Service Worker de BattleCruiser.

### CRÍTICO-03 — Manifest referencia iconos inexistentes
`public/manifest.json` referencia `icon-192.png` e `icon-512.png`, pero esos archivos no aparecen en el árbol actual de `public/`.

Impacto: 404 de assets PWA e instalación sin iconos correctos.

Acción: añadir los iconos oficiales reales del proyecto o retirar temporalmente las referencias hasta disponer de ellos. NO inventar identidad visual sin aprobación.

### CRÍTICO-04 — Escrituras antiguas fuera de la cola central
Categorías, unidades, almacenes y presentaciones todavía usan `.insert()` / `.update()` directo desde frontend.

Impacto: arquitectura inconsistente con el modelo Offline-First central de B2-B8; esas operaciones no comparten automáticamente idempotencia/cola/reconciliación.

Acción: en una misión de consolidación, migrar únicamente las escrituras que realmente deban ser Offline-First a `ejecutarOperacion` + RPC, sin duplicar infraestructura.

## 5. HALLAZGOS IMPORTANTES

### PERF-01 — Alertas B7 hacen múltiples RPC
`refrescarAlertasB7()` realiza varias llamadas independientes para turnos, cuadres, responsabilidades e incidencias.

Acción: consolidar en una sola RPC administrativa/read-only cuando el backend esté aplicado, reduciendo round-trips.

### PERF-02 — Alertas B8 repiten lectura de conversaciones
La lista, el badge y el Centro de Mando consultan datos de comunicación por caminos separados.

Acción: consolidar lecturas por ciclo de refresco y reutilizar el resultado durante ese ciclo; no crear otra caché persistente.

### PERF-03 — Bootstrap y reconexión tienen cascadas de refresco
Hay varias funciones que llaman otras funciones que a su vez llaman `renderResumen()` y `refrescarCentroControl()`.

Acción: separar claramente `fetch/load` de `render`, y usar un único orquestador por evento (arranque/reconexión/cambio de pestaña).

### PERF-04 — app.js monolítico
~289 KB para un único archivo es manejable ahora, pero será un cuello de botella conforme aumenten B9+.

Acción futura: modularización controlada por responsabilidad (core/offline, auth/permisos, inventario, operación humana, comunicación), manteniendo una sola fuente de estado y sin introducir bundler innecesario hasta que aporte valor.

## 6. HALLAZGOS DE CALIDAD

### QA-01 — Código muerto/inconsistente alrededor de `_usuarioActual`
Algunas funciones antiguas comprueban `typeof _usuarioActual === "function"` y luego intentan invocarlo, aunque el estado real actual es un objeto. No parece romper el flujo principal, pero deja ramas muertas y puede ocultar errores.

Acción: normalizar el acceso a `_usuarioActual` y retirar ramas heredadas cuando se haga la limpieza de B4.

### QA-02 — Riesgo de doble escape en alertas de inventario
B6 construye algunos textos de alerta usando `escHtml()` y posteriormente el render general vuelve a escapar el texto. Debe revisarse para evitar mostrar entidades HTML literalmente.

Acción: una sola capa de escape, en el punto final de renderizado.

### QA-03 — Listeners individuales en conversaciones
B8 agrega un `click` por elemento de conversación. Para listas grandes conviene delegación de eventos como ya se hace en otros módulos.

Acción: un listener por contenedor.

### QA-04 — Cierre de turno con operaciones pendientes
B7 calcula un aviso de operaciones pendientes/atención, pero no impide el cierre. Esto requiere decisión de negocio: bloquear, confirmar explícitamente o permitir con trazabilidad.

No cambiar esta regla automáticamente sin validar el criterio operativo.

## 7. SEGURIDAD / ARQUITECTURA

Fortalezas confirmadas:

- Seguridad crítica prevista en backend/RPC/RLS, no solo en botones.
- Idempotencia central reutilizada.
- `SECURITY DEFINER` + `search_path` fijo en los SQL nuevos según los commits.
- No se observan service_role keys en los archivos auditados.
- La anon/publishable key de Supabase está en frontend, lo cual es normal para un cliente Supabase; nunca debe sustituirse por service_role.

Riesgo pendiente principal: B3-B8 siguen documentados como SQL versionado pero pendiente de aplicar en Supabase. La aplicación real del backend debe hacerse antes de la aceptación física final.

## 8. ROADMAP MAESTRO

### FASE A — FUNDACIÓN
- B1 — Offline-First de lectura/escritura.
- B2 — Cola, sincronización, idempotencia y reconciliación.
- B2.2 — Panel de operaciones pendientes.
- B2.3 — Centro de Control Operacional.

ESTADO: COMPLETADO.

### FASE B — CONTROL Y DATOS
- B3 — Usuarios, roles, permisos y estados.
- B4 — Centro de Mando + auditoría + trazabilidad.
- B5 — Reportes y análisis.
- B6 — Núcleo operativo + FIFO + costos + inventario inteligente.

ESTADO: COMPLETADO EN CÓDIGO / SQL VERSIONADO; PENDIENTE VALIDACIÓN REAL DEL BACKEND.

### FASE C — OPERACIÓN HUMANA
- B7 — Turnos, cuadres, responsabilidades, incidencias y aprobaciones.
- Entrega/recepción física de turno.
- Responsabilidad por diferencias.
- Expediente de desempeño.

B7: COMPLETADO EN CÓDIGO / SQL VERSIONADO.

### FASE D — COMUNICACIÓN
- B8 — Comunicación general, privada, soporte y conversaciones contextuales.
- No leídos y Centro de Mando.
- Offline-first para mensajes.

B8: COMPLETADO EN CÓDIGO / SQL VERSIONADO.

### FASE E — CONSOLIDACIÓN TÉCNICA (SIGUIENTE PRIORIDAD)
- Auditoría profunda de rendimiento.
- Bootstrap único.
- Reconexión consolidada.
- Eliminación de refrescos duplicados.
- Normalización de `_usuarioActual`.
- Escape HTML consistente.
- Delegación de eventos.
- Consolidación de alertas B7/B8.
- Migración de escrituras legacy a la arquitectura central cuando proceda.
- PWA assets correctos.
- CI automatizado.

### FASE F — CONTROL FINANCIERO AVANZADO
- Gastos.
- Reinversiones/compras con aprobación.
- Fondos de cambio.
- Solicitudes y aprobaciones.
- Flujo completo de dinero esperado vs declarado.
- Auditoría financiera por turno.

### FASE G — ENTREGA / RECEPCIÓN FÍSICA
- Entregar turno.
- Recibir turno.
- Conteo físico.
- Inventario recibido vs entregado.
- Aceptación/rechazo.
- Atribución de diferencias.
- Historial de responsabilidad.

### FASE H — RENDIMIENTO Y RECOMPENSAS
- Expediente por trabajador.
- KPI por rol.
- Cumplimiento de responsabilidades.
- Calidad de turnos.
- Incidencias positivas/negativas.
- Niveles.
- Recompensas.
- Decisión final del Admin.

### FASE I — INTELIGENCIA OPERATIVA
- Alertas configurables.
- Reglas automáticas.
- Detección de anomalías.
- Resúmenes diarios.
- Priorización de problemas.
- Predicción de faltantes.
- Recomendaciones de compra/reinversión.

### FASE J — AUTOMATIZACIÓN Y ESCALA
- Supabase Realtime donde realmente aporte valor.
- Notificaciones push.
- Automatizaciones programadas.
- Integración con Cloudflare/Workers cuando corresponda.
- Multi-punto/multi-almacén avanzado.
- Escalabilidad de consultas y RPC.
- Observabilidad y métricas.

### FASE K — ACEPTACIÓN FINAL
- Aplicar y verificar SQL B3-B8.
- Pruebas reales multiusuario.
- Pruebas en varios dispositivos.
- Offline real.
- Reconexión real.
- Compra → FIFO → venta → transferencia → vale → cuadre.
- Entrega/recepción física.
- Auditoría.
- Comunicación.
- Pruebas de seguridad/RLS.
- PWA/TWA.
- Corrección de bugs finales.

## 9. PRINCIPIO DE CRECIMIENTO

No añadir B9 inmediatamente solo por seguir numerando.

La prioridad inmediata es **consolidar B1-B8**: menos consultas, menos código heredado, menos ramas duplicadas, backend aplicado y pruebas reales.

Después de esa consolidación, BattleCruiser puede crecer sobre una base mucho más estable hacia finanzas, entrega/recepción, desempeño, recompensas, inteligencia y automatización.

## 10. REGLA DE ORO

Cada nueva función debe responder:

1. ¿Qué problema operativo resuelve?
2. ¿Qué fuente de verdad utiliza?
3. ¿Qué arquitectura existente reutiliza?
4. ¿Qué ocurre offline?
5. ¿Qué ocurre si la respuesta se pierde?
6. ¿Cómo se audita?
7. ¿Cómo se prueba?
8. ¿Cómo se elimina o corrige sin destruir historial?

Si no tiene respuestas claras, todavía no está lista para entrar al núcleo de BattleCruiser.
