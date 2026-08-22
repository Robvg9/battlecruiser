# BATTLECRUISER — M18 Unificación Turnos + Ciclos

Fecha: 2026-08-22

## Modelo definitivo

**Ciclo Operativo = período operativo administrativo.**

**Sesión Operativa = unidad real de trabajo dentro del período:**
- día;
- mañana/tarde;
- trabajador responsable;
- apertura real;
- cierre real;
- estado;
- observación.

Por tanto, el concepto humano que antes se repartía entre **Turnos + Ciclos** queda unificado como:

`PERÍODO OPERATIVO → SESIONES OPERATIVAS`

## Estado técnico

La migración `m18_unificacion_turnos_ciclos` fue aplicada en producción en el proyecto Supabase `battlecruiser`.

Cambios:
- `sesiones_ciclo` ahora contiene trabajador, apertura, cierre y observación.
- Se añadieron RPCs `listar_sesiones_operativas`, `iniciar_sesion_operativa`, `cerrar_sesion_operativa` y `obtener_operacion_unificada`.
- Los 2 turnos históricos existentes quedaron vinculados a sesiones.
- `turnos` NO fue eliminado: queda como legado de compatibilidad durante la transición.
- No se borraron datos ni se hizo una migración destructiva.

## Frontend

- Se mantiene la pestaña **Ciclos Operativos** como interfaz principal.
- La pestaña antigua **Turnos** queda oculta.
- Dentro del detalle de un ciclo se muestran las **Sesiones Operativas**.
- Una sesión PENDIENTE puede abrirse y una EN_CURSO puede cerrarse.
- El nuevo módulo se carga mediante `public/js/ciclos-unificacion.js`.
- Service Worker actualizado a v62.

## Compatibilidad

Durante esta fase no se eliminan referencias históricas a `turnos`, `turno_id`, cuadres ni entregas. La migración es aditiva para evitar romper ventas, cuadres, entregas, responsabilidades, incidencias o RPCs existentes.

La eliminación física del legado queda para una fase posterior, únicamente después de validar producción.

## Veredicto de implementación

**IMPLEMENTACIÓN: 95%**

La arquitectura, migración backend y UI de transición están realizadas. Falta únicamente la prueba funcional real en el dispositivo: crear/abrir/cerrar sesiones, verificar cuadres/entregas y comprobar que las operaciones históricas siguen correctamente vinculadas.
