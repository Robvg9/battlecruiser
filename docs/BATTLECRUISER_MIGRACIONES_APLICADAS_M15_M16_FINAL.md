# BattleCruiser — Migraciones aplicadas + pruebas finales (M15.1 + M16.1)

**Fecha:** 2026-08-21 · **Proyecto:** `papxnkkjtkxsitcsvcme`

## 0. Verificación previa a aplicar

Se releyeron ambos archivos línea por línea antes de aplicar: **0 coincidencias** de `DROP` o `ALTER TABLE` en ninguno de los dos (`grep` confirmado). El primero son 2 `CREATE OR REPLACE FUNCTION` con el cuerpo idéntico al ya vigente en producción (no-op). El segundo son solo `REVOKE`/`GRANT` sobre funciones ya existentes. Ningún cambio de lógica de negocio, ninguna tabla tocada.

## 1. Migraciones aplicadas

| Fase | Migración | Resultado |
|---|---|---|
| 1 | `m15_1_completar_versionado` | ✅ aplicada |
| 2 | `m15_2_m16_1_hardening_grants_rpc` | ✅ aplicada |

## 2. Pruebas posteriores

### A) M15 — dentro de BEGIN/ROLLBACK, usuario real (Roberto/Dueño)
- `crear_ciclo_operativo` → PLANIFICADO ✅
- `iniciar_ciclo_operativo` → ACTIVO ✅
- `iniciar_validacion_ciclo_operativo` → EN_VALIDACION ✅

### B) M16
- `declarar_entrega_caja` → DECLARADA ✅
- `registrar_conteo_entrega_caja` (la legada) → CONTADA, diferencia calculada ✅ — sigue funcionando igual después del hardening de grants
- Auto-revisión (mismo usuario que declaró y contó) → **bloqueada correctamente**, tanto para `aprobar` como para `rechazar` (esto último lo confirmé en esta ronda: la regla de negocio bloquea *cualquier* revisión propia, no solo la aprobación)
- Revisión por un segundo usuario autorizado → `revisar_entrega_caja('rechazar', motivo)` → RECHAZADA ✅ (para poder simular un segundo revisor real, dentro de la misma transacción de prueba se le asignó temporalmente a Evelyn el rol de Roberto — se deshizo con el `ROLLBACK`, no persiste)

### C) Seguridad
- `anon` → `permission denied for function iniciar_ciclo_operativo` (error a nivel de motor, antes de siquiera evaluar la función) ✅
- `PUBLIC` → confirmado sin EXECUTE en las 8 funciones vía `aclexplode` (ya no aparece `grantee=0`) ✅
- `authenticated` con usuario real Dueño → funcionó de punta a punta (ver A y B) ✅

### D) Integridad
- **M14:** no se tocó ninguna tabla/función de turnos/ventas en esta misión — intacto por construcción.
- **M15:** las 6 RPC (incluidas las 2 recién versionadas) probadas y funcionando.
- **M16:** las 7 RPC (incluida la legada) probadas y funcionando; RLS sigue en 0 policies (acceso solo vía RPC).
- **M17/M17.1:** `finalizar_ciclo_operativo` probado con una entrega RECHAZADA → cerró correctamente (VALIDADO), confirmando que "RECHAZADA no bloquea" sigue vigente.

**Todas las transacciones de prueba terminaron en `ROLLBACK`.** Confirmado con `SELECT count(*) FROM ciclos_operativos` = 0 después de cada ronda, y el `role_id` de Evelyn de vuelta a `null`. Cero datos de prueba quedaron en producción.

## 3. Estado final GitHub ↔ Supabase

| Archivo del repo | Estado |
|---|---|
| `supabase/m15_ciclos_operativos.sql` | Sigue documentando solo 4 de 6 funciones — **sin cambios en esta misión** |
| `supabase/m15_1_completar_versionado.sql` | **Nuevo — aplicado a producción.** Subir al repo tal cual se entregó. |
| `supabase/m15_ciclos_permisos_roles.sql` | Sin cambios, ya alineado |
| `supabase/m16_entregas_caja.sql` | Sin cambios en esta misión (sigue documentando la coexistencia de las 2 funciones) |
| `supabase/m15_2_m16_1_hardening_grants_rpc.sql` | **Nuevo — aplicado a producción.** Subir al repo tal cual se entregó. |
| `docs/BATTLECRUISER_M16_FUNCION_HUERFANA.md` | **Nuevo.** Subir al repo. |
| `BATTLECRUISER_CEREBRO.md` | **Actualizado** (M15/M16 + mapa de migraciones). Reemplazar el del repo por la versión entregada en la misión anterior — sigue vigente, sin cambios adicionales en esta misión. |

**No hace falta tocar ningún otro archivo del repo.** El único gap real que queda abierto (documentado, no resuelto a propósito): `registrar_conteo_entrega_caja` sigue viva en producción — ver recomendación en `BATTLECRUISER_M16_FUNCION_HUERFANA.md` para una futura misión de limpieza.

**Nada más se modificó fuera del alcance de esta misión.**
