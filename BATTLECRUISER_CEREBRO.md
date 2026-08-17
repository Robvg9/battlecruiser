# BATTLECRUISER — CEREBRO MAESTRO ÚNICO

**Última actualización:** 2026-08-17
**Fuente técnica primaria:** código real de `main` + Supabase producción.
**Repositorio:** `Robvg9/battlecruiser`
**Rama única de trabajo:** `main`

> Este archivo es la memoria maestra y el protocolo de continuidad del proyecto. Sustituye los Cerebro/Addendum/Handoff separados como referencia operativa. Los documentos históricos pueden conservarse en `docs/archive/`, pero NO son fuente de verdad vigente.

---

## 0. REGLA SUPREMA: CÓDIGO REAL > MEMORIA

Nunca considerar una función terminada solo porque una IA diga que la hizo.

Separar siempre:

`código escrito` ≠ `commit` ≠ `push` ≠ `deploy` ≠ `funcionamiento` ≠ `prueba real de Roberto`

La fuente de verdad es:
1. **GitHub `main`** → código/frontend/tests/SQL versionado.
2. **Supabase producción** → backend realmente aplicado.
3. **Este Cerebro** → continuidad, decisiones, arquitectura, conocimiento y roadmap.
4. **Roberto** → aceptación/prueba real final.

Antes de implementar algo importante: auditar el código real y reutilizar lo que ya existe.

---

## 1. ROLES DE TRABAJO

### ChatGPT
Coordinación, arquitectura, auditoría, investigación, revisión de GitHub/Supabase/Cloudflare, diseño de misiones y control del roadmap.

### Vibe
Ejecutor principal de **GitHub/frontend/tests**. Debe modificar el repositorio directamente y dejar el resultado en `main`.

### Claude
Ejecutor/verificador principal de **Supabase/backend**: SQL, RPC, RLS, grants, SECURITY DEFINER, migraciones e introspección de producción.

### Roberto
Prueba real del producto en navegador/dispositivo y decisión final sobre UX/operación.

---

## 2. REGLA PERMANENTE PARA VIBE — OBLIGATORIA EN TODA MISIÓN

> **REGLA DE ENTREGA: NO CREES UNA RAMA. NO CREES UN PR. TRABAJA DIRECTAMENTE SOBRE `main`. Lee el estado actual de `main`, implementa los cambios directamente ahí, prueba, haz commit y push a `origin/main`.**

Además:
- Nunca crear `vibe/*` salvo petición explícita de Roberto.
- No abrir PR para una misión normal.
- Verificar `main` antes de tocar código.
- No asumir que un PR histórico está integrado.
- Ejecutar tests/syntax checks relevantes.
- Reportar SHA, archivos modificados y resultados exactos.
- Si una parte necesita Supabase, NO inventar un RPC ni modificar backend desde una misión frontend: documentar la dependencia para Claude.

---

## 3. REGLA ANTI-DUPLICACIÓN

Antes de crear cualquier tabla, cola, caché, helper, router, sincronizador, mecanismo de idempotencia, RPC o arquitectura nueva:

**buscar primero si ya existe uno equivalente.**

Arquitectura central que NO debe duplicarse:
- una cola IndexedDB `operaciones_pendientes`;
- un sincronizador `sincronizarCola()`;
- un mutex `_sincronizando`;
- un router `RPC_POR_TIPO`;
- una `idempotency_key` estable por operación lógica;
- una `_cache` para datos cacheados;
- proyección/reconciliación existentes;
- idempotencia backend central `private.operaciones_idempotencia`.

---

## 4. VISIÓN DEL PRODUCTO

BattleCruiser no es solo un POS. Es el **CENTRO DE MANDO DEL NEGOCIO**.

Debe permitir al administrador saber:
- qué está pasando;
- qué se vendió;
- qué mercancía entró/salió;
- dónde está el stock;
- qué dinero se movió;
- quién hizo cada operación;
- qué responsabilidades se cumplieron;
- qué incidencias existen;
- qué está pendiente;
- qué está mal;
- qué necesita atención.

Tecnología:
- PWA HTML/CSS/JavaScript;
- Supabase PostgreSQL/Auth/RLS/RPC/Edge Functions;
- IndexedDB;
- Service Worker;
- Cloudflare + GitHub;
- Android futuro mediante TWA/APK.

---

