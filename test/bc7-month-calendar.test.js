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

  const legacyRestChip=window.document.querySelector(
    '#bc7-month-board [data-bc7-calendar-select="' + month + '-06"]'
  );
  assert.ok(legacyRestChip,"the second date of the same parent period should remain visible");
  assert.equal(legacyRestChip.classList.contains("is-rest"),false,
    "legacy status data must not reintroduce a visible rest category");
  assert.doesNotMatch(legacyRestChip.textContent,/descanso/i);
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
  const { window, calls } = setup(t, { admin: true, rows: [] });
  assert.ok(window.document.getElementById("bc7-visual-calendar-modal"),
    "desktop visual-calendar modal must exist before authenticated boot");

  // Complete the initial authenticated boot before opening the async desktop view.
  const bootReady = await waitFor(() =>
    calls.some(call => call.name === "turno_actual_usuario") &&
    calls.some(call => call.name === "bc5_mis_jornadas") &&
    window.document.getElementById("bc7-admin-details")?.hidden === false &&
    window.document.querySelector("#bc7-month-board .bc7-month-day")
  );
  assert.ok(bootReady, "the Jornada admin boot and first calendar read must finish before opening the visual view");
  await new Promise(resolve => setTimeout(resolve, 20));

  window.matchMedia = () => ({ matches: true });
  const trigger = window.document.querySelector("[data-bc7-open-visual-calendar]");
  const modal = window.document.getElementById("bc7-visual-calendar-modal");
  assert.ok(trigger && modal,
    "the visual-calendar control and modal must be re-queried after authenticated boot re-renders the Jornada shell");
  trigger.click();
  assert.equal(modal.hidden, false, "desktop activation should open the live visual calendar");
  // This test covers the calendar layout, not the authenticated warehouse refresh.
  // The base calendar opens and renders from its own cache/RPC; the advanced F3
  // warehouse selector is covered by the planner module tests.
  await new Promise(resolve => setTimeout(resolve, 30));

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
  assert.match(styles, /\.bc7-visual-calendar-layout\{display:grid;grid-template-columns:minmax\(0,1fr\) 400px/,
    "desktop board and inspector must use a two-column layout");
  assert.match(styles, /\.bc7-visual-calendar-side \.bc7-calendar-detail\{display:flex;flex:1 1 0;flex-direction:column;min-height:170px;max-height:none;overflow:auto/,
    "the selected-day details should use the inspector height instead of a cramped 48% scroll box");
  assert.match(styles, /\.bc7-visual-calendar-side \.bc7-calendar-detail \.bc7-jornada-top\{display:grid;grid-template-columns:minmax\(0,1fr\);/,
    "journey status must sit below the date instead of squeezing its title");
  assert.match(styles, /#tab-jornada \.bc7-month-chip-status\{display:none\}/,
    "month cells should prioritize the responsible person's name; status remains encoded by the chip color and accessible label");
  assert.match(styles, /@media\(min-width:761px\) and \(max-height:760px\).*?390px/,
    "short desktop windows must preserve the wider inspector");
  assert.match(styles, /\.bc7-visual-calendar-side\{display:flex;flex-direction:column/,
    "the inspector must keep its visible desktop layout");
  assert.match(styles, /@media\(min-width:761px\) and \(max-width:1120px\).*?320px/,
    "the inspector must retain a responsive desktop width");
});

test("archived journeys remain visible on the monthly board and inspector, but read-only", async (t) => {
  const month = currentMonth();
  const historical = {
    id: "programming-historic", turno_id: "turno-historic", almacen_id: "warehouse-1",
    numero_dia: 1, fecha: month + "-08", fecha_fin: month + "-10", trabaja: true,
    responsable_id: "dep-1", estado: "PROGRAMADA", sesion_id: "session-historic",
    sesion_estado: "COMPLETADA", turno_estado_maestro: "CERRADO", es_responsable: false
  };
  const { window } = setup(t, { admin: true, rows: [historical] });
  await waitFor(() => window.document.querySelector("#bc7-month-board .bc7-month-chip"));
  assert.ok(window.document.querySelector('#bc7-month-board [data-bc7-calendar-select="' + month + '-09"]'));
  assert.equal(window.document.querySelectorAll("#bc7-schedule-list .bc7-jornada").length, 0);
  assert.equal(window.document.getElementById("bc7-archived-schedule-count").textContent, "1");
  window.document.querySelector('#bc7-month-board [data-bc7-calendar-select="' + month + '-09"]').click();
  const inspector = window.document.getElementById("bc7-calendar-detail");
  assert.match(inspector.textContent, /Beatriz/);
  assert.ok(inspector.querySelector('[data-bc7-open="session-historic"]'));
  assert.equal(inspector.querySelector("[data-bc7-reschedule]"), null);
});

test("a multi-day Jornada spans every covered date and appears in the inspector on intermediate days", async (t) => {
  const month = currentMonth(), start = month + "-05", middle = month + "-06", end = month + "-07";
  const row = {
    id: "programming-span", turno_id: "turno-span", almacen_id: "warehouse-1",
    numero_dia: 1, fecha: start, fecha_fin: end, trabaja: true,
    responsable_id: "dep-1", estado: "PROGRAMADO", sesion_id: "session-span",
    sesion_estado: "EN_CURSO", es_responsable: false
  };
  const { window } = setup(t, { admin: true, rows: [row] });
  await waitFor(() => window.document.querySelector('#bc7-month-board [data-bc7-calendar-select="' + start + '"]'));
  const first = window.document.querySelector('#bc7-month-board [data-bc7-calendar-select="' + start + '"].is-range-start');
  const second = window.document.querySelector('#bc7-month-board [data-bc7-calendar-select="' + middle + '"].is-range-middle');
  const third = window.document.querySelector('#bc7-month-board [data-bc7-calendar-select="' + end + '"].is-range-end');
  assert.ok(first && second && third);
  assert.match(first.getAttribute("aria-label"), /Beatriz/);
  window.document.querySelector('#bc7-month-board [data-bc7-calendar-select="' + middle + '"]').click();
  const detail = window.document.getElementById("bc7-calendar-detail");
  assert.match(detail.textContent, /Beatriz/);
  assert.match(detail.textContent, /\b5\b/);
  assert.match(detail.textContent, /\b7\b/);
});

test("visual preflight applies one responsible to all working days of the Jornada", async (t) => {
  const {window}=setup(t,{admin:true,rows:[]});
  const adminReady=await waitFor(()=>window.document.getElementById("bc7-admin-details")?.hidden===false);
  assert.ok(adminReady);
  await window.__BC7_JORNADA__.refreshResponsibleStaff();
  const validation=await window.__BC7_JORNADA__.visualPlanner.previewDraft({
    warehouseId:"warehouse-1",startDate:"2099-01-05",days:2,responsableId:"dep-1",
    schedule:[
      {numero_dia:1,trabaja:true,responsable_id:"dep-1"},
      {numero_dia:2,trabaja:true,responsable_id:"different-day-person"}
    ]
  });
  assert.equal(validation.valid,true);
  assert.equal(validation.schedule.map(day=>day.responsable_id).join(","),"dep-1,dep-1");
  assert.equal(validation.responsableId,"dep-1");
});

test("Jornada read RPC exposes the parent-period and master-close fields used by the calendar", () => {
  const migration=fs.readFileSync(path.join(__dirname,"..","supabase","migrations","20261127232000_jornada_parent_period_metadata.sql"),"utf8");
  assert.ok(migration.includes("JOIN public.turnos t ON t.id=p.turno_id"));
  assert.ok(migration.includes("'turno_fecha_inicio',t.fecha"));
  assert.ok(migration.includes("'dias_turno',t.dias_turno"));
  assert.ok(migration.includes("'turno_estado_maestro',coalesce(t.estado_maestro,t.estado)"));
});

test("manual scheduling preview is local and a changed assignment must be reviewed again", async (t) => {
  const { window, calls } = setup(t, { admin: true, rows: [] });

  // Wait for the authenticated admin boot to finish before editing the form:
  // boot() replaces the tab shell while it hydrates the responsible catalog.
  const adminReady = await waitFor(() => {
    const panel = window.document.getElementById("bc7-admin-details");
    return !!panel && panel.hidden === false;
  });
  assert.ok(adminReady, "the admin planner must finish booting before the test edits it");
  const responsibleCatalog = await window.__BC7_JORNADA__.refreshResponsibleStaff();
  assert.equal(responsibleCatalog.length, 1, "the eligible responsible catalog must be ready");

  const warehouse = window.document.getElementById("bc7-warehouse");
  assert.equal(warehouse.options.length, 2, "the fixture must expose the active warehouse");
  warehouse.value = "warehouse-1";
  assert.equal(window.document.getElementById("bc7-plan-mode"), null, "the obsolete mode selector is no longer part of the single-responsible period form");
  window.document.getElementById("bc7-period-responsible").value = "dep-1";

  const havanaToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Havana", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  const parts = havanaToday.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(parts[0], parts[1]-1, parts[2]+1, 12)).toISOString().slice(0,10);
  window.document.getElementById("bc7-start-date").value = tomorrow;
  window.document.getElementById("bc7-days-count").value = "2";
  window.document.querySelector("[data-bc7-build]").click();
  const rowsReady = await waitFor(() => {
    const selects = Array.from(window.document.querySelectorAll("#bc7-day-rows [data-bc7-person]"));
    return selects.length === 2 && selects.every(select => !select.disabled && Array.from(select.options).some(option => option.value === "dep-1"));
  });
  assert.ok(rowsReady, "the planner must render two working days with the loaded responsible");
  window.document.querySelectorAll("#bc7-day-rows [data-bc7-person]").forEach(select => {
    select.value = "dep-1";
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  const workInputs = Array.from(window.document.querySelectorAll("#bc7-day-rows [data-bc7-works]"));
  const personSelects = Array.from(window.document.querySelectorAll("#bc7-day-rows [data-bc7-person]"));
  assert.equal(workInputs.length, 2, "the planner must expose both daily work/rest controls");
  assert.equal(personSelects.length, 2, "the planner must expose both responsible selectors");
  assert.deepEqual(workInputs.map(input => input.checked), [true, true]);
  assert.deepEqual(personSelects.map(select => select.value), ["dep-1", "dep-1"]);
  window.document.querySelector("[data-bc7-preview]").click();
  const previewed = await waitFor(() => /Vista previa de tu asignación/.test(window.document.getElementById("bc7-create-msg").textContent));
  assert.ok(previewed, "the explicit assignment should pass local validation and render a preview");
  assert.equal(calls.some(call => call.name === "bc5_previsualizar_jornada"), false,
    "day-by-day preview must not use the saved-rotation RPC");
  assert.equal(window.document.querySelectorAll("#bc7-preview .bc7-jornada").length, 2,
    "the local preview should render both requested days");
  const changedStart = new Date(Date.UTC(parts[0], parts[1]-1, parts[2]+2, 12)).toISOString().slice(0,10);
  const startInput = window.document.getElementById("bc7-start-date");
  startInput.value = changedStart;
  startInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(window.document.getElementById("bc7-preview").textContent, "",
    "changing the date must clear the now-stale local preview");
  assert.equal(calls.some(call => call.name === "bc5_crear_jornada_unica"), false,
    "previewing and editing the form must remain read-only until the owner creates it");
});
