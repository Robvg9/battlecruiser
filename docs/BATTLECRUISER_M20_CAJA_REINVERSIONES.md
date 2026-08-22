# BATTLECRUISER — M20 Caja + Reinversiones

**Fecha:** 2026-08-22
**Estado:** implementado en producción + frontend

## Modelo

- **Baja/Merma:** una sola operación funcional de salida de producto; `baja` y `merma` son categorías de la misma salida.
- **Gasto:** salida de dinero sin mercancía recibida; permanece pendiente hasta aprobación administrativa.
- **Reinversión:** salida de dinero + entrada de mercancía en una sola transacción. El costo unitario se calcula como `costo_total / cantidad_base`.
- **Compra:** continúa siendo la entrada de mercancía comprada; no se convierte automáticamente en gasto.

## Backend

- `reinversiones`
- `reinversiones_lineas`
- `movimientos_caja`
- `registrar_reinversion_multiple`
- `listar_reinversiones`
- `listar_movimientos_caja`
- `calcular_dinero_esperado_turno` ahora descuenta salidas de caja registradas.
- Aprobación de `gasto` crea atómicamente el movimiento de caja.
- `crear_gasto` asocia automáticamente el turno abierto del usuario cuando existe.
- `lotes_compra.origen` admite `reinversion`.

## Frontend

`public/js/operaciones-financieras.js` añade en Operación:

- Salida de producto — Baja/Merma.
- Reinversión múltiple.
- Presentaciones comerciales por producto.
- Mensaje de resultado.

El Service Worker fue actualizado a **v72** y el módulo quedó incluido en `SHELL_FILES`.

## Verificación realizada

- Tablas y funciones M20 existen en producción.
- Reinversión de prueba transaccional: 1 Caja Mayabe → 24 unidades → costo unitario 10 → caja -240; prueba revertida con `ROLLBACK`.
- Gasto de prueba aprobado transaccionalmente: creación + aprobación + movimiento de caja; prueba revertida con `ROLLBACK`.
- No se dejó ningún dato de prueba en producción.

**Prueba real de UI pendiente: Roberto debe entrar a Operación y probar las tres interacciones con datos de prueba reales de la aplicación.**
