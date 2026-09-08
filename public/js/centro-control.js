// ==== Battlecruiser · js/centro-control.js ====
// Lecturas directas a tablas, mensajes/errores de UI, estado operacional del negocio y render del Centro de Control (asuntos que requieren atención, actividad reciente, inventario resumido).
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)


// ---- Lecturas: consultas directas a las tablas (protegidas por RLS/tiene_permiso).
function setMsg(id, text, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = "msg " + (ok ? "ok" : "error");
}

function explicarError(error, contexto) {
  console.error("[Battlecruiser]" + (contexto ? " (" + contexto + ")" : ""), error);
  const msg = ((error && error.message) || "").toLowerCase();
  if (!navigator.onLine || msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("timeout")) {
    return "Sin conexión o la red está lenta ahora mismo. Intenta de nuevo en un momento.";
  }
  return (error && error.message) || "Ocurrió un error inesperado.";
}

const _cache = { productos: [], almacenes: [], stock: [], transferencias: [], vales: [], ventas: [] };

// "resuelto": marcar visto solo quita el realce visual de "nuevo" (punto
function prioridadAsunto(estado) {
  switch (estado) {
    case "REQUIERE_ATENCION": return "critico";
    case "PENDIENTE":
    case "SINCRONIZANDO": return "atencion";
    default: return "normal";
  }
}

// { nivel, texto, detalle }. Reglas: conexión y sincronización son
// estados distintos. Nunca verde si hay pendientes o atención.
function calcularEstadoOperacional(ops, sincronizando) {
  const pendiente = ops.filter((o) => o.estado === "PENDIENTE").length;
  const sincronizandoOps = ops.filter((o) => o.estado === "SINCRONIZANDO").length;
  const atencion = ops.filter((o) => o.estado === "REQUIERE_ATENCION").length;
  const offline = estaRealmenteDesconectado();

  if (atencion > 0) {
    return {
      nivel: "critico",
      texto: "Requiere atención",
      detalle: atencion + (atencion === 1 ? " operación requiere atención." : " operaciones requieren atención."),
    };
  }

  if (sincronizando || sincronizandoOps > 0) {
    return {
      nivel: "atencion",
      texto: "Sincronizando…",
      detalle: "Enviando operaciones pendientes al servidor.",
    };
  }

  if (pendiente > 0) {
    return {
      nivel: "atencion",
      texto: offline ? "Pendientes (sin conexión)" : "Operaciones pendientes",
      detalle: pendiente + (pendiente === 1 ? " operación pendiente de sincronizar." : " operaciones pendientes de sincronizar."),
    };
  }

  if (offline) {
    return {
      nivel: "normal",
      texto: "Sin conexión — al día",
      detalle: "Trabajando localmente. Sin operaciones pendientes.",
    };
  }

  return {
    nivel: "normal",
    texto: "Operativo",
    detalle: "Todo sincronizado.",
  };
}

function construirAsuntosAtencion(ops) {
  return ops
    .map((op) => ({
      op,
      prioridad: prioridadAsunto(op.estado),
      visto: _novedadesVistas.has(op.id),
    }))
    .sort((a, b) => {
      const orden = { critico: 0, atencion: 1, normal: 2 };
      const d = (orden[a.prioridad] != null ? orden[a.prioridad] : 3) - (orden[b.prioridad] != null ? orden[b.prioridad] : 3);
      if (d !== 0) return d;
      // dentro de la misma prioridad, FIFO (más antigua primero)
      return (a.op.creado_en < b.op.creado_en ? -1 : a.op.creado_en > b.op.creado_en ? 1 : 0);
    });
}

// (transferencias + vales + ventas), NO hace consultas nuevas. Cada
// actividad indica tipo, hora y resultado. No crea una segunda auditoría.
function construirActividadReciente() {
  const movs = [];
  (_cache.transferencias || []).forEach((t) => {
    movs.push({
      icono: "↔",
      texto: "Transferencia: " + (t.origen && t.origen.nombre ? t.origen.nombre : "?") + " → " + (t.destino && t.destino.nombre ? t.destino.nombre : "?"),
      fecha: t.fecha,
      resultado: t.estado || "",
    });
  });
  (_cache.vales || []).forEach((v) => {
    movs.push({
      icono: "📋",
      texto: "Vale (" + (v.tipo || "?") + "): " + (v.productos && v.productos.nombre ? v.productos.nombre : "?") + " · " + (v.almacenes && v.almacenes.nombre ? v.almacenes.nombre : "?"),
      fecha: v.fecha,
      resultado: money(v.cantidad) + " u",
    });
  });
  (_cache.ventas || []).forEach((v) => {
    movs.push({
      icono: "🛒",
      texto: "Venta: " + (v.almacenes && v.almacenes.nombre ? v.almacenes.nombre : "?"),
      fecha: v.fecha,
      resultado: "$" + money(v.total),
    });
  });
  return movs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 8);
}

