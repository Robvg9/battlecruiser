// ==== BattleCruiser · app.js ====
// v9.2.41 — FIX: se elimina location.reload() automático por mensaje del SW.
// Causa raíz del bucle post-9.2.40: SW activate → BC_SW_ACTIVATED → reload →
// re-instalación/claim → otro mensaje → reload infinito (o carga permanente).
// Actualización = solo acción explícita del usuario (Actualizar app).
(function hotfixV9241(){
  const VERSION="9.2.41";
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
        // NO IndexedDB / cola offline
        const u=new URL(location.href);
        u.searchParams.set("bc_update",`${VERSION}-${Date.now()}`);
        location.replace(u.toString());
      });
    });
  }
  aplicarVersion();
  window.addEventListener("pageshow",aplicarVersion);
  // SIN listener de BC_SW_ACTIVATED → SIN reload automático
})();

(function cargarModulosDinamicos(){
  var V=window.__BC_VERSION__||"9.2.41";
  function load(src){
    var name=src.split("/").pop().split("?")[0];
    if(document.querySelector('script[src*="'+name+'"]'))return;
    var s=document.createElement("script");
    s.src=src+"?v="+encodeURIComponent(V);
    s.async=false;
    s.onerror=function(){console.warn("[BattleCruiser] Módulo no cargó (degradado):",src);};
    document.body.appendChild(s);
  }
  // Orden fijo — independiente de viewport (PC = móvil)
  [
    "js/configuracion.js",
    "js/online-offline-guard.js",
    "js/operaciones-financieras.js",
    "js/aprobaciones-admin.js",
    "js/m26-ui-integridad.js",
    "js/sesiones-operativas-ui.js",
    "js/ui-visual-salon.js",
    "js/roles-en-usuarios.js",
    "js/ui-layout-inteligente.js",
    "js/ui-usuarios-dashboard.js",
    "js/ui-operaciones-hub.js",
    "js/fix-permisos-rol.js",
    "js/ui-ajustes-panel.js",
    "js/hide-config-tab.js"
  ].forEach(load);
})();
