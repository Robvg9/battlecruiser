// ==== Battlecruiser · js/configuracion.js ====
// Misión 9.3 T8 — Configuración / administración operativa.
// NO reimplementa usuarios/roles (usuarios-permisos.js) ni catálogos (catalogos.js).
// Configuración contiene mantenimiento + preferencias que antes vivían en Ajustes.

function _cfgEnsurePanel() {
  const tab = document.getElementById("tab-config");
  if (!tab || document.getElementById("cfg-mantenimiento")) return;

  const block = document.createElement("div");
  block.className = "cc-bloque";
  block.id = "cfg-mantenimiento";
  block.innerHTML =
    "<h3>Mantenimiento y diagnóstico</h3>" +
    '<p class="muted">Herramientas administrativas sobre la infraestructura existente y estado de la aplicación.</p>' +
    '<div id="cfg-diag-grid" class="rep-grid"></div>' +
    '<div class="btn-row" style="margin-top:12px;flex-wrap:wrap;gap:8px">' +
    '<button type="button" id="cfg-ir-pendientes" class="cc-accion">Ir a Pendientes</button>' +
    '<button type="button" id="cfg-ir-mando" class="cc-accion">Centro de Mando / Auditoría</button>' +
    '<button type="button" id="cfg-actualizar-app" class="cc-accion">Actualizar app / borrar caché</button>' +
    '<button type="button" id="cfg-refrescar-diag" class="cc-accion">Refrescar diagnóstico</button>' +
    '</div>' +
    '<p class="msg" id="msg-config-diag"></p>' +
    '<p class="muted" id="cfg-backup-nota"></p>';

  tab.insertBefore(block, tab.firstChild);
}

function _cfgVersiónShell() {
  try { if (navigator.serviceWorker && navigator.serviceWorker.controller) {} } catch (e) {}
  const foot = document.querySelector(".app-footer-version");
  return foot ? foot.textContent.trim() : "BattleCruiser";
}

function _cfgContarPendientes() {
  try {
    if (typeof _operacionesPendientesCache !== "undefined" && Array.isArray(_operacionesPendientesCache)) return _operacionesPendientesCache.length;
  } catch (e) {}
  return null;
}

function renderDiagnosticoConfig() {
  _cfgEnsurePanel();
  const grid = document.getElementById("cfg-diag-grid");
  if (!grid) return;
  const online = typeof estaRealmenteDesconectado === "function" ? !estaRealmenteDesconectado() : navigator.onLine;
  const pend = _cfgContarPendientes();
  const user = typeof _usuarioActual !== "undefined" && _usuarioActual ? ((_usuarioActual.nombre || "—") + (_usuarioActual.rol ? " · " + _usuarioActual.rol : "")) : "—";
  const b3 = typeof contextoB3Disponible === "function" && contextoB3Disponible();
  function card(valor, etiqueta) { return '<div class="resumen-card"><div class="valor">' + valor + '</div><div class="etiqueta">' + etiqueta + "</div></div>"; }
  grid.innerHTML = card(online ? "🟢 Online" : "⚪ Offline", "Conexión") + card(_cfgVersiónShell(), "Versión UI") + card(pend == null ? "—" : String(pend), "Ops. pendientes (memoria)") + card(b3 ? "OK" : "Degradado", "Contexto roles/permisos") + card(escHtml(user), "Usuario actual");
  const nota = document.getElementById("cfg-backup-nota");
  if (nota) nota.textContent = "Respaldo/restauración de datos de base de datos: no implementado en el cliente.";
  const btnMando = document.getElementById("cfg-ir-mando");
  if (btnMando) btnMando.classList.toggle("hidden", !(typeof tienePermiso === "function" && tienePermiso("auditoria", "ver")));
}

async function refrescarConfiguracion() {
  if (!document.getElementById("tab-config")) return;
  renderDiagnosticoConfig();
}

safeInit("config-mantenimiento", function () {
  _cfgEnsurePanel(); renderDiagnosticoConfig();
  var btnPend = document.getElementById("cfg-ir-pendientes");
  if (btnPend) btnPend.addEventListener("click", function () { if (typeof irATab === "function") irATab("pendientes"); else { var b = document.querySelector('.tab-btn[data-tab="pendientes"]'); if (b) b.click(); } });
  var btnMando = document.getElementById("cfg-ir-mando");
  if (btnMando) btnMando.addEventListener("click", function () { if (typeof tienePermiso === "function" && !tienePermiso("auditoria", "ver")) { setMsg("msg-config-diag", "No tenés permiso de auditoría.", false); return; } if (typeof irATab === "function") irATab("mando"); else { var b = document.querySelector('.tab-btn[data-tab="mando"]'); if (b) b.click(); } });
  var btnUp = document.getElementById("cfg-actualizar-app");
  if (btnUp) btnUp.addEventListener("click", function () { var existente = document.getElementById("update-app-btn"); if (existente) { existente.click(); return; } if (typeof actualizarApp === "function") actualizarApp(btnUp); else setMsg("msg-config-diag", "No se encontró la función de actualizar app.", false); });
  var btnRef = document.getElementById("cfg-refrescar-diag");
  if (btnRef) btnRef.addEventListener("click", function () { renderDiagnosticoConfig(); setMsg("msg-config-diag", "Diagnóstico actualizado.", true); });
});

