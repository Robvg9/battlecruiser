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
      '<section id="bc7-visual-history-panel"></section>' +
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
  const runtimeErrors = [];
  window.addEventListener("error", event => runtimeErrors.push(String(event.message||"window error")));
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
  return { window, model, calls, bridge, runtimeErrors };
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

test("desktop palette creates an ephemeral two-day draft, dims its source and cleans drag state", (t) => {
  const { window, calls, runtimeErrors } = setup(t);
  const tool = window.document.querySelector('[data-bc7-vp-tool="new"]');
  assert.ok(tool, "ADMIN should see the New Jornada amulet");
  startDrag(window, tool);
  assert.equal(tool.classList.contains("bc7-vp-drag-source"), true,
    "the source amulet should dim while the gesture is active");
  drop(window, window.document.querySelector('[data-date="2099-01-05"]'));

  assert.equal(window.document.getElementById("bc7-visual-draft-panel").hidden, false);
  assert.equal(draftSegments(window).length, 2);
  assert.equal(draftSegments(window)[0].getAttribute("aria-label").includes("Borrador"), true);
  assert.ok(draftSegments(window)[0].classList.contains("is-period-start"));
  assert.ok(draftSegments(window)[1].classList.contains("is-period-end"));
  assert.equal(draftSegments(window)[1].querySelector(".bc7-vp-draft-label").textContent,"",
    "one Jornada label spans the period instead of D2/D3 daily labels");
  assert.equal(window.document.querySelector("[data-bc7-vp-responsible]"),null,"the planner must not ask for an assignee per day");
  assert.equal(window.document.querySelector("[data-bc7-vp-toggle-rest]"),null,"no Jornada date can be changed into a rest day");
  assert.doesNotMatch(window.document.getElementById("bc7-visual-draft-panel").textContent,/descanso|laborable/i);
  assert.equal(tool.classList.contains("bc7-vp-drag-source"), false,
    "dropping the amulet must restore its original appearance");
  assert.deepEqual(runtimeErrors, [], "drop must not raise a runtime error while clearing drag state");
  assert.equal(calls.preview.length, 0, "dragging only creates a local draft");
  assert.equal(calls.create.length, 0, "dragging never writes a Jornada");
});

test("dragging over an unchanged calendar cell reuses the ghost instead of rebuilding the DOM", (t) => {
  const {window}=setup(t);
  const tool=window.document.querySelector('[data-bc7-vp-tool="new"]');
  const target=window.document.querySelector('[data-date="2099-01-05"]');
  startDrag(window,tool);
  dragOver(window,target);
  const ghost=window.document.querySelector("[data-bc7-vp-ghost]");
  assert.ok(ghost,"the first hover must render a preview");
  dragOver(window,target);
  assert.strictEqual(window.document.querySelector("[data-bc7-vp-ghost]"),ghost,
    "repeated dragover events over the same date must not replace preview nodes");
});

test("resize grips are independent draggable targets and compact desktop layouts stack the inspector", (t) => {
  const {window}=setup(t);
  const tool=window.document.querySelector('[data-bc7-vp-tool="new"]');
  startDrag(window,tool);
  drop(window,window.document.querySelector('[data-date="2099-01-05"]'));
  const first=draftSegments(window)[0];
  const last=draftSegments(window).at(-1);
  const start=first.querySelector('[data-bc7-vp-resize="start"]');
  const end=last.querySelector('[data-bc7-vp-resize="end"]');
  const move=first.querySelector('[data-bc7-vp-draft-move]');
  assert.equal(first.draggable,false,"the parent segment must not swallow drags from its edge controls");
  assert.equal(start.draggable,true);
  assert.equal(end.draggable,true);
  assert.equal(move.draggable,true);
  const css=window.document.getElementById("bc7-visual-planner-style").textContent;
  assert.match(css,/flex:0 0 40px/,"resize targets must be easy to grab on a laptop trackpad");
  assert.match(css,/@media\(max-width:1440px\)/,"small laptop widths must stack the inspector below the calendar");
});

