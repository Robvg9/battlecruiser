# BATTLECRUISER — V9.2

**Actualizado:** 2026-08-21  
**Repositorio:** `Robvg9/battlecruiser`  
**Rama:** `main`  
**Fuente de verdad:** GitHub `main` + verificaciones reales del repo.

> Único Cerebro vigente. Informes históricos en `docs/archive/` y `BATTLECRUISER_MISION_9.1_INFORME_FINAL.md`.

---

## 1. IDENTIDAD DEL PROYECTO

**BattleCruiser** es el **Centro de Mando Digital del Negocio**.

No es solo un POS. Es la plataforma para controlar la operación completa de un negocio físico:

- ventas y catálogo
- inventario, stock, FIFO y costos
- productos, categorías, presentaciones e imágenes
- almacenes (venta / mayorista)
- transferencias entre almacenes
- vales de salida
- empleados, roles y permisos
- turnos, cuadres, responsabilidades e incidencias
- **ciclos operativos y sesiones (mañana/tarde)** — M15
- comunicación interna y soporte
- auditoría y trazabilidad
- reportes y administración

**Objetivo:** digitalizar por completo la operación diaria del negocio.

---

## 2. VISIÓN FUTURA

BattleCruiser busca ser **el sistema operativo interno del negocio**:

- saber qué ocurre en tiempo real
- reducir errores humanos
- controlar pérdidas y mermas
- tomar decisiones administrativas con datos
- trazabilidad completa de operaciones
- ciclos de varios días con sesiones y validación de caja (próxima fase)

---

## 3. ARQUITECTURA ACTUAL

### Frontend

PWA web **offline-first** (Cloudflare / static `public/`).

```text
public/
├── index.html          ← shell UI + carga ordenada de módulos
├── style.css
├── app.js              ← STUB / punto de entrada final
├── service-worker.js   ← battlecruiser-shell-v49
├── manifest.json
├── favicon.png / icons/
└── js/
    ├── core.js
    ├── auth.js
    ├── offline.js              ← IndexedDB, cola, ejecutarOperacion, sincronizarCola
    ├── centro-control.js
    ├── navegacion.js
    ├── productos.js
    ├── presentaciones.js
    ├── almacenes.js
    ├── transferencias.js
    ├── vales.js
    ├── ventas.js
    ├── venta-turno-ui.js       ← Sesión 6: almacén de venta = turno ABIERTO
    ├── catalogos.js
    ├── configuracion.js
    ├── catalogo-avanzado.js
    ├── usuarios-permisos.js
    ├── mando.js
    ├── reportes.js
    ├── nucleo-operativo.js
    ├── operacion-humana.js     ← turnos; selector #turno-almacen-abrir (Sesión 8)
    ├── comunicacion.js
    └── panel-contextual.js     ← sin auto-drawer en #alm-selector (Sesión 7/8)
```

La **modularización** reemplazó el antiguo `app.js` monolítico. Los módulos se cargan en el mismo orden histórico; las funciones siguen siendo globales.

### Backend

**Supabase:** PostgreSQL, RPC, RLS, Storage, Auth, auditoría.

SQL versionado en `supabase/` (M3–M7, M11–M15, b3–b8, etc.).  
Antes de crear backend nuevo: verificar contratos existentes en producción.

### Tests

Carpeta `test/`. Script: `npm test` → `node --test test/*.test.js`.

---

## 4. REGLAS CRÍTICAS

### NO romper bajo ninguna circunstancia

- `ejecutarOperacion()`
- IndexedDB (`battlecruiser-cache` / `operaciones_pendientes`)
- cola FIFO y `sincronizarCola()`
- idempotencia (`idempotency_key` + `private.operaciones_idempotencia`)
- permisos (Usuario → Rol → Permisos del Rol)
- RLS y autenticación
- Service Worker / PWA
- **M14:** cadena `usuario → turno ABIERTO → almacen_id → venta`

### NO crear

- lógica duplicada de cola u offline
- nuevas colas paralelas
- permisos individuales por usuario
- RPC paralelos innecesarios o tablas duplicadas
- `app.js` monolítico de nuevo

### Reglas de trabajo

1. Código real > memoria > promesas de una IA.
2. Código escrito ≠ commit ≠ push ≠ deploy ≠ prueba real.
3. Buscar lo existente antes de inventar.
4. Si falta contrato Supabase: documentarlo; no inventarlo en frontend.
5. Trabajar en `main` (sin ramas/PR salvo petición expresa).
6. Tras cambios: `node --check`, tests, commit, push, reportar SHA.

### Roles del equipo

