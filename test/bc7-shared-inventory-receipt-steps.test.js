const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const ui = fs.readFileSync(path.join(root, 'public/js/bc7-jornada-ui.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/bc7-jornada-inventory-mobile.css'), 'utf8');

test('shared inventory discrepancy receipt is a compact two-step flow', () => {
  const pickerStart = ui.indexOf("if(attempt.step!=='values'){", ui.indexOf('function receiveDiffPaneHtml'));
  const correctionsStart = ui.indexOf('const correctionRows=selected.map', pickerStart);
  assert.ok(pickerStart >= 0 && correctionsStart > pickerStart, 'both receipt steps must exist');

  const pickerStep = ui.slice(pickerStart, correctionsStart);
  assert.match(pickerStep, /data-bc7-receive-search/);
  assert.match(pickerStep, /data-bc7-receive-add/);
  assert.match(pickerStep, /data-bc7-receive-remove/);
  assert.match(pickerStep, /data-bc7-receive-continue/);
  assert.doesNotMatch(pickerStep, /data-bc7-receive-count=/, 'step 1 must not ask for quantities');

  const correctionStep = ui.slice(correctionsStart, ui.indexOf('function renderReceiveDiffPane', correctionsStart));
  assert.match(correctionStep, /data-bc7-receive-count=/);
  assert.match(correctionStep, /data-bc7-receive-back/);
  assert.match(correctionStep, /selected\.map/);
  assert.doesNotMatch(correctionStep, /lines\.map/, 'step 2 must render only selected products');

  const saveStart = ui.indexOf('async function saveReceipt');
  const payloadStart = ui.indexOf('let payloadLines=[];', saveStart);
  const payloadEnd = ui.indexOf('const payload={p_destino_sesion_id', payloadStart);
  const savePayload = ui.slice(payloadStart, payloadEnd);
  assert.match(savePayload, /if\(!marked\)return \{producto_id:l\.producto_id,cantidad:Number\(l\.cantidad_declarada\)\}/,
    'unselected products must keep the previous declared quantity');
  assert.match(savePayload, /markedCount===0/, 'cannot submit an empty discrepancy selection');
  assert.match(ui, /Todo coincide/);
  assert.match(ui, /Coincidencia total confirmada/);

  assert.match(css, /input\[type="checkbox"\][\s\S]*?width:18px!important/);
  assert.match(css, /bc7-receive-pick-row/);
  assert.match(css, /bc7-receive-correction-row/);
  assert.match(css, /overflow-x:hidden/);
});
