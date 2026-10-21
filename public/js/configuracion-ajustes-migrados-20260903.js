// BattleCruiser — Preferencias personales v2.0
(function () {
  "use strict";
  if (window.__BC_PREFERENCIAS_PERSONALES_V2__) return;
  window.__BC_PREFERENCIAS_PERSONALES_V2__ = true;

  var LS = "bc-ui-preferences-v2";
  var DEFAULTS = {
    compacto: false,
    autoRefresh: true,
    syncAuto: true,
    syncOnOpen: true,
    syncWifiOnly: false,
    notifications: true,
    appearance: "dark"
  };

  function loadPrefs() {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS) || "{}"));
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function savePrefs(prefs) {
    try { localStorage.setItem(LS, JSON.stringify(prefs)); } catch (e) {}
  }

  function applyAppearance(prefs) {
    document.body.classList.remove("bc-theme-light", "bc-theme-dark");
    document.body.classList.add(prefs.appearance === "light" ? "bc-theme-light" : "bc-theme-dark");
    document.body.classList.toggle("bc-compact", !!prefs.compacto);
  }

  function setStatus(message, ok) {
    var el = document.getElementById("cfg-pref-status");
    if (!el) return;
    el.className = "msg " + (ok === false ? "error" : "ok");
    el.textContent = message;
  }

  function rowToggle(id, title, description) {
    return "<div class=\"cfg-aj-row\"><div><strong>" + title +
      "</strong><small id=\"" + id + "-help\">" + description + "</small></div>" +
      "<label class=\"cfg-aj-toggle\"><input type=\"checkbox\" id=\"" + id +
      "\" role=\"switch\" aria-label=\"" + title +
      "\" aria-describedby=\"" + id + "-help\" aria-checked=\"false\"><span aria-hidden=\"true\"></span></label></div>";
  }

  function ensurePanel() {
    var tab = document.getElementById("tab-preferencias");
    if (!tab || document.getElementById("cfg-preferencias-personales")) return;

    var box = document.createElement("section");
    box.className = "cc-bloque";
    box.id = "cfg-preferencias-personales";
    box.innerHTML =
      "<h3>Preferencias personales</h3>" +
      "<p class=\"muted\">Opciones guardadas en este dispositivo. Android puede suspender las tareas cuando la app queda en segundo plano.</p>" +
      "<div class=\"cfg-aj-sec\"><h4>◐ Apariencia</h4>" +
        "<div class=\"cfg-aj-appearance\">" +
          "<button type=\"button\" class=\"cfg-aj-app\" data-app=\"dark\">🌙 Modo oscuro</button>" +
          "<button type=\"button\" class=\"cfg-aj-app\" data-app=\"light\">☀️ Modo claro</button>" +
        "</div>" +
      "</div>" +
      "<div class=\"cfg-aj-sec\"><h4>🔄 Sincronización</h4>" +
        rowToggle("cfg-aj-auto-refresh", "Actualización automática", "Actualizar mientras la app está activa; el segundo plano depende del sistema.") +
        rowToggle("cfg-aj-sync-auto", "Sincronización automática", "Sincronizar cambios cuando el backend responda.") +
        rowToggle("cfg-aj-sync-open", "Sincronizar al abrir app", "Comprobar y sincronizar al volver a abrir la aplicación.") +
        rowToggle("cfg-aj-sync-wifi", "Sincronizar solo en Wi‑Fi", "Limitar la sincronización a redes Wi‑Fi.") +
      "</div>" +
      "<div class=\"cfg-aj-sec\"><h4>☰ Preferencias</h4>" +
        rowToggle("cfg-aj-notify", "Notificaciones", "Recibir alertas sobre actividades importantes.") +
        rowToggle("cfg-aj-compact", "Modo compacto", "Reducir espacios para mostrar más información.") +
        "<button type=\"button\" class=\"cc-accion\" id=\"cfg-aj-reset\">↻ Restaurar preferencias</button>" +
      "</div>" +
      "<p id=\"cfg-pref-status\" class=\"msg\" role=\"status\" aria-live=\"polite\"></p>";

    tab.insertBefore(box, tab.firstChild);

    function wireToggle(id, key) {
      var input = document.getElementById(id);
      if (!input) return;
      input.onchange = function () {
        var prefs = loadPrefs();
        prefs[key] = input.checked;
        savePrefs(prefs);
        applyAppearance(prefs);
        setStatus("Preferencia guardada.", true);
      };
    }

    document.querySelectorAll(".cfg-aj-app").forEach(function (button) {
      button.onclick = function () {
        var prefs = loadPrefs();
        prefs.appearance = button.getAttribute("data-app");
        savePrefs(prefs);
        syncUI();
        setStatus("Apariencia guardada.", true);
      };
    });

    wireToggle("cfg-aj-auto-refresh", "autoRefresh");
    wireToggle("cfg-aj-sync-auto", "syncAuto");
    wireToggle("cfg-aj-sync-open", "syncOnOpen");
    wireToggle("cfg-aj-sync-wifi", "syncWifiOnly");
    wireToggle("cfg-aj-notify", "notifications");
    wireToggle("cfg-aj-compact", "compacto");

    document.getElementById("cfg-aj-reset").onclick = function () {
      if (!window.confirm("¿Restaurar las preferencias a los valores por defecto?")) return;
      savePrefs(Object.assign({}, DEFAULTS));
      syncUI();
      setStatus("Preferencias restauradas.", true);
    };

    syncUI();
  }

  function syncUI() {
    var prefs = loadPrefs();
    var mapping = {
      "cfg-aj-auto-refresh": "autoRefresh",
      "cfg-aj-sync-auto": "syncAuto",
      "cfg-aj-sync-open": "syncOnOpen",
      "cfg-aj-sync-wifi": "syncWifiOnly",
      "cfg-aj-notify": "notifications",
      "cfg-aj-compact": "compacto"
    };
    Object.keys(mapping).forEach(function (id) {
      var input = document.getElementById(id);
      if (input) {
        input.checked = !!prefs[mapping[id]];
      }
    });
    document.querySelectorAll(".cfg-aj-app").forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-app") === prefs.appearance);
    });
    applyAppearance(prefs);
  }

  var style = document.createElement("style");
  style.id = "bc-preferencias-personales-css";
  style.textContent =
    ".cfg-aj-sec{margin-top:18px}.cfg-aj-sec h4{margin:0 0 10px;color:var(--gold-bright);font-size:12px;letter-spacing:.04em}.cfg-aj-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05)}.cfg-aj-row strong{display:block;font-size:13.5px;color:var(--text)}.cfg-aj-row small{display:block;margin-top:2px;font-size:11.5px;line-height:1.35;color:var(--mist)}.cfg-aj-toggle{position:relative;width:46px;height:26px;flex:0 0 auto}.cfg-aj-toggle input{position:absolute;inset:0;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:2}.cfg-aj-toggle span{position:absolute;inset:0;background:rgba(255,255,255,.12);border-radius:999px;cursor:pointer;pointer-events:none}.cfg-aj-toggle input:focus-visible+span{outline:2px solid var(--gold-bright);outline-offset:3px}.cfg-aj-toggle span:before{content:\"\";position:absolute;width:20px;height:20px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}.cfg-aj-toggle input:checked+span{background:rgba(201,162,77,.55)}.cfg-aj-toggle input:checked+span:before{transform:translateX(20px)}.cfg-aj-appearance{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cfg-aj-app{padding:11px;border-radius:10px;border:1px solid rgba(201,162,77,.2);background:rgba(12,28,24,.4);color:var(--mist);cursor:pointer}.cfg-aj-app.active{border-color:rgba(201,162,77,.5);background:rgba(201,162,77,.12);color:var(--gold-bright)}@media(max-width:650px){.cfg-aj-appearance{grid-template-columns:1fr}}";
  if (!document.getElementById(style.id)) document.head.appendChild(style);

  function run() { ensurePanel(); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      run();
      setTimeout(run, 500);
    }, { once: true });
  } else {
    run();
    setTimeout(run, 500);
  }
})();
