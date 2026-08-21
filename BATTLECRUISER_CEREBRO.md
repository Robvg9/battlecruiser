# BATTLECRUISER — CEREBRO (única fuente de verdad)

**Actualizado:** 2026-08-21  
**Repositorio:** `Robvg9/battlecruiser` · rama `main`  
**Proyecto Supabase:** `papxnkkjtkxsitcsvcme` (battlecruiser)

> Este es el **único Cerebro vigente**. Copias históricas en `docs/archive/`.

---

## 1. IDENTIDAD

**BattleCruiser** = Centro de Mando Digital del Negocio (no solo POS).

Cubre: ventas, catálogo, inventario/FIFO/costos, productos/presentaciones/imágenes, almacenes, transferencias, vales, empleados/roles/permisos, turnos/cuadres/incidencias, **ciclos operativos + sesiones + entregas de caja + cierre de ciclo**, comunicación, auditoría, reportes.

**Objetivo:** digitalizar por completo la operación diaria.

---

## 2. VISIÓN Y ROADMAP FUTURO

Sistema operativo interno del negocio: tiempo real, menos errores humanos, control de pérdidas, decisiones con datos, trazabilidad completa.

### 2.1 ROADMAP — Ideas futuras (NO implementar aún)

#### Sincronización P2P local entre dispositivos

**Estado:** 🔵 SOLO VISIÓN.

**Concepto:** dispositivos BattleCruiser (teléfonos, tablets, PCs) sincronizan entre sí sin depender siempre de Internet.

**Ejemplo:** Dispositivo A (online, datos frescos) → Dispositivo B (offline/atrasado) vía QR, código temporal, Bluetooth, WiFi local u otro método seguro.

**Objetivos a investigar:**
- Sincronización P2P entre teléfonos/tablets/PCs
- Transferencia segura de cambios pendientes
- Resolución de conflictos e identificación de versión más reciente
- Integración con IndexedDB / cola offline actual (sin duplicarla)
- Mantener auditoría y trazabilidad
- Nunca sobrescribir datos críticos sin validación
- Seguridad antes que velocidad

---

## 3. ARQUITECTURA

### Frontend
PWA offline-first (Cloudflare Pages · `public/`).

```text
public/
├── index.html · style.css · app.js (stub) · service-worker.js (v49)
├── manifest.json · icons/
└── js/
    core · auth · offline · centro-control · navegacion
    productos · presentaciones · almacenes · transferencias · vales
    ventas · venta-turno-ui · catalogos · configuracion · catalogo-avanzado
    usuarios-permisos · mando · reportes · nucleo-operativo
    operacion-humana · comunicacion · panel-contextual
```

Módulos cargados en orden histórico; funciones globales. **No** volver a monolito `app.js`.

### Backend
Supabase (PostgreSQL, RPC, RLS, Storage, Auth, auditoría).  
SQL versionado en `supabase/`. **Antes de crear backend nuevo: introspección de producción.**

### Tests
`npm test` → `node --test test/*.test.js` (histórico 242 PASS en Misión 9.1).

---

## 4. REGLAS CRÍTICAS

### NO romper
- `ejecutarOperacion()` · IndexedDB · cola FIFO · `sincronizarCola()`
- Idempotencia (`idempotency_key` + `private.operaciones_idempotencia`)
- Permisos (Usuario → Rol → Permisos del Rol)
- RLS / Auth / Service Worker / PWA
- **M14:** `usuario → turno ABIERTO → almacen_id → venta`

### NO crear
- Colas u offline duplicados · permisos individuales por usuario
- RPC/tablas paralelas innecesarias · `app.js` monolítico

### Método de trabajo
1. Código real > memoria > promesas de IA.
2. Escrito ≠ commit ≠ push ≠ deploy ≠ prueba real.
3. Buscar lo existente antes de inventar.
4. Sin contrato Supabase → documentar; no inventar en FE.
5. Trabajar en `main` (sin ramas/PR salvo petición).
6. Tras cambios: `node --check`, tests, commit, push, reportar SHA.

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
     · idempotency_key estable
     · reconciliación + proyección stock local
