"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "bc7-jornada-ui.js"),
  "utf8"
);

async function waitFor(predicate, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Havana",
    year: "numeric",
    month: "2-digit"
  }).format(new Date());
}

function monthEnd(month) {
  const parts = month.split("-").map(Number);
  return month + "-" + String(new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate()).padStart(2, "0");
}

function setup(t, options = {}) {
  const admin = options.admin !== false;
  const rows = options.rows || [];
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
      '<nav><button class="tab-btn" data-tab="turnos">Turnos</button></nav>' +
      '<section id="tab-turnos" class="tab-panel"></section>' +
    "</body></html>",
    {
      url: "https://battlecruiser-month-calendar.test/",
      runScripts: "outside-only",
      pretendToBeVisual: true
    }
  );

  const window = dom.window;
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: true
  });
  Object.defineProperty(window.document, "readyState", {
    configurable: true,
    value: "complete"
  });
  window.setInterval = () => 0;
  window.setTimeout = () => 0;
  window.confirm = () => true;
  window._usuarioActual = { id: "owner-1", rol: admin ? "Dueño" : "Dependienta" };
  window._cache = {
    almacenes: [{ id: "warehouse-1", nombre: "La Cueva", activo: true }],
    usuarios: []
  };

  const calls = [];
  window.client = {
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      if (name === "bc_actor_is_admin") return { data: admin, error: null };
      if (name === "listar_usuarios_admin") {
        return {
          data: [{ id: "dep-1", nombre: "Beatriz", rol: "Dependienta", activo: true, archivado: false }],
          error: null
        };
      }
      if (name === "turno_actual_usuario") return { data: null, error: null };
      if (name === "bc5_mis_jornadas") return { data: rows, error: null };
      if (name === "bc5_reprogramar_periodo_jornada") {
        const start = payload.p_fecha_inicio;
        const days = Number(rows.find((row) => String(row.turno_id) === String(payload.p_turno_id))?.dias_total || 2);
        const end = new Date(Date.parse(start + "T12:00:00Z") + (days - 1) * 86400000).toISOString().slice(0, 10);
        return { data: { fecha_inicio: start, fecha_fin: end, dias_total: days, idempotente: false }, error: null };
      }
      return { data: null, error: null };
    }
  };

  window.eval(
    "let _usuarioActual = window._usuarioActual; " +
    "let _bcSesionActivaId = window._usuarioActual.id; " +
    "let _permisosCargaExitosa = true; " +
    "const client = window.client;\n" + SOURCE
  );
  t.after(() => window.close());
  return { window, calls };
}

