# BATTLECRUISER — M18.1

## Estado
Implementación realizada en `main`.

## Cambios

- Ciclos Operativos pasa a una UX paso a paso:
  1. Ciclo actual por almacén.
  2. Detalle del ciclo.
  3. Sesiones.
  4. Sesión activa / trabajo.
  5. Cierre de sesión.
- Se oculta la entrada visual antigua de `Turnos`; no se eliminan tablas ni datos legacy.
- Se conserva la compatibilidad `turnos` ↔ `sesiones_ciclo` mediante los RPC existentes.
- Se reutilizan `listar_ciclos_operativos`, `crear_ciclo_operativo`, `iniciar_ciclo_operativo`, `iniciar_validacion_ciclo_operativo`, `finalizar_ciclo_operativo`, `listar_sesiones_operativas`, `iniciar_sesion_operativa` y `cerrar_sesion_operativa`.
- La autoridad para impedir ciclos simultáneamente activos por almacén quedó en PostgreSQL mediante índice único parcial sobre estados `ACTIVO` y `EN_VALIDACION`.
- Se detectaron 4 ciclos activos de prueba en `La Cueva`; se conservó el ciclo que ya tenía 2 turnos vinculados y se archivaron los otros 3 ciclos vacíos.
- Service Worker actualizado a `battlecruiser-shell-v63` y se añadió `m18-ciclos-ux.js` al shell.

## Regla de negocio

`1 almacén = máximo 1 ciclo ACTIVO/EN_VALIDACION`.

La comprobación posterior a la migración confirmó exactamente 1 ciclo activo para el almacén que tenía duplicados.

## No realizado

- No se eliminaron tablas `turnos` ni `ciclos_operativos`.
- No se eliminaron registros históricos.
- No se modificaron ventas, compras, inventario ni cola offline.

## Prueba

Pendiente de prueba manual en Android/PWA y de validar el flujo completo con datos reales de operación.
