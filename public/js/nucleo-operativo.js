// ==== Battlecruiser · js/nucleo-operativo.js ====
// B6 — Núcleo operativo: inventario enriquecido, movimientos e indicadores en el Centro de Mando.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

// ---- B6 — NÚCLEO OPERATIVO + INVENTARIO INTELIGENTE
let _invFiltroEstado = "todos"; // todos | bajo | agotado | normal
let _invFilas = []; // filas del ultimo inventario cargado (en memoria)

// ---- B6: pestaña Inventario (enriquecido) ----
async function refrescarInventario() {
  const el = document.getElementById("inv-detalle");
  const resumen = document.getElementById("inv-resumen");
  const conn = document.getElementById("inv-conn-info");
  if (!el || !appShell || !appShell.classList.contains("visible")) return;
  if (!tienePermiso("reportes", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver inventario.</p>';
    if (resumen) resumen.innerHTML = "";
    return;
  }
  if (!navigator.onLine) {
    if (conn) conn.textContent = "\u26aa Sin conexión — datos no disponibles";
    el.innerHTML = '<p class="lista-estado">\u26aa Sin conexión — el inventario enriquecido requiere datos de Supabase.</p>';
    if (resumen) resumen.innerHTML = '<p class="muted">Sin conexión.</p>';
    return;
  }
  if (conn) conn.textContent = "\ud83d\udfe2 Datos de Supabase";
  setLoading("inv-detalle", "Cargando inventario…");
  if (resumen) resumen.innerHTML = "";
  // Poblar el select de almacenes con _cache (sin consulta nueva).
  const sel = document.getElementById("inv-filtro-almacen");
  poblarSelectAlmacenes(sel);
  const almacen = sel ? (sel.value || null) : null;
  try {
    const { data, error } = await client.rpc("inventario_enriquecido", { p_almacen_id: almacen });
    if (error) {
      const msg = String(error.message || error.code || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b6-nucleo-operativo.sql en Supabase (función inventario_enriquecido).</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    _invFilas = data || [];
    renderInventario(_invFilas);
  } catch (e) {
    _invFilas = [];
    el.innerHTML = '<p class="lista-estado">Error al cargar el inventario.</p>';
    console.warn("[Battlecruiser] inventario_enriquecido:", e);
  }
}

function renderInventario(filas) {
  const el = document.getElementById("inv-detalle");
  const resumen = document.getElementById("inv-resumen");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin datos de inventario.</p>';
    if (resumen) resumen.innerHTML = "";
    return;
  }
  // Totales/valoracion sobre TODAS las filas (estables, no dependen del filtro).
  let totalValor = 0, totalUnidades = 0, agotados = 0, bajos = 0;
  filas.forEach((s) => {
    totalValor += Number(s.valor_inventario || 0);
    totalUnidades += Number(s.cantidad || 0);
    if (s.estado === "agotado") agotados++;
    else if (s.estado === "bajo") bajos++;
  });
  // Trabaja sobre los datos ya cargados (sin consultas nuevas).
  const filtradas = (_invFiltroEstado === "todos")
    ? filas
    : filas.filter((s) => {
        if (_invFiltroEstado === "agotado") return s.estado === "agotado";
        if (_invFiltroEstado === "bajo") return s.estado === "bajo";
        if (_invFiltroEstado === "normal") return s.estado !== "agotado" && s.estado !== "bajo";
        return true;
      });
  el.innerHTML = "";
  if (filtradas.length === 0) {
    const etiqueta = { bajo: "bajo mínimo", agotado: "agotados", normal: "normales" }[_invFiltroEstado] || "";
    el.innerHTML = '<p class="lista-estado">No hay productos ' + escHtml(etiqueta) + ' con el filtro actual.</p>';
  } else {
    filtradas.forEach((s) => {
      const valor = Number(s.valor_inventario || 0);
      const div = document.createElement("div");
      div.className = "rep-fila rep-estado-" + (s.estado || "normal");
      const icono = s.estado === "agotado" ? "\ud83d\udd34" : s.estado === "bajo" ? "\ud83d\udfe1" : "\ud83d\udfe2";
      // inventario_enriquecido usa COALESCE(..., 0) en el backend:
      const costoTxt = valor > 0 ? "$" + money(s.costo_promedio || 0) : "\u2014";
      const valorTxt = valor > 0 ? "$" + money(valor) : "\u2014";
      div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + icono + " " + escHtml(s.producto || "\u2014") + '</span><span class="muted">' + escHtml(s.almacen || "\u2014") + " \u00b7 " + (s.cantidad || 0) + " u (m\u00edn: " + (s.minimo != null ? s.minimo : "\u2014") + ') \u00b7 costo prom ' + costoTxt + " \u00b7 valor " + valorTxt + "</span></span>";
      el.appendChild(div);
    });
  }
  if (resumen) {
    function card(t, v, sub) {
      return '<div class="resumen-card"><div class="valor">' + escHtml(String(v)) + '</div><div class="etiqueta">' + escHtml(t) + "</div>" + (sub ? '<div class="muted">' + escHtml(sub) + "</div>" : "") + "</div>";
    }
    resumen.innerHTML =
      card("Valor inventario", "$" + money(totalValor)) +
      card("Unidades", totalUnidades) +
      card("Agotados", agotados, "\ud83d\udd34") +
      card("Stock bajo", bajos, "\ud83d\udfe1");
  }
}

// ---- B6: pestaña Movimientos ----
// Usa movimientos_producto (RPC B6). Fuente única de trazabilidad.
let _movPagina = 0;
const _MOV_POR_PAG = 50;

async function refrescarMovimientos() {
  const el = document.getElementById("mov-detalle");
  const conn = document.getElementById("mov-conn-info");
  if (!el || !appShell || !appShell.classList.contains("visible")) return;
  if (!tienePermiso("reportes", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver movimientos.</p>';
    return;
  }
  if (!navigator.onLine) {
    if (conn) conn.textContent = "\u26aa Sin conexión — datos no disponibles";
    el.innerHTML = '<p class="lista-estado">\u26aa Sin conexión — los movimientos requieren datos de Supabase.</p>';
    return;
  }
  if (conn) conn.textContent = "\ud83d\udfe2 Datos de Supabase";
  setLoading("mov-detalle", "Cargando movimientos…");
  const sel = document.getElementById("mov-filtro-almacen");
  poblarSelectAlmacenes(sel);
  const desde = document.getElementById("mov-filtro-desde");
  const hasta = document.getElementById("mov-filtro-hasta");
  const tipo = document.getElementById("mov-filtro-tipo");
  const f = {
    desde: desde && desde.value ? desde.value : null,
    hasta: hasta && hasta.value ? hasta.value : null,
    almacen: sel ? (sel.value || null) : null,
    tipo: tipo ? (tipo.value || null) : null,
  };
  try {
    const { data, error } = await client.rpc("movimientos_producto", {
      p_producto_id: null, p_almacen_id: f.almacen,
      p_desde: f.desde, p_hasta: f.hasta, p_tipo: f.tipo,
      p_limite: _MOV_POR_PAG, p_offset: _movPagina * _MOV_POR_PAG,
    });
    if (error) {
      const msg = String(error.message || error.code || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b6-nucleo-operativo.sql en Supabase (función movimientos_producto).</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderMovimientos(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar movimientos.</p>';
    console.warn("[Battlecruiser] movimientos_producto:", e);
  }
}

function renderMovimientos(filas) {
  const el = document.getElementById("mov-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin movimientos en el per\u00edodo.</p>';
    return;
  }
  el.innerHTML = "";
  filas.forEach((m) => {
    const div = document.createElement("div");
    div.className = "rep-fila";
    const fecha = m.fecha ? fechaHora(m.fecha) : "\u2014";
    const entrada = Number(m.cantidad) > 0;
    const icono = entrada ? "\u2b06\ufe0f" : "\u2b07\ufe0f";
    const costo = m.costo_unitario != null ? " \u00b7 $" + money(m.costo_unitario) + " c/u" : "";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + icono + " " + escHtml(m.tipo || "\u2014") + '</span><span class="muted">' + escHtml(m.producto || "\u2014") + " \u00b7 " + escHtml(m.almacen || "\u2014") + " \u00b7 " + (m.cantidad || 0) + " u" + costo + " \u00b7 " + escHtml(m.usuario || "\u2014") + " \u00b7 " + fecha + "</span></span>";
    el.appendChild(div);
  });
  // Paginación simple.
  const pag = document.getElementById("mov-paginacion");
  if (pag) {
    pag.innerHTML = "";
    if (_movPagina > 0) {
      const ant = document.createElement("button");
      ant.type = "button"; ant.className = "cc-accion"; ant.textContent = "\u2190 Anterior";
      ant.addEventListener("click", () => { _movPagina--; refrescarMovimientos(); });
      pag.appendChild(ant);
    }
    const span = document.createElement("span");
    span.className = "muted"; span.textContent = "P\u00e1gina " + (_movPagina + 1);
    pag.appendChild(span);
    if (filas.length >= _MOV_POR_PAG) {
      const sig = document.createElement("button");
      sig.type = "button"; sig.className = "cc-accion"; sig.textContent = "Siguiente \u2192";
      sig.addEventListener("click", () => { _movPagina++; refrescarMovimientos(); });
      pag.appendChild(sig);
    }
  }
}

// ---- B6: indicadores de inventario en el Centro de Mando ----
// Añade productos agotados y stock bajo al panel de alertas del Centro de
// Mando, reutilizando _cache.stock (sin consulta nueva). No inventa datos.
function construirAlertasInventarioB6() {
  const alertas = [];
  (_cache.stock || []).forEach((s) => {
    const cant = Number(s.cantidad);
    if (s.minimo != null && cant <= Number(s.minimo) && cant > 0) {
      const prod = (_cache.productos || []).find((p) => p.id === s.producto_id);
      const alm = (_cache.almacenes || []).find((a) => a.id === s.almacen_id);
      alertas.push({
        nivel: "atencion",
        tipo: "Stock bajo",
        texto: escHtml((prod && prod.nombre) || "Producto") + " \u00b7 " + escHtml((alm && alm.nombre) || "\u2014") + " \u00b7 " + cant + " u (m\u00edn " + s.minimo + ")",
        op: null,
      });
    } else if (cant <= 0) {
      const prod = (_cache.productos || []).find((p) => p.id === s.producto_id);
      const alm = (_cache.almacenes || []).find((a) => a.id === s.almacen_id);
      alertas.push({
        nivel: "critico",
        tipo: "Producto agotado",
        texto: escHtml((prod && prod.nombre) || "Producto") + " \u00b7 " + escHtml((alm && alm.nombre) || "\u2014"),
        op: null,
      });
    }
  });
  return alertas;
}

// Hook: integrar las alertas de inventario B6 en el Centro de Mando.
// Se llama desde refrescarCentroMando (B4). Las alertas de inventario
// se mezclan con las de operaciones existentes, priorizadas igual.
function construirAlertasMandoCompleto(ops) {
  const ops_alertas = (typeof construirAlertasMando === "function") ? construirAlertasMando(ops) : [];
  const inv_alertas = construirAlertasInventarioB6();
  return ops_alertas.concat(inv_alertas).sort((a, b) => {
    const orden = { critico: 0, atencion: 1, normal: 2 };
    return (orden[a.nivel] != null ? orden[a.nivel] : 3) - (orden[b.nivel] != null ? orden[b.nivel] : 3);
  });
}

// Inicialización de las pestañas Inventario y Movimientos.
safeInit("b6-inventario", () => {
  const refrescar = document.getElementById("inv-refrescar-btn");
  if (refrescar) refrescar.addEventListener("click", () => refrescarInventario());

  // en memoria (_invFilas) sin consultas nuevas. Reutiliza renderInventario().
  const contFiltros = document.getElementById("inv-filtro-estado");
  if (contFiltros) {
    contFiltros.addEventListener("click", (e) => {
      const btn = e.target.closest(".inv-estado-btn");
      if (!btn) return;
      _invFiltroEstado = btn.dataset.estado || "todos";
      // Marcar el boton activo.
      contFiltros.querySelectorAll(".inv-estado-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      // Reutilizar las filas en memoria; si no hay, no hace nada (renderInventario
      // ya muestra "Sin datos"). Actualiza inmediatamente la vista.
      renderInventario(_invFilas);
    });
  }
});
safeInit("b6-movimientos", () => {
  const refrescar = document.getElementById("mov-refrescar-btn");
  if (refrescar) refrescar.addEventListener("click", () => { _movPagina = 0; refrescarMovimientos(); });
});

