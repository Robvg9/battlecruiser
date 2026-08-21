// ==== Battlecruiser · js/ciclos.js ====
// M15 / M16 / M17 — Ciclos operativos + entregas de caja + cierre de ciclo.
// Módulo independiente (no monolito). Scope global, se carga como <script> clásico.
//
// Fuente de verdad: BATTLECRUISER_CEREBRO.md
// Contratos RPC: supabase/m15_*.sql, m16_entregas_caja.sql, m17_*.sql
//
// PROHIBIDO: registrar_conteo_entrega_caja (legado/huérfana).
// Vigente para DECLARADA→CONTADA: registrar_recepcion_entrega_caja.
//
// V1 MUTACIONES: online-only. NO toca offline.js / ejecutarOperacion / sincronizarCola.
//
// Misión 4.2: loading siempre con salida (timeout + finally + mensajes seguros).

// ---------------------------------------------------------------------------
// Estado en memoria del módulo (no IndexedDB propio; no cola paralela)
// ---------------------------------------------------------------------------
let _cicloActualId = null;
let _ciclosCache = [];
let _entregasCache = [];
let _cicloDetalleActual = null;

const CICLOS_RPC_TIMEOUT_MS = 25000;

// ---------------------------------------------------------------------------
// Mapa RPC — contratos backend existentes (NO inventar firmas)
// ---------------------------------------------------------------------------
const CICLOS_RPC_LECTURA = {
  listar: "listar_ciclos_operativos",
  obtener: "obtener_ciclo_operativo",
  listarEntregas: "listar_entregas_caja",
  obtenerEntrega: "obtener_entrega_caja",
  pendientesCierre: "obtener_pendientes_cierre_ciclo",
};

const CICLOS_RPC_MUTACION = {
  crear: "crear_ciclo_operativo",
  iniciar: "iniciar_ciclo_operativo",
  iniciarValidacion: "iniciar_validacion_ciclo_operativo",
  declararEntrega: "declarar_entrega_caja",
  recepcionEntrega: "registrar_recepcion_entrega_caja",
  revisarEntrega: "revisar_entrega_caja",
  finalizar: "finalizar_ciclo_operativo",
};

// ---------------------------------------------------------------------------
// Helpers UI seguros (setMsg del proyecto no null-checkea el elemento)
// ---------------------------------------------------------------------------
function ciclosSetMsg(id, text, ok) {
  try {
    if (typeof setMsg === "function") {
      const el = document.getElementById(id);
      if (!el) {
        console.warn("[Battlecruiser] ciclosSetMsg: falta #" + id);
        return;
      }
      setMsg(id, text, ok);
      return;
    }
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text;
      el.className = "msg " + (ok ? "ok" : "error");
    }
  } catch (e) {
    console.warn("[Battlecruiser] ciclosSetMsg:", e);
  }
}

