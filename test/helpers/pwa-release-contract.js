"use strict";
function valueAfter(assert, source, marker, label) {
  const text = String(source || "");
  const markerAt = text.indexOf(marker);
  assert.ok(markerAt >= 0, label + " marker must exist");
  if (markerAt < 0) return null;
  const start = markerAt + marker.length;
  const end = text.indexOf('"', start);
  assert.ok(end > start, label + " value must be quoted and non-empty");
  return end > start ? text.slice(start, end) : null;
}
function assertPwaReleaseAligned(assert, { app, serviceWorker, index }) {
  const appVersion = valueAfter(assert, app, 'const VERSION="', "app.js version");
  const workerVersion = valueAfter(assert, serviceWorker, 'BC_SW_VERSION = "', "Service Worker version");
  const indexVersion = valueAfter(assert, index, 'app.js?v=', "index.html app.js cache key");
  assert.ok(appVersion && appVersion.split(".").length === 3, "app.js release must have three numeric version parts");
  assert.equal(workerVersion, appVersion, "Service Worker and app.js release versions must match");
  assert.equal(indexVersion, appVersion, "index.html app.js cache key must match app.js release");
  assert.ok(String(index).includes("v" + appVersion + " — BattleCruiser"), "visible PWA version label must match app.js release");
  return { appVersion, workerVersion, indexVersion };
}
function assertModuleCacheAligned(assert, { app, serviceWorker, moduleName }) {
  const appVersion = valueAfter(assert, app, '["' + moduleName + '","', moduleName + " app.js loader version");
  const workerVersion = valueAfter(assert, serviceWorker, moduleName + "?v=", moduleName + " Service Worker cache version");
  assert.equal(workerVersion, appVersion, moduleName + " online and offline cache keys must match");
  return { appVersion, workerVersion };
}
module.exports = { assertPwaReleaseAligned, assertModuleCacheAligned };
