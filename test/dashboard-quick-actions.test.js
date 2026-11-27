"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const ownerQuickActions = read("public/js/bc-owner-quick-actions.js");
const jornada = read("public/js/bc7-jornada-ui.js");
const payrollBridge = read("public/js/payroll-bridge.js");
const approvals = read("public/js/aprobaciones-admin.js");
const index = read("public/index.html");

function createDashboardDom() {
  const tabs = ["resumen", "movimientos", "inventario", "jornada", "pendientes"];
  const nav = tabs.map((tab) =>
    '<button type="button" class="tab-btn" data-tab="' + tab + '">' + tab + "</button>"
  ).join("");
  const panels = tabs.map((tab) =>
    '<section class="tab-panel" id="tab-' + tab + '">' +
      (tab === "resumen" ? '<div class="cc-dashboard-header"></div>' : "") +
      (tab === "inventario" ? '<button type="button" id="bc-stock-bajo-btn">Stock bajo</button>' : "") +
    "</section>"
  ).join("");
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
      '<div id="app-shell" class="visible" data-bc-permisos-cargados="1">' +
        '<nav id="tabs">' + nav + "</nav>" +
        '<main class="main-content">' + panels + "</main>" +
      "</div>" +
      '<div id="bc-stock-bajo-modal"></div>' +
    "</body></html>",
    { runScripts: "outside-only", url: "https://battlecruiser-dashboard.test/", pretendToBeVisual: true }
  );
  const { window } = dom;
  window.tienePermiso = () => true;
  window.irATab = (tab) => {
    window.document.querySelectorAll(".tab-btn").forEach((button) => button.classList.remove("active"));
    window.document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("visible"));
    const button = window.document.querySelector('.tab-btn[data-tab="' + tab + '"]');
    const panel = window.document.getElementById("tab-" + tab);
    if (button) button.classList.add("active");
    if (panel) panel.classList.add("visible");
  };
  window.__openedMovement = null;
  window.__BC165_open = (kind) => {
    const old = window.document.getElementById("bc165-overlay");
    if (old) old.remove();
    const overlay = window.document.createElement("div");
    overlay.id = "bc165-overlay";
    overlay.dataset.type = kind;
    window.document.body.appendChild(overlay);
    window.__openedMovement = kind;
  };
  window.__BC_openStockBajo = () => {
    window.document.getElementById("bc-stock-bajo-modal").classList.add("open");
  };
  window.__openedPriceChanges = 0;
  window.__BC_JORNADA_PRICE_CHANGES_API__ = {
    canOpenOwnerModal: () => true,
    openOwnerModal: () => { window.__openedPriceChanges += 1; return true; }
  };
  return dom;
}

function delay(window, ms = 180) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

test("Owner dashboard quick actions open their actual destination or show a working modal", async (t) => {
  const dom = createDashboardDom();
  t.after(() => dom.window.close());
  const { window } = dom;
  window.eval(ownerQuickActions);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  await delay(window, 20);

  const rootEl = window.document.getElementById("bc-owner-quick-actions");
  assert.ok(rootEl, "the dashboard shortcuts container must mount");
  const keys = ["purchase", "transfer", "low-stock", "jornada", "pending", "price-changes"];
  for (const key of keys) {
    const button = rootEl.querySelector('[data-bc-owner-action="' + key + '"]');
    assert.ok(button, "missing visible shortcut " + key);
    button.click();
    await delay(window);
    assert.equal(button.disabled, false, "the shortcut must not remain disabled after opening");
    assert.equal(rootEl.querySelector("[data-bc-owner-status]").textContent, "", "successful actions clear the error/status line");
    if (key === "purchase") assert.equal(window.__openedMovement, "compras");
    if (key === "transfer") assert.equal(window.__openedMovement, "transferencias");
    if (key === "low-stock") assert.equal(window.document.getElementById("bc-stock-bajo-modal").classList.contains("open"), true);
    if (key === "jornada") assert.equal(window.document.getElementById("tab-jornada").classList.contains("visible"), true);
    if (key === "pending") assert.equal(window.document.getElementById("tab-pendientes").classList.contains("visible"), true);
    if (key === "price-changes") assert.equal(window.__openedPriceChanges, 1);
  }
  assert.equal(window.__BC_OWNER_QUICK_ACTIONS_VERIFY__().bound, true);
});

test("Dependienta Jornada shortcuts activate the visible Jornada tab before opening its workspace", () => {
  const shortcutStart = jornada.indexOf("async function openWorkerShortcut(sessionId,section)");
  assert.ok(shortcutStart >= 0, "worker shortcut handler must exist");
  const shortcut = jornada.slice(shortcutStart, shortcutStart + 900);
  assert.ok(shortcut.indexOf("navTo('jornada')") >= 0, "worker shortcut must navigate to Jornada");
  assert.ok(shortcut.indexOf("navTo('jornada')") < shortcut.indexOf("openWorkspace(sessionId)"),
    "Jornada must become visible before its workspace/dialog is mounted");

  const historyStart = jornada.indexOf("if(t.hasAttribute('data-bc7-open'))");
  assert.ok(historyStart >= 0, "worker history open action must exist");
  const historyHandler = jornada.slice(historyStart, historyStart + 180);
  assert.match(historyHandler, /navTo\('jornada'\);await openWorkspace\(t\.dataset\.bc7Open\)/);
});

test("Nómina is a separate Administration option and its panel is not mounted inside approvals", async (t) => {
  assert.match(index, /<section class="cc-bloque bc-admin-card bc-admin-payroll" aria-label="Nómina">[\s\S]*?data-bcpay-open-admin/);
  assert.doesNotMatch(approvals, /bc-payroll-admin-host|mountAdminPanel/,
    "Aprobaciones administrativas must not render or host the Nómina module");

  const dom = new JSDOM(
    '<!doctype html><html><head></head><body>' +
      '<section id="tab-config"><button type="button" data-bcpay-open-admin>Abrir nómina</button></section>' +
      '<section id="admin-aprobaciones"></section>' +
    '</body></html>',
    { runScripts: "outside-only", url: "https://battlecruiser-payroll-admin.test/", pretendToBeVisual: true }
  );
  t.after(() => dom.window.close());
  const { window } = dom;
  window.client = {
    auth: { getSession: async () => ({ data: { session: { access_token: "unit-test-token" } }, error: null }) },
    rpc: async (name) => ({
      data: name === "bc7_payroll_get_settings" ? { modo_pago: "MANUAL" } : [],
      error: null
    })
  };
  window.fetch = async () => ({ ok: true, json: async () => ({ ok: true, dependents: [] }) });
  window.confirm = () => false;
  window.alert = (message) => { throw new Error(String(message)); };
  window.eval(payrollBridge);

  window.document.querySelector("[data-bcpay-open-admin]").click();
  await delay(window, 50);

  const modal = window.document.getElementById("bc-payroll-admin-modal");
  assert.ok(modal, "Nómina must create its own modal");
  assert.equal(modal.hidden, false, "the option must open the Nómina modal");
  const host = window.document.getElementById("bc-payroll-admin-host");
  assert.ok(host && modal.contains(host), "the salary management panel must live inside the Nómina modal");
  assert.ok(modal.querySelector("#bc-payroll-admin"), "the Nómina content must render");
  assert.equal(window.document.querySelector("#admin-aprobaciones #bc-payroll-admin"), null,
    "the approvals container must remain separate");
  assert.match(modal.textContent, /Configuración actual: Manual/);
  assert.equal(window.document.querySelector("#tab-config").contains(modal), false,
    "the management modal is mounted at the document level, not nested in the approvals area");
});
