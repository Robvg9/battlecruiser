// ==== Battlecruiser · js/reportes.js ====
// B5 — Reportes y análisis operativo (resumen ejecutivo y sub-reportes).
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

// ---- B5 — REPORTES Y ANÁLISIS OPERATIVO
let _repSubreporte = "ventas";
let _repPagina = 0;
const _REP_POR_PAG = 25;

// Date-only report filters are evaluated in the same business timezone as displayed dates.
// Do not inherit the device timezone: Android/PC browser defaults can differ from Cuba.
function fechaHoraReporte(fecha) {
  if (!fecha) return "—";
  const d = new Date(fecha);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("es", {
    timeZone: "America/Havana",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Poblar el select de almacenes con los ya cacheados (sin consulta nueva).
function poblarFiltrosReportes() {
  poblarSelectAlmacenes(document.getElementById("rep-filtro-almacen"));
}

function leerFiltrosReportes() {
  const desde = document.getElementById("rep-filtro-desde");
  const hasta = document.getElementById("rep-filtro-hasta");
  const almacen = document.getElementById("rep-filtro-almacen");
  return {
    desde: desde && desde.value ? desde.value : null,
    hasta: hasta && hasta.value ? hasta.value : null,
    almacen: almacen && almacen.value ? almacen.value : null,
  };
}

function limpiarFiltrosReportes() {
  const desde = document.getElementById("rep-filtro-desde");
  const hasta = document.getElementById("rep-filtro-hasta");
  const almacen = document.getElementById("rep-filtro-almacen");
  if (desde) desde.value = "";
  if (hasta) hasta.value = "";
  if (almacen) almacen.value = "";
  _repPagina = 0;
}

// ---- Resumen ejecutivo ----
async function refrescarResumenEjecutivo() {
  const el = document.getElementById("rep-resumen");
  if (!el) return;
  if (!tienePermiso("reportes", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver reportes.</p>';
    return;
  }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión — los reportes requieren datos de Supabase.</p>';
    return;
  }
  el.innerHTML = '<p class="lista-estado">Cargando resumen…</p>';
  const f = leerFiltrosReportes();
  try {
    const { data, error } = await client.rpc("reporte_resumen_ejecutivo", {
      p_desde: f.desde, p_hasta: f.hasta, p_almacen_id: f.almacen,
    });
    if (error) {
      const msg = String(error.message || error.code || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b5-reportes.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderResumenEjecutivo(data);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar el resumen.</p>';
    console.warn("[Battlecruiser] reporte_resumen_ejecutivo:", e);
  }
}

function renderResumenEjecutivo(d) {
  const el = document.getElementById("rep-resumen");
  if (!el || !d) return;
  function card(titulo, valor, sub) {
    return '<div class="resumen-card"><div class="valor">' + escHtml(String(valor)) + '</div><div class="etiqueta">' + escHtml(titulo) + '</div>' + (sub ? '<div class="muted">' + escHtml(sub) + '</div>' : '') + '</div>';
  }
  const v = d.ventas || {}, t = d.transferencias || {}, va = d.vales || {}, inv = d.inventario || {}, comp = d.compras || {}, mar = d.margen || {};
  el.innerHTML =
    card("Ventas", v.cantidad || 0, "$" + money(v.ingresos || 0) + " · ticket $" + money(v.ticket_promedio || 0)) +
    card("Unidades vendidas", v.unidades || 0) +
    card("Transferencias", t.cantidad || 0, (t.unidades || 0) + " unidades") +
    card("Vales", va.cantidad || 0, (va.unidades || 0) + " unidades") +
    card("Productos en stock", inv.productos || 0, (inv.unidades || 0) + " unidades") +
    card("Stock bajo", inv.stock_bajo || 0) +
    card("Stock agotado", inv.stock_agotado || 0) +
    (comp.disponible === false
      ? '<div class="resumen-card"><div class="valor muted">—</div><div class="etiqueta">Compras</div><div class="muted">' + escHtml(comp.nota || "No disponible") + '</div></div>'
      : card("Compras", comp.lotes || 0, (comp.unidades_compradas || 0) + " u · $" + money(comp.valor_compras || 0))) +
    // Ídem para margen: ahora llega disponible=true con margen_conocido /
    // margen_pct_conocido (calculado solo sobre líneas con costo FIFO real;
    // nunca se asume costo 0 para las que no lo tienen).
    (mar.disponible === false
      ? '<div class="resumen-card"><div class="valor muted">—</div><div class="etiqueta">Margen</div><div class="muted">' + escHtml(mar.nota || "No disponible") + '</div></div>'
      : card("Margen", (mar.margen_pct_conocido != null ? money(mar.margen_pct_conocido) + "%" : "—"), "$" + money(mar.margen_conocido || 0) + (mar.lineas_sin_costo ? " · " + mar.lineas_sin_costo + " línea(s) sin costo excluidas" : "")));
}

// ---- Sub-reportes detallados ----
async function refrescarSubReporte() {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!tienePermiso("reportes", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver reportes.</p>';
    return;
  }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión — los reportes requieren datos de Supabase.</p>';
    return;
  }
  setLoading("rep-detalle", "Cargando reporte…");
  const f = leerFiltrosReportes();
  try {
    let data = null;
    let error = null;
    if (_repSubreporte === "ventas") {
      ({ data, error } = await client.rpc("reporte_ventas", {
        p_desde: f.desde, p_hasta: f.hasta, p_almacen_id: f.almacen, p_producto_id: null,
        p_limite: _REP_POR_PAG, p_offset: _repPagina * _REP_POR_PAG,
      }));
      if (!error) renderVentas(data);
    } else if (_repSubreporte === "transferencias") {
      ({ data, error } = await client.rpc("reporte_transferencias", {
        p_desde: f.desde, p_hasta: f.hasta, p_origen_id: f.almacen, p_destino_id: null, p_estado: null,
        p_limite: _REP_POR_PAG, p_offset: _repPagina * _REP_POR_PAG,
      }));
      if (!error) renderTransferencias(data);
    } else if (_repSubreporte === "vales") {
      ({ data, error } = await client.rpc("reporte_vales", {
        p_desde: f.desde, p_hasta: f.hasta, p_almacen_id: f.almacen, p_tipo: null,
        p_limite: _REP_POR_PAG, p_offset: _repPagina * _REP_POR_PAG,
      }));
      if (!error) renderVales(data);
    } else if (_repSubreporte === "stock") {
      ({ data, error } = await client.rpc("reporte_stock", {
        p_almacen_id: f.almacen, p_categoria_id: null,
      }));
      if (!error) renderStockReporte(data);
    } else if (_repSubreporte === "movimiento") {
      ({ data, error } = await client.rpc("reporte_movimiento_inventario", {
        p_desde: f.desde, p_hasta: f.hasta, p_producto_id: null, p_almacen_id: f.almacen,
        p_limite: _REP_POR_PAG, p_offset: _repPagina * _REP_POR_PAG,
      }));
      if (!error) renderMovimiento(data);
    } else if (_repSubreporte === "compras") {
      ({ data, error } = await client.rpc("historial_compras", {
        p_desde: f.desde, p_hasta: f.hasta, p_almacen_id: f.almacen,
        p_limite: _REP_POR_PAG, p_offset: _repPagina * _REP_POR_PAG,
      }));
      if (!error) renderCompras(data);
    } else if (_repSubreporte === "rentabilidad") {
      ({ data, error } = await client.rpc("rentabilidad_ventas", {
        p_desde: f.desde, p_hasta: f.hasta, p_almacen_id: f.almacen,
        p_limite: _REP_POR_PAG, p_offset: _repPagina * _REP_POR_PAG,
      }));
      if (!error) renderRentabilidad(data);
    }
    if (error) {
      const msg = String(error.message || error.code || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b5-reportes.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderPaginacionReporte(data ? data.length : 0);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar el reporte.</p>';
    console.warn("[Battlecruiser] reporte " + _repSubreporte + ":", e);
  }
}

function renderVentas(filas) {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) { el.innerHTML = '<p class="lista-estado">Sin ventas en el período.</p>'; return; }
  el.innerHTML = "";
  filas.forEach((v) => {
    const div = document.createElement("div");
    div.className = "rep-fila";
    const fecha = v.fecha ? fechaHoraReporte(v.fecha) : "—";
    let lineasHtml = "";
    if (Array.isArray(v.lineas)) {
      lineasHtml = v.lineas.map((l) => '<div class="muted rep-linea">' + escHtml(l.producto || "—") + " · " + (l.cantidad || 0) + " u · $" + money(l.precio_unitario || 0) + " = $" + money(l.subtotal || 0) + "</div>").join("");
    }
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(v.almacen || "—") + '</span><span class="muted">' + fecha + ' · Total $' + money(v.total || 0) + '</span>' + lineasHtml + '</span>';
    el.appendChild(div);
  });
}

function renderTransferencias(filas) {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) { el.innerHTML = '<p class="lista-estado">Sin transferencias en el período.</p>'; return; }
  el.innerHTML = "";
  filas.forEach((t) => {
    const div = document.createElement("div");
    div.className = "rep-fila";
    const fecha = t.fecha ? fechaHoraReporte(t.fecha) : "—";
    let lineasHtml = "";
    if (Array.isArray(t.lineas)) {
      lineasHtml = t.lineas.map((l) => '<div class="muted rep-linea">' + escHtml(l.producto || "—") + " · " + (l.cantidad || 0) + " u</div>").join("");
    }
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(t.origen || "—") + ' → ' + escHtml(t.destino || "—") + '</span><span class="muted">' + fecha + ' · ' + escHtml(t.estado || "") + ' · ' + (t.unidades || 0) + ' u</span>' + lineasHtml + '</span>';
    el.appendChild(div);
  });
}

function renderVales(filas) {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) { el.innerHTML = '<p class="lista-estado">Sin vales en el período.</p>'; return; }
  el.innerHTML = "";
  filas.forEach((va) => {
    const div = document.createElement("div");
    div.className = "rep-fila";
    const fecha = va.fecha ? fechaHoraReporte(va.fecha) : "—";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(va.tipo || "—") + '</span><span class="muted">' + escHtml(va.producto || "—") + ' · ' + escHtml(va.almacen || "—") + ' · ' + (va.cantidad || 0) + ' u · ' + fecha + '</span></span>';
    el.appendChild(div);
  });
}

function renderStockReporte(filas) {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) { el.innerHTML = '<p class="lista-estado">Sin datos de stock.</p>'; return; }
  el.innerHTML = "";
  filas.forEach((s) => {
    const div = document.createElement("div");
    div.className = "rep-fila rep-estado-" + (s.estado || "normal");
    const icono = s.estado === "agotado" ? "🔴" : s.estado === "bajo" ? "🟡" : "🟢";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + icono + ' ' + escHtml(s.producto || "—") + '</span><span class="muted">' + escHtml(s.almacen || "—") + ' · ' + escHtml(s.categoria || "") + ' · ' + (s.cantidad || 0) + ' u (mín: ' + (s.minimo != null ? s.minimo : "—") + ')</span></span>';
    el.appendChild(div);
  });
}

function renderMovimiento(filas) {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) { el.innerHTML = '<p class="lista-estado">Sin movimientos en el período.</p>'; return; }
  el.innerHTML = "";
  filas.forEach((m) => {
    const div = document.createElement("div");
    div.className = "rep-fila rep-dir-" + (m.direccion || "");
    const fecha = m.fecha ? fechaHoraReporte(m.fecha) : "—";
    const icono = m.direccion === "entrada" ? "⬆️" : "⬇️";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + icono + ' ' + escHtml(m.tipo || "—") + '</span><span class="muted">' + escHtml(m.producto || "—") + ' · ' + escHtml(m.almacen || "—") + ' · ' + (m.cantidad || 0) + ' u · ' + fecha + '</span></span>';
    el.appendChild(div);
  });
}

function renderCompras(filas) {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) { el.innerHTML = '<p class="lista-estado">Sin compras en el período.</p>'; return; }
  el.innerHTML = "";
  const ESTADO_TXT = {
    disponible: "Disponible",
    parcial: "Parcial",
    agotado: "Agotado",
    inconsistente: "Inconsistente",
  };
  filas.forEach((c) => {
    const div = document.createElement("div");
    div.className = "rep-fila";
    const fecha = c.fecha_compra ? fechaHoraReporte(c.fecha_compra) : "—";
    const estadoTxt = ESTADO_TXT[c.estado] || c.estado || "—";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(c.producto || "—") + '</span><span class="muted">' + escHtml(c.almacen || "—") + ' · ' + fecha + ' · ' + (c.cantidad_restante ?? 0) + '/' + (c.cantidad_inicial ?? 0) + ' u (' + escHtml(estadoTxt) + ') · Costo unit. $' + money(c.costo_unitario || 0) + ' · Total $' + money(c.costo_total || 0) + '</span></span>';
    el.appendChild(div);
  });
}

