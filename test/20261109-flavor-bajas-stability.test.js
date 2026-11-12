"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),read=file=>fs.readFileSync(path.join(root,file),"utf8");
test("Flavor save always renders an in-modal live feedback target and requires the conversion acknowledgment visibly",()=>{
 const js=read("public/js/productos.js"),css=read("public/style.css");
 assert.match(js,/data-mixed-save-feedback role="status" aria-live="polite"/);
 assert.match(js,/data-confirm-mixed-conversion required aria-describedby="bc-mixed-conversion-help"/);
 assert.match(js,/function mostrarFeedbackAsignacionMixta\(message, success\)/);
 assert.doesNotMatch(js,/if \(!feedback\) return;/);
 assert.match(css,/\.bc-mixed-assignment-confirm[^\n]*grid-template-columns:20px minmax\(0,1fr\)/);
 assert.match(css,/\.bc-mixed-assignment-confirm > span[^\n]*overflow-wrap:anywhere/);
});
test("Bajas retries persist the same idempotency key by canonical request payload",()=>{
 const js=read("public/js/bajas-multiple.js");
 assert.match(js,/const PENDING_REQUEST_PREFIX = 'bc:bajas:pending:v1:'/);
 assert.match(js,/async function persistentRequestKey\(warehouse, lines\)/);
 assert.match(js,/crypto\.subtle\.digest\('SHA-256'/);
 assert.match(js,/p_idempotency_key: requestIdempotencyKey/);
 assert.match(js,/requestKey\.storage\.removeItem\(requestKey\.storageKey\)/);
 assert.match(js,/created\.length !== lines\.length/);
 const submitLock = js.indexOf("submitting = true;");
 const keyCalculation = js.indexOf("await persistentRequestKey(warehouse, lines)");
 assert.ok(submitLock >= 0 && keyCalculation > submitLock, "the submission lock must be active before the asynchronous key calculation");
});
test("Bajas success is not converted into a failed submission by the approvals-panel refresh",()=>{
 const js=read("public/js/bajas-multiple.js");
 const start=js.indexOf("async function submit(event)");
 const end=js.indexOf("function start(force)",start);
 const submit=js.slice(start,end);
 assert.ok(submit.indexOf("succeeded = true") < submit.indexOf("await window.refrescarAprobacionesAdmin()"));
 assert.match(submit,/catch\s*\(refreshError\)/);
 assert.ok(submit.indexOf("if (succeeded) addRow()")>submit.indexOf("submitting = false"));
});
test("Android Bajas modal has exactly one active scroll area and no overlapping sticky action footer",()=>{
 const css=read("public/style.css"),js=read("public/js/bajas-multiple.js");
 assert.match(css,/\.bc-bajas-modal-dialog[^\n]*overflow:hidden/);
 assert.match(css,/\.bc-bajas-modal-content[^\n]*overflow-x:hidden;overflow-y:auto/);
 assert.match(css,/\.bc-bajas-multiple \.bc-bajas-lines\{gap:6px;max-height:none;overflow:visible/);
 assert.match(css,/\.bc-bajas-multiple \.bc-bajas-actions\{position:static/);
 assert.match(js,/updateModalViewportHeight\(modal\)/);
});
test("Connectivity tolerates transient mobile probe failures and offers controlled PWA update reload",()=>{
 const net=read("public/js/network-core.js"),app=read("public/app.js"),sw=read("public/service-worker.js");
 assert.match(net,/transientConnectivityFailures < 3/);
 assert.match(net,/POLL_INTERVAL_MS = 60000, FIRST_RETRY_MS = 8000, MAX_RETRY_MS = 60000/);
 assert.match(net,/fallosSondeoSeguidos >= 3/);
 assert.match(app,/bc-pwa-update-notice/);
 assert.match(app,/window\.location\.reload\(\)/);
 assert.match(sw,/BC_SW_VERSION = "9\.5\.96"/);
});
