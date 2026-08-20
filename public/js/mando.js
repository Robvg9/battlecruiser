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

// Deriva el estado de datos reales: cola offline + conectividad + sincronizando.
function calcularEstadoMando(ops, sincronizando) {
  if (typeof calcularEstadoOperacional === "function") {
    return calcularEstadoOperacional(ops, sincronizando);
  }
  const atencion = ops.filter((o) => o.estado === "REQUIERE_ATENCION").length;
  if (atencion > 0) return { nivel: "critico", texto: "Requiere atención", detalle: atencion + " operación(es)." };
  return { nivel: "normal", texto: "Operativo", detalle: "Todo sincronizado." };
}

function renderEstadoMando(estado) {
  const el = document.getElementById("mando-estado");
  if (!el) return;
  el.className = "cc-estado cc-estado-" + estado.nivel;
  let extra = "";
  if (_usuarioActual) {
    extra = '<span class="cc-estado-detalle">Sesión: ' + escHtml(_usuarioActual.nombre || "") + (_usuarioActual.rol ? " · " + escHtml(_usuarioActual.rol) : "") + "</span>";
  }
  el.innerHTML = '<div class="cc-estado-cabecera"><span class="cc-estado-titulo">' + escHtml(estado.texto) + '</span><span class="cc-estado-detalle">' + escHtml(estado.detalle) + "</span>" + extra + "</div>";
}

/** Indicadores reales del negocio a partir de _cache (sin métricas inventadas). */
function construirIndicadoresMando(ops) {
  const stock = _cache.stock || [];
  const bajo = stock.filter((s) => s.minimo != null && Number(s.cantidad) <= Number(s.minimo) && Number(s.cantidad) > 0);
  const agotados = stock.filter((s) => Number(s.cantidad) <= 0);
  const ventas = _cache.ventas || [];
  const totalVentas = ventas.reduce((s, v) => s + (Number(v.total) || 0), 0);
  const pendientes = (ops || []).filter((o) => o.estado === "PENDIENTE" || o.estado === "SINCRONIZANDO");
  const atencion = (ops || []).filter((o) => o.estado === "REQUIERE_ATENCION");
  const trfPend = pendientes.filter((o) => o.tipo === "transferencia");
  return {
    productos: (_cache.productos || []).length,
    almacenes: (_cache.almacenes || []).length,
    bajoMinimo: bajo.length,
    agotados: agotados.length,
    ventasCount: ventas.length,
    ventasTotal: totalVentas,
    transferencias: (_cache.transferencias || []).length,
    opsPendientes: pendientes.length,
    opsAtencion: atencion.length,
    trfPendientes: trfPend.length,
  };
}

function renderResumenMando(ops) {
  const tab = document.getElementById("tab-mando");
  if (!tab) return;
  let el = document.getElementById("mando-resumen-grid");
  if (!el) {
    el = document.createElement("div");
    el.id = "mando-resumen-grid";
    el.className = "resumen-grid mando-resumen-grid";
    const estado = document.getElementById("mando-estado");
    if (estado && estado.parentNode) {
      estado.parentNode.insertBefore(el, estado.nextSibling);
    } else {
      tab.insertBefore(el, tab.firstChild);
    }
  }
  const ind = construirIndicadoresMando(ops);
  el.innerHTML =
    '<div class="resumen-card"><div class="valor">' + ind.productos + '</div><div class="etiqueta">Productos</div></div>' +
    '<div class="resumen-card"><div class="valor">' + ind.almacenes + '</div><div class="etiqueta">Almacenes</div></div>' +
    '<div class="resumen-card' + (ind.bajoMinimo || ind.agotados ? " alerta resumen-card-accion" : "") + '"' +
      (ind.bajoMinimo || ind.agotados ? ' data-ir-tab="inventario" role="button" tabindex="0"' : "") + '>' +
      '<div class="valor">' + (ind.bajoMinimo + ind.agotados) + '</div>' +
      '<div class="etiqueta">Stock crítico</div>' +
      '<div class="muted">' + ind.agotados + ' agotado(s) · ' + ind.bajoMinimo + ' bajo mínimo</div></div>' +
    '<div class="resumen-card' + (ind.ventasCount ? " resumen-card-accion" : "") + '"' +
      (ind.ventasCount ? ' data-ir-tab="ventas" role="button" tabindex="0"' : "") + '>' +
      '<div class="valor">$' + money(ind.ventasTotal) + '</div>' +
      '<div class="etiqueta">Ventas recientes</div>' +
      '<div class="muted">' + ind.ventasCount + ' venta(s) en caché</div></div>' +
    '<div class="resumen-card' + (ind.opsPendientes || ind.opsAtencion ? " alerta resumen-card-accion" : "") + '"' +
      (ind.opsPendientes || ind.opsAtencion ? ' data-ir-tab="pendientes" role="button" tabindex="0"' : "") + '>' +
      '<div class="valor">' + (ind.opsPendientes + ind.opsAtencion) + '</div>' +
      '<div class="etiqueta">Operaciones</div>' +
      '<div class="muted">' + ind.opsPendientes + ' pend. · ' + ind.opsAtencion + ' atención' +
        (ind.trfPendientes ? ' · ' + ind.trfPendientes + ' transf.' : '') + '</div></div>' +
    '<div class="resumen-card' + (ind.transferencias ? " resumen-card-accion" : "") + '"' +
      (ind.transferencias ? ' data-ir-tab="transferencias" role="button" tabindex="0"' : "") + '>' +
      '<div class="valor">' + ind.transferencias + '</div>' +
      '<div class="etiqueta">Transferencias</div>' +
      '<div class="muted">en historial reciente</div></div>';
}