function renderRentabilidad(filas) {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) { el.innerHTML = '<p class="lista-estado">Sin datos de rentabilidad.</p>'; return; }
  let totalIng = 0, totalCmv = 0;
  let hayCostoAlguno = false;
  el.innerHTML = "";
  filas.forEach((r) => {
    const ingresos = Number(r.ingreso || 0);
    totalIng += ingresos;
    const costoDisponible = r.costo_disponible === true;
    let gan, margen, cmvTxt, ganTxt, margenTxt;
    if (costoDisponible) {
      const cmvNum = Number(r.costo_total || 0);
      totalCmv += cmvNum;
      hayCostoAlguno = true;
      gan = Number(r.margen);
      if (!Number.isFinite(gan)) gan = ingresos - cmvNum;
      const margenNum = Number(r.margen_porcentaje);
      margen = Number.isFinite(margenNum) && r.margen_porcentaje !== null && r.margen_porcentaje !== undefined
        ? margenNum
        : (ingresos > 0 ? (gan / ingresos * 100) : 0);
      cmvTxt = "$" + money(cmvNum);
      ganTxt = "$" + money(gan);
      margenTxt = money(margen) + "%";
    } else {
      // Sin costo real (costo_disponible=false): no inventar CMV 0, ganancia ni margen.
      cmvTxt = "costo no disponible";
      ganTxt = "—";
      margenTxt = "—";
    }
    const div = document.createElement("div");
    div.className = "rep-fila";
    const fecha = r.fecha ? fechaHoraReporte(r.fecha) : "—";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(r.almacen || "—") + '</span><span class="muted">' + fecha + ' · Ing $' + money(ingresos) + ' · CMV ' + escHtml(cmvTxt) + ' · <b>Gan ' + escHtml(ganTxt) + '</b> (' + escHtml(margenTxt) + ')</span></span>';
    el.appendChild(div);
  });
  // Totales al pie: solo se calculan sobre las ventas con costo disponible.
  // Si ninguna venta tuvo costo, el total no inventa margen: lo deja sin costo.
  const tot = document.createElement("div");
  tot.className = "rep-fila rep-totales";
  let totCmvTxt, totGanTxt, totMargenTxt;
  if (hayCostoAlguno) {
    const totGan = totalIng - totalCmv;
    const totMargen = totalIng > 0 ? (totGan / totalIng * 100) : 0;
    totCmvTxt = "$" + money(totalCmv);
    totGanTxt = "$" + money(totGan);
    totMargenTxt = money(totMargen) + "%";
  } else {
    totCmvTxt = "costo no disponible";
    totGanTxt = "—";
    totMargenTxt = "—";
  }
  tot.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">TOTALES</span><span class="muted">Ing $' + money(totalIng) + ' · CMV ' + escHtml(totCmvTxt) + ' · <b>Gan ' + escHtml(totGanTxt) + '</b> (' + escHtml(totMargenTxt) + ')</span></span>';
  el.appendChild(tot);
}

