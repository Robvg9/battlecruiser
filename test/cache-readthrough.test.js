// Step 4/15 — offline read cache: server → IndexedDB → offline fallback → fresh reconnect.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");

test("withCache persists read-only server data, serves cache offline and replaces it after recovery", async (t) => {
  const oldWindow = global.window;
  const oldDocument = global.document;
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => {
    throw error;
  });

  const dom = new JSDOM(
    '<!doctype html><html><head></head><body>' +
      '<div id="conn-status"><span id="conn-text"></span></div>' +
      '<div id="conn-status-app"><span id="conn-text-app"></span></div>' +
      '<span id="cola-pendientes-badge" class="hidden"></span>' +
    '</body></html>',
    { runScripts: "dangerously", url: "https://battlecruiser.test/", virtualConsole }
  );
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  Object.defineProperty(window, "indexedDB", { value: new IDBFactory(), configurable: true });
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true, writable: true });

  const prelude = 