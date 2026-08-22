# BattleCruiser — CHECKLIST MAESTRO M2–M6

Este archivo consolida las pruebas manuales de las misiones 2 a 6. No sustituye los checklists específicos.

## M2 — Aprobaciones
- [ ] Gasto pendiente aparece en Centro de Control.
- [ ] Aprobar gasto.
- [ ] Rechazar gasto con motivo obligatorio.
- [ ] Modificar monto real antes de aprobar.
- [ ] Merma pendiente aparece.
- [ ] Aprobar merma con cantidad corregida.
- [ ] Rechazar merma.
- [ ] Bajar pendiente aparece.
- [ ] Aprobar/rechazar baja.
- [ ] Entrega de caja pendiente y cuadre con diferencia.
- [ ] Registrar quién aprobó, fecha, hora y diferencia.
- [ ] Comprobar que una operación aprobada no se edita.

## M3 — Gastos / Mermas / Reinversiones
- [ ] Gasto aprobado reduce caja una sola vez.
- [ ] Gasto pendiente no modifica caja.
- [ ] Merma/baja aprobada reduce stock y no caja.
- [ ] Merma/baja pendiente no reduce stock.
- [ ] Reinversión: producto + costo total + costo unitario + caja.
- [ ] Ejemplo 100 unidades / 700 CUP → 7 CUP por unidad.
- [ ] Idempotencia: repetir misma operación no duplica stock/caja.
- [ ] Operación inválida no entra a cola offline.

## M4 — Productos
- [ ] Producto sin presentación bloqueado.
- [ ] Minorista factor 1.
- [ ] Mayorista con factor válido.
- [ ] Caja x24: 10 cajas = 240 unidades.
- [ ] Costo por presentación correcto.
- [ ] Venta/movimiento por caja y por unidad.
- [ ] Buscar, categoría y estado combinados.
- [ ] Activar/desactivar.
- [ ] Editar sin duplicar.
- [ ] Nomenclatura solo dentro de Productos.
- [ ] Online/offline y recarga.

## M5 — Historiales
- [ ] Fecha, hora, usuario, almacén, tipo, resumen y estado.
- [ ] Detalle completo de venta.
- [ ] Detalle completo de compra.
- [ ] Detalle completo de movimiento interno.
- [ ] Proveedor y costos.
- [ ] Origen/destino.
- [ ] Filtros/paginación no mezclan registros.
- [ ] Abrir/cerrar varios detalles.
- [ ] Registros con campos opcionales vacíos.

## M6 — Usuarios/Permisos
- [ ] Crear usuario.
- [ ] Admin conserva sesión.
- [ ] Asignar/cambiar rol.
- [ ] Activar/desactivar usuario.
- [ ] Proteger único Dueño.
- [ ] Usuario inactivo no opera.
- [ ] Crear/editar rol.
- [ ] Ver/crear/editar/borrar por módulo.
- [ ] Backend rechaza operación sin permiso aunque se fuerce la UI.
- [ ] Logout/login no mezcla permisos.
- [ ] Reconexión recarga permisos.
- [ ] Cambios de rol/estado auditados.

## Regla de revisión
Cada prueba debe marcarse PASS/FAIL y anotar: usuario, módulo, operación, datos usados, resultado esperado, resultado real y evidencia/captura si hubo error.