// ajustePendiente() (autoridad existente). El Centro de Control solo
// presenta; NO recalcula stock independientemente.
function construirStockBajo() {
  return (_cache.stock || []).filter((s) => s.minimo != null && s.cantidad <= s.minimo);
}

function proyeccionStock(producto_id, almacen_id, stockReal) {
  const { ajuste, noCalculable } = ajustePendiente(producto_id, almacen_id);
  return {
    stockReal: Number(stockReal) || 0,
    ajuste,
    proyeccion: (Number(stockReal) || 0) + ajuste,
    noCalculable,
  };
}

// ---- Render del Centro de Control ----

function renderEstadoNegocio(estado) {
  const el = document.getElementById("cc-estado");
  if (!el) return;
  el.className = "cc-estado cc-estado-" + estado.nivel;
  el.innerHTML =
    '<div class="cc-estado-cabecera">' +
      '<span class="cc-estado-titulo">' + escHtml(estado.texto) + "</span>" +
      '<span class="cc-estado-detalle">' + escHtml(estado.detalle) + "</span>" +
    "</div>";
}

function renderRequiereAtencion(asuntos) {
  const el = document.getElementById("cc-atencion");
  if (!el) return;
  const criticos = asuntos.filter((a) => a.prioridad === "critico");
  if (criticos.length === 0) {
    el.innerHTML = '<p class="lista-estado">Nada requiere atención ahora mismo.</p>';
    return;
  }
  el.innerHTML = "";
  criticos.forEach((a) => {
    const op = a.op;
    const tipo = ETIQUETA_TIPO_OP[op.tipo] || op.tipo || "Operación";
    const fecha = op.creado_en
      ? fechaHora(op.creado_en)
      : "—";
    const errorTxt = op.ultimo_error ? escHtml(String(op.ultimo_error)) : "Error de negocio.";
    const div = document.createElement("div");
    div.className = "cc-asunto cc-prioridad-critico" + (a.visto ? " visto" : "");
    div.dataset.id = op.id;
    div.innerHTML =
      '<span class="cc-asunto-principal">' +
        '<span class="cc-asunto-tipo">' + escHtml(tipo) + "</span>" +
        '<span class="muted cc-asunto-resumen">' + escHtml(resumenOperacionPendiente(op)) + "</span>" +
        '<span class="cc-asunto-motivo">' + errorTxt + "</span>" +
      "</span>" +
      '<span class="cc-asunto-lateral">' +
        '<span class="muted cc-asunto-meta">' + fecha + "</span>" +
        '<span class="cc-asunto-acciones">' +
          '<button type="button" class="cc-accion cc-ver-btn" data-id="' + escHtml(op.id) + '">Ver detalle</button>' +
          '<button type="button" class="cc-accion cc-reintentar-btn" data-id="' + escHtml(op.id) + '">Reintentar</button>' +
          '<button type="button" class="cc-accion cc-eliminar-btn" data-id="' + escHtml(op.id) + '">Eliminar</button>' +
        "</span>" +
      "</span>";
    el.appendChild(div);
    // desaparece porque el usuario ya está mirando la lista. No se borra
    // el dato ni se resuelve el problema.
    _novedadesVistas.add(op.id);
  });
}

