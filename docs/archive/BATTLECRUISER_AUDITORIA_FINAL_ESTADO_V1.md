# BATTLECRUISER — AUDITORÍA FINAL DE COHERENCIA V1

**Fecha:** 2026-08-21  
**Repo:** `Robvg9/battlecruiser` @ `main`  
**HEAD auditado:** `0c372fe4dc8d8e44af371c6a1ab9010c5a1f9413` (pre-este informe)  
**Proyecto Supabase:** `papxnkkjtkxsitcsvcme`  
**Modo:** SOLO LECTURA — sin ALTER en prod, sin cambios FE/SQL/Cerebro funcionales.

> Prioridad: que una IA nueva lea el Cerebro y entienda el estado real sin inventar trabajo ya hecho.

---

## 1. ESTADO GENERAL

### **WARN** (no FAIL)

| Área | Veredicto |
|------|-----------|
| Cerebro como única fuente en raíz | ✅ PASS |
| M14–M17.1 documentados como implementados | ✅ PASS |
| Archivos SQL M14–M17.1 presentes en repo | ✅ PASS |
| Frontend alineado con “UI ciclos pendiente” | ✅ PASS |
| Coherencia total Cerebro ↔ SQL detallado | 🟡 WARN (gaps menores de catálogo RPC) |
| Introspección live Supabase en esta auditoría | 🟡 WARN (sin acceso directo desde este entorno) |
| Tests vs módulos M15–M17 | 🟡 WARN (sin cobertura dedicada) |
| Documentación histórica residual | 🟡 WARN (ligera; no bloquea) |

**No hay FAIL estructural:** el proyecto no está en estado contradictorio grave. Los avisos son de precisión documental, cobertura de tests y verificación live pendiente de Claude.

---

## 2. FASE 1 — CEREBRO

### 2.1 Única fuente principal
- Raíz: solo `BATTLECRUISER_CEREBRO.md` (~9.4 KB).
- `BATTLECRUISER_CEREBRO-1.md` eliminado de raíz.
- Históricos en `docs/archive/`.

### 2.2 Contradicciones antiguas
- El Cerebro vigente ya marca M14–M17.1 como ✅ IMPLEMENTADOS.
- UI de ciclos/entregas/cierre: 🟡 PENDIENTE (correcto).
- Roadmap P2P: documentado como visión, no implementable ahora.

### 2.3 Reflejo M14–M17.1

| Módulo | Cerebro | Coincide con archivos SQL en repo |
|--------|---------|-----------------------------------|
| **M14** turno → almacén → venta + cuadres | ✅ | ✅ `m14_*`, `m14b_*` |
| **M15** ciclos + sesiones + permisos | ✅ | ✅ tablas/RPC base en `m15_*`; ver §3 sobre RPC de transición |
| **M16** entregas (declarar/contar/revisar) | ✅ | ✅ `m16_entregas_caja.sql` (más RPC de las listadas en Cerebro) |
| **M17** `finalizar_ciclo_operativo` | ✅ | ✅ `m17_cierre_ciclo_operativo.sql` |
| **M17.1** grants | ✅ | ✅ `m17_1_hardening_grants_rpc.sql` |

**Gaps menores Cerebro ↔ SQL (no invalidan el “IMPLEMENTADO”):**

1. **M16 — RPC de conteo dual:** el SQL versiona `registrar_conteo_entrega_caja` (legado/huérfano en prod según notas del propio archivo) y `registrar_recepcion_entrega_caja` (versión vigente recomendada). El Cerebro solo menciona `registrar_conteo_entrega_caja`.
2. **M16 — listados:** existen `listar_entregas_caja` y `obtener_entrega_caja` en SQL; no están en la lista corta del Cerebro.
3. **M15 — transiciones de estado:** el Cerebro cita `iniciar_ciclo_operativo` e `iniciar_validacion_ciclo_operativo`. El archivo `m15_ciclos_operativos.sql` versiona crear/listar/obtener + DDL; **no incluye** el cuerpo de esas dos RPC de transición en el extracto de reconciliación. Pueden existir solo en producción (extracción incompleta) o vivir en otro artefacto no versionado bajo ese nombre.
4. **`obtener_pendientes_cierre_ciclo`:** documentado bajo M16 en Cerebro y re-creado en `m17_cierre_ciclo_operativo.sql` (dependencia de cierre) — coherente, pero conviene citarlo explícitamente en ambos.

---

## 3. FASE 2 — REPOSITORIO / `supabase/`

### 3.1 Inventario (31 archivos)

| Grupo | Archivos |
|-------|----------|
| Base | `m0_esquema_base.sql`, `m0_1_triggers_auditoria.sql` |
| Producto/seguridad/reconciliación | m3–m7, m8_3, m8_4 |
| Usuarios/roles/almacenes | m10–m13 |
| Operación | **m14**, **m14b**, **m15**×2, **m16**, **m17**, **m17.1** |
| Históricos B | b3–b8 (`b6` marcado DEPRECATED en Cerebro) |
| Hardening suelto | `revoke_*`, `registrar_auditoria_interna.sql` |

