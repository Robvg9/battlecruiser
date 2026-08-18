# BATTLECRUISER — CEREBRO MAESTRO ÚNICO

**Actualizado:** 2026-08-18  
**Repositorio:** `Robvg9/battlecruiser`  
**Rama de trabajo:** `main`  
**Fuente de verdad:** GitHub `main` + Supabase producción + pruebas reales de Roberto.

> Este es el único Cerebro vigente. Los informes de auditoría/reconciliación son evidencia histórica y quedan archivados en `docs/archive/`.

---

## 1. REGLAS SUPREMAS

1. **Código real > memoria > promesas de una IA.**
2. Separar siempre: código escrito ≠ commit ≠ push ≠ deploy ≠ funcionamiento ≠ prueba real.
3. No crear arquitectura duplicada: buscar primero lo existente.
4. No inventar RPC, tablas, helpers ni contratos backend.
5. Frontend sensible a backend: si falta contrato Supabase, documentarlo para Claude.
6. Toda misión debe terminar con evidencia, tests y Cerebro actualizado.
7. `main` es la fuente de verdad del frontend; Supabase producción, del backend.

## 2. ROLES

**ChatGPT:** coordinación, arquitectura, auditoría, investigación, diseño de misiones y control del roadmap.  
**Vibe:** ejecución directa de GitHub/frontend/tests. Trabaja en `main`, prueba, commit y push.  
**Claude:** Supabase/backend: RPC, SQL, RLS, grants, seguridad e introspección de producción.  
**Roberto:** pruebas reales, UX y aceptación final.

### Regla Vibe
No ramas ni PR para misiones normales salvo petición expresa. Antes de tocar código: revisar `main`. Después: tests/syntax checks, commit, push y reportar SHA.

### Regla Claude
Antes de modificar Supabase: introspección directa de producción. No asumir que un SQL versionado está aplicado.

---

## 3. ESTADO ACTUAL — 2026-08-18

### Calidad
- **212/212 tests PASS.**
- `node --check public/app.js` ✅
- `node --check public/service-worker.js` ✅
- `main` limpio y sincronizado con `origin/main` en el último cierre.

### Backend reconciliado
M3–M7 están versionados en `supabase/` sin duplicaciones entre migraciones vigentes:
- M3: productos + revocación global de `anon`.
- M4: auditoría/integridad.
- M5: `private` + permisos + conversiones + protección del último Dueño.
- M6: `registrar_compra`, `registrar_venta`, `registrar_transferencia`, `registrar_vale_salida`.
- M7: `inventario_enriquecido`, `movimientos_producto`, `rentabilidad_ventas`, `historial_compras`.
- `b6-nucleo-operativo.sql` queda **DEPRECATED**, conservado solo como histórico.

### Frontend
Principales archivos desplegables:
- `public/app.js`
- `public/index.html`
- `public/style.css`
- `public/service-worker.js`
- `public/manifest.json`

### Arquitectura central que NO duplicar
- IndexedDB `battlecruiser-cache` / `operaciones_pendientes`.
- `ejecutarOperacion()` / `sincronizarCola()` / `recuperarOperacionesAtrapadas()`.
- mutex `_sincronizando`.
- router `RPC_POR_TIPO`.
- `idempotency_key` estable.
- caché/proyección/reconciliación existentes.
- idempotencia backend `private.operaciones_idempotencia`.
- FIFO en backend; nunca duplicarlo en frontend.

---

## 4. PRODUCTO Y BLOQUES

BattleCruiser = **CENTRO DE MANDO DEL NEGOCIO**: ventas, compras, inventario, dinero, turnos, responsabilidades, incidencias, auditoría y comunicación.

B1/B2/B2.2/B2.3 — Offline-First, cola, sincronización, idempotencia, reconciliación y Centro de Control: **integrados**.  
B3 — usuarios, roles, permisos y protección del último Dueño: **implementado**.  
B4 — auditoría/trazabilidad/Centro de Mando: **implementado**.  
B5 — reportes/rentabilidad: **reconciliado y probado**. `NULL` de costo histórico no se convierte en 0.  
B6 — operaciones de inventario/FIFO/costos: **reconciliado**.  
B7 — turnos/cuadres/responsabilidades/incidencias: **implementado en producción**.  
B8 — conversaciones/participantes/mensajes/soporte: **implementado en producción**.

### Aún requieren aceptación real
- multiusuario real;
- concurrencia real de ventas/turnos;
- extremo a extremo B7/B8;
- comportamiento móvil/PC y PWA;
- escenarios offline/intermitentes y recuperación.

---

## 5. ORGANIZACIÓN DEL REPOSITORIO

```text
/
├── BATTLECRUISER_CEREBRO.md      ← única memoria vigente
├── package.json / package-lock.json
├── .gitignore / .assetsignore
├── public/                       ← aplicación desplegable
├── test/                         ← pruebas automatizadas
├── supabase/                     ← SQL versionado
├── .github/workflows/            ← CI
└── docs/archive/                 ← informes, reconciliaciones y documentos históricos
```

No dejar handoffs, informes temporales ni addendums antiguos en la raíz. No borrar evidencia histórica: archivarla.

---

## 6. ROADMAP INMEDIATO

### FASE A — PUESTA A PUNTO DEL REPOSITORIO ✅
Orden estructural, documentación y Cerebro consolidados. No tocar funcionalidad sin necesidad.

### FASE B — AUDITORÍA PROFUNDA PREVIA
Antes de la revisión manual, hacer tres revisiones independientes del proyecto:
1. **ChatGPT:** arquitectura, coherencia, bugs potenciales, seguridad, UX y deuda.
2. **Vibe:** código frontend, tests, rendimiento, estados, PWA y UX técnica.
3. **Claude:** Supabase real vs SQL versionado, RPC/RLS/grants/idempotencia y contratos.

Resultado: una lista consolidada de **bugs + riesgos + mejoras**, clasificada por prioridad y sin implementar todavía nada que no esté justificado.

### FASE C — CORRECCIÓN DE PENDIENTES
Solo después de consolidar la auditoría. Cada hallazgo se convierte en misión concreta para Vibe o Claude según corresponda.

### FASE D — REVISIÓN MANUAL PROFUNDA
Se inicia únicamente cuando FASE B/C no dejen pendientes técnicos importantes. Roberto valida el producto en escenarios reales.

---

## 7. DEFINITION OF DONE

Una misión queda cerrada cuando:
- cambio está en `main`;
- commit + push confirmados;
- tests relevantes pasan;
- syntax checks pasan;
- no existe duplicación de arquitectura;
- dependencias backend están documentadas;
- Cerebro refleja el estado real;
- si corresponde, Roberto realiza aceptación real.

**No declarar terminado por palabras de una IA. Declarar terminado por evidencia.**