(function cfgMigrarAjustesDentroDeConfiguracion(){
  "use strict";
  var LS = "bc-ui-preferences-v2";
  var defaults = {
    compacto:false, autoRefresh:true, syncAuto:true, syncOnOpen:true,
    syncWifiOnly:false, onlinePref:"auto", notifications:true, appearance:"dark"
  };
  function loadPrefs(){
    try { return Object.assign({},defaults,JSON.parse(localStorage.getItem(LS)||"{}")); }
    catch(e){ return Object.assign({},defaults); }
  }
  function savePrefs(p){ try { localStorage.setItem(LS,JSON.stringify(p)); } catch(e){} }
  function prefs(){ return loadPrefs(); }
  function applyAppearance(p){
    document.body.classList.remove("bc-theme-light","bc-theme-dark");
    document.body.classList.add(p.appearance === "light" ? "bc-theme-light" : "bc-theme-dark");
    document.body.classList.toggle("bc-compact",!!p.compacto);
  }
  function status(t,ok){
    var s=document.getElementById("cfg-aj-status"); if(!s)return;
    s.className="msg "+(ok===false?"error":"ok"); s.textContent=t;
  }
  function esc(v){ return String(v==null?"":v).replace(/[&<>\"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]}); }
  function toggleRow(id,title,desc){
    return '<div class="cfg-aj-row"><div><strong>'+title+'</strong><small>'+desc+'</small></div><label class="cfg-aj-toggle"><input type="checkbox" id="'+id+'"><span></span></label></div>';
  }
  function ensure(){
    var tab=document.getElementById("tab-config");
    if(!tab || document.getElementById("cfg-ajustes-basicos")) return;
    var box=document.createElement("div"); box.className="cc-bloque"; box.id="cfg-ajustes-basicos";
    box.innerHTML=
      '<h3>⚙️ Ajustes básicos</h3>'+\
      '<p class="muted">Preferencias que antes estaban dentro del botón Ajustes. Se guardan localmente en este dispositivo.</p>'+\
      '<div class="cfg-aj-sec"><h4>⚡ Rápido</h4><button type="button" class="cc-accion cfg-aj-wide" id="cfg-aj-update">☁️ Actualizar app / borrar caché</button></div>'+\
      '<div class="cfg-aj-sec"><h4>◐ Apariencia</h4><div class="cfg-aj-appearance"><button type="button" class="cfg-aj-app" data-app="dark">🌙 Modo oscuro</button><button type="button" class="cfg-aj-app" data-app="light">☀️ Modo claro</button></div></div>'+\
      '<div class="cfg-aj-sec"><h4>🔄 Sincronización</h4>'+toggleRow("cfg-aj-auto-refresh","Actualización automática","Mantener datos actualizados en segundo plano.")+toggleRow("cfg-aj-sync-auto","Sincronización automática","Sincroniza cambios de forma automática.")+toggleRow("cfg-aj-sync-open","Sincronizar al abrir app","Sincroniza automáticamente al abrir la aplicación.")+toggleRow("cfg-aj-sync-wifi","Sincronizar solo en Wi‑Fi","Ahorra datos móviles sincronizando solo con Wi‑Fi.")+\
      '</div><div class="cfg-aj-sec"><h4>☰ Preferencias</h4><label class="cfg-aj-field"><strong>Región / Conexión</strong><small>Configura la preferencia de conexión.</small><select id="cfg-aj-online"><option value="auto">🌐 Automática</option><option value="online">Preferir online</option><option value="offline">Preferir offline</option></select></label>'+\
      toggleRow("cfg-aj-notify","Notificaciones","Recibir alertas sobre actividades importantes.")+toggleRow("cfg-aj-compact","Modo compacto","Reduce espacios para mostrar más información.")+\
      '<div class="cfg-aj-links"><button type="button" class="cc-accion" id="cfg-aj-pass">🔐 Cambiar contraseña</button><button type="button" class="cc-accion" id="cfg-aj-data">🛠️ Administrador de datos</button><button type="button" class="cc-accion" id="cfg-aj-reset">↻ Restaurar ajustes</button><button type="button" class="cc-accion cfg-aj-logout" id="cfg-aj-logout">Cerrar sesión</button></div>'+\
      '</div><p id="cfg-aj-status" class="msg"></p>';
    tab.insertBefore(box,document.getElementById("cfg-mantenimiento")||tab.firstChild);

    function wire(id,key){
      var el=document.getElementById(id); if(!el)return;
      el.checked=!!prefs()[key];
      el.onchange=function(){var p=loadPrefs();p[key]=el.checked;savePrefs(p);applyAppearance(p);status("Ajuste guardado.",true);};
    }
    document.querySelectorAll(".cfg-aj-app").forEach(function(b){b.onclick=function(){var p=loadPrefs();p.appearance=b.getAttribute("data-app");savePrefs(p);applyAppearance(p);sync();status("Apariencia guardada.",true);};});
    wire("cfg-aj-auto-refresh","autoRefresh"); wire("cfg-aj-sync-auto","syncAuto"); wire("cfg-aj-sync-open","syncOnOpen"); wire("cfg-aj-sync-wifi","syncWifiOnly"); wire("cfg-aj-notify","notifications"); wire("cfg-aj-compact","compacto");
    var online=document.getElementById("cfg-aj-online"); online.value=prefs().onlinePref||"auto"; online.onchange=function(){var p=loadPrefs();p.onlinePref=online.value;savePrefs(p);status("Preferencia de conexión guardada.",true);};
    document.getElementById("cfg-aj-update").onclick=function(){var b=document.getElementById("update-app-btn");if(b)b.click();else if(typeof actualizarApp==="function")actualizarApp(this);};
    document.getElementById("cfg-aj-pass").onclick=function(){var b=document.getElementById("change-pass-btn");if(b)b.click();else{var p=document.getElementById("pass-panel");if(p)p.classList.remove("hidden");}};
    document.getElementById("cfg-aj-data").onclick=function(){var b=document.querySelector('.tab-btn[data-tab="config"]');if(b)b.click();document.getElementById("cfg-mantenimiento")?.scrollIntoView({behavior:"smooth",block:"start"});};
    document.getElementById("cfg-aj-reset").onclick=function(){if(!window.confirm("¿Restaurar todos los ajustes a los valores por defecto?"))return;var p=Object.assign({},defaults);savePrefs(p);applyAppearance(p);sync();status("Ajustes restaurados.",true);};
    document.getElementById("cfg-aj-logout").onclick=function(){if(!window.confirm("¿Cerrar sesión y volver al login?"))return;var b=document.getElementById("logout-btn");if(b)b.click();};
    function sync(){var p=loadPrefs();["cfg-aj-auto-refresh","cfg-aj-sync-auto","cfg-aj-sync-open","cfg-aj-sync-wifi","cfg-aj-notify","cfg-aj-compact"].forEach(function(id){var e=document.getElementById(id);if(e)e.checked=!!p[{"cfg-aj-auto-refresh":"autoRefresh","cfg-aj-sync-auto":"syncAuto","cfg-aj-sync-open":"syncOnOpen","cfg-aj-sync-wifi":"syncWifiOnly","cfg-aj-notify":"notifications","cfg-aj-compact":"compacto"}[id]];});var o=document.getElementById("cfg-aj-online");if(o)o.value=p.onlinePref||"auto";document.querySelectorAll(".cfg-aj-app").forEach(function(b){b.classList.toggle("active",b.getAttribute("data-app")===p.appearance);});applyAppearance(p);}
    sync();
  }
  var css=document.createElement("style");css.id="bc-config-ajustes-css";css.textContent=
    ".cfg-aj-sec{margin-top:18px}.cfg-aj-sec h4{margin:0 0 10px;color:var(--gold-bright);font-size:12px;letter-spacing:.04em}.cfg-aj-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05)}.cfg-aj-row strong,.cfg-aj-field strong{display:block;font-size:13.5px;color:var(--text)}.cfg-aj-row small,.cfg-aj-field small{display:block;margin-top:2px;font-size:11.5px;line-height:1.35;color:var(--mist)}.cfg-aj-toggle{position:relative;width:46px;height:26px;flex:0 0 auto}.cfg-aj-toggle input{opacity:0;width:0;height:0}.cfg-aj-toggle span{position:absolute;inset:0;background:rgba(255,255,255,.12);border-radius:999px;cursor:pointer}.cfg-aj-toggle span:before{content:\"\";position:absolute;width:20px;height:20px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}.cfg-aj-toggle input:checked+span{background:rgba(201,162,77,.55)}.cfg-aj-toggle input:checked+span:before{transform:translateX(20px)}.cfg-aj-appearance{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cfg-aj-app{padding:11px;border-radius:10px;border:1px solid rgba(201,162,77,.2);background:rgba(12,28,24,.4);color:var(--mist);cursor:pointer}.cfg-aj-app.active{border-color:rgba(201,162,77,.5);background:rgba(201,162,77,.12);color:var(--gold-bright)}.cfg-aj-field{display:block;margin-bottom:12px}.cfg-aj-field select{display:block;width:100%;margin-top:7px;padding:10px;border-radius:9px;background:var(--void);border:1px solid rgba(201,162,77,.2);color:var(--text)}.cfg-aj-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.cfg-aj-wide{width:100%;text-align:left}.cfg-aj-logout{border-color:rgba(200,80,80,.35)}@media(max-width:650px){.cfg-aj-appearance{grid-template-columns:1fr}}";document.head.appendChild(css);
  function run(){ensure();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){run();setTimeout(run,500);});else{run();setTimeout(run,500);}
})();

// Carga de la capa de UX sin alterar la arquitectura ni duplicar módulos de negocio.
(function cargarRevisionUI() {
  function load() {
    if (document.getElementById("bc-ui-revision-script")) return;
    var s = document.createElement("script"); s.id = "bc-ui-revision-script"; s.src = "js/ui-revision-2026-08.js"; s.defer = true; document.head.appendChild(s);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true }); else load();
})();