### 3.2 Coherencia de nombres
- Convención mixta `mN_` vs `mN-` (guion vs underscore) en m3–m7: **heredada, no bloqueante**.
- M14–M17.1: nombres claros y orden lógico.

### 3.3 Duplicados / obsoletos
- **No** hay dos archivos M17 distintos.
- `b6-nucleo-operativo.sql`: histórico/DEPRECATED (Cerebro lo dice) — no borrar sin política de archive SQL.
- `obtener_pendientes_cierre_ciclo` aparece en M17 (y conceptualmente en flujo M16): un solo CREATE OR REPLACE en el archivo M17 del repo; OK si producción coincide.

### 3.4 Dependencias
M16/M17 asumen M0–M15, idempotencia, `_validar_usuario_operacion`, `registrar_auditoria` — documentado en cabeceras SQL.

---

## 4. FASE 3 — FRONTEND (`public/`)

### 4.1 Alineación con Cerebro
- Módulos listados en Cerebro existen bajo `public/js/`.
- **Sin referencias FE** a `finalizar_ciclo_operativo`, `declarar_entrega_caja`, `ciclos_operativos` UI, etc. → coherente con “UI ciclos/entregas/cierre 🟡 PENDIENTE”.
- M14 FE: `venta-turno-ui.js`, `operacion-humana.js` presentes; SW documentado v49.

### 4.2 Riesgos residuales (ya en Cerebro)
- `ventas.js` puede seguir leyendo `#venta-almacen`; interceptores de `venta-turno-ui.js` fuerzan almacén del turno.
- Validación Android E2E multiusuario pendiente de Roberto.

### 4.3 Archivos muertos evidentes
- No se detectó módulo JS obviamente huérfano en el inventario de árbol.
- `app.js` stub + carga modular: conforme a arquitectura.

**Conclusión FE:** no contradice el Cerebro. Backend M15–M17 por delante del FE (esperado).

---

## 5. FASE 4 — TESTS (`test/`)

| Archivo | Ámbito aproximado |
|---------|-------------------|
| b2.3, b3, b4, b5, b6, b7, b8 | Módulos históricos B |
| fase-c-* | Aislamiento / regresión |
| m3-productos-crud | Productos |
| b4-b8-production-hardening.sql | SQL de test hardening |
| _leer-app-js.js | Utilidad |

**Hallazgos:**
- Cobertura centrada en B2–B8 y productos; **sin tests dedicados M14–M17** en esta carpeta.
- “242 PASS” es histórico Misión 9.1; no prueba automáticamente M16/M17.
- Riesgo: falsa sensación de cobertura total si una IA asume que `npm test` valida ciclos/entregas/cierre.

---

## 6. FASE 5 — SUPABASE (SOLO LECTURA)

### Limitación de esta auditoría
**No hay conexión interactiva** al proyecto `papxnkkjtkxsitcsvcme` desde este entorno (sin service role / SQL editor).  
La comparación se basa en:
- SQL del repo etiquetado como extraído de producción (21/08/2026),
- pruebas documentadas en comentarios de M17 (A–H con ROLLBACK),
- auditorías previas en `docs/`.

### Tablas esperadas (según SQL versionado)
| Tabla | Evidencia en repo |
|-------|-------------------|
| `turnos` (+ `ciclo_id`/`sesion_id` nullable) | M15 ALTER |
| `cuadres` | B7 / M14 flujo |
| `ciclos_operativos` | M15 |
| `sesiones_ciclo` | M15 |
| `entregas_caja` | M16 |

### RPC esperadas (catálogo mínimo)
| RPC | Origen SQL repo |
|-----|-----------------|
| abrir_turno / cerrar_turno / registrar_venta / registrar_cuadre / revisar_cuadre | M14 + B7 |
| crear/listar/obtener_ciclo_operativo | M15 archivo |
| iniciar_ciclo / iniciar_validacion | Cerebro sí; **cuerpo no en m15_*.sql del repo** |
| declarar / registrar_conteo / registrar_recepcion / revisar / listar / obtener entrega | M16 |
| obtener_pendientes_cierre_ciclo / finalizar_ciclo_operativo | M17 |
| Grants M17.1 | m17_1 |

### Drift potencial a verificar por Claude (live)
1. Existencia y firma exacta de `iniciar_ciclo_operativo` e `iniciar_validacion_ciclo_operativo`.
2. Si `fin_plan` es GENERATED en prod (M17 asume que sí).
3. ACL real de todas las RPC M16 (notas del SQL sobre anon/authenticated).
4. Coexistencia `registrar_conteo_*` vs `registrar_recepcion_*`.
5. Que M17.1 esté aplicado (REVOKE PUBLIC/anon).

**Sin esa introspección, no se declara PASS absoluto repo↔prod.**

---

## 7. FASE 6 — OPTIMIZACIÓN DOCUMENTAL (solo recomendaciones)

### Puede archivarse / moverse a `docs/archive/` (cuando se autorice)
- `docs/BATTLECRUISER_AUDITORIA_RECONCILIACION_GITHUB_SUPABASE_V1.md` (pre-M14/M15/M16; útil pero pesado y parcialmente obsoleto).