## 5. ARQUITECTURA OPERATIVA REAL

Entidades principales:
- productos;
- categorías;
- unidades;
- almacenes;
- stock;
- lotes de compra;
- ventas/ventas_lineas;
- transferencias/transferencias_lineas;
- vales de salida;
- presentaciones/producto_presentaciones;
- usuarios/roles/permisos;
- auditoría;
- turnos/cuadres/responsabilidades/incidencias;
- conversaciones/participantes/mensajes;
- reportes.

### FIFO
- consume lote más antiguo;
- `fecha_compra ASC`;
- bloqueo/concurrencia en backend;
- transferencias crean lote espejo en destino conservando costo unitario real;
- nunca duplicar la lógica FIFO en frontend.

### Seguridad
Operaciones críticas de stock/dinero/datos sensibles deben pasar por RPC/Edge Function atómica segura.

No usar `service_role` en frontend.
Los RPC críticos deben usar seguridad backend apropiada, `SECURITY DEFINER` cuando corresponda, `search_path` seguro y grants restringidos.

---

## 6. OFFLINE-FIRST — ESTADO ACTUAL

La arquitectura Offline-First está implementada y verificada mediante pruebas automatizadas.

Componentes:
- IndexedDB `battlecruiser-cache`;
- store `operaciones_pendientes`;
- estados `PENDIENTE`, `SINCRONIZANDO`, `SINCRONIZADA`, `REQUIERE_ATENCION`;
- FIFO por `creado_en ASC`;
- `ejecutarOperacion()`;
- `sincronizarCola()`;
- `recuperarOperacionesAtrapadas()`;
- idempotencia estable;
- sincronización automática al reconectar;
- proyección local de stock;
- reconciliación posterior;
- contador/badge de pendientes;
- mutex contra sincronizaciones simultáneas.

Operaciones conectadas a la cola:
- compra;
- venta;
- transferencia;
- vale;
- producto.

Pruebas automatizadas recientes: **203/203 PASS**.
También se verificó `node --check public/app.js` y `node --check public/service-worker.js`.

Esto NO equivale todavía a aceptación real de Roberto en navegador/dispositivo.

---

## 7. PRESENTACIONES COMERCIALES

Un producto puede tener varias presentaciones.

Regla:
`cantidad_presentacion × factor = unidades base`

Ejemplo: caja de 20 unidades y unidad individual.

El cliente no es fuente de verdad del factor: si no existe información cacheada confiable, la proyección puede marcarse como no calculable. La conversión real pertenece al backend.

Integrado en compra/venta/transferencia/vale.

---

## 8. B1 → B8 — BLOQUES CONSOLIDADOS

### B1/B2/B2.2/B2.3
Offline-First, cola, sincronización, idempotencia, reconciliación, panel de pendientes y Centro de Control Operacional: **integrados en main**.

### B3
Usuarios, roles, permisos, estados y protección del último Dueño: **implementado**.

### B4
Centro de Mando, auditoría y trazabilidad: **implementado**.

### B5
Reportes y análisis operativo: **cerrado en Supabase producción según la verificación más reciente**.

Importante: costos FIFO históricos inexistentes siguen siendo `NULL`; nunca convertir ausencia de costo en margen falso.

### B6
Núcleo operativo, compras, ventas, transferencias, vales, FIFO, costos e inventario inteligente: **implementado**.

### B7
Turnos, cuadres, responsabilidades e incidencias: **implementado y aplicado en producción según la verificación más reciente**.

### B8
Comunicación, conversaciones, participantes, mensajes y soporte/contexto: **implementado y aplicado en producción según la verificación más reciente**.

Limitaciones reales todavía pendientes de aceptación:
- prueba multiusuario real;
- concurrencia real de ventas/turnos;
- extremo a extremo real B7/B8;
- Realtime para `visto/escribiendo` queda fuera de esta fase.

---

## 9. ESTADO SUPABASE MÁS RECIENTE

La actualización del 2026-08-16 documentó como aplicados/cerrados B4/B5/B7/B8 en producción.

Tablas nuevas confirmadas:
- `auditoria_operaciones`;
- `turnos`;
- `cuadres`;
- `responsabilidades`;
- `incidencias`;
- `conversaciones`;
- `participantes_conversacion`;
- `mensajes`.

