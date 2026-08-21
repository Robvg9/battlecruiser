# BattleCruiser — Informe final: Misión M15.1 + M16.1

**Fecha:** 2026-08-21 · **Proyecto:** `papxnkkjtkxsitcsvcme` · **Modo:** auditoría + migraciones generadas, **ninguna aplicada todavía**

---

## 1. Versionado M15 — resuelto

`iniciar_ciclo_operativo(uuid,uuid)` e `iniciar_validacion_ciclo_operativo(uuid,uuid)` existen en producción desde la migración real `20260821125355_m15_ciclos_operativos`, pero no estaban en `supabase/m15_ciclos_operativos.sql`. Extraídas con `pg_get_functiondef` y volcadas, sin cambios de lógica, en:

📄 **`supabase/m15_1_completar_versionado.sql`**

## 2. Hardening de grants M15/M16 — generado, no aplicado

Verificado con `aclexplode(pg_proc.proacl)` grant por grant (no solo por nombre de rol):

| Ya correctas (sin PUBLIC/anon) | Requieren REVOKE |
|---|---|
| `crear_ciclo_operativo`, `listar_ciclos_operativos`, `obtener_ciclo_operativo` | `iniciar_ciclo_operativo`, `iniciar_validacion_ciclo_operativo`, `declarar_entrega_caja`, `registrar_conteo_entrega_caja`, `registrar_recepcion_entrega_caja`, `revisar_entrega_caja`, `listar_entregas_caja`, `obtener_entrega_caja` |

8 funciones con `EXECUTE` explícito a `PUBLIC` y `anon` (no solo `authenticated`), inconsistente con el patrón que M17.1 ya estableció. Riesgo real bajo (cada una exige `auth.uid()` vía `_validar_usuario_operacion()`), pero se genera el fix:

📄 **`supabase/m15_2_m16_1_hardening_grants_rpc.sql`**

## 3. Función huérfana M16 — investigada, no eliminada

`registrar_conteo_entrega_caja`: **0 usos reales** confirmados vía `private.operaciones_idempotencia` (0 filas para ella y también 0 para su reemplazo, porque el frontend de M16 aún no existe). Los únicos registros en logs son los `CREATE OR REPLACE` de las propias migraciones, no invocaciones. Detalle completo y recomendación en:

📄 **`docs/BATTLECRUISER_M16_FUNCION_HUERFANA.md`**

## 4. Cerebro — actualizado (mínimo)

Se agregaron solo las líneas necesarias en las secciones M15/M16 y en el mapa de migraciones: los 2 archivos nuevos, la aclaración legado/vigente de M16, y la referencia al hardening. No se tocó nada más del documento.

📄 **`BATTLECRUISER_CEREBRO.md`** (versión actualizada)

## 5. Pruebas — READ-ONLY antes, funcionales con ROLLBACK después

**Antes de generar las migraciones (read-only):** toda la introspección de las secciones 1-4 se hizo con `SELECT` puro sobre catálogos del sistema. Cero escritura.

**Prueba funcional end-to-end**, ejecutada dentro de `BEGIN; ... ROLLBACK;` simulando una sesión real (`SET LOCAL role authenticated` + `request.jwt.claims` con un usuario real existente, rol "Dueño"), **contra el estado actual de producción (sin aplicar todavía el hardening)**:

1. `crear_ciclo_operativo` → PLANIFICADO ✅
2. `iniciar_ciclo_operativo` → ACTIVO ✅
3. `iniciar_validacion_ciclo_operativo` → EN_VALIDACION ✅
4. `declarar_entrega_caja` → DECLARADA ✅
5. `registrar_recepcion_entrega_caja` → CONTADA, diferencia calculada ✅
6. `revisar_entrega_caja` → bloqueó correctamente la auto-aprobación (mismo usuario que declaró/contó) ✅
7. `finalizar_ciclo_operativo` → bloqueó correctamente el cierre por tener una entrega en CONTADA pendiente ✅

Cadena completa sin errores inesperados. Al hacer `ROLLBACK`, se confirmó `SELECT count(*) FROM ciclos_operativos` = 0 → **nada quedó persistido**, la transacción no dejó rastro.

**M14 intacto:** no se tocó ninguna tabla/función de turnos/ventas en esta misión ni en la prueba.

⚠️ Esta prueba corrió **antes** de aplicar `m15_1` (no-op) y `m15_2_m16_1` (solo grants, no cambia lógica para `authenticated`), por lo que el resultado funcional sería idéntico después de aplicarlas — pero no se repitió post-aplicación porque **las migraciones todavía no se aplicaron** (ver sección 6).

## 6. Qué falta para cerrar la misión

Los 4 archivos de esta misión están generados y listos, pero **no se ejecutó `apply_migration` contra producción** — ni el versionado (no-op) ni el hardening de grants (si cambia comportamiento de superficie pública). Necesito tu confirmación explícita para aplicar:

- `m15_1_completar_versionado.sql` (no-op funcional, solo documenta)
- `m15_2_m16_1_hardening_grants_rpc.sql` (revoca `anon`/`PUBLIC` en 8 funciones)

Si confirmás, aplico ambas con `apply_migration` y repito la misma prueba con `BEGIN/ROLLBACK` para confirmar que `authenticated` sigue funcionando idéntico después del hardening.
