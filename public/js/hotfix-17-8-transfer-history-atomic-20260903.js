// BattleCruiser — 17.8: una transferencia = una operación visible
(function(){
  'use strict';
  if(window.__BC178)return;window.__BC178=true;
  function collapse(rows){
    if(!Array.isArray(rows)||!rows.length)return rows||[];
    var out=[],groups=new Map();
    rows.forEach(function(r){
      var t=String(r?.tipo||'').toLowerCase();
      if(t!=='transferencia_salida'&&t!=='transferencia_entrada'){out.push(r);return;}
      var key=[r.operacion_id||'',r.producto||'',r.fecha||''].join('|');
      if(!groups.has(key))groups.set(key,{salida:null,entrada:null});
      var g=groups.get(key);if(t==='transferencia_salida')g.salida=r;else g.entrada=r;
    });
    groups.forEach(function(g){
      if(g.salida&&g.entrada){
        var s=g.salida,e=g.entrada;
        out.push({id:s.id||e.id,operacion_id:s.operacion_id||e.operacion_id,fecha:s.fecha||e.fecha,producto:s.producto||e.producto,usuario:s.usuario||e.usuario,cantidad:Math.max(Math.abs(Number(s.cantidad)||0),Math.abs(Number(e.cantidad)||0)),tipo:'transferencia',almacen:(s.almacen||'—')+' → '+(e.almacen||'—'),origen:s.almacen||'',destino:e.almacen||'',__bc_transferencia_resumen:true});
      }else out.push(g.salida||g.entrada);
    });
    return out.sort(function(a,b){return new Date(b.fecha||0)-new Date(a.fecha||0)});
  }
  function hook(){
    var c=window.client;if(!c||typeof c.rpc!=='function'||c.rpc.__bc178)return false;
    var old=c.rpc.bind(c);
    async function rpc(name){
      var args=[].slice.call(arguments,1),res=await old.apply(null,[name].concat(args));
      if(name==='movimientos_producto'&&res&&!res.error)res={...res,data:collapse(res.data)};
      return res;
    }
    rpc.__bc178=true;c.rpc=rpc;return true;
  }
  function boot(){[0,300,800,1500,3000].forEach(function(ms){setTimeout(hook,ms)})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.__BC178_verify=function(){return!!(window.client&&window.client.rpc&&window.client.rpc.__bc178)};
})();