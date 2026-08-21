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
// V1.1 FASE ESTRUCTURA: esqueleto + mapa RPC + hooks de navegación.
// La lógica completa de formularios/acciones se autoriza en fase posterior.

// ---------------------------------------------------------------------------
// Estado en memoria del módulo (no IndexedDB propio; no cola paralela)
// ---------------------------------------------------------------------------
let _cicloActualId = null; // id del ciclo seleccionado en detalle (si hay)
let _ciclosCache = [];     // última lista leída (solo memoria de sesión)

// ---------------------------------------------------------------------------
// Mapa RPC — contratos backend existentes (NO inventar firmas)
// ---------------------------------------------------------------------------
// Lecturas (client.rpc directo; online obligatorio en V1.1)
const CICLOS_RPC_LECTURA = {
  listar: "listar_ciclos_operativos",           // (p_almacen_id?, p_estado?) → jsonb[]
  obtener: "obtener_ciclo_operativo",           // (p_ciclo_id) → jsonb + sesiones
  listarEntregas: "listar_entregas_caja",       // (p_ciclo_id?, p_almacen_id?, p_estado?)
  obtenerEntrega: "obtener_entrega_caja",       // (p_entrega_id)
  pendientesCierre: "obtener_pendientes_cierre_ciclo", // (p_ciclo_id) → {puede_finalizar,...}
};

// Mutaciones (requieren p_idempotency_key; ver decisión offline abajo)
// Nombres alineados con RPC reales. NO usar en ejecutarOperacion hasta
// que se autorice extender RPC_POR_TIPO en offline.js (fase posterior).
const CICLOS_RPC_MUTACION = {
  crear: "crear_ciclo_operativo",                         // p_almacen_id, p_inicio_plan, p_cantidad_dias, p_idempotency_key
  iniciar: "iniciar_ciclo_operativo",                     // p_ciclo_id, p_idempotency_key
  iniciarValidacion: "iniciar_validacion_ciclo_operativo", // p_ciclo_id, p_idempotency_key
  declararEntrega: "declarar_entrega_caja",               // p_ciclo_id, p_monto_declarado, p_sesion_id?, p_turno_id?, p_almacen_id?, p_idempotency_key
  recepcionEntrega: "registrar_recepcion_entrega_caja",   // p_entrega_id, p_monto_contado, p_observacion_conteo?, p_idempotency_key
  revisarEntrega: "revisar_entrega_caja",                 // p_entrega_id, p_decision ('aprobar'|'rechazar'), p_comentario?, p_idempotency_key
  finalizar: "finalizar_ciclo_operativo",                 // p_ciclo_id, p_idempotency_key
};

// ---------------------------------------------------------------------------
// Decisión OFFLINE (V1.1) — documentada, sin tocar offline.js
// ---------------------------------------------------------------------------
// Lecturas:
//   - Online obligatorio. Sin conexión: mensaje claro (patrón turnos B7).
//   - No se cachea lista de ciclos en IndexedDB en esta fase (evitar datos
//     de caja/cierre desactualizados que induzcan a cerrar mal).
//
// Mutaciones críticas (dinero / caja / cierre):
//   - declarar_entrega_caja, registrar_recepcion_entrega_caja,
//     revisar_entrega_caja, finalizar_ciclo_operativo
//   → BLOQUEAR offline con mensaje: requieren validación de dinero/caja
//     y no deben encolarse a ciegas en V1.1.
//
// Mutaciones de estado de ciclo (sin monto):
//   - crear_ciclo_operativo, iniciar_ciclo_operativo,
//     iniciar_validacion_ciclo_operativo
//   → También online-only en V1.1 (idempotencia existe en backend, pero
//     no se extiende RPC_POR_TIPO todavía para no tocar offline core).
//
// NO se crea cola paralela. NO se modifica ejecutarOperacion / sincronizarCola.
// ---------------------------------------------------------------------------

function ciclosRequiereOnline(msgEl) {
  if (typeof estaRealmenteDesconectado === "function" && estaRealmenteDesconectado()) {
    if (msgEl) setMsg(msgEl, "Sin conexión. Las operaciones de ciclos y caja requieren Internet.", false);
    return false;
  }
  if (!navigator.onLine) {
    if (msgEl) setMsg(msgEl, "Sin conexión. Las operaciones de ciclos y caja requieren Internet.", false);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Orquestador de pestaña (hook desde navegacion.js)
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

  // Filtros: reutilizar catálogo de almacenes si está en _cache
  const selAlm = document.getElementById("ciclo-filtro-almacen");
  if (selAlm && typeof poblarSelectAlmacenes === "function") {
    poblarSelectAlmacenes(selAlm, "Todos los almacenes");
  }

  await refrescarListaCiclos();
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
    const { data, error } = await client.rpc(CICLOS_RPC_LECTURA.listar, {
      p_almacen_id: p_almacen_id,
      p_estado: p_estado,
    });
    if (error) {
      const msg = String(error.message || error);
      if (typeof esRpcFaltante === "function" && esRpcFaltante(error)) {
        setEmpty("lista-ciclos", "Falta aplicar SQL M15 (ciclos) en Supabase.");
      } else {
        setEmpty("lista-ciclos", "Error: " + (typeof escHtml === "function" ? escHtml(msg) : msg));
      }
      return;
    }
    // listar_ciclos_operativos retorna jsonb (array)
    const filas = Array.isArray(data) ? data : data ? [data] : [];
    _ciclosCache = filas;
    renderListaCiclos(filas);
  } catch (e) {
    setEmpty("lista-ciclos", "Error al cargar ciclos.");
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

// Detalle / entregas / cierre: stubs para fase de lógica completa.
// No invocan mutaciones todavía.
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
    const { data, error } = await client.rpc(CICLOS_RPC_LECTURA.obtener, { p_ciclo_id: cicloId });
    if (error) {
      det.innerHTML = '<p class="lista-estado">Error: ' + (typeof escHtml === "function" ? escHtml(error.message || error) : String(error.message || error)) + "</p>";
      return;
    }
    renderDetalleCiclo(data);
  } catch (e) {
    det.innerHTML = '<p class="lista-estado">Error al cargar el detalle del ciclo.</p>';
    console.warn("[Battlecruiser] obtener_ciclo_operativo:", e);
  }
}

function renderDetalleCiclo(c) {
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
        "<li class=\"muted\">Día " + esc(s.dia_n) + " · " + esc(s.bloque) +
        " · " + esc(s.fecha || "") + " · " + esc(s.estado || "") + "</li>";
    });
    sesHtml += "</ul>";
  }
  det.innerHTML =
    '<div class="cc-bloque">' +
    "<h3>Ciclo · " + esc(c.estado || "—") + "</h3>" +
    '<p class="muted">Almacén: <strong>' + esc(c.almacen_nombre || "—") + "</strong></p>" +
    '<p class="muted">Plan: ' + inicio + " → " + fin + " (" + esc(c.cantidad_dias) + " días)</p>" +
    "<h4>Sesiones</h4>" + sesHtml +
    '<p class="muted">Entregas y cierre: se completan en la fase de lógica (V1.2+).</p>' +
    "</div>";
}

// ---------------------------------------------------------------------------
// Init: listeners mínimos (filtros + click en lista → detalle)
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
});
