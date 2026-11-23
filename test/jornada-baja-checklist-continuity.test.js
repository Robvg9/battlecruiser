"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ui=fs.readFileSync(path.join(__dirname,"..","public/js/bc7-jornada-ui.js"),"utf8");

test("submitting a Baja from its checklist returns to the same Bajas section",()=>{
  const start=ui.indexOf("async function submitAdjustment(form){");
  const end=ui.indexOf("async function openRetroSuccessorPanel",start);
  assert.ok(start>=0&&end>start,"submitAdjustment exists");
  const block=ui.slice(start,end);
  assert.match(block,/const reopenBajasChecklist=checklistModalContext\?\.key==='bajas'/);
  const refresh=block.indexOf("await openWorkspace(sessionId)");
  const reopen=block.indexOf("openChecklistSection('bajas')");
  assert.ok(refresh>=0&&reopen>refresh,"refresh must complete before restoring the Bajas checklist");
  assert.match(block,/Solicitud enviada a revisión\. La sección de Bajas permanece abierta/);
  assert.match(block,/const resumedForm=document\.querySelector\('\[data-bc7-adjust-form\]'\)/);
});

test("the Bajas checklist still requires an explicit no-more-Bajas confirmation after submitting",()=>{
  const start=ui.indexOf("function openChecklistSection(key){");
  const end=ui.indexOf("document.addEventListener('keydown'",start);
  assert.ok(start>=0&&end>start);
  const block=ui.slice(start,end);
  assert.match(block,/hasUnsentInput/);
  assert.match(block,/Confirmar que no faltan más bajas/);
  assert.match(block,/bc7_confirmar_bloque_jornada/);
});
