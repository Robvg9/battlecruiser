# BattleCruiser — M23 Historiales Premium

## Historial general
- [ ] Abrir Reportes y comprobar tarjetas/resumen sin romper el reporte.
- [ ] Cambiar entre Ventas, Compras, Movimiento interno y demás subreportes.
- [ ] Filtrar por fecha desde/hasta.
- [ ] Filtrar por almacén.
- [ ] Cambiar de página y comprobar que los detalles corresponden a la fila visible.

## Ventas
- [ ] Cada fila muestra fecha/hora, almacén, tipo/resumen y total.
- [ ] Tocar una fila abre detalle completo.
- [ ] Detalle muestra usuario, estado, almacén, total y líneas.
- [ ] Líneas muestran producto, cantidad, precio y subtotal.
- [ ] Cerrar detalle y abrir otra fila.
- [ ] Usar teclado Enter/Espacio si aplica.

## Compras
- [ ] Fila muestra fecha, almacén, producto, cantidad, costo y estado.
- [ ] Detalle muestra proveedor cuando existe.
- [ ] Detalle muestra usuario, costo unitario, costo total y cantidades.
- [ ] Comprobar disponible/parcial/agotado.

## Movimiento interno
- [ ] Comprobar origen → destino.
- [ ] Comprobar usuario, fecha y estado.
- [ ] Detalle muestra productos y cantidades.
- [ ] Comprobar que no se confunde transferencia con venta.

## Regresión
- [ ] Un registro sin detalle no rompe el modal.
- [ ] Error RPC muestra fallback de detalle existente.
- [ ] Usuario sin nombre no rompe la vista.
- [ ] Sin conexión: reportes siguen mostrando el mensaje correspondiente; no se inventan datos.
- [ ] Recargar aplicación y confirmar cache v77.
- [ ] Confirmar que Ventas, Compras, Inventario y Centro de Control siguen funcionando.

## Limitación auditada
Las tablas `ventas_lineas` y `transferencias_lineas` actualmente guardan cantidad/precio pero no un `presentacion_id`; por tanto M23 no inventa una presentación comercial que el dato histórico no conserva. La vista muestra la cantidad registrada y solo muestra presentación cuando el backend la tiene disponible.
