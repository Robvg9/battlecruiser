// BattleCruiser — M26.12-FE: Comunicación estilo WhatsApp
// Parche aislado. NO reescribe comunicacion.js. NO toca Supabase.
// Reutiliza: ejecutarOperacion, abrirConversacion, enviarMensaje,
// listar_usuarios_para_chat, listar_conversaciones_usuario, crear_conversacion (GENERAL/PRIVADA).
(function () {
  "use strict";

  if (window.__bcM2612) return;
  window.__bcM2612 = true;

  var LOG = "[Battlecruiser][M26.12]";
  var MAP_KEY = "bc_com_peer_map_v1";
  var _usuarios = [];
  var _convs = [];
  var _filtro = "";
  var _busy = false;

  function log() {
    try {
      var a = Array.prototype.slice.call(arguments);
      a.unshift(LOG);
      console.log.apply(console, a);
    } catch (e) {}
  }

  function uidActual() {
    try {
      if (typeof _usuarioActual !== "undefined" && _usuarioActual && _usuarioActual.id) return _usuarioActual.id;
      if (typeof _usuarioActualId !== "undefined" && _usuarioActualId) return _usuarioActualId;
    } catch (e) {}
    return null;
  }

  function leerMapaPeers() {
    try {
      var raw = localStorage.getItem(MAP_KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o && typeof o === "object" ? o : {};
    } catch (e) {
      return {};
    }
  }

  function guardarPeer(userId, convId) {
    if (!userId || !convId) return;
    try {
      var m = leerMapaPeers();
      m[String(userId)] = String(convId);
      localStorage.setItem(MAP_KEY, JSON.stringify(m));
    } catch (e) {}
  }

  function peerDeConv(convId) {
    var m = leerMapaPeers();
    for (var k in m) {
      if (m[k] === String(convId)) return k;
    }
    return null;
  }

  function esc(s) {
    if (typeof escHtml === "function") return escHtml(String(s == null ? "" : s));
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function injectCss() {
    if (document.getElementById("bc-m2612-css")) return;
    var s = document.createElement("style");
    s.id = "bc-m2612-css";
    s.textContent = [
      "#tab-comunicacion .muted{display:none!important}",
      "#tab-comunicacion .pendientes-header h3{font-size:18px}",
      "#com-nueva-btn,#com-soporte-btn,#com-nueva-panel{display:none!important}",
      ".bc-wa-shell{display:flex;flex-direction:column;gap:10px;min-height:min(62vh,640px)}",
      ".bc-wa-search{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:12px;background:var(--void);border:1px solid rgba(201,162,77,.22)}",
      ".bc-wa-search input{flex:1;background:transparent;border:0;outline:none;color:var(--text);font-size:14px;font-family:Inter,system-ui,sans-serif}",
      ".bc-wa-search input::placeholder{color:var(--mist)}",
      ".bc-wa-section{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-dim);padding:6px 4px 2px;font-family:'IBM Plex Mono',monospace}",
      ".bc-wa-list{display:flex;flex-direction:column;gap:2px;overflow:auto;max-height:min(52vh,520px);-webkit-overflow-scrolling:touch}",
      ".bc-wa-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;cursor:pointer;border:1px solid transparent;transition:background .12s ease,border-color .12s ease}",
      ".bc-wa-item:hover,.bc-wa-item:focus{background:rgba(201,162,77,.08);border-color:rgba(201,162,77,.18);outline:none}",
      ".bc-wa-item.active{background:rgba(201,162,77,.14);border-color:rgba(201,162,77,.28)}",
      ".bc-wa-avatar{width:42px;height:42px;border-radius:50%;flex:0 0 42px;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,rgba(201,162,77,.28),rgba(201,162,77,.08));color:var(--gold);font-weight:600;font-size:15px;font-family:Cormorant Garamond,serif}",
      ".bc-wa-avatar.group{background:linear-gradient(145deg,rgba(90,160,120,.35),rgba(90,160,120,.1));color:#9fdfb8}",
      ".bc-wa-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}",
      ".bc-wa-name{font-size:14.5px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".bc-wa-preview{font-size:12.5px;color:var(--mist);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".bc-wa-meta{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:0 0 auto}",
      ".bc-wa-time{font-size:11px;color:var(--mist)}",
      ".bc-wa-badge{min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--gold);color:#1a1408;font-size:11px;font-weight:600;display:inline-flex;align-items:center;justify-content:center}",
      ".bc-wa-empty{padding:28px 16px;text-align:center;color:var(--mist);font-size:13.5px}",
      "#tab-comunicacion .com-layout{min-height:min(62vh,640px)}",
      "#tab-comunicacion .com-col-chat{display:flex;flex-direction:column;min-height:min(62vh,640px)}",
      "#tab-comunicacion .com-mensajes{background:rgba(0,0,0,.12);border-radius:12px}",
      "#tab-comunicacion .com-msg-propio{align-self:flex-end;background:rgba(201,162,77,.18);border-color:rgba(201,162,77,.35)}",
      "#tab-comunicacion .com-input-bar{display:flex;gap:8px;padding:8px;border-radius:12px;background:var(--void);border:1px solid rgba(201,162,77,.2);margin-top:8px}",
      "#tab-comunicacion .com-input-bar input{flex:1;background:transparent;border:0;outline:none;color:var(--text);font-size:14px;padding:8px}",
      "#tab-comunicacion .com-input-bar button{border-radius:10px;padding:8px 14px}",
      "#tab-comunicacion .com-chat-header{display:flex;align-items:center;gap:8px;padding:6px 0 10px}",
      "#tab-comunicacion #com-chat-titulo{flex:1;font-weight:600;font-size:16px;color:var(--gold)}",
      "@media(max-width:768px){.bc-wa-list{max-height:none}.bc-wa-shell{min-height:0}}",
      "@media(min-width:769px){#tab-comunicacion .com-col-lista{flex:0 0 36%;max-width:380px}}"
    ].join("\n");
    document.head.appendChild(s);
  }

  function ensureShell() {
    var listaCol = document.getElementById("com-col-lista");
    if (!listaCol) return null;
    var shell = document.getElementById("bc-wa-shell");
    if (shell) return shell;

    // Ocultar botones legacy de la lista
    var header = listaCol.querySelector(".com-lista-header");
    if (header) header.classList.add("hidden");

    shell = document.createElement("div");
    shell.id = "bc-wa-shell";
    shell.className = "bc-wa-shell";
    shell.innerHTML =
      '<div class="bc-wa-search">' +
      '<span aria-hidden="true">🔍</span>' +
      '<input id="bc-wa-search-input" type="search" placeholder="Buscar usuario…" autocomplete="off" />' +
      "</div>" +
      '<div id="bc-wa-list" class="bc-wa-list" role="list"></div>';

    var listaOld = document.getElementById("lista-conversaciones");
    if (listaOld) {
      listaOld.classList.add("hidden");
      listaOld.setAttribute("aria-hidden", "true");
      listaCol.insertBefore(shell, listaOld);
    } else {
      listaCol.appendChild(shell);
    }

    var input = document.getElementById("bc-wa-search-input");
    if (input && !input.dataset.bcBound) {
      input.dataset.bcBound = "1";
      input.addEventListener("input", function () {
        _filtro = (input.value || "").trim().toLowerCase();
        renderLista();
      });
    }
    return shell;
  }

  function iniciales(nombre) {
    var n = String(nombre || "?").trim();
    if (!n) return "?";
    var parts = n.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }

  function convGeneral() {
    for (var i = 0; i < _convs.length; i++) {
      if (_convs[i].tipo === "GENERAL") return _convs[i];
    }
    return null;
  }

  function convPrivadaParaUsuario(userId, nombre) {
    var map = leerMapaPeers();
    var known = map[String(userId)];
    if (known) {
      for (var i = 0; i < _convs.length; i++) {
        if (String(_convs[i].id) === String(known)) return _convs[i];
      }
    }
    var nom = String(nombre || "").trim().toLowerCase();
    for (var j = 0; j < _convs.length; j++) {
      var c = _convs[j];
      if (c.tipo !== "PRIVADA") continue;
      var tit = String(c.titulo || "").trim().toLowerCase();
      if (tit && nom && tit === nom) return c;
    }
    return null;
  }

  function previewDe(c) {
    if (!c) return "Tocá para conversar";
    if (c.ultimo_mensaje) return String(c.ultimo_mensaje).slice(0, 72);
    return "Sin mensajes";
  }

  function fechaCorta(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      var hoy = new Date();
      if (d.toDateString() === hoy.toDateString()) {
        return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString("es", { day: "2-digit", month: "2-digit" });
    } catch (e) {
      return "";
    }
  }

  function renderLista() {
    ensureShell();
    var el = document.getElementById("bc-wa-list");
    if (!el) return;
    el.innerHTML = "";

    var f = _filtro;
    var items = [];

    // Chat grupal (GENERAL) siempre arriba si no hay filtro o coincide
    var g = convGeneral();
    var groupLabel = "Chat grupal";
    if (!f || groupLabel.toLowerCase().indexOf(f) >= 0 || "general".indexOf(f) >= 0 || "grupo".indexOf(f) >= 0) {
      items.push({
        kind: "group",
        id: g ? g.id : null,
        name: groupLabel,
        preview: g ? previewDe(g) : "Conversación de todo el equipo",
        time: g ? fechaCorta(g.ultimo_fecha) : "",
        badge: g ? Number(g.no_leidos || 0) : 0,
        active: g && window._comConvActual === g.id,
      });
    }

    // Usuarios reales (excluye al autenticado — ya viene del RPC)
    _usuarios.forEach(function (u) {
      var nom = String(u.nombre || "").trim();
      if (!nom) return;
      if (f && nom.toLowerCase().indexOf(f) < 0) return;
      var c = convPrivadaParaUsuario(u.id, nom);
      items.push({
        kind: "user",
        userId: u.id,
        name: nom,
        preview: c ? previewDe(c) : "Tocá para conversar",
        time: c ? fechaCorta(c.ultimo_fecha) : "",
        badge: c ? Number(c.no_leidos || 0) : 0,
        convId: c ? c.id : null,
        active: c && window._comConvActual === c.id,
      });
    });

    // Otras conversaciones (soporte/contexto) que no son GENERAL ni mapeadas a un usuario
    _convs.forEach(function (c) {
      if (c.tipo === "GENERAL" || c.tipo === "PRIVADA") return;
      var tit = String(c.titulo || c.tipo || "Conversación");
      if (f && tit.toLowerCase().indexOf(f) < 0) return;
      items.push({
        kind: "other",
        id: c.id,
        tipo: c.tipo,
        name: tit,
        preview: previewDe(c),
        time: fechaCorta(c.ultimo_fecha),
        badge: Number(c.no_leidos || 0),
        active: window._comConvActual === c.id,
      });
    });

    if (items.length === 0) {
      el.innerHTML = '<div class="bc-wa-empty">No hay usuarios ni chats para mostrar.</div>';
      return;
    }

    var lastKind = null;
    items.forEach(function (it) {
      var section = null;
      if (it.kind === "group" && lastKind !== "group") section = "Chats";
      if (it.kind === "user" && lastKind !== "user") section = "Contactos";
      if (it.kind === "other" && lastKind !== "other") section = "Otras";
      if (section) {
        var h = document.createElement("div");
        h.className = "bc-wa-section";
        h.textContent = section;
        el.appendChild(h);
      }
      lastKind = it.kind;

      var row = document.createElement("div");
      row.className = "bc-wa-item" + (it.active ? " active" : "");
      row.setAttribute("role", "listitem");
      row.tabIndex = 0;
      var avClass = "bc-wa-avatar" + (it.kind === "group" ? " group" : "");
      var avText = it.kind === "group" ? "👥" : iniciales(it.name);
      row.innerHTML =
        '<div class="' +
        avClass +
        '">' +
        (it.kind === "group" ? "👥" : esc(avText)) +
        "</div>" +
        '<div class="bc-wa-body"><div class="bc-wa-name">' +
        esc(it.name) +
        '</div><div class="bc-wa-preview">' +
        esc(it.preview) +
        "</div></div>" +
        '<div class="bc-wa-meta"><span class="bc-wa-time">' +
        esc(it.time) +
        "</span>" +
        (it.badge > 0 ? '<span class="bc-wa-badge">' + it.badge + "</span>" : "") +
        "</div>";

      row.addEventListener("click", function () {
        onSelectItem(it);
      });
      row.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onSelectItem(it);
        }
      });
      el.appendChild(row);
    });
  }

  async function onSelectItem(it) {
    if (_busy) return;
    _busy = true;
    try {
      if (it.kind === "group") {
        await abrirChatGrupal();
      } else if (it.kind === "user") {
        await abrirChatPrivado(it.userId, it.name, it.convId);
      } else if (it.kind === "other" && it.id) {
        if (typeof abrirConversacion === "function") {
          await abrirConversacion(it.id, it.tipo || "SOPORTE");
          setTituloChat(it.name);
        }
      }
    } catch (e) {
      log("onSelectItem error", e);
    } finally {
      _busy = false;
      renderLista();
    }
  }

  function setTituloChat(nombre) {
    var t = document.getElementById("com-chat-titulo");
    if (t) t.textContent = nombre || "Conversación";
  }

  async function abrirChatGrupal() {
    var g = convGeneral();
    if (g && g.id) {
      if (typeof abrirConversacion === "function") await abrirConversacion(g.id, "GENERAL");
      setTituloChat("Chat grupal");
      return;
    }
    // Crear / reutilizar GENERAL vía mecanismo existente
    if (typeof ejecutarOperacion !== "function") {
      if (typeof setMsg === "function") setMsg("msg-mensaje", "Sistema de operaciones no disponible.", false);
      return;
    }
    var r = await ejecutarOperacion("conversacion", { p_tipo: "GENERAL", p_titulo: "Chat grupal" });
    if (!r || !r.ok) {
      if (typeof setMsg === "function")
        setMsg("msg-mensaje", "No se pudo abrir el chat grupal: " + (typeof explicarError === "function" ? explicarError(r && r.error, "grupal") : "error"), false);
      return;
    }
    if (r.offline) {
      if (typeof setMsg === "function") setMsg("msg-mensaje", "⏳ Pendiente — el chat grupal se abrirá al reconectar.", true);
      return;
    }
    var id = r.data && r.data.id;
    if (id && typeof abrirConversacion === "function") {
      await cargarDatos();
      await abrirConversacion(id, "GENERAL");
      setTituloChat("Chat grupal");
    }
  }

  async function abrirChatPrivado(userId, nombre, convIdKnown) {
    var convId = convIdKnown;
    if (!convId) {
      var existing = convPrivadaParaUsuario(userId, nombre);
      if (existing) convId = existing.id;
    }
    if (convId) {
      guardarPeer(userId, convId);
      if (typeof abrirConversacion === "function") await abrirConversacion(convId, "PRIVADA");
      setTituloChat(nombre);
      return;
    }
    if (typeof ejecutarOperacion !== "function") {
      if (typeof setMsg === "function") setMsg("msg-mensaje", "Sistema de operaciones no disponible.", false);
      return;
    }
    if (typeof tienePermiso === "function" && !tienePermiso("comunicacion", "crear")) {
      if (typeof setMsg === "function") setMsg("msg-mensaje", "No tenés permiso para iniciar conversaciones.", false);
      return;
    }
    var r = await ejecutarOperacion("conversacion", {
      p_tipo: "PRIVADA",
      p_titulo: nombre || null,
      p_participante_id: userId,
    });
    if (!r || !r.ok) {
      if (typeof setMsg === "function")
        setMsg("msg-mensaje", "No se pudo abrir el chat: " + (typeof explicarError === "function" ? explicarError(r && r.error, "privada") : "error"), false);
      return;
    }
    if (r.offline) {
      if (typeof setMsg === "function") setMsg("msg-mensaje", "⏳ Pendiente — el chat se creará al reconectar.", true);
      // UI optimista: aún así mostrar panel de chat vacío
      setTituloChat(nombre);
      var colLista = document.getElementById("com-col-lista");
      var colChat = document.getElementById("com-col-chat");
      if (colLista && colChat && window.matchMedia && window.matchMedia("(max-width: 768px)").matches) {
        colLista.classList.add("hidden");
        colChat.classList.remove("hidden");
      } else if (colChat) colChat.classList.remove("hidden");
      var el = document.getElementById("com-mensajes");
      if (el) el.innerHTML = '<p class="lista-estado">⏳ Conversación pendiente de sincronizar.</p>';
      return;
    }
    var id = r.data && r.data.id;
    if (id) {
      guardarPeer(userId, id);
      await cargarDatos();
      if (typeof abrirConversacion === "function") await abrirConversacion(id, "PRIVADA");
      setTituloChat(nombre);
    }
  }

  async function cargarUsuarios() {
    if (!navigator.onLine) {
      _usuarios = _usuarios || [];
      return;
    }
    try {
      var res = await client.rpc("listar_usuarios_para_chat", {});
      if (res && !res.error && Array.isArray(res.data)) {
        _usuarios = res.data;
      }
    } catch (e) {
      log("cargarUsuarios", e);
    }
  }

  async function cargarConversaciones() {
    if (!navigator.onLine) {
      _convs = _convs || [];
      return;
    }
    try {
      var res = await client.rpc("listar_conversaciones_usuario", { p_solo_activas: true, p_limite: 50 });
      if (res && !res.error && Array.isArray(res.data)) {
        _convs = res.data;
      }
    } catch (e) {
      log("cargarConversaciones", e);
    }
  }

  async function cargarDatos() {
    if (typeof tienePermiso === "function" && !tienePermiso("comunicacion", "ver")) {
      var el = document.getElementById("bc-wa-list");
      if (el) el.innerHTML = '<div class="bc-wa-empty">No tenés permiso para ver comunicación.</div>';
      return;
    }
    await Promise.all([cargarUsuarios(), cargarConversaciones()]);
    renderLista();
  }

  // Hook sobre refrescarComunicacion para pintar la lista WhatsApp
  function wrapRefrescar() {
    if (typeof refrescarComunicacion !== "function") return;
    if (refrescarComunicacion.__bcM2612) return;
    var orig = refrescarComunicacion;
    var wrapped = async function () {
      var r = await orig.apply(this, arguments);
      try {
        injectCss();
        ensureShell();
        await cargarDatos();
      } catch (e) {
        log("post-refresco", e);
      }
      return r;
    };
    wrapped.__bcM2612 = true;
    window.refrescarComunicacion = wrapped;
    try {
      refrescarComunicacion = wrapped;
    } catch (e2) {}
  }

  // Cuando se vuelve a la lista, re-render
  function wrapVolver() {
    if (typeof volverListaConversaciones !== "function") return;
    if (volverListaConversaciones.__bcM2612) return;
    var orig = volverListaConversaciones;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try {
        renderLista();
      } catch (e) {}
      return r;
    };
    wrapped.__bcM2612 = true;
    window.volverListaConversaciones = wrapped;
    try {
      volverListaConversaciones = wrapped;
    } catch (e2) {}
  }

  // Título correcto al abrir conversación existente desde lista antigua
  function wrapAbrir() {
    if (typeof abrirConversacion !== "function") return;
    if (abrirConversacion.__bcM2612) return;
    var orig = abrirConversacion;
    var wrapped = async function (conv_id, tipo) {
      var r = await orig.apply(this, arguments);
      try {
        var peer = peerDeConv(conv_id);
        if (peer) {
          for (var i = 0; i < _usuarios.length; i++) {
            if (String(_usuarios[i].id) === String(peer)) {
              setTituloChat(_usuarios[i].nombre);
              break;
            }
          }
        } else if (tipo === "GENERAL") {
          setTituloChat("Chat grupal");
        } else {
          for (var j = 0; j < _convs.length; j++) {
            if (String(_convs[j].id) === String(conv_id) && _convs[j].titulo) {
              setTituloChat(_convs[j].titulo);
              break;
            }
          }
        }
        renderLista();
      } catch (e) {}
      return r;
    };
    wrapped.__bcM2612 = true;
    window.abrirConversacion = wrapped;
    try {
      abrirConversacion = wrapped;
    } catch (e2) {}
  }

  function boot() {
    injectCss();
    ensureShell();
    wrapRefrescar();
    wrapVolver();
    wrapAbrir();
    // Si ya estamos en la pestaña, cargar
    var panel = document.getElementById("tab-comunicacion");
    if (panel && panel.classList.contains("visible")) {
      cargarDatos();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(boot, 200);
      setTimeout(boot, 800);
    });
  } else {
    setTimeout(boot, 200);
    setTimeout(boot, 800);
  }

  window.__bcM2612Refrescar = cargarDatos;
  log("módulo cargado");
})();
