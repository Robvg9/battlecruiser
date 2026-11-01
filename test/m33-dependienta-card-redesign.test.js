"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {JSDOM}=require("jsdom");

const SOURCE=fs.readFileSync(path.join(__dirname,"../public/js/m33-turnos-final.js"),"utf8");

async function waitFor(predicate,timeout=2000){
 const until=Date.now()+timeout;
 while(Date.now()<until){if(predicate())return true;await new Promise(resolve=>setTimeout(resolve,10));}
 return Boolean(predicate());
}

function fixture(t,{noDeclarations=false}={}){
 const dom=new JSDOM("<!doctype html><html><head></head><body></body></html>",{
  url:"https://battlecruiser-dependent-card.test/",runScripts:"outside-only",pretendToBeVisual:true
 });
 const {window}=dom;
 Object.defineProperty(window.document,"readyState",{configurable:true,value:"complete"});
 Object.defineProperty(window.navigator,"onLine",{configurable:true,value:true});
 const sessions=[
  Object.assign({id:"mine-day-1",turno_id:"turno-fixture",numero_dia:1,dia_n:1,fecha:"2026-10-30",bloque:"MANANA",estado:"COMPLETADA",usuario_id:"dependent-a",usuario_nombre:"Dependienta A"}, noDeclarations ? {} : {dinero_declarado:true,dinero_id:"decl-1",dinero_monto:200,dinero_moneda:"CUP",dinero_estado_aprobacion:"APROBADA",dinero_monto_contado:200,dinero_diferencia:0}),
  Object.assign({id:"mine-day-2",turno_id:"turno-fixture",numero_dia:2,dia_n:2,fecha:"2026-10-31",bloque:"MANANA",estado:"COMPLETADA",usuario_id:"dependent-a",usuario_nombre:"Dependienta A"}, noDeclarations ? {} : {dinero_declarado:true,dinero_id:"decl-2",dinero_monto:8540,dinero_moneda:"CUP",dinero_estado_aprobacion:"APROBADA",dinero_monto_contado:5220,dinero_diferencia:-3320}),
  {id:"other-day-1",turno_id:"turno-fixture",numero_dia:1,dia_n:1,fecha:"2026-10-30",bloque:"TARDE",estado:"COMPLETADA",usuario_id:"dependent-b",usuario_nombre:"Otra dependienta"},
  {id:"cancelled-day-1",turno_id:"turno-fixture",numero_dia:1,dia_n:1,fecha:"2026-10-30",bloque:"TARDE",estado:"CANCELADA",usuario_id:null}
 ];
 const queries=[],writes=[],rpcCalls=[];
 window._usuarioActual={id:"dependent-a",nombre:"Dependienta A",rol:"dependienta"};
 window.__bcUser={id:"dependent-a",rol:"dependienta"};
 window._cache={usuarios:[],almacenes:[]};
 window.tienePermiso=()=>false;
 window.BattleCruiserTurnoAPI={
  actorIsAdmin:async()=>false,
  obtenerExpedienteTurno:async id=>({
   id,almacen_nombre:"La Cueva",estado_maestro:"EN_CURSO",fecha_inicio:"2026-10-30",fecha_fin:"2026-10-31",
   sesiones:sessions.map(row=>({...row}))
  }),
  listarTramosSesion:async()=>[],
  declararDinero:async()=>{writes.push("declarar");},
  cerrarSesion:async()=>{writes.push("cerrar");}
 };
 window.client={
  rpc:async(name,params)=>{rpcCalls.push({name,params});return {data:null,error:{code:"UNEXPECTED_RPC",message:name}};}
 };
 window.eval(SOURCE);
 t.after(()=>window.close());
 return {window,queries,writes,rpcCalls};
}

test("tarjeta compacta presenta liquidaciones propias y oculta sesiones ajenas",async t=>{
 const {window,queries,writes,rpcCalls}=fixture(t);
 await window.__BC_M33.open("turno-fixture");
 const modal=window.document.getElementById("m33-bg");
 assert.ok(modal);
 assert.ok(await waitFor(()=>modal.querySelector("#m33-dep-cash-history")?.(/8(?:\\.)?540,00 CUP/).test(modal.querySelector("#m33-dep-cash-history")?.textContent || "")));
 assert.match(modal.textContent,/Tu jornada · La Cueva/);
 assert.match(modal.textContent,/07:00–23:00/);
 assert.match(modal.textContent,/Declarado/);
 assert.match(modal.textContent,/Contado por el dueño/);
 assert.match(modal.textContent,/Diferencia/);
 assert.match(modal.textContent,/3\.320,00 CUP/);
 assert.match(modal.textContent,/200,00 CUP/);
 assert.doesNotMatch(modal.textContent,/Otra dependienta|other-day-1|cancelled-day-1/);
 assert.doesNotMatch(modal.textContent,/Mañana|Tarde|MANANA|TARDE/);
 assert.equal(modal.querySelectorAll(".m33-dependent-day").length,2);
 assert.equal(queries.length,0,"la tarjeta usa el expediente autorizado, no consulta la tabla privada de declaraciones");
 assert.equal(writes.length,0);
 assert.equal(rpcCalls.length,0);
});

test("la ausencia de declaraciones se muestra como pendiente y no como cero",async t=>{
 const {window,writes}=fixture(t,{noDeclarations:true});
 await window.__BC_M33.open("turno-fixture");
 const modal=window.document.getElementById("m33-bg");
 const host=modal.querySelector("#m33-dep-cash-history");
 assert.match(host.textContent,/Todavía no hay declaraciones de efectivo/);
 assert.doesNotMatch(host.textContent,/0,00 CUP/);
 assert.equal(writes.length,0);
});

test("los registros antiguos no se presentan como bloques mañana/tarde",()=>{
 assert.match(SOURCE,/Registro histórico del formato anterior/);
 assert.match(SOURCE,/Una jornada completa por día/);
 assert.match(SOURCE,/Continuar registro anterior/);
 assert.match(SOURCE,/data-m33-abrir-jornada/);
});
