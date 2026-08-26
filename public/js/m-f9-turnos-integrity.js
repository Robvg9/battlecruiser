// BattleCruiser F9 — Parches de integridad Turnos (M21 / m18-ciclos-ux)
// vF9.1 — Continuar cuadre no silencioso; 1 ciclo activo por almacén; sesión EN_CURSO por almacén.
(function () {
  "use strict";
  if (window.__BC_F9_TURNOS__) return;
  window.__BC_F9_TURNOS__ = true;

  function msg(t, ok) {
    var e = document.getElementById("m21-msg");
    if (e) {
      e.textContent = t || "";
      e.className = "m21-msg " + (ok ? "ok" : "error");
      return;
    }
    if (typeof setMsg === "function") setMsg("msg-ciclos", t, !!ok);
  }

  function unlockCuadreButton() {
    var root = document.getElementById("ciclos-m18-root");
    if (!root) return;
    var btn = root.querySelector("[data-m21-step5]");
    if (!btn) return;
    if (btn.disabled) {
      btn.disabled = false;
      btn.title = "Podés ver el cuadre aunque la entrega de inventario aún no esté aceptada.";
    }
    if (btn.dataset.bcF9Bound === "1") return;
    btn.dataset.bcF9Bound = "1";
    btn.addEventListener("click", function () {
      setTimeout(function () {
        var m = document.getElementById("m21-msg");
        if (m && !(m.textContent || "").trim()) {
          msg("Cuadre final. Si el inventario aún no fue aceptado, el siguiente turno no se habrá creado automáticamente.", true);
        }
      }, 400);
    }, false);
  }

  function watchRoot() {
    var root = document.getElementById("ciclos-m18-root");
    if (!root || root.dataset.bcF9Obs === "1") return;
    root.dataset.bcF9Obs = "1";
    var obs = new MutationObserver(function () { unlockCuadreButton(); });
    obs.observe(root, { childList: true, subtree: true });
    unlockCuadreButton();
  }

  function patchCreateViaClick() {
    var root = document.getElementById("ciclos-m18-root");
    if (!root || root.dataset.bcF9Create === "1") return;
    root.dataset.bcF9Create = "1";
    root.addEventListener("click", async function (e) {
      var b = e.target.closest && e.target.closest("[data-m21-confirm-create]");
      if (!b) return;
      var aid = b.getAttribute("data-m21-confirm-create");
      if (!aid) return;
      try {
        if (!navigator.onLine || typeof client === "undefined") return;
        var r = await client.rpc("listar_ciclos_operativos", { p_almacen_id: aid, p_estado: null });
        var list = r && r.data;
        if (typeof list === "string") { try { list = JSON.parse(list); } catch (x) { list = []; } }
        if (!Array.isArray(list)) list = list && list.ciclos ? list.ciclos : list ? [list] : [];
        var open = list.find(function (c) {
          return c && (c.estado === "ACTIVO" || c.estado === "EN_VALIDACION");
        });
        if (open) {
          e.preventDefault();
          e.stopImmediatePropagation();
          msg("Este almacén ya tiene un turno abierto o en validación. Cerralo / finalizalo antes de crear otro.", false);
        }
      } catch (err) {}
    }, true);
  }

  function patchSesionAbrir() {
    document.addEventListener("click", async function (e) {
      var a = e.target.closest && e.target.closest("[data-bc-sesion-abrir]");
      if (!a) return;
      var sesionId = a.getAttribute("data-bc-sesion-abrir");
      if (!sesionId || !navigator.onLine || typeof client === "undefined") return;
      try {
        var r0 = await client.rpc("listar_sesiones_operativas", {
          p_ciclo_id: null, p_almacen_id: null, p_fecha: null, p_estado: null
        });
        var all = r0 && r0.data ? (Array.isArray(r0.data) ? r0.data : [r0.data]) : [];
        var target = all.find(function (s) { return String(s.id) === String(sesionId); });
        if (!target || !target.almacen_id) return;
        var enCurso = all.filter(function (s) {
          return String(s.almacen_id) === String(target.almacen_id)
            && String(s.estado || "").toUpperCase() === "EN_CURSO"
            && String(s.id) !== String(sesionId);
        });
        if (enCurso.length) {
          e.preventDefault();
          e.stopImmediatePropagation();
          var el = document.getElementById("msg-sesiones-operativas");
          if (el) {
            el.textContent = "Ya hay una sesión EN CURSO en este almacén. Cerrala antes de abrir otra.";
            el.className = "msg error";
          } else {
            msg("Ya hay una sesión EN CURSO en este almacén. Cerrala antes de abrir otra.", false);
          }
        }
      } catch (err) {}
    }, true);
  }

  function boot() {
    watchRoot();
    patchCreateViaClick();
    patchSesionAbrir();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 500); });
  } else {
    setTimeout(boot, 500);
  }
  setTimeout(boot, 1500);
  setTimeout(boot, 3000);
})();
