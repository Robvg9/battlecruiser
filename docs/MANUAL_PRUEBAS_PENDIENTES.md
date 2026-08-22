# BattleCruiser — Checklist de pruebas manuales pendientes

Este documento es la lista maestra para cuando Roberto pida: **"¿qué queda pendiente de aprobación/pruebas?"**.

## M2 — Aprobaciones administrativas

### Gastos
- [ ] Crear gasto válido → aparece en Operaciones pendientes.
- [ ] Comprobar que un gasto PENDIENTE no descuenta caja.
- [ ] Aprobar gasto → pasa a APROBADO y genera una sola salida de caja.
- [ ] Rechazar gasto → exige motivo y no descuenta caja.
- [ ] Intentar aprobar dos veces → debe impedirse.
- [ ] Probar monto 0, negativo, vacío y texto inválido → rechazar.
- [ ] Probar concepto vacío/espacios → rechazar.
- [ ] Recargar antes de aprobar → la solicitud debe seguir pendiente.
- [ ] Comprobar usuario, fecha, hora, estado y comentario de revisión.

### Mermas
- [ ] Crear merma válida → queda PENDIENTE.
- [ ] Comprobar que el stock NO cambia al crearla.
- [ ] Aprobar → descuenta exactamente la cantidad aprobada.
- [ ] Rechazar → stock permanece intacto.
- [ ] Intentar cantidad mayor que stock → rechazar.
- [ ] Probar cantidad 0/negativa/vacía.
- [ ] Probar motivo vacío.
- [ ] Aprobar dos veces → debe impedirse doble descuento.
- [ ] Comprobar trazabilidad FIFO de la salida.

### Bajas
- [ ] Repetir todas las pruebas de merma para BAJA.
- [ ] Confirmar que baja y merma quedan diferenciadas en historial.

### Panel administrador
- [ ] Ver pendientes de gasto/merma/baja.
- [ ] Aprobar.
- [ ] Rechazar con motivo.
- [ ] Intentar rechazo sin motivo → debe impedirlo.
- [ ] Recargar → estados persisten.
- [ ] Comprobar quién aprobó/rechazó y cuándo.
- [ ] Confirmar que una operación resuelta desaparece de pendientes.

## M3 — Gastos / Mermas / Reinversiones

### Gastos
- [ ] Crear desde Operaciones → mensaje de pendiente.
- [ ] Verificar que no afecta caja antes de aprobación.
- [ ] Aprobar y verificar movimiento CAJA: GASTO / SALIDA.
- [ ] Verificar referencia única al gasto.
- [ ] Comprobar que aprobar repetidamente no duplica caja.
- [ ] Comprobar historial de movimientos de caja.

### Mermas / Bajas
- [ ] Crear → PENDIENTE.
- [ ] Verificar stock intacto mientras está pendiente.
- [ ] Aprobar → stock disminuye.
- [ ] Rechazar → stock intacto.
- [ ] Verificar FIFO.
- [ ] Verificar historial y datos de usuario/almacén/fecha/motivo.

### Reinversión
- [ ] Registrar 1 producto: 100 unidades por 700 CUP.
- [ ] Verificar stock +100.
- [ ] Verificar lote con costo unitario 7 CUP.
- [ ] Verificar caja -700 CUP.
- [ ] Verificar movimiento CAJA tipo REINVERSION / SALIDA.
- [ ] Verificar historial de reinversión.
- [ ] Registrar varias líneas → total de caja = suma de costos.
- [ ] Probar presentación comercial (ej. caja x24) → cantidad base correcta.
- [ ] Probar unidad base.
- [ ] Probar cantidad/costo inválidos.
- [ ] Probar producto inexistente.
- [ ] Probar almacén inexistente.
- [ ] Reintentar con la misma idempotency_key → no duplicar inventario ni caja.
- [ ] Recargar después de registrar → datos siguen correctos.

### Caja / integridad
- [ ] Gasto aprobado = una salida.
- [ ] Reinversión = una salida.
- [ ] Merma/baja = NO salida de caja.
- [ ] Merma/baja = salida de inventario solo al aprobar.
- [ ] Ninguna operación aprobada dos veces debe duplicar efectos.
- [ ] Historial debe permitir distinguir GASTO, REINVERSION y movimientos de inventario.

## Pruebas de borde generales

- [ ] Sin Internet al intentar operaciones que requieren aprobación/backend.
- [ ] Internet intermitente durante una operación.
- [ ] Recarga/cierre de app antes de resolver una pendiente.
- [ ] Dos clics rápidos sobre Registrar/Aprobar.
- [ ] Dos pestañas intentando aprobar la misma operación.
- [ ] Usuario sin permiso intentando crear/aprobar.
- [ ] Cambio de usuario → no mezclar datos ni pendientes.
- [ ] Confirmar que los datos reales de Supabase coinciden con lo mostrado.

**Regla:** no marcar una prueba como OK solo porque aparece un mensaje verde. Verificar siempre el efecto real en stock, caja, estado, historial y Supabase cuando corresponda.
