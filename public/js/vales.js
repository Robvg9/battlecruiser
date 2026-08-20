// ==== Battlecruiser · js/vales.js ====
// Vales de salida: detalle accionable y utilidades de redondeo monetario.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

function mostrarDetalleVale(valeId) {
  const cont = document.getElementById("vale-detalle");
  if (!cont) return;
  const vale = (_cache.vales || []).find((v) => v.id === valeId);
  if (!vale) {
    cont.innerHTML = '<p class="lista-estado">No se encontró el vale.</p>'
      + '<button type="button" class="cc-accion vale-detalle-cerrar-btn">Volver</button>';
    cont.classList.remove("hidden");
    _enlazarCerrarValeDetalle();
    return;
  }
  const fechaHora = vale.fecha ? fechaHoraCompleta(vale.fecha) : "—";
  const tipoEtiqueta = { merma: "Merma", donacion: "Donación", regalo: "Regalo", vencido: "Vencido" }[vale.tipo] || vale.tipo || "—";
  cont.innerHTML = '<div class="detalle-cabecera">'
    + '<span class="detalle-tipo">Vale #' + (vale.id ? idCorto(vale.id) : "—") + '</span>'
    + '<button type="button" class="detalle-cerrar-btn vale-detalle-cerrar-btn" aria-label="Cerrar detalle">&times;</button>'
    + '</div>'
    + '<div class="detalle-cuerpo">'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Referencia</span><span class="detalle-valor">' + escHtml(vale.id || "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Fecha y hora</span><span class="detalle-valor">' + escHtml(fechaHora) + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Tipo</span><span class="detalle-valor">' + escHtml(tipoEtiqueta) + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Producto</span><span class="detalle-valor">' + escHtml(vale.productos ? vale.productos.nombre : "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Almacén</span><span class="detalle-valor">' + escHtml(vale.almacenes ? vale.almacenes.nombre : "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Cantidad</span><span class="detalle-valor">' + money(vale.cantidad || 0) + ' u</span></div>'
    + '</div>';
  cont.classList.remove("hidden");
  _enlazarCerrarValeDetalle();
  cont.focus();
}
function _enlazarCerrarValeDetalle() {
  const cont = document.getElementById("vale-detalle");
  if (!cont) return;
  cont.querySelectorAll(".vale-detalle-cerrar-btn").forEach((btn) => {
    btn.addEventListener("click", cerrarDetalleVale);
  });
}
function cerrarDetalleVale() {
  const cont = document.getElementById("vale-detalle");
  if (cont) { cont.classList.add("hidden"); cont.innerHTML = ""; }
}

// R7: helper de redondeo a centavos para comparar montos sin error de coma
// flotante (149.999999 vs 150.00). Reutiliza el mismo criterio que money().
function redondearCentavos(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round((v + Number.EPSILON) * 100) / 100 : 0;
}

// R6/R7: detalle accionable + auditoría de una venta. Reutiliza _cache.ventas
let _ventaDetalleCargandoId = null; // evita cargas solapadas del detalle