function construirAlertasMando(ops) {
  const alertas = [];
  const offline = estaRealmenteDesconectado();
  ops.forEach((op) => {
    if (op.estado === "REQUIERE_ATENCION") {
      alertas.push({
        nivel: "critico",
        tipo: "Operación requiere atención",
        texto: (ETIQUETA_TIPO_OP[op.tipo] || op.tipo || "Operación") + ": " + (op.ultimo_error || "error de negocio"),
        op,
        tab: "pendientes",
      });
    }
  });
  const ahora = Date.now();
  ops.forEach((op) => {
    if (op.estado === "PENDIENTE" && op.creado_en) {
      const horas = (ahora - new Date(op.creado_en).getTime()) / 36e5;
      if (horas > 24) {
        alertas.push({
          nivel: "atencion",
          tipo: "Pendiente prolongado",
          texto: (ETIQUETA_TIPO_OP[op.tipo] || op.tipo || "Operación") + " pendiente hace más de 24hs.",
          op,
          tab: "pendientes",
        });
      }
    }
  });
  // Transferencias pendientes en cola (dato real de ops offline).
  const trfPend = ops.filter((o) => o.tipo === "transferencia" && (o.estado === "PENDIENTE" || o.estado === "SINCRONIZANDO"));
  if (trfPend.length > 0) {
    alertas.push({
      nivel: "atencion",
      tipo: "Transferencias pendientes",
      texto: trfPend.length + (trfPend.length === 1 ? " transferencia en cola de sincronización." : " transferencias en cola de sincronización."),
      op: trfPend[0],
      tab: "pendientes",
    });
  }
  // Stock bajo / agotado desde caché real (sin inventar umbrales).
  const stock = _cache.stock || [];
  const agotados = stock.filter((s) => Number(s.cantidad) <= 0);
  const bajo = stock.filter((s) => s.minimo != null && Number(s.cantidad) <= Number(s.minimo) && Number(s.cantidad) > 0);
  if (agotados.length > 0) {
    alertas.push({
      nivel: "critico",
      tipo: "Productos agotados",
      texto: agotados.length + (agotados.length === 1 ? " producto sin stock." : " productos sin stock."),
      op: null,
      tab: "inventario",
    });
  }
  if (bajo.length > 0) {
    alertas.push({
      nivel: "atencion",
      tipo: "Stock bajo mínimo",
      texto: bajo.length + (bajo.length === 1 ? " producto bajo el mínimo." : " productos bajo el mínimo."),
      op: null,
      tab: "inventario",
    });
  }
  if (offline) {
    alertas.push({ nivel: "atencion", tipo: "Sin conexión", texto: "Trabajando offline. Los datos pueden no estar actualizados.", op: null, tab: null });
  }
  if (_usuarioActual && _usuarioActual.activo === false) {
    alertas.push({ nivel: "critico", tipo: "Usuario inactivo", texto: "Tu usuario está inactivo. No podés operar.", op: null, tab: null });
  }
  return alertas.sort((a, b) => {
    const orden = { critico: 0, atencion: 1, normal: 2 };
    return (orden[a.nivel] ?? 3) - (orden[b.nivel] ?? 3);
  });
}