```

Tipos: `venta`, `turno`, `turno_cerrar`, `cuadre`, etc.  
Payload de venta conserva `p_almacen_id`. **No duplicar esta arquitectura.**

---

## 6. PERMISOS

```text
Usuario → Rol → Permisos del Rol
```

FE: `tienePermiso(recurso, accion)` · BE: `tiene_permiso(...)` en RPC.  
Hardening: `REVOKE EXECUTE ON public._validar_usuario_operacion FROM authenticated`.  
`obtener_conversion_presentacion` existe en prod — **NO TOCAR**.

---

## 7. M14 — CADENA DE VENTA (IMPLEMENTADO)

```text
USUARIO → TURNO ABIERTO (1 por usuario) → ALMACÉN DEL TURNO → VENTA
```

| Pieza | Estado |
|-------|--------|
| `abrir_turno` exige `p_almacen_id` activo | ✅ |
| CHECK `turnos_abierto_requiere_almacen` | ✅ |
| `registrar_venta` exige turno ABIERTO | ✅ |
| Rechazo si `p_almacen_id` ≠ almacén del turno | ✅ |
| NULL → usa almacén del turno | ✅ |
| Fix M14b (variable `nombre`) | ✅ |
| FE: `venta-turno-ui.js`, `#turno-almacen-abrir`, SW v49 | ✅ |

**Riesgo residual:** `ventas.js` aún lee `#venta-almacen`; interceptores fuerzan el del turno. Validación Android real pendiente.

---

## 8. CICLOS + ENTREGAS + CIERRE (M15 · M16 · M17 · M17.1) — IMPLEMENTADOS

### Modelo

```text
ciclo (1–31 días) → 2 sesiones/día (MANANA|TARDE)
  → turnos.ciclo_id / sesion_id (nullable; no rompen M14)
    → operaciones bajo turno ABIERTO
      → entregas de caja (declarar → contar → revisar)
        → finalizar ciclo (solo EN_VALIDACION, sin pendientes)
```

### Estados del ciclo
`PLANIFICADO` → `ACTIVO` → `EN_VALIDACION` → `VALIDADO` / `ARCHIVADO`

### M15 — Ciclos operativos ✅
- Tablas: `ciclos_operativos`, `sesiones_ciclo`
- RPC: `crear_ciclo_operativo`, `iniciar_ciclo_operativo`, `iniciar_validacion_ciclo_operativo`, `listar_*`, `obtener_*`, `_ciclo_operativo_json`
- `fin_plan` es columna **GENERATED** (no escribirla)
- Archivos: `m15_ciclos_operativos.sql` (+ `m15_1_completar_versionado.sql`, agrega `iniciar_ciclo_operativo`/`iniciar_validacion_ciclo_operativo` que existían en producción pero no en el archivo original), `m15_ciclos_permisos_roles.sql`
- Grants: hardeneados en `m15_2_m16_1_hardening_grants_rpc.sql` (2026-08-21)

### M16 — Entregas de caja ✅
- Flujo: DECLARADA → CONTADA → APROBADA | RECHAZADA
- RPC vigentes: `declarar_entrega_caja`, `registrar_recepcion_entrega_caja` (paso DECLARADA→CONTADA), `revisar_entrega_caja`, `listar_entregas_caja`, `obtener_entrega_caja`, `obtener_pendientes_cierre_ciclo`
- `registrar_conteo_entrega_caja` = **legado/huérfana**, coexiste en prod sin uso (ver `docs/BATTLECRUISER_M16_FUNCION_HUERFANA.md`); NO usarla en frontend, no eliminada aún
- Archivo: `m16_entregas_caja.sql`
- **RECHAZADA no bloquea** el cierre del ciclo (ya está resuelta)
- Grants: hardeneados en `m15_2_m16_1_hardening_grants_rpc.sql` (2026-08-21)

