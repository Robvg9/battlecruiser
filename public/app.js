// ==== Battlecruiser · app.js ====
// Misión de modularización: este archivo dejó de contener la lógica de la
// aplicación. Todo el código que antes vivía acá ahora está dividido en
// módulos dentro de public/js/ (ver lista y orden de carga en index.html).
//
// Los módulos se cargan como <script> clásicos (no ES modules), en el mismo
// orden en que las secciones aparecían originalmente en este archivo, y
// comparten el mismo scope global — por eso siguen pudiendo llamarse entre
// sí exactamente igual que antes (ej.: ejecutarOperacion, sincronizarCola,
// tienePermiso, refrescarProductos, etc. siguen siendo funciones globales
// normales, sólo que ahora están agrupadas por tema en su propio archivo).
//
// Este archivo se deja como último <script> por si en el futuro se necesita
// un punto de entrada real (por ejemplo, una función de arranque explícita);
// por ahora no hace falta ninguna línea de código acá porque cada módulo se
// auto-inicializa igual que antes (safeInit(...) al cargarse cada script).
//
// Módulos (en orden de carga):
//   js/core.js               - utilidades genéricas
//   js/auth.js                - login/logout/sesión/ajustes de cuenta
//   js/offline.js             - IndexedDB, cola offline, ejecutarOperacion, sincronizarCola
//   js/centro-control.js      - lecturas + Centro de Control
//   js/navegacion.js          - tabs + menú lateral
//   js/productos.js           - categorías, almacenes (carga), productos, compra
//   js/presentaciones.js      - presentaciones comerciales
//   js/almacenes.js           - gestión de almacenes
//   js/transferencias.js      - transferencias entre almacenes
//   js/vales.js                - vales de salida
//   js/ventas.js               - catálogo, carrito, ventas, historial
//   js/catalogos.js            - categorías/unidades (catálogos simples)
//   js/usuarios-permisos.js    - B3: usuarios, roles, permisos
//   js/mando.js                 - B4: Centro de Mando + auditoría
//   js/reportes.js              - B5: reportes y análisis
//   js/nucleo-operativo.js      - B6: inventario + movimientos
//   js/operacion-humana.js      - B7: turnos, cuadres, responsabilidades, incidencias
//   js/comunicacion.js          - B8: conversaciones y mensajes
