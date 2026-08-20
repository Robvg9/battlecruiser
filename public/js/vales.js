// ==== Battlecruiser · js/vales.js ====
// Vales de salida: detalle accionable y utilidades de lista.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

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

safeInit("form-vale", () => {
  document.getElementById("form-vale").addEventListener("submit", async (e) => {
    e.preventDefault();
    const producto_id = document.getElementById("vale-producto").value;
    const almacen_id = document.getElementById("vale-almacen").value;
    const tipo = document.getElementById("vale-tipo").value;
    const cantidad = parseFloat(document.getElementById("vale-cantidad").value);
    const submitBtn = e.target.querySelector("button[type='submit']");

    if (!(cantidad > 0)) {
      setMsg("msg-vales", "La cantidad debe ser mayor a 0.", false);
      return;
    }
    if (!window.confirm("¿Confirmar vale de salida (" + tipo + ") por " + cantidad + " unidades? Esto descuenta stock real.")) {
      return;
    }

    submitBtn.disabled = true;
    const resultado = await ejecutarOperacion("vale", {
      p_producto_id: producto_id, p_almacen_id: almacen_id,
      p_tipo: tipo, p_cantidad: cantidad,
    });
    submitBtn.disabled = false;

    if (!resultado.ok) {
      setMsg("msg-vales", "No se pudo registrar: " + explicarError(resultado.error, "vale de salida"), false);
      return;
    }
    e.target.reset();
    if (resultado.offline) {
      setMsg("msg-vales", "✓ Guardada localmente — se sincronizará al recuperar conexión.", true);
      return;
    }
    setMsg("msg-vales", "Vale de salida registrado, stock actualizado.", true);
    await refrescarVales();
    await refrescarStockYSelects();
  });
});
