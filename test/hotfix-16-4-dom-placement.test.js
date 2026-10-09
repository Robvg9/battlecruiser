"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

test("BC 16.4 hotfix inserts button beside nested form and restores form safely", () => {
  const sourcePath = path.join(__dirname, "..", "public", "js", "hotfix-16-4-agregar-producto-modal-20260902.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <section id="tab-productos">
      <div id="nested-product-form">
        <form id="form-producto">
          <label>Nombre <input name="nombre" /></label>
          <button id="prod-submit-btn" type="button">Guardar producto</button>
        </form>
      </div>
    </section>
  </body></html>`, { url: "https://battlecruiser.test/", runScripts: "outside-only", pretendToBeVisual: true });

  const { window } = dom;
  const errors = [];
  window.addEventListener("error", (event) => errors.push(event.error || event.message));

  // The production hotfix schedules five idempotent install attempts. Execute
  // them synchronously in this unit test so every retry is exercised without
  // waiting 2.5 seconds.
  const realSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = (callback) => { callback(); return 1; };

  try {
    window.eval(source);
    window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

    const tab = window.document.getElementById("tab-productos");
    const form = window.document.getElementById("form-producto");
    const button = window.document.getElementById("bc164-add-open");
    const parent = form.parentNode;

    assert.deepEqual(errors, [], "hotfix must not throw when the product form is nested under the tab");
    assert.ok(button, "add-product button should be installed");
    assert.equal(button.parentNode, parent, "button must be inserted beside the form placeholder in its actual parent");
    assert.equal(window.document.querySelectorAll("#bc164-add-open").length, 1, "repeated install attempts must remain idempotent");
    assert.equal(window.__BC164_verify().modalButton, true);

    window.__BC164_open();
    assert.equal(window.document.getElementById("bc164-form-host").querySelector("#form-producto"), form, "opening the modal should move the original form into the modal");
    assert.ok(window.document.getElementById("bc164-overlay"), "modal should be open");

    window.__BC164_close();
    assert.equal(form.parentNode, parent, "closing the modal should restore the form to its original nested parent");
    assert.equal(button.parentNode, parent, "the add button should remain next to its placeholder");
    assert.equal(window.document.getElementById("bc164-overlay"), null, "closing the modal should remove the overlay");
    assert.equal(window.document.querySelectorAll("#bc164-add-open").length, 1);
    assert.equal(window.__BC164_verify().formPresent, true);
  } finally {
    window.setTimeout = realSetTimeout;
    dom.window.close();
  }
});