function renderPaginacionReporte(cargadas) {
  const el = document.getElementById("rep-paginacion");
  if (!el) return;
  el.innerHTML = "";
  if (_repPagina > 0) {
    const ant = document.createElement("button");
    ant.type = "button"; ant.className = "cc-accion"; ant.textContent = "← Anterior";
    ant.addEventListener("click", () => { _repPagina--; refrescarSubReporte(); });
    el.appendChild(ant);
  }
  const span = document.createElement("span");
  span.className = "muted"; span.textContent = "Página " + (_repPagina + 1);
  el.appendChild(span);
  if (cargadas >= _REP_POR_PAG) {
    const sig = document.createElement("button");
    sig.type = "button"; sig.className = "cc-accion"; sig.textContent = "Siguiente →";
    sig.addEventListener("click", () => { _repPagina++; refrescarSubReporte(); });
    el.appendChild(sig);
  }
}

// Orquestador: carga resumen + sub-reporte. Un solo refresco consolidado.
async function refrescarReportes() {
  if (!appShell || !appShell.classList.contains("visible")) return;
  poblarFiltrosReportes();
  const conn = document.getElementById("reportes-conn-info");
  if (conn) {
    conn.textContent = estaRealmenteDesconectado() ? "⚪ Sin conexión — datos no disponibles" : "🟢 Datos de Supabase";
  }
  await refrescarResumenEjecutivo();
  await refrescarSubReporte();
}

