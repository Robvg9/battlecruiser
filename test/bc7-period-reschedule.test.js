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

function todayHavana() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Havana",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function addDays(value, offset) {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function waitFor(predicate, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

function periodRows(start, options = {}) {
  const turnId = options.turnId || "turn-period-1";
  const warehouseId = options.warehouseId || "warehouse-1";
  const dayStates = options.dayStates || [
    { works: true, sessionState: "PROGRAMADA" },
    { works: false, sessionState: null },
    { works: true, sessionState: "PENDIENTE" }
  ];
  return dayStates.map((day, index) => {
    const date = addDays(start, index);
    return {
      id: "programming-" + (index + 1),
      turno_id: turnId,
      almacen_id: warehouseId,
      numero_dia: index + 1,
      fecha: date,
      fecha_fin: options.consolidatedDay === index + 1 ? addDays(date, 1) : date,
      trabaja: day.works,
      responsable_id: day.works ? "worker-" + (index + 1) : null,
      estado: day.works ? "PROGRAMADA" : "DESCANSO",
      sesion_id: day.works || day.sessionState === "CANCELADA" ? "session-" + (index + 1) : null,
      sesion_estado: day.sessionState,
      es_responsable: false
    };
  });
}

function setup(t, options = {}) {
  let rows = options.rows || [];
  const admin = options.admin !== false;
  const calls = [];
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
      '<nav><button class="tab-btn" data-tab="jornada">Jornada</button></nav>' +
      '<section id="tab-jornada" class="tab-panel"></section>' +
    "</body></html>",
    {
      url: "https://battlecruiser-period-move.test/",
      runScripts: "outside-only",
      pretendToBeVisual: true
    }
  );
  const window = dom.window;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(window.document, "readyState", { configurable: true, value: "complete" });
  window.setInterval = () => 0;
  window.setTimeout = () => 0;
  window.confirm = () => true;
  window.scrollTo = () => {};
  window._usuarioActual = { id: "owner-1", rol: admin ? "Dueño" : "Dependienta" };
  window._cache = {
    almacenes: [{ id: "warehouse-1", nombre: "La Cueva", activo: true }],
    usuarios: []
  };
  Object.defineProperty(window, "crypto", {
    configurable: true,
    value: { randomUUID: () => "83000000-0000-0000-0000-000000000001" }
  });

  window.client = {
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      if (name === "bc_actor_is_admin") return { data: admin, error: null };
      if (name === "listar_usuarios_admin") {
        return {
          data: [
            { id: "worker-1", nombre: "Beatriz", rol: "Dependienta", activo: true, archivado: false },
            { id: "worker-3", nombre: "Carlos", rol: "Dependienta", activo: true, archivado: false }
          ],
          error: null
        };
      }
      if (name === "turno_actual_usuario") return { data: null, error: null };
      if (name === "bc5_mis_jornadas") return { data: rows, error: null };
      if (name === "bc5_reprogramar_periodo_jornada") {
        rows = rows.map((row) => ({
          ...row,
          fecha: addDays(payload.p_fecha_inicio, Number(row.numero_dia) - 1),
          fecha_fin: addDays(payload.p_fecha_inicio, Number(row.numero_dia) - 1)
        }));
        return {
          data: {
            turno_id: payload.p_turno_id,
            fecha_inicio: payload.p_fecha_inicio,
            fecha_fin: addDays(payload.p_fecha_inicio, rows.length - 1),
            dias_total: rows.length,
            filas_movidas: rows.length,
            idempotente: false
          },
          error: null
        };
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
  return { window, calls, getRows: () => rows, admin };
}

async function openMonthAndSelectSource(env, rows, expectMove = true) {
  if (env.admin) {
    const authorized = await waitFor(() => {
      const shortcut = env.window.document.querySelector("[data-bc7-open-planner]");
      return Boolean(shortcut && shortcut.hidden === false);
    });
    assert.ok(authorized, "wait for the ADMIN role check before asserting calendar controls");
  }
  // Non-admin tests do not wait for the planner shortcut. Wait for the first
  // calendar read so init has attached the month-change listener before this
  // helper changes the selected month.
  const initialLoad = await waitFor(() =>
    env.calls.some(call => call.name === "bc5_mis_jornadas")
  );
  assert.ok(initialLoad, "wait for the initial calendar read before changing the month");
  const monthInput = env.window.document.getElementById("bc7-calendar-month");
  monthInput.value = rows[0].fecha.slice(0, 7);
  monthInput.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  const loaded = await waitFor(() =>
    env.window.document.querySelector(
      '#bc7-month-board [data-bc7-calendar-select="' + rows[0].fecha + '"]'
    ) !== null
  );
  assert.ok(loaded, "the source period day should appear in the selected month");
  const periodChip=env.window.document.querySelector(
    '#bc7-month-board .bc7-month-chip[data-bc7-calendar-select="' + rows[0].fecha + '"]'
  );
  assert.ok(periodChip,"the Jornada parent period must render as a calendar chip");
  periodChip.click();
  if (!expectMove) return true;
  return await waitFor(() =>
    env.window.document.querySelector("#bc7-calendar-detail [data-bc7-period-move]") !== null
  );
}

test("admin can preview, change and confirm a whole future period with an idempotency key", async (t) => {
  const start = addDays(todayHavana(), 10);
  const rows = periodRows(start);
  const env = setup(t, { rows });
  const selected = await openMonthAndSelectSource(env, rows);
  assert.ok(selected, "the admin should see the whole-period move action");

  env.window.document.querySelector(
    '#bc7-calendar-detail [data-bc7-period-move="programming-1"]'
  ).click();

  const previewReady = await waitFor(() =>
    env.window.document.querySelector("#bc7-period-move-preview form") !== null
  );
  assert.ok(previewReady, "the preflight query should populate a preview card");
  const preview = env.window.document.querySelector("#bc7-period-move-preview");
  assert.match(preview.textContent, /Mover período completo/);
  assert.match(preview.textContent, /3 días/);
  assert.match(preview.textContent, /TODAVÍA SIN GUARDAR/);

  const nextStart = addDays(start, 5);
  const dateInput = preview.querySelector("[data-bc7-period-start]");
  const reasonInput = preview.querySelector("[data-bc7-period-reason]");
  const submit = preview.querySelector("[data-bc7-period-confirm]");
  dateInput.value = nextStart;
  dateInput.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  reasonInput.value = "Ajuste de la planificación semanal";
  reasonInput.dispatchEvent(new env.window.Event("input", { bubbles: true }));
  assert.equal(submit.disabled, false, "date and required reason enable the confirmation button");

  preview.querySelector("form").dispatchEvent(new env.window.Event("submit", {
    bubbles: true,
    cancelable: true
  }));

  const saved = await waitFor(() =>
    env.calls.some((call) => call.name === "bc5_reprogramar_periodo_jornada")
  );
  assert.ok(saved, "confirmation should call the atomic period RPC");
  const write = env.calls.find((call) => call.name === "bc5_reprogramar_periodo_jornada");
  assert.deepEqual(JSON.parse(JSON.stringify(write.payload)), {
    p_turno_id: "turn-period-1",
    p_fecha_inicio: nextStart,
    p_motivo: "Ajuste de la planificación semanal",
    p_idempotency_key: "83000000-0000-0000-0000-000000000001"
  });
  const previewClosed = await waitFor(() =>
    env.window.document.querySelector("#bc7-period-move-preview") === null
  );
  assert.ok(previewClosed, "the preview should close after the RPC response and calendar refresh complete");
  assert.equal(env.window.document.getElementById("bc7-calendar-month").value, nextStart.slice(0, 7));
});

test("admin preflight rejects incomplete periods and never calls the write RPC", async (t) => {
  const start = addDays(todayHavana(), 10);
  const rows = periodRows(start).filter((row) => row.numero_dia !== 2);
  const env = setup(t, { rows });
  const selected = await openMonthAndSelectSource(env, rows);
  assert.ok(selected, "a future daily row offers a preflight action");
  env.window.document.querySelector(
    '#bc7-calendar-detail [data-bc7-period-move="programming-1"]'
  ).click();

  await waitFor(() =>
    env.window.document.getElementById("bc7-list-msg")?.textContent.includes("No se pudo preparar el traslado")
  );
  assert.equal(env.window.document.querySelector("#bc7-period-move-preview"), null);
  assert.equal(env.calls.some((call) => call.name === "bc5_reprogramar_periodo_jornada"), false);
});

test("active, consolidated and non-admin rows cannot expose a whole-period move control", async (t) => {
  const start = addDays(todayHavana(), 10);
  const active = periodRows(start, {
    dayStates: [
      { works: true, sessionState: "EN_CURSO" },
      { works: false, sessionState: null },
      { works: true, sessionState: "PROGRAMADA" }
    ]
  });
  const env = setup(t, { rows: active });
  await openMonthAndSelectSource(env, active, false);
  assert.equal(
    env.window.document.querySelector("#bc7-calendar-detail [data-bc7-period-move]"),
    null,
    "a started session must not offer a period move"
  );
  assert.equal(
    env.window.document.querySelector('#bc7-month-board [data-bc7-period-drag]'),
    null,
    "a started session must not be draggable"
  );

  const consolidated = periodRows(start, { consolidatedDay: 1 });
  const envConsolidated = setup(t, { rows: consolidated });
  await openMonthAndSelectSource(envConsolidated, consolidated, false);
  assert.equal(
    envConsolidated.window.document.querySelector("#bc7-calendar-detail [data-bc7-period-move]"),
    null,
    "a multi-date consolidated history row must not be moved as a daily schedule"
  );

  const nonAdmin = setup(t, { rows: periodRows(start), admin: false });
  await openMonthAndSelectSource(nonAdmin, periodRows(start), false);
  assert.equal(
    nonAdmin.window.document.querySelector("#bc7-calendar-detail [data-bc7-period-move]"),
    null,
    "a non-admin cannot see the whole-period move action"
  );
  assert.equal(nonAdmin.window.document.querySelector("[data-bc7-period-move-form]"), null);
});
