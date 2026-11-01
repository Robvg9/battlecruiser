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

function fixture(t,{noDeclarations=false,jornada=false}={}){
 const dom=new JSDOM("<!doctype html><html><head></head><body></body></html>",{
  url:"https://battlecruiser-dependent-card.test/",runScripts:"outside-only",pretendToBeVisual:true
 });
 const {window}=dom;
 Object.defineProperty(window.document,"readyState",{configurable:true,value:"complete"});
 Object.defineProperty(window.navigator,"onLine",{configurable:true,value:true});
 const sessions=[
  Object.assign({id:"mine-day-1",turno_id:"turno-fixture",numero_dia:1,dia_n:1,fecha:"2026-10-30",bloque:jornada?"JORNADA":"MANANA",estado:"COMPLETADA",usuario_id:"dependent-a",usuario_nombre:"Dependienta A"}, noDeclarations ? {} : {dinero_declarado:true,dinero_id:"decl-1",dinero_monto:200,dinero_moneda:"CUP",dinero_estado_aprobacion:"APROBADA",dinero_monto_contado:200,dinero_diferencia:0}),
  Object.assign({id:"mine-day-2",turno_id:"turno-fixture",numero_dia:2,dia_n:2,fecha:"2026-10-31",bloque:jornada?"JORNADA":"MANANA",estado:"COMPLETADA",usuario_id:"dependent-a",usuario_nombre:"Dependienta A"}, noDeclarations ? {} : {dinero_declarado:true,dinero_id:"decl-2",dinero_monto:8540,dinero_moneda:"CUP",dinero_estado_aprobacion:"APROBADA",dinero_monto_contado:5220,dinero_diferencia:-3320}),
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
 assert.ok(await waitFor(()=>/8(?:\.)?540,00 CUP/.test(modal.querySelector("#m33-dep-cash-history")?.textContent || "")));
 assert.match(modal.textContent,/Tu jornada · La Cueva/);
 assert.match(modal.textContent,/07:00–23:00/);
 assert.match(modal.textContent,/Declarado/);
 assert.match(modal.textContent,/Contado por el dueño/);
 assert.match(modal.textContent,/Diferencia/);
 assert.match(modal.textContent,/3(?:\.)?320,00 CUP/);
 assert.match(modal.textContent,/200,00 CUP/);
 assert.doesNotMatch(modal.textContent,/Otra dependienta|other-day-1|cancelled-day-1/);
 assert.doesNotMatch(modal.textContent,/Mañana|Tarde|MANANA|TARDE/);
 assert.equal(modal.querySelectorAll(".m33-dependent-day").length,2);
 assert.equal(queries.length,0,"la tarjeta usa el expediente autorizado, no consulta la tabla privada de declaraciones");
 assert.equal(writes.length,0);
 assert.equal(rpcCalls.length,0);
});


