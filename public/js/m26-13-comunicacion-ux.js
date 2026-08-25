// BattleCruiser — M26.13-FE: UX chat + estabilidad cambio de conversación
// Parche aislado. NO reescribe comunicacion.js. NO toca offline/cola/Supabase.
// Reutiliza: abrirConversacion, refrescarMensajes, renderMensajes, enviarMensaje, setMsg.
(function () {
  "use strict";
  if (window.__bcM2613) return;
  window.__bcM2613 = true;

  var LOG = "[Battlecruiser][M26.13]";
  var _gen = 0;
  var _pendingMsgUi = false;

  function log() {
    try {
      var a = Array.prototype.slice.call(arguments);
      a.unshift(LOG);
      console.log.apply(console, a);
    } catch (e) {}
  }

  /* ---------- 1) Input estilo WhatsApp (mismo form-mensaje) ---------- */
  function injectCss() {
    if (document.getElementById("bc-m2613-css")) return;
    var s = document.createElement("style");
    s.id = "bc-m2613-css";
    s.textContent = [
      "#tab-comunicacion .com-col-chat{",
      "  display:flex!important;flex-direction:column!important;",
      "  min-height:min(70vh,720px);",
      "}",
      "#tab-comunicacion .com-mensajes{",
      "  flex:1 1 auto;min-height:180px;max-height:none;",
      "  overflow-y:auto;-webkit-overflow-scrolling:touch;",
      "}",
      "#tab-comunicacion #form-mensaje.com-input-bar,",
      "#tab-comunicacion .com-input-bar{",
      "  display:flex!important;align-items:center!important;gap:10px!important;",
      "  flex:0 0 auto;margin-top:10px!important;padding:10px 12px!important;",
      "  border-radius:16px!important;",
      "  background:var(--void,#0e1614)!important;",
      "  border:1px solid rgba(201,162,77,.35)!important;",
      "  box-shadow:0 2px 12px rgba(0,0,0,.25);",
      "  min-height:52px;",
      "}",
      "#tab-comunicacion #mensaje-input{",
      "  flex:1 1 auto!important;min-width:0!important;",
      "  min-height:40px!important;height:auto!important;",
      "  padding:10px 14px!important;margin:0!important;",
      "  font-size:16px!important;line-height:1.35!important;",
      "  color:var(--text,#f2efe6)!important;",
      "  background:rgba(255,255,255,.04)!important;",
      "  border:1px solid rgba(201,162,77,.22)!important;",
      "  border-radius:12px!important;outline:none!important;",
      "  font-family:Inter,system-ui,sans-serif!important;",
      "}",
      "#tab-comunicacion #mensaje-input::placeholder{color:var(--mist,#8a8a7a)!important;opacity:1}",
      "#tab-comunicacion #mensaje-input:focus{",
      "  border-color:rgba(201,162,77,.55)!important;",
      "  box-shadow:0 0 0 2px rgba(201,162,77,.15);",
      "}",
      "#tab-comunicacion #form-mensaje button[type=submit],",
      "#tab-comunicacion .com-input-bar button[type=submit]{",
      "  flex:0 0 auto!important;min-height:40px!important;",
      "  padding:10px 18px!important;border-radius:12px!important;",
      "  font-size:14px!important;font-weight:600!important;",
      "  white-space:nowrap;",
      "}",
      "#tab-comunicacion #msg-mensaje{",
      "  margin:6px 2px 0;font-size:12.5px;line-height:1.35;",
      "}",
      "#tab-comunicacion #msg-mensaje:empty{display:none}",
      "@media(max-width:768px){",
      "  #tab-comunicacion .com-col-chat{min-height:calc(100vh - 140px)}",
      "  #tab-comunicacion #mensaje-input{font-size:16px!important}",
      "}"
    ].join("\n");
    document.head.appendChild(s);
  }

  function enhanceInput() {
    var form = document.getElementById("form-mensaje");
    var input = document.getElementById("mensaje-input");
    if (form) {
      form.classList.add("com-input-bar");
      form.style.display = "";
    }
    if (input) {
      input.setAttribute("placeholder", "Escribí un mensaje…");
      input.setAttribute("autocomplete", "off");
      input.setAttribute("enterkeyhint", "send");
      if (!input.style.minHeight) input.style.minHeight = "40px";
    }
  }

  /* ---------- 2) Aviso pendiente ligado al estado real ---------- */
  function textoEsPendiente(t) {
    if (!t) return false;
    var s = String(t).toLowerCase();
    return s.indexOf("pendiente") >= 0 && (s.indexOf("conex") >= 0 || s.indexOf("sincron") >= 0 || s.indexOf("reconectar") >= 0);
  }

  function hayMensajesPendientesEnCola() {
    try {
      if (typeof window._colaOperaciones === "object" && Array.isArray(window._colaOperaciones)) {
        return window._colaOperaciones.some(function (op) {
          var t = (op && (op.tipo || op.type || "")).toString().toLowerCase();
          return t === "mensaje" || t.indexOf("mensaje") >= 0;
        });
      }
    } catch (e1) {}
    try {
      var badge = document.getElementById("cola-pendientes-badge");
      if (badge && !badge.classList.contains("hidden")) {
        var n = parseInt(badge.textContent, 10);
        if (n > 0 && _pendingMsgUi) return true;
      }
    } catch (e2) {}
    return false;
  }

  function limpiarAvisoPendienteSiCorresponde() {
    var el = document.getElementById("msg-mensaje");
    if (!el) return;
    if (!textoEsPendiente(el.textContent)) return;
    if (hayMensajesPendientesEnCola()) return;
    el.textContent = "";
    el.className = "msg";
    _pendingMsgUi = false;
    // Quitar burbujas visuales "pendiente" si ya no hay cola
    try {
      document.querySelectorAll(".com-msg-pendiente").forEach(function (n) {
        n.classList.remove("com-msg-pendiente");
        var meta = n.querySelector(".com-msg-meta");
        if (meta && /pendiente/i.test(meta.textContent || "")) {
          meta.textContent = (meta.textContent || "").replace(/⏳\s*Pendiente de conexión/i, "✓ Enviado").trim();
        }
      });
    } catch (e) {}
  }

  function marcarPendienteUi() {
    _pendingMsgUi = true;
  }

  function wrapSetMsg() {
    if (typeof setMsg !== "function" || setMsg.__bcM2613) return;
    var orig = setMsg;
    var wrapped = function (id, texto, ok) {
      var r = orig.apply(this, arguments);
      try {
        if (id === "msg-mensaje" && textoEsPendiente(texto)) marcarPendienteUi();
        if (id === "msg-mensaje" && (!texto || !String(texto).trim())) _pendingMsgUi = false;
      } catch (e) {}
      return r;
    };
    wrapped.__bcM2613 = true;
    window.setMsg = wrapped;
    try { setMsg = wrapped; } catch (e2) {}
  }

  function wrapEnviarMensaje() {
    if (typeof enviarMensaje !== "function" || enviarMensaje.__bcM2613) return;
    var orig = enviarMensaje;
    var wrapped = async function (contenido) {
      var r = await orig.apply(this, arguments);
      try {
        if (r === true) {
          var el = document.getElementById("msg-mensaje");
          if (el && textoEsPendiente(el.textContent)) marcarPendienteUi();
        }
      } catch (e) {}
      return r;
    };
    wrapped.__bcM2613 = true;
    window.enviarMensaje = wrapped;
    try { enviarMensaje = wrapped; } catch (e2) {}
  }

  function wrapActualizarContador() {
    if (typeof actualizarContadorColaPendiente !== "function") return;
    if (actualizarContadorColaPendiente.__bcM2613) return;
    var orig = actualizarContadorColaPendiente;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try {
        setTimeout(limpiarAvisoPendienteSiCorresponde, 0);
        setTimeout(limpiarAvisoPendienteSiCorresponde, 300);
      } catch (e) {}
      return r;
    };
    wrapped.__bcM2613 = true;
    window.actualizarContadorColaPendiente = wrapped;
    try { actualizarContadorColaPendiente = wrapped; } catch (e2) {}
  }

  function wrapReconciliar() {
    if (typeof reconciliarTrasOperacion !== "function") return;
    if (reconciliarTrasOperacion.__bcM2613) return;
    var orig = reconciliarTrasOperacion;
    var wrapped = function (tipo) {
      var r = orig.apply(this, arguments);
      try {
        var t = String(tipo || "").toLowerCase();
        if (t === "mensaje" || t.indexOf("mensaje") >= 0 || t === "comunicacion") {
          setTimeout(limpiarAvisoPendienteSiCorresponde, 0);
          setTimeout(function () {
            limpiarAvisoPendienteSiCorresponde();
            if (typeof refrescarMensajes === "function" && window._comConvActual) {
              try { refrescarMensajes(window._comConvActual); } catch (e) {}
            }
          }, 200);
        }
      } catch (e2) {}
      return r;
    };
    wrapped.__bcM2613 = true;
    window.reconciliarTrasOperacion = wrapped;
    try { reconciliarTrasOperacion = wrapped; } catch (e3) {}
  }

  function onOnline() {
    setTimeout(limpiarAvisoPendienteSiCorresponde, 400);
    setTimeout(limpiarAvisoPendienteSiCorresponde, 1500);
  }

  /* ---------- 3) Generación / token anti-carrera ---------- */
  function bumpGen(convId) {
    _gen += 1;
    window.__bcComMsgGen = _gen;
    window.__bcComConvTarget = convId || null;
    return _gen;
  }

  function isStale(gen, convId) {
    if (gen !== window.__bcComMsgGen) return true;
    try {
      var cur = typeof _comConvActual !== "undefined" ? _comConvActual : window._comConvActual;
      if (convId && cur && String(cur) !== String(convId)) return true;
    } catch (e) {}
    return false;
  }

  function wrapAbrirConversacion() {
    if (typeof abrirConversacion !== "function") return;
    if (abrirConversacion.__bcM2613) return;
    var orig = abrirConversacion;
    var wrapped = async function (conv_id, tipo) {
      var gen = bumpGen(conv_id);
      // Feedback inmediato: título + loading antes de await
      try {
        var el = document.getElementById("com-mensajes");
        if (el) el.innerHTML = '<p class="lista-estado">Cargando mensajes…</p>';
        var form = document.getElementById("form-mensaje");
        if (form && typeof tienePermiso === "function") {
          form.classList.toggle("hidden", !tienePermiso("comunicacion", "crear"));
        }
      } catch (e0) {}

      // Establecer estado global de inmediato (antes de promesas)
      try {
        if (typeof _comConvActual !== "undefined") {
          // let binding may not be assignable via window; orig will set it
        }
        window._comConvActual = conv_id;
      } catch (e1) {}

      var r = await orig.apply(this, arguments);

      if (isStale(gen, conv_id)) {
        log("abrirConversacion: resultado ignorado (stale)", conv_id, gen);
        return r;
      }
      return r;
    };
    wrapped.__bcM2613 = true;
    window.abrirConversacion = wrapped;
    try { abrirConversacion = wrapped; } catch (e2) {}
  }

  function wrapRefrescarMensajes() {
    if (typeof refrescarMensajes !== "function") return;
    if (refrescarMensajes.__bcM2613) return;
    var orig = refrescarMensajes;
    var wrapped = async function (conv_id) {
      var gen = window.__bcComMsgGen || 0;
      var target = conv_id;
      // Si la conversación activa ya cambió, no empezar carga vieja
      try {
        var cur = typeof _comConvActual !== "undefined" ? _comConvActual : window._comConvActual;
        if (cur && target && String(cur) !== String(target)) {
          log("refrescarMensajes: skip start stale", target, cur);
          return;
        }
      } catch (e0) {}

      // Monkey-patch temporal de renderMensajes durante esta carga
      var origRender = typeof renderMensajes === "function" ? renderMensajes : null;
      if (origRender && !origRender.__bcM2613Inner) {
        var guardRender = function (filas) {
          if (isStale(gen, target)) {
            log("renderMensajes: ignorado stale", target, gen);
            return;
          }
          return origRender.apply(this, arguments);
        };
        // only for this call chain via local override below
      }

      // Intercept by wrapping global render for the duration
      var prevRender = window.renderMensajes || (typeof renderMensajes === "function" ? renderMensajes : null);
      if (typeof prevRender === "function") {
        var scoped = function (filas) {
          if (isStale(gen, target)) {
            log("renderMensajes scoped: stale", target);
            return;
          }
          return prevRender.apply(this, arguments);
        };
        window.renderMensajes = scoped;
        try { renderMensajes = scoped; } catch (e1) {}
      }

      try {
        var r = await orig.apply(this, arguments);
        if (isStale(gen, target)) {
          log("refrescarMensajes: fin stale", target);
          return;
        }
        return r;
      } finally {
        if (typeof prevRender === "function") {
          // Only restore if no newer gen took over
          if (!isStale(gen, target)) {
            window.renderMensajes = prevRender;
            try { renderMensajes = prevRender; } catch (e2) {}
          }
        }
      }
    };
    wrapped.__bcM2613 = true;
    window.refrescarMensajes = wrapped;
    try { refrescarMensajes = wrapped; } catch (e3) {}
  }

  function wrapRenderMensajes() {
    if (typeof renderMensajes !== "function") return;
    if (renderMensajes.__bcM2613) return;
    var orig = renderMensajes;
    var wrapped = function (filas) {
      try {
        var cur = typeof _comConvActual !== "undefined" ? _comConvActual : window._comConvActual;
        var target = window.__bcComConvTarget;
        if (target && cur && String(target) !== String(cur)) {
          // allow if target matches current gen's target intentionally
        }
        // Always allow if gen matches current
        // If another open bumped gen mid-render of old data without setting target match:
        // check dataset on com-mensajes
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    wrapped.__bcM2613 = true;
    // Don't double-wrap heavily; refrescarMensajes scoped is primary
  }

  /* También liberar _busy de M26.12 en cambios rápidos no aplica aquí —
     el token de generación es la protección real. */

  function boot() {
    injectCss();
    enhanceInput();
    wrapSetMsg();
    wrapEnviarMensaje();
    wrapActualizarContador();
    wrapReconciliar();
    wrapAbrirConversacion();
    wrapRefrescarMensajes();
    window.addEventListener("online", onOnline);
    // Polling suave solo si hay aviso pendiente visible
    setInterval(function () {
      try {
        var el = document.getElementById("msg-mensaje");
        if (el && textoEsPendiente(el.textContent)) limpiarAvisoPendienteSiCorresponde();
      } catch (e) {}
    }, 2000);
    log("módulo cargado");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(boot, 250);
      setTimeout(boot, 900);
    });
  } else {
    setTimeout(boot, 250);
    setTimeout(boot, 900);
  }
})();
