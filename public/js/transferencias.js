// ==== Battlecruiser · js/transferencias.js ====
// Transferencias entre almacenes: listado, render y detalle accionable.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

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

// R10+R11: render accionable del historial de transferencias. Filtra
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
    // R11: accionable. data-trf-id permite abrir el detalle real.
    div.className = "lista-item lista-item-accion trf-item";
    div.setAttribute("data-trf-id", t.id || "");
    div.setAttribute("role", "button");
    div.setAttribute("tabindex", "0");
    div.innerHTML = `<span>${t.origen ? escHtml(t.origen.nombre) : "—"} → ${t.destino ? escHtml(t.destino.nombre) : "—"} <span class="muted">· #${t.id ? idCorto(t.id) : "—"}</span></span>
      <span class="muted">${fechaCorta(t.fecha)} · ${escHtml(t.estado || "")}</span>`;
    lista.appendChild(div);
  });
  actualizarContador("trf-contador", filtradas.length, todas.length);
}

safeInit("form-transferencia", () => {
  document.getElementById("form-transferencia").addEventListener("submit", async (e) => {
    e.preventDefault();
    const origen = document.getElementById("trf-origen").value;
    const destino = document.getElementById("trf-destino").value;
    const producto_id = document.getElementById("trf-producto").value;
    const cantidad = parseFloat(document.getElementById("trf-cantidad").value);
    const submitBtn = e.target.querySelector("button[type='submit']");

    if (origen === destino) {
      setMsg("msg-transferencias", "El origen y el destino no pueden ser el mismo almacén.", false);
      return;
    }
    if (!(cantidad > 0)) {
      setMsg("msg-transferencias", "La cantidad debe ser mayor a 0.", false);
      return;
    }
    if (!window.confirm("¿Confirmar transferencia de " + cantidad + " unidades? Esto mueve stock real.")) {
      return;
    }

    submitBtn.disabled = true;
    const resultado = await ejecutarOperacion("transferencia", {
      p_origen_id: origen, p_destino_id: destino,
      p_lineas: [{ producto_id, cantidad }],
    });
    submitBtn.disabled = false;

    if (!resultado.ok) {
      setMsg("msg-transferencias", "No se pudo transferir: " + explicarError(resultado.error, "transferencia"), false);
      return;
    }
    e.target.reset();
    if (resultado.offline) {
      setMsg("msg-transferencias", "✓ Guardada localmente — se sincronizará al recuperar conexión.", true);
      return;
    }
    setMsg("msg-transferencias", "Transferencia registrada.", true);
    await refrescarTransferencias();
    await refrescarStockYSelects();
  });
});

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

// R10+R12: render accionable del historial de vales. Filtra _cache.vales en
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
    // R12: indicacion visual segun el tipo (sin cambiar la logica de negocio).
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

// ---- R11 / R12 / R6-R7 — Detalle accionable + auditoría de movimientos
function mostrarDetalleTransferencia(trfId) {
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
  cont.innerHTML = '<div class="detalle-cabecera">'
    + '<span class="detalle-tipo">Transferencia #' + (trf.id ? idCorto(trf.id) : "—") + '</span>'
    + '<button type="button" class="detalle-cerrar-btn trf-detalle-cerrar-btn" aria-label="Cerrar detalle">&times;</button>'
    + '</div>'
    + '<div class="detalle-cuerpo">'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Referencia</span><span class="detalle-valor">' + escHtml(trf.id || "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Fecha y hora</span><span class="detalle-valor">' + escHtml(fechaHora) + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Estado</span><span class="detalle-valor">' + escHtml(trf.estado || "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Almacén origen</span><span class="detalle-valor">' + escHtml(trf.origen ? trf.origen.nombre : "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Almacén destino</span><span class="detalle-valor">' + escHtml(trf.destino ? trf.destino.nombre : "—") + '</span></div>'
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

// R12: detalle accionable de un vale. Datos reales: id, fecha, tipo,
// cantidad, producto, almacén. Etiqueta legible del tipo para auditoría
// (sin cambiar el dato real). Indicación visual por tipo en la lista.
