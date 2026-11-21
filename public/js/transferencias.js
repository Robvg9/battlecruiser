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
    .select("id, fecha, estado, responsable_receptor_id, origen:almacen_origen_id(nombre), destino:almacen_destino_id(nombre)")
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
  const stockSnapshot = Array.isArray(window.__BC_TRANSFER_STOCK_SNAPSHOT__)
    ? window.__BC_TRANSFER_STOCK_SNAPSHOT__ : (_cache.stock || []);
  const fila = stockSnapshot.find(
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

function fmtNumTransfer(v) { return typeof window.numberFmt === 'function' ? window.numberFmt(v) : String(v == null ? 0 : v); }

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
  if (window.__BC_TRANSFER_STOCK_CONFIRMED__ !== true) {
    el.textContent = window.__BC_TRANSFER_STOCK_ERROR__
      ? "Existencias sin confirmar: " + window.__BC_TRANSFER_STOCK_ERROR__
      : "Actualizando existencias desde Supabase…";
    el.className = "msg error";
    if (cantInput) cantInput.removeAttribute("max");
    return;
  }
  const disp = info.cantidad;
  el.textContent =
    "Stock disponible en origen: " +
    fmtNumTransfer(disp) +
    (info.aproximado ? " (estimado con operaciones pendientes)" : "");
  el.className = "msg" + (disp <= 0 ? " error" : "");
  if (cantInput) {
    if (disp > 0) cantInput.setAttribute("max", String(disp));
    else cantInput.removeAttribute("max");
  }
}

function formatearMensajeTransferenciaWhatsApp(reporte) {
  if (!reporte || !reporte.almacen || !reporte.responsable || !Array.isArray(reporte.productos) || !reporte.productos.length) {
    throw new Error("El reporte de transferencia está incompleto.");
  }
  const fecha = new Date(reporte.fecha);
  if (Number.isNaN(fecha.getTime())) throw new Error("La transferencia no tiene una fecha válida.");
  const fechaTexto = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric"
  }).format(fecha);
  const fechaHoraTexto = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).format(fecha);
  const productos = reporte.productos.map((producto, index) => {
    const unidad = String(producto.unidad || "unidad").trim();
    return (index + 1) + ". " + String(producto.nombre || "Producto") +
      " — " + fmtNumTransfer(producto.cantidad) + " " + unidad;
  });
  return [
    "ALMACÉN: " + String(reporte.almacen),
    "FECHA: " + fechaTexto,
    "FECHA Y HORA DE LA ENTREGA: " + fechaHoraTexto,
    "RESPONSABLE QUE RECIBIÓ: " + String(reporte.responsable),
    "",
    "PRODUCTOS ENTREGADOS:",
    ...productos
  ].join("\n");
}
window.__BC_FORMAT_TRANSFER_SHARE__ = formatearMensajeTransferenciaWhatsApp;

function almacenPorIdTransferencia(id) {
  return (_cache.almacenes || []).find((almacen) => String(almacen.id) === String(id)) || null;
}

let _responsablesTransferencia = null;
let _cargandoResponsablesTransferencia = null;

async function listarResponsablesTransferencia() {
  if (_responsablesTransferencia) return _responsablesTransferencia;
  if (_cargandoResponsablesTransferencia) return _cargandoResponsablesTransferencia;
  _cargandoResponsablesTransferencia = (async function () {
    const { data, error } = await client.rpc("listar_usuarios_admin", { p_incluir_archivados: false });
    if (error) throw error;
    _responsablesTransferencia = (Array.isArray(data) ? data : [])
      .filter((usuario) => usuario && usuario.id && usuario.activo === true && usuario.archivado !== true)
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
    return _responsablesTransferencia;
  })();
  try {
    return await _cargandoResponsablesTransferencia;
  } finally {
    _cargandoResponsablesTransferencia = null;
  }
}

