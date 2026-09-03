# BattleCruiser — Sesión 12/21
## Revisión administrativa: eliminar consulta híbrida en `openRevision()`

Fecha: 2026-09-03

## Hallazgo

`public/js/turnos-maestro.js` ya usa el contrato moderno para el expediente y las acciones de Turnos, pero `openRevision()` todavía llama:

`API.listarTurnos({ estado: 'PENDIENTE_APROBACION', limit: 50 })`

`API.listarTurnos()` apunta al RPC legacy/híbrido `listar_turnos`.

## Evidencia backend

`listar_turnos` consulta `public.turnos` y permite coincidir por `t.estado` **o** `t.estado_maestro`. Además no restringe el resultado a `dias_turno IS NOT NULL` ni a `ciclo_id/sesion_id IS NULL`.

Esto permite que la pantalla de revisión moderna reciba potencialmente registros legacy o puenteados si cumplen la condición de estado.

## Ruta moderna disponible

`bc_listar_turnos_maestros_home` ya limita explícitamente el resultado a Turnos modernos:

- `ciclo_id IS NULL`
- `sesion_id IS NULL`
- `dias_turno IS NOT NULL`

Y aplica la visibilidad administrativa/por creador/asignación.

## Corrección recomendada

Cambiar únicamente `openRevision()` para:

1. llamar `API.listarTurnosMaestros({ limit: 100 })`;
2. filtrar en frontend `estado_maestro === 'PENDIENTE_APROBACION'`;
3. mantener el resto de la función sin cambios.

No modificar `API.listarTurnos()`: sigue siendo necesario para otros flujos legacy/compatibilidad.

## No se modificó código en esta sesión

Se priorizó preservar el archivo `turnos-maestro.js` completo y evitar un reemplazo mecánico de un archivo grande sin una edición de contenido integral verificable.

El hallazgo queda listo para una micro-modificación aislada con prueba de contrato.
