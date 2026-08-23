// ==== BattleCruiser · app.js ====
// Misión de modularización: cargador de módulos + integración mínima.
(function hotfixV9217(){
  const VERSION="9.2.17";

  function aplicarVersion(){
    const input=document.getElementById("email");
    const label=document.querySelector('label[for="email"]');
    if(input){
      input.type="text";
      input.required=true;
      input.autocomplete="username";
      input.placeholder="Tu usuario";
      input.removeAttribute("pattern");
      input.removeAttribute("inputmode");
    }
    if(label)label.textContent="Usuario";
    document.querySelectorAll(".footnote,.app-footer-version").forEach(el=>el.textContent=`v${VERSION} — BattleCruiser`);
    ["update-app-btn-login","update-app-btn"].forEach(id=>{
      const old=document.getElementById(id);
      if(!old||old.dataset.bcVersion===VERSION)return;
      const btn=old.cloneNode(true);
      old.replaceWith(btn);
      btn.dataset.bcVersion=VERSION;
      btn.addEventListener("click",async()=>{
        btn.disabled=true;
        btn.textContent="Actualizando…";
        try{
          if("serviceWorker"in navigator){
            const regs=await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r=>r.unregister()));
          }
          if("caches"in window){
            const keys=await caches.keys();
            await Promise.all(keys.filter(k=>k.startsWith("battlecruiser-shell-")).map(k=>caches.delete(k)));
          }
        }catch(e){console.warn("[BattleCruiser] actualización: limpieza parcial",e);}
        const u=new URL(location.href);
        u.searchParams.set("bc_update",`${VERSION}-${Date.now()}`);
        location.replace(u.toString());
      });
    });
  }

  function abrirFormularioProducto(form){
    if(!form)return;
    form.classList.remove("hidden");
    form.removeAttribute("hidden");
    form.classList.add("bc-producto-form-visible");
    form.style.setProperty("display","block","important");
    form.dataset.bcProductFormOpen="1";
    const campo=document.getElementById("prod-nombre");
    if(campo)campo.focus();
    form.scrollIntoView({behavior:"smooth",block:"start"});
  }

  // Delegación: el botón de Productos puede ser creado/reemplazado después
  // de cargar app.js por la capa de UI. No dependemos de que exista en el
  // instante de inicialización.
  function instalarDelegacionProductos(){
    if(document.documentElement.dataset.bcProductosDelegado===VERSION)return;
    document.documentElement.dataset.bcProductosDelegado=VERSION;
    document.addEventListener("click",e=>{
      const agregar=e.target.closest("#bc-productos-agregar");
      if(agregar){
        const panel=document.getElementById("tab-productos");
        const form=panel&&panel.querySelector("#form-producto");
        if(!form)return;
        e.preventDefault();
        e.stopPropagation();
        abrirFormularioProducto(form);
        return;
      }

      const guardar=e.target.closest("#tab-productos #prod-submit-btn");
      if(!guardar)return;
      const form=guardar.closest("#form-producto");
      if(!form)return;

      if(!form.checkValidity()){
        e.preventDefault();
        e.stopImmediatePropagation();
        const invalido=form.querySelector(":invalid");
        if(typeof setMsg==="function")setMsg("msg-productos","Completa los campos obligatorios del producto.",false);
        if(invalido)invalido.scrollIntoView({behavior:"smooth",block:"center"});
        return;
      }

      // El submit real ya está implementado en productos.js. requestSubmit()
      // lo ejecuta de forma estándar y deja que ese handler sea el único
      // responsable de ejecutar ejecutarOperacion("producto").
      e.preventDefault();
      e.stopImmediatePropagation();
      form.requestSubmit(guardar);
    },true);
  }

  const aplicar=()=>{
    aplicarVersion();
    instalarDelegacionProductos();
  };

  aplicar();
  window.addEventListener("pageshow",aplicar);
})();

(function cargarConfiguracion(){if(document.querySelector('script[src*="configuracion"]'))return;var s=document.createElement("script");s.src="js/configuracion.js";s.async=false;document.body.appendChild(s);})();
(function cargarGuardiaOnlineOffline(){if(document.querySelector('script[src*="online-offline-guard"]'))return;var s=document.createElement("script");s.src="js/online-offline-guard.js";s.async=false;document.body.appendChild(s);})();
(function cargarOperacionesFinancieras(){if(document.querySelector('script[src*="operaciones-financieras"]'))return;var s=document.createElement("script");s.src="js/operaciones-financieras.js";s.async=false;document.body.appendChild(s);})();
(function cargarAprobacionesAdmin(){if(document.querySelector('script[src*="aprobaciones-admin"]'))return;var s=document.createElement("script");s.src="js/aprobaciones-admin.js";s.async=false;document.body.appendChild(s);})();
(function cargarIntegridadUI(){if(document.querySelector('script[src*="m26-ui-integridad"]'))return;var s=document.createElement("script");s.src="js/m26-ui-integridad.js?v=26.9";s.async=false;document.body.appendChild(s);})();