test("draft end handle resizes the range live without a server write", (t) => {
  const { window, calls } = setup(t);
  const tool = window.document.querySelector('[data-bc7-vp-tool="new"]');
  startDrag(window, tool);
  drop(window, window.document.querySelector('[data-date="2099-01-05"]'));
  const last = draftSegments(window).at(-1);
  const handle = last.querySelector('[data-bc7-vp-resize="end"]');
  assert.ok(handle, "the final segment exposes a resize handle");
  assert.equal(last.draggable,false,"the parent segment cannot capture the edge gesture");
  assert.equal(handle.draggable,true);
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
  const staffAmulet = window.document.querySelector('[data-bc7-vp-staff="staff-2"]');
  const secondDayCell = window.document.querySelector('[data-date="2099-01-06"]');
  startDrag(window, staffAmulet);
  dragOver(window, secondDayCell);
  drop(window, secondDayCell);
  const assignedPeriod = window.document.querySelector('[data-bc7-vp-period-responsible]');
  assert.equal(assignedPeriod.value, "staff-2",
    "dropping onto any covered day assigns the responsible to the complete parent Jornada");
  const firstHandle = draftSegments(window)[0].querySelector('[data-bc7-vp-resize="start"]');
  assert.ok(firstHandle);
  assert.equal(draftSegments(window)[0].draggable,false);
  assert.equal(firstHandle.draggable,true);
  startDrag(window, firstHandle);
  dragOver(window, window.document.querySelector('[data-date="2099-01-06"]'));
  drop(window, window.document.querySelector('[data-date="2099-01-06"]'));
  assert.equal(draftSegments(window).length, 2);
  assert.equal(draftSegments(window)[0].closest('[data-date]')?.dataset.date, "2099-01-06");
  assert.equal(draftSegments(window)[1].closest('[data-date]')?.dataset.date, "2099-01-07");
  assert.equal(window.document.querySelector("[data-bc7-vp-period-responsible]").value, "staff-2",
    "changing the range must preserve the single Jornada-level responsible");
  assert.equal(calls.create.length, 0);
});

test("dragging a draft segment moves the whole period without changing its duration", (t) => {
  const { window, calls } = setup(t);
  const tool = window.document.querySelector('[data-bc7-vp-tool="new"]');
  startDrag(window, tool);
  drop(window, window.document.querySelector('[data-date="2099-01-05"]'));
  const moveHandle=draftSegments(window)[0].querySelector("[data-bc7-vp-draft-move]");
  assert.ok(moveHandle,"moving a Jornada uses a dedicated grip, not the parent segment");
  startDrag(window,moveHandle);
  dragOver(window, window.document.querySelector('[data-date="2099-01-07"]'));
  drop(window, window.document.querySelector('[data-date="2099-01-07"]'));
  assert.equal(draftSegments(window).length, 2);
  assert.equal(draftSegments(window)[0].closest('[data-date]')?.dataset.date, "2099-01-07");
  assert.equal(draftSegments(window)[1].closest('[data-date]')?.dataset.date, "2099-01-08");
  assert.equal(calls.create.length, 0);
});

test("keyboard form controls change the date, duration and one responsible; no day can be marked as rest", async (t) => {
  const { window, calls } = setup(t);
  window.document.querySelector('[data-bc7-vp-tool="new"]').click();
  const start = window.document.querySelector("[data-bc7-vp-start]");
  start.value = "2099-01-06";
  start.dispatchEvent(new window.Event("change", { bubbles: true }));
  const days = window.document.querySelector("[data-bc7-vp-days]");
  days.value = "3";
  days.dispatchEvent(new window.Event("change", { bubbles: true }));
  const person = window.document.querySelector("[data-bc7-vp-period-responsible]");
  person.value = "staff-2";
  person.dispatchEvent(new window.Event("change", { bubbles: true }));
  const panel=window.document.getElementById("bc7-visual-draft-panel");
  assert.equal(window.document.querySelector('[data-bc7-vp-toggle-rest]'),null);
  assert.doesNotMatch(panel.textContent,/descanso|laborable/i);
  assert.equal(draftSegments(window).length, 3);
  assert.equal(draftSegments(window)[0].closest("[data-date]")?.dataset.date, "2099-01-06");
  assert.equal(window.document.querySelector("[data-bc7-vp-period-responsible]").value, "staff-2");
  window.document.querySelector("[data-bc7-vp-preview]").click();
  assert.equal(await waitFor(()=>calls.preview.length===1),true);
  assert.equal(calls.preview[0].schedule.every(day=>day.trabaja===true),true,
    "every date of the period is always laborable");
  assert.equal(calls.preview[0].schedule.map(day=>day.responsable_id).join(","),"staff-2,staff-2,staff-2",
    "one responsible is copied to every date");
  assert.equal(calls.create.length, 0, "editing and reviewing the keyboard-accessible form never writes");
});

