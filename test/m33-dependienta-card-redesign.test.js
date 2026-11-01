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

function fixture(t,{failRead=false}={}){
 const dom=new JSDOM("<!doctype html><html><head></head><body></body></html>",{
  url:"https://battlecruiser-dependent-card.test/",runScripts:"outside-only",pretendToBeVisual:true
 });
 const {window}=dom;
 Object.defineProperty(window.document,"readyState",{configurable:true,value:"complete"});
 Object.defineProperty(window.navigator,"onLine",{configurable:true,value:true});
 const sessions=[
  {id:"mine-day-1",turno_id:"turno-fixture",numero_dia:1,dia_n:1,fecha:"2026-10-30",bloque:"MANANA",estado:"COMPLETADA",usuario_id:"dependent-a",usuario_nombre:"Dependienta A"},
  {id:"mine-day-2",turno_id:"turno-fixture",numero_dia:2,dia_n:2,fecha:"2026-10-31",bloque:"MANANA",estado:"COMPLETADA",usuario_id:"dependent-a",usuario_nombre:"Dependienta A"},
  {id:"other-day-1",turno_id:"turno-fixture",numero_dia:1,dia_n:1,fecha:"2026-10-30",bloque:"TARDE",estado:"COMPLETADA",usuario_id:"dependent-b",usuario_nombre:"Otra dependienta"},
  {id:"cancelled-day-1",turno_id:"turno-fixture",numero_dia:1,dia_n:1,fecha:"2026-10-30",bloque:"TARDE",estado:"CANCELADA",usuario_id:null}
 ];
 const declarations=[
  {turno_sesion_id:"mine-day-1",turno_tramo_id:"tramo-1",usuario_id:"dependent-a",monto:200,moneda:"CUP",declarado_at:"2026-10-30T22:00:00-04:00",estado_aprobacion:"APROBADA",monto_contado:200,diferencia:0,contado_por:"owner"},
  {turno_sesion_id:"mine-day-2",turno_tramo_id:"tramo-2",usuario_id:"dependent-a",monto:8540,moneda:"CUP",declarado_at:"2026-10-31T22:00:00-04:00",estado_aprobacion:"APROBADA",monto_contado:5220,diferencia:-3320,contado_por:"owner"}
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
  rpc:async(name,params)=>{rpcCalls.push({name,params});return {data:null,error:{code:"UNEXPECTED_RPC",message:name}};},
  from:table=>({
   select:columns=>({
    in:async(column,ids)=>{
     queries.push({table,columns,column,ids:[...ids]});
     if(failRead)return {data:null,error:{message:"lectura no autorizada",code:"42501"}};
     return {data:declarations.filter(row=>ids.includes(row.turno_sesion_id)),error:null};
    }
   })
  })
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
 assert.ok(await waitFor(()=>modal.querySelector("#m33-dep-cash-history")?.textContent.includes("8.540,00 CUP")));
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
 assert.deepEqual(queries.map(q=>q.ids).flat().sort(),["mine-day-1","mine-day-2"]);
 assert.ok(queries.every(q=>q.table==="turno_declaraciones"&&q.column==="turno_sesion_id"));
 assert.equal(writes.length,0);
 assert.equal(rpcCalls.length,0);
});

test("fallo al leer liquidaciones se informa sin inventar importes",async t=>{
 const {window,writes}=fixture(t,{failRead:true});
 await window.__BC_M33.open("turno-fixture");
 const modal=window.document.getElementById("m33-bg");
 assert.ok(await waitFor(()=>modal.querySelector("#m33-dep-cash-history")?.textContent.includes("No se pudo consultar")));
 assert.doesNotMatch(modal.querySelector("#m33-dep-cash-history").textContent,/0,00 CUP/);
 assert.equal(writes.length,0);
});

test("los registros antiguos no se presentan como bloques mañana/tarde",()=>{
 assert.match(SOURCE,/Registro histórico del formato anterior/);
 assert.match(SOURCE,/Una jornada completa por día/);
 assert.match(SOURCE,/Continuar registro anterior/);
 assert.match(SOURCE,/data-m33-abrir-jornada/);
});