async function actualizarResponsableReceptorTransferencia() {
  const destino = (document.getElementById("trf-destino") || {}).value || "";
  const contenedor = document.getElementById("trf-responsable-receptor-wrap");
  const select = document.getElementById("trf-responsable-receptor");
  if (!contenedor || !select) return;
  const almacen = almacenPorIdTransferencia(destino);
  const requerido = !!almacen && almacen.tipo === "minorista";
  contenedor.classList.toggle("hidden", !requerido);
  select.required = requerido;
  if (!requerido) {
    select.value = "";
    select.innerHTML = '<option value="">No requerido para este almacén</option>';
    return;
  }
  select.innerHTML = '<option value="">Cargando responsables…</option>';
  try {
    const responsables = await listarResponsablesTransferencia();
    select.innerHTML = '<option value="">Selecciona quién recibe la mercancía…</option>' +
      responsables.map((usuario) =>
        '<option value="' + escHtml(usuario.id) + '">' + escHtml(usuario.nombre || "Usuario") + "</option>"
      ).join("");
    if (!responsables.length) {
      setMsg("msg-transferencias", "No hay responsables activos disponibles para recibir esta transferencia.", false);
    }
  } catch (error) {
    select.innerHTML = '<option value="">No se pudieron cargar los responsables</option>';
    setMsg("msg-transferencias", "No se pudo cargar la lista de responsables: " + explicarError(error, "transferencia"), false);
  }
}

async function copiarMensajeTransferenciaWhatsApp(texto) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(texto);
    return;
  }
  const temporal = document.createElement("textarea");
  temporal.value = texto;
  temporal.setAttribute("readonly", "");
  temporal.style.position = "fixed";
  temporal.style.opacity = "0";
  document.body.appendChild(temporal);
  temporal.select();
  const copiado = document.execCommand("copy");
  temporal.remove();
  if (!copiado) throw new Error("El navegador no permitió copiar el mensaje.");
}