test("arrow keys move and resize the draft with Alt and Shift modifiers", (t) => {
  const { window, calls } = setup(t);
  window.document.querySelector('[data-bc7-vp-tool="new"]').click();
  let segment=window.document.querySelector('[data-bc7-vp-draft-segment="1"]');
  assert.ok(segment);
  segment.focus();
  segment.dispatchEvent(new window.KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true,cancelable:true}));
  assert.equal(draftSegments(window).length,2);
  assert.equal(draftSegments(window)[0].closest("[data-date]")?.dataset.date,"2099-01-06",
    "ArrowRight moves the complete draft by one day");

  segment=window.document.querySelector('[data-bc7-vp-draft-segment="1"]');
  segment.focus();
  segment.dispatchEvent(new window.KeyboardEvent("keydown",{key:"ArrowRight",shiftKey:true,bubbles:true,cancelable:true}));
  assert.equal(draftSegments(window).length,3,
    "Shift+ArrowRight extends the end without moving the start");
  assert.equal(draftSegments(window)[2].closest("[data-date]")?.dataset.date,"2099-01-08");

  segment=window.document.querySelector('[data-bc7-vp-draft-segment="1"]');
  segment.focus();
  segment.dispatchEvent(new window.KeyboardEvent("keydown",{key:"ArrowLeft",altKey:true,bubbles:true,cancelable:true}));
  assert.equal(draftSegments(window).length,4,
    "Alt+ArrowLeft moves the start earlier while preserving the end");
  assert.equal(draftSegments(window)[0].closest("[data-date]")?.dataset.date,"2099-01-05");
  assert.equal(draftSegments(window)[3].closest("[data-date]")?.dataset.date,"2099-01-08");
  assert.equal(calls.create.length,0,"keyboard gestures remain local until explicit confirmation");
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
  const select = window.document.querySelector("[data-bc7-vp-period-responsible]");
  select.value = "staff-1";
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
  window.document.querySelector("[data-bc7-vp-preview]").click();
  assert.equal(await waitFor(() => calls.preview.length === 1), true);
  assert.equal(await waitFor(() => /almacén ya está ocupado/i.test(window.document.getElementById("bc7-visual-draft-panel").textContent)), true,
    "the asynchronous preflight result must be rendered before the assertion");
  assert.equal(window.document.querySelector("[data-bc7-vp-create]").disabled, true);
  assert.match(window.document.getElementById("bc7-visual-draft-panel").textContent, /almacén ya está ocupado/i);
  assert.equal(calls.create.length, 0);
});

test("object-shaped preflight notes render as readable text, never [object Object]", async (t) => {
  const {window}=setup(t,{preview:{valid:true,conflicts:[],note:{detail:"Validación del período confirmada."}}});
  window.document.querySelector('[data-bc7-vp-tool="new"]').click();
  const responsible=window.document.querySelector("[data-bc7-vp-period-responsible]");
  responsible.value="staff-1";
  responsible.dispatchEvent(new window.Event("change",{bubbles:true}));
  window.document.querySelector("[data-bc7-vp-preview]").click();
  const panel=window.document.getElementById("bc7-visual-draft-panel");
  assert.equal(await waitFor(()=>panel.textContent.includes("Validación del período confirmada.")),true);
  assert.equal(panel.textContent.includes("[object Object]"),false);
});