| Rol | Responsabilidad |
|-----|-----------------|
| ChatGPT | Coordinación, arquitectura, misiones, roadmap |
| Grok / Vibe | Ejecución frontend/GitHub/tests en `main` |
| Claude | Supabase: RPC, SQL, RLS, introspección producción |
| Roberto | Pruebas reales, UX, aceptación final |

---

## 5. SISTEMA OFFLINE

BattleCruiser es **Offline First**.

```text
Usuario
  → ejecutarOperacion(tipo, payload)
    → con Internet: client.rpc(RPC_POR_TIPO[tipo]) inmediato
    → sin Internet / error de red: IndexedDB cola FIFO
         → sincronizarCola() al recuperar conexión
         → idempotency_key estable
         → reconciliación + proyección local de stock (ajustePendiente)
```

Tipos relevantes de cola: `venta`, `turno`, `turno_cerrar`, `cuadre`, etc.  
El payload de venta incluye `p_almacen_id` (conservado al sincronizar).

**No duplicar esta arquitectura.**

---

## 6. SISTEMA DE PERMISOS

```text
Usuario → Rol → Permisos del Rol
```

- Comprobación frontend: `tienePermiso(recurso, accion)`
- Comprobación backend: `tiene_permiso(...)` en RPC
- **No** permisos individuales por usuario

### Hardening (completado)

```sql
REVOKE EXECUTE ON FUNCTION public._validar_usuario_operacion(text, text) FROM authenticated;
```

`public.obtener_conversion_presentacion(...)` **existe en producción** — MANTENER / NO TOCAR.

**Conclusión previa:** no hay otro revoke claramente accionable pendiente.

---

## 7. CADENA OPERATIVA DE VENTA (M14) — AUTORIDAD BACKEND

```text
USUARIO
  → TURNO ABIERTO (un solo ABIERTO por usuario)
    → ALMACÉN DEL TURNO (obligatorio)
      → VENTA (registrar_venta usa siempre turno.almacen_id)
```

**Implementado en producción (M14 / M14b):**

| Pieza | Estado |
|-------|--------|
| `abrir_turno` exige `p_almacen_id` activo | ✅ |
| CHECK `turnos_abierto_requiere_almacen` | ✅ |
| `registrar_venta` exige turno ABIERTO | ✅ |
| Rechazo si `p_almacen_id` ≠ almacén del turno | ✅ |
| Si `p_almacen_id` NULL → usa almacén del turno | ✅ |
| Fix M14b (conflicto variable `nombre`) | ✅ |

**Frontend alineado (Sesiones 6 y 8):**

- `venta-turno-ui.js`: sin selector libre de almacén en ventas; panel “Vendiendo desde”; bloqueo sin turno
- `#turno-almacen-abrir` dedicado para abrir turno (no reutilizar `#turno-filtro-almacen`)
- Cola offline conserva `p_almacen_id`

**Riesgo residual documentado (Sesión 9):** `ventas.js` aún lee `#venta-almacen`; los interceptores de `venta-turno-ui.js` fuerzan el valor del turno. Validación Android real pendiente.

---

## 8. CICLOS OPERATIVOS (M15) — VERSIONADO EN REPO

**Archivo:** `supabase/m15_ciclos_operativos.sql`  
**Estado:** ✅ **VERSIONADO / PRESENTE** en GitHub (reconciliación del DDL ya existente en producción; no es “migración nueva” a ejecutar a ciegas).

### Modelo

```text
ciclo operativo (cantidad_dias configurable 1–31)
  → 2 sesiones por día: MANANA | TARDE
      → turnos.ciclo_id / turnos.sesion_id (nullable; no rompen M14)
          → operaciones del operador (ventas bajo turno ABIERTO)
```

**Ejemplos (comprobados en producción por Claude):**

| Días | Sesiones |
|------|----------|
| 2 | 4 |
| 3 | 6 |
| 4 | 8 |
| 6 | 12 |

El ciclo **no** es exclusivamente de 3 días.

### Objetos

| Objeto | Notas |
|--------|--------|
| `ciclos_operativos` | `almacen_id`, `inicio_plan`, `cantidad_dias` 1–31, `fin_plan`, estados `PLANIFICADO`/`ACTIVO`/`EN_VALIDACION`/`VALIDADO`/`ARCHIVADO` |
| `sesiones_ciclo` | `dia_n`, `bloque` MANANA/TARDE, `UNIQUE(ciclo_id, dia_n, bloque)` |
| `turnos.ciclo_id` / `turnos.sesion_id` | FK nullable; **no** alteran abrir_turno/cerrar_turno/registrar_venta |
| Trigger `trg_validar_dia_n_sesion` | Impide `dia_n` fuera de `cantidad_dias` |
| RPC `crear_ciclo_operativo` | Genera 2 sesiones/día automáticamente |
| RPC `listar_ciclos_operativos` | Filtros almacén/estado |
| RPC `obtener_ciclo_operativo` | Detalle + sesiones |

