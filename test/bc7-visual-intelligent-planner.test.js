"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const MODULE_PATH = path.join(__dirname, "..", "public", "js", "bc7-visual-intelligent-planner.js");
const MODULE = fs.readFileSync(MODULE_PATH, "utf8");
const APP = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const SW = fs.readFileSync(path.join(__dirname, "..", "public", "service-worker.js"), "utf8");

const DAYS = ["2099-01-05","2099-01-06","2099-01-07","2099-01-08","2099-01-09","2099-01-10"];

function setup(t, overrides = {}) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
      '<div id="bc7-visual-tools"></div>' +
      '<section id="bc7-visual-draft-panel" hidden></section>' +
      '<section id="bc7-visual-activity"></section>' +
      '<div id="bc7-month-board" role="grid">' +
        DAYS.map(date =>
          '<div class="bc7-month-day" data-date="' + date + '"><div class="bc7-month-day-events"></div></div>'
        ).join("") +
      "</div>" +
    "</body></html>",
    { url: "https://battlecruiser-visual-planner.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: overrides.online !== false });
  window.confirm = () => true;
  window.alert = () => {};
  window.matchMedia = () => ({ matches: true });

  const calls = { preview: [], create: [], movements: [], open: [] };
  const model = {
    admin: overrides.admin !== false,
    online: overrides.online !== false,
    month: "2099-01",
    selectedDate: "2099-01-05",
    warehouseId: "warehouse-1",
    warehouses: [{ id: "warehouse-1", name: "La Cueva" }],
    staff: [
      { id: "staff-1", name: "Adriana" },
      { id: "staff-2", name: "Sheyla" }
    ],
    rows: [],
    selectedRows: []
  };
  if (overrides.model) Object.assign(model, overrides.model);

  const bridge = {
    getSnapshot: () => model,
    selectDate(date) {
      model.selectedDate = date;
      model.selectedRows = model.rows.filter(row => row.fecha === date);
    },
    previewDraft: async payload => {
      calls.preview.push(payload);
      if (overrides.preview) return overrides.preview;
      return {
        valid: true,
        conflicts: [],
        note: "Conflictos visibles revisados; la validación definitiva ocurre en el servidor."
      };
    },
    createDraft: async payload => {
      calls.create.push(payload);
      return overrides.createResult || { ok: true, message: "Programación creada." };
    },
    loadMovements: async sessionId => {
      calls.movements.push(sessionId);
      return overrides.movements || [];
    },
    openSessionMovements: async sessionId => {
      calls.open.push(sessionId);
      return true;
    }
  };
  window.__BC7_JORNADA__ = { visualPlanner: bridge };
  window.eval(MODULE);

  t.after(() => window.close());
  return { window, model, calls, bridge };
}

function startDrag(window, target) {
  const event = new window.Event("dragstart", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      effectAllowed: "",
      dropEffect: "",
      values: {},
      setData(key, value) { this.values[key] = value; },
      getData(key) { return this.values[key] || ""; }
    }
  });
  target.dispatchEvent(event);
  return event;
}
function dragOver(window, target) {
  const event = new window.Event("dragover", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { dropEffect: "" } });
  target.dispatchEvent(event);
  return event;
}
function drop(window, target) {
  const event = new window.Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { dropEffect: "" } });
  target.dispatchEvent(event);
  return event;
}
function draftSegments(window) {
  return Array.from(window.document.querySelectorAll("[data-bc7-vp-draft-segment]"));
}
async function waitFor(predicate, timeoutMs = 1000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  return !!predicate();
}

test("desktop palette creates an ephemeral two-day draft when dragged onto a calendar date", (t) => {
  const { window, calls } = setup(t);
  const tool = window.document.querySelector('[data-bc7-vp-tool="new"]');
  assert.ok(tool, "ADMIN should see the New Jornada amulet");
  startDrag(window, tool);
  drop(window, window.document.querySelector('[data-date="2099-01-05"]'));

  assert.equal(window.document.getElementById("bc7-visual-draft-panel").hidden, false);
  assert.equal(draftSegments(window).length, 2);
  assert.equal(draftSegments(window)[0].getAttribute("aria-label").includes("Borrador"), true);
  assert.equal(calls.preview.length, 0, "dragging only creates a local draft");
  assert.equal(calls.create.length, 0, "dragging never writes a Jornada");
});

