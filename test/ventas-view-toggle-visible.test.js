"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const HTML = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const CSS = fs.readFileSync(path.join(__dirname, "..", "public", "style.css"), "utf8");

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = CSS.match(new RegExp(escaped + "\\s*\\{([^}]*)\\}"));
  assert.ok(match, "missing CSS rule: " + selector);
  return match[1];
}

test("Paso 4 Ventas: Buscador/Catálogo tienen hitbox visible, estado activo y foco accesible", () => {
  assert.match(HTML, /<div class="venta-vista-toggle" role="tablist" aria-label="Modo de venta">/);
  assert.match(HTML, /id="venta-vista-btn-buscador" class="venta-vista-btn activo" role="tab" aria-pressed="true"/);
  assert.match(HTML, /id="venta-vista-btn-catalogo" class="venta-vista-btn" role="tab" aria-pressed="false"/);

  const wrapper = cssRule(".venta-vista-toggle");
  assert.match(wrapper, /display:\\s*flex/);
  assert.match(wrapper, /flex-wrap:\\s*wrap/);
  assert.match(wrapper, /gap:\\s*8px/);

  const button = cssRule(".venta-vista-btn");
  assert.match(button, /display:\\s*inline-flex/);
  assert.match(button, /min-height:\\s*44px/);
  assert.match(button, /min-width:\\s*120px/);
  assert.match(button, /border:\\s*1px solid var\\(--gold-dim\\)/);
  assert.match(button, /background:\\s*var\\(--stone-2\\)/);

  const active = cssRule(".venta-vista-btn.activo");
  assert.match(active, /border-color:\\s*var\\(--gold\\)/);
  assert.match(active, /color:\\s*var\\(--gold-bright\\)/);

  const focus = cssRule(".venta-vista-btn:focus-visible");
  assert.match(focus, /outline:\\s*2px solid var\\(--gold-bright\\)/);
});