function renderAlertasMando(ops) {
  const el = document.getElementById("mando-alertas");
  if (!el) return;
  const alertas = (typeof construirAlertasMandoB8Completo === "function")
    ? construirAlertasMandoB8Completo(ops)
    : (typeof construirAlertasMandoB7Completo === "function")
      ? construirAlertasMandoB7Completo(ops)
      : (typeof construirAlertasMandoCompleto === "function")
        ? construirAlertasMandoCompleto(ops)
        : construirAlertasMando(ops);
  if (alertas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin alertas. Todo en orden.</p>';
    return;
  }
  el.innerHTML = "";
  alertas.forEach((a) => {
    const div = document.createElement("div");
    div.className = "cc-asunto cc-prioridad-" + a.nivel;
    div.innerHTML = '<span class="cc-asunto-principal"><span class="cc-asunto-tipo">' + escHtml(a.tipo) + '</span><span class="muted cc-asunto-resumen">' + escHtml(a.texto) + "</span></span>";
    const principal = div.querySelector(".cc-asunto-principal");
    if (a.op && a.op.id) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cc-accion mando-ver-op-btn";
      btn.textContent = "Ver operación";
      btn.dataset.id = a.op.id;
      principal.appendChild(btn);
    } else if (a.tab) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cc-accion mando-ir-tab-btn";
      btn.textContent = a.tab === "inventario" ? "Ver inventario" : a.tab === "pendientes" ? "Ver pendientes" : "Ir";
      btn.dataset.tab = a.tab;
      principal.appendChild(btn);
    }
    el.appendChild(div);
  });
}

// lee _cache (ventas/transferencias/vales). Sin consultas nuevas.
function renderActividadMando() {
  const el = document.getElementById("mando-actividad");
  if (!el) return;
  let movs = [];
  if (typeof construirActividadReciente === "function") {
    movs = construirActividadReciente();
  }
  if (movs.length === 0) {
    el.innerHTML = '<p class="lista-estado">Todavía no hay actividad registrada.</p>';
    return;
  }
  el.innerHTML = "";
  movs.forEach((m) => {
    const div = document.createElement("div");
    div.className = "cc-actividad-item cc-prioridad-normal";
    const fechaTxt = m.fecha ? fechaHora(m.fecha) : "";
    div.innerHTML = '<span class="cc-actividad-icono">' + escHtml(m.icono) + '</span><span class="cc-actividad-texto">' + escHtml(m.texto) + '</span><span class="cc-actividad-meta"><span class="muted">' + escHtml(fechaTxt) + '</span><span class="cc-actividad-resultado">' + escHtml(m.resultado) + "</span></span>";
    el.appendChild(div);
  });
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
  if (!filas || filas.length === 0) {
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

// ---- Orquestador único del Centro de Mando ----
async function refrescarCentroMando() {
  if (!appShell || !appShell.classList.contains("visible")) return;
  const ops = await obtenerOperacionesVisiblesPanel();
  const estado = calcularEstadoMando(ops, _sincronizando);
  renderEstadoMando(estado);
  renderResumenMando(ops);
  // B7+B8: refrescar alertas de turnos/cuadres/incidencias y comunicación.
  if (typeof refrescarAlertasB7 === "function") await refrescarAlertasB7();
  if (typeof refrescarAlertasB8 === "function") await refrescarAlertasB8();
  renderAlertasMando(ops);
  renderActividadMando();
  // Info de conexión.
  const conn = document.getElementById("mando-conn-info");
  if (conn) {
    conn.textContent = estaRealmenteDesconectado() ? "⚪ Sin conexión — datos locales" : (_sincronizando ? "🔵 Sincronizando…" : "🟢 Conectado");
  }
  // Auditoría: solo si hay permiso y conexión (no inventar datos offline).
  if (typeof tienePermiso === "function" && tienePermiso("auditoria", "ver") && navigator.onLine && typeof contextoB3Disponible === "function" && contextoB3Disponible()) {
    await refrescarAuditoria();
  } else if (document.getElementById("mando-auditoria")) {
    document.getElementById("mando-auditoria").innerHTML = '<p class="lista-estado">' +
      (estaRealmenteDesconectado()
        ? "⚪ Sin conexión — auditoría no disponible offline."
        : (typeof tienePermiso === "function" && !tienePermiso("auditoria", "ver")
          ? "No tenés permiso para ver auditoría."
          : "Sin permiso o sin datos de auditoría.")) +
      "</p>";
  }
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

  const tab = document.getElementById("tab-mando");
  if (tab) {
    tab.addEventListener("click", async (e) => {
      const btnOp = e.target.closest(".mando-ver-op-btn");
      if (btnOp && btnOp.dataset.id) {
        const op = await obtenerOperacionPendiente(btnOp.dataset.id);
        if (op && typeof mostrarDetalleOperacion === "function") mostrarDetalleOperacion(op);
        return;
      }
      const btnTab = e.target.closest(".mando-ir-tab-btn");
      if (btnTab && btnTab.dataset.tab && typeof irATab === "function") {
        irATab(btnTab.dataset.tab);
        return;
      }
      const card = e.target.closest("[data-ir-tab]");
      if (card && card.getAttribute("data-ir-tab") && typeof irATab === "function") {
        irATab(card.getAttribute("data-ir-tab"));
      }
    });
    tab.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        const card = e.target.closest("[data-ir-tab]");
        if (card && typeof irATab === "function") {
          e.preventDefault();
          irATab(card.getAttribute("data-ir-tab"));
        }
      }
    });
  }
});