test("draft end handle resizes the range live without a server write", (t) => {
  const { window, calls } = setup(t);
  const tool = window.document.querySelector('[data-bc7-vp-tool="new"]');
  startDrag(window, tool);
  drop(window, window.document.querySelector('[data-date="2099-01-05"]'));
  const last = draftSegments(window).at(-1);
  const handle = last.querySelector('[data-bc7-vp-resize="end"]');
  assert.ok(handle, "the final segment exposes a resize handle");
  startDrag(window, handle);
  dragOver(window, window.document.querySelector('[data-date="2099-01-08"]'));
  assert.ok(window.document.querySelector('[data-bc7-vp-ghost]'), "a ghost range is drawn during the gesture");
  drop(window, window.document.querySelector('[data-date="2099-01-08"]'));
  assert.equal(draftSegments(window).length, 4);
  assert.equal(calls.create.length, 0);
  assert.equal(calls.preview.length, 0);
});

test("draft start handle resizes the beginning while preserving the final date", (t) => {
  const { window, calls } = setup(t);
  const tool = window.document.querySelector('[data-bc7-vp-tool="new"]');
  startDrag(window, tool);
  drop(window, window.document.querySelector('[data-date="2099-01-05"]'));
  const lastHandle = draftSegments(window).at(-1).querySelector('[data-bc7-vp-resize="end"]');
  startDrag(window, lastHandle);
  drop(window, window.document.querySelector('[data-date="2099-01-07"]'));
  const firstHandle = draftSegments(window)[0].querySelector('[data-bc7-vp-resize="start"]');
  assert.ok(firstHandle);
  startDrag(window, firstHandle);
  dragOver(window, window.document.querySelector('[data-date="2099-01-06"]'));
  drop(window, window.document.querySelector('[data-date="2099-01-06"]'));
  assert.equal(draftSegments(window).length, 2);
  assert.equal(draftSegments(window)[0].closest('[data-date]')?.dataset.date, "2099-01-06");
  assert.equal(draftSegments(window)[1].closest('[data-date]')?.dataset.date, "2099-01-07");
  assert.equal(calls.create.length, 0);
});

test("dragging a draft segment moves the whole period without changing its duration", (t) => {
  const { window, calls } = setup(t);
  const tool = window.document.querySelector('[data-bc7-vp-tool="new"]');
  startDrag(window, tool);
  drop(window, window.document.querySelector('[data-date="2099-01-05"]'));
  startDrag(window, draftSegments(window)[0]);
  dragOver(window, window.document.querySelector('[data-date="2099-01-07"]'));
  drop(window, window.document.querySelector('[data-date="2099-01-07"]'));
  assert.equal(draftSegments(window).length, 2);
  assert.equal(draftSegments(window)[0].closest('[data-date]')?.dataset.date, "2099-01-07");
  assert.equal(draftSegments(window)[1].closest('[data-date]')?.dataset.date, "2099-01-08");
  assert.equal(calls.create.length, 0);
});

test("keyboard form controls can change the first date, duration, work/rest and responsible", (t) => {
  const { window, calls } = setup(t);
  window.document.querySelector('[data-bc7-vp-tool="new"]').click();
  const start = window.document.querySelector("[data-bc7-vp-start]");
  start.value = "2099-01-06";
  start.dispatchEvent(new window.Event("change", { bubbles: true }));
  const days = window.document.querySelector("[data-bc7-vp-days]");
  days.value = "3";
  days.dispatchEvent(new window.Event("change", { bubbles: true }));
  const person = window.document.querySelector('[data-bc7-vp-responsible="0"]');
  person.value = "staff-2";
  person.dispatchEvent(new window.Event("change", { bubbles: true }));
  window.document.querySelector('[data-bc7-vp-toggle-rest="1"]').click();
  assert.equal(draftSegments(window).length, 3);
  assert.equal(draftSegments(window)[0].closest("[data-date]")?.dataset.date, "2099-01-06");
  assert.equal(window.document.querySelector('[data-bc7-vp-responsible="0"]').value, "staff-2");
  assert.equal(window.document.querySelector('[data-bc7-vp-responsible="1"]').disabled, true);
  assert.equal(calls.create.length, 0, "editing the keyboard-accessible form never writes");
});

test("a server preflight conflict keeps the draft local and disables confirmation", async (t) => {
  const { window, calls } = setup(t, {
    preview: {
      valid: false,
      conflicts: [{ date: "2099-01-05", kind: "warehouse", detail: "El almacén ya está ocupado." }],
      note: "Conflicto de programación."
    }
  });
  const tool = window.document.querySelector('[data-bc7-vp-tool="new"]');
  startDrag(window, tool);
  drop(window, window.document.querySelector('[data-date="2099-01-05"]'));
  for (const [index, personId] of [[0,"staff-1"],[1,"staff-2"]]) {
    const select = window.document.querySelector('[data-bc7-vp-responsible="' + index + '"]');
    select.value = personId;
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
  }
  window.document.querySelector("[data-bc7-vp-preview]").click();
  assert.equal(await waitFor(() => calls.preview.length === 1), true);
  assert.equal(window.document.querySelector("[data-bc7-vp-create]").disabled, true);
  assert.match(window.document.getElementById("bc7-visual-draft-panel").textContent, /almacén ya está ocupado/i);
  assert.equal(calls.create.length, 0);
});

