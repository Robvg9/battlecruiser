# BattleCruiser — M22 Productos + Nomenclatura

## 1. Pantalla principal
- [ ] Productos muestra solo buscador, filtros, lista y `Agregar producto`.
- [ ] No aparecen categorías, unidades ni presentaciones como bloques independientes en la pantalla principal.
- [ ] `Nomenclatura y catálogos` abre exclusivamente desde Productos.
- [ ] Cerrar nomenclatura devuelve la interfaz sin duplicar bloques.

## 2. Catálogos
- [ ] Crear categoría.
- [ ] Crear unidad.
- [ ] Crear presentación comercial.
- [ ] Desactivar/activar cada catálogo.
- [ ] Intentar crear duplicado y comprobar rechazo.
- [ ] Comprobar que los catálogos no aparecen en Ventas, Inventario, Compras ni Centro de Control.

## 3. Producto minorista
- [ ] Intentar crear producto sin presentación: debe bloquearse.
- [ ] Crear producto con presentación minorista factor 1.
- [ ] Confirmar que queda asociado a `producto_presentaciones`.

## 4. Producto mayorista
- [ ] Activar mayorista.
- [ ] Intentar guardar sin presentación mayorista: debe bloquearse.
- [ ] Intentar factor 1: debe bloquearse.
- [ ] Crear, por ejemplo, Caja x24 con factor 24.
- [ ] Confirmar asociación minorista + mayorista.

## 5. Compra / conversión
- [ ] Comprar 10 cajas x24.
- [ ] Confirmar entrada de 240 unidades base.
- [ ] Confirmar costo total y costo unitario coherentes con la presentación.
- [ ] Vender/mover por caja y comprobar conversión a unidades base.
- [ ] Vender/mover por unidad y comprobar que no altera incorrectamente el factor.

## 6. Filtros
- [ ] Buscar por nombre.
- [ ] Filtrar por categoría.
- [ ] Filtrar activos.
- [ ] Filtrar inactivos.
- [ ] Combinar búsqueda + categoría + estado.
- [ ] Limpiar filtros y recuperar todos los productos.

## 7. Edición y estado
- [ ] Editar producto existente.
- [ ] Cancelar edición.
- [ ] Activar/desactivar producto.
- [ ] Confirmar que edición no crea un producto duplicado.
- [ ] Confirmar que las presentaciones existentes no se pierden.

## 8. Integridad / regresión
- [ ] Recargar página.
- [ ] Cerrar y volver a abrir sesión.
- [ ] Probar online.
- [ ] Confirmar comportamiento offline: no crear producto sin conexión si requiere guardar sus presentaciones obligatorias.
- [ ] Confirmar que Ventas, Compras e Inventario siguen funcionando.
- [ ] Confirmar que el cache se actualiza a v76.
