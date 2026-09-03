# BattleCruiser — Sesión 9/21
## Plan de migración M21 → modelo Turno moderno

Fecha: 2026-09-03

## Hallazgo

La UX visible "Turnos" sigue implementada en `public/js/m18-ciclos-ux.js` (M21), pero sus operaciones principales usan RPCs del modelo legacy:

- `listar_ciclos_operativos`
- `crear_ciclo_operativo`
- `iniciar_ciclo_operativo`
- `listar_sesiones_operativas`
- `declarar_entrega_caja`
- `registrar_recepcion_entrega_caja`
- `declarar_entrega_inventario_turno`
- `aceptar_entrega_inventario_turno`
- `obtener_cuadre_turno_general`

El modelo moderno usa otra granularidad:

- `bc_crear_turno`
- `turno_sesiones`
- `turno_asignaciones`
- `bc_iniciar_turno_sesion` / `bc_iniciar_turno_sesion_secuencial`
- `bc_cerrar_turno_sesion`
- `bc_declarar_dinero`
- `bc_enviar_turno_a_aprobacion`

## Por qué no se debe hacer un reemplazo directo

M21 trata el "turno" como un período con sesiones internas y todavía conserva el concepto administrativo legacy de ciclo. El moderno separa explícitamente el maestro `turnos` de sus `turno_sesiones` y transiciones de estado.

Un reemplazo mecánico de:

`crear_ciclo_operativo` → `bc_crear_turno`

no es suficiente porque el flujo posterior de M21 espera iniciar/cerrar operaciones con semántica de ciclo, mientras el moderno exige trabajar sesión por sesión.

## Estado LIVE

- 27 filas en `turnos`
- 17 turnos modernos (`dias_turno IS NOT NULL`)
- 10 turnos puente legacy (`dias_turno IS NULL AND ciclo_id IS NOT NULL`)
- 150 `turno_sesiones`
- 2 `ciclos_operativos`
- 16 `sesiones_ciclo`

## Ruta segura

### Fase A — migración de lectura

Hacer que el listado visible de M21 consuma `bc_listar_turnos_maestros_home` para los turnos modernos, manteniendo un bloque separado de compatibilidad para históricos legacy.

No mezclar resultados sin una clasificación explícita (`moderno` vs `legacy`).

### Fase B — creación moderna

Migrar "crear turno" a `bc_crear_turno`, generando las sesiones modernas desde backend. La UI debe conocer que la asignación de trabajadores ocurre sobre `turno_sesiones`.

### Fase C — apertura de sesión

Migrar el concepto de "Iniciar turno" a "Iniciar sesión" y usar `bc_iniciar_turno_sesion_secuencial` para respetar la secuencia mañana/tarde y las restricciones de fecha.

### Fase D — dinero/inventario/cierre

Conectar M21 con:
- `bc_declarar_dinero`
- `bc_cerrar_turno_sesion`
- recepción moderna de inventario
- `bc_enviar_turno_a_aprobacion`

### Fase E — congelación legacy

Cuando M21 ya no escriba `ciclos_operativos`/`sesiones_ciclo`, congelar las RPC legacy de escritura y conservar únicamente compatibilidad histórica.

## Regla

No eliminar tablas legacy ni revocar RPCs legacy mientras el frontend operativo siga dependiendo de ellas.

## Resultado de Sesión 9

No se realizaron cambios de producción ni refactors parciales que puedan producir un estado híbrido peor. La arquitectura de migración quedó especificada; la siguiente modificación debe empezar por la **lectura moderna del listado**, no por el cierre/eliminación del legacy.
