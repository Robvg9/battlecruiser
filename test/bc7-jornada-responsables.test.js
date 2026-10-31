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

async function waitFor(predicate, timeout = 2500) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

function setup(t, rpcHandler) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
      '<nav><button class="tab-btn" data-tab="turnos">Turnos</button></nav>' +
      '<section id="tab-turnos" class="tab-panel"></section>' +
    "</body></html>",
    {
      url: "https://battlecruiser-step7-staff.test/",
      runScripts: "outside-only",
      pretendToBeVisual: true
    }
  );

  const { window } = dom;
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: true
  });
  Object.defineProperty(window.document, "readyState", {
    configurable: true,
    value: "complete"
  });

  window.setInterval = () => 0;
  window.confirm = () => true;
  window._usuarioActual = { id: "owner-1", rol: "Dueño" };
  window._cache = {
    almacenes: [{ id: "warehouse-1", nombre: "La Cueva", activo: true }],
    usuarios: []
  };

  const calls = [];
  window.client = {
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      return rpcHandler(name, payload, calls.length);
    }
  };

  window.eval(SOURCE);
  t.after(() => window.close());
  return { window, calls };
}

const activeStaff = [
  { id: "dep-2", nombre: "Beatriz", rol: "Dependienta", activo: true, archivado: false },
  { id: "owner-2", nombre: "Dueño suplente", rol: "Dueño", activo: true, archivado: false },
  { id: "inactive", nombre: "Dependienta inactiva", rol: "Dependienta", activo: false, archivado: false },
  { id: "archived", nombre: "Dependienta archivada", rol: "Dependienta", activo: true, archivado: true },
  { id: "warehouse-user", nombre: "Almacenero", rol: "Almacenero", activo: true, archivado: false }
];

test("Step 7 loads eligible responsible users from the authoritative server catalog", async (t) => {
  const { window, calls } = setup(t, async (name) => {
    if (name === "bc_actor_is_admin") return { data: true, error: null };
    if (name === "listar_usuarios_admin") {
      return { data: activeStaff, error: null };
    }
    if (name === "bc5_mis_jornadas") return { data: [], error: null };
    throw new Error("Unexpected RPC: " + name);
  });

  const ready = await waitFor(() => {
    const selects = Array.from(window.document.querySelectorAll("#bc7-day-rows [data-bc7-person]"));
    return selects.length === 7 &&
      selects.every((select) => select.options.length === 3 && !select.disabled);
  });

  assert.ok(ready, "seven planner selectors should load active eligible users");
  const selects = Array.from(window.document.querySelectorAll("#bc7-day-rows [data-bc7-person]"));
  const expectedValues = ["", "dep-2", "owner-2"];

  for (const select of selects) {
    assert.deepEqual(
      Array.from(select.options).map((option) => option.value),
      expectedValues
    );
    assert.equal(select.options[1].textContent, "Beatriz");
  }

  assert.match(
    window.document.getElementById("bc7-staff-status").textContent,
    /2 responsables activos disponibles/
  );
  assert.equal(calls.filter((call) => call.name === "listar_usuarios_admin").length, 1);
  assert.equal(window.__BC_M29_STAFF_CACHE_LOADED__, true);
  assert.equal(window.document.getElementById("bc7-staff-retry").hidden, true);
  assert.equal(
    calls.filter((call) => call.name === "listar_usuarios_admin")[0].payload.p_incluir_archivados,
    false
  );
  assert.equal(
    calls.some((call) => /crear|guardar|reprogramar|cerrar|iniciar/.test(call.name)),
    false,
    "loading the staff catalog must not write operational data"
  );
});

test("Step 7 exposes a retry after staff lookup failure and preserves a selected user", async (t) => {
  let staffAttempt = 0;
  const { window, calls } = setup(t, async (name) => {
    if (name === "bc_actor_is_admin") return { data: true, error: null };
    if (name === "listar_usuarios_admin") {
      staffAttempt += 1;
      if (staffAttempt === 1) {
        return { data: null, error: { message: "Temporary staff catalog outage" } };
      }
      return { data: activeStaff, error: null };
    }
    if (name === "bc5_mis_jornadas") return { data: [], error: null };
    throw new Error("Unexpected RPC: " + name);
  });

  const failed = await waitFor(() => {
    const button = window.document.getElementById("bc7-staff-retry");
    const status = window.document.getElementById("bc7-staff-status");
    return button && !button.hidden && status &&
      status.textContent.includes("Temporary staff catalog outage");
  });
  assert.ok(failed, "a failed catalogue fetch must expose the error and retry action");

  const disabled = window.document.querySelector("#bc7-day-rows [data-bc7-person]");
  assert.ok(disabled && disabled.disabled, "the planner must not offer an empty or unverified selection");

  const retry = window.document.getElementById("bc7-staff-retry");
  retry.click();
  const loaded = await waitFor(() => {
    const select = window.document.querySelector("#bc7-day-rows [data-bc7-person]");
    return select && select.options.length === 3 && !select.disabled;
  });
  assert.ok(loaded, "retry should hydrate the responsible selectors");

  const first = window.document.querySelector("#bc7-day-rows [data-bc7-person]");
  first.value = "dep-2";
  const refreshed = await window.__BC7_JORNADA__.refreshResponsibleStaff();
  assert.equal(refreshed.length, 2);
  assert.equal(first.value, "dep-2", "refreshing the catalogue must preserve a still-eligible selection");
  assert.equal(staffAttempt, 3, "one failed startup fetch, one retry and one explicit refresh");
  assert.equal(calls.filter((call) => call.name === "listar_usuarios_admin").length, 3);
  assert.equal(
    calls.some((call) => /crear|guardar|reprogramar|cerrar|iniciar/.test(call.name)),
    false,
    "catalogue recovery must remain read-only"
  );
});
