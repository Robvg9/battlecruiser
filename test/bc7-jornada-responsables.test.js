"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const SOURCE=fs.readFileSync(path.join(__dirname,"..","public","js","bc7-jornada-ui.js"),"utf8");

test("BC7 fallback assigns one responsible to the complete Jornada period",()=>{
  assert.match(SOURCE,/id="bc7-period-responsible"/);
  assert.match(SOURCE,/Responsable de toda la Jornada/);
  assert.match(SOURCE,/function readDayRows\(\)[\s\S]*?Array\.from\(\{length:n\}[\s\S]*?trabaja:true,responsable_id:responsibleId/);
  assert.match(SOURCE,/function buildDayRows\(\)[\s\S]*?una sola Jornada[\s\S]*?La misma responsable queda asignada a todas las fechas/);
  assert.doesNotMatch(SOURCE,/Elegir responsables día por día|data-bc7-works|data-bc7-person/);
  assert.doesNotMatch(SOURCE,/id="bc7-plan-mode"|id="bc7-anchor"|id="bc7-rotation-details"/);
});

test("BC7 fallback validates one responsible and writes every day as laborable",()=>{
  assert.match(SOURCE,/const responsibleId=\$\('bc7-period-responsible'\)\?\.value\|\|''/);
  assert.match(SOURCE,/schedule\.some\(x=>!x\.trabaja\|\|String\(x\.responsable_id\|\|'\)\)!==String\(responsibleId\)\)/);
  assert.match(SOURCE,/p_programacion:schedule/);
  assert.match(SOURCE,/Jornada creada: '\+total\+' días consecutivos con una sola responsable/);
  assert.doesNotMatch(SOURCE,/días de descanso|de descanso|Descanso/);
});

test("responsible catalog refresh targets the one period selector, not daily controls",()=>{
  assert.match(SOURCE,/document\.querySelectorAll\('#bc7-period-responsible,#bc7-schedule-list/);
  assert.match(SOURCE,/sel\.disabled=state\.staffLoading\|\|!state\.staffLoaded\|\|!people\.length/);
});
