// ==== Battlecruiser · js/mando.js ====
// B4 — Centro de Mando, auditoría y trazabilidad operativa.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

// ---- B4 — CENTRO DE MANDO + AUDITORÍA + TRAZABILIDAD OPERATIVA
async function registrarAuditoria(tipo, descripcion, estado, entidadId, idempotencyKey, payloadResumen) {
  try {
    await client.rpc("registrar_auditoria", {
      p_tipo: tipo,
      p_descripcion: descripcion,
      p_estado: estado || "exito",
      p_entidad_id: entidadId || null,
      p_idempotency_key: idempotencyKey || null,
      p_payload_resumen: payloadResumen || null,
    });
  } catch (e) {
    // La auditoría no debe romper el flujo principal si falla (RPC inexistente).
    console.warn("[Battlecruiser] No se pudo registrar auditoría:", e);
  }
}

let _auditoriaPagina = 0;
const _AUDITORIA_POR_PAG = 20;

async function refrescarAuditoria() {
  const el = document.getElementById("mando-auditoria");
  if (!el) return;
  if (!tienePermiso("auditoria", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver auditoría.</p>';
    return;
  }
  setLoading("mando-auditoria", "Cargando auditoría…");
  const tipo = document.getElementById("filtro-aud-tipo");
  const estado = document.getElementById("filtro-aud-estado");
  try {
    const { data, error } = await client.rpc("listar_auditoria_admin", {
      p_usuario_id: null,
      p_tipo: tipo ? tipo.value || null : null,
      p_estado: estado ? estado.value || null : null,
      p_limite: _AUDITORIA_POR_PAG,
      p_offset: _auditoriaPagina * _AUDITORIA_POR_PAG,
    });
    if (error) {
      const msg = String(error.message || error.code || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b4-auditoria-trazabilidad.sql en Supabase (función listar_auditoria_admin).</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">No se pudo cargar auditoría: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderAuditoria(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar auditoría.</p>';
    console.warn("[Battlecruiser] listar_auditoria_admin:", e);
  }
}

function etiquetaTipoAuditoria(tipo) {
  const labels = {
    venta: "Venta",
    compra: "Compra",
    transferencia: "Transferencia",
    vale: "Vale de salida",
    producto: "Producto",
    producto_actualizar: "Producto",
    producto_crear: "Producto",
    usuario_rol: "Usuarios",
    usuario_estado: "Usuarios",
    sincronizacion: "Sincronización"
  };
  if (labels[tipo]) return labels[tipo];
  const readable = String(tipo || "Actividad").replace(/[_-]+/g, " ").trim();
  return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : "Actividad";
}

function presentarRegistroAuditoria(fila) {
  const tipo = String(fila.tipo || "");
  let titulo = String(fila.descripcion || "").trim();
  let referencia = "";
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
  const uuid = titulo.match(uuidPattern);
  if (uuid) {
    const shortId = uuid[0].slice(0, 8).toUpperCase();
    if (tipo === "transferencia" || /^Transferencia registrada/i.test(titulo)) {
      titulo = "Transferencia registrada";
      referencia = "Referencia #" + shortId;
    } else if (tipo === "compra" || /^Compra registrada/i.test(titulo)) {
      const isLot = /lote/i.test(titulo);
      titulo = "Compra registrada";
      referencia = (isLot ? "Lote #" : "Referencia #") + shortId;
    } else {
      titulo = titulo.replace(uuidPattern, "").replace(/\s*[·:|–-]\s*$/g, "").trim();
      referencia = "Referencia #" + shortId;
    }
  }
  if (!titulo || titulo === tipo) titulo = etiquetaTipoAuditoria(tipo) + " registrada";
  const status = String(fila.estado || "").toLowerCase();
  const statusLabel = ({
    exito: "Correcto",
    pendiente: "Pendiente",
    requiere_atencion: "Revisar",
    error: "Error"
  })[status] || (status ? status.replace(/[_-]+/g, " ") : "Sin estado");
  const statusClass = status === "error" || status === "requiere_atencion"
    ? "is-error"
    : status === "pendiente" ? "is-pending" : "is-success";
  const date = fila.fecha ? new Date(fila.fecha) : null;
  const validDate = date && Number.isFinite(date.getTime());
  const timeLabel = validDate
    ? date.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Fecha no disponible";
  return {
    title: titulo,
    reference: referencia,
    category: etiquetaTipoAuditoria(tipo),
    icon: iconoAuditoria(tipo),
    statusLabel,
    statusClass,
    timeLabel,
    datetime: validDate ? date.toISOString() : "",
    actor: String(fila.usuario_nombre || "Usuario no identificado")
  };
}

function renderAuditoria(filas) {
  const el = document.getElementById("mando-auditoria");
  if (!el) return;
  // Supabase RPC contract: an audit page must be an array. Avoid a TypeError
  // and distinguish a malformed response from a legitimate empty audit list.
  if (!Array.isArray(filas)) {
    el.innerHTML = '<p class="lista-estado">No se pudo cargar auditoría: respuesta inválida del servidor.</p>';
    renderPaginacionAuditoria(0);
    return;
  }
  if (filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Todavía no hay movimientos para mostrar.</p>';
    renderPaginacionAuditoria(0);
    return;
  }
  el.innerHTML = "";
  filas.forEach((f) => {
    const view = presentarRegistroAuditoria(f);
    const entry = document.createElement("article");
    entry.className = "bc-audit-entry " + view.statusClass;
    entry.innerHTML =
      '<span class="bc-audit-entry__icon" aria-hidden="true">' + escHtml(view.icon) + "</span>" +
      '<div class="bc-audit-entry__body">' +
        '<div class="bc-audit-entry__eyebrow"><span class="bc-audit-entry__category">' + escHtml(view.category) + "</span>" +
          (view.reference ? '<span class="bc-audit-entry__reference">' + escHtml(view.reference) + "</span>" : "") +
        "</div>" +
        '<h4 class="bc-audit-entry__title">' + escHtml(view.title) + "</h4>" +
        '<div class="bc-audit-entry__actor"><span class="bc-audit-entry__actor-label">Responsable</span>' +
          "<strong>" + escHtml(view.actor) + "</strong></div>" +
      "</div>" +
      '<div class="bc-audit-entry__meta">' +
        (view.datetime ? '<time datetime="' + escHtml(view.datetime) + '">' + escHtml(view.timeLabel) + "</time>" :
          '<span class="bc-audit-entry__time">' + escHtml(view.timeLabel) + "</span>") +
        '<span class="bc-audit-entry__status">' + escHtml(view.statusLabel) + "</span>" +
      "</div>";
    el.appendChild(entry);
  });
  renderPaginacionAuditoria(filas.length);
}

function iconoAuditoria(tipo) {
  if (/^producto/.test(String(tipo || ""))) return "🏷️";
  switch (tipo) {
    case "venta": return "🛒";
    case "compra": return "📦";
    case "transferencia": return "↔";
    case "vale": return "📋";
    case "usuario_rol": return "👤";
    case "usuario_estado": return "👤";
    case "sincronizacion": return "🔄";
    default: return "•";
  }
}

function renderPaginacionAuditoria(cargadas) {
  const el = document.getElementById("mando-paginacion");
  if (!el) return;
  el.innerHTML = "";
  if (_auditoriaPagina > 0) {
    const ant = document.createElement("button");
    ant.type = "button";
    ant.className = "cc-accion";
    ant.textContent = "← Anterior";
    ant.addEventListener("click", () => { _auditoriaPagina--; refrescarAuditoria(); });
    el.appendChild(ant);
  }
  const span = document.createElement("span");
  span.className = "muted";
  span.textContent = "Página " + (_auditoriaPagina + 1);
  el.appendChild(span);
  if (cargadas >= _AUDITORIA_POR_PAG) {
    const sig = document.createElement("button");
    sig.type = "button";
    sig.className = "cc-accion";
    sig.textContent = "Siguiente →";
    sig.addEventListener("click", () => { _auditoriaPagina++; refrescarAuditoria(); });
    el.appendChild(sig);
  }
}

function poblarFiltrosAuditoria() {
  const tipos = ["compra", "venta", "transferencia", "vale", "producto", "usuario_rol", "usuario_estado", "sincronizacion"];
  const estados = ["exito", "pendiente", "requiere_atencion", "error"];
  const selTipo = document.getElementById("filtro-aud-tipo");
  const selEstado = document.getElementById("filtro-aud-estado");
  if (selTipo && selTipo.options.length <= 1) {
    tipos.forEach((t) => { const o = document.createElement("option"); o.value = t; o.textContent = t; selTipo.appendChild(o); });
  }
  if (selEstado && selEstado.options.length <= 1) {
    estados.forEach((e) => { const o = document.createElement("option"); o.value = e; o.textContent = e; selEstado.appendChild(o); });
  }
}

// ---- Único panel secundario: Auditoría y trazabilidad.
async function refrescarPanelAuditoria() {
  const conn = document.getElementById("mando-conn-info");
  const el = document.getElementById("mando-auditoria");
  const offline = !navigator.onLine || (typeof estaRealmenteDesconectado === "function" && estaRealmenteDesconectado());
  if (conn) conn.textContent = offline ? "Sin conexión" : "Conectado";
  if (offline) {
    if (el) el.innerHTML = '<p class="lista-estado">Sin conexión — auditoría no disponible offline.</p>';
    return;
  }
  if (typeof contextoB3Disponible === "function" && !contextoB3Disponible()) {
    if (el) el.innerHTML = '<p class="lista-estado">La sesión todavía no está lista para consultar auditoría.</p>';
    return;
  }
  await refrescarAuditoria();
}

safeInit("centro-mando-filtros", () => {
  poblarFiltrosAuditoria();
  const tipo = document.getElementById("filtro-aud-tipo");
  const estado = document.getElementById("filtro-aud-estado");
  if (tipo) tipo.addEventListener("change", () => { _auditoriaPagina = 0; refrescarAuditoria(); });
  if (estado) estado.addEventListener("change", () => { _auditoriaPagina = 0; refrescarAuditoria(); });
  const limpiar = document.getElementById("aud-limpiar-btn");
  if (limpiar) limpiar.addEventListener("click", () => {
    if (tipo) tipo.value = "";
    if (estado) estado.value = "";
    _auditoriaPagina = 0;
    refrescarAuditoria();
  });
});