Correcciones confirmadas:
- permisos ampliados para auditoría/turnos/comunicación;
- `turnos.editar_any`;
- escrituras B7/B8 autenticadas e idempotentes;
- `enviar_mensaje` y `crear_conversacion` con idempotencia;
- helper interno B8 no expuesto públicamente;
- RLS activo en tablas nuevas;
- escrituras de tablas nuevas mediante RPC SECURITY DEFINER.

**Regla:** si una misión actual necesita Supabase, Claude debe volver a inspeccionar producción antes de cambiar nada. Este documento no sustituye la introspección real.

---

## 10. FRONTEND ACTUAL — PUNTOS IMPORTANTES

Archivos principales:
- `public/app.js` — núcleo frontend, actualmente grande (~325 KB en el árbol actual);
- `public/index.html`;
- `public/style.css`;
- `public/service-worker.js`;
- `public/manifest.json`.

Tests:
- `test/b2.3-centro-control.test.js`;
- `test/b3-usuarios-permisos.test.js`;
- `test/b4-centro-mando.test.js`;
- `test/b5-reportes.test.js`;
- `test/b6-nucleo-operativo.test.js`;
- `test/b7-operacion-humana.test.js`;
- `test/b8-comunicacion.test.js`.

El proyecto usa `npm test` con Node Test Runner, `jsdom`, `fake-indexeddb` y `wrangler`.

---

## 11. CONOCIMIENTO TÉCNICO / LECCIONES APRENDIDAS

1. **No mergear ramas viejas mecánicamente** cuando parten de un main anterior: comparar funcionalidad real y reimplementar solo lo que falta.
2. Un PR puede contener trabajo que ya está superado por main. El código actual manda.
3. Tests automatizados sirven para demostrar regresiones lógicas, pero no sustituyen pruebas reales.
4. No crear infraestructura offline paralela.
5. No convertir `NULL` de costos en `0` para aparentar rentabilidad.
6. Los errores de negocio y los errores de red tienen estados diferentes en la cola.
7. La idempotencia debe conservar la misma key durante reintentos.
8. No crear RPC/tablas por inercia.
9. No asumir que SQL versionado está aplicado en producción.
10. No asumir que código desplegado funciona en el navegador sin probarlo.
11. El Service Worker y cachés deben cambiar cuando corresponda a una actualización real.
12. Una misión debe producir un bloque funcional grande, no microtareas artificiales.
13. Si un problema requiere backend, Vibe no debe improvisar una solución frontend que rompa el contrato.
14. Si una misión frontend puede resolverse sin Supabase, no debe bloquearse esperando a Claude.
15. Toda sesión debe terminar dejando evidencia y actualizando este Cerebro.

---

# 12. ROADMAP FINAL DE LAS ÚLTIMAS 3 ETAPAS

## ETAPA 1 — VIBE: INTEGRACIONES FINALES + HARDENING FRONTEND

Vibe debe completar **las siguientes 3 misiones en una sola sesión**, en este orden, directamente en `main`.

### MISIÓN V1 — CONSOLIDACIÓN DE INTEGRACIONES Y DEUDA TÉCNICA

Objetivo: dejar el frontend B1-B8 internamente coherente y sin caminos duplicados.

Revisar e implementar, sin romper funcionalidades existentes:
- bootstrap único o reducción real de cargas/refrescos duplicados;
- separar `fetch/load` de `render` cuando reduzca llamadas/renders;
- consolidar cascadas de reconexión/arranque;
- reutilizar resultados ya cargados durante un mismo ciclo;
- corregir acceso heredado/inconsistente a `_usuarioActual`;
- revisar doble escape HTML en alertas/inventario;
- usar delegación de eventos donde corresponda en listas grandes;
- revisar `actualizarApp()` para que limpie únicamente recursos de BattleCruiser;
- revisar `manifest.json` e iconos PWA referenciados;
- no inventar iconografía ni identidad visual.

### MISIÓN V2 — CATÁLOGOS + OPERACIONES FRONTEND PENDIENTES

Auditar y corregir las escrituras legacy de:
- categorías;
- unidades;
- almacenes;
- presentaciones;
- producto_presentaciones.

Para cada una:
- determinar si realmente debe ser offline-first;
- reutilizar `ejecutarOperacion()` si corresponde;
- no inventar RPC si el backend actual no lo soporta;
- si requiere RPC/Supabase nuevo, NO modificar backend: documentar exactamente el contrato faltante para Claude y continuar con el resto de la misión.

