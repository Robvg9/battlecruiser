# BATTLECRUISER — CEREBRO (única fuente de verdad)

**Actualizado:** 2026-08-28  
**Repositorio:** `Robvg9/battlecruiser` · rama `main`  
**Proyecto Supabase:** `papxnkkjtkxsitcsvcme` (battlecruiser)

> Este es el **único Cerebro vigente**. Copias históricas en `docs/archive/`.

---

## 0. MODELO OPERATIVO DEFINITIVO — TURNO (2026-08-28)

**TURNO** es el único concepto operativo de negocio visible y consumido por la UX nueva.

| Capa | Estado |
|------|--------|
| Notion / Documento Maestro | Contrato TURNO vigente |
| Supabase LIVE | Tablas `turno_*` + RPC `bc_*` (migración aditiva); legacy ciclo presente |
| GitHub FE | v9.4.0 · `turno-api.js` + `turnos-maestro.js` · label **Turnos** |
| GitHub SQL `supabase/` | **GAP:** SQL `bc_*` / `turno_*` aún no versionado 1:1 desde live |

### Estados maestro
`PROGRAMADO → EN_CURSO → PENDIENTE_APROBACION → CERRADO` (+ `CANCELADO`).

### Sesiones
N días × 2 bloques (MANANA/TARDE) = **2N** sesiones.

### FE nuevo (no destruye legacy)
- `public/js/turno-api.js` — capa RPC `bc_*`, online-only, errores reales.
- `public/js/turnos-maestro.js` — UX home por almacén, crear Turno, declaración, relevo, revisión ADMIN, descuentos.
- `public/app.js` / `service-worker.js` — **v9.4.0**.

### Ciclo = LEGACY
`ciclos_operativos`, `sesiones_ciclo`, SQL M15–M17, `ciclos.js`, `m18-ciclos-ux.js`, M22/M24/M27 relacionados: **conservados**. No DROP. No presentar “Ciclo” como concepto operativo nuevo en UI.

### Reglas clave (backend es autoridad)
1. ADMIN crea Turno (almacén + días + asignaciones opcionales).
2. Sesión sin asignar no inicia; solo la asignada inicia.
3. Declaración de dinero obligatoria (incluido $0) para cerrar sesión.
4. Cerrar sesión ≠ cerrar Turno.
5. Turno pasa a `PENDIENTE_APROBACION` antes de `CERRADO`.
6. Interrupción/relevo con Auth del sustituto (sin logout general).
7. Receptor de mercancía en punto de venta = responsable de sesión activa (backend).
8. Duración fija/variable vía `bc_obtener_configuracion_turnos` / `bc_configurar_duracion_turnos`.

### Extensión futura (NO implementar parcialmente)
Rol **TRANSPORTISTA / ENTREGADOR**: transporta mercancía; no es Dependiente por defecto.

Detalle FE: `docs/BATTLECRUISER_TURNO_MODELO_V1.md`.

---

## 1. IDENTIDAD

**BattleCruiser** = Centro de Mando Digital del Negocio (no solo POS).

Cubre: ventas, catálogo, inventario/FIFO/costos, productos/presentaciones/imágenes, almacenes, transferencias, vales, empleados/roles/permisos, **turnos (concepto operativo definitivo)** / cuadres / incidencias, sesiones, entregas de caja, comunicación, auditoría, reportes.

Legacy documentado: ciclos operativos (M15–M17) como compatibilidad histórica.

**Objetivo:** digitalizar por completo la operación diaria.

---

## 2. VISIÓN Y ROADMAP FUTURO

Sistema operativo interno del negocio: tiempo real, menos errores humanos, control de pérdidas, decisiones con datos, trazabilidad completa.

### 2.1 ROADMAP — Ideas futuras (NO implementar aún)

#### Sincronización P2P local entre dispositivos

**Estado:** 🔵 SOLO VISIÓN.

**Concepto:** dispositivos BattleCruiser sincronizan entre sí sin depender siempre de Internet.

**Objetivos a investigar:** P2P, resolución de conflictos, integración con IndexedDB/cola offline actual (sin duplicarla), auditoría, seguridad antes que velocidad.

---

## 3. ARQUITECTURA

### Frontend
PWA offline-first (Cloudflare Pages · `public/`).

```text
public/
├── index.html · style.css · app.js (v9.4.0) · service-worker.js (v9.4.0)
├── manifest.json · icons/
└── js/
    turno-api · turnos-maestro   ← modelo TURNO (nuevo)
    core · auth · offline · centro-control · navegacion
    productos · presentaciones · almacenes · transferencias · vales
    ventas · venta-turno-ui · catalogos · configuracion
    usuarios-permisos · mando · reportes · nucleo-operativo
    operacion-humana · ciclos (LEGACY) · comunicacion · panel-contextual
```

Módulos cargados en orden; funciones globales. **No** volver a monolito `app.js`.

