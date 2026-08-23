// ==== BattleCruiser · app.js ====
// Capa de arranque + carga de módulos. VERSION única = cache-bust único.
(function hotfixV9240(){
  const VERSION="9.2.40";
  window.__BC_VERSION__=VERSION;
  function aplicarVersion(){
    const input=document.getElementById("email");
    const label=document.querySelector('label[for="email"]');
    if(input){input.type="text";input.required=true;input.autocomplete="username";input.placeholder="Tu usuario";input.removeAttribute("pattern");input.removeAttribute("inputmode");}
    if(label)label.textContent="Usuario";
    document.querySelectorAll(".footnote,.app-footer-version").forEach(el=>el.textContent=`v${VERSION} — BattleCruiser`);
    ["update-app-btn-login","update-app-btn"].forEach(id=>{
      const old=document.getElementById(id);if(!old||old.dataset.bcVersion===VERSION)return;
      const btn=old.cloneNode(true);old.replaceWith(btn);btn.dataset.bcVersion=VERSION;
      btn.addEventListener("click",async()=>{
        btn.disabled=true;btn.textContent="Actualizando…";
        try{
          if("serviceWorker"in navigator){
            const regs=await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r=>r.unregister()));
          }
          if("caches"in window){
            const keys=await caches.keys();
            await Promise.all(keys.filter(k=>k.startsWith("battlecruiser-shell-")||k.startsWith("battlecruiser")).map(k=>caches.delete(k)));
          }
        }catch(e){console.warn("[BattleCruiser] actualización: limpieza parcial",e);}
        const u=new URL(location.href);
        u.searchParams.set("bc_update",`${VERSION}-${Date.now()}`);
        location.replace(u.toString());
      });
    });
  }
  aplicarVersion();window.addEventListener("pageshow",aplicarVersion);
  if("serviceWorker"in navigator){
    navigator.serviceWorker.addEventListener("message",function(ev){
      if(ev.data&&ev.data.type==="BC_SW_ACTIVATED"&&ev.data.version&&ev.data.version!==VERSION){
        if(sessionStorage.getItem("bc_sw_reload")===ev.data.version)return;
        sessionStorage.setItem("bc_sw_reload",ev.data.version);
        location.reload();
      }
    });
  }
})();

(function cargarModulosDinamicos(){
  var V=window.__BC_VERSION__||"9.2.40";
  function load(src){
    var name=src.split("/").pop().split("?")[0];
    if(document.querySelector('script[src*="'+name+'"]'))return;
    var s=document.createElement("script");
    s.src=src+(src.indexOf("?")>=0?"":"?v="+V);
    s.async=false;
    document.body.appendChild(s);
  }
  load("js/configuracion.js");
  load("js/online-offline-guard.js");
  load("js/operaciones-financieras.js");
  load("js/aprobaciones-admin.js");
  load("js/m26-ui-integridad.js");
  load("js/sesiones-operativas-ui.js");
  load("js/ui-visual-salon.js");
  load("js/roles-en-usuarios.js");
  load("js/ui-layout-inteligente.js");
  load("js/ui-usuarios-dashboard.js");
  load("js/ui-operaciones-hub.js");
  load("js/fix-permisos-rol.js");
  load("js/ui-ajustes-panel.js");
  load("js/hide-config-tab.js");
})();