**M14 sigue gobernando la venta.** El ciclo **no reemplaza** al turno de operador.

### Distinción crítica

| Acción | Significado |
|--------|-------------|
| **Cerrar turno** | El operador deja de vender (turno → CERRADO; se puede generar cuadre) |
| **Finalizar / validar ciclo** | Cierre administrativo del ciclo de N días tras validaciones |  

**Aún NO implementado (próxima fase backend):**

| Capacidad | Estado |
|-----------|--------|
| Entregas de dinero (declarar → contar → aprobar jefe) | 🔴 NO IMPLEMENTADO |
| Validación de gastos / reinversiones / entradas | 🔴 NO IMPLEMENTADO |
| Validación multi-eje de operaciones del turno | 🔴 NO IMPLEMENTADO |
| Cierre parcial formal del ciclo | 🔴 NO IMPLEMENTADO |
| Aprobación final del ciclo (workflow completo) | 🔴 NO IMPLEMENTADO |
| UI frontend de ciclos/sesiones | 🟡 PENDIENTE |

Cuadres/incidencias B7 **sí existen** y se reutilizan para el cierre del **operador**, no sustituyen la validación final del ciclo.

---

## 9. ESTADO REAL DE MÓDULOS

### Productos — COMPLETADO (funcional base)

CRUD, imágenes, categorías, presentaciones, búsqueda, stock, catálogo visual.

### Ventas — COMPLETADO + gobernado por turno (M14 + FE Sesión 6)

Catálogo, carrito, historial, offline. Almacén operativo = turno ABIERTO.

### Almacenes — COMPLETADO + UX Sesión 7/8

Panel inline al seleccionar; sin doble drawer en móvil por `#alm-selector`. Botones contextuales según pestaña.

### Transferencias / Vales / Centro de Mando / Presentaciones / Comunicación — IMPLEMENTADOS

(Ver historial 9.1 / T7.1.)

### Turnos / operación humana (B7 + M14 + FE 8)

| Capacidad | Estado |
|-----------|--------|
| Abrir/cerrar turno con almacén | ✅ |
| Cuadre al cerrar + revisar_cuadre | ✅ |
| Selector dedicado `#turno-almacen-abrir` | ✅ |
| Ciclos/sesiones M15 (backend) | ✅ VERSIONADO |
| UI ciclos | 🟡 PENDIENTE |
| Entregas de caja / validación ciclo | 🔴 NO IMPLEMENTADO |

Pendiente de **aceptación real** de Roberto: multiusuario, E2E Android del flujo turno→venta, PWA móvil, offline intermitente.

---

## 10. BACKEND (Supabase) — MAPA DE MIGRACIONES RELEVANTES

- M3 productos / revoke anon
- M4 auditoría e integridad
- M5 private + permisos + último Dueño
- M6 mutaciones críticas: compra, venta, transferencia, vale
- M7 reportes
- M11 roles CRUD, M12 imagen, M13 almacenes
- **M14 / M14b** turno gobierna venta (+ fix variable)
- **M15** ciclos operativos + sesiones (archivo de reconciliación en repo)
- b3–b8 históricos; `b6-nucleo-operativo.sql` = **DEPRECATED**
- `revoke_authenticated_validar_usuario_operacion.sql`

Regla Claude: introspección de producción antes de aplicar cambios.

---

## 11. SERVICE WORKER / PWA

**Cache actual:** `battlecruiser-shell-v49`

Comentarios de versión en código:

- v49 — Sesión 8: selector almacén al abrir turno (M14)
- v48 — Sesión 8: almacenes sin doble panel
- v47 — Sesión 6: venta-turno-ui.js + restore index
- v46 — Sesión 6: ventas gobernadas por almacén del turno

`SHELL_FILES` incluye `venta-turno-ui.js`, `operacion-humana.js`, `panel-contextual.js`, etc.

**Al añadir o renombrar módulos:** actualizar `SHELL_FILES` y subir el número de versión del cache.

`actualizarApp()` en `auth.js` — NO modificar sin necesidad explícita.

---

## 12. TESTS

```text
test/
├── b2.3-centro-control.test.js
├── b3-usuarios-permisos.test.js
├── b4-centro-mando.test.js
├── b5-reportes.test.js
├── b6-nucleo-operativo.test.js
├── b7-operacion-humana.test.js
├── b8-comunicacion.test.js
├── fase-c-aislamiento.test.js
├── fase-c-regresion.test.js
├── m3-productos-crud.test.js
└── _leer-app-js.js
```

