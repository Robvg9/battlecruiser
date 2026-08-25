// BattleCruiser — M26.15: layout real del chat (empty overlay + compositor)
// Causa raíz (prueba real v9.2.90):
//  1) ui-visual-salon.js inyecta .com-chat-empty (position:absolute;inset:0)
//     y NUNCA lo oculta al abrir una conversación → "¡Hola, Roberto!" tapa el chat.
//  2) button[type=submit]{width:100%} global + .com-layout{max-height:60vh}
//     + overflow:hidden de M26.13/14 recortan el botón Enviar.
// NO reescribe comunicacion.js. NO toca cola/Supabase. NO duplica envío.
(function () {
  "use strict";
  if (window.__bcM2615) return;
  window.__bcM2615 = true;

  var LOG = "[Battlecruiser][M26.15]";

  function log() {
    try {
      var a = Array.prototype.slice.call(arguments);
      a.unshift(LOG);
      console.log.apply(console, a);
    } catch (e) {}
  }

  function injectCss() {
    var old = document.getElementById("bc-m2615-css");
    if (old) old.remove();
    var s = document.createElement("style");
    s.id = "bc-m2615-css";
    s.textContent = [
      /* Layout: el panel de chat usa el alto visible, no 60vh + min-height extra */
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
      /* Empty state SOLO cuando no hay conversación abierta */
      "#tab-comunicacion #com-col-chat:not(.hidden) > .com-chat-empty,",
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
      /* Compositor anclado abajo, nunca recortado */
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
      /* Anula width:100% global de button[type=submit] */
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
    document.head.appendChild(s);
  }

  function chatAbierto() {
    var chat = document.getElementById("com-col-chat");
    if (!chat) return false;
    if (chat.classList.contains("com-chat-abierto")) return true;
    if (!chat.classList.contains("hidden")) {
      try {
        if (typeof _comConvActual !== "undefined" && _comConvActual) return true;
      } catch (e) {}
      if (window._comConvActual) return true;
      var titulo = document.getElementById("com-chat-titulo");
      if (titulo && String(titulo.textContent || "").trim()) return true;
    }
    return false;
  }

  function syncEmptyAndComposer() {
    var chat = document.getElementById("com-col-chat");
    if (!chat) return;
    var abierta = chatAbierto();
    if (abierta) chat.classList.add("com-chat-abierto");
    else chat.classList.remove("com-chat-abierto");

    var empty = chat.querySelector(".com-chat-empty");
    if (empty) {
      empty.style.setProperty("display", abierta ? "none" : "", "important");
      empty.setAttribute("aria-hidden", abierta ? "true" : "false");
    }

    var form = document.getElementById("form-mensaje");
    if (form) {
      form.classList.add("com-input-bar");
      if (abierta) {
        var puede = true;
        try {
          if (typeof tienePermiso === "function") puede = !!tienePermiso("comunicacion", "crear");
        } catch (e) {}
        if (puede) form.classList.remove("hidden");
      }
    }

    var btn = document.getElementById("com-cerrar-btn");
    if (btn) {
      btn.classList.add("hidden");
      btn.style.display = "none";
      btn.setAttribute("aria-hidden", "true");
    }
  }

  function wrapAbrir() {
    if (typeof abrirConversacion !== "function") return;
    if (abrirConversacion.__bcM2615) return;
    var orig = abrirConversacion;
    var wrapped = async function (conv_id, tipo) {
      try {
        var chat = document.getElementById("com-col-chat");
        if (chat) {
          chat.classList.remove("hidden");
          chat.classList.add("com-chat-abierto");
        }
        syncEmptyAndComposer();
      } catch (e0) {}
      var r = await orig.apply(this, arguments);
      try { syncEmptyAndComposer(); } catch (e1) {}
      return r;
    };
    wrapped.__bcM2615 = true;
    if (orig.__bcM2612) wrapped.__bcM2612 = true;
    if (orig.__bcM2613) wrapped.__bcM2613 = true;
    window.abrirConversacion = wrapped;
    try { abrirConversacion = wrapped; } catch (e) {}
  }

  function wrapVolver() {
    if (typeof volverListaConversaciones !== "function") return;
    if (volverListaConversaciones.__bcM2615) return;
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
  }

  function observeChat() {
    var chat = document.getElementById("com-col-chat");
    if (!chat || chat.dataset.bcM2615obs === "1") return;
    chat.dataset.bcM2615obs = "1";
    new MutationObserver(function () {
      syncEmptyAndComposer();
    }).observe(chat, { attributes: true, attributeFilter: ["class"], childList: true });
  }

  function boot() {
    injectCss();
    wrapAbrir();
    wrapVolver();
    observeChat();
    syncEmptyAndComposer();
    log("módulo cargado");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(boot, 180);
      setTimeout(boot, 700);
      setTimeout(boot, 1600);
    });
  } else {
    setTimeout(boot, 180);
    setTimeout(boot, 700);
    setTimeout(boot, 1600);
  }
})();
