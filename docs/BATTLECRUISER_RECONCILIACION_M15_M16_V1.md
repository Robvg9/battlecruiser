# BattleCruiser — Reconciliación M15 / M16 (v1)

**Fecha:** 2026-08-21
**Proyecto Supabase:** `papxnkkjtkxsitcsvcme` (battlecruiser) — verificado ACTIVE_HEALTHY
**Método:** auditoría READ-ONLY (`pg_proc`, `pg_get_functiondef`, `pg_policies`, `supabase_migrations.schema_migrations`, conteo de filas en `permisos`/`roles`). **Ningún INSERT/UPDATE/DELETE/DDL ejecutado.**

---

## 1. M16 — entregas_caja: función huérfana confirmada

Ambas funciones **existen** en producción hoy, verificadas con `pg_get_functiondef`:

| Función | Estado real | Usada por el flujo |
|---|---|---|
| `registrar_conteo_entrega_caja(uuid, numeric, text, uuid)` | Existe, coincide 1:1 con el SQL versionado | **No** — huérfana |
| `registrar_recepcion_entrega_caja(uuid, numeric, text, uuid)` | Existe, coincide 1:1 con el SQL versionado | **Sí** — es la vigente (DECLARADA→CONTADA) |

Lógica: idéntica (mismas validaciones, mismo cálculo de `diferencia`, misma transición de estado). Difieren solo en el nombre del 3er parámetro (`p_observacion` vs `p_observacion_conteo`) y en el texto del log de auditoría. No hay evidencia de que `registrar_conteo_entrega_caja` sea invocada por ningún trigger, función o política — es código muerto, no un riesgo funcional activo.

**No se eliminó.** Queda para una futura misión de limpieza (DROP + revisar que ningún cliente FE la llame).

---

## 2. M15 — ciclos_operativos: gap real entre repo y producción

Las 6 funciones pedidas **existen** en producción:

`crear_ciclo_operativo`, `iniciar_ciclo_operativo`, `iniciar_validacion_ciclo_operativo`, `listar_ciclos_operativos`, `obtener_ciclo_operativo`, `_ciclo_operativo_json`.

**Hallazgo real:** `m15_ciclos_operativos.sql` (el archivo versionado en el repo) documenta solo 4 de las 6: `crear_ciclo_operativo`, `listar_ciclos_operativos`, `obtener_ciclo_operativo`, `_ciclo_operativo_json`. **`iniciar_ciclo_operativo` e `iniciar_validacion_ciclo_operativo` no están en el archivo**, pese a que la migración real `20260821125355_m15_ciclos_operativos` sí las incluyó en producción. Se extrajeron ambas definiciones vía `pg_get_functiondef` (ver anexo) — lógica simple, sin sorpresas: cada una valida el estado actual del ciclo (`PLANIFICADO→ACTIVO`, `ACTIVO→EN_VALIDACION`) antes de actualizar.

`m15_ciclos_permisos_roles.sql` sí coincide con la migración real `20260821181446_m15_crear_rol_incluye_ciclos`.

---

## 3. Coherencia documental (Cerebro)

`BATTLECRUISER_CEREBRO.md` (actualizado 2026-08-21) marca M15/M16/M17/M17.1 como ✅ implementados — **correcto en cuanto a "existe en producción"**, pero no menciona ninguno de los 2 hallazgos de este informe (función huérfana de M16, gap de versionado de M15). No es una afirmación falsa, pero queda incompleta.

---

## 4. Permisos y grants — inconsistencia real encontrada

Comparando contra el patrón ya aplicado en M17.1 (`REVOKE` de `anon`/`PUBLIC`, `GRANT` solo a `authenticated`):

| Ya hardeneadas (sin `anon`) | Grant a `anon` todavía presente |
|---|---|
| `crear_ciclo_operativo` | `_ciclo_operativo_json` |
| `crear_rol` | `_entrega_caja_json` |
| `finalizar_ciclo_operativo` | `declarar_entrega_caja` |
| `listar_ciclos_operativos` | `iniciar_ciclo_operativo` |
| `obtener_ciclo_operativo` | `iniciar_validacion_ciclo_operativo` |
| `obtener_pendientes_cierre_ciclo` | `listar_entregas_caja` |
| | `obtener_entrega_caja` |
| | `registrar_conteo_entrega_caja` |
| | `registrar_recepcion_entrega_caja` |
| | `revisar_entrega_caja` |

Es decir: **todo M16 (entregas_caja) + `iniciar_ciclo_operativo`/`iniciar_validacion_ciclo_operativo` de M15** todavía tienen `EXECUTE` concedido a `anon`, mientras que el resto de M15 y todo M17/M17.1 ya fue hardeneado. En la práctica no es explotable porque cada RPC llama a `_validar_usuario_operacion()`, que exige `auth.uid()` no nulo — pero es una inconsistencia real de superficie de ataque frente al patrón ya adoptado en el proyecto.

---

## 5. Qué está correcto (no tocar)

- Todas las 16 funciones auditadas existen y su lógica coincide con el SQL versionado que sí las documenta.
- RLS habilitado y **0 policies** en `ciclos_operativos`, `sesiones_ciclo`, `entregas_caja` — acceso solo vía RPC `SECURITY DEFINER`, tal como está documentado. Confirmado en vivo.
- Permisos base: 5 filas para `ciclos` y 5 para `entregas_caja` en `public.permisos`, coincide con 1 rol existente ("Dueño"). `crear_rol()` ya genera correctamente ambas secciones para roles nuevos (confirmado con `pg_get_functiondef`).
- `fin_plan` GENERATED: confirmado que `finalizar_ciclo_operativo` no la escribe.
- `revisar_entrega_caja` vigente exige motivo obligatorio en rechazo — confirmado en el código real.

---

## 6. Qué requiere una futura misión (no decidido ni ejecutado acá)

1. **M15 — completar versionado:** agregar `iniciar_ciclo_operativo` e `iniciar_validacion_ciclo_operativo` a `m15_ciclos_operativos.sql` (o a un archivo nuevo tipo `m15_1_completar_versionado.sql`) para que el repo sea fiel a producción.
2. **M16 — decidir destino de `registrar_conteo_entrega_caja`:** ¿DROP directo, o `REVOKE` primero y observar unos días antes de borrar? Requiere confirmar antes que ningún cliente FE la invoque.
3. **Hardening de grants pendiente:** evaluar `REVOKE EXECUTE ... FROM anon, PUBLIC` en las 10 funciones listadas en la sección 4, siguiendo el mismo patrón de M17.1.
4. **Actualizar Cerebro** para que refleje estos 2 gaps reales (no solo "implementado ✅").
5. UI de ciclos/entregas/cierre — sigue pendiente, sin cambios en este informe.

---

## 7. Qué NO debe tocarse

- `_validar_usuario_operacion` y su patrón de invocación en cada RPC.
- `fin_plan` como columna GENERATED.
- La lógica de "RECHAZADA no bloquea el cierre" en `obtener_pendientes_cierre_ciclo` / `finalizar_ciclo_operativo`.
- La arquitectura offline / `ejecutarOperacion()` / cola IndexedDB (fuera de alcance de esta auditoría).
- El único rol existente ("Dueño") y sus permisos actuales.

---

*Ninguna modificación fue aplicada a Supabase durante esta auditoría. Todas las consultas fueron `SELECT` puros contra catálogos del sistema (`pg_proc`, `pg_policies`, `supabase_migrations.schema_migrations`) y conteos de filas en tablas de aplicación.*
