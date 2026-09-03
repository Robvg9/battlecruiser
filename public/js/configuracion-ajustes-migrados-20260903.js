// BattleCruiser — Ajustes migrados dentro de Configuración
(function () {
  "use strict";
  if (window.__BC_CONFIG_AJUSTES_MIGRADOS_20260903__) return;
  window.__BC_CONFIG_AJUSTES_MIGRADOS_20260903__ = true;

  var LS = "bc-ui-preferences-v2";
  var DEFAULTS = {
    compacto: false,
    autoRefresh: true,
    syncAuto: true,
    syncOnOpen: true,
    syncWifiOnly: false,
    onlinePref: "auto",
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

  function setStatus(text, ok) {
    var el = document.getElementById("cfg-aj-status");
    if (!el) return;
    el.className = "msg " + (ok === false ? "error" : "ok");
    el.textContent = text;
  }

  function rowToggle(id, title, desc) {
    return "<div class=\"cfg-aj-row\">" +
      "<div><strong>" + title + "</strong><small>" + desc + "</small></div>" +
      "<label class=\"cfg-aj-toggle\"><input type=\"checkbox\" id=\"" + id + "\"><span></span></label>" +
      "</div>";
  }

  function ensurePanel() {
    var tab = document.getElementById("tab-config");
    if (!tab || document.getElementById("cfg-ajustes-basicos")) return;

    var box = document.createElement("section");
    box.className = "cc-bloque";
    box.id = "cfg-ajustes-basicos";
    box.innerHTML =
      "<h3>⚙️ Ajustes básicos</h3>" +
      "<p class=\"muted\">Preferencias generales de la aplicación que estaban dentro del antiguo botón Ajustes.</p>" +
      "<div class=\"cfg-aj-sec\"><h4>⚡ Rápido</h4>" +
        "<button type=\"button\" class=\"cc-accion cfg-aj-wide\" id=\"cfg-aj-update\">☁️ Actualizar app / borrar caché</button>" +
      "</div>" +
      "<div class=\"cfg-aj-sec\"><h4>◐ Apariencia</h4>" +
        "<div class=\"cfg-aj-appearance\">" +
          "<button type=\"button\" class=\"cfg-aj-app\" data-app=\"dark\">🌙 Modo oscuro</button>" +
          "<button type=\"button\" class=\"cfg-aj-app\" data-app=\"light\">☀️ Modo claro</button>" +
        "</div>" +
      "</div>" +
      "<div class=\"cfg-aj-sec\"><h4>🔄 Sincronización</h4>" +
        rowToggle("cfg-aj-auto-refresh", "Actualización automática", "Mantener datos actualizados en segundo plano.") +
        rowToggle("cfg-aj-sync-auto", "Sincronización automática", "Sincronizar cambios automáticamente.") +
        rowToggle("cfg-aj-sync-open", "Sincronizar al abrir app", "Sincronizar automáticamente al abrir la aplicación.") +
        rowToggle("cfg-aj-sync-wifi", "Sincronizar solo en Wi‑Fi", "Limitar la sincronización a redes Wi‑Fi.") +
      "</div>" +
      "<div class=\"cfg-aj-sec\"><h4>☰ Preferencias</h4>" +
        "<label class=\"cfg-aj-field\"><strong>Región / Conexión</strong><small>Preferencia de conexión.</small>" +
          "<select id=\"cfg-aj-online\"><option value=\"auto\">🌐 Automática</option><option value=\"online\">Preferir online</option><option value=\"offline\">Preferir offline</option></select>" +
        "</label>" +
        rowToggle("cfg-aj-notify", "Notificaciones", "Recibir alertas sobre actividades importantes.") +
        rowToggle("cfg-aj-compact", "Modo compacto", "Reducir espacios para mostrar más información.") +
        "<div class=\"cfg-aj-links\">" +
          "<button type=\"button\" class=\"cc-accion\" id=\"cfg-aj-pass\">🔐 Cambiar contraseña</button>" +
          "<button type=\"button\" class=\"cc-accion\" id=\"cfg-aj-data\">🛠️ Administrador de datos</button>" +
          "<button type=\"button\" class=\"cc-accion\" id=\"cfg-aj-reset\">↻ Restaurar ajustes</button>" +
          "<button type=\"button\" class=\"cc-accion cfg-aj-logout\" id=\"cfg-aj-logout\">Cerrar sesión</button>" +
        "</div>" +
      "</div>" +
      "<p id=\"cfg-aj-status\" class=\"msg\"></p>";

    tab.insertBefore(box, document.getElementById("cfg-mantenimiento") || tab.firstChild);

    function wireToggle(id, key) {
      var input = document.getElementById(id);
      if (!input) return;
      input.onchange = function () {
        var prefs = loadPrefs();
        prefs[key] = input.checked;
        savePrefs(prefs);
        applyAppearance(prefs);
        setStatus("Ajuste guardado.", true);
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

    var online = document.getElementById("cfg-aj-online");
    online.onchange = function () {
      var prefs = loadPrefs();
      prefs.onlinePref = online.value;
      savePrefs(prefs);
      setStatus("Preferencia de conexión guardada.", true);
    };

    document.getElementById("cfg-aj-update").onclick = function () {
      var btn = document.getElementById("update-app-btn");
      if (btn) { btn.click(); return; }
      if (typeof actualizarApp === "function") actualizarApp(this);
    };

    document.getElementById("cfg-aj-pass").onclick = function () {
      var btn = document.getElementById("change-pass-btn");
      if (btn) { btn.click(); return; }
      var panel = document.getElementById("pass-panel");
      if (panel) panel.classList.remove("hidden");
    };

    document.getElementById("cfg-aj-data").onclick = function () {
      var maintenance = document.getElementById("cfg-mantenimiento");
      if (maintenance) maintenance.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    document.getElementById("cfg-aj-reset").onclick = function () {
      if (!window.confirm("¿Restaurar todos los ajustes a los valores por defecto?")) return;
      savePrefs(Object.assign({}, DEFAULTS));
      syncUI();
      setStatus("Ajustes restaurados.", true);
    };

    document.getElementById("cfg-aj-logout").onclick = function () {
      if (!window.confirm("¿Cerrar sesión y volver al login?")) return;
      var btn = document.getElementById("logout-btn");
      if (btn) btn.click();
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
      if (input) input.checked = !!prefs[mapping[id]];
    });
    var online = document.getElementById("cfg-aj-online");
    if (online) online.value = prefs.onlinePref || "auto";
    document.querySelectorAll(".cfg-aj-app").forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-app") === prefs.appearance);
    });
    applyAppearance(prefs);
  }

  var style = document.createElement("style");
  style.id = "bc-config-ajustes-migrados-css";
  style.textContent =
    ".cfg-aj-sec{margin-top:18px}.cfg-aj-sec h4{margin:0 0 10px;color:var(--gold-bright);font-size:12px;letter-spacing:.04em}.cfg-aj-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05)}.cfg-aj-row strong,.cfg-aj-field strong{display:block;font-size:13.5px;color:var(--text)}.cfg-aj-row small,.cfg-aj-field small{display:block;margin-top:2px;font-size:11.5px;line-height:1.35;color:var(--mist)}.cfg-aj-toggle{position:relative;width:46px;height:26px;flex:0 0 auto}.cfg-aj-toggle input{opacity:0;width:0;height:0}.cfg-aj-toggle span{position:absolute;inset:0;background:rgba(255,255,255,.12);border-radius:999px;cursor:pointer}.cfg-aj-toggle span:before{content:\"\";position:absolute;width:20px;height:20px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}.cfg-aj-toggle input:checked+span{background:rgba(201,162,77,.55)}.cfg-aj-toggle input:checked+span:before{transform:translateX(20px)}.cfg-aj-appearance{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cfg-aj-app{padding:11px;border-radius:10px;border:1px solid rgba(201,162,77,.2);background:rgba(12,28,24,.4);color:var(--mist);cursor:pointer}.cfg-aj-app.active{border-color:rgba(201,162,77,.5);background:rgba(201,162,77,.12);color:var(--gold-bright)}.cfg-aj-field{display:block;margin-bottom:12px}.cfg-aj-field select{display:block;width:100%;margin-top:7px;padding:10px;border-radius:9px;background:var(--void);border:1px solid rgba(201,162,77,.2);color:var(--text)}.cfg-aj-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.cfg-aj-wide{width:100%;text-align:left}.cfg-aj-logout{border-color:rgba(200,80,80,.35)}@media(max-width:650px){.cfg-aj-appearance{grid-template-columns:1fr}}";
  if (!document.getElementById(style.id)) document.head.appendChild(style);

  function run() {
    ensurePanel();
  }

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