test("responsible amulets can be dropped onto an individual draft day", (t) => {
  const { window, calls } = setup(t);
  const tool = window.document.querySelector('[data-bc7-vp-tool="new"]');
  startDrag(window, tool);
  drop(window, window.document.querySelector('[data-date="2099-01-05"]'));

  const person = window.document.querySelector('[data-bc7-vp-staff="staff-1"]');
  const slot = window.document.querySelector('[data-bc7-vp-day-slot="0"]');
  startDrag(window, person);
  dragOver(window, slot);
  drop(window, slot);

  const select = window.document.querySelector('[data-bc7-vp-responsible="0"]');
  assert.equal(select.value, "staff-1");
  assert.equal(calls.create.length, 0);
});

test("explicit preview and confirmation delegate to the existing Jornada creation contract", async (t) => {
  const { window, calls } = setup(t);
  const tool = window.document.querySelector('[data-bc7-vp-tool="new"]');
  startDrag(window, tool);
  drop(window, window.document.querySelector('[data-date="2099-01-05"]'));

  for (const [index, personId] of [[0,"staff-1"],[1,"staff-2"]]) {
    const select = window.document.querySelector('[data-bc7-vp-responsible="' + index + '"]');
    select.value = personId;
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
  }
  window.document.querySelector("[data-bc7-vp-preview]").click();
  assert.equal(await waitFor(() => calls.preview.length === 1), true);
  assert.equal(calls.preview[0].warehouseId, "warehouse-1");
  assert.equal(calls.preview[0].schedule.length, 2);
  assert.equal(window.document.querySelector("[data-bc7-vp-create]").disabled, false);

  window.document.querySelector("[data-bc7-vp-create]").click();
  assert.equal(await waitFor(() => calls.create.length === 1), true);
  assert.deepEqual(calls.create[0].schedule.map(row => row.responsable_id), ["staff-1","staff-2"]);
  assert.equal(window.document.getElementById("bc7-visual-draft-panel").hidden, true,
    "the draft disappears only after the bridge confirms creation");
});

test("movement amulets show only real session rows and provide a read-only open action", async (t) => {
  const movements = [
    { tipo: "compra", producto: "Arroz", cantidad: 12, usuario: "Adriana" },
    { tipo: "venta", producto: "Café", cantidad: -2, usuario: "Adriana" }
  ];
  const { window, calls } = setup(t, {
    movements,
    model: {
      selectedRows: [{
        id: "program-1", turno_id: "turn-1", almacen_id: "warehouse-1",
        numero_dia: 1, fecha: "2099-01-05", trabaja: true,
        responsable_id: "staff-1", estado: "PROGRAMADA",
        sesion_id: "session-1", sesion_estado: "EN_CURSO"
      }]
    }
  });
  assert.equal(await waitFor(() => calls.movements.length === 1), true);
  assert.equal(await waitFor(() => /Arroz/.test(window.document.getElementById("bc7-visual-activity").textContent)), true);
  const activity = window.document.getElementById("bc7-visual-activity");
  assert.match(activity.textContent, /Compras/);
  assert.match(activity.textContent, /Ventas/);
  assert.equal(activity.querySelectorAll("form").length, 0);
  assert.equal(activity.querySelectorAll("input,select").length, 0);
  activity.querySelector("[data-bc7-vp-open-session]").click();
  assert.deepEqual(calls.open, ["session-1"]);
});

test("non-admin sees no creation palette or staff amulets", (t) => {
  const { window } = setup(t, { admin: false });
  assert.equal(window.document.querySelector('[data-bc7-vp-tool="new"]'), null);
  assert.equal(window.document.querySelector('[data-bc7-vp-staff]'), null);
  assert.match(window.document.getElementById("bc7-visual-tools").textContent, /Modo de consulta/);
});

test("offline mode cannot expose a draft creation tool", (t) => {
  const { window } = setup(t, { online: false });
  assert.equal(window.document.querySelector('[data-bc7-vp-tool="new"]'), null);
  assert.match(window.document.getElementById("bc7-visual-tools").textContent, /Administración/);
});

test("planner module is loaded immediately after Jornada and precached offline", () => {
  assert.ok(APP.includes('["bc7-visual-intelligent-planner.js","1.0"]'));
  assert.ok(SW.includes('./js/bc7-visual-intelligent-planner.js?v=1.0'));
});
