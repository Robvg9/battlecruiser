// ==== BattleCruiser · app.js ====
// Capa mínima de arranque/hotfixes. La lógica de Productos vive en js/productos.js.
(function hotfixV9237(){
  const VERSION="9.2.37";
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
        try{if("serviceWorker"in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister()));}if("caches"in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith("battlecruiser-shell-")).map(k=>caches.delete(k)));}}catch(e){console.warn("[BattleCruiser] actualización: limpieza parcial",e);}
        const u=new URL(location.href);u.searchParams.set("bc_update",`${VERSION}-${Date.now()}`);location.replace(u.toString());
      });
    });
  }
  aplicarVersion();window.addEventListener("pageshow",aplicarVersion);
})();
(function cargarConfiguracion(){if(document.querySelector('script[src*="configuracion"]'))return;var s=document.createElement("script");s.src="js/configuracion.js";s.async=false;document.body.appendChild(s);})();
(function cargarGuardiaOnlineOffline(){if(document.querySelector('script[src*="online-offline-guard"]'))return;var s=document.createElement("script");s.src="js/online-offline-guard.js";s.async=false;document.body.appendChild(s);})();
(function cargarOperacionesFinancieras(){if(document.querySelector('script[src*="operaciones-financieras"]'))return;var s=document.createElement("script");s.src="js/operaciones-financieras.js";s.async=false;document.body.appendChild(s);})();
(function cargarAprobacionesAdmin(){if(document.querySelector('script[src*="aprobaciones-admin"]'))return;var s=document.createElement("script");s.src="js/aprobaciones-admin.js";s.async=false;document.body.appendChild(s);})();
(function cargarIntegridadUI(){if(document.querySelector('script[src*="m26-ui-integridad"]'))return;var s=document.createElement("script");s.src="js/m26-ui-integridad.js?v=26.29";s.async=false;document.body.appendChild(s);})();
(function cargarSesionesOperativasUI(){if(document.querySelector('script[src*="sesiones-operativas-ui"]'))return;var s=document.createElement("script");s.src="js/sesiones-operativas-ui.js?v=31.1";s.async=false;document.body.appendChild(s);})();
(function cargarUiVisualSalon(){if(document.querySelector('script[src*="ui-visual-salon"]'))return;var s=document.createElement("script");s.src="js/ui-visual-salon.js?v=31.1";s.async=false;document.body.appendChild(s);})();
(function cargarRolesEnUsuarios(){if(document.querySelector('script[src*="roles-en-usuarios"]'))return;var s=document.createElement("script");s.src="js/roles-en-usuarios.js?v=32.1";s.async=false;document.body.appendChild(s);})();
(function cargarUiLayoutInteligente(){if(document.querySelector('script[src*="ui-layout-inteligente"]'))return;var s=document.createElement("script");s.src="js/ui-layout-inteligente.js?v=33.1";s.async=false;document.body.appendChild(s);})();
(function cargarUiUsuariosDashboard(){if(document.querySelector('script[src*="ui-usuarios-dashboard"]'))return;var s=document.createElement("script");s.src="js/ui-usuarios-dashboard.js?v=34.1";s.async=false;document.body.appendChild(s);})();
(function cargarUiOperacionesHub(){if(document.querySelector('script[src*="ui-operaciones-hub"]'))return;var s=document.createElement("script");s.src="js/ui-operaciones-hub.js?v=36.1";s.async=false;document.body.appendChild(s);})();
(function cargarFixPermisosRol(){if(document.querySelector('script[src*="fix-permisos-rol"]'))return;var s=document.createElement("script");s.src="js/fix-permisos-rol.js?v=37.1";s.async=false;document.body.appendChild(s);})();