async function compartirMensajeTransferenciaWhatsApp(texto) {
  if (typeof navigator.share !== "function") {
    await copiarMensajeTransferenciaWhatsApp(texto);
    setMsg("msg-transferencias", "Mensaje copiado. Ya puedes pegarlo en el grupo de WhatsApp.", true);
    return;
  }
  try {
    await navigator.share({ text: texto });
    setMsg("msg-transferencias", "Selecciona WhatsApp, elige el grupo y confirma el envío.", true);
  } catch (error) {
    if (error && error.name === "AbortError") return;
    await copiarMensajeTransferenciaWhatsApp(texto);
    setMsg("msg-transferencias", "No se abrió el menú de compartir. El mensaje quedó copiado para pegarlo en WhatsApp.", true);
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
  const destinoEl = document.getElementById("trf-destino");
  if (destinoEl && !destinoEl.dataset.bcTrfReceiver) {
    destinoEl.dataset.bcTrfReceiver = "1";
    destinoEl.addEventListener("change", actualizarResponsableReceptorTransferencia);
    actualizarResponsableReceptorTransferencia();
  }
  const cantEl = document.getElementById("trf-cantidad");
  if (cantEl && !cantEl.dataset.bcTrfStock) {
    cantEl.dataset.bcTrfStock = "1";
    cantEl.addEventListener("input", () => {
      const max = cantEl.getAttribute("max");
      const val = parseFloat(cantEl.value);
      if (max != null && Number.isFinite(val) && val > parseFloat(max)) {
        setMsg("msg-transferencias", "Esa cantidad supera el stock disponible en origen (" +
          fmtNumTransfer(parseFloat(max)) + ").", false);
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
    const almacenDestino = almacenPorIdTransferencia(destino);
    const esDestinoMinorista = !!almacenDestino && almacenDestino.tipo === "minorista";
    const responsableReceptorId = esDestinoMinorista
      ? ((document.getElementById("trf-responsable-receptor") || {}).value || "")
      : "";

    if (!origen || !destino || !producto_id) {
      setMsg("msg-transferencias", "Completá origen, destino y producto.", false);
      return;
    }
    if (String(origen) === String(destino)) {
      setMsg("msg-transferencias", "El origen y el destino no pueden ser el mismo almacén.", false);
      return;
    }
    if (esDestinoMinorista && !responsableReceptorId) {
      setMsg("msg-transferencias", "Selecciona quién recibe la mercancía en el almacén minorista.", false);
      return;
    }
    if (!(cantidad > 0) || !Number.isFinite(cantidad)) {
      setMsg("msg-transferencias", "La cantidad debe ser mayor a 0.", false);
      return;
    }

    // Acquire the mutex BEFORE the asynchronous Supabase stock refresh.
    // Otherwise two rapid submits can both pass the guard while the RPC is pending.
    _enviandoTransferencia = true;
    const textoOriginal = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Comprobando existencias…"; }

    try {
      const refreshStock = window.__BC_TRANSFER_STOCK_REFRESH__;
      if (typeof refreshStock !== "function" || !(await refreshStock())) {
        const detail = window.__BC_TRANSFER_STOCK_ERROR__ ? " " + window.__BC_TRANSFER_STOCK_ERROR__ : "";
        setMsg("msg-transferencias", "No se pudo confirmar el inventario actual desde Supabase. No se inició la transferencia." + detail, false);
        actualizarStockTransferenciaUI();
        return;
      }
      const stockInfo = stockDisponibleOrigen(producto_id, origen);
      if (!stockInfo || stockInfo.cantidad < cantidad) {
        const disp = fmtNumTransfer(stockInfo ? stockInfo.cantidad : 0);
        setMsg("msg-transferencias", "Stock insuficiente en el almacén origen (disponible: " + disp +
          (stockInfo && stockInfo.aproximado ? " · estimado con pendientes" : "") + ").", false);
        return;
      }

      if (!window.confirm("¿Confirmar transferencia de " + cantidad + " unidades? Esto mueve stock real.")) {
        return;
      }
      if (submitBtn) submitBtn.textContent = "Procesando…";

      const payloadTransferencia = {
        p_origen_id: origen,
        p_destino_id: destino,
        p_lineas: [{ producto_id: producto_id, cantidad: cantidad }],
      };
      if (esDestinoMinorista) payloadTransferencia.p_responsable_receptor_id = responsableReceptorId;
      const resultado = await ejecutarOperacion(
        esDestinoMinorista ? "transferencia_receptor" : "transferencia",
        payloadTransferencia
      );

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
      if (typeof window.__BC_TRANSFER_STOCK_REFRESH__ === "function") await window.__BC_TRANSFER_STOCK_REFRESH__();
      actualizarStockTransferenciaUI();
      if (esDestinoMinorista && resultado.data) {
        await mostrarDetalleTransferencia(String(resultado.data));
      }
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
  let shareHtml = "";
  let reporteCompartir = null;

  try {
    if (navigator.onLine && trf.id) {
      const { data: lineas, error } = await client
        .from("transferencias_lineas")
        .select("producto_id, cantidad, productos(nombre, unidad)")
        .eq("transferencia_id", trf.id);
      if (error) throw error;
      if (lineas && lineas.length > 0) {
        lineasHtml = '<div class="detalle-fila detalle-seccion"><span class="detalle-etiqueta">Productos</span></div>';
        lineas.forEach((linea, index) => {
          const nombre = (linea.productos && linea.productos.nombre)
            || (typeof resolverNombreProducto === "function" ? resolverNombreProducto(linea.producto_id) : idCorto(linea.producto_id));
          const unidad = (linea.productos && linea.productos.unidad) || "u";
          lineasHtml += '<div class="detalle-fila"><span class="detalle-etiqueta">' + (index + 1) + ". " + escHtml(nombre) +
            '</span><span class="detalle-valor">' + fmtNumTransfer(linea.cantidad || 0) + " " + escHtml(unidad) + "</span></div>";
        });
      }
    }
  } catch (error) {
    console.warn("[BattleCruiser] No se pudieron cargar líneas de transferencia:", error);
    lineasHtml = '<p class="msg error">No se pudieron cargar los productos de esta transferencia.</p>';
  }

  const completada = String(trf.estado || "").toLocaleLowerCase() === "completada";
  if (trf.responsable_receptor_id && completada && navigator.onLine) {
    try {
      const { data, error } = await client.rpc("bc_mensaje_transferencia", {
        p_transferencia_id: trf.id
      });
      if (error) throw error;
      reporteCompartir = data;
      const texto = formatearMensajeTransferenciaWhatsApp(reporteCompartir);
      shareHtml = '<section class="bc-transfer-share">' +
        '<div class="bc-transfer-share-heading"><strong>Mensaje para el grupo de WhatsApp</strong>' +
        '<span class="muted">Comprueba los datos y compártelo cuando estés listo.</span></div>' +
        '<textarea class="bc-transfer-share-text" aria-label="Mensaje de transferencia para WhatsApp" readonly>' +
        escHtml(texto) + '</textarea>' +
        '<div class="bc-transfer-share-actions">' +
        '<button type="button" class="cc-accion primary" data-trf-share-whatsapp>Compartir por WhatsApp</button>' +
        '<button type="button" class="cc-accion" data-trf-copy-whatsapp>Copiar mensaje</button>' +
        '</div><p class="muted">BattleCruiser no lo envía automáticamente. Selecciona el grupo y confirma el envío en WhatsApp.</p>' +
        '</section>';
    } catch (error) {
      shareHtml = '<p class="msg error">No se pudo preparar el mensaje para compartir: ' +
        escHtml(error && error.message ? error.message : "datos incompletos") + "</p>";
    }
  }

  cont.innerHTML = '<div class="detalle-cabecera">' +
    '<span class="detalle-tipo">Transferencia #' + (trf.id ? idCorto(trf.id) : "—") + "</span>" +
    '<button type="button" class="detalle-cerrar-btn trf-detalle-cerrar-btn" aria-label="Cerrar detalle">&times;</button>' +
    "</div>" +
    '<div class="detalle-cuerpo">' +
    '<div class="detalle-fila"><span class="detalle-etiqueta">Referencia</span><span class="detalle-valor">' + escHtml(trf.id || "—") + "</span></div>" +
    '<div class="detalle-fila"><span class="detalle-etiqueta">Fecha y hora</span><span class="detalle-valor">' + escHtml(fechaHora) + "</span></div>" +
    '<div class="detalle-fila"><span class="detalle-etiqueta">Estado</span><span class="detalle-valor">' + estadoTxt + "</span></div>" +
    '<div class="detalle-fila"><span class="detalle-etiqueta">Almacén origen</span><span class="detalle-valor">' + escHtml(trf.origen ? trf.origen.nombre : "—") + "</span></div>" +
    '<div class="detalle-fila"><span class="detalle-etiqueta">Almacén destino</span><span class="detalle-valor">' + escHtml(trf.destino ? trf.destino.nombre : "—") + "</span></div>" +
    lineasHtml + shareHtml +
    '<p class="muted detalle-nota">El stock se movió al registrar la transferencia mediante una operación atómica.</p>' +
    "</div>";

  cont.classList.remove("hidden");
  _enlazarCerrarTrfDetalle();
  const textoCompartir = reporteCompartir ? formatearMensajeTransferenciaWhatsApp(reporteCompartir) : "";
  const compartir = cont.querySelector("[data-trf-share-whatsapp]");
  if (compartir) compartir.addEventListener("click", async () => {
    try {
      await compartirMensajeTransferenciaWhatsApp(textoCompartir);
    } catch (error) {
      setMsg("msg-transferencias", error.message || "No se pudo compartir el mensaje.", false);
    }
  });
  const copiar = cont.querySelector("[data-trf-copy-whatsapp]");
  if (copiar) copiar.addEventListener("click", async () => {
    try {
      await copiarMensajeTransferenciaWhatsApp(textoCompartir);
      setMsg("msg-transferencias", "Mensaje copiado. Ya puedes pegarlo en WhatsApp.", true);
    } catch (error) {
      setMsg("msg-transferencias", error.message || "No se pudo copiar el mensaje.", false);
    }
  });
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
      <span class="muted">${fechaCorta(v.fecha)} · ${escHtml(v.tipo || "")} · ${fmtNumTransfer(v.cantidad)}</span>`;
    lista.appendChild(div);
  });
  actualizarContador("vales-contador", filtradas.length, todas.length);
}


// Actualiza las listas de historial si otra vista o pestaña registra una
// transferencia o un vale. Los formularios de alta ya refrescan su propio listado.
if (!window.__BC_TRANSFER_HISTORY_EVENTS__) {
  window.__BC_TRANSFER_HISTORY_EVENTS__ = true;
  let transferHistoryTimer = null;
  window.addEventListener('bc:data-changed', function (event) {
    const detail = event.detail || {};
    const domains = detail.domains || [];
    if (detail.offline) return;
    const refreshTransfers = domains.includes('transfers');
    const refreshVales = domains.includes('vales');
    if (!refreshTransfers && !refreshVales) return;
    if (!detail.remote && ['transferencia', 'vale'].includes(detail.operation)) return;
    const transferTab = document.getElementById('tab-transferencias');
    const valesTab = document.getElementById('tab-vales');
    const showTransfers = refreshTransfers && transferTab && transferTab.classList.contains('visible');
    const showVales = refreshVales && valesTab && valesTab.classList.contains('visible');
    if (!showTransfers && !showVales) return;
    window.clearTimeout(transferHistoryTimer);
    transferHistoryTimer = window.setTimeout(async function () {
      try {
        if (showTransfers) await refrescarTransferencias();
        if (showVales) await refrescarVales();
      } catch (error) {
        console.warn('[BattleCruiser] No se pudo actualizar el historial de movimientos:', error);
      }
    }, 180);
  });
}
