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

const ETIQUETAS_AUDITORIA = {
  compra: "Compra de mercancía",
  venta: "Venta registrada",
  transferencia: "Transferencia entre almacenes",
  vale: "Salida de productos",
  producto: "Producto creado",
  producto_actualizar: "Producto actualizado",
  producto_estado: "Estado del producto cambiado",
  usuario_rol: "Permisos de usuario actualizados",
  usuario_estado: "Estado de usuario actualizado",
  sincronizacion: "Sincronización",
  auditoria_inventario: "Auditoría física de inventario"
};

function etiquetaTipoAuditoria(tipo) {
  return ETIQUETAS_AUDITORIA[tipo] || "Movimiento del sistema";
}

function etiquetaEstadoAuditoria(estado) {
  switch (String(estado || "").toLowerCase()) {
    case "exito": return "Completada";
    case "pendiente": return "Pendiente";
    case "requiere_atencion": return "Requiere revisión";
    case "error": return "No completada";
    default: return "Registrada";
  }
}

function textoDescripcionAuditoria(fila) {
  const original = String(fila.descripcion || "").trim();
  const sinUuid = original.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "").replace(/\s*[·:#-]\s*$/, "").trim();
  if (sinUuid && !/^(operación|movimiento)\s+(compra|venta|transferencia|vale)\s+(ejecutada|registrada)/i.test(sinUuid)) {
    return sinUuid;
  }
  return etiquetaTipoAuditoria(fila.tipo);
}

function renderAuditoria(filas) {
  const el = document.getElementById("mando-auditoria");
  if (!el) return;
  if (!Array.isArray(filas)) {
    el.innerHTML = '<p class="lista-estado">No se pudo cargar el historial: la respuesta del servidor no tiene el formato esperado.</p>';
    renderPaginacionAuditoria(0);
    return;
  }
  if (filas.length === 0) {
    el.innerHTML = '<div class="bc-auditoria-empty"><span class="bc-auditoria-empty-icon">✓</span><strong>No hay movimientos que mostrar</strong><p class="muted">Prueba otros filtros o vuelve más tarde.</p></div>';
    renderPaginacionAuditoria(0);
    return;
  }
  el.innerHTML = "";
  filas.forEach((fila) => {
    const tipo = String(fila.tipo || "");
    const estado = String(fila.estado || "").toLowerCase();
    const div = document.createElement("article");
    div.className = "cc-actividad-item bc-auditoria-card bc-auditoria-state-" +
      (estado === "requiere_atencion" || estado === "error" ? "review" : estado === "pendiente" ? "pending" : "done");

    const icon = document.createElement("span");
    icon.className = "cc-actividad-icono";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = iconoAuditoria(tipo);

    const content = document.createElement("div");
    content.className = "cc-actividad-texto bc-auditoria-card-content";

    const title = document.createElement("strong");
    title.className = "bc-auditoria-card-title";
    title.textContent = textoDescripcionAuditoria(fila);

    const metadata = document.createElement("div");
    metadata.className = "bc-auditoria-card-meta";
    const type = document.createElement("span");
    type.className = "bc-auditoria-type";
    type.textContent = etiquetaTipoAuditoria(tipo);
    const status = document.createElement("span");
    status.className = "bc-auditoria-status " +
      (estado === "requiere_atencion" || estado === "error" ? "review" : estado === "pendiente" ? "pending" : "done");
    status.textContent = etiquetaEstadoAuditoria(estado);
    metadata.appendChild(type);
    metadata.appendChild(status);

    const actor = document.createElement("div");
    actor.className = "bc-auditoria-card-actor";
    actor.textContent = fila.usuario_nombre || "Usuario no identificado";

    content.appendChild(title);
    content.appendChild(metadata);
    content.appendChild(actor);

    const date = document.createElement("time");
    date.className = "cc-actividad-meta bc-auditoria-card-date";
    if (fila.fecha) date.dateTime = fila.fecha;
    date.textContent = fila.fecha ? fechaHora(fila.fecha) : "Fecha no disponible";

    div.appendChild(icon);
    div.appendChild(content);
    div.appendChild(date);
    el.appendChild(div);
  });
  renderPaginacionAuditoria(filas.length);
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
  const tipos = ["compra", "venta", "transferencia", "vale", "producto", "producto_actualizar", "producto_estado", "usuario_rol", "usuario_estado", "sincronizacion", "auditoria_inventario"];
  const estados = ["exito", "pendiente", "requiere_atencion", "error"];
  const selTipo = document.getElementById("filtro-aud-tipo");
  const selEstado = document.getElementById("filtro-aud-estado");
  if (selTipo && selTipo.options.length <= 1) {
    tipos.forEach((t) => { const o = document.createElement("option"); o.value = t; o.textContent = etiquetaTipoAuditoria(t); selTipo.appendChild(o); });
  }
  if (selEstado && selEstado.options.length <= 1) {
    estados.forEach((e) => { const o = document.createElement("option"); o.value = e; o.textContent = etiquetaEstadoAuditoria(e); selEstado.appendChild(o); });
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