test("a responsible amulet dropped onto any day assigns the whole Jornada", (t) => {
  const { window, calls } = setup(t);
  const tool = window.document.querySelector('[data-bc7-vp-tool="new"]');
  startDrag(window, tool);
  drop(window, window.document.querySelector('[data-date="2099-01-05"]'));

  const person = window.document.querySelector('[data-bc7-vp-staff="staff-1"]');
  const day = window.document.querySelector('[data-date="2099-01-06"]');
  startDrag(window, person);
  dragOver(window, day);
  drop(window, day);

  const select = window.document.querySelector("[data-bc7-vp-period-responsible]");
  assert.equal(select.value, "staff-1");
  assert.equal(window.document.querySelector("[data-bc7-vp-responsible]"),null);
  assert.equal(calls.create.length, 0);
});

test("explicit preview and confirmation delegate to the existing Jornada creation contract", async (t) => {
  const { window, calls } = setup(t);
  const tool = window.document.querySelector('[data-bc7-vp-tool="new"]');
  startDrag(window, tool);
  drop(window, window.document.querySelector('[data-date="2099-01-05"]'));

  const select = window.document.querySelector("[data-bc7-vp-period-responsible]");
  select.value = "staff-1";
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
  window.document.querySelector("[data-bc7-vp-preview]").click();
  assert.equal(await waitFor(() => calls.preview.length === 1), true);
  assert.equal(calls.preview[0].warehouseId, "warehouse-1");
  assert.equal(calls.preview[0].schedule.length, 2);
  assert.equal(calls.preview[0].schedule.every(day=>day.trabaja===true),true);
  assert.equal(calls.preview[0].schedule.map(day=>day.responsable_id).join(","),"staff-1,staff-1");
  assert.equal(await waitFor(() => {
    const button=window.document.querySelector("[data-bc7-vp-create]");
    return button && button.disabled===false;
  }), true, "the asynchronous preflight must finish before the confirmation becomes enabled");

  window.document.querySelector("[data-bc7-vp-create]").click();
  assert.equal(await waitFor(() => calls.create.length === 1), true);
  assert.equal(await waitFor(() => window.document.getElementById("bc7-visual-draft-panel").hidden), true,
    "a successful server result should clear the ephemeral draft");
  assert.equal(
    calls.create[0].schedule.map(row => row.responsable_id).join(","),
    "staff-1,staff-1",
    "the server bridge receives the same responsible ID for every working day of one Jornada"
  );
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

test("history panel groups completed Jornada periods and shows master-close status separately", (t) => {
  const period={
    id:"history-program",turno_id:"history-turno",almacen_id:"warehouse-1",
    fecha:"2099-01-03",fecha_fin:"2099-01-04",_periodDays:2,_responsibleLabel:"Adriana",
    _periodRows:[{id:"history-program",fecha:"2099-01-03",sesion_id:"history-session",
      sesion_estado:"COMPLETADA",turno_estado_maestro:"PENDIENTE_APROBACION",trabaja:true}]
  };
  const {window,calls}=setup(t,{model:{historyRows:[period]}});
  const history=window.document.getElementById("bc7-visual-history-panel");
  assert.match(history.textContent,/HISTORIAL DE JORNADAS/);
  assert.match(history.textContent,/Adriana/);
  assert.match(history.textContent,/Completada · cierre maestro por verificar/);
  history.querySelector("[data-bc7-vp-history-open]").click();
  assert.deepEqual(calls.open,["history-session"]);
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
  assert.match(window.document.getElementById("bc7-visual-tools").textContent, /Sin conexión|modo de consulta/);
});

test("planner module is loaded immediately after Jornada and precached offline", () => {
  assert.ok(APP.includes('["bc7-visual-intelligent-planner.js","1.2"]'));
  assert.ok(SW.includes('./js/bc7-visual-intelligent-planner.js?v=1.2'));
});
