// BattleCruiser — M26.15b: layout real del chat (empty overlay + compositor)
// FIX v9.3.18: elimina MutationObserver que mutaba class en el mismo nodo observado
// (riesgo de cascada con ui-visual-salon al insertar .com-chat-empty).
// Boot único + wrappers idempotentes. Nunca bloquea el arranque global.
// NO reescribe comunicacion.js. NO toca cola/Supabase. NO duplica envío.
(function () {
  "use strict";
  if (window.__bcM2615) return;
  window.__bcM2615 = true;

  var CSS_ID = "bc-m2615-css";
  var syncing = false;
  var bootDone = false;

  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement("style");
    s.id = CSS_ID;
    s.textContent = [
      "#tab-comunicacion .com-layout{",
      "  display:flex!important;flex-direction:row!important;align-items:stretch!important;",
      "  gap:12px!important;width:100%!important;max-width:100%!important;",
      "  min-height:0!important;max-height:none!important;",
      "  height:calc(100vh - 168px)!important;",
      "  overflow:hidden!important;box-sizing:border-box!important;",
      "}",
      "#tab-comunicacion .com-col-lista{",
      "  flex:0 0 34%!important;max-width:360px!important;min-width:220px!important;",
      "  min-height:0!important;height:100%!important;overflow:hidden!important;",
      "  display:flex!important;flex-direction:column!important;",
      "}",
      "#tab-comunicacion .bc-wa-shell,#tab-comunicacion .bc-wa-list{",
      "  min-height:0!important;flex:1 1 auto!important;overflow:auto!important;",
      "  max-height:none!important;",
      "}",
      "#tab-comunicacion .com-col-chat,",
      "#tab-comunicacion #com-col-chat{",
      "  flex:1 1 auto!important;min-width:0!important;min-height:0!important;",
      "  height:100%!important;max-height:100%!important;",
      "  display:flex!important;flex-direction:column!important;",
      "  overflow:hidden!important;position:relative!important;",
      "  box-sizing:border-box!important;",
      "}",
      /* Empty oculto solo con conversación abierta (clase set desde wrappers, no MO) */
      "#tab-comunicacion #com-col-chat.com-chat-abierto > .com-chat-empty{",
      "  display:none!important;visibility:hidden!important;pointer-events:none!important;",
      "}",
      "#tab-comunicacion .com-chat-header{",
      "  flex:0 0 auto!important;position:relative!important;z-index:2!important;",
      "}",
      "#tab-comunicacion .com-mensajes,",
      "#tab-comunicacion #com-mensajes{",
      "  flex:1 1 auto!important;min-height:0!important;max-height:none!important;",
      "  overflow-x:hidden!important;overflow-y:auto!important;",
      "  position:relative!important;z-index:2!important;",
      "  -webkit-overflow-scrolling:touch;",
      "}",
      "#tab-comunicacion #form-mensaje,",
      "#tab-comunicacion .com-input-bar{",
      "  display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;",
      "  align-items:center!important;gap:10px!important;",
      "  flex:0 0 auto!important;width:100%!important;max-width:100%!important;",
      "  min-width:0!important;box-sizing:border-box!important;",
      "  margin:0!important;padding:12px!important;",
      "  position:relative!important;z-index:3!important;",
      "  overflow:visible!important;",
      "  background:var(--void,#0e1614)!important;",
      "  border-top:1px solid rgba(201,162,77,.35)!important;",
      "}",
      "#tab-comunicacion #form-mensaje.hidden{display:none!important}",
      "#tab-comunicacion #mensaje-input{",
      "  flex:1 1 auto!important;width:auto!important;min-width:0!important;",
      "  max-width:none!important;box-sizing:border-box!important;",
      "  min-height:48px!important;height:48px!important;",
      "  padding:12px 14px!important;margin:0!important;",
      "  font-size:16px!important;line-height:1.35!important;",
      "  color:var(--text,#f2efe6)!important;",
      "  background:rgba(255,255,255,.06)!important;",
      "  border:1px solid rgba(201,162,77,.35)!important;",
      "  border-radius:12px!important;",
      "}",
      "#tab-comunicacion #form-mensaje button[type=submit],",
      "#tab-comunicacion .com-input-bar button[type=submit]{",
      "  width:auto!important;max-width:none!important;min-width:96px!important;",
      "  flex:0 0 auto!important;flex-shrink:0!important;",
      "  min-height:48px!important;height:48px!important;",
      "  margin:0!important;padding:0 18px!important;",
      "  border-radius:12px!important;white-space:nowrap!important;",
      "  box-sizing:border-box!important;",
      "}",
      "#tab-comunicacion #msg-mensaje{flex:0 0 auto;padding:0 12px 8px;z-index:3;position:relative}",
      "#tab-comunicacion #msg-mensaje:empty{display:none!important}",
      "#tab-comunicacion #com-cerrar-btn{",
      "  display:none!important;visibility:hidden!important;pointer-events:none!important;",
      "  width:0!important;height:0!important;overflow:hidden!important;",
      "}",
      "@media(max-width:768px){",
      "  #tab-comunicacion .com-layout{flex-direction:column!important;height:calc(100dvh - 132px)!important}",
      "  #tab-comunicacion .com-col-lista{flex:1 1 auto!important;max-width:none!important;min-width:0!important;height:auto!important}",
      "  #tab-comunicacion #com-col-chat{flex:1 1 auto!important;min-height:0!important}",
      "  #tab-comunicacion #com-col-chat.hidden{display:none!important}",
      "}"
    ].join("\n");
    try {
      document.head.appendChild(s);
    } catch (e) {}
  }

  function chatAbierto() {
    var chat = document.getElementById("com-col-chat");
    if (!chat) return false;
    if (chat.classList.contains("com-chat-abierto")) return true;
    try {
      if (typeof _comConvActual !== "undefined" && _comConvActual) return true;
    } catch (e) {}
    if (window._comConvActual) return true;
    return false;
  }

  /** Sync sin MutationObserver. Reentrancy guard. Nunca lanza. */
  function syncEmptyAndComposer() {
    if (syncing) return;
    syncing = true;
    try {
      var chat = document.getElementById("com-col-chat");
      if (!chat) return;

      var abierta = chatAbierto();
      if (abierta) {
        if (!chat.classList.contains("com-chat-abierto")) {
          chat.classList.add("com-chat-abierto");
        }
      } else {
        if (chat.classList.contains("com-chat-abierto")) {
          chat.classList.remove("com-chat-abierto");
        }
      }

      var form = document.getElementById("form-mensaje");
      if (form) {
        form.classList.add("com-input-bar");
        if (abierta) {
          var puede = true;
          try {
            if (typeof tienePermiso === "function") {
              puede = !!tienePermiso("comunicacion", "crear");
            }
          } catch (e2) {}
          if (puede) form.classList.remove("hidden");
        }
      }

      var btn = document.getElementById("com-cerrar-btn");
      if (btn) {
        btn.classList.add("hidden");
        btn.setAttribute("aria-hidden", "true");
      }
    } catch (e) {
      /* degradación segura */
    } finally {
      syncing = false;
    }
  }

  function wrapAbrir() {
    if (typeof abrirConversacion !== "function") return false;
    if (abrirConversacion.__bcM2615) return true;
    var orig = abrirConversacion;
    var wrapped = function (conv_id, tipo) {
      try {
        var chat = document.getElementById("com-col-chat");
        if (chat) {
          chat.classList.remove("hidden");
          chat.classList.add("com-chat-abierto");
        }
        syncEmptyAndComposer();
      } catch (e0) {}

      var result;
      try {
        result = orig.apply(this, arguments);
      } catch (err) {
        try { syncEmptyAndComposer(); } catch (e1) {}
        throw err;
      }

      // No convertir en espera infinita: aceptar sync o async
      if (result && typeof result.then === "function") {
        return result.then(
          function (v) {
            try { syncEmptyAndComposer(); } catch (e2) {}
            return v;
          },
          function (err) {
            try { syncEmptyAndComposer(); } catch (e3) {}
            throw err;
          }
        );
      }
      try { syncEmptyAndComposer(); } catch (e4) {}
      return result;
    };
    wrapped.__bcM2615 = true;
    try {
      if (orig.__bcM2612) wrapped.__bcM2612 = true;
      if (orig.__bcM2613) wrapped.__bcM2613 = true;
    } catch (e) {}
    window.abrirConversacion = wrapped;
    try { abrirConversacion = wrapped; } catch (e5) {}
    return true;
  }

  function wrapVolver() {
    if (typeof volverListaConversaciones !== "function") return false;
    if (volverListaConversaciones.__bcM2615) return true;
    var orig = volverListaConversaciones;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try {
        var chat = document.getElementById("com-col-chat");
        if (chat) chat.classList.remove("com-chat-abierto");
        syncEmptyAndComposer();
      } catch (e) {}
      return r;
    };
    wrapped.__bcM2615 = true;
    window.volverListaConversaciones = wrapped;
    try { volverListaConversaciones = wrapped; } catch (e) {}
    return true;
  }

  function tryWrap() {
    try {
      wrapAbrir();
      wrapVolver();
    } catch (e) {}
  }

  function boot() {
    if (bootDone) {
      tryWrap();
      return;
    }
    try {
      injectCss();
      tryWrap();
      syncEmptyAndComposer();
      bootDone = true;
    } catch (e) {
      /* nunca bloquear arranque */
    }
  }

  // Un solo arranque + un reintento tardío solo para envolver funciones aún no definidas.
  function schedule() {
    try {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
          setTimeout(boot, 200);
          setTimeout(tryWrap, 1200);
        });
      } else {
        setTimeout(boot, 200);
        setTimeout(tryWrap, 1200);
      }
    } catch (e) {
      try { boot(); } catch (e2) {}
    }
  }

  schedule();
})();
