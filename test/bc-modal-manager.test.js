"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const MANAGER = fs.readFileSync(path.join(__dirname, "..", "public/js/bc-modal-manager.js"), "utf8");

function createWindow(html) {
  const dom = new JSDOM(html || `<!doctype html><html><body>
    <button id="opener" type="button">Open</button>
    <div id="modal" class="hidden" aria-hidden="true">
      <section role="dialog" tabindex="-1" aria-modal="true">
        <button id="first" type="button">First</button>
        <button id="last" type="button">Last</button>
        <button id="close" type="button" data-close>Close</button>
      </section>
    </div>
  </body></html>`, { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  dom.window.eval(MANAGER);
  return dom;
}

test("shared modal traps keyboard focus, closes on Escape and restores focus and scroll", () => {
  const dom = createWindow();
  try {
    const doc = dom.window.document;
    doc.body.style.overflow = "clip";
    doc.documentElement.style.overflow = "auto";

    const opener = doc.getElementById("opener");
    const modal = doc.getElementById("modal");
    opener.focus();

    const controller = dom.window.BCModalManager.create(modal, {
      dialogSelector: '[role="dialog"]',
      initialFocusSelector: "#first",
      closeSelector: "[data-close]"
    });

    assert.equal(controller.open(), true);
    assert.equal(modal.classList.contains("hidden"), false);
    assert.equal(modal.getAttribute("aria-hidden"), "false");
    assert.equal(doc.body.style.overflow, "hidden");
    assert.equal(doc.documentElement.style.overflow, "hidden");
    assert.equal(doc.activeElement.id, "first");

    const forward = new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    doc.getElementById("last").focus();
    doc.getElementById("last").dispatchEvent(forward);
    assert.equal(forward.defaultPrevented, true);
    assert.equal(doc.activeElement.id, "first");

    const backward = new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    doc.getElementById("first").focus();
    doc.getElementById("first").dispatchEvent(backward);
    assert.equal(backward.defaultPrevented, true);
    assert.equal(doc.activeElement.id, "close");

    const escape = new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    doc.getElementById("close").dispatchEvent(escape);
    assert.equal(escape.defaultPrevented, true);
    assert.equal(controller.isOpen(), false);
    assert.equal(modal.classList.contains("hidden"), true);
    assert.equal(modal.getAttribute("aria-hidden"), "true");
    assert.equal(doc.body.style.overflow, "clip");
    assert.equal(doc.documentElement.style.overflow, "auto");
    assert.equal(doc.activeElement, opener);
  } finally {
    dom.window.close();
  }
});

test("nested modal controllers keep page scroll locked until the last modal closes", () => {
  const dom = createWindow(`<!doctype html><html><body style="overflow:scroll">
    <button id="opener">Open</button>
    <div id="one" class="hidden" aria-hidden="true"><section role="dialog" tabindex="-1"><button>One</button></section></div>
    <div id="two" class="hidden" aria-hidden="true"><section role="dialog" tabindex="-1"><button>Two</button></section></div>
  </body></html>`);
  try {
    const doc = dom.window.document;
    const one = dom.window.BCModalManager.create(doc.getElementById("one"));
    const two = dom.window.BCModalManager.create(doc.getElementById("two"));

    one.open();
    two.open();
    assert.equal(doc.body.style.overflow, "hidden");
    one.close({ restoreFocus: false });
    assert.equal(doc.body.style.overflow, "hidden");
    two.close({ restoreFocus: false });
    assert.equal(doc.body.style.overflow, "scroll");
  } finally {
    dom.window.close();
  }
});

test("non-dismissible modal can disable Escape and backdrop close for mandatory flows", () => {
  const dom = createWindow();
  try {
    const doc = dom.window.document;
    const modal = doc.getElementById("modal");
    const controller = dom.window.BCModalManager.create(modal, {
      closeOnEscape: false,
      closeOnBackdrop: false
    });

    controller.open();
    doc.querySelector('#modal [role="dialog"] button').dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    modal.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    assert.equal(controller.isOpen(), true);
    controller.close({ restoreFocus: false });
    assert.equal(controller.isOpen(), false);
  } finally {
    dom.window.close();
  }
});

test("shared modal restores a configured trigger even when touch input did not focus it", () => {
  const dom = createWindow();
  try {
    const doc = dom.window.document;
    const opener = doc.getElementById("opener");
    const modal = doc.getElementById("modal");
    assert.notEqual(doc.activeElement, opener);

    const controller = dom.window.BCModalManager.create(modal, {
      returnFocusSelector: "#opener"
    });
    controller.open();
    controller.close();
    assert.equal(doc.activeElement, opener);
  } finally {
    dom.window.close();
  }
});

test("manager is idempotent and close controls are delegated by the overlay", () => {
  const dom = createWindow();
  try {
    const win = dom.window;
    const modal = win.document.getElementById("modal");
    const controller = win.BCModalManager.create(modal, { closeSelector: "[data-close]" });
    const original = win.BCModalManager;
    win.eval(MANAGER);
    assert.equal(win.BCModalManager, original);

    controller.open();
    win.document.getElementById("close").click();
    assert.equal(controller.isOpen(), false);
    assert.equal(modal.classList.contains("hidden"), true);
  } finally {
    dom.window.close();
  }
});