function renderPendientesCompacto(asuntos) {
  const el = document.getElementById("cc-pendientes");
  if (!el) return;
  const pendientes = asuntos.filter((a) => a.prioridad === "atencion");
  const total = pendientes.length;
  if (total === 0) {
    el.innerHTML = '<p class="lista-estado">Sin operaciones pendientes.</p>';
    return;
  }
  el.innerHTML = "";
  const resumen = document.createElement("div");
  resumen.className = "cc-pendientes-resumen";
  resumen.innerHTML =
    '<span class="cc-pendientes-numero">' + total + "</span>" +
    "<span>" + (total === 1 ? "operación pendiente" : "operaciones pendientes") + "</span>" +
    '<button type="button" class="cc-accion cc-ir-pendientes-btn">Ver en Pendientes</button>';
  el.appendChild(resumen);

  const lista = document.createElement("div");
  lista.className = "cc-pendientes-lista";
  pendientes.slice(0, 4).forEach((a) => {
    const op = a.op;
    const tipo = ETIQUETA_TIPO_OP[op.tipo] || op.tipo || "Operación";
    const div = document.createElement("div");
    div.className = "cc-asunto cc-prioridad-atencion" + (a.visto ? " visto" : "");
    div.dataset.id = op.id;
    div.innerHTML =
      '<span class="cc-asunto-principal">' +
        '<span class="cc-asunto-tipo">' + escHtml(tipo) + "</span>" +
        '<span class="muted cc-asunto-resumen">' + escHtml(resumenOperacionPendiente(op)) + "</span>" +
      "</span>" +
      '<span class="cc-asunto-lateral">' +
        '<span class="cc-asunto-estado">' + escHtml(etiquetaEstadoPanel(op.estado)) + "</span>" +
      "</span>";
    lista.appendChild(div);
    _novedadesVistas.add(op.id);
  });
  el.appendChild(lista);
}

function renderActividadReciente() {
  const el = document.getElementById("cc-actividad");
  if (!el) return;
  const movs = construirActividadReciente();
  if (movs.length === 0) {
    el.innerHTML = '<p class="lista-estado">Todavía no hay actividad registrada.</p>';
    return;
  }
  el.innerHTML = "";
  movs.forEach((m) => {
    const div = document.createElement("div");
    div.className = "cc-actividad-item cc-prioridad-normal";
    const fechaTxt = m.fecha ? fechaHora(m.fecha) : "";
    div.innerHTML =
      '<span class="cc-actividad-icono">' + escHtml(m.icono) + "</span>" +
      '<span class="cc-actividad-texto">' + escHtml(m.texto) + "</span>" +
      '<span class="cc-actividad-meta">' +
        '<span class="muted">' + escHtml(fechaTxt) + "</span>" +
        '<span class="cc-actividad-resultado">' + escHtml(m.resultado) + "</span>" +
      "</span>";
    el.appendChild(div);
  });
}

function renderInventarioControl() {
  const el = document.getElementById("cc-inventario");
  if (!el) return;
  const bajo = construirStockBajo();
  if (bajo.length === 0) {
    el.innerHTML = '<p class="lista-estado">Nada bajo el mínimo por ahora.</p>';
    return;
  }
  el.innerHTML = "";
  bajo.slice(0, 5).forEach((s) => {
    const prodId = s.producto_id;
    const almId = s.almacen_id;
    const div = document.createElement("div");
    div.className = "cc-stock-item";
    // existente). No recalcula stock independientemente.
    const proj = proyeccionStock(prodId, almId, s.cantidad);
    const ajusteTxt = proj.noCalculable
      ? '<span class="muted">proyección no calculable</span>'
      : (proj.ajuste === 0
          ? ""
          : '<span class="cc-stock-ajuste">' + (proj.ajuste > 0 ? "+" : "") + money(proj.ajuste) + " pend.</span>");
    div.innerHTML =
      '<span class="cc-stock-principal">' +
        '<span class="cc-stock-nombre">' + escHtml(s.productos && s.productos.nombre ? s.productos.nombre : "?") +
          ' <span class="muted">· ' + escHtml(s.almacenes && s.almacenes.nombre ? s.almacenes.nombre : "?") + "</span></span>" +
        '<span class="cc-stock-proyeccion">' +
          '<span class="cc-stock-real">' + money(s.cantidad) + "</span>" +
          ajusteTxt +
          (proj.noCalculable ? "" : '<span class="cc-stock-proj">Proy: ' + money(proj.proyeccion) + "</span>") +
        "</span>" +
      "</span>";
    el.appendChild(div);
  });
  const ir = document.createElement("button");
  ir.type = "button";
  ir.className = "cc-accion cc-ir-inventario-btn";
  ir.textContent = "Ver inventario";
  el.appendChild(ir);
}

// Orquestador único del Centro de Control. Lee la cola una sola vez
async function refrescarCentroControl() {
  if (!appShell || !appShell.classList.contains("visible")) return;
  const ops = await obtenerOperacionesVisiblesPanel();
  const estado = calcularEstadoOperacional(ops, _sincronizando);
  const asuntos = construirAsuntosAtencion(ops);
  renderEstadoNegocio(estado);
  renderRequiereAtencion(asuntos);
  renderPendientesCompacto(asuntos);
  renderInventarioControl();
  renderActividadReciente();
  refrescarBadgeCentroControl(asuntos);
}

