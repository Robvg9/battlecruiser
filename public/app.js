// ==== BattleCruiser · app.js ====
// Misión de modularización: cargador de módulos + hotfixes de integración.
(function hotfixV9215(){const VERSION="9.2.15";const aplicar=()=>{const input=document.getElementById("email"),label=document.querySelector('label[for="email"]');if(input){input.type="text";input.required=true;input.autocomplete="username";input.placeholder="Tu usuario";input.removeAttribute("pattern");input.removeAttribute("inputmode");}if(label)label.textContent="Usuario";document.querySelectorAll(".footnote,.app-footer-version").forEach(el=>el.textContent=`v${VERSION} — BattleCruiser`);["update-app-btn-login","update-app-btn"].forEach(id=>{const old=document.getElementById(id);if(!old||old.dataset.bcVersion===VERSION)return;const btn=old.cloneNode(true);old.replaceWith(btn);btn.dataset.bcVersion=VERSION;btn.addEventListener("click",async()=>{btn.disabled=true;btn.textContent="Actualizando…";try{if("serviceWorker"in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister()));}if("caches"in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith("battlecruiser-shell-")).map(k=>caches.delete(k)));}}catch(e){console.warn("[BattleCruiser] actualización: limpieza parcial",e);}const u=new URL(location.href);u.searchParams.set("bc_update",`${VERSION}-${Date.now()}`);location.replace(u.toString());});});};aplicar();window.addEventListener("pageshow",aplicar);})();
(function repararAgregarProducto(){
  const ejecutar=()=>{
    const form=document.getElementById("form-producto");
    if(!form)return;
    const abrir=()=>{
      form.classList.remove("hidden");
      form.removeAttribute("hidden");
      form.classList.add("bc-producto-form-visible");
      form.style.setProperty("display","block","important");
      form.dataset.bcProductFormOpen="1";
      const campo=document.getElementById("prod-nombre");
      if(campo)campo.focus();
      form.scrollIntoView({behavior:"smooth",block:"start"});
    };
    const botonBarra=document.getElementById("bc-productos-agregar");
    if(botonBarra&&!botonBarra.dataset.bcFix915){
      botonBarra.dataset.bcFix915="1";
      botonBarra.type="button";
      botonBarra.addEventListener("click",e=>{
        e.preventDefault();
        e.stopPropagation();
        abrir();
      },true);
    }
    const botonGuardar=document.getElementById("prod-submit-btn");
    if(botonGuardar&&!botonGuardar.dataset.bcFix915){
      botonGuardar.dataset.bcFix915="1";
      botonGuardar.type="submit";
      botonGuardar.addEventListener("click",e=>{
        if(!form.checkValidity()){
          e.preventDefault();
          e.stopImmediatePropagation();
          const invalido=form.querySelector(":invalid");
          if(typeof setMsg==="function")setMsg("msg-productos","Completa los campos obligatorios del producto.",false);
          if(invalido)invalido.scrollIntoView({behavior:"smooth",block:"center"});
          return;
        }
        // El botón de creación debe tener una ruta determinista al handler
        // real de form-producto. Se cancela el submit nativo y se dispara
        // explícitamente el evento submit una sola vez, evitando depender
        // de que otro módulo/UI haya reemplazado o interferido con el
        // comportamiento nativo del botón.
        e.preventDefault();
        e.stopImmediatePropagation();
        const submitEvent=new Event("submit",{bubbles:true,cancelable:true});
        form.dispatchEvent(submitEvent);
      },true);
    }
  };
  const run=()=>ejecutar();
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>setTimeout(run,1200),{once:true});
  else setTimeout(run,1200);
  window.addEventListener("pageshow",()=>setTimeout(run,300));
})();
(function cargarConfiguracion(){if(document.querySelector('script[src*="configuracion"]'))return;var s=document.createElement("script");s.src="js/configuracion.js";s.async=false;document.body.appendChild(s);})();
(function cargarGuardiaOnlineOffline(){if(document.querySelector('script[src*="online-offline-guard"]'))return;var s=document.createElement("script");s.src="js/online-offline-guard.js";s.async=false;document.body.appendChild(s);})();
(function cargarOperacionesFinancieras(){if(document.querySelector('script[src*="operaciones-financieras"]'))return;var s=document.createElement("script");s.src="js/operaciones-financieras.js";s.async=false;document.body.appendChild(s);})();
(function cargarAprobacionesAdmin(){if(document.querySelector('script[src*="aprobaciones-admin"]'))return;var s=document.createElement("script");s.src="js/aprobaciones-admin.js";s.async=false;document.body.appendChild(s);})();
(function cargarIntegridadUI(){if(document.querySelector('script[src*="m26-ui-integridad"]'))return;var s=document.createElement("script");s.src="js/m26-ui-integridad.js?v=26.8";s.async=false;document.body.appendChild(s);})();