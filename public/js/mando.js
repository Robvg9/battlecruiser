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
    el.innerHTML = '<p class="lista-estado">Sin registros de auditoría.</p>';
    renderPaginacionAuditoria(0);
    return;
  }
  el.innerHTML = "";
  filas.forEach((f) => {
    const div = document.createElement("div");
    div.className = "cc-actividad-item cc-prioridad-" + (f.estado === "requiere_atencion" || f.estado === "error" ? "critico" : "normal");
    const fechaTxt = f.fecha ? fechaHora(f.fecha) : "";
    const idemp = f.idempotency_key ? " · " + idCorto(f.idempotency_key) : "";
    div.innerHTML = '<span class="cc-actividad-icono">' + escHtml(iconoAuditoria(f.tipo)) + "</span>"
      + '<span class="cc-actividad-texto">' + escHtml(f.descripcion || f.tipo || "—") + '<br><span class="muted">' + escHtml(f.usuario_nombre || "—") + " · " + escHtml(f.tipo || "") + " · " + escHtml(f.estado || "") + idemp + "</span></span>"
      + '<span class="cc-actividad-meta"><span class="muted">' + escHtml(fechaTxt) + "</span></span>";
    el.appendChild(div);
  });
  renderPaginacionAuditoria(filas.length);
}

function iconoAuditoria(tipo) {
  switch (tipo) {
    case "venta": return "🛒";
    case "compra": return "📦";
    case "transferencia": return "↔";
    case "vale": return "📋";
    case "producto": return "🏷️";
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
