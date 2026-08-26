// ==== Battlecruiser · js/transferencias.js ====
// Transferencias entre almacenes: listado, render y detalle accionable.
// F8: mutex anti doble-submit, stock disponible en UI, try/finally.
//
// Modelo de negocio (backend registrar_transferencia):
//   Operación ATÓMICA origen→destino (FIFO). Sin recepción/cancelación posterior.
// Owner: este módulo. RPC: registrar_transferencia vía ejecutarOperacion("transferencia").
// Offline: cola + ajustePendiente (origen − / destino +).

async function refrescarTransferencias() {
  setLoading("lista-transferencias", "Cargando transferencias…");
  const { data } = await client
    .from("transferencias")
    .select("id, fecha, estado, origen:almacen_origen_id(nombre), destino:almacen_destino_id(nombre)")
    .order("fecha", { ascending: false })
    .limit(20);
  _cache.transferencias = data || [];
  renderResumen();
  renderTransferenciasLista();
}

let _trfBusqueda = "";
function renderTransferenciasLista() {
  const lista = document.getElementById("lista-transferencias");
  if (!lista) return;
  const todas = _cache.transferencias || [];
  if (todas.length === 0) {
    setEmpty("lista-transferencias", "Todavía no hay transferencias registradas.");
    actualizarContador("trf-contador", 0, 0);
    return;
  }
  const termino = _trfBusqueda.trim().toLowerCase();
  const filtradas = termino
    ? todas.filter((t) => {
        const orig = t.origen && t.origen.nombre ? t.origen.nombre.toLowerCase() : "";
        const dest = t.destino && t.destino.nombre ? t.destino.nombre.toLowerCase() : "";
        const est = t.estado ? t.estado.toLowerCase() : "";
        const fec = t.fecha ? fechaCorta(t.fecha).toLowerCase() : "";
        const id = t.id ? t.id.toLowerCase() : "";
        return orig.includes(termino) || dest.includes(termino) || est.includes(termino) || fec.includes(termino) || id.includes(termino);
      })
    : todas;
  if (filtradas.length === 0) {
    lista.innerHTML = '<p class="lista-estado">🔎 No encontramos transferencias con esos criterios.</p>'
      + '<button type="button" class="cc-accion mov-ver-todas-btn" data-tipo="transferencias">Ver todas</button>';
    actualizarContador("trf-contador", 0, todas.length);
    return;
  }
  lista.innerHTML = "";
  filtradas.forEach((t) => {
    const div = document.createElement("div");
    div.className = "lista-item lista-item-accion trf-item";
    div.setAttribute("data-trf-id", t.id || "");
    div.setAttribute("role", "button");
    div.setAttribute("tabindex", "0");
    const estadoTxt = t.estado ? escHtml(t.estado) : "Registrada";
    div.innerHTML = `<span>${t.origen ? escHtml(t.origen.nombre) : "—"} → ${t.destino ? escHtml(t.destino.nombre) : "—"} <span class="muted">· #${t.id ? idCorto(t.id) : "—"}</span></span>
      <span class="muted">${fechaCorta(t.fecha)} · ${estadoTxt}</span>`;
    lista.appendChild(div);
  });
  actualizarContador("trf-contador", filtradas.length, todas.length);
}

function stockDisponibleOrigen(producto_id, origen_id) {
  if (!producto_id || !origen_id) return null;
  const fila = (_cache.stock || []).find(
    (s) => String(s.producto_id) === String(producto_id) && String(s.almacen_id) === String(origen_id)
  );
  let base = fila ? Number(fila.cantidad) || 0 : 0;
  if (typeof ajustePendiente === "function") {
    const { ajuste, noCalculable } = ajustePendiente(producto_id, origen_id);
    if (noCalculable) return { cantidad: base, aproximado: true };
    return { cantidad: Math.max(base + ajuste, 0), aproximado: false };
  }
  return { cantidad: base, aproximado: false };
}

