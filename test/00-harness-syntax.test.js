const test = require("node:test");
const assert = require("node:assert");
const vm = require("node:vm");
const { leerAppJsConcatenado, MODULOS_APP } = require("./_leer-app-js");

test("harness: production base module graph is readable and syntactically valid", () => {
  const baseDir = __dirname;
  assert.ok(Array.isArray(MODULOS_APP) && MODULOS_APP.length >= 19, `módulos base inesperados: ${MODULOS_APP.length}`);
  const source = leerAppJsConcatenado(baseDir);
  assert.ok(source.length > 10000, "el harness debe cargar el código de producción");
  assert.doesNotThrow(() => new vm.Script(source, { filename: "battlecruiser-harness.js" }));
});
