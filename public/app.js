// ==== BattleCruiser · app.js ====
// v9.2.42 — RESTORE ESTABLE: se revierte el cargador dinámico al patrón v9.2.39.
// La lógica de la app vive en los módulos js/*. Este archivo NO reemplaza módulos
// ni introduce recargas automáticas desde el Service Worker.
(function hotfixV9242(){
  const VERSION="9.2.42";
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
          if("serviceWorker"in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister()));}
          if("caches"in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith("battlecruiser-shell-")).map(k=>caches.delete(k)));}
        }catch(e){console.warn("[BattleCruiser] actualización: limpieza parcial",e);}
        // Nunca borrar IndexedDB / cola offline. Una sola recarga por gesto del usuario.
        const u=new URL(location.href);u.searchParams.set("bc_update",`${VERSION}-${Date.now()}`);location.replace(u.toString());
      });
    });
  }
  aplicarVersion();window.addEventListener("pageshow",aplicarVersion);
})();

(function cargarModulosDinamicos(){
  const modules=[
    ["configuracion.js",null],["online-offline-guard.js",null],["operaciones-financieras.js",null],["aprobaciones-admin.js",null],
    ["m26-ui-integridad.js","26.29"],["sesiones-operativas-ui.js","31.1"],["ui-visual-salon.js","31.1"],["roles-en-usuarios.js","32.1"],
    ["ui-layout-inteligente.js","33.1"],["ui-usuarios-dashboard.js","34.1"],["ui-operaciones-hub.js","36.1"],["fix-permisos-rol.js","37.1"],
    ["ui-ajustes-panel.js","38.1"],["hide-config-tab.js","39.1"]
  ];
  modules.forEach(([name,version])=>{
    if(document.querySelector('script[src*="'+name+'"]'))return;
    const s=document.createElement("script");
    s.src="js/"+name+(version?"?v="+version:"");
    s.async=false;
    s.onerror=()=>console.warn("[BattleCruiser] Módulo no cargó (degradado):",name);
    document.body.appendChild(s);
  });
})();