test("Jornada renders a seven-column monthly calendar using the exact 31-day-safe RPC window", async (t) => {
  const month = currentMonth();
  const rows = [
    {
      id: "programming-5",
      turno_id: "turno-1",
      almacen_id: "warehouse-1",
      numero_dia: 5,
      fecha: month + "-05",
      trabaja: true,
      responsable_id: "dep-1",
      estado: "PROGRAMADO",
      sesion_id: "session-5",
      sesion_estado: "EN_CURSO",
      es_responsable: false
    },
    {
      id: "programming-6",
      turno_id: "turno-1",
      almacen_id: "warehouse-1",
      numero_dia: 6,
      fecha: month + "-06",
      trabaja: false,
      responsable_id: null,
      estado: "DESCANSO",
      sesion_id: null,
      sesion_estado: null,
      es_responsable: false
    }
  ];
  const { window, calls } = setup(t, { admin: true, rows });

  const loaded = await waitFor(() =>
    window.document.querySelectorAll("#bc7-month-board .bc7-month-day").length > 0
  );
  assert.ok(loaded, "monthly day cells should render after the read completes");

  const monthInput = window.document.getElementById("bc7-calendar-month");
  assert.equal(monthInput.value, month);
  assert.equal(window.document.querySelectorAll("#bc7-month-board .bc7-month-weekday").length, 7);
  const parts = month.split("-").map(Number);
  const dayCount = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
  const firstOffset = (new Date(Date.UTC(parts[0], parts[1] - 1, 1)).getUTCDay() + 6) % 7;
  const expectedCells = Math.ceil((firstOffset + dayCount) / 7) * 7;
  assert.equal(
    window.document.querySelectorAll("#bc7-month-board .bc7-month-day").length,
    expectedCells
  );

  const read = calls.find((call) => call.name === "bc5_mis_jornadas");
  assert.ok(read, "the board must use the existing authenticated Jornada read RPC");
  assert.equal(read.payload.p_fecha_inicio, month + "-01");
  assert.equal(read.payload.p_fecha_fin, monthEnd(month));
  assert.ok(
    new Date(read.payload.p_fecha_fin + "T12:00:00Z") -
      new Date(read.payload.p_fecha_inicio + "T12:00:00Z") <= 30 * 86400000,
    "the calendar read must never exceed the RPC's 31-day limit"
  );

  const dayButton = window.document.querySelector(
    '#bc7-month-board [data-bc7-calendar-select="' + month + '-05"]'
  );
  assert.ok(dayButton, "a scheduled day should be selectable");
  dayButton.click();

  const detail = window.document.getElementById("bc7-calendar-detail");
  assert.match(detail.textContent, /Beatriz/);
  assert.ok(
    detail.querySelector('[data-bc7-open="session-5"]'),
    "the selected-day inspector should preserve the existing open/manage action"
  );
  assert.ok(
    detail.querySelector('[data-bc7-reschedule="programming-5"]'),
    "admin-only responsible/day-rest editing remains available in the inspector"
  );
  assert.equal(
    window.document.querySelector("[data-bc7-open-planner]").hidden,
    false,
    "verified administrators should see the planner shortcut"
  );
});

test("month navigation changes the query window without creating or editing Jornada data", async (t) => {
  const month = currentMonth();
  const { window, calls } = setup(t, { admin: true, rows: [] });
  await waitFor(() => calls.some((call) => call.name === "bc5_mis_jornadas"));

  window.document.querySelector("[data-bc7-month-next]").click();
  const changed = await waitFor(() => {
    const reads = calls.filter((call) => call.name === "bc5_mis_jornadas");
    return reads.length >= 2 && reads[1].payload.p_fecha_inicio !== month + "-01";
  });
  assert.ok(changed, "next month should trigger a fresh monthly read");

  const reads = calls.filter((call) => call.name === "bc5_mis_jornadas");
  const parts = month.split("-").map(Number);
  const nextDate = new Date(Date.UTC(parts[0], parts[1], 1, 12));
  const nextMonth = nextDate.toISOString().slice(0, 7);
  assert.equal(reads[1].payload.p_fecha_inicio, nextMonth + "-01");
  assert.equal(reads[1].payload.p_fecha_fin, monthEnd(nextMonth));
  assert.equal(
    calls.some((call) => /^(bc5_crear_jornada_unica|bc5_reprogramar_jornada|bc5_iniciar_jornada|bc5_cerrar_jornada)$/.test(call.name)),
    false,
    "month navigation is strictly read-only"
  );
});

test("non-admin users retain their limited agenda and cannot see the planner shortcut", async (t) => {
  const month = currentMonth();
  const rows = [{
    id: "programming-own",
    turno_id: "turno-own",
    almacen_id: "warehouse-1",
    numero_dia: 1,
    fecha: month + "-10",
    trabaja: true,
    responsable_id: null,
    estado: "PROGRAMADO",
    sesion_id: "session-own",
    sesion_estado: "PROGRAMADO",
    es_responsable: true
  }];
  const { window } = setup(t, { admin: false, rows });
  await waitFor(() =>
    window.document.querySelector("#bc7-schedule-list .bc7-jornada") !== null
  );

  assert.equal(window.document.querySelector("[data-bc7-open-planner]").hidden, true);
  assert.equal(window.document.querySelectorAll("#bc7-month-board .bc7-month-weekday").length, 7);
  assert.equal(window.document.querySelectorAll("#bc7-schedule-list .bc7-jornada").length, 1);
  assert.equal(
    window.document.querySelector("#bc7-calendar-detail [data-bc7-reschedule]"),
    null,
    "non-admins must not receive the administrator reschedule editor"
  );
  assert.equal(
    window.document.querySelector("#bc7-schedule-list [data-bc7-period-move-open]"),
    null,
    "non-admins must not receive the whole-period move action"
  );
});

