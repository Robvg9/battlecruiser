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
  assert.equal(window.document.getElementById("bc7-month-board").style.gridTemplateRows,
    `34px repeat(${expectedCells / 7},minmax(62px,1fr))`);
  assert.equal(window.document.getElementById("bc7-month-board").getAttribute("aria-colcount"), "7");

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
});

test("desktop visual calendar keeps a balanced board beside its right-hand inspector", async (t) => {
  const { window } = setup(t, { admin: true, rows: [] });
  const trigger = window.document.querySelector("[data-bc7-open-visual-calendar]");
  const modal = window.document.getElementById("bc7-visual-calendar-modal");
  assert.ok(trigger && modal, "desktop visual-calendar entry and modal must exist");

  window.matchMedia = () => ({ matches: true });
  trigger.click();
  assert.equal(modal.hidden, false, "desktop activation should open the visual calendar");

  const layout = modal.querySelector(".bc7-visual-calendar-layout");
  assert.ok(layout.querySelector(".bc7-visual-calendar-main #bc7-month-board"),
    "the symmetric month grid must remain in the main column");
  const inspector = layout.querySelector("aside.bc7-visual-calendar-side");
  assert.ok(inspector, "the right-hand inspector must remain present on desktop");
  assert.ok(inspector.querySelector("#bc7-calendar-detail"),
    "the inspector must contain the selected-day details");

  const styles = Array.from(window.document.querySelectorAll("style"))
    .map((style) => style.textContent || "")
    .join("\n");
  assert.match(styles, /\.bc7-visual-calendar-layout\{display:grid;grid-template-columns:minmax\(0,1fr\) 360px/,
    "desktop board and inspector must use a two-column layout");
  assert.match(styles, /\.bc7-visual-calendar-side\{display:flex;flex-direction:column/,
    "the inspector must keep its visible desktop layout");
  assert.match(styles, /@media\(min-width:761px\) and \(max-width:1120px\).*?300px/,
    "the inspector must retain a responsive desktop width");
});