// hay asuntos críticos (REQUIERE_ATENCION) no vistos. Reutiliza el mismo
// patrón que el badge de Pendientes (.pendientes-tab-badge).
function refrescarBadgeCentroControl(asuntos) {
  const badge = document.getElementById("resumen-tab-badge");
  if (!badge) return;
  const criticosNoVistos = asuntos.filter((a) => a.prioridad === "critico" && !a.visto).length;
  if (criticosNoVistos === 0) {
    badge.classList.add("hidden");
    badge.classList.remove("atencion");
    badge.textContent = "";
  } else {
    badge.textContent = String(criticosNoVistos);
    badge.classList.add("atencion");
    badge.classList.remove("hidden");
  }
}

// existentes y la navegación por tabs. Un solo listener delegado (no uno
// por botón, los items se recrean en cada refresco). Evita botones muertos.
safeInit("centro-control-acciones", () => {
  const cont = document.getElementById("tab-resumen");
  if (!cont) return;
  cont.addEventListener("click", async (e) => {
    const ver = e.target.closest(".cc-ver-btn");
    if (ver) {
      e.stopPropagation();
      const op = await obtenerOperacionPendiente(ver.dataset.id);
      if (op) mostrarDetalleOperacion(op);
      else await refrescarCentroControl();
      return;
    }
    const reintentar = e.target.closest(".cc-reintentar-btn");
    if (reintentar) {
      e.stopPropagation();
      await reintentarOperacionPendiente(reintentar.dataset.id, reintentar);
      await refrescarCentroControl();
      return;
    }
    const eliminar = e.target.closest(".cc-eliminar-btn");
    if (eliminar) {
      e.stopPropagation();
      await eliminarOperacionPendienteConfirmada(eliminar.dataset.id, eliminar);
      await refrescarCentroControl();
      return;
    }
    const irPendientes = e.target.closest(".cc-ir-pendientes-btn");
    if (irPendientes) {
      e.stopPropagation();
      const btnTab = document.querySelector('.tab-btn[data-tab="pendientes"]');
      if (btnTab) btnTab.click();
      return;
    }
    const irInventario = e.target.closest(".cc-ir-inventario-btn");
    if (irInventario) {
      e.stopPropagation();
      const btnTab = document.querySelector('.tab-btn[data-tab="almacenes"]');
      if (btnTab) btnTab.click();
      return;
    }
    // Click en un item de atención/pendiente (no en un botón): detalle.
    const item = e.target.closest(".cc-asunto");
    if (item && item.dataset.id) {
      const op = await obtenerOperacionPendiente(item.dataset.id);
      if (op) mostrarDetalleOperacion(op);
    }
  });
});