### M17 — Cierre de ciclo operativo ✅
- RPC: `finalizar_ciclo_operativo(p_ciclo_id, p_idempotency_key)`
- Solo desde `EN_VALIDACION`
- Bloquea si hay entregas en DECLARADA/CONTADA o cuadres no APROBADO/RECHAZADO
- Idempotencia + auditoría
- Archivo: `m17_cierre_ciclo_operativo.sql`

### M17.1 — Hardening grants ✅
- REVOKE EXECUTE de PUBLIC/anon sobre `finalizar_ciclo_operativo` y `obtener_pendientes_cierre_ciclo`
- GRANT solo a `authenticated`
- Archivo: `m17_1_hardening_grants_rpc.sql`

### Distinción crítica
| Acción | Significado |
|--------|-------------|
| Cerrar turno | Operador deja de vender (→ CERRADO + cuadre) |
| Finalizar ciclo | Cierre administrativo de N días tras validaciones |

**UI frontend de ciclos/entregas/cierre:** 🟡 PENDIENTE.

---

## 9. ESTADO REAL DE MÓDULOS

| Módulo | Estado |
|--------|--------|
| Productos / presentaciones / imágenes | ✅ Base completa |
| Ventas (gobernadas por turno M14) | ✅ |
| Almacenes + UX móvil | ✅ |
| Transferencias / Vales / Centro de Mando / Comunicación | ✅ |
| Turnos + cuadres (B7 + M14) | ✅ |
| Ciclos (M15) backend | ✅ |
| Entregas de caja (M16) backend | ✅ |
| Cierre de ciclo (M17 + M17.1) backend | ✅ |
| UI ciclos / entregas / cierre | 🟡 Pendiente |
| Aceptación Android E2E multiusuario | 🟡 Pendiente Roberto |

---

## 10. MAPA DE MIGRACIONES (`supabase/`)

| Archivo | Tema |
|---------|------|
| m0_* | Esquema base + triggers auditoría |
| m3–m7 | Productos, seguridad, auditoría, mutaciones críticas, reportes |
| m8_3 / m8_4 | Catálogos categorías/unidades/presentaciones |
| m10–m13 | Usuario interno, roles CRUD, imagen, almacenes |
| **m14 / m14b** | Turno gobierna venta + fix variable |
| **m15_*** | Ciclos operativos + permisos |
| **m16_entregas_caja.sql** | Entregas de caja |
| **m17_cierre_ciclo_operativo.sql** | Finalizar ciclo |
| **m17_1_hardening_grants_rpc.sql** | Grants RPC M17 |
| **m15_1_completar_versionado.sql** | Versionado M15: `iniciar_ciclo_operativo`/`iniciar_validacion_ciclo_operativo` |
| **m15_2_m16_1_hardening_grants_rpc.sql** | Grants RPC M15/M16 |
| b3–b8 | Históricos (b6 = DEPRECATED) |
| revoke_* | Hardening permisos |

Regla: introspección producción antes de aplicar cualquier cambio SQL.

---

## 11. SERVICE WORKER / PWA

**Cache:** `battlecruiser-shell-v49`  
Al añadir/renombrar módulos JS: actualizar `SHELL_FILES` y subir versión de cache.  
`actualizarApp()` en `auth.js` — no modificar sin necesidad explícita.

---

## 12. DEFINITION OF DONE

- Cambio en `main` (commit + push) cuando aplique
- Tests / `node --check` OK
- Sin duplicar offline / permisos / RPC
- M14 no debilitado
- Cerebro refleja estado real
- Aceptación real de Roberto cuando corresponda

**Evidencia > palabras de una IA.**

---

## 13. ORGANIZACIÓN DEL REPO

```text
/
├── BATTLECRUISER_CEREBRO.md     ← ÚNICA fuente de verdad
├── package.json · wrangler.jsonc
├── public/                      ← app desplegable
├── supabase/                    ← SQL versionado (M0–M17.1)
├── test/
├── docs/
│   ├── archive/                 ← informes e investigaciones históricas
│   └── …
└── .github/workflows/
```

No dejar handoffs temporales ni Cerebros duplicados en la raíz.
