# M16 — Función huérfana: `registrar_conteo_entrega_caja`

**Fecha de investigación:** 2026-08-21
**Verificado contra:** producción real (`papxnkkjtkxsitcsvcme`), logs y `private.operaciones_idempotencia`.

## Origen

Creada por la primera migración de M16, `20260821165421_m16_entregas_caja_validacion`, como la RPC pensada para el paso DECLARADA → CONTADA del flujo de entregas de caja.

## Por qué existe (y por qué hay dos)

La segunda migración de M16, `20260821173254_m16_entregas_caja_completar`, creó una función distinta — `registrar_recepcion_entrega_caja` — que hace exactamente lo mismo (misma validación de estado, mismo cálculo de `diferencia`, misma transición a `CONTADA`) pero con el nombre y la firma que terminó adoptando el resto del diseño de M16 (permisos, nombres de parámetros). `CREATE OR REPLACE` no pudo "reemplazar" la primera porque tiene un nombre distinto — por eso **coexisten** dos funciones con la misma lógica en vez de una sola versionada.

## Cuál es la vigente

- **Vigente:** `registrar_recepcion_entrega_caja(uuid, numeric, text, uuid)` — es la que documenta el resto de M16 y la que debería llamar el frontend cuando exista.
- **Legado/huérfana:** `registrar_conteo_entrega_caja(uuid, numeric, text, uuid)` — sin uso.

## Evidencia de que no se usa

- `private.operaciones_idempotencia` (tabla real de idempotencia de todas las RPC del sistema) tiene **0 filas** con `tipo_operacion` igual a `registrar_conteo_entrega_caja` **y también 0 filas** para `registrar_recepcion_entrega_caja`. Esto es esperado: la UI de entregas de caja todavía no está construida (ver Cerebro, sección "UI ciclos/entregas/cierre: pendiente"), así que ninguna de las dos se llamó nunca en producción real.
- Los únicos 2 registros de `registrar_conteo_entrega_caja` en los logs de Postgres corresponden a los propios `CREATE OR REPLACE FUNCTION` de las migraciones (DDL), no a ejecuciones de la función.
- No hay ningún trigger, vista ni otra función en `public`/`private` que la invoque.

**Conclusión:** es código muerto real hoy, no solo "probablemente sin uso". El riesgo de tocarla es bajo porque ningún cliente depende de ella — pero como el frontend de M16 aún no existe, esto podría cambiar si alguien la cablea por error en vez de la vigente.

## Recomendación futura

1. Antes de una futura misión de limpieza: `grep`/buscar en el repo del frontend (`public/js/*.js`) cualquier referencia a `registrar_conteo_entrega_caja`, para confirmar que nadie la está apuntando en código no desplegado todavía.
2. Si no aparece ninguna referencia: `DROP FUNCTION public.registrar_conteo_entrega_caja(uuid, numeric, text, uuid);` en una migración propia, con su propio archivo versionado.
3. Hasta entonces: dejarla documentada (este archivo) y con los grants hardeneados igual que su par vigente (ver `m15_2_m16_1_hardening_grants_rpc.sql`), para que al menos no quede como el único cabo suelto de superficie pública dentro de M16.

**No se eliminó nada en esta misión.**
