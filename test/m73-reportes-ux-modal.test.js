const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

test("M73 reportes: siete días por defecto, ranking agregado y modales sin scroll de fondo", async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <section id="tab-reportes" class="tab-panel">
      <div class="pendientes-header"><h3>Reportes</h3><span id="reportes-conn-info"></span></div>
      <div class="bc-m42-metrics"></div>
      <div class="bc-m42-analysis">
        <div id="bc-m42-top-products"></div><span id="bc-m42-top-note"></span>
        <button type="button" id="bc-m42-open-details">Ver todos</button>
      </div>
      <section class="bc-m45-quick">
        <button class="bc-m45-quick-btn" data-rep="ventas">Ventas</button>
        <button class="bc-m45-quick-btn" data-rep="compras">Compras</button>
        <button class="bc-m45-quick-btn" data-rep="rentabilidad">Rentabilidad</button>
        <button class="bc-m45-quick-btn" data-rep="transferencias">Transferencias</button>
        <button class="bc-m45-quick-btn" data-rep="vales">Vales</button>
        <button class="bc-m45-quick-btn" data-rep="stock">Stock</button>
        <button class="bc-m45-quick-btn" data-rep="movimiento">Movimiento</button>
      </section>
      <div class="bc-m42-detail"><summary>Información detallada</summary><div class="bc-m42-detail-body">
        <div class="bc-m42-filters" id="reportes-filtros">
          <label>Desde<input type="date" id="rep-filtro-desde"></label>
          <label>Hasta<input type="date" id="rep-filtro-hasta"></label>
          <select id="rep-filtro-almacen"><option value="">Todos los almacenes</option></select>
          <button type="button" id="rep-aplicar-btn">Generar reporte</button>
          <button type="button" id="rep-limpiar-btn">Limpiar</button>
        </div>
        <div class="cc-bloque"><h3>Reportes detallados</h3>
          <div class="rep-tabs">
            <button class="rep-tab-btn active" data-rep="ventas">Ventas</button>
            <button class="rep-tab-btn" data-rep="compras">Compras</button>
            <button class="rep-tab-btn" data-rep="rentabilidad">Rentabilidad</button>
            <button class="rep-tab-btn" data-rep="transferencias">Transferencias</button>
            <button class="rep-tab-btn" data-rep="vales">Vales</button>
            <button class="rep-tab-btn" data-rep="stock">Stock</button>
            <button class="rep-tab-btn" data-rep="movimiento">Movimiento</button>
          </div>
          <div id="rep-detalle" class="lista"></div><div id="rep-paginacion"></div>
        </div>
      </div></div>
    </section></body></html>`, { runScripts: "dangerously", url: "https://app.test/" });
  const { window } = dom;
  const calls = [];
  window.money = value => Number(value || 0).toFixed(2);
  window.refrescarSubReporte = async () => {};
  window.refrescarReportes = async () => {};
  window.leerFiltrosReportes = () => ({
    desde: window.document.getElementById("rep-filtro-desde").value || null,
    hasta: window.document.getElementById("rep-filtro-hasta").value || null,
    almacen: window.document.getElementById("rep-filtro-almacen").value || null
  });
  window.client = { rpc: async (name, params) => {
    calls.push({ name, params });
    return { error: null, data: [
      { producto: "Cerveza Bucanero", unidades: 12, ingresos: 7800, ventas: 8, ganancia_conocida: 2100, lineas_con_costo: 7, lineas_sin_costo: 1 },
      { producto: "Masareal", unidades: 2, ingresos: 400, ventas: 2, ganancia_conocida: null, lineas_con_costo: 0, lineas_sin_costo: 2 }
    ] };
  } };
  const selectedTabs = [];
  window.document.querySelectorAll(".rep-tab-btn").forEach(button => {
    button.addEventListener("click", () => {
      selectedTabs.push(button.dataset.rep);
      window.document.querySelectorAll(".rep-tab-btn").forEach(other => {
        other.classList.toggle("active", other === button);
      });
    });
  });
  const script = window.document.createElement("script");
  script.textContent = fs.readFileSync(path.join(__dirname, "..", "public", "js", "m73-reportes-ux-modal.js"), "utf8");
  window.document.body.appendChild(script);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  await new Promise(resolve => window.setTimeout(resolve, 60));

  const preset = window.document.getElementById("rep-filtro-periodo");
  assert.ok(preset, "period selector is installed");
  assert.equal(preset.value, "7", "seven days is the default");
  const from = window.document.getElementById("rep-filtro-desde").value;
  const to = window.document.getElementById("rep-filtro-hasta").value;
  assert.ok(from && to, "default date bounds are populated");
  assert.equal((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 86400000, 6, "seven inclusive dates");
  const modal = window.document.getElementById("bc-m73-report-modal");
  assert.ok(modal && modal.querySelector("#rep-detalle"), "detail records move into their own modal");
  const placeholder = window.document.querySelector("#tab-reportes .bc-m42-detail.bc-m73-modal-placeholder");
  assert.ok(placeholder && placeholder.hidden, "only an empty hidden placeholder remains to prevent inline accordion recreation");
  assert.equal(placeholder.querySelector("#rep-detalle"), null, "all report contents live in the modal");

  window.document.getElementById("bc-m42-open-details").click();
  await new Promise(resolve => window.setTimeout(resolve, 20));
  const ranking = window.document.getElementById("bc-m73-ranking-modal");
  assert.ok(ranking && !ranking.hidden, "Ver todos opens a separate ranking modal");
  assert.match(ranking.textContent, /Cerveza Bucanero/);
  assert.match(ranking.textContent, /Ganancia conocida \(FIFO\)/i);
  assert.match(ranking.textContent, /ganancia conocida/i);
  assert.ok(window.document.body.classList.contains("bc-m73-modal-open"), "background scrolling is locked");
  const sort = ranking.querySelector("#bc-m73-ranking-sort");
  sort.value = "ingresos_asc";
  sort.dispatchEvent(new window.Event("change", { bubbles: true }));
  await new Promise(resolve => window.setTimeout(resolve, 10));
  assert.ok(calls.some(x => x.name === "reporte_productos_ventas" && x.params.p_orden === "ingresos_asc"), "revenue ordering reaches backend");
  sort.value = "ganancia_desc";
  sort.dispatchEvent(new window.Event("change", { bubbles: true }));
  await new Promise(resolve => window.setTimeout(resolve, 10));
  assert.ok(calls.some(x => x.name === "reporte_productos_ventas" && x.params.p_orden === "ganancia_desc"), "profit ranking reaches backend");
  assert.match(ranking.textContent, /línea\(s\) con costo/i);

  window.document.querySelector(".bc-m45-quick-btn[data-rep=ventas]").click();
  await new Promise(resolve => window.setTimeout(resolve, 10));
  assert.ok(ranking.hidden, "switching modal types closes the previous modal");
  assert.ok(!modal.hidden, "quick action opens the detail modal");
  const close = modal.querySelector(".bc-m73-modal-close");
  close.click();
  assert.ok(modal.hidden, "modal can be closed");

  // Quick-action controls are distinct from the internal tabs. Exercise all
  // seven routes, including Vales, and ensure each selects the matching tab.
  for (const report of ["ventas", "compras", "rentabilidad", "transferencias", "vales", "stock", "movimiento"]) {
    const quick = window.document.querySelector('.bc-m45-quick-btn[data-rep="' + report + '"]');
    assert.ok(quick, "quick action exists for " + report);
    assert.equal(quick.getAttribute("aria-haspopup"), "dialog", "quick action declares dialog behavior: " + report);
    const alreadySelected = modal.querySelector(".rep-tab-btn.active")?.dataset.rep === report;
    const previousSelectionCount = selectedTabs.length;
    quick.click();
    await new Promise(resolve => window.setTimeout(resolve, 10));
    assert.ok(!modal.hidden, "quick action opens the detail modal: " + report);
    assert.equal(modal.querySelector(".rep-tab-btn.active")?.dataset.rep, report, "quick action selects the matching report: " + report);
    if (!alreadySelected) {
      assert.equal(selectedTabs.length, previousSelectionCount + 1, "a different report dispatches one tab click: " + report);
      assert.equal(selectedTabs[selectedTabs.length - 1], report, "the dispatched tab matches the quick action: " + report);
    }
    close.click();
    assert.ok(modal.hidden, "the modal closes after the case: " + report);
  }
  dom.window.close();
});
