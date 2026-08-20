// ==== Battlecruiser · js/comunicacion.js ====
// B8 + Misión 9.3 T7 — Comunicación operativa y chat contextual.
// Scope global; usa ejecutarOperacion (cola offline única). No inventa tipos SQL.

let _comConvActual = null;
let _comConvActualTipo = null;
let _comNoLeidosTotal = 0;

async function refrescarComunicacion() {
  if (!appShell || !appShell.classList.contains("visible")) return;
  const conn = document.getElementById("com-conn-info");
  if (conn) conn.textContent = estaRealmenteDesconectado() ? "⚪ Sin conexión" : "🟢 Conectado";
  await refrescarListaConversaciones();
  await actualizarBadgeNoLeidos();
  // Formulario de envío según permiso.
  const form = document.getElementById("form-mensaje");
  if (form) {
    const puede = typeof tienePermiso === "function" && tienePermiso("comunicacion", "crear");
    form.classList.toggle("hidden", !puede);
    if (!puede) {
      const msg = document.getElementById("msg-mensaje");
      if (msg && !_comConvActual) { /* leave */ }
    }
  }
}

async function actualizarBadgeNoLeidos() {
  const badge = document.getElementById("com-tab-badge");
  if (!badge) return;
  if (!navigator.onLine || !tienePermiso("comunicacion", "ver")) {
    badge.classList.add("hidden");
    badge.textContent = "";
    return;
  }
  try {
    const { data, error } = await client.rpc("contar_no_leidos_global", {});
    if (error) { badge.classList.add("hidden"); return; }
    _comNoLeidosTotal = Number(data) || 0;
    if (_comNoLeidosTotal > 0) {
      badge.classList.remove("hidden");
      badge.textContent = String(_comNoLeidosTotal);
      badge.classList.add("atencion");
    } else {
      badge.classList.add("hidden");
      badge.textContent = "";
    }
  } catch (e) {
    badge.classList.add("hidden");
  }
}

