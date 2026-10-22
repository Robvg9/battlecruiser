const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

test("report rows expose a concise visible summary in their accessible name", () => {
  const dom = new JSDOM(`<!doctype html>
    <html><head></head><body>
      <div id="rep-detalle">
        <div class="rep-fila">
          <span class="rep-fila-principal">
            <span class="cc-asunto-tipo">Almacén La Cueva</span>
            <span class="muted">22/10/2026 · Total $1,250.00</span>
            <span class="muted rep-linea">Café · 2 u · $625.00 = $1,250.00</span>
          </span>
        </div>
        <div class="rep-fila"></div>
        <div class="rep-fila"><span>${"Dato de fila ".repeat(80)}</span></div>
      </div>
    </body></html>`, {
    runScripts: "dangerously",
    url: "https://app.test/",
  });

  const { window } = dom;
  window.safeInit = (_name, initialize) => initialize();

  const script = window.document.createElement("script");
  script.textContent = fs.readFileSync(
    path.join(__dirname, "..", "public", "js", "historial-detalle.js"),
    "utf8"
  );
  window.document.body.appendChild(script);

  const [row, emptyRow, longRow] = window.document.querySelectorAll("#rep-detalle .rep-fila");
  const accessibleName = row.getAttribute("aria-label");

  assert.equal(row.getAttribute("role"), "button");
  assert.equal(row.getAttribute("tabindex"), "0");
  assert.match(accessibleName, /^Abrir detalle del registro:/);
  assert.match(accessibleName, /Almacén La Cueva/);
  assert.match(accessibleName, /22\/10\/2026/);
  assert.match(accessibleName, /Total \$1,250\.00/);
  assert.match(accessibleName, /Café/);

  assert.equal(
    emptyRow.getAttribute("aria-label"),
    "Abrir detalle del registro",
    "empty rows retain a safe fallback label"
  );

  assert.equal(
    longRow.getAttribute("aria-label").length,
    420,
    "accessible names stay bounded for the mobile accessibility tree"
  );

  dom.window.close();
});
