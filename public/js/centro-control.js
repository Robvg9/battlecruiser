// ==== Battlecruiser · js/centro-control.js ====
// Lecturas directas a tablas, mensajes/errores de UI, estado operacional del negocio y render del Centro de Control (asuntos que requieren atención, actividad reciente, inventario resumido).
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)


function fmtNumCC(v) { return typeof window.numberFmt === 'function' ? window.numberFmt(v) : String(v == null ? 0 : v); }

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

// Alertas únicas que estaban en Centro de Mando: ahora se integran aquí sin repetir
// la cola crítica, el stock bajo ni el estado offline ya visibles en el Dashboard.
function construirAvisosAdicionalesControl(ops) {
  const avisos = [];
  const filas = Array.isArray(ops) ? ops : [];
  const ahora = Date.now();
  const prolongados = filas.filter((op) => {
    if (op.estado !== "PENDIENTE" || !op.creado_en) return false;
    const fecha = new Date(op.creado_en).getTime();
    return Number.isFinite(fecha) && ahora - fecha > 24 * 60 * 60 * 1000;
  });
  if (prolongados.length > 0) {
    avisos.push({
      nivel: "atencion",
      tipo: "Pendientes prolongados",
      texto: fmtNumCC(prolongados.length) + (prolongados.length === 1 ? " operación lleva más de 24 horas pendiente." : " operaciones llevan más de 24 horas pendientes."),
      op: prolongados[0],
      tab: "pendientes",
    });
  }
  const transferencias = filas.filter((op) => op.tipo === "transferencia" && (op.estado === "PENDIENTE" || op.estado === "SINCRONIZANDO"));
  if (transferencias.length > 0) {
    avisos.push({
      nivel: "atencion",
      tipo: "Transferencias pendientes",
      texto: fmtNumCC(transferencias.length) + (transferencias.length === 1 ? " transferencia en cola de sincronización." : " transferencias en cola de sincronización."),
      op: transferencias[0],
      tab: "pendientes",
    });
  }
  if (typeof _usuarioActual !== "undefined" && _usuarioActual && _usuarioActual.activo === false) {
    avisos.push({
      nivel: "critico",
      tipo: "Usuario inactivo",
      texto: "Tu usuario está inactivo. No puedes operar.",
      op: null,
      tab: null,
    });
  }
  return avisos;
}

// Avisos complementarios de Jornada/Operación y Comunicación.
// El Centro de Control ya muestra las alertas de cola, inventario y actividad: aquí
// se incluyen solo los avisos únicos B7/B8 para evitar repetirlos.
let _refrescandoAvisosOperativos = null;

function renderAvisosOperativosControl(ops) {
  const el = document.getElementById("cc-avisos-operativos");
  if (!el) return;
  el.textContent = "";
  const conectado = navigator.onLine && !(typeof estaRealmenteDesconectado === "function" && estaRealmenteDesconectado());
  const avisos = construirAvisosAdicionalesControl(ops);
  if (conectado && typeof construirAlertasB7 === "function") avisos.push(...construirAlertasB7());
  if (conectado && typeof construirAlertasB8 === "function") avisos.push(...construirAlertasB8());
  const importantes = avisos.filter((a) => a.nivel === "critico" || a.nivel === "atencion");
  if (importantes.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin asuntos adicionales que requieran atención.</p>';
    return;
  }
  importantes.forEach((aviso) => {
    const row = document.createElement("div");
    row.className = "cc-aviso cc-aviso-" + (aviso.nivel === "critico" ? "critico" : "atencion");
    const copy = document.createElement("div");
    copy.className = "cc-aviso-copy";
    const title = document.createElement("strong");
    title.textContent = aviso.tipo || "Aviso operativo";
    const detail = document.createElement("span");
    detail.textContent = aviso.texto || "";
    copy.append(title, detail);
    row.appendChild(copy);
    if (aviso.tab) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "cc-accion";
      action.dataset.irTab = aviso.tab;
      action.textContent = "Abrir";
      action.setAttribute("aria-label", "Abrir " + (aviso.tipo || "sección"));
      row.appendChild(action);
    }
    el.appendChild(row);
  });
}

async function refrescarAvisosOperativosControl(ops) {
  if (_refrescandoAvisosOperativos) return _refrescandoAvisosOperativos;
  _refrescandoAvisosOperativos = (async () => {
    const tareas = [];
    const conectado = navigator.onLine && !(typeof estaRealmenteDesconectado === "function" && estaRealmenteDesconectado());
    if (conectado && typeof refrescarAlertasB7 === "function") tareas.push(refrescarAlertasB7());
    if (conectado && typeof refrescarAlertasB8 === "function") tareas.push(refrescarAlertasB8());
    await Promise.allSettled(tareas);
    renderAvisosOperativosControl(ops);
  })();
  try {
    await _refrescandoAvisosOperativos;
  } finally {
    _refrescandoAvisosOperativos = null;
  }
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
  await refrescarAvisosOperativosControl(ops);
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
    <div class="resumen-card"><div class="valor">$${money(totalVendido)}</div><div class="etiqueta">Ventas recientes</div><div class="muted">${fmtNumCC(ventasRecientes.length)} venta(s)</div></div>
    <div class="resumen-card"><div class="valor">${fmtNumCC((_cache.transferencias || []).length + (_cache.vales || []).length)}</div><div class="etiqueta">Otros movimientos</div></div>
  `;

  const alertasEl = document.getElementById("resumen-alertas-lista");
  if (alertasEl) {
    if (bajoMinimo.length === 0) {
      alertasEl.innerHTML = '<p class="lista-estado">Nada bajo el mínimo por ahora.</p>';
    } else {
      // R3: alertas accionables. Misma defensa que el renderer único:
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
        const nivelStock = Number(s.cantidad) <= 0 ? "Agotado" : "Bajo mínimo";
        div.innerHTML = `<span>${escHtml(prodNombre)} <span class="muted">· ${escHtml(almNombre)}</span></span>
          <span class="muted" style="color:var(--wine)">${escHtml(nivelStock)} · ${fmtNumCC(s.cantidad)} ⚠</span>`;
        alertasEl.appendChild(div);
      });
    }
  }

  const movsEl = document.getElementById("resumen-movs-lista");
  if (movsEl) {
    // R9: cada movimiento lleva tipo + id reales para ser accionable
    // (click/Enter navega a la sección correspondiente). Reutiliza _cache
    // (no consulta nueva). Incluye ventas (R2), transferencias y vales.
    // Defensa de datos parciales: joins pueden faltar.
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
        texto: `Vale (${v.tipo || "?"}): ${v.productos && v.productos.nombre ? v.productos.nombre : "?"} · ${v.almacenes && v.almacenes.nombre ? v.almacenes.nombre : "?"}`, estado: fmtNumCC(v.cantidad),
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
  // Mantiene el ciclo existente: el cache se pinta y luego se refresca el estado operativo.
  if (typeof refrescarCentroControl === "function") refrescarCentroControl();
}

