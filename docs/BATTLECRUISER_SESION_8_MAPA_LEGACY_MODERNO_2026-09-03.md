# BattleCruiser — Sesión 8/21
## Mapa forense Legacy ↔ Moderno

Fecha: 2026-09-03
Proyecto Supabase: `papxnkkjtkxsitcsvcme`
Repositorio: `Robvg9/battlecruiser`

## Hallazgo principal

La UI visible de Turnos sigue operando sobre RPCs del modelo legacy aunque el backend moderno ya existe.

`public/js/m18-ciclos-ux.js` (M21) usa como flujo principal:
- `listar_ciclos_operativos`
- `crear_ciclo_operativo`
- `iniciar_ciclo_operativo`
- `listar_sesiones_operativas`
- `declarar_entrega_caja`
- `registrar_recepcion_entrega_caja`
- `declarar_entrega_inventario_turno`
- `aceptar_entrega_inventario_turno`
- `obtener_cuadre_turno_general`

Por tanto, "Turnos" es actualmente una UX moderna sobre una capa backend legacy/puente.

## Inventario de datos LIVE

- `turnos`: 27
- `turno_sesiones`: 150
- `turno_tramos`: 2
- `ciclos_operativos`: 2
- `sesiones_ciclo`: 16

Clasificación de `turnos`:
- 17 modernos (`dias_turno IS NOT NULL`)
- 10 legacy puenteados (`dias_turno IS NULL AND ciclo_id IS NOT NULL`)

## Estados inconsistentes

`ABIERTO / EN_CURSO` en `turnos.estado / estado_maestro` es actualmente una combinación intencional del modelo híbrido: las RPC modernas escriben `estado='ABIERTO'` y `estado_maestro='EN_CURSO'`.

`CERRADO / EN_CURSO` sí es una inconsistencia histórica del puente legacy. El registro observado tenía sesión legacy `COMPLETADA` y cierre real registrado, mientras `estado_maestro` quedó sin actualizar.

## Riesgo actual

Hay numerosas RPC legacy todavía ejecutables por `authenticated`, y varias participan en operaciones reales. Por eso no se debe:

1. eliminar tablas legacy;
2. revocar indiscriminadamente todas las RPC legacy;
3. "normalizar" estados históricos mediante UPDATE masivo.

Cualquiera de esas acciones podría romper operaciones históricas o el flujo visible actual.

## Estrategia recomendada

1. Migrar M21 de lectura/escritura legacy a `BattleCruiserTurnoAPI` + RPC modernas por etapas.
2. Mantener legacy como lectura/compatibilidad histórica durante la transición.
3. Añadir pruebas de contrato para cada paso migrado.
4. Cuando el frontend ya no dependa de legacy, congelar sus RPC de escritura y dejar solo compatibilidad de lectura/consulta histórica.
5. Solo después evaluar archivado o eliminación física.

## No-modificación

Esta sesión fue de diagnóstico. No se modificaron datos de producción ni se alteró el esquema Supabase.

## Fuentes técnicas

- `public/js/m18-ciclos-ux.js` M21: flujo visible de Turnos sobre RPCs legacy.
- `docs/BATTLECRUISER_M18_UNIFICACION_TURNOS_CICLOS.md`: define `turnos` como legado de compatibilidad durante transición.
- Inspección LIVE de funciones públicas y tablas realizada durante Sesión 8/21.