### Backend
Supabase (PostgreSQL, RPC, RLS, Storage, Auth, auditoría).  
SQL versionado en `supabase/`. **Antes de crear backend nuevo: introspección de producción.**

### Tests
`npm test` → `node --test test/*.test.js`.

---

## 4. REGLAS CRÍTICAS

### NO romper
- `ejecutarOperacion()` · IndexedDB · cola FIFO · `sincronizarCola()`
- Idempotencia (`idempotency_key`)
- Permisos (Usuario → Rol → Permisos del Rol)
- RLS / Auth / Service Worker / PWA
- **M14:** `usuario → turno ABIERTO → almacen_id → venta`

### NO crear
- Colas u offline duplicados · permisos individuales por usuario
- RPC/tablas paralelas innecesarias · `app.js` monolítico
- Segunda máquina de estados en FE para Turno (backend manda)

### Método de trabajo
1. Código real > memoria > promesas de IA.
2. Escrito ≠ commit ≠ push ≠ deploy ≠ prueba real.
3. Buscar lo existente antes de inventar.
4. Sin contrato Supabase → documentar; no inventar en FE.
5. Trabajar en `main`.
6. Triangular Notion ↔ Supabase ↔ GitHub tras cada bloque.

### Roles
| Rol | Responsabilidad |
|-----|-----------------|
| ChatGPT | Coordinación, arquitectura, misiones, roadmap |
| Grok | Ejecución FE / GitHub / tests en `main` |
| Claude | Supabase: RPC, SQL, RLS, introspección prod |
| Roberto | Pruebas reales, UX, aceptación final |

---

## 5. OFFLINE FIRST

```text
ejecutarOperacion(tipo, payload)
  → online: client.rpc inmediato
  → offline/error red: cola IndexedDB FIFO → sincronizarCola()
```

**Turno (bc_*):** mutaciones **online-only** por contrato actual. No inventar cola offline de Turno. No mostrar éxito falso si falla la red.

---

## 6. PERMISOS

```text
Usuario → Rol → Permisos del Rol
```

FE: `tienePermiso(recurso, accion)` · BE: `tiene_permiso(...)` en RPC.

---

## 7. M14 — CADENA DE VENTA (IMPLEMENTADO)

```text
USUARIO → TURNO ABIERTO (1 por usuario) → ALMACÉN DEL TURNO → VENTA
```

No debilitar M14 al migrar el modelo operativo TURNO.

---

## 8. CICLOS + ENTREGAS + CIERRE (M15 · M16 · M17) — LEGACY CONSERVADO

Implementados históricamente. Siguen en repo y en producción como compatibilidad.

UI legacy: `ciclos.js` / `m18-ciclos-ux.js` (label visible ya orientado a “Turnos” en m18).

**Dirección:** nueva UX y nuevas operaciones → `turno-api` / `turnos-maestro` / `bc_*`.

Detalle histórico de M15–M17 se mantiene en secciones de migraciones y `docs/`.

---

## 9. ESTADO REAL DE MÓDULOS (resumen)

| Módulo | Estado |
|--------|--------|
| TURNO FE (api + maestro) | 🟢 Implementado técnicamente v9.4.0 — pendiente prueba Robert |
| Productos / presentaciones | ✅ |
| Ventas (M14) | ✅ base; UX mejoras pendientes según auditoría Robert |
| Almacenes / Transferencias / Comunicación | ✅ con bugs UX documentados |
| Ciclos backend M15–M17 | ✅ LEGACY |
| SQL bc_* en repo | 🟡 GAP vs live |

---

## 10. MAPA DE MIGRACIONES (`supabase/`)

Incluye M0–M27 legacy y endurecimientos. **Falta volcar** migraciones live del dominio `turno_*` / `bc_*` cuando se estabilice el contrato 100%.

Regla: introspección producción antes de aplicar cualquier cambio SQL.

---

## 11. SERVICE WORKER / PWA

**Versión vigente documentada FE TURNO:** v9.4.0 (`battlecruiser-shell-9.4.0`).

Al añadir/renombrar módulos JS: alinear `app.js` + SW.

---

## 12. DEFINITION OF DONE

- Cambio en `main` cuando aplique
- Tests / `node --check` OK
- Sin duplicar offline / permisos / RPC
- M14 no debilitado
- Cerebro refleja estado real
- Triangulación Notion ↔ Supabase ↔ GitHub
- **IMPLEMENTADO ≠ VERIFICADO ≠ PROBADO ≠ VALIDADO POR ROBERT**

**Evidencia > palabras de una IA.**

---

## 13. ORGANIZACIÓN DEL REPO

```text
/
├── BATTLECRUISER_CEREBRO.md
├── package.json · wrangler.jsonc
├── public/                      ← app desplegable
├── supabase/                    ← SQL versionado (legacy + futuro turno)
├── test/
├── docs/
│   ├── BATTLECRUISER_TURNO_MODELO_V1.md
│   └── archive/
└── .github/workflows/
```
