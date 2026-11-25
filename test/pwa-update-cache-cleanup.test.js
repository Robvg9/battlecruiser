"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (relative) => fs.readFileSync(relative, "utf8");
const auth = read("public/js/auth.js");
const cacheUpdater = read("public/js/cache-update-fix.js");
const app = read("public/app.js");
const serviceWorker = read("public/service-worker.js");
const index = read("public/index.html");

test("manual PWA updater clears both app-owned release cache namespaces", () => {
  assert.match(
    auth,
    /return k === "battlecruiser"\s*\|\|\s*k\.startsWith\("battlecruiser-shell-"\)\s*\|\|\s*k\.startsWith\("battlecruiser-static-"\);/,
    "the original login updater must clear shell and static release caches"
  );
  assert.match(
    cacheUpdater,
    /return name === "battlecruiser"\s*\|\|\s*name\.startsWith\("battlecruiser-shell-"\)\s*\|\|\s*name\.startsWith\("battlecruiser-static-"\);/,
    "the scoped updater must clear shell and static release caches"
  );
  assert.doesNotMatch(
    cacheUpdater,
    /startsWith\("battlecruiser"\)/,
    "cleanup must not broaden to unrelated future caches"
  );
});

test("an active old Service Worker cannot prune caches while a new worker is waiting", () => {
  const start = serviceWorker.indexOf('if (event.data.type === "PRUNE_OLD_RELEASES"');
  assert.notEqual(start, -1, "release cache pruning handler must exist");
  const end = serviceWorker.indexOf("\n    }));", start);
  assert.ok(end > start, "release cache pruning handler must have a closing boundary");
  const pruneHandler = serviceWorker.slice(start, end);
  assert.match(
    pruneHandler,
    /self\.registration\s*&&\s*\(self\.registration\.installing\s*\|\|\s*self\.registration\.waiting\)/,
    "the old active worker must defer cleanup while a new worker is waiting"
  );
  assert.ok(
    pruneHandler.indexOf("self.registration.waiting") < pruneHandler.indexOf("self.clients.matchAll"),
    "the waiting-worker guard must run before any cache pruning"
  );
});

test("cache updater and release assets use fresh immutable version keys", () => {
  assert.match(app, /const VERSION="9\.5\.157"/);
  assert.match(app, /\["cache-update-fix\.js","1\.1"\]/);
  assert.match(serviceWorker, /BC_SW_VERSION = "9\.5\.157"/);
  assert.match(serviceWorker, /cache-update-fix\.js\?v=1\.1/);
  assert.match(index, /style\.css\?v=9\.5\.157/);
  assert.match(index, /app\.js\?v=9\.5\.157/);
});