function renderResumen() {
  const grid = document.getElementById("resumen-grid");
  if (!grid) return;

  const bajoMinimo = (_cache.stock || []).filter((s) => s.minimo != null && s.cantidad <= s.minimo);

  // R2: el Centro de Control (pantalla inicial) ahora refleja la actividad
  const ventasRecientes = _cache.ventas || [];
  const totalVendido = ventasRecientes.reduce((s, v) => s + (Number(v.total) || 0), 0);

  grid.innerHTML = `
    <div class="resumen-card"><div class="valor">${(_cache.productos || []).length}</div><div class="etiqueta">Productos</div></div>
    <div class="resumen-card"><div class="valor">${(_cache.almacenes || []).length}</div><div class="etiqueta">Almacenes</div></div>
    <div class="resumen-card ${bajoMinimo.length ? "alerta resumen-card-accion" : ""}" ${bajoMinimo.length ? 'data-ir-tab="inventario" role="button" tabindex="0"' : ""}><div class="valor">${bajoMinimo.length}</div><div class="etiqueta">Bajo mínimo</div>${bajoMinimo.length ? '<div class="muted">Tocá para ver inventario</div>' : ""}</div>
    <div class="resumen-card"><div class="valor">$${money(totalVendido)}</div><div class="etiqueta">Ventas recientes</div><div class="muted">${ventasRecientes.length} venta(s)</div></div>
    <div class="resumen-card"><div class="valor">${(_cache.transferencias || []).length + (_cache.vales || []).length}</div><div class="etiqueta">Otros movimientos</div></div>
  `;

  const alertasEl = document.getElementById("resumen-alertas-lista");
  if (alertasEl) {
    if (bajoMinimo.length === 0) {
      alertasEl.innerHTML = '<p class="lista-estado">Nada bajo el mínimo por ahora.</p>';
    } else {
      // R3: alertas accionables. Misma defensa que renderInventarioControl:
      // filas de stock pueden llegar sin joins productos/almacenes embebidos
      // (p.ej. proyección offline o datos parciales en _cache).
      alertasEl.innerHTML = "";
      const cab = document.createElement("div");
      cab.className = "lista-item alerta-cabecera";
      cab.innerHTML = '<span class="cc-asunto-tipo">' + bajoMinimo.length + ' producto(s) bajo mínimo</span>'
        + '<button type="button" class="cc-accion alerta-ir-btn" data-ir-tab="inventario">Ver inventario</button>';
      alertasEl.appendChild(cab);
      bajoMinimo.forEach((s) => {
        const div = document.createElement("div");
        div.className = "lista-item alerta-item";
        div.setAttribute("data-ir-tab", "inventario");
        div.setAttribute("role", "button");
        div.setAttribute("tabindex", "0");
        const prodNombre = s.productos && s.productos.nombre ? s.productos.nombre : "?";
        const almNombre = s.almacenes && s.almacenes.nombre ? s.almacenes.nombre : "?";
        div.innerHTML = `<span>${escHtml(prodNombre)} <span class="muted">· ${escHtml(almNombre)}</span></span>
          <span class="muted" style="color:var(--wine)">${money(s.cantidad)} ⚠</span>`;
        alertasEl.appendChild(div);
      });
    }
  }

  const movsEl = document.getElementById("resumen-movs-lista");
  if (movsEl) {
    // R9: cada movimiento lleva tipo + id reales para ser accionable
    // (click/Enter navega a la sección correspondiente). Reutiliza _cache
    // (no consulta nueva). Incluye ventas (R2), transferencias y vales.
    // Defensa idéntica a construirActividadReciente: joins pueden faltar.
    const movs = [
      ...(_cache.ventas || []).map((v) => ({
        tipo: "venta", id: v.id, fecha: v.fecha,
        texto: `Venta: ${v.almacenes && v.almacenes.nombre ? v.almacenes.nombre : "?"}`, estado: "$" + money(v.total),
      })),
      ...(_cache.transferencias || []).map((t) => ({
        tipo: "transferencia", id: t.id, fecha: t.fecha,
        texto: `Transferencia: ${t.origen && t.origen.nombre ? t.origen.nombre : "?"} → ${t.destino && t.destino.nombre ? t.destino.nombre : "?"}`, estado: t.estado,
      })),
      ...(_cache.vales || []).map((v) => ({
        tipo: "vale", id: v.id, fecha: v.fecha,
        texto: `Vale (${v.tipo || "?"}): ${v.productos && v.productos.nombre ? v.productos.nombre : "?"} · ${v.almacenes && v.almacenes.nombre ? v.almacenes.nombre : "?"}`, estado: money(v.cantidad),
      })),
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 8);

    if (movs.length === 0) {
      movsEl.innerHTML = '<p class="lista-estado">Todavía no hay movimientos registrados.</p>';
    } else {
      movsEl.innerHTML = "";
      movs.forEach((m) => {
        const div = document.createElement("div");
        // R9: accionable. data-mov-tipo + data-mov-tab permiten navegar a la
        // sección del movimiento. role/tabindex para teclado (Enter).
        const tabDestino = m.tipo === "venta" ? "ventas" : m.tipo === "transferencia" ? "transferencias" : "vales";
        div.className = "lista-item lista-item-accion resumen-mov-item";
        div.setAttribute("data-mov-tipo", m.tipo);
        div.setAttribute("data-mov-id", m.id || "");
        div.setAttribute("data-mov-tab", tabDestino);
        div.setAttribute("role", "button");
        div.setAttribute("tabindex", "0");
        div.innerHTML = `<span>${fechaCorta(m.fecha)} <span class="muted">· ${escHtml(m.tipo)}</span></span>
          <span class="muted">${m.texto} · ${m.estado}</span>`;
        movsEl.appendChild(div);
      });
    }
  }
  // actividad reciente e inventario. Cuando _cache cambia, refrescar el
  // Centro tambien. No hace consultas nuevas: solo pinta desde _cache.
  if (typeof refrescarCentroControl === "function") refrescarCentroControl();
}

