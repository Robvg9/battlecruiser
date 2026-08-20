use strict;
const fs = require("fs");
const path = require("path");

// Módulos de public/js/, en el mismo orden en que vivían las secciones
// dentro del app.js monolítico original (Misión de modularización de
// public/app.js). La concatenación de estos archivos, en este orden, es
// equivalente en comportamiento al app.js anterior a la modularización.
const MODULOS_APP = [
  "core.js",
  "auth.js",
  "offline.js",
  "centro-control.js",
  "navegacion.js",
  "productos.js",
  "presentaciones.js",
  "almacenes.js",
  "transferencias.js",
  "vales.js",
  "ventas.js",
  "catalogos.js",
  "usuarios-permisos.js",
  "mando.js",
  "reportes.js",
  "nucleo-operativo.js",
  "operacion-humana.js",
  "comunicacion.js",
];

// Devuelve el código completo de la app reconstruido a partir de los
// módulos de public/js/. baseDir es el __dirname del test que llama
// (se resuelve "<baseDir>/../public/js/<modulo>"), igual que antes se
// resolvía "<baseDir>/../public/app.js".
function leerAppJsConcatenado(baseDir) {
  return MODULOS_APP
    .map((nombre) => fs.readFileSync(path.join(baseDir, "..", "public", "js", nombre), "utf8"))
    .join("\n");
}

module.exports = { leerAppJsConcatenado, MODULOS_APP };