function actualizarStockTransferenciaUI() {
  let el = document.getElementById("trf-stock-disponible");
  const form = document.getElementById("form-transferencia");
  if (!el && form) {
    el = document.createElement("p");
    el.id = "trf-stock-disponible";
    el.className = "msg";
    const msg = document.getElementById("msg-transferencias");
    if (msg && msg.parentNode) msg.parentNode.insertBefore(el, msg);
    else form.appendChild(el);
  }
  if (!el) return;
  const origen = (document.getElementById("trf-origen") || {}).value || "";
  const producto_id = (document.getElementById("trf-producto") || {}).value || "";
  const cantInput = document.getElementById("trf-cantidad");
  if (!origen || !producto_id) {
    el.textContent = "";
    el.className = "msg";
    if (cantInput) cantInput.removeAttribute("max");
    return;
  }
  const info = stockDisponibleOrigen(producto_id, origen);
  if (!info) { el.textContent = ""; return; }
  const disp = info.cantidad;
  el.textContent =
    "Stock disponible en origen: " +
    (typeof money === "function" ? money(disp) : disp) +
    (info.aproximado ? " (estimado con operaciones pendientes)" : "");
  el.className = "msg" + (disp <= 0 ? " error" : "");
  if (cantInput) {
    if (disp > 0) cantInput.setAttribute("max", String(disp));
    else cantInput.removeAttribute("max");
  }
}

let _enviandoTransferencia = false;

safeInit("form-transferencia", () => {
  const form = document.getElementById("form-transferencia");
  if (!form) return;

  ["trf-origen", "trf-producto"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.bcTrfStock) {
      el.dataset.bcTrfStock = "1";
      el.addEventListener("change", actualizarStockTransferenciaUI);
    }
  });
  const cantEl = document.getElementById("trf-cantidad");
  if (cantEl && !cantEl.dataset.bcTrfStock) {
    cantEl.dataset.bcTrfStock = "1";
    cantEl.addEventListener("input", () => {
      const max = cantEl.getAttribute("max");
      const val = parseFloat(cantEl.value);
      if (max != null && Number.isFinite(val) && val > parseFloat(max)) {
        setMsg("msg-transferencias", "Esa cantidad supera el stock disponible en origen (" +
          (typeof money === "function" ? money(parseFloat(max)) : max) + ").", false);
      } else if (val < 0 || (cantEl.value !== "" && !Number.isFinite(val))) {
        setMsg("msg-transferencias", "La cantidad debe ser un número mayor a 0.", false);
      } else {
        setMsg("msg-transferencias", "", true);
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (_enviandoTransferencia) return;

    if (typeof tienePermiso === "function" && !tienePermiso("transferencias", "crear")) {
      setMsg("msg-transferencias", "No tenés permiso para registrar transferencias.", false);
      return;
    }

    const origen = document.getElementById("trf-origen").value;
    const destino = document.getElementById("trf-destino").value;
    const producto_id = document.getElementById("trf-producto").value;
    const cantidad = parseFloat(document.getElementById("trf-cantidad").value);
    const submitBtn = e.target.querySelector("button[type='submit']");

    if (!origen || !destino || !producto_id) {
      setMsg("msg-transferencias", "Completá origen, destino y producto.", false);
      return;
    }
    if (String(origen) === String(destino)) {
      setMsg("msg-transferencias", "El origen y el destino no pueden ser el mismo almacén.", false);
      return;
    }
    if (!(cantidad > 0) || !Number.isFinite(cantidad)) {
      setMsg("msg-transferencias", "La cantidad debe ser mayor a 0.", false);
      return;
    }

    const stockInfo = stockDisponibleOrigen(producto_id, origen);
    if (stockInfo && stockInfo.cantidad < cantidad) {
      const disp = typeof money === "function" ? money(stockInfo.cantidad) : stockInfo.cantidad;
      setMsg("msg-transferencias", "Stock insuficiente en el almacén origen (disponible: " + disp +
        (stockInfo.aproximado ? " · estimado con pendientes" : "") + ").", false);
      return;
    }

    if (!window.confirm("¿Confirmar transferencia de " + cantidad + " unidades? Esto mueve stock real.")) {
      return;
    }

    _enviandoTransferencia = true;
    var textoOriginal = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Procesando…"; }

    try {
      const resultado = await ejecutarOperacion("transferencia", {
        p_origen_id: origen,
        p_destino_id: destino,
        p_lineas: [{ producto_id: producto_id, cantidad: cantidad }],
      });

      if (!resultado.ok) {
        setMsg("msg-transferencias", "No se pudo transferir: " + explicarError(resultado.error, "transferencia"), false);
        return;
      }
      e.target.reset();
      actualizarStockTransferenciaUI();
      if (resultado.offline) {
        setMsg("msg-transferencias", "✓ Guardada localmente — se sincronizará al recuperar conexión.", true);
        if (typeof refrescarOperacionesPendientesCache === "function") {
          await refrescarOperacionesPendientesCache();
        }
        actualizarStockTransferenciaUI();
        return;
      }
      setMsg("msg-transferencias", "Transferencia registrada. El stock se movió de origen a destino.", true);
      await refrescarTransferencias();
      await refrescarStockYSelects();
      actualizarStockTransferenciaUI();
    } finally {
      _enviandoTransferencia = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        if (textoOriginal) submitBtn.textContent = textoOriginal;
      }
    }
  });
});

