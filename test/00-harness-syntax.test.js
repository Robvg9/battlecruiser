const test = require("node:test");
const assert = require("node:assert");
const vm = require("node:vm");
const { leerAppJsConcatenado, obtenerModulosProduccion } = require("./_leer-app-js");

test("harness: production module graph is readable and syntactically valid as concatenated test source", () => {
  const baseDir = __dirname;
  const modules = obtenerModulosProduccion(baseDir);
  assert.ok(modules.length >= 20, `se esperaban módulos de producción, encontrados: ${modules.length}`);
  const source = leerAppJsConcatenado(baseDir);
  assert.ok(source.length > 10000, "el harness debe cargar el código de producción");
  assert.doesNotThrow(() => new vm.Script(source, { filename: "battlecruiser-harness.js" }));
});
