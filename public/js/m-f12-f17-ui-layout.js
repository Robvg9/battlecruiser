// BattleCruiser F12–F17 — UI layout controlado (sin tocar RPCs / lógica de negocio)
// vF12.1 — grids, tablas, modales de presentación; owners de datos intactos.
(function () {
  "use strict";
  if (window.__BC_F12_UI__) return;
  window.__BC_F12_UI__ = true;

  function injectCss() {
    if (document.getElementById("bc-f12-ui-css")) return;
    var s = document.createElement("style");
    s.id = "bc-f12-ui-css";
    s.textContent = [
      "#tab-reportes #rep-resumen{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}",
      "#tab-reportes #rep-resumen .resumen-card{margin:0!important;padding:14px 12px;border-radius:12px;border:1px solid rgba(201,162,77,.22);background:rgba(12,28,24,.55)}",
      "#tab-reportes #rep-resumen .resumen-card .valor{font-size:1.35rem;font-weight:700;color:var(--gold-bright,#e8c86a)}",
      "#tab-reportes #rep-resumen .resumen-card .etiqueta{font-size:12px;color:var(--mist,#a8b0a4);margin-top:4px}",
      "#tab-reportes .rep-fila{display:grid;grid-template-columns:minmax(120px,1.2fr) minmax(0,2fr);gap:8px 12px;align-items:start;padding:10px 12px;margin:0 0 6px;border-radius:10px;border:1px solid rgba(201,162,77,.14);background:rgba(8,20,17,.45)}",
      "#tab-reportes .rep-fila-principal{display:contents}",
      "#bc-f12-rep-modal-backdrop{position:fixed;inset:0;z-index:9500;background:rgba(4,12,10,.72);display:flex;align-items:center;justify-content:center;padding:16px}",
      "#bc-f12-rep-modal{width:min(920px,96vw);max-height:92dvh;overflow:auto;border-radius:14px;background:linear-gradient(180deg,rgba(16,34,30,.99),rgba(8,18,15,.99));border:1px solid rgba(201,162,77,.28);box-shadow:0 20px 48px rgba(0,0,0,.5);padding:16px 18px}",
      "#bc-f12-rep-modal h3{margin:0 0 12px;font-family:Cormorant Garamond,serif;color:var(--gold-bright,#e8c86a)}",
      "#bc-f12-rep-modal .bc-f12-close{float:right;border:0;background:transparent;color:var(--mist);font-size:24px;cursor:pointer}",
      "body.bc-f12-modal-open{overflow:hidden}",
      "#tab-reportes.bc-f12-compact #rep-detalle-wrap{display:none!important}",
      "#tab-reportes.bc-f12-compact #rep-paginacion{display:none!important}",
      "#tab-inventario #inv-resumen,#tab-inventario .inv-resumen,#inv-valoracion{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}",
      "#inv-detalle .rep-fila,#lista-movimientos .rep-fila,#tab-movimientos .rep-fila{display:grid;grid-template-columns:minmax(100px,1.4fr) minmax(0,2fr);gap:6px 10px;padding:10px 12px;margin:0 0 4px;border-radius:8px;border:1px solid rgba(201,162,77,.12);background:rgba(8,20,17,.4)}",
      "#inv-detalle .rep-fila-principal,#lista-movimientos .rep-fila-principal{display:contents}",
      "#lista-productos .lista-item,#tab-productos .lista-item,#productos-lista .lista-item{display:grid!important;grid-template-columns:minmax(120px,1.5fr) minmax(80px,1fr) auto;gap:8px 12px;align-items:center;padding:12px 14px;margin:0 0 6px;border-radius:10px;border:1px solid rgba(201,162,77,.14)}",
      "@media(max-width:560px){#lista-productos .lista-item,#tab-productos .lista-item{grid-template-columns:1fr;gap:6px}}",
      ".bc-f12-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}",
      ".bc-f12-actions .cc-accion{min-height:38px}",
      "#ciclos-m18-root .m21-progress{opacity:.7;font-size:11px}",
      "@media(min-width:700px){#ciclos-m18-root .m21-wrap > .m21-card{display:inline-block;width:calc(50% - 12px);vertical-align:top;margin-right:8px}}",
      "#tab-comunicacion .com-layout,#tab-comunicacion .com-cols{display:flex;flex-wrap:wrap;gap:12px;align-items:stretch}",
      "#tab-comunicacion .com-lista,#tab-comunicacion .com-col-list{flex:1 1 240px;min-width:200px;max-height:70vh;overflow:auto}",
      "#tab-comunicacion .com-col-chat{flex:2 1 320px;min-width:260px;display:flex;flex-direction:column;min-height:360px}",
      "#bc-f12-generic-backdrop{position:fixed;inset:0;z-index:9600;background:rgba(4,12,10,.72);display:flex;align-items:center;justify-content:center;padding:16px}",
      "#bc-f12-generic-modal{position:relative;width:min(640px,96vw);max-height:90dvh;overflow:auto;border-radius:14px;background:linear-gradient(180deg,rgba(16,34,30,.99),rgba(8,18,15,.99));border:1px solid rgba(201,162,77,.28);padding:18px;color:var(--text,#e8e4d8)}",
      "#bc-f12-generic-modal h3{margin:0 40px 12px 0;color:var(--gold-bright,#e8c86a);font-family:Cormorant Garamond,serif}",
      "#bc-f12-generic-modal .bc-f12-x{position:absolute;right:14px;top:10px;border:0;background:transparent;color:var(--mist);font-size:26px;cursor:pointer}"
    ].join("");
    document.head.appendChild(s);
  }

  function closeGeneric() {
    var b = document.getElementById("bc-f12-generic-backdrop");
    if (b) b.remove();
    document.body.classList.remove("bc-f12-modal-open");
  }

  function openGeneric(title, bodyHtml) {
    closeGeneric();
    document.body.classList.add("bc-f12-modal-open");
    var back = document.createElement("div");
    back.id = "bc-f12-generic-backdrop";
    back.innerHTML =
      '<div id="bc-f12-generic-modal" role="dialog" aria-modal="true">' +
      '<button type="button" class="bc-f12-x" aria-label="Cerrar">×</button>' +
      "<h3>" + title + "</h3><div class="bc-f12-body">" + bodyHtml + "</div></div>";
    document.body.appendChild(back);
    back.querySelector(".bc-f12-x").onclick = closeGeneric;
    back.addEventListener("click", function (e) { if (e.target === back) closeGeneric(); });
  }

  function closeRepModal() {
    var b = document.getElementById("bc-f12-rep-modal-backdrop");
    if (b) b.remove();
    document.body.classList.remove("bc-f12-modal-open");
  }

  function openRepModal() {
    closeRepModal();
    var tab = document.getElementById("tab-reportes");
    if (!tab) return;
    var detalle = document.getElementById("rep-detalle");
    var tabs = tab.querySelector(".rep-tabs") || tab.querySelector("[class*='rep-tab']");
    var pag = document.getElementById("rep-paginacion");
    document.body.classList.add("bc-f12-modal-open");
    var back = document.createElement("div");
    back.id = "bc-f12-rep-modal-backdrop";
    var modal = document.createElement("div");
    modal.id = "bc-f12-rep-modal";
    modal.setAttribute("role", "dialog");
    modal.innerHTML =
      '<button type="button" class="bc-f12-close" aria-label="Cerrar">×</button>' +
      "<h3>Reporte detallado</h3><div id="bc-f12-rep-modal-host"></div>";
    back.appendChild(modal);
    document.body.appendChild(back);
    var host = modal.querySelector("#bc-f12-rep-modal-host");
    if (tabs) {
      var tabsClone = tabs.cloneNode(true);
      host.appendChild(tabsClone);
      tabsClone.querySelectorAll(".rep-tab-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var orig = tab.querySelector('.rep-tab-btn[data-rep="' + btn.dataset.rep + '"]');
          if (orig) orig.click();
          setTimeout(function () {
            var d = document.getElementById("rep-detalle");
            var slot = host.querySelector("#bc-f12-rep-live");
            if (!slot) { slot = document.createElement("div"); slot.id = "bc-f12-rep-live"; host.appendChild(slot); }
            if (d) slot.innerHTML = d.innerHTML;
          }, 400);
        });
      });
    }
    var live = document.createElement("div");
    live.id = "bc-f12-rep-live";
    if (detalle) live.innerHTML = detalle.innerHTML;
    host.appendChild(live);
    if (pag) host.appendChild(pag.cloneNode(true));
    modal.querySelector(".bc-f12-close").onclick = closeRepModal;
    back.addEventListener("click", function (e) { if (e.target === back) closeRepModal(); });
  }

  function setupReportesCompact() {
    var tab = document.getElementById("tab-reportes");
    if (!tab || tab.dataset.bcF12 === "1") return;
    tab.dataset.bcF12 = "1";
    tab.classList.add("bc-f12-compact");
    if (!document.getElementById("bc-f12-rep-actions")) {
      var actions = document.createElement("div");
      actions.id = "bc-f12-rep-actions";
      actions.className = "bc-f12-actions";
      actions.innerHTML = '<button type="button" class="cc-accion" id="bc-f12-btn-rep-detalle">Reporte detallado</button>';
      var resumen = document.getElementById("rep-resumen");
      if (resumen && resumen.parentNode) resumen.parentNode.insertBefore(actions, resumen.nextSibling);
      else tab.insertBefore(actions, tab.firstChild);
    }
    var btn = document.getElementById("bc-f12-btn-rep-detalle");
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        if (typeof refrescarSubReporte === "function") {
          try {
            var p = refrescarSubReporte();
            if (p && typeof p.then === "function") p.then(function () { openRepModal(); }).catch(function () { openRepModal(); });
            else openRepModal();
          } catch (e) { openRepModal(); }
        } else openRepModal();
      });
    }
    var det = document.getElementById("rep-detalle");
    if (det && !document.getElementById("rep-detalle-wrap")) {
      var wrap = document.createElement("div");
      wrap.id = "rep-detalle-wrap";
      det.parentNode.insertBefore(wrap, det);
      wrap.appendChild(det);
      var pag = document.getElementById("rep-paginacion");
      if (pag) wrap.appendChild(pag);
    }
  }

  function setupCentroControlModals() {
    var tab = document.getElementById("tab-resumen");
    if (!tab || tab.dataset.bcF12Cc === "1") return;
    tab.dataset.bcF12Cc = "1";
    if (!document.getElementById("bc-f12-cc-actions")) {
      var bar = document.createElement("div");
      bar.id = "bc-f12-cc-actions";
      bar.className = "bc-f12-actions";
      bar.innerHTML =
        '<button type="button" class="cc-accion" id="bc-f12-btn-actividad">Actividad reciente</button>' +
        '<button type="button" class="cc-accion" id="bc-f12-btn-historia">Historia</button>';
      var header = tab.querySelector(".pendientes-header") || tab.firstChild;
      if (header && header.parentNode === tab) tab.insertBefore(bar, header.nextSibling);
      else tab.insertBefore(bar, tab.firstChild);
    }
    var btnA = document.getElementById("bc-f12-btn-actividad");
    if (btnA && !btnA.dataset.bound) {
      btnA.dataset.bound = "1";
      btnA.addEventListener("click", function () {
        var src = document.getElementById("cc-actividad") || tab.querySelector("[id*='actividad']");
        openGeneric("Actividad reciente", src ? src.innerHTML : "<p class='muted'>Sin actividad disponible.</p>");
      });
    }
    var btnH = document.getElementById("bc-f12-btn-historia");
    if (btnH && !btnH.dataset.bound) {
      btnH.dataset.bound = "1";
      btnH.addEventListener("click", function () {
        var src = document.getElementById("cc-auditoria") || tab.querySelector("[id*='auditor']") || document.getElementById("cc-historial");
        openGeneric("Historia / Auditoría", src ? src.innerHTML : "<p class='muted'>Sin historial disponible.</p>");
      });
    }
  }

  function setupUsuariosModals() {
    var tab = document.getElementById("tab-usuarios");
    if (!tab || tab.dataset.bcF12U === "1") return;
    tab.dataset.bcF12U = "1";
    var nuevo = document.getElementById("btn-nuevo-usuario") || tab.querySelector("[id*='nuevo-usuario']");
    if (!document.getElementById("bc-f12-usr-actions")) {
      var bar = document.createElement("div");
      bar.id = "bc-f12-usr-actions";
      bar.className = "bc-f12-actions";
      bar.innerHTML = '<button type="button" class="cc-accion" id="bc-f12-btn-errores-permisos">Errores y permisos</button>';
      if (nuevo && nuevo.parentNode) nuevo.parentNode.insertBefore(bar, nuevo.nextSibling);
      else tab.insertBefore(bar, tab.firstChild);
    }
    var btn = document.getElementById("bc-f12-btn-errores-permisos");
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        var roles = document.getElementById("lista-roles") || tab.querySelector("[id*='rol']");
        var formRol = document.getElementById("form-rol") || tab.querySelector("form[id*='rol']");
        var html = roles ? "<h4>Roles</h4>" + roles.innerHTML : "";
        html += '<div class="bc-f12-actions" style="margin-top:12px"><button type="button" class="cc-accion" id="bc-f12-btn-nuevo-rol">Nuevo rol</button></div>';
        openGeneric("Errores y permisos", html || "<p class='muted'>Sin datos de roles.</p>");
        setTimeout(function () {
          var nr = document.getElementById("bc-f12-btn-nuevo-rol");
          if (nr) nr.onclick = function () {
            openGeneric("Nuevo rol", formRol ? formRol.outerHTML : "<p class='muted'>Formulario de rol no disponible.</p>");
          };
        }, 50);
      });
    }
    var rolesBlock = document.getElementById("panel-roles") || tab.querySelector(".roles-panel");
    if (rolesBlock) rolesBlock.style.display = "none";
  }

  function setupTurnosActions() {
    var tab = document.getElementById("tab-ciclos");
    if (!tab || tab.dataset.bcF12T === "1") return;
    tab.dataset.bcF12T = "1";
    if (!document.getElementById("bc-f12-turnos-actions")) {
      var bar = document.createElement("div");
      bar.id = "bc-f12-turnos-actions";
      bar.className = "bc-f12-actions";
      bar.innerHTML =
        '<button type="button" class="cc-accion" id="bc-f12-btn-sesiones">Sesiones de trabajo</button>' +
        '<button type="button" class="cc-accion" id="bc-f12-btn-asignacion">Asignación operativa</button>';
      tab.insertBefore(bar, tab.firstChild);
    }
    var btnS = document.getElementById("bc-f12-btn-sesiones");
    if (btnS && !btnS.dataset.bound) {
      btnS.dataset.bound = "1";
      btnS.addEventListener("click", function () {
        var det = document.getElementById("ciclo-detalle");
        openGeneric("Sesiones de trabajo", det ? det.innerHTML : "<p class='muted'>Abrí un turno para ver sesiones.</p>");
      });
    }
    var btnA = document.getElementById("bc-f12-btn-asignacion");
    if (btnA && !btnA.dataset.bound) {
      btnA.dataset.bound = "1";
      btnA.addEventListener("click", function () {
        if (typeof window.BattleCruiserM24 === "object" && typeof window.BattleCruiserM24.open === "function") {
          try { window.BattleCruiserM24.open(); return; } catch (e) {}
        }
        var asg = document.getElementById("m24-asignaciones") || document.querySelector("[id*='asignacion']");
        openGeneric("Asignación operativa", asg && asg.id !== "tab-ciclos" ? (asg.innerHTML || "") : "<p class='muted'>Módulo de asignaciones existente.</p>");
      });
    }
  }

  function onEscape(e) {
    if (e.key === "Escape") { closeRepModal(); closeGeneric(); }
  }

  function boot() {
    injectCss();
    setupReportesCompact();
    setupCentroControlModals();
    setupUsuariosModals();
    setupTurnosActions();
    document.addEventListener("keydown", onEscape);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 400); });
  } else setTimeout(boot, 400);
  setTimeout(boot, 1200);
  setTimeout(boot, 2500);

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-tab]");
    if (!b) return;
    setTimeout(function () {
      injectCss();
      setupReportesCompact();
      setupCentroControlModals();
      setupUsuariosModals();
      setupTurnosActions();
    }, 200);
  }, false);
})();