async function mostrarDetalleTransferencia(trfId) {
  const cont = document.getElementById("transferencia-detalle");
  if (!cont) return;
  const trf = (_cache.transferencias || []).find((t) => t.id === trfId);
  if (!trf) {
    cont.innerHTML = '<p class="lista-estado">No se encontró la transferencia.</p>'
      + '<button type="button" class="cc-accion trf-detalle-cerrar-btn">Volver</button>';
    cont.classList.remove("hidden");
    _enlazarCerrarTrfDetalle();
    return;
  }
  const fechaHora = trf.fecha ? fechaHoraCompleta(trf.fecha) : "—";
  const estadoTxt = trf.estado ? escHtml(trf.estado) : "Registrada";
  let lineasHtml = "";
  try {
    if (navigator.onLine && trf.id) {
      const { data: lineas, error } = await client
        .from("transferencias_lineas")
        .select("producto_id, cantidad, productos(nombre)")
        .eq("transferencia_id", trf.id);
      if (!error && lineas && lineas.length > 0) {
        lineasHtml = '<div class="detalle-fila detalle-seccion"><span class="detalle-etiqueta">Productos</span></div>';
        lineas.forEach((l, i) => {
          const nombre = (l.productos && l.productos.nombre)
            || (typeof resolverNombreProducto === "function" ? resolverNombreProducto(l.producto_id) : idCorto(l.producto_id));
          lineasHtml += '<div class="detalle-fila"><span class="detalle-etiqueta">  ' + (i + 1) + '. ' + escHtml(nombre) +
            '</span><span class="detalle-valor">' + money(l.cantidad || 0) + ' u</span></div>';
        });
      }
    }
  } catch (e) {
    console.warn("[Battlecruiser] No se pudieron cargar líneas de transferencia:", e);
  }
  cont.innerHTML = '<div class="detalle-cabecera">'
    + '<span class="detalle-tipo">Transferencia #' + (trf.id ? idCorto(trf.id) : "—") + '</span>'
    + '<button type="button" class="detalle-cerrar-btn trf-detalle-cerrar-btn" aria-label="Cerrar detalle">&times;</button>'
    + '</div>'
    + '<div class="detalle-cuerpo">'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Referencia</span><span class="detalle-valor">' + escHtml(trf.id || "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Fecha y hora</span><span class="detalle-valor">' + escHtml(fechaHora) + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Estado</span><span class="detalle-valor">' + estadoTxt + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Almacén origen</span><span class="detalle-valor">' + escHtml(trf.origen ? trf.origen.nombre : "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Almacén destino</span><span class="detalle-valor">' + escHtml(trf.destino ? trf.destino.nombre : "—") + '</span></div>'
    + lineasHtml
    + '<p class="muted detalle-nota">El stock se movió al registrar la transferencia (operación atómica). No hay recepción ni cancelación posterior en el modelo actual.</p>'
    + '</div>';
  cont.classList.remove("hidden");
  _enlazarCerrarTrfDetalle();
  cont.focus();
}

function _enlazarCerrarTrfDetalle() {
  const cont = document.getElementById("transferencia-detalle");
  if (!cont) return;
  cont.querySelectorAll(".trf-detalle-cerrar-btn").forEach((btn) => {
    btn.addEventListener("click", cerrarDetalleTransferencia);
  });
}

function cerrarDetalleTransferencia() {
  const cont = document.getElementById("transferencia-detalle");
  if (cont) { cont.classList.add("hidden"); cont.innerHTML = ""; }
}

async function refrescarVales() {
  setLoading("lista-vales", "Cargando vales…");
  const { data } = await client
    .from("vales_salida")
    .select("id, fecha, tipo, cantidad, productos(nombre), almacenes(nombre)")
    .order("fecha", { ascending: false })
    .limit(20);
  _cache.vales = data || [];
  renderResumen();
  renderValesLista();
}

let _valesBusqueda = "";
function renderValesLista() {
  const lista = document.getElementById("lista-vales");
  if (!lista) return;
  const todas = _cache.vales || [];
  if (todas.length === 0) {
    setEmpty("lista-vales", "Todavía no hay vales de salida registrados.");
    actualizarContador("vales-contador", 0, 0);
    return;
  }
  const termino = _valesBusqueda.trim().toLowerCase();
  const filtradas = termino
    ? todas.filter((v) => {
        const prod = v.productos && v.productos.nombre ? v.productos.nombre.toLowerCase() : "";
        const alm = v.almacenes && v.almacenes.nombre ? v.almacenes.nombre.toLowerCase() : "";
        const tipo = v.tipo ? v.tipo.toLowerCase() : "";
        const fec = v.fecha ? fechaCorta(v.fecha).toLowerCase() : "";
        const id = v.id ? v.id.toLowerCase() : "";
        return prod.includes(termino) || alm.includes(termino) || tipo.includes(termino) || fec.includes(termino) || id.includes(termino);
      })
    : todas;
  if (filtradas.length === 0) {
    lista.innerHTML = '<p class="lista-estado">🔎 No encontramos vales con esos criterios.</p>'
      + '<button type="button" class="cc-accion mov-ver-todas-btn" data-tipo="vales">Ver todos</button>';
    actualizarContador("vales-contador", 0, todas.length);
    return;
  }
  lista.innerHTML = "";
  filtradas.forEach((v) => {
    const div = document.createElement("div");
    div.className = "lista-item lista-item-accion vale-item vale-tipo-" + (v.tipo || "desconocido");
    div.setAttribute("data-vale-id", v.id || "");
    div.setAttribute("role", "button");
    div.setAttribute("tabindex", "0");
    div.innerHTML = `<span>${v.productos ? escHtml(v.productos.nombre) : "—"} <span class="muted">· ${v.almacenes ? escHtml(v.almacenes.nombre) : "—"} · #${v.id ? idCorto(v.id) : "—"}</span></span>
      <span class="muted">${fechaCorta(v.fecha)} · ${escHtml(v.tipo || "")} · ${money(v.cantidad)}</span>`;
    lista.appendChild(div);
  });
  actualizarContador("vales-contador", filtradas.length, todas.length);
}