### Puede comprimirse en una próxima pasada del Cerebro
- Lista explícita de **todas** las RPC M16 (incl. recepción y listar/obtener).
- Nota de una línea: “RPC de conteo vigente = `registrar_recepcion_entrega_caja`; `registrar_conteo_entrega_caja` legado en prod”.
- Estado de `iniciar_*` ciclo: “versionar DDL completo cuando Claude extraiga pg_get_functiondef”.

### No borrar sin decisión explícita
- `supabase/b6-nucleo-operativo.sql` y demás b* (evidencia histórica).
- Todo `docs/archive/*`.

### Información repetida
- Archive de sesiones 3/4/7 ya están resumidos; OK.
- CEREBRO_pre_M17 en archive conserva el estado anterior a la unificación.

---

## 8. DIFERENCIAS ENCONTRADAS (resumen)

| ID | Diferencia | Severidad |
|----|------------|-----------|
| D1 | Cerebro omite `registrar_recepcion_entrega_caja`, `listar_entregas_caja`, `obtener_entrega_caja` | Baja |
| D2 | `m15_ciclos_operativos.sql` no versiona `iniciar_ciclo_operativo` / `iniciar_validacion_ciclo_operativo` citados en Cerebro | Media (doc/SQL) |
| D3 | Sin tests automatizados M14–M17 | Media |
| D4 | FE sin UI de ciclos/entregas (documentado) | Info |
| D5 | Sin verificación live Supabase en esta sesión | Media (proceso) |
| D6 | Auditoría reconciliación V1 en `docs/` aún en nivel no-archive | Baja |

---

## 9. RIESGOS

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| IA implementa UI llamando solo a `registrar_conteo_*` y no a `registrar_recepcion_*` | Flujo de conteo incorrecto | Preferir recepción; documentar en Cerebro |
| IA re-ejecuta `m15_*.sql` CREATE TABLE en prod | Error / no-op peligroso | Cabecera ya dice NO ejecutar ciego; reforzar |
| IA cree que M15–M17 no existen por falta de tests | Retrabajo | Confiar en Cerebro + SQL |
| Drift real iniciar_* no versionado | FE o scripts incompletos | Claude: pg_get_functiondef → ampliar m15 |
| Validación Android pendiente | Regresiones UX M14 | Roberto / E2E |

---

## 10. ARCHIVOS QUE SE RECOMIENDA MODIFICAR (cuando se autorice)

1. **`BATTLECRUISER_CEREBRO.md`** — ampliar catálogo RPC M15/M16 (sin cambiar semántica de “IMPLEMENTADO”).
2. **`supabase/m15_ciclos_operativos.sql`** — añadir extracto de `iniciar_ciclo_operativo` e `iniciar_validacion_ciclo_operativo` si existen en prod (Claude).
3. Opcional: mover `docs/BATTLECRUISER_AUDITORIA_RECONCILIACION_GITHUB_SUPABASE_V1.md` → `docs/archive/`.

---

## 11. ARCHIVOS QUE **NO** DEBEN TOCARSE

- Todo `public/` funcional (salvo misión FE explícita).
- SQL M14–M17.1 ya aplicados (no re-aplicar a ciegas).
- `offline.js` / cola / idempotencia.
- Service Worker sin bump planificado.
- Supabase producción sin introspección previa.
- Tests históricos (no borrarlos; sí no asumir cobertura M17).

---

## 12. PRÓXIMOS PASOS RECOMENDADOS

1. **Claude (prod, solo lectura):** `pg_get_functiondef` de `iniciar_ciclo_operativo`, `iniciar_validacion_ciclo_operativo`, grants M16/M17, confirmar GENERATED `fin_plan`.
2. **Documental (Grok):** parche mínimo al Cerebro con catálogo RPC completo M16 + nota recepción vs conteo.
3. **Versionado:** completar `m15_*.sql` con RPC de transición si faltan.
4. **FE (misión futura):** UI ciclos → entregas → cierre; tipos en `RPC_POR_TIPO` solo cuando exista UX offline.
5. **Tests:** smoke mínimo de contratos RPC M15–M17 (aunque sea documental/SQL) para evitar regresiones de catálogo.
6. **Roberto:** E2E Android M14; luego ciclo completo cuando haya UI.

---

## 13. MENSAJE PARA UNA IA NUEVA

```text
Leé BATTLECRUISER_CEREBRO.md primero.
M14, M15, M16, M17 y M17.1 están IMPLEMENTADOS en backend y versionados en supabase/.
NO reimplementes entregas de caja ni cierre de ciclo.
La UI de ciclos/entregas/cierre AÚN NO existe en public/.
Antes de cualquier SQL: introspección de producción (Claude).
No confíes solo en npm test para validar M15–M17.
```

---

**Fin del informe.**  
Estado agregado: **WARN** — coherencia general buena; cerrar gaps de catálogo RPC y verificación live antes de declarar PASS absoluto.
