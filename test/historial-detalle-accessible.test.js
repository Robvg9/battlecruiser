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
  assert.equal(accessibleName.includes("\n"), false, "row summaries normalize whitespace");

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


test("report detail modal omits technical IDs and locks the underlying page", async () => {
  const dom = new JSDOM(\`<!doctype html><html><head></head><body>
    <div id="rep-detalle"><div class="rep-fila">Venta visible</div></div>
  </body></html>\`, { runScripts: "dangerously", url: "https://app.test/" });
  const { window } = dom;
  window.safeInit = (_name, initialize) => initialize();
  window.leerFiltrosReportes = () => ({ desde: "2026-08-25", hasta: "2026-08-25", almacen: null });
  window._repSubreporte = "ventas";
  window._repPagina = 0;
  window._REP_POR_PAG = 25;
  window.money = value => Number(value).toFixed(2);
  window.escHtml = value => String(value).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  window.fechaHoraCompleta = () => "25/08/2026, 11:17";
  window.client = { rpc: async () => ({ error: null, data: [{
    id: "5be85ed4-c025-4342-8606-babef0c72019", fecha: "2026-08-25T15:17:00.000Z",
    almacen_id: "cfe08894-a7e0-47bd-8e85-e6ebb218a6f4", almacen: "TuMejor Opción", total: 1300,
    lineas: [{ producto: "Cerveza Bucanero", cantidad: 2, precio_unitario: 650, subtotal: 1300 }]
  }] }) };
  const script = window.document.createElement("script");
  script.textContent = fs.readFileSync(path.join(__dirname, "..", "public", "js", "historial-detalle.js"), "utf8");
  window.document.body.appendChild(script);
  window.document.querySelector(".rep-fila").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => window.setTimeout(resolve, 0));
  const modal = window.document.getElementById("historial-detalle-modal");
  assert.ok(modal && !modal.classList.contains("hidden"), "record opens in modal");
  assert.equal(modal.querySelector("h2").textContent, "Venta", "heading has no UUID");
  const content = modal.querySelector(".historial-detalle-body").textContent;
  assert.match(content, /TuMejor Opción/);
  assert.match(content, /Cerveza Bucanero/);
  assert.doesNotMatch(content, /5be85ed4|cfe08894|almacen_id|Referencia/);
  assert.ok(window.document.body.classList.contains("historial-detalle-abierto"));
  assert.ok(window.document.documentElement.classList.contains("historial-detalle-abierto"));
  modal.querySelector(".historial-detalle-close").click();
  assert.ok(modal.classList.contains("hidden"));
  assert.ok(!window.document.body.classList.contains("historial-detalle-abierto"));
  dom.window.close();
});
