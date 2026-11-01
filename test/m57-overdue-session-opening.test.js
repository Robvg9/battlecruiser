"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const JS_DIR = path.join(__dirname, "..", "public", "js");
const m56Source = fs.readFileSync(path.join(JS_DIR, "m56-turnos-secuencia-ui.js"), "utf8");
const m57Source = fs.readFileSync(path.join(JS_DIR, "m57-turnos-sesion-ux-fix.js"), "utf8");

function loadSequenceGuard(source, windowOverrides = {}) {
  const window = { ...windowOverrides };
  const document = {
    readyState: "loading",
    addEventListener() {},
    querySelector() {
      throw new Error("The UI observer must not run during the pure eligibility test.");
    }
  };
  const sandbox = { window, document, console, setTimeout, clearTimeout };
  vm.runInNewContext(source, sandbox, { filename: "turnos-sequence-guard.js" });
  return window;
}

function addDays(isoDate, offset) {
  const date = new Date(isoDate + "T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function session(id, day, block, date, state) {
  return { id, numero_dia: day, bloque: block, fecha: date, estado: state };
}

test("M57 permits the next overdue session but never skips an unresolved predecessor", () => {
  const window = loadSequenceGuard(m57Source);
  const guard = window.__BC_M57;
  assert.equal(typeof guard.eligibleId, "function");

  const today = guard.today();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);

  const rows = [
    session("day-1-am", 1, "MANANA", yesterday, "COMPLETADA"),
    session("day-1-pm", 1, "TARDE", yesterday, "CANCELADA"),
    session("day-2-am", 2, "MANANA", yesterday, "PROGRAMADA"),
    session("day-2-pm", 2, "TARDE", yesterday, "CANCELADA"),
    session("day-3-am", 3, "MANANA", tomorrow, "PROGRAMADA")
  ];

  assert.equal(guard.eligibleId(rows), "day-2-am");
  assert.equal(
    guard.eligibleId([session("future-only", 1, "MANANA", tomorrow, "PROGRAMADA")]),
    null,
    "future sessions must remain locked"
  );
  assert.equal(
    guard.eligibleId([
      session("unresolved-older", 1, "MANANA", yesterday, "PROGRAMADA"),
      session("today-later", 2, "MANANA", today, "PROGRAMADA")
    ]),
    null,
    "a later session must remain locked while its predecessor is unresolved"
  );
});

test("M56 yields button ownership to the canonical M57 guard", () => {
  const window = loadSequenceGuard(m56Source, { __bcM57TurnosSessionUx: true });
  assert.equal(typeof window.__BC_M56.renderSequence, "function");
  assert.doesNotThrow(() => window.__BC_M56.renderSequence());
});

test("M57 remains the single sequence owner and the new module versions are referenced", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(app, /m56-turnos-secuencia-ui\.js","56\.8"/);
  assert.match(app, /m57-turnos-sesion-ux-fix\.js","57\.6"/);
  assert.match(m57Source, /eligibleId:eligibleId,version:'57\.6'/);
  assert.match(m56Source, /disable:disable/);
});