Además:
- corregir cualquier integración frontend B3-B8 detectada;
- revisar rentabilidad para que costo ausente jamás sea `0` ni margen falso;
- revisar creación de conversaciones y asegurar que use el flujo de idempotencia existente si el contrato backend actual lo soporta;
- endurecer `tienePermiso()` sin convertir errores de red en autorizaciones falsas.

### MISIÓN V3 — HARDENING + SUITE FINAL FRONTEND

Hacer una auditoría profunda del frontend ya consolidado:
- edge cases;
- doble click/doble submit;
- estados intermedios;
- errores de red;
- reconexión;
- cola offline;
- duplicados;
- FIFO;
- proyección de stock;
- detalles de venta/transferencia/vale;
- Centro de Control;
- permisos UI;
- Service Worker;
- manifest/PWA;
- responsive móvil/desktop;
- listeners duplicados;
- memoria/estado global;
- funciones muertas o inconsistentes.

Añadir tests de regresión donde exista una vulnerabilidad verificable.
Ejecutar:
- `npm test`;
- `node --check public/app.js`;
- `node --check public/service-worker.js`.

**Resultado obligatorio Vibe:** código en `main`, commit, push a `origin/main`, tests verdes y lista exacta de cualquier dependencia que quede para Claude/Supabase.

---

## ETAPA 2 — CLAUDE: SUPABASE / BACKEND

Después de V1-V3, Claude recibe las dependencias backend acumuladas por Vibe.

### S1 — AUDITORÍA SUPABASE FINAL

Comparar producción contra el SQL versionado y el frontend real:
- RPC existentes/faltantes;
- firmas;
- SECURITY DEFINER;
- search_path;
- grants;
- RLS;
- permisos;
- idempotencia;
- índices;
- contratos B3-B8;
- catálogos;
- reportes;
- comunicación;
- turnos/cuadres.

### S2 — CORRECCIÓN BACKEND

Aplicar únicamente cambios realmente necesarios.
No duplicar RPC/tablas/idempotencia.
Verificar producción después de cada migración relevante.

---

## ETAPA 3 — ROBERT + CHATGPT: ACEPTACIÓN REAL TOTAL

Cuando Vibe y Claude terminen:

1. Online.
2. Offline.
3. Internet intermitente.
4. Cerrar/abrir app.
5. Compra.
6. Venta.
7. Transferencia.
8. Vale.
9. Producto.
10. Presentaciones.
11. Inventario/FIFO.
12. Centro de Control.
13. Reportes.
14. Turnos.
15. Entrega/recepción.
16. Cuadres.
17. Responsabilidades.
18. Incidencias.
19. Comunicación.
20. Permisos/roles.
21. Multiusuario.
22. Errores de negocio.
23. Errores de red.
24. Sincronización.
25. PWA/Service Worker.
26. Móvil + PC.
27. Auditoría completa.

Todo bug encontrado vuelve a una misión concreta, se corrige en `main`, se verifica y se registra aquí.

---

## 13. ORGANIZACIÓN DEL REPOSITORIO

Estructura objetivo:

```text
/
├── BATTLECRUISER_CEREBRO.md        ← ÚNICO CEREBRO VIGENTE
├── package.json
├── package-lock.json
├── wrangler.jsonc
├── .gitignore
├── .assetsignore
├── public/                          ← producto desplegable
├── test/                            ← pruebas automatizadas
├── supabase/                        ← SQL versionado/backend
├── .github/workflows/quality.yml   ← CI de calidad
└── docs/archive/                    ← historial, addendums y legacy archivado
```

No poner documentación histórica, handoffs o instrucciones temporales en la raíz.
No eliminar historial útil: moverlo a `docs/archive/`.
No conservar automatizaciones legacy activas si ya no forman parte del flujo actual.

---

## 14. DEFINITION OF DONE

Una misión solo está terminada cuando:
- código existe en `main`;
- commit existe;
- push existe;
- tests relevantes pasan;
- syntax checks pasan;
- no se creó arquitectura duplicada;
- dependencias backend están documentadas;
- el Cerebro está actualizado;
- si corresponde, Roberto prueba posteriormente en vivo.

**MAIN es la única fuente de verdad del frontend.**

**Supabase producción es la única fuente de verdad del backend.**

**Este archivo es la única memoria maestra vigente.**