function ciclosForzarHideLoading() {
  try {
    if (typeof hideLoading === "function") hideLoading();
  } catch (e) {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Online obligatorio (V1) — no encola
// ---------------------------------------------------------------------------
function ciclosRequiereOnline(msgId) {
  if (typeof estaRealmenteDesconectado === "function" && estaRealmenteDesconectado()) {
    if (msgId) ciclosSetMsg(msgId, "Sin conexión. Las operaciones de ciclos y caja requieren Internet.", false);
    return false;
  }
  if (!navigator.onLine) {
    if (msgId) ciclosSetMsg(msgId, "Sin conexión. Las operaciones de ciclos y caja requieren Internet.", false);
    return false;
  }
  return true;
}

function ciclosNuevaIdempotencyKey() {
  return crypto.randomUUID();
}

function ciclosExplicarError(error, contexto) {
  if (typeof explicarError === "function") return explicarError(error, contexto);
  return String((error && (error.message || error.code)) || error || "error desconocido");
}

function ciclosNormalizarData(data) {
  if (data == null) return null;
  if (Array.isArray(data)) return data[0] || null;
  return data;
}

// ---------------------------------------------------------------------------
// Mutación genérica online-only — loading SIEMPRE sale (finally + timeout)
// ---------------------------------------------------------------------------
async function ciclosMutar(rpcNombre, payload, msgId) {
  if (!ciclosRequiereOnline(msgId || "msg-ciclos")) {
    return { ok: false, offline: true };
  }
  const key = ciclosNuevaIdempotencyKey();
  const params = Object.assign({}, payload, { p_idempotency_key: key });

  let loadingShown = false;
  try {
    if (typeof showLoading === "function") {
      showLoading();
      loadingShown = true;
    }

    const rpcCall = client.rpc(rpcNombre, params);
    let timeoutId = null;
    const timeoutPromise = new Promise(function (_, reject) {
      timeoutId = setTimeout(function () {
        reject(new Error("Tiempo de espera agotado (" + Math.round(CICLOS_RPC_TIMEOUT_MS / 1000) + "s). Revisá la conexión e intentá de nuevo."));
      }, CICLOS_RPC_TIMEOUT_MS);
    });

    let result;
    try {
      result = await Promise.race([rpcCall, timeoutPromise]);
    } finally {
      if (timeoutId != null) clearTimeout(timeoutId);
    }

    if (result && result.error) {
      return { ok: false, error: result.error };
    }
    return { ok: true, data: ciclosNormalizarData(result && result.data) };
  } catch (e) {
    return { ok: false, error: e };
  } finally {
    if (loadingShown) ciclosForzarHideLoading();
  }
}

// ---------------------------------------------------------------------------
// Orquestador de pestaña
// ---------------------------------------------------------------------------
async function refrescarCiclos() {
  if (!appShell || !appShell.classList.contains("visible")) return;

  const conn = document.getElementById("ciclos-conn-info");
  if (conn) {
    conn.textContent =
      typeof estaRealmenteDesconectado === "function" && estaRealmenteDesconectado()
        ? "⚪ Sin conexión"
        : "🟢 Conectado";
  }

  if (!tienePermiso("ciclos", "ver")) {
    setEmpty("lista-ciclos", "No tenés permiso para ver ciclos operativos.");
    const det = document.getElementById("ciclo-detalle");
    if (det) det.innerHTML = "";
    return;
  }

  const selAlm = document.getElementById("ciclo-filtro-almacen");
  if (selAlm && typeof poblarSelectAlmacenes === "function") {
    poblarSelectAlmacenes(selAlm, "Todos los almacenes");
  }

  renderFormCrearCiclo();
  await refrescarListaCiclos();
}

function renderFormCrearCiclo() {
  let wrap = document.getElementById("ciclos-crear-wrap");
  if (!wrap) {
    const lista = document.getElementById("lista-ciclos");
    if (!lista || !lista.parentElement) return;
    wrap = document.createElement("div");
    wrap.id = "ciclos-crear-wrap";
    wrap.className = "cc-bloque";
    lista.parentElement.insertBefore(wrap, lista);
  }

  if (!tienePermiso("ciclos", "crear")) {
    wrap.innerHTML = "";
    wrap.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");

  const almacenes = ((_cache && _cache.almacenes) || []).filter(function (a) {
    return a.activo !== false;
  });
  let opts = '<option value="">Elegí almacén…</option>';
  almacenes.forEach(function (a) {
    opts += '<option value="' + escHtml(a.id) + '">' + escHtml(a.nombre || a.id) + "</option>";
  });

  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  const dd = String(hoy.getDate()).padStart(2, "0");
  const hoyStr = yyyy + "-" + mm + "-" + dd;

  wrap.innerHTML =
    "<h3>Crear ciclo operativo</h3>" +
    '<form id="form-crear-ciclo" class="inline-form">' +
    '<select id="ciclo-nuevo-almacen" required>' + opts + "</select>" +
    '<label class="muted">Inicio <input type="date" id="ciclo-nuevo-inicio" required value="' + hoyStr + '"></label>' +
    '<input id="ciclo-nuevo-dias" type="number" min="1" max="31" step="1" value="1" placeholder="Días (1–31)" required>' +
    '<button type="submit" class="cc-accion" id="btn-crear-ciclo">Crear ciclo</button>' +
    "</form>" +
    '<p class="msg" id="msg-ciclo-crear"></p>';
}

async function refrescarListaCiclos() {
  const el = document.getElementById("lista-ciclos");
  if (!el) return;

  if (!tienePermiso("ciclos", "ver")) {
    setEmpty("lista-ciclos", "No tenés permiso para ver ciclos operativos.");
    return;
  }

  if (!navigator.onLine || (typeof estaRealmenteDesconectado === "function" && estaRealmenteDesconectado())) {
    setEmpty("lista-ciclos", "⚪ Sin conexión — el listado de ciclos no está disponible offline.");
    return;
  }

  setLoading("lista-ciclos", "Cargando ciclos…");

  const estadoSel = document.getElementById("ciclo-filtro-estado");
  const almSel = document.getElementById("ciclo-filtro-almacen");
  const p_estado = estadoSel && estadoSel.value ? estadoSel.value : null;
  const p_almacen_id = almSel && almSel.value ? almSel.value : null;

  try {
    const rpcCall = client.rpc(CICLOS_RPC_LECTURA.listar, {
      p_almacen_id: p_almacen_id,
      p_estado: p_estado,
    });
    let timeoutId = null;
    const timeoutPromise = new Promise(function (_, reject) {
      timeoutId = setTimeout(function () {
        reject(new Error("timeout listar ciclos"));
      }, CICLOS_RPC_TIMEOUT_MS);
    });
    let result;
    try {
      result = await Promise.race([rpcCall, timeoutPromise]);
    } finally {
      if (timeoutId != null) clearTimeout(timeoutId);
    }

    const data = result && result.data;
    const error = result && result.error;
    if (error) {
      const msg = String(error.message || error);
      if (typeof esRpcFaltante === "function" && esRpcFaltante(error)) {
        setEmpty("lista-ciclos", "Falta aplicar SQL M15 (ciclos) en Supabase.");
      } else {
        setEmpty("lista-ciclos", "Error: " + (typeof escHtml === "function" ? escHtml(msg) : msg));
      }
      return;
    }
    const filas = Array.isArray(data) ? data : data ? [data] : [];
    _ciclosCache = filas;
    renderListaCiclos(filas);
  } catch (e) {
    setEmpty("lista-ciclos", "Error al cargar ciclos (tiempo de espera o red).");
    console.warn("[Battlecruiser] listar_ciclos_operativos:", e);
  }
}

function renderListaCiclos(filas) {
  const el = document.getElementById("lista-ciclos");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">No hay ciclos operativos con estos filtros.</p>';
    return;
  }
  el.innerHTML = "";
  filas.forEach(function (c) {
    const div = document.createElement("div");
    div.className = "lista-item rep-fila rep-estado-" + String(c.estado || "").toLowerCase();
    div.dataset.cicloId = c.id || "";
    const inicio = c.inicio_plan ? (typeof fechaCorta === "function" ? fechaCorta(c.inicio_plan) : c.inicio_plan) : "—";
    const fin = c.fin_plan ? (typeof fechaCorta === "function" ? fechaCorta(c.fin_plan) : c.fin_plan) : "—";
    const alm = c.almacen_nombre || "—";
    const esc = typeof escHtml === "function" ? escHtml : function (s) { return String(s == null ? "" : s); };
    div.innerHTML =
      '<span class="rep-fila-principal">' +
      '<span class="cc-asunto-tipo">' + esc(c.estado || "—") + "</span>" +
      '<span class="muted">' + esc(alm) + " · " + inicio + " → " + fin +
      " · " + (c.cantidad_dias != null ? c.cantidad_dias + " día(s)" : "") + "</span>" +
      "</span>";
    el.appendChild(div);
  });
}

// ---------------------------------------------------------------------------
// Detalle + mutaciones de estado
// ---------------------------------------------------------------------------
async function mostrarDetalleCiclo(cicloId) {
  const det = document.getElementById("ciclo-detalle");
  if (!det || !cicloId) return;
  if (!ciclosRequiereOnline("msg-ciclos")) {
    det.innerHTML = '<p class="lista-estado">⚪ Sin conexión — detalle no disponible offline.</p>';
    return;
  }
  det.innerHTML = '<p class="lista-estado">Cargando detalle…</p>';
  _cicloActualId = cicloId;
  try {
    const rpcCall = client.rpc(CICLOS_RPC_LECTURA.obtener, { p_ciclo_id: cicloId });
    let timeoutId = null;
    const timeoutPromise = new Promise(function (_, reject) {
      timeoutId = setTimeout(function () {
        reject(new Error("timeout detalle ciclo"));
      }, CICLOS_RPC_TIMEOUT_MS);
    });
    let result;
    try {
      result = await Promise.race([rpcCall, timeoutPromise]);
    } finally {
      if (timeoutId != null) clearTimeout(timeoutId);
    }

    const data = ciclosNormalizarData(result && result.data);
    const error = result && result.error;
    if (error) {
      det.innerHTML = '<p class="lista-estado">Error: ' + (typeof escHtml === "function" ? escHtml(error.message || error) : String(error.message || error)) + "</p>";
      return;
    }
    if (!data) {
      det.innerHTML = '<p class="lista-estado">Ciclo no encontrado.</p>';
      return;
    }
    _cicloDetalleActual = data;
    await cargarYRenderDetalleCompleto(data);
  } catch (e) {
    det.innerHTML = '<p class="lista-estado">Error al cargar el detalle del ciclo (tiempo de espera o red).</p>';
    console.warn("[Battlecruiser] obtener_ciclo_operativo:", e);
  }
}

async function cargarYRenderDetalleCompleto(c) {
  const det = document.getElementById("ciclo-detalle");
  if (!det || !c) return;

  let entregas = [];
  let pendientes = null;
  try {
    const rEnt = await client.rpc(CICLOS_RPC_LECTURA.listarEntregas, { p_ciclo_id: c.id });
    if (!rEnt.error) {
      entregas = Array.isArray(rEnt.data) ? rEnt.data : rEnt.data ? [rEnt.data] : [];
    }
    _entregasCache = entregas;
  } catch (e) {
    console.warn("[Battlecruiser] listar_entregas_caja:", e);
  }

  if (c.estado === "EN_VALIDACION") {
    try {
      const rPen = await client.rpc(CICLOS_RPC_LECTURA.pendientesCierre, { p_ciclo_id: c.id });
      if (!rPen.error) pendientes = rPen.data;
    } catch (e) {
      console.warn("[Battlecruiser] obtener_pendientes_cierre_ciclo:", e);
    }
  }

  renderDetalleCiclo(c, entregas, pendientes);
}

function renderDetalleCiclo(c, entregas, pendientes) {
  const det = document.getElementById("ciclo-detalle");
  if (!det || !c) return;
  const esc = typeof escHtml === "function" ? escHtml : function (s) { return String(s == null ? "" : s); };
  const inicio = c.inicio_plan ? (typeof fechaCorta === "function" ? fechaCorta(c.inicio_plan) : c.inicio_plan) : "—";
  const fin = c.fin_plan ? (typeof fechaCorta === "function" ? fechaCorta(c.fin_plan) : c.fin_plan) : "—";
  const sesiones = Array.isArray(c.sesiones) ? c.sesiones : [];
  let sesHtml = "";
  if (sesiones.length === 0) {
    sesHtml = '<p class="muted">Sin sesiones.</p>';
  } else {
    sesHtml = '<ul class="lista">';
    sesiones.forEach(function (s) {
      sesHtml +=
        '<li class="muted">Día ' + esc(s.dia_n) + " · " + esc(s.bloque) +
        " · " + esc(s.fecha || "") + " · " + esc(s.estado || "") + "</li>";
    });
    sesHtml += "</ul>";
  }

  let accionesHtml = '<div class="btn-row" id="ciclo-acciones" style="margin:10px 0;flex-wrap:wrap;gap:8px;">';
  if (c.estado === "PLANIFICADO" && tienePermiso("ciclos", "editar")) {
    accionesHtml += '<button type="button" class="cc-accion" id="btn-iniciar-ciclo" data-id="' + esc(c.id) + '">Iniciar ciclo (→ ACTIVO)</button>';
  }
  if (c.estado === "ACTIVO" && tienePermiso("ciclos", "editar")) {
    accionesHtml += '<button type="button" class="cc-accion" id="btn-iniciar-validacion" data-id="' + esc(c.id) + '">Pasar a validación (→ EN_VALIDACION)</button>';
  }
  if (c.estado === "EN_VALIDACION" && tienePermiso("ciclos", "editar_any")) {
    const puede = pendientes && pendientes.puede_finalizar === true;
    const nEnt = pendientes && pendientes.entregas_pendientes
      ? (Array.isArray(pendientes.entregas_pendientes) ? pendientes.entregas_pendientes.length : 0)
      : "?";
    const nCua = pendientes && pendientes.cuadres_pendientes
      ? (Array.isArray(pendientes.cuadres_pendientes) ? pendientes.cuadres_pendientes.length : 0)
      : "?";
    if (puede) {
      accionesHtml += '<button type="button" class="cc-accion" id="btn-finalizar-ciclo" data-id="' + esc(c.id) + '">Finalizar ciclo (→ VALIDADO)</button>';
    } else {
      accionesHtml += '<span class="muted">No se puede finalizar: hay pendientes (entregas: ' + nEnt + ", cuadres: " + nCua + ").</span>";
    }
  }
  accionesHtml += "</div>";

  let formEntregaHtml = "";
  if ((c.estado === "ACTIVO" || c.estado === "EN_VALIDACION") && tienePermiso("entregas_caja", "crear")) {
    let sesOpts = '<option value="">Sin sesión específica</option>';
    sesiones.forEach(function (s) {
      sesOpts += '<option value="' + esc(s.id) + '">Día ' + esc(s.dia_n) + " " + esc(s.bloque) + "</option>";
    });
    formEntregaHtml =
      '<div class="cc-bloque" id="ciclo-form-entrega">' +
      "<h4>Declarar entrega de caja</h4>" +
      '<form id="form-declarar-entrega" class="inline-form">' +
      '<input type="hidden" id="entrega-ciclo-id" value="' + esc(c.id) + '">' +
      '<input id="entrega-monto" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Monto declarado" required>' +
      '<select id="entrega-sesion">' + sesOpts + "</select>" +
      '<button type="submit" class="cc-accion">Declarar</button>' +
      "</form>" +
      '<p class="msg" id="msg-entrega-crear"></p>' +
      "</div>";
  }

  let entregasHtml = '<div class="cc-bloque"><h4>Entregas de caja</h4>';
  if (!tienePermiso("entregas_caja", "ver")) {
    entregasHtml += '<p class="muted">Sin permiso para ver entregas.</p>';
  } else if (!entregas || entregas.length === 0) {
    entregasHtml += '<p class="lista-estado">Sin entregas registradas.</p>';
  } else {
    entregasHtml += '<div class="lista" id="lista-entregas-ciclo">';
    entregas.forEach(function (e) {
      const monDec = Number(e.monto_declarado);
      const monCon = e.monto_contado != null ? Number(e.monto_contado) : null;
      const dif = e.diferencia != null ? Number(e.diferencia) : null;
      let accionesE = "";
      if (e.estado === "DECLARADA" && tienePermiso("entregas_caja", "editar")) {
        accionesE += '<button type="button" class="cc-accion btn-recepcion-entrega" data-id="' + esc(e.id) + '">Registrar conteo</button>';
      }
      if (e.estado === "CONTADA" && tienePermiso("entregas_caja", "editar_any")) {
        accionesE += '<button type="button" class="cc-accion btn-revisar-entrega" data-id="' + esc(e.id) + '" data-decision="aprobar">Aprobar</button>';
        accionesE += '<button type="button" class="cc-accion btn-revisar-entrega" data-id="' + esc(e.id) + '" data-decision="rechazar">Rechazar</button>';
      }
      entregasHtml +=
        '<div class="lista-item rep-fila rep-estado-' + esc(String(e.estado || "").toLowerCase()) + '" data-entrega-id="' + esc(e.id) + '">' +
        '<span class="rep-fila-principal">' +
        '<span class="cc-asunto-tipo">' + esc(e.estado || "—") + "</span>" +
        '<span class="muted">Declarado $' + (typeof money === "function" ? money(monDec) : monDec) +
        (monCon != null ? " · Contado $" + (typeof money === "function" ? money(monCon) : monCon) : "") +
        (dif != null ? " · Dif $" + (typeof money === "function" ? money(dif) : dif) : "") +
        " · " + esc(e.declarado_nombre || "—") +
        "</span>" + accionesE +
        "</span>" +
        (e.observacion_conteo ? '<div class="muted">Obs conteo: ' + esc(e.observacion_conteo) + "</div>" : "") +
        (e.comentario_revision ? '<div class="muted">Revisión: ' + esc(e.comentario_revision) + "</div>" : "") +
        "</div>";
    });
    entregasHtml += "</div>";
  }
  entregasHtml += "</div>";

  det.innerHTML =
    '<div class="cc-bloque">' +
    "<h3>Ciclo · " + esc(c.estado || "—") + "</h3>" +
    '<p class="muted">Almacén: <strong>' + esc(c.almacen_nombre || "—") + "</strong></p>" +
    '<p class="muted">Plan: ' + inicio + " → " + fin + " (" + esc(c.cantidad_dias) + " días)</p>" +
    accionesHtml +
    "<h4>Sesiones</h4>" + sesHtml +
    "</div>" +
    formEntregaHtml +
    entregasHtml +
    '<p class="msg" id="msg-ciclo-detalle"></p>';
}

// ---------------------------------------------------------------------------
// Handlers de mutación
// ---------------------------------------------------------------------------
async function crearCicloDesdeForm(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-crear-ciclo");
  if (btn) btn.disabled = true;
  try {
    if (!tienePermiso("ciclos", "crear")) {
      ciclosSetMsg("msg-ciclo-crear", "No tenés permiso para crear ciclos.", false);
      return;
    }
    const alm = document.getElementById("ciclo-nuevo-almacen");
    const inicio = document.getElementById("ciclo-nuevo-inicio");
    const dias = document.getElementById("ciclo-nuevo-dias");
    const almacen_id = alm ? (alm.value || "").trim() : "";
    const inicio_plan = inicio ? (inicio.value || "").trim() : "";
    const cantidad_dias = dias ? parseInt(dias.value, 10) : 0;
    if (!almacen_id) {
      ciclosSetMsg("msg-ciclo-crear", "Seleccioná un almacén.", false);
      return;
    }
    if (!inicio_plan) {
      ciclosSetMsg("msg-ciclo-crear", "Indicá la fecha de inicio.", false);
      return;
    }
    if (!Number.isFinite(cantidad_dias) || cantidad_dias < 1 || cantidad_dias > 31) {
      ciclosSetMsg("msg-ciclo-crear", "Cantidad de días debe estar entre 1 y 31.", false);
      return;
    }
    const r = await ciclosMutar(CICLOS_RPC_MUTACION.crear, {
      p_almacen_id: almacen_id,
      p_inicio_plan: inicio_plan,
      p_cantidad_dias: cantidad_dias,
    }, "msg-ciclo-crear");
    if (!r.ok) {
      if (r.offline) return;
      ciclosSetMsg("msg-ciclo-crear", "No se pudo crear: " + ciclosExplicarError(r.error, "crear ciclo"), false);
      return;
    }
    ciclosSetMsg("msg-ciclo-crear", "✓ Ciclo creado (PLANIFICADO).", true);
    const form = document.getElementById("form-crear-ciclo");
    if (form) form.reset();
    await refrescarListaCiclos();
    const nuevoId = r.data && r.data.id ? r.data.id : null;
    if (nuevoId) await mostrarDetalleCiclo(nuevoId);
  } catch (err) {
    console.warn("[Battlecruiser] crearCicloDesdeForm:", err);
    ciclosForzarHideLoading();
    ciclosSetMsg("msg-ciclo-crear", "Error inesperado al crear ciclo.", false);
    setEmpty("lista-ciclos", "Error al actualizar listado. Pulsá Refrescar.");
  } finally {
    if (btn) btn.disabled = false;
    ciclosForzarHideLoading();
  }
}

async function iniciarCiclo(cicloId) {
  try {
    if (!tienePermiso("ciclos", "editar")) {
      ciclosSetMsg("msg-ciclo-detalle", "No tenés permiso para iniciar ciclos.", false);
      return;
    }
    const r = await ciclosMutar(CICLOS_RPC_MUTACION.iniciar, { p_ciclo_id: cicloId }, "msg-ciclo-detalle");
    if (!r.ok) {
      if (r.offline) return;
      ciclosSetMsg("msg-ciclo-detalle", "No se pudo iniciar: " + ciclosExplicarError(r.error, "iniciar ciclo"), false);
      return;
    }
    ciclosSetMsg("msg-ciclo-detalle", "✓ Ciclo iniciado (ACTIVO).", true);
    await refrescarListaCiclos();
    await mostrarDetalleCiclo(cicloId);
  } catch (err) {
    console.warn("[Battlecruiser] iniciarCiclo:", err);
    ciclosForzarHideLoading();
    ciclosSetMsg("msg-ciclo-detalle", "Error inesperado al iniciar ciclo.", false);
  } finally {
    ciclosForzarHideLoading();
  }
}

async function iniciarValidacionCiclo(cicloId) {
  try {
    if (!tienePermiso("ciclos", "editar")) {
      ciclosSetMsg("msg-ciclo-detalle", "No tenés permiso para pasar a validación.", false);
      return;
    }
    const r = await ciclosMutar(CICLOS_RPC_MUTACION.iniciarValidacion, { p_ciclo_id: cicloId }, "msg-ciclo-detalle");
    if (!r.ok) {
      if (r.offline) return;
      ciclosSetMsg("msg-ciclo-detalle", "No se pudo pasar a validación: " + ciclosExplicarError(r.error, "iniciar validación"), false);
      return;
    }
    ciclosSetMsg("msg-ciclo-detalle", "✓ Ciclo en validación (EN_VALIDACION).", true);
    await refrescarListaCiclos();
    await mostrarDetalleCiclo(cicloId);
  } catch (err) {
    console.warn("[Battlecruiser] iniciarValidacionCiclo:", err);
    ciclosForzarHideLoading();
    ciclosSetMsg("msg-ciclo-detalle", "Error inesperado al pasar a validación.", false);
  } finally {
    ciclosForzarHideLoading();
  }
}

async function finalizarCiclo(cicloId) {
  try {
    if (!tienePermiso("ciclos", "editar_any")) {
      ciclosSetMsg("msg-ciclo-detalle", "No tenés permiso para finalizar ciclos.", false);
      return;
    }
    if (!window.confirm("¿Finalizar este ciclo operativo? Pasará a VALIDADO. Solo si no hay entregas/cuadres pendientes.")) {
      return;
    }
    const r = await ciclosMutar(CICLOS_RPC_MUTACION.finalizar, { p_ciclo_id: cicloId }, "msg-ciclo-detalle");
    if (!r.ok) {
      if (r.offline) return;
      ciclosSetMsg("msg-ciclo-detalle", "No se pudo finalizar: " + ciclosExplicarError(r.error, "finalizar ciclo"), false);
      return;
    }
    ciclosSetMsg("msg-ciclo-detalle", "✓ Ciclo finalizado (VALIDADO).", true);
    await refrescarListaCiclos();
    await mostrarDetalleCiclo(cicloId);
  } catch (err) {
    console.warn("[Battlecruiser] finalizarCiclo:", err);
    ciclosForzarHideLoading();
    ciclosSetMsg("msg-ciclo-detalle", "Error inesperado al finalizar ciclo.", false);
  } finally {
    ciclosForzarHideLoading();
  }
}

async function declararEntregaDesdeForm(e) {
  e.preventDefault();
  try {
    if (!tienePermiso("entregas_caja", "crear")) {
      ciclosSetMsg("msg-entrega-crear", "No tenés permiso para declarar entregas.", false);
      return;
    }
    const cicloId = (document.getElementById("entrega-ciclo-id") || {}).value;
    const montoEl = document.getElementById("entrega-monto");
    const sesionEl = document.getElementById("entrega-sesion");
    const monto = montoEl ? parseFloat(montoEl.value) : NaN;
    const sesion_id = sesionEl && sesionEl.value ? sesionEl.value : null;
    if (!cicloId) {
      ciclosSetMsg("msg-entrega-crear", "Ciclo no identificado.", false);
      return;
    }
    if (!Number.isFinite(monto) || monto < 0) {
      ciclosSetMsg("msg-entrega-crear", "Monto inválido.", false);
      return;
    }
    const r = await ciclosMutar(CICLOS_RPC_MUTACION.declararEntrega, {
      p_ciclo_id: cicloId,
      p_monto_declarado: monto,
      p_sesion_id: sesion_id,
    }, "msg-entrega-crear");
    if (!r.ok) {
      if (r.offline) return;
      ciclosSetMsg("msg-entrega-crear", "No se pudo declarar: " + ciclosExplicarError(r.error, "declarar entrega"), false);
      return;
    }
    ciclosSetMsg("msg-entrega-crear", "✓ Entrega declarada.", true);
    if (montoEl) montoEl.value = "";
    await mostrarDetalleCiclo(cicloId);
  } catch (err) {
    console.warn("[Battlecruiser] declararEntregaDesdeForm:", err);
    ciclosForzarHideLoading();
    ciclosSetMsg("msg-entrega-crear", "Error inesperado al declarar entrega.", false);
  } finally {
    ciclosForzarHideLoading();
  }
}

async function recepcionEntrega(entregaId) {
  try {
    if (!tienePermiso("entregas_caja", "editar")) {
      ciclosSetMsg("msg-ciclo-detalle", "No tenés permiso para registrar conteo.", false);
      return;
    }
    const input = window.prompt("Monto contado:", "");
    if (input === null) return;
    const monto = parseFloat(input);
    if (!Number.isFinite(monto) || monto < 0) {
      ciclosSetMsg("msg-ciclo-detalle", "Monto contado inválido.", false);
      return;
    }
    const obs = window.prompt("Observación de conteo (opcional):", "") || null;
    const r = await ciclosMutar(CICLOS_RPC_MUTACION.recepcionEntrega, {
      p_entrega_id: entregaId,
      p_monto_contado: monto,
      p_observacion_conteo: obs,
    }, "msg-ciclo-detalle");
    if (!r.ok) {
      if (r.offline) return;
      ciclosSetMsg("msg-ciclo-detalle", "No se pudo registrar recepción: " + ciclosExplicarError(r.error, "recepción entrega"), false);
      return;
    }
    ciclosSetMsg("msg-ciclo-detalle", "✓ Conteo registrado (CONTADA).", true);
    if (_cicloActualId) await mostrarDetalleCiclo(_cicloActualId);
  } catch (err) {
    console.warn("[Battlecruiser] recepcionEntrega:", err);
    ciclosForzarHideLoading();
    ciclosSetMsg("msg-ciclo-detalle", "Error inesperado al registrar conteo.", false);
  } finally {
    ciclosForzarHideLoading();
  }
}

async function revisarEntrega(entregaId, decision) {
  try {
    if (!tienePermiso("entregas_caja", "editar_any")) {
      ciclosSetMsg("msg-ciclo-detalle", "No tenés permiso para revisar entregas.", false);
      return;
    }
    let comentario = null;
    if (decision === "rechazar") {
      comentario = window.prompt("Motivo del rechazo (obligatorio):", "");
      if (comentario === null) return;
      if (!String(comentario).trim()) {
        ciclosSetMsg("msg-ciclo-detalle", "El rechazo requiere un motivo.", false);
        return;
      }
    } else {
      comentario = window.prompt("Comentario de aprobación (opcional):", "") || null;
    }
    const r = await ciclosMutar(CICLOS_RPC_MUTACION.revisarEntrega, {
      p_entrega_id: entregaId,
      p_decision: decision,
      p_comentario: comentario,
    }, "msg-ciclo-detalle");
    if (!r.ok) {
      if (r.offline) return;
      ciclosSetMsg("msg-ciclo-detalle", "No se pudo revisar: " + ciclosExplicarError(r.error, "revisar entrega"), false);
      return;
    }
    ciclosSetMsg("msg-ciclo-detalle", "✓ Entrega " + (decision === "aprobar" ? "aprobada" : "rechazada") + ".", true);
    if (_cicloActualId) await mostrarDetalleCiclo(_cicloActualId);
  } catch (err) {
    console.warn("[Battlecruiser] revisarEntrega:", err);
    ciclosForzarHideLoading();
    ciclosSetMsg("msg-ciclo-detalle", "Error inesperado al revisar entrega.", false);
  } finally {
    ciclosForzarHideLoading();
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
safeInit("ciclos-operativos", function () {
  const refrescarBtn = document.getElementById("ciclos-refrescar-btn");
  if (refrescarBtn) {
    refrescarBtn.addEventListener("click", function () {
      refrescarListaCiclos();
    });
  }
  const estadoSel = document.getElementById("ciclo-filtro-estado");
  if (estadoSel) {
    estadoSel.addEventListener("change", function () {
      refrescarListaCiclos();
    });
  }
  const almSel = document.getElementById("ciclo-filtro-almacen");
  if (almSel) {
    almSel.addEventListener("change", function () {
      refrescarListaCiclos();
    });
  }
  const lista = document.getElementById("lista-ciclos");
  if (lista) {
    lista.addEventListener("click", function (e) {
      const item = e.target.closest("[data-ciclo-id]");
      if (item && item.dataset.cicloId) {
        mostrarDetalleCiclo(item.dataset.cicloId);
      }
    });
  }

  document.addEventListener("submit", function (e) {
    if (e.target && e.target.id === "form-crear-ciclo") {
      crearCicloDesdeForm(e);
    }
    if (e.target && e.target.id === "form-declarar-entrega") {
      declararEntregaDesdeForm(e);
    }
  });

  const det = document.getElementById("ciclo-detalle");
  if (det) {
    det.addEventListener("click", function (e) {
      const btnIniciar = e.target.closest("#btn-iniciar-ciclo");
      if (btnIniciar) {
        iniciarCiclo(btnIniciar.dataset.id);
        return;
      }
      const btnVal = e.target.closest("#btn-iniciar-validacion");
      if (btnVal) {
        iniciarValidacionCiclo(btnVal.dataset.id);
        return;
      }
      const btnFin = e.target.closest("#btn-finalizar-ciclo");
      if (btnFin) {
        finalizarCiclo(btnFin.dataset.id);
        return;
      }
      const btnRec = e.target.closest(".btn-recepcion-entrega");
      if (btnRec) {
        recepcionEntrega(btnRec.dataset.id);
        return;
      }
      const btnRev = e.target.closest(".btn-revisar-entrega");
      if (btnRev) {
        revisarEntrega(btnRev.dataset.id, btnRev.dataset.decision);
        return;
      }
    });
  }
});