safeInit("reportes-init", () => {
  poblarFiltrosReportes();
  const aplicar = document.getElementById("rep-aplicar-btn");
  if (aplicar) aplicar.addEventListener("click", () => { _repPagina = 0; refrescarReportes(); });
  const limpiar = document.getElementById("rep-limpiar-btn");
  if (limpiar) limpiar.addEventListener("click", () => { limpiarFiltrosReportes(); refrescarReportes(); });
  // Sub-reportes (tabs internos).
  document.querySelectorAll(".rep-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".rep-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      _repSubreporte = btn.dataset.rep;
      _repPagina = 0;
      refrescarSubReporte();
    });
  });
});

// Cargar todo cuando se confirma sesión real (se engancha a showApp existente)
const _showAppOriginal = showApp;
showApp = function (session) {
  _showAppOriginal(session);
  safeInit("carga-inicial-productos", () => { refrescarProductos(); });
  safeInit("carga-inicial-almacenes", () => { refrescarAlmacenes().then(refrescarStockYSelects); });
  safeInit("carga-inicial-transferencias", () => { refrescarTransferencias(); });
  safeInit("carga-inicial-vales", () => { refrescarVales(); });
  safeInit("carga-inicial-ventas", () => { refrescarVentas(); });
  safeInit("carga-inicial-config", () => {
    ["categorias", "unidades"].forEach((tabla) => {
      const refrescar = window["_refrescarCatalogo_" + tabla];
      if (refrescar) refrescar();
    });
  });
  safeInit("carga-inicial-presentaciones", () => { inicializarPresentaciones(); });
  safeInit("cola-offline-arranque", () => {
    (async () => {
      await recuperarOperacionesAtrapadas();
      await actualizarContadorColaPendiente();
      await refrescarOperacionesPendientesCache();
      // refrescarPanelPendientes() no se llama aca: va despues de
      if (typeof refrescarCentroControl === "function") refrescarCentroControl();
      // B4: refrescar también el Centro de Mando al iniciar.
      if (typeof refrescarCentroMando === "function") refrescarCentroMando();
      // B7: cargar el turno actual del usuario al iniciar (si hay permiso).
      if (typeof refrescarTurnoActual === "function") refrescarTurnoActual();
      // B8: actualizar el badge de mensajes no leídos al iniciar.
      if (typeof actualizarBadgeNoLeidos === "function") actualizarBadgeNoLeidos();
      if (navigator.onLine) await sincronizarCola();
    })();
  });
};