test("dependienta gets the shared Excel workbook scoped to her assigned days and no legacy AM/PM labels",async t=>{
 const {window,rpcCalls}=fixture(t,{jornada:true});
 window.client={
  rpc:async(name,params={})=>{
   rpcCalls.push({name,params});
   if(name==="bc7_movimientos_sesion")return {data:[],error:null};
   if(name==="bc7_obtener_inventario_jornada")return {data:{sesion:{id:params.p_turno_sesion_id},productos:[],cortes:{},declaracion_dinero:null},error:null};
   if(name==="bc7_finanzas_jornada")return {data:{
    gastos:[{id:"expense-"+params.p_turno_sesion_id,concepto:"Electricidad de jornada",descripcion:"Factura fixture",monto:45,estado:"APROBADO",creado_en:"2026-10-30T18:00:00Z",creado_nombre:"Dependienta A"}],
    reinversiones:[{id:"reinvestment-"+params.p_turno_sesion_id,proveedor:"Proveedor jornada",fecha:"2026-10-30T19:00:00Z",total:20,usuario_nombre:"Dependienta A",lineas:[{producto_id:"product-coffee",producto:"Café",cantidad_base:2,costo_total:20,costo_unitario:10}]}],
    mermas:[{id:"loss-"+params.p_turno_sesion_id,producto:"Galletas",producto_id:"product-cookie",cantidad:1,motivo:"Producto vencido",estado:"PENDIENTE",creado_en:"2026-10-30T20:00:00Z",creado_nombre:"Dependienta A"}],
    bajas:[]
   },error:null};
   return {data:null,error:{code:"UNEXPECTED_RPC",message:name}};
  },
  from:()=>({select:()=>({in:async()=>({data:[],error:null})})})
 };
 await window.__BC_M33.open("turno-fixture");
 const modal=window.document.getElementById("m33-bg");
 assert.match(modal.querySelector("[data-m33-turn-status]")?.textContent||"",/Turno pendiente de revisión/);
 const bookDetails=modal.querySelector("[data-m33-dependent-book]");
 assert.ok(bookDetails,"the dependent card must contain the same workbook used by the owner");
 bookDetails.open=true;
 bookDetails.dispatchEvent(new window.Event("toggle"));
 assert.ok(await waitFor(()=>rpcCalls.filter(call=>call.name==="bc7_movimientos_sesion").length===2));
 const workbookHost=bookDetails.querySelector("[data-m33-inventory-host]");
 assert.ok(workbookHost);
 assert.ok(await waitFor(()=>workbookHost.textContent.includes("Electricidad de jornada")&&workbookHost.textContent.includes("Proveedor jornada")));
 assert.equal(rpcCalls.filter(call=>call.name==="bc7_finanzas_jornada").length,2);
 assert.deepEqual(rpcCalls.filter(call=>call.name==="bc7_finanzas_jornada").map(call=>call.params.p_turno_sesion_id).sort(),
  ["mine-day-1","mine-day-2"],"finance read must remain scoped to the dependent's assigned Jornada sessions");
 assert.match(workbookHost.textContent,/Producto vencido/);
 assert.match(workbookHost.textContent,/Solicitudes de baja/);
 assert.doesNotMatch(workbookHost.textContent,/Solicitud de merma|Merma/);
 assert.deepEqual(rpcCalls.filter(call=>call.name==="bc7_movimientos_sesion").map(call=>call.params.p_turno_sesion_id).sort(),
  ["mine-day-1","mine-day-2"],"the workbook may query only the assigned user's session IDs");
 const movementsDetails=Array.from(modal.querySelectorAll("details")).find(details=>
  details.querySelector("summary")?.textContent.includes("Movimientos de tus días"));
 assert.ok(movementsDetails);
 movementsDetails.open=true;
 const archiveButton=movementsDetails.querySelector("[data-m33-archive-sessions]");
 assert.ok(archiveButton);
 archiveButton.click();
 const archiveHost=movementsDetails.querySelector("[data-m33-archive-host]");
 assert.ok(await waitFor(()=>archiveHost.dataset.loaded==="1"));
 assert.doesNotMatch(movementsDetails.textContent,/Mañana|Tarde|MANANA|TARDE/);
 assert.ok(rpcCalls.filter(call=>call.name==="bc7_movimientos_sesion").every(call=>
  ["mine-day-1","mine-day-2"].includes(call.params.p_turno_sesion_id)));
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


test("el libro distingue la venta POS del faltante físico y no infiere ventas desde el stock",async t=>{
 const {window}=fixture(t,{jornada:true});
 window.client={
  rpc:async(name,params={})=>{
   if(name==="bc7_movimientos_sesion"){
    return {data:params.p_turno_sesion_id==="mine-day-1"?[
     {tipo:"venta",producto:"Café",producto_id:"product-coffee",cantidad:-3,operacion_id:"sale-1",costo_unitario:5,fecha:"2026-10-30T10:00:00Z"}
    ]:[],error:null};
   }
   if(name==="bc7_obtener_inventario_jornada"){
    const first=params.p_turno_sesion_id==="mine-day-1";
    return {data:{
     sesion:{id:params.p_turno_sesion_id},
     productos:[{producto_id:"product-coffee",nombre:"Café",unidad:"uds"}],
     cortes:first?{
      INICIAL:{estado:"CONFIRMADO",lineas:[{producto_id:"product-coffee",cantidad_contada:10}]}
     }:{
      FINAL:{estado:"CONFIRMADO",lineas:[{producto_id:"product-coffee",cantidad_contada:4}]}
     }
    },error:null};
   }
   if(name==="bc7_finanzas_jornada")return {data:{gastos:[],reinversiones:[],mermas:[],bajas:[]},error:null};
   return {data:null,error:{code:"UNEXPECTED_RPC",message:name}};
  },
  from:(table)=>({
   select:()=>({
    in:async()=>{
     if(table==="ventas_lineas")return {data:[
      {venta_id:"sale-1",producto_id:"product-coffee",cantidad:3,precio_unitario:10,subtotal:30,costo_unitario_fifo:5}
     ],error:null};
     if(table==="productos")return {data:[{id:"product-coffee",nombre:"Café",precio_normal:10}],error:null};
     if(table==="turno_declaraciones")return {data:[],error:null};
     return {data:[],error:null};
    }
   })
  })
 };
 await window.__BC_M33.open("turno-fixture");
 const modal=window.document.getElementById("m33-bg");
 const details=modal.querySelector("[data-m33-dependent-book]");
 assert.ok(details,"la dependienta debe consultar la hoja compartida");
 details.open=true;
 details.dispatchEvent(new window.Event("toggle"));
 const host=details.querySelector("[data-m33-inventory-host]");
 assert.ok(await waitFor(()=>host.querySelector(".m33-book-table tbody tr")));
 const table=host.querySelector(".m33-book-table");
 const row=Array.from(table.querySelectorAll("tbody tr")).find(item=>item.cells[4]?.textContent==="Café");
 assert.ok(row,"el producto debe aparecer en el libro");
 assert.deepEqual(
  Array.from(row.cells).slice(10,14).map(cell=>cell.textContent.trim()),
  ["7","4","-3","3"],
  "10 inicial - 3 ventas POS = 7 teórico; 4 físicos implica faltante de 3, no venta de 6"
 );
 assert.match(table.textContent,/Diferencia física/);
 assert.match(table.textContent,/Venta POS/);
 assert.doesNotMatch(table.textContent,/Venta \(saldo\)/);
});
