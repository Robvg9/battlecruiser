// BattleCruiser — M27.1-FE: Rediseño completo Ventas → POS limpio
// Fuente de verdad: ventaLineas, agregarLineaVenta, actualizarCantidadLinea,
// renderVentaLineas, obtenerStockDisponible, ejecutarOperacion("venta"),
// obtenerAlmacenIdOperativoVenta, venta-turno-ui, m26-9 data-truth, categorías.
// NO toca Supabase / registrar_venta / offline core / permisos / navegación.
// NO duplica carrito ni cola. Unifica layout POS + pago/vuelto + historial secundario.
(function () {
  "use strict";

  var FLAG = "__bcM271";
  var STYLE_ID = "bc-m271-ventas-pos-style";
  var LAYOUT_ID = "bc-m271-pos-layout";
  var CART_ID = "bc-m271-cart-panel";
  var CAT_COL_ID = "bc-m271-catalog-col";
  var HIST_WRAP_ID = "bc-m271-historial-wrap";
  var PAGO_WRAP_ID = "bc-m271-pago-wrap";
  var VERSION_MARK = "27.1";

  function sameId(a, b) {
    if (a == null || b == null) return false;
    return String(a) === String(b);
  }

  function almOperativo() {
    if (typeof obtenerAlmacenIdOperativoVenta === "function") {
      var id = obtenerAlmacenIdOperativoVenta();
      if (id) return id;
    }
    if (typeof bcSincronizarSelectAlmacenTurno === "function") {
      try {
        var id2 = bcSincronizarSelectAlmacenTurno();
        if (id2) return id2;
      } catch (e) {}
    }
    var sel = document.getElementById("venta-almacen");
    return sel && sel.value ? sel.value : null;
  }

  function ensureAlmacenSelect(almId) {
    if (!almId) return null;
    if (typeof bcSincronizarSelectAlmacenTurno === "function") {
      try {
        bcSincronizarSelectAlmacenTurno();
      } catch (e) {}
    }
    var sel = document.getElementById("venta-almacen");
    if (!sel) return almId;
    var found = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sameId(sel.options[i].value, almId)) {
        found = true;
        break;
      }
    }
    if (!found) {
      var opt = document.createElement("option");
      opt.value = almId;
      opt.textContent =
        typeof nombreAlmacenOperativoVenta === "function"
          ? nombreAlmacenOperativoVenta(almId)
          : "Almacén del turno";
      sel.appendChild(opt);
    }
    sel.value = almId;
    try {
      if (typeof ventaAlmacenesTipo !== "undefined" && !ventaAlmacenesTipo[almId]) {
        var alm =
          typeof _cache !== "undefined" && _cache.almacenes
            ? (_cache.almacenes || []).find(function (a) {
                return sameId(a.id, almId);
              })
            : null;
        ventaAlmacenesTipo[almId] = (alm && alm.tipo) || "venta";
      }
    } catch (e2) {}
    return almId;
  }

  function moneySafe(n) {
    if (typeof money === "function") return money(n);
    var v = Number(n) || 0;
    return v.toFixed(2);
  }

  function escSafe(t) {
    if (typeof escHtml === "function") return escHtml(String(t || ""));
    return String(t || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- CSS POS limpio ---------- */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = [
      "#tab-ventas.bc-m271-pos{display:flex;flex-direction:column;gap:10px;min-height:0}",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #" + LAYOUT_ID + ",",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #" + CART_ID + ",",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #" + CAT_COL_ID + ",",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #venta-operativa-bloque,",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #bc-venta-carrito-bar,",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #bc-venta-pos-layout,",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #bc-venta-cart-panel,",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #venta-modo-buscador,",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #venta-modo-catalogo,",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #form-venta-linea,",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno .venta-vista-toggle,",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #venta-lineas,",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #venta-total-wrap,",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #btn-confirmar-venta,",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #msg-venta,",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #msg-venta-linea,",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #" + HIST_WRAP_ID + ",",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #" + PAGO_WRAP_ID + "{display:none!important}",
      "#tab-ventas.bc-m271-pos.bc-venta-sin-turno #venta-sin-turno{display:block!important}",

      "#" + LAYOUT_ID + "{display:flex;flex-direction:column;gap:12px;width:100%;min-height:0}",
      "#" + CAT_COL_ID + "{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:8px}",
      "#" + CART_ID + "{",
      "flex:0 0 auto;display:flex;flex-direction:column;gap:8px;",
      "background:var(--stone,#142420);border:1px solid var(--gold-dim,#c9a24d55);",
      "border-radius:14px;padding:12px 14px;min-height:0",
      "}",
      "#" + CART_ID + " .bc-m271-cart-head{",
      "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px",
      "}",
      "#" + CART_ID + " .bc-m271-cart-title{",
      "font-family:Cormorant Garamond,serif;font-size:1.2rem;color:var(--gold,#c9a24d);margin:0",
      "}",
      "#" + CART_ID + " #venta-lineas{",
      "max-height:min(40vh,300px);overflow-y:auto;margin:0;gap:6px;",
      "display:flex!important;flex-direction:column",
      "}",
      "#" + CART_ID + " #venta-lineas .lista-item{",
      "padding:10px 12px;border-radius:10px;align-items:center;gap:8px",
      "}",
      "#" + CART_ID + " .venta-linea-btn{width:38px;height:38px;font-size:18px;border-radius:10px}",
      "#" + CART_ID + " .venta-linea-cant-input{width:56px;height:38px;font-size:15px;text-align:center}",
      "#" + CART_ID + " .venta-linea-borrar{min-height:38px;padding:6px 12px;border-radius:10px}",
      "#" + CART_ID + " .venta-total{margin:0;padding:12px 14px;border-radius:12px}",
      "#" + CART_ID + " .venta-total-valor{font-size:1.6rem}",
      "#" + CART_ID + " .btn-confirmar-venta{",
      "width:100%;min-height:52px;font-size:16px;border-radius:12px;letter-spacing:.03em;font-weight:700",
      "}",

      /* Pago / vuelto */
      "#" + PAGO_WRAP_ID + "{display:flex;flex-direction:column;gap:6px;padding:8px 0 4px}",
      "#" + PAGO_WRAP_ID + " label{font-size:12px;color:var(--mist,#b8c4bc);letter-spacing:.04em}",
      "#" + PAGO_WRAP_ID + " .bc-m271-pago-row{display:flex;gap:8px;align-items:center}",
      "#" + PAGO_WRAP_ID + " #venta-cliente-paga{",
      "flex:1;min-height:44px;font-size:16px;padding:10px 12px;border-radius:10px;",
      "background:var(--void,#0c1c18);border:1px solid var(--gold-dim);color:var(--text,#e8efe9)",
      "}",
      "#" + PAGO_WRAP_ID + " .bc-m271-vuelto{",
      "font-size:15px;font-weight:600;padding:8px 10px;border-radius:10px;",
      "background:rgba(201,162,77,.08);border:1px solid transparent",
      "}",
      "#" + PAGO_WRAP_ID + " .bc-m271-vuelto.ok{color:var(--gold-bright,#e0c078);border-color:var(--gold-dim)}",
      "#" + PAGO_WRAP_ID + " .bc-m271-vuelto.faltante{color:#e07070;border-color:rgba(224,112,112,.35)}",
      "#" + PAGO_WRAP_ID + " .bc-m271-vuelto.hidden{display:none}",

      /* Catálogo compacto */
      "#tab-ventas.bc-m271-pos .venta-vista-toggle{display:none!important}",
      "#tab-ventas.bc-m271-pos #venta-modo-catalogo,",
      "#tab-ventas.bc-m271-pos #venta-modo-catalogo.hidden{display:block!important}",
      "#tab-ventas.bc-m271-pos #venta-modo-buscador{margin-bottom:0}",
      "#tab-ventas.bc-m271-pos #venta-producto{display:none!important}",
      "#tab-ventas.bc-m271-pos #venta-producto-buscar{",
      "width:100%;height:46px;font-size:16px;padding:10px 14px;border-radius:12px",
      "}",
      "#tab-ventas.bc-m271-pos #form-venta-linea{",
      "display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0;background:transparent;border:0",
      "}",
      "#tab-ventas.bc-m271-pos #form-venta-linea .venta-buscar-wrap{flex:1 1 100%}",
      "#tab-ventas.bc-m271-pos #venta-cantidad{flex:1 1 90px;min-width:80px;max-width:120px;height:44px;font-size:16px}",
      "#tab-ventas.bc-m271-pos #form-venta-linea button[type=submit]{flex:1 1 130px;min-height:44px}",
      "#tab-ventas.bc-m271-pos .catalogo-categorias{",
      "display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;",
      "padding:2px 0 6px;margin:0;scrollbar-width:thin",
      "}",
      "#tab-ventas.bc-m271-pos .catalogo-chip{",
      "flex:0 0 auto;min-height:36px;padding:8px 14px;font-size:13px;border-radius:999px",
      "}",
      "#tab-ventas.bc-m271-pos .catalogo-grid{",
      "display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;",
      "margin:0;padding-bottom:4px",
      "}",
      "#tab-ventas.bc-m271-pos .catalogo-card{",
      "display:flex;flex-direction:column;align-items:stretch;gap:4px;",
      "min-height:0;padding:10px;border-radius:12px;text-align:left;",
      "touch-action:manipulation;cursor:pointer;position:relative",
      "}",
      "#tab-ventas.bc-m271-pos .catalogo-card-nombre{font-size:13px;font-weight:600;line-height:1.25}",
      "#tab-ventas.bc-m271-pos .catalogo-card-precio{font-size:15px;font-weight:700;color:var(--gold-bright,#e0c078)}",
      "#tab-ventas.bc-m271-pos .catalogo-card-stock{font-size:11px;color:var(--mist)}",
      "#tab-ventas.bc-m271-pos .catalogo-card-cta{",
      "margin-top:4px;font-size:12px;font-weight:600;padding:6px 8px;border-radius:8px;",
      "background:rgba(201,162,77,.15);color:var(--gold);text-align:center;border:1px solid var(--gold-dim)",
      "}",
      "#tab-ventas.bc-m271-pos .catalogo-card-img{width:100%;height:56px;object-fit:cover;border-radius:8px}",
      "#tab-ventas.bc-m271-pos .catalogo-card-img-vacia{display:block;height:8px}",

      /* Historial secundario */
      "#" + HIST_WRAP_ID + "{margin-top:8px}",
      "#" + HIST_WRAP_ID + " .bc-m271-hist-toggle{",
      "width:100%;min-height:44px;border-radius:12px;border:1px solid var(--gold-dim);",
      "background:transparent;color:var(--mist);font-size:14px;cursor:pointer",
      "}",
      "#" + HIST_WRAP_ID + " .bc-m271-hist-body.hidden{display:none!important}",
      "#" + HIST_WRAP_ID + " .bc-m271-hist-body{margin-top:10px}",

      /* Desktop: catálogo | carrito */
      "@media(min-width:900px){",
      "#" + LAYOUT_ID + "{flex-direction:row;align-items:stretch;gap:16px}",
      "#" + CAT_COL_ID + "{flex:1 1 58%;min-width:0}",
      "#" + CART_ID + "{",
      "flex:0 0 340px;max-width:380px;position:sticky;top:8px;align-self:flex-start;",
      "max-height:calc(100vh - 110px);overflow:hidden",
      "}",
      "#" + CART_ID + " #venta-lineas{flex:1 1 auto;max-height:none;min-height:100px;overflow-y:auto}",
      "#" + CART_ID + " .bc-m271-cart-footer{flex:0 0 auto;display:flex;flex-direction:column;gap:8px}",
      "}",

      /* Legacy bars ocultos si vacíos */
      "#bc-venta-carrito-bar:empty,#bc-venta-pos-layout:empty{display:none!important}",
      "#tab-ventas.bc-m271-pos #bc-venta-carrito-bar{position:static;background:transparent;border:0;padding:0;margin:0}"
    ].join("");
    document.head.appendChild(s);
  }

  /* ---------- Layout POS ---------- */
  function ensureLayout() {
    var tab = document.getElementById("tab-ventas");
    if (!tab) return;
    tab.classList.add("bc-m271-pos", "bc-pos");

    var bloque = document.getElementById("venta-operativa-bloque");
    var host = bloque || tab;

    var layout = document.getElementById(LAYOUT_ID);
    if (!layout) {
      layout = document.createElement("div");
      layout.id = LAYOUT_ID;
      host.appendChild(layout);
    }

    var catCol = document.getElementById(CAT_COL_ID);
    if (!catCol) {
      catCol = document.createElement("div");
      catCol.id = CAT_COL_ID;
      layout.appendChild(catCol);
    }

    var cart = document.getElementById(CART_ID);
    if (!cart) {
      cart = document.createElement("aside");
      cart.id = CART_ID;
      cart.setAttribute("aria-label", "Carrito de venta");
      cart.innerHTML =
        '<div class="bc-m271-cart-head"><h3 class="bc-m271-cart-title">Carrito</h3></div>' +
        '<div class="bc-m271-cart-footer"></div>';
      layout.appendChild(cart);
    }

    // Panel almacén arriba
    var panelAlm = document.getElementById("venta-almacen-operativo");
    if (panelAlm && bloque && panelAlm.parentNode === bloque) {
      if (layout.previousSibling !== panelAlm) {
        bloque.insertBefore(panelAlm, layout);
      }
    }

    // Catálogo + buscador → columna izquierda
    [
      "venta-vista-toggle",
      "venta-modo-buscador",
      "venta-modo-catalogo",
      "form-venta-linea",
      "msg-venta-linea",
      "venta-stock-disponible"
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (!catCol.contains(el)) catCol.appendChild(el);
    });

    var modoCat = document.getElementById("venta-modo-catalogo");
    if (modoCat) {
      modoCat.classList.remove("hidden");
      ["catalogo-categorias", "catalogo-grid"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el && !modoCat.contains(el)) modoCat.appendChild(el);
      });
      if (!catCol.contains(modoCat)) catCol.appendChild(modoCat);
    }

    // Carrito
    var footer = cart.querySelector(".bc-m271-cart-footer");
    if (!footer) {
      footer = document.createElement("div");
      footer.className = "bc-m271-cart-footer";
      cart.appendChild(footer);
    }

    var lineas = document.getElementById("venta-lineas");
    var totalWrap = document.getElementById("venta-total-wrap");
    var btn = document.getElementById("btn-confirmar-venta");
    var msgVenta = document.getElementById("msg-venta");

    if (lineas && lineas.parentNode !== cart) {
      var head = cart.querySelector(".bc-m271-cart-head");
      if (head && head.nextSibling) cart.insertBefore(lineas, head.nextSibling);
      else cart.insertBefore(lineas, footer);
    }
    if (totalWrap && footer && totalWrap.parentNode !== footer) footer.appendChild(totalWrap);

    ensurePagoUI(footer);

    if (btn && footer && btn.parentNode !== footer) footer.appendChild(btn);
    if (msgVenta && footer && msgVenta.parentNode !== footer) footer.appendChild(msgVenta);

    // Legacy bars
    ["bc-venta-carrito-bar", "bc-venta-pos-layout", "bc-venta-cart-panel"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el === layout || el === cart) return;
      while (el.firstChild) el.removeChild(el.firstChild);
      el.style.display = "none";
    });

    ensureHistorialSecundario(tab);
  }

  /* ---------- Pago cliente / vuelto (solo UX local) ---------- */
  function ensurePagoUI(footer) {
    if (!footer) return;
    var wrap = document.getElementById(PAGO_WRAP_ID);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = PAGO_WRAP_ID;
      wrap.innerHTML =
        '<label for="venta-cliente-paga">Cliente paga</label>' +
        '<div class="bc-m271-pago-row">' +
        '<input id="venta-cliente-paga" type="number" inputmode="decimal" step="0.01" min="0" placeholder="$0.00" autocomplete="off">' +
        "</div>" +
        '<div id="venta-vuelto" class="bc-m271-vuelto hidden" aria-live="polite"></div>';
      footer.insertBefore(wrap, footer.firstChild);
    }
    var input = document.getElementById("venta-cliente-paga");
    if (input && !input.dataset[FLAG]) {
      input.dataset[FLAG] = "1";
      input.addEventListener("input", actualizarVuelto);
      input.addEventListener("change", actualizarVuelto);
    }
  }

  function totalCarrito() {
    if (typeof ventaLineas === "undefined" || !ventaLineas) return 0;
    return ventaLineas.reduce(function (s, l) {
      return s + (Number(l.subtotal) || 0);
    }, 0);
  }

  function actualizarVuelto() {
    var input = document.getElementById("venta-cliente-paga");
    var out = document.getElementById("venta-vuelto");
    if (!input || !out) return;
    var raw = (input.value || "").trim();
    if (raw === "") {
      out.className = "bc-m271-vuelto hidden";
      out.textContent = "";
      return;
    }
    var paga = parseFloat(raw);
    if (isNaN(paga) || paga < 0) {
      out.className = "bc-m271-vuelto faltante";
      out.textContent = "Monto inválido";
      return;
    }
    var total = totalCarrito();
    var diff = Math.round((paga - total) * 100) / 100;
    if (diff < 0) {
      out.className = "bc-m271-vuelto faltante";
      out.textContent = "Faltan $" + moneySafe(Math.abs(diff));
    } else if (diff === 0) {
      out.className = "bc-m271-vuelto ok";
      out.textContent = "Vuelto: $0.00";
    } else {
      out.className = "bc-m271-vuelto ok";
      out.textContent = "Vuelto: $" + moneySafe(diff);
    }
  }

  function resetPago() {
    var input = document.getElementById("venta-cliente-paga");
    if (input) input.value = "";
    actualizarVuelto();
  }

  /* ---------- Historial secundario ---------- */
  function ensureHistorialSecundario(tab) {
    if (!tab) return;
    var existing = document.getElementById(HIST_WRAP_ID);
    if (existing) return;

    var h3 = null;
    tab.querySelectorAll("h3").forEach(function (h) {
      if (/Historial/i.test(h.textContent || "")) h3 = h;
    });
    var controles = tab.querySelector(".ventas-historial-controles");
    var lista = document.getElementById("lista-ventas");
    var detalle = document.getElementById("venta-detalle");

    var wrap = document.createElement("div");
    wrap.id = HIST_WRAP_ID;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bc-m271-hist-toggle";
    btn.id = "bc-m271-hist-btn";
    btn.textContent = "Historial de ventas";
    btn.setAttribute("aria-expanded", "false");

    var body = document.createElement("div");
    body.className = "bc-m271-hist-body hidden";
    body.id = "bc-m271-hist-body";

    if (h3) body.appendChild(h3);
    if (controles) body.appendChild(controles);
    if (lista) body.appendChild(lista);
    if (detalle) body.appendChild(detalle);

    wrap.appendChild(btn);
    wrap.appendChild(body);

    var host = document.getElementById("venta-operativa-bloque") || tab;
    host.appendChild(wrap);

    btn.addEventListener("click", function () {
      var open = body.classList.toggle("hidden");
      // toggle returns new state of classList; if now has hidden → closed
      var isOpen = !body.classList.contains("hidden");
      btn.setAttribute("aria-expanded", String(isOpen));
      btn.textContent = isOpen ? "Ocultar historial" : "Historial de ventas";
    });
  }

  /* ---------- Mejorar tarjetas del catálogo (CTA Agregar) ---------- */
  function enhanceCatalogCards() {
    var grid = document.getElementById("catalogo-grid");
    if (!grid) return;
    grid.querySelectorAll(".catalogo-card").forEach(function (card) {
      if (card.querySelector(".catalogo-card-cta")) return;
      var cta = document.createElement("span");
      cta.className = "catalogo-card-cta";
      cta.textContent = "Agregar";
      card.appendChild(cta);
    });
  }

  function patchRenderCatalogoGrid() {
    if (typeof renderCatalogoGrid !== "function") return;
    if (renderCatalogoGrid[FLAG]) return;
    var orig = renderCatalogoGrid;
    window.renderCatalogoGrid = function () {
      var r = orig.apply(this, arguments);
      try {
        enhanceCatalogCards();
        // Filtro de búsqueda de texto (coexiste con categorías)
        var term = (window._ventaCatalogoFiltroTexto || "").trim().toLowerCase();
        if (term) {
          var grid = document.getElementById("catalogo-grid");
          if (grid) {
            grid.querySelectorAll(".catalogo-card").forEach(function (card) {
              var nombre =
                (card.querySelector(".catalogo-card-nombre") || {}).textContent || "";
              card.style.display = nombre.toLowerCase().indexOf(term) !== -1 ? "" : "none";
            });
          }
        }
      } catch (e) {}
      return r;
    };
    window.renderCatalogoGrid[FLAG] = true;
  }

  /* ---------- Patch renderVentaLineas: refrescar vuelto ---------- */
  function patchRenderVentaLineas() {
    if (typeof renderVentaLineas !== "function") return;
    if (renderVentaLineas[FLAG]) return;
    var orig = renderVentaLineas;
    window.renderVentaLineas = function () {
      var r = orig.apply(this, arguments);
      try {
        actualizarVuelto();
      } catch (e) {}
      return r;
    };
    window.renderVentaLineas[FLAG] = true;
  }

  /* ---------- Tras confirmar venta: limpiar pago ---------- */
  function patchConfirmSuccess() {
    if (typeof setMsg !== "function" || setMsg[FLAG]) return;
    var orig = setMsg;
    window.setMsg = function (id, text, ok) {
      var r = orig.apply(this, arguments);
      if (id === "msg-venta" && ok && text && /✓|registrada|guardada localmente/i.test(String(text))) {
        resetPago();
      }
      return r;
    };
    window.setMsg[FLAG] = true;
  }

  /* ---------- Buscador → filtro catálogo ---------- */
  function wireSearch() {
    var input = document.getElementById("venta-producto-buscar");
    if (!input || input.dataset[FLAG + "Search"] === "1") return;
    input.dataset[FLAG + "Search"] = "1";
    input.placeholder = "🔎 Buscar producto…";
    input.addEventListener("input", function () {
      window._ventaCatalogoFiltroTexto = (input.value || "").trim().toLowerCase();
      if (typeof renderCatalogoGrid === "function") renderCatalogoGrid();
    });
  }

  /* ---------- Click tarjeta: almacén del turno (refuerzo) ---------- */
  function wireCatalogClick() {
    var grid = document.getElementById("catalogo-grid");
    if (!grid || grid.dataset[FLAG + "Click"] === "1") return;
    grid.dataset[FLAG + "Click"] = "1";
    grid.addEventListener(
      "click",
      function (e) {
        var card = e.target.closest(".catalogo-card");
        if (!card) return;
        var almId = almOperativo();
        if (!almId) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (typeof setMsg === "function") {
            setMsg("msg-venta-linea", "No puedes vender sin un turno abierto.", false);
          }
          if (typeof actualizarPanelAlmacenVenta === "function") actualizarPanelAlmacenVenta();
          return;
        }
        ensureAlmacenSelect(almId);
        var productoId = card.dataset.productoId;
        if (!productoId) return;
        // Dejar que handlers existentes (venta-turno-ui / m26) actúen;
        // solo asegurar select sincronizado (ya hecho).
      },
      true
    );
  }

  /* ---------- Confirmar: texto + almacén ---------- */
  function wireConfirmBtn() {
    var btn = document.getElementById("btn-confirmar-venta");
    if (!btn) return;
    if (!btn.dataset[FLAG + "Label"]) {
      btn.dataset[FLAG + "Label"] = "1";
      if (!/CONFIRMAR/i.test(btn.textContent || "")) {
        btn.textContent = "CONFIRMAR VENTA";
      }
    }
    if (btn.dataset[FLAG + "Click"] === "1") return;
    btn.dataset[FLAG + "Click"] = "1";
    btn.addEventListener(
      "click",
      function () {
        var almId = almOperativo();
        if (almId) ensureAlmacenSelect(almId);
      },
      true
    );
  }

  /* ---------- Hook panel turno ---------- */
  function patchActualizarPanel() {
    if (typeof actualizarPanelAlmacenVenta !== "function") return;
    if (actualizarPanelAlmacenVenta[FLAG]) return;
    var orig = actualizarPanelAlmacenVenta;
    window.actualizarPanelAlmacenVenta = function () {
      var r = orig.apply(this, arguments);
      try {
        ensureLayout();
        wireSearch();
        wireCatalogClick();
        wireConfirmBtn();
        if (typeof renderCatalogoGrid === "function") renderCatalogoGrid();
      } catch (e) {}
      return r;
    };
    window.actualizarPanelAlmacenVenta[FLAG] = true;
  }

  /* ---------- Boot ---------- */
  function boot() {
    injectStyles();
    ensureLayout();
    patchRenderCatalogoGrid();
    patchRenderVentaLineas();
    patchConfirmSuccess();
    patchActualizarPanel();
    wireSearch();
    wireCatalogClick();
    wireConfirmBtn();
    try {
      if (typeof actualizarPanelAlmacenVenta === "function") actualizarPanelAlmacenVenta();
    } catch (e) {}
    try {
      if (typeof renderCatalogoGrid === "function") renderCatalogoGrid();
    } catch (e2) {}
    try {
      if (typeof renderVentaLineas === "function") renderVentaLineas();
    } catch (e3) {}
  }

  function start() {
    boot();
    var n = 0;
    var t = setInterval(function () {
      n++;
      ensureLayout();
      wireSearch();
      wireCatalogClick();
      wireConfirmBtn();
      patchRenderCatalogoGrid();
      patchRenderVentaLineas();
      patchConfirmSuccess();
      patchActualizarPanel();
      if (n >= 20) clearInterval(t);
    }, 280);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(start, 650);
    });
  } else {
    setTimeout(start, 650);
  }

  try {
    window.__BC_M271_POS__ = VERSION_MARK;
  } catch (e) {}
})();