async function refrescarTrasReconexion() {
  actualizarIndicadorConexion("reconectando");
  try {
    await refrescarStockYSelects(); // productos + categorías + almacenes + stock
    await Promise.all([
      refrescarTransferencias(),
      refrescarVales(),
      refrescarVentas(),
    ]);
    ["categorias", "unidades"].forEach((tabla) => {
      const refrescar = window["_refrescarCatalogo_" + tabla];
      if (refrescar) refrescar();
    });
    if (document.querySelector(".presentaciones-panel")) {
      await inicializarPresentaciones();
      const ppSel = document.getElementById("pp-producto-select");
      if (ppSel && ppSel.value) await refrescarAsociacionesProducto(ppSel.value);
    }
  } catch (e) {
    console.warn("[Battlecruiser] Error al refrescar tras reconexión:", e);
  }
  await refrescarPanelPendientes();
  // activo pueden haber cambiado en el backend mientras estuvimos sin
  // conexión). Reutiliza cargarContextoUsuario (una sola fuente).
  if (typeof cargarContextoUsuario === "function") await cargarContextoUsuario();
  // B4: tras reconectar, refrescar el Centro de Mando (estado/auditoría).
  if (typeof refrescarCentroMando === "function") refrescarCentroMando();
  // B7: tras reconectar, refrescar el turno actual del usuario.
  if (typeof refrescarTurnoActual === "function") refrescarTurnoActual();
  // B8: tras reconectar, actualizar el badge de mensajes no leídos.
  if (typeof actualizarBadgeNoLeidos === "function") actualizarBadgeNoLeidos();
  actualizarIndicadorConexion();
}

