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
---

## 8. CHECKLIST PRUEBAS REALES FINALES

A ejecutar AL FINAL, cuando todos los bloques t\u00e9cnicos est\u00e9n cerrados.

### A. Multiusuario
- [ ] Usuario A + Usuario B simult\u00e1neamente en el mismo dispositivo.
- [ ] A crea operaci\u00f3n offline, cierra sesi\u00f3n, B entra: B NO ve ni procesa la op de A.
- [ ] A crea op offline, cierra sesi\u00f3n, A vuelve a entrar: A recupera y sincroniza su op.
- [ ] A abre turno, cierra sesi\u00f3n, B entra: B NO ve el turno de A en su UI.
- [ ] A abre conversaci\u00f3n, cierra sesi\u00f3n, B entra: B NO ve la conversaci\u00f3n de A.

### B. Venta simult\u00e1nea
- [ ] Dos usuarios crean ventas al mismo tiempo: ambas se registran correctamente.
- [ ] Dos ventas del mismo usuario en pesta\u00f1as distintas: no duplicaci\u00f3n.
- [ ] Venta con stock insuficiente: error claro, no se registra.

### C. Turnos simult\u00e1neos
- [ ] Dos usuarios abren turnos al mismo tiempo: cada uno ve su propio turno.
- [ ] Usuario A cierra su turno mientras B opera: B sigue operando en su turno.
- [ ] Cierre de turno con operaciones pendientes: avisa pero permite cerrar.

### D. Offline
- [ ] Entrar offline: app funciona (lectura de cach\u00e9).
- [ ] Navegar offline: listas se muestran desde cach\u00e9.
- [ ] Crear operaci\u00f3n offline: se guarda en cola.

### E. Reconexi\u00f3n
- [ ] Perder conexi\u00f3n durante operaci\u00f3n: op queda en cola PENDIENTE.
- [ ] Recuperar conexi\u00f3n: sincronizaci\u00f3n autom\u00e1tica.
- [ ] Operaci\u00f3n atrapada en SINCRONIZANDO: se recupera y sincroniza.

### F. Conexi\u00f3n intermitente
- [ ] Conexi\u00f3n intermitente: operaciones se reintentan autom\u00e1ticamente.
- [ ] Sincronizaci\u00f3n fallida: operaciones quedan PENDIENTE, no se pierden.
- [ ] Reintento: operaciones se sincronizan en el pr\u00f3ximo intento.

### G. Operaciones pendientes
- [ ] Operaci\u00f3n pendiente nunca desaparece.
- [ ] Operaci\u00f3n pendiente nunca se duplica.
- [ ] Operaci\u00f3n pendiente nunca cambia de usuario.
- [ ] Operaci\u00f3n pendiente nunca se ejecuta dos veces.
- [ ] Operaci\u00f3n pendiente nunca queda invisible sin explicaci\u00f3n.

### H. B7 completo
- [ ] Abrir turno.
- [ ] Operaciones durante turno.
- [ ] Cerrar turno.
- [ ] Declarar cuadre.
- [ ] Revisar cuadre (aprobar/rechazar).

### I. B8 completo
- [ ] Abrir soporte.
- [ ] Crear conversaci\u00f3n.
- [ ] Enviar mensaje.
- [ ] Listar mensajes.
- [ ] Cerrar conversaci\u00f3n.

### J. M\u00f3vil
- [ ] Navegaci\u00f3n en pantalla pequeña.
- [ ] Men\u00fas accesibles.
- [ ] Tablas legibles.
- [ ] Formularios usables.
- [ ] Modales visibles.
- [ ] Paneles funcionales.
- [ ] Cola offline visible.
- [ ] Mensajes de conexi\u00f3n claros.

### K. PC
- [ ] Navegaci\u00f3n en pantalla grande.
- [ ] Men\u00fas accesibles.
- [ ] Tablas legibles.
- [ ] Formularios usables.
- [ ] Modales visibles.
- [ ] Paneles funcionales.
- [ ] Cola offline visible.
- [ ] Mensajes de conexi\u00f3n claros.

### L. PWA
- [ ] Instalaci\u00f3n como PWA.
- [ ] Ejecuci\u00f3n offline.
- [ ] Actualizaci\u00f3n autom\u00e1tica al abrir.

### M. Logout/login
- [ ] Logout: limpia contexto correctamente.
- [ ] Login: carga contexto correctamente.
- [ ] Cambio r\u00e1pido de usuario: no hay contaminaci\u00f3n de datos.

### N. Recuperaci\u00f3n
- [ ] Recuperaci\u00f3n de operaciones antiguas tras reconexi\u00f3n.
- [ ] Recuperaci\u00f3n de datos tras error de red.

### O. No duplicaci\u00f3n
- [ ] Idempotencia: misma operaci\u00f3n no se ejecuta dos veces.
- [ ] Sincronizaci\u00f3n simult\u00e1nea entre pesta\u00f1as: no duplicaci\u00f3n.
- [ ] Reintento tras error: no duplicaci\u00f3n.