test("ADMIN can propose and confirm a whole-period move from the accessible date picker", async (t) => {
  const now = new Date();
  const todayHavana = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Havana", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now);
  const plusDays = (value, n) => {
    const d = new Date(value + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const sourceStart = plusDays(todayHavana, 10);
  const rows = [1, 2, 3].map((day) => ({
    id: "program-" + day,
    turno_id: "turno-move-1",
    almacen_id: "warehouse-1",
    numero_dia: day,
    fecha: plusDays(sourceStart, day - 1),
    fecha_fin: plusDays(sourceStart, day - 1),
    dias_total: 3,
    estado_maestro: "PROGRAMADO",
    trabaja: day !== 2,
    responsable_id: day === 2 ? null : "dep-1",
    estado: day === 2 ? "DESCANSO" : "PROGRAMADA",
    sesion_id: day === 2 ? null : "session-" + day,
    sesion_estado: day === 2 ? null : "PROGRAMADA",
    es_responsable: false
  }));
  const { window, calls } = setup(t, { admin: true, rows });
  await waitFor(() => window.document.querySelector("#bc7-schedule-list [data-bc7-period-move-open]") !== null);

  const monthInput = window.document.getElementById("bc7-calendar-month");
  monthInput.value = sourceStart.slice(0, 7);
  monthInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  await waitFor(() => window.document.querySelector("#bc7-month-board [data-bc7-period-drag='program-2']") !== null);

  const dragChip = window.document.querySelector("#bc7-month-board [data-bc7-period-drag='program-2']");
  assert.equal(dragChip.getAttribute("draggable"), "true", "a scheduled rest day can initiate movement of its whole period");
  const openButton = window.document.querySelector("#bc7-schedule-list [data-bc7-period-move-open='program-2']");
  assert.ok(openButton, "the mobile/accessibility action must be available for the same full period");
  openButton.click();

  const dialog = await waitFor(() => window.document.getElementById("bc7-period-move-backdrop"));
  assert.ok(dialog, "the date-picker dialog should open");
  const form = window.document.querySelector("[data-bc7-period-move-form]");
  const newStart = plusDays(sourceStart, 4);
  const dateInput = form.querySelector("[data-bc7-period-move-date]");
  dateInput.value = newStart;
  dateInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  form.querySelector("[data-bc7-period-move-reason]").value = "Ajuste de planificación aprobado";

  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  const called = await waitFor(() => calls.some((call) => call.name === "bc5_reprogramar_periodo_jornada"));
  assert.ok(called, "confirmation should call the transactional period-move RPC");
  const moveCall = calls.find((call) => call.name === "bc5_reprogramar_periodo_jornada");
  assert.equal(moveCall.payload.p_turno_id, "turno-move-1");
  assert.equal(moveCall.payload.p_fecha_inicio, newStart);
  assert.equal(moveCall.payload.p_motivo, "Ajuste de planificación aprobado");
  assert.match(moveCall.payload.p_idempotency_key, /^[0-9a-f-]{36}$/i);
  const closed = await waitFor(() => window.document.getElementById("bc7-period-move-backdrop") === null);
  assert.ok(closed, "successful movement closes the dialog");
  assert.equal(window.document.getElementById("bc7-calendar-month").value, newStart.slice(0, 7));
});

test("desktop drag previews every day in the period and drop opens the full-range confirmation", async (t) => {
  const now = new Date();
  const todayHavana = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Havana", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now);
  const plusDays = (value, n) => {
    const d = new Date(value + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const sourceStart = plusDays(todayHavana, 10);
  const rows = [1, 2, 3].map((day) => ({
    id: "drag-program-" + day,
    turno_id: "turno-drag-1",
    almacen_id: "warehouse-1",
    numero_dia: day,
    fecha: plusDays(sourceStart, day - 1),
    fecha_fin: plusDays(sourceStart, day - 1),
    dias_total: 3,
    estado_maestro: "PROGRAMADO",
    trabaja: true,
    responsable_id: "dep-1",
    estado: "PROGRAMADA",
    sesion_id: "drag-session-" + day,
    sesion_estado: "PROGRAMADA",
    es_responsable: false
  }));
  const { window } = setup(t, { admin: true, rows });
  const monthInput = window.document.getElementById("bc7-calendar-month");
  monthInput.value = sourceStart.slice(0, 7);
  monthInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  await waitFor(() => window.document.querySelector("#bc7-month-board [data-bc7-period-drag='drag-program-2']") !== null);

  const chip = window.document.querySelector("#bc7-month-board [data-bc7-period-drag='drag-program-2']");
  const dataTransfer = {
    effectAllowed: "",
    dropEffect: "",
    data: {},
    setData(type, value) { this.data[type] = value; },
    getData(type) { return this.data[type] || ""; }
  };
  const startEvent = new window.Event("dragstart", { bubbles: true, cancelable: true });
  Object.defineProperty(startEvent, "dataTransfer", { value: dataTransfer });
  chip.dispatchEvent(startEvent);
  assert.equal(dataTransfer.effectAllowed, "move");

  const targetDate = plusDays(sourceStart, 8);
  const targetCell = window.document.querySelector('#bc7-month-board .bc7-month-day[data-date="' + targetDate + '"]');
  assert.ok(targetCell, "the target date should be represented in the visible calendar");
  const overEvent = new window.Event("dragover", { bubbles: true, cancelable: true });
  Object.defineProperty(overEvent, "dataTransfer", { value: dataTransfer });
  targetCell.dispatchEvent(overEvent);
  assert.ok(window.document.getElementById("bc7-period-move-preview"), "live preview banner should be visible");
  assert.equal(
    window.document.querySelectorAll("#bc7-month-board .bc7-month-period-ghost").length,
    3,
    "all three days must be previewed, not just the dragged chip"
  );
  assert.match(window.document.getElementById("bc7-period-move-preview").textContent, /3 días/);

  const dropEvent = new window.Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
  targetCell.dispatchEvent(dropEvent);
  const opened = await waitFor(() => window.document.getElementById("bc7-period-move-backdrop") !== null);
  assert.ok(opened, "dropping a valid target opens explicit confirmation");
  assert.equal(
    window.document.querySelector("[data-bc7-period-move-date]").value,
    plusDays(sourceStart, 7),
    "dropping day 2 derives the new start by subtracting the day number offset"
  );
  assert.equal(
    window.document.querySelector("[data-bc7-period-move-reason]").required,
    true,
    "the period move must require an audit reason"
  );
  window.document.querySelector("[data-bc7-period-move-cancel]").click();
  assert.equal(window.document.getElementById("bc7-period-move-backdrop"), null);
});

test("consolidated historical ranges and started Jornada rows never expose a period-move action", async (t) => {
  const month = currentMonth();
  const rows = [{
    id: "program-consolidated",
    turno_id: "turno-history",
    almacen_id: "warehouse-1",
    numero_dia: 1,
    fecha: month + "-20",
    fecha_fin: month + "-22",
    dias_total: 3,
    estado_maestro: "CERRADO",
    trabaja: true,
    responsable_id: "dep-1",
    estado: "PROGRAMADA",
    sesion_id: "session-history",
    sesion_estado: "COMPLETADA",
    es_responsable: false
  }];
  const { window } = setup(t, { admin: true, rows });
  await waitFor(() => window.document.querySelector("#bc7-schedule-list .bc7-jornada") !== null);
  assert.equal(
    window.document.querySelector("#bc7-schedule-list [data-bc7-period-move-open]"),
    null,
    "consolidated historical periods must not be draggable or movable"
  );
});