**Tests históricos Misión 9.1:** 242 PASS (no re-ejecutados en cada sesión documental).

---

## 13. HISTORIAL — CIERRE HASTA SESIÓN 11

### Base V9.2 (previo al plan 30 sesiones)

- Misión 9.1 cerrada (tests históricos 242 PASS).
- T7.1 comunicación offline aplicado (`consolidarRefrescosPendientes` + `refrescarMensajes`).
- Hardening permisos; `offline.js` íntegro (incidente PLACEHOLDER resuelto).
- Versionado visible V9.2.

### Sesiones del plan 30 (evidencia de código / misiones)

| Sesión | Tema | Estado documental |
|--------|------|-------------------|
| 1–5 | Investigación loader/conectividad; productos; almacén en ventas; backend M14 (Claude) | Investigación / backend M14 ✅ en prod; detalle fino de 1–5 no re-expandido aquí |
| **6** | FE turno→almacén→venta; regresión `index.html` restaurada; `venta-turno-ui.js`; SW v46–v47 | ✅ PASS (post-reparación) |
| **7** | Investigación almacenes #11/#12/#13 (doble panel) | ✅ investigación; fix en 8 |
| **8** | Fix doble panel almacenes; `#turno-almacen-abrir`; SW **v49** | ✅ PASS |
| **9** | Auditoría post-M14 del flujo completo FE+offline | ✅ PASS auditoría (riesgos residuales anotados) |
| **10** | — | 🟡 **Pendiente de reconciliación documental** (sin evidencia suficiente en repo/Cerebro para declarar PASS/FAIL) |
| **11** | Investigación modelo La Cueva (ciclo / sesiones / turno operador) | ✅ investigación; alimentó M15 |
| **M15** | Ciclos operativos versionados + pruebas funcionales Claude en prod | ✅ VERSIONADO / PRESENTE |

### Detalle compacto Sesiones 6–9 y 11

**Sesión 6 — PASS (tras reparación)**  
Restauración de `index.html` desde commit sano; recuperación de paneles/formularios/IDs; integración turno → almacén → venta; carga de `venta-turno-ui.js`; Service Worker actualizado.

**Sesión 7 — investigación**  
Doble reacción al seleccionar almacén (`almacenes.js` + `panel-contextual.js`). Solución aplicada en sesión 8: eliminar auto-open del drawer en change de `#alm-selector`; panel inline como comportamiento normal; botones contextuales según pestaña. Sin backend.

**Sesión 8 — PASS**  
Apertura de turno post-M14: deja de usarse `#turno-filtro-almacen`; selector `#turno-almacen-abrir`; validación FE de almacén obligatorio; `p_almacen_id` correcto; `renderTurnoActual` muestra almacén; SW v49; M14 intacto.

**Sesión 9 — PASS (auditoría)**  
Confirmado: ventas usan almacén del turno; selector libre no operativo; venta sin turno bloqueada; `cerrarTurno` actualiza estado; cola conserva `p_almacen_id`; M14 autoridad. Riesgos: dependencia de interceptores en `ventas.js`; falta validación Android real.

**Sesión 11 — investigación**  
Modelo de negocio: separar **CICLO → SESIONES MANANA/TARDE → TURNO OPERATIVO DEL USUARIO → OPERACIONES**. El ciclo no reemplaza el turno que gobierna ventas. M14 se mantiene. Entregas/validación final = próxima fase.

---

## 14. DEFINITION OF DONE

Una misión queda cerrada cuando:

- cambio en `main` (commit + push) cuando aplique
- tests y `node --check` relevantes OK (cuando el entorno lo permite)
- sin duplicación de arquitectura offline/permisos/RPC
- M14 no debilitado
- Cerebro refleja el estado real
- aceptación real de Roberto cuando corresponda

**No declarar terminado solo por palabras de una IA. Declarar terminado por evidencia.**

---

## 15. ORGANIZACIÓN DEL REPO

```text
/
├── BATTLECRUISER_CEREBRO.md          ← este archivo (V9.2, sync Sesión 11 / M15)
├── BATTLECRUISER_MISION_9.1_INFORME_FINAL.md
├── package.json
├── public/                           ← app desplegable
├── test/
├── supabase/                         ← SQL versionado (incl. m14*, m15_ciclos_operativos.sql)
├── .github/workflows/
└── docs/archive/                     ← evidencia histórica
```

No dejar handoffs temporales en la raíz.