async function refrescarListaConversaciones() {
  const el = document.getElementById("lista-conversaciones");
  if (!el) return;
  if (!tienePermiso("comunicacion", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver comunicación.</p>';
    return;
  }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión — las conversaciones se cargarán al reconectar.</p>';
    return;
  }
  setLoading("lista-conversaciones", "Cargando conversaciones…");
  try {
    const { data, error } = await client.rpc("listar_conversaciones_usuario", { p_solo_activas: true, p_limite: 50 });
    if (error) {
      const msg = String(error.message || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b8-comunicacion.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderListaConversaciones(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar conversaciones.</p>';
  }
}

function renderListaConversaciones(filas) {
  const el = document.getElementById("lista-conversaciones");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">💬 No tenés conversaciones todavía.</p>';
    return;
  }
  el.innerHTML = "";
  filas.forEach((c) => {
    const div = document.createElement("div");
    div.className = "com-conv-item" + (c.id === _comConvActual ? " com-conv-activa" : "");
    const noLeidos = Number(c.no_leidos || 0);
    let icono = "💬";
    if (c.tipo === "GENERAL") icono = "📢";
    else if (c.tipo === "SOPORTE") icono = "🛟";
    else if (c.tipo === "INCIDENCIA") icono = "⚠️";
    else if (c.tipo === "TURNO") icono = "🕒";
    else if (c.tipo === "RESPONSABILIDAD") icono = "✅";
    const titulo = escHtml(c.titulo || (c.tipo === "GENERAL" ? "General" : c.tipo === "SOPORTE" ? "Soporte" : (c.ultimo_autor || "Conversación")));
    const ultMsg = c.ultimo_mensaje ? escHtml(c.ultimo_mensaje.slice(0, 60)) : '<span class="muted">Sin mensajes</span>';
    const fecha = c.ultimo_fecha ? fechaHora(c.ultimo_fecha) : "";
    div.innerHTML = '<div class="com-conv-icono">' + icono + '</div><div class="com-conv-contenido"><span class="com-conv-titulo">' + titulo + '</span><span class="com-conv-ultmsg muted">' + ultMsg + '</span></div><div class="com-conv-meta"><span class="com-conv-fecha muted">' + fecha + "</span>" + (noLeidos > 0 ? '<span class="com-conv-badge">' + noLeidos + "</span>" : "") + "</div>";
    div.dataset.id = c.id;
    div.dataset.tipo = c.tipo || "";
    div.addEventListener("click", () => abrirConversacion(c.id, c.tipo));
    el.appendChild(div);
  });
}

async function abrirConversacion(conv_id, tipo) {
  _comConvActual = conv_id;
  _comConvActualTipo = tipo;
  const colLista = document.getElementById("com-col-lista");
  const colChat = document.getElementById("com-col-chat");
  if (colLista && colChat && window.matchMedia && window.matchMedia("(max-width: 768px)").matches) {
    colLista.classList.add("hidden");
    colChat.classList.remove("hidden");
  } else if (colChat) {
    colChat.classList.remove("hidden");
  }
  const tituloEl = document.getElementById("com-chat-titulo");
  if (tituloEl) {
    const labels = { GENERAL: "General", SOPORTE: "Soporte", INCIDENCIA: "Incidencia", TURNO: "Turno", RESPONSABILIDAD: "Responsabilidad", PRIVADA: "Conversación privada" };
    tituloEl.textContent = labels[tipo] || "Conversación";
  }
  const cerrarBtn = document.getElementById("com-cerrar-btn");
  if (cerrarBtn) cerrarBtn.classList.remove("hidden");
  const form = document.getElementById("form-mensaje");
  if (form) {
    const puede = typeof tienePermiso === "function" && tienePermiso("comunicacion", "crear");
    form.classList.toggle("hidden", !puede);
  }
  await refrescarMensajes(conv_id);
  if (navigator.onLine) {
    try { await client.rpc("marcar_conversacion_leida", { p_conversacion_id: conv_id }); } catch (e) {}
    await actualizarBadgeNoLeidos();
    await refrescarListaConversaciones();
  }
}

async function refrescarMensajes(conv_id) {
  const el = document.getElementById("com-mensajes");
  if (!el) return;
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión — no se pueden cargar los mensajes.</p>';
    return;
  }
  setLoading("com-mensajes", "Cargando mensajes…");
  try {
    const { data, error } = await client.rpc("listar_mensajes_conversacion", {
      p_conversacion_id: conv_id, p_limite: 100, p_offset: 0,
    });
    if (error) {
      const msg = String(error.message || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b8-comunicacion.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderMensajes(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar mensajes.</p>';
  }
}

function renderMensajes(filas) {
  const el = document.getElementById("com-mensajes");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin mensajes. Escribí el primero.</p>';
    return;
  }
  el.innerHTML = "";
  const uidActual = _usuarioActual && _usuarioActual.id;
  filas.forEach((m) => {
    const propio = m.usuario_id === uidActual;
    const div = document.createElement("div");
    div.className = "com-msg" + (propio ? " com-msg-propio" : "");
    const hora = m.creado_en ? new Date(m.creado_en).toLocaleString("es", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";
    const estadoIcono = m.estado === "PENDIENTE" ? " ⏳" : m.estado === "REQUIERE_ATENCION" ? " ⚠️" : "";
    div.innerHTML = '<div class="com-msg-autor">' + escHtml(propio ? "Vos" : (m.usuario_nombre || "—")) + '</div><div class="com-msg-contenido">' + escHtml(m.contenido) + '</div><div class="com-msg-meta muted">' + hora + estadoIcono + "</div>";
    el.appendChild(div);
  });
  el.scrollTop = el.scrollHeight;
}

async function enviarMensaje(contenido) {
  if (!_comConvActual) {
    setMsg("msg-mensaje", "Abrí una conversación primero.", false);
    return false;
  }
  if (typeof tienePermiso === "function" && !tienePermiso("comunicacion", "crear")) {
    setMsg("msg-mensaje", "No tenés permiso para enviar mensajes.", false);
    return false;
  }
  const r = await ejecutarOperacion("mensaje", {
    p_conversacion_id: _comConvActual, p_contenido: contenido,
  });
  if (!r.ok) {
    setMsg("msg-mensaje", "No se pudo enviar: " + explicarError(r.error, "enviar mensaje"), false);
    return false;
  }
  setMsg("msg-mensaje", r.offline ? "⏳ Mensaje pendiente de conexión — se sincronizará al reconectar." : "", true);
  if (!r.offline) {
    await refrescarMensajes(_comConvActual);
    await refrescarListaConversaciones();
  } else {
    appendMensajePendiente(contenido);
  }
  return true;
}

function appendMensajePendiente(contenido) {
  const el = document.getElementById("com-mensajes");
  if (!el) return;
  const div = document.createElement("div");
  div.className = "com-msg com-msg-propio com-msg-pendiente";
  div.innerHTML = '<div class="com-msg-autor">Vos</div><div class="com-msg-contenido">' + escHtml(contenido) + '</div><div class="com-msg-meta muted">⏳ Pendiente de conexión</div>';
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

async function crearConversacion(tipo, titulo, participante_id) {
  if (typeof tienePermiso === "function" && !tienePermiso("comunicacion", "crear")) {
    setMsg("msg-nueva-conv", "No tenés permiso para crear conversaciones.", false);
    return null;
  }
  const r = await ejecutarOperacion("conversacion", {
    p_tipo: tipo, p_titulo: titulo || null, p_participante_id: participante_id || null,
  });
  if (!r.ok) {
    setMsg("msg-nueva-conv", "No se pudo crear: " + explicarError(r.error, "crear conversación"), false);
    return null;
  }
  const convId = r.data && r.data.id;
  setMsg("msg-nueva-conv", r.offline ? "⏳ Pendiente — se creará al reconectar." : "✓ Conversación creada.", true);
  await refrescarListaConversaciones();
  return convId;
}

/** Tipos con vínculo de entidad en el contrato B8 (incidencia_id / turno_id / responsabilidad_id). */
async function abrirConversacionContextual(tipo, entidadId) {
  const params = { p_tipo: tipo };
  if (tipo === "INCIDENCIA") params.p_incidencia_id = entidadId;
  else if (tipo === "TURNO") params.p_turno_id = entidadId;
  else if (tipo === "RESPONSABILIDAD") params.p_responsabilidad_id = entidadId;
  else {
    setMsg("msg-mensaje", "Este tipo de contexto no está soportado por el backend actual.", false);
    return;
  }
  const r = await ejecutarOperacion("conversacion", params);
  if (!r.ok) {
    if (esRpcFaltante(r.error)) {
      setMsg("msg-mensaje", "Falta aplicar supabase/b8-comunicacion.sql en Supabase.", false);
    } else {
      setMsg("msg-mensaje", "No se pudo abrir: " + explicarError(r.error, "conversación contextual"), false);
    }
    return;
  }
  if (r.offline) {
    setMsg("msg-mensaje", "⏳ Pendiente — la conversación se abrirá al reconectar.", true);
    return;
  }
  const data = r.data;
  if (data && data.id) {
    if (typeof cerrarPanelContextual === "function") cerrarPanelContextual();
    const btn = document.querySelector('.tab-btn[data-tab="comunicacion"]');
    if (btn) btn.click();
    await esperar(100);
    await abrirConversacion(data.id, tipo);
  }
}

/**
 * Chat sobre un elemento de negocio (producto, transferencia, venta, etc.).
 * El backend B8 solo vincula INCIDENCIA/TURNO/RESPONSABILIDAD.
 * Para el resto: conversación SOPORTE con título descriptivo (sin inventar columnas).
 */
async function abrirConversacionSobreEntidad(tipoEntidad, entidadId, tituloLegible) {
  if (typeof tienePermiso === "function" && !tienePermiso("comunicacion", "crear")) {
    if (typeof setMsg === "function") setMsg("msg-mensaje", "No tenés permiso para iniciar conversaciones.", false);
    return;
  }
  const t = String(tipoEntidad || "").toUpperCase();
  if (t === "INCIDENCIA" || t === "TURNO" || t === "RESPONSABILIDAD") {
    await abrirConversacionContextual(t, entidadId);
    return;
  }
  // Título contextual real; tipo SOPORTE ya permitido por crear_conversacion.
  const titulo = (tituloLegible || ("Sobre " + (tipoEntidad || "elemento"))).slice(0, 120);
  const r = await ejecutarOperacion("conversacion", {
    p_tipo: "SOPORTE",
    p_titulo: titulo,
  });
  if (!r.ok) {
    if (esRpcFaltante(r.error)) {
      setMsg("msg-mensaje", "Falta aplicar supabase/b8-comunicacion.sql en Supabase.", false);
    } else {
      setMsg("msg-mensaje", "No se pudo abrir: " + explicarError(r.error, "conversación"), false);
    }
    return;
  }
  if (r.offline) {
    setMsg("msg-mensaje", "⏳ Pendiente — la conversación se creará al reconectar.", true);
    return;
  }
  if (typeof cerrarPanelContextual === "function") cerrarPanelContextual();
  const data = r.data;
  if (data && data.id) {
    const btn = document.querySelector('.tab-btn[data-tab="comunicacion"]');
    if (btn) btn.click();
    await esperar(100);
    await abrirConversacion(data.id, "SOPORTE");
  }
}

async function cerrarConversacion() {
  if (!_comConvActual) return;
  if (!navigator.onLine) { setMsg("msg-mensaje", "⚪ Sin conexión.", false); return; }
  try {
    const { error } = await client.rpc("cerrar_conversacion", { p_conversacion_id: _comConvActual });
    if (error) { setMsg("msg-mensaje", "No se pudo cerrar: " + escHtml(error.message || error), false); return; }
    setMsg("msg-mensaje", "✓ Conversación cerrada.", true);
    _comConvActual = null;
    document.getElementById("com-col-chat").classList.add("hidden");
    document.getElementById("com-col-lista").classList.remove("hidden");
    await refrescarListaConversaciones();
  } catch (e) {
    setMsg("msg-mensaje", "Error al cerrar conversación.", false);
  }
}

async function abrirSoporte() {
  const r = await ejecutarOperacion("conversacion", { p_tipo: "SOPORTE" });
  if (!r.ok) {
    setMsg("msg-nueva-conv", "No se pudo abrir soporte: " + explicarError(r.error, "soporte"), false);
    return;
  }
  if (r.offline) {
    setMsg("msg-nueva-conv", "⏳ Pendiente — el soporte se abrirá al reconectar.", true);
    return;
  }
  const data = r.data;
  if (data && data.id) {
    const panel = document.getElementById("com-nueva-panel");
    if (panel) panel.classList.add("hidden");
    const btn = document.querySelector('.tab-btn[data-tab="comunicacion"]');
    if (btn) btn.click();
    await esperar(100);
    await abrirConversacion(data.id, "SOPORTE");
  }
}

function volverListaConversaciones() {
  const colLista = document.getElementById("com-col-lista");
  const colChat = document.getElementById("com-col-chat");
  if (colLista) colLista.classList.remove("hidden");
  if (colChat) colChat.classList.add("hidden");
  _comConvActual = null;
}

let _b8CacheAlertas = { soportePendiente: 0, convRecientes: 0 };

async function refrescarAlertasB8() {
  if (!navigator.onLine || !tienePermiso("comunicacion", "ver")) return;
  try {
    const { data } = await client.rpc("listar_conversaciones_usuario", { p_solo_activas: true, p_limite: 50 });
    const convs = data || [];
    _b8CacheAlertas.soportePendiente = convs.filter((c) => c.tipo === "SOPORTE" && Number(c.no_leidos || 0) > 0).length;
    _b8CacheAlertas.convRecientes = convs.filter((c) => Number(c.no_leidos || 0) > 0).length;
  } catch (e) { /* RPC no existe */ }
}

function construirAlertasB8() {
  const a = [];
  if (_b8CacheAlertas.soportePendiente > 0) {
    a.push({ nivel: "atencion", tipo: "Soporte pendiente", texto: _b8CacheAlertas.soportePendiente + " conversación(es) de soporte con mensajes nuevos.", op: null });
  }
  if (_b8CacheAlertas.convRecientes > 0 && _b8CacheAlertas.convRecientes !== _b8CacheAlertas.soportePendiente) {
    a.push({ nivel: "normal", tipo: "Mensajes nuevos", texto: "Tenés " + _comNoLeidosTotal + " mensaje(s) sin leer.", op: null });
  }
  return a;
}

function construirAlertasMandoB8Completo(ops) {
  const base = (typeof construirAlertasMandoB7Completo === "function") ? construirAlertasMandoB7Completo(ops) : [];
  return base.concat(construirAlertasB8()).sort((a, b) => {
    const orden = { critico: 0, atencion: 1, normal: 2 };
    return (orden[a.nivel] != null ? orden[a.nivel] : 3) - (orden[b.nivel] != null ? orden[b.nivel] : 3);
  });
}

safeInit("b8-comunicacion", () => {
  const form = document.getElementById("form-mensaje");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("mensaje-input");
      const contenido = input.value.trim();
      if (!contenido) return;
      const btn = form.querySelector("button[type='submit']");
      if (btn) btn.disabled = true;
      const ok = await enviarMensaje(contenido);
      if (btn) btn.disabled = false;
      if (ok) input.value = "";
    });
  }
  const volver = document.getElementById("com-volver-btn");
  if (volver) volver.addEventListener("click", volverListaConversaciones);
  const cerrar = document.getElementById("com-cerrar-btn");
  if (cerrar) cerrar.addEventListener("click", cerrarConversacion);
  const nueva = document.getElementById("com-nueva-btn");
  if (nueva) nueva.addEventListener("click", async () => {
    if (typeof tienePermiso === "function" && !tienePermiso("comunicacion", "crear")) {
      setMsg("msg-nueva-conv", "No tenés permiso para crear conversaciones.", false);
      return;
    }
    const panel = document.getElementById("com-nueva-panel");
    if (panel) panel.classList.toggle("hidden");
    if (navigator.onLine) {
      try {
        const { data } = await client.rpc("listar_usuarios_para_chat", {});
        const sel = document.getElementById("nueva-conv-usuario");
        if (sel && Array.isArray(data)) {
          sel.innerHTML = '<option value="">Usuario…</option>';
          data.forEach((u) => {
            const o = document.createElement("option");
            o.value = u.id; o.textContent = u.nombre;
            sel.appendChild(o);
          });
        }
      } catch (e) {}
    }
  });
  const soporte = document.getElementById("com-soporte-btn");
  if (soporte) soporte.addEventListener("click", abrirSoporte);
  const formNueva = document.getElementById("form-nueva-conv");
  if (formNueva) {
    formNueva.addEventListener("submit", async (e) => {
      e.preventDefault();
      const tipo = document.getElementById("nueva-conv-tipo").value;
      const titulo = document.getElementById("nueva-conv-titulo").value.trim();
      const usuario = document.getElementById("nueva-conv-usuario").value || null;
      if (tipo === "PRIVADA" && !usuario) {
        setMsg("msg-nueva-conv", "Elegí un usuario para la conversación privada.", false);
        return;
      }
      const id = await crearConversacion(tipo, titulo, usuario);
      if (id) {
        document.getElementById("com-nueva-panel").classList.add("hidden");
        await abrirConversacion(id, tipo);
      }
    });
  }
});
