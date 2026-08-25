// BattleCruiser — M26.7-FE: reparación integral ventas + carrito + drawer
// Reutiliza: ventaLineas, agregarLineaVenta, renderVentaLineas, actualizarCantidadLinea,
// obtenerStockDisponible, ejecutarOperacion("venta"), _turnoActual, venta-turno-ui.
// NO toca Supabase/RPC. NO duplica carrito ni lógica de ventas.
(function () {
  "use strict";

  var STYLE_ID = "bc-m267-style";
  var LAYOUT_ID = "bc-venta-pos-layout";
  var CART_PANEL_ID = "bc-venta-cart-panel";

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
      var id2 = bcSincronizarSelectAlmacenTurno();
      if (id2) return id2;
    }
    var sel = document.getElementById("venta-almacen");
    return sel && sel.value ? sel.value : null;
  }

  function ensureAlmacenEnSelect(almId) {
    if (!almId) return;
    var sel = document.getElementById("venta-almacen");
    if (!sel) return;
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
    } catch (e) {}
  }

  /* ---------- CSS: layout POS + drawer layering + sin turno ---------- */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = [
      /* Drawer / sidebar: por encima del contenido de la app */
      ".sidebar-backdrop{z-index:900!important;background:rgba(6,14,11,0.72)!important}",
      ".sidebar{z-index:910!important;background:linear-gradient(180deg,var(--stone-2) 0%,var(--stone) 100%)!important}",
      ".sidebar.open{pointer-events:auto}",
      "body.bc-sidebar-open .main-content,body.bc-sidebar-open .app-header,body.bc-sidebar-open .app-footer{pointer-events:none!important}",
      "body.bc-sidebar-open .sidebar,body.bc-sidebar-open .sidebar-backdrop{pointer-events:auto!important}",
      /* En desktop el sidebar es columna del grid: no aplicar overlay */
      "@media(min-width:1024px){",
      "body.bc-sidebar-open .main-content,body.bc-sidebar-open .app-header,body.bc-sidebar-open .app-footer{pointer-events:auto!important}",
      ".sidebar-backdrop{display:none!important}",
      "}",

      /* Sin turno: ocultar historial operativo y todo el POS */
      "#tab-ventas.bc-venta-sin-turno #venta-operativa-bloque,",
      "#tab-ventas.bc-venta-sin-turno #bc-venta-carrito-bar,",
      "#tab-ventas.bc-venta-sin-turno #bc-venta-pos-layout,",
      "#tab-ventas.bc-venta-sin-turno #bc-venta-cart-panel,",
      "#tab-ventas.bc-venta-sin-turno #venta-modo-buscador,",
      "#tab-ventas.bc-venta-sin-turno #venta-modo-catalogo,",
      "#tab-ventas.bc-venta-sin-turno #form-venta-linea,",
      "#tab-ventas.bc-venta-sin-turno .venta-vista-toggle,",
      "#tab-ventas.bc-venta-sin-turno #venta-lineas,",
      "#tab-ventas.bc-venta-sin-turno #venta-total-wrap,",
      "#tab-ventas.bc-venta-sin-turno #btn-confirmar-venta,",
      "#tab-ventas.bc-venta-sin-turno #msg-venta,",
      "#tab-ventas.bc-venta-sin-turno #msg-venta-linea,",
      "#tab-ventas.bc-venta-sin-turno h3,",
      "#tab-ventas.bc-venta-sin-turno .ventas-historial-controles,",
      "#tab-ventas.bc-venta-sin-turno #lista-ventas,",
      "#tab-ventas.bc-venta-sin-turno #venta-detalle{display:none!important}",
      "#tab-ventas.bc-venta-sin-turno #venta-sin-turno{display:block!important}",

      /* Layout POS: productos | carrito */
      "#" + LAYOUT_ID + "{display:flex;flex-direction:column;gap:12px;min-height:0;width:100%}",
      "#" + LAYOUT_ID + " .bc-venta-catalog-col{flex:1 1 auto;min-width:0}",
      "#" + CART_PANEL_ID + "{",
      "flex:0 0 auto;display:flex;flex-direction:column;gap:8px;",
      "background:var(--stone);border:1px solid var(--gold-dim);border-radius:12px;",
      "padding:12px;min-height:0;",
      "}",
      "#" + CART_PANEL_ID + " .bc-cart-title{",
      "font-family:Cormorant Garamond,serif;font-size:1.1rem;color:var(--gold);",
      "margin:0 0 4px;letter-spacing:.02em",
      "}",
      "#" + CART_PANEL_ID + " #venta-lineas{",
      "max-height:min(42vh,320px);overflow-y:auto;margin-bottom:0;gap:6px;",
      "display:flex!important;flex-direction:column",
      "}",
      "#" + CART_PANEL_ID + " #venta-total-wrap{margin-bottom:0}",
      "#" + CART_PANEL_ID + " #btn-confirmar-venta{width:100%;min-height:48px}",
      /* Ocultar sticky bar antiguo si sigue existiendo vacío */
      "#bc-venta-carrito-bar:empty{display:none!important}",
      "#tab-ventas.bc-pos #bc-venta-carrito-bar{position:static;background:transparent;border:0;padding:0;margin:0}",

      "@media(min-width:900px){",
      "#" + LAYOUT_ID + "{flex-direction:row;align-items:stretch;gap:16px}",
      "#" + LAYOUT_ID + " .bc-venta-catalog-col{flex:1 1 58%;min-width:0}",
      "#" + CART_PANEL_ID + "{",
      "flex:0 0 320px;max-width:360px;position:sticky;top:8px;align-self:flex-start;",
      "max-height:calc(100vh - 120px);overflow:hidden",
      "}",
      "#" + CART_PANEL_ID + " #venta-lineas{flex:1 1 auto;max-height:none;overflow-y:auto;min-height:80px}",
      "#" + CART_PANEL_ID + " .bc-cart-footer{flex:0 0 auto;display:flex;flex-direction:column;gap:8px}",
      "}",

      "@media(max-width:899px){",
      "#" + CART_PANEL_ID + "{order:2}",
      "#" + LAYOUT_ID + " .bc-venta-catalog-col{order:1}",
      "}"
    ].join("");
    document.head.appendChild(s);
  }

  /* ---------- Layout: catálogo izquierda / carrito derecha ---------- */
  function ensurePosLayout() {
    var tab = document.getElementById("tab-ventas");
    if (!tab) return;
    tab.classList.add("bc-pos");

    var bloque = document.getElementById("venta-operativa-bloque");
    var host = bloque || tab;

    var layout = document.getElementById(LAYOUT_ID);
    if (!layout) {
      layout = document.createElement("div");
      layout.id = LAYOUT_ID;
      host.appendChild(layout);
    }

    var catCol = layout.querySelector(".bc-venta-catalog-col");
    if (!catCol) {
      catCol = document.createElement("div");
      catCol.className = "bc-venta-catalog-col";
      layout.appendChild(catCol);
    }

    var cart = document.getElementById(CART_PANEL_ID);
    if (!cart) {
      cart = document.createElement("div");
      cart.id = CART_PANEL_ID;
      cart.innerHTML = '<div class="bc-cart-title">Carrito</div><div class="bc-cart-footer"></div>';
      layout.appendChild(cart);
    }

    // Mover catálogo / buscador al col izquierdo
    [
      "venta-modo-buscador",
      "venta-modo-catalogo",
      "form-venta-linea",
      "msg-venta-linea",
      "venta-stock-disponible",
      "venta-vista-toggle",
      "catalogo-categorias",
      "catalogo-grid"
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (id === "catalogo-categorias" || id === "catalogo-grid") {
        var modo = document.getElementById("venta-modo-catalogo");
        if (modo && !modo.contains(el)) modo.appendChild(el);
        if (modo && !catCol.contains(modo)) catCol.appendChild(modo);
        return;
      }
      if (!catCol.contains(el)) catCol.appendChild(el);
    });

    // Panel almacén operativo arriba del layout si está en bloque
    var panelAlm = document.getElementById("venta-almacen-operativo");
    if (panelAlm && bloque && panelAlm.parentNode === bloque) {
      if (layout.previousSibling !== panelAlm) {
        bloque.insertBefore(panelAlm, layout);
      }
    }

    // Carrito: lineas + total + confirmar
    var footer = cart.querySelector(".bc-cart-footer");
    if (!footer) {
      footer = document.createElement("div");
      footer.className = "bc-cart-footer";
      cart.appendChild(footer);
    }

    var lineas = document.getElementById("venta-lineas");
    var totalWrap = document.getElementById("venta-total-wrap");
    var btn = document.getElementById("btn-confirmar-venta");
    var msgVenta = document.getElementById("msg-venta");

    if (lineas && lineas.parentNode !== cart) {
      // insertar después del título
      var title = cart.querySelector(".bc-cart-title");
      if (title && title.nextSibling) cart.insertBefore(lineas, title.nextSibling);
      else cart.insertBefore(lineas, footer);
    }
    if (totalWrap && footer && totalWrap.parentNode !== footer) footer.appendChild(totalWrap);
    if (btn && footer && btn.parentNode !== footer) footer.appendChild(btn);
    if (msgVenta && footer && msgVenta.parentNode !== footer) footer.appendChild(msgVenta);

    // Vaciar sticky bar legacy si quedó
    var oldBar = document.getElementById("bc-venta-carrito-bar");
    if (oldBar && oldBar !== cart) {
      while (oldBar.firstChild) {
        // no mover de nuevo; ya relocalizados
        oldBar.removeChild(oldBar.firstChild);
      }
      oldBar.style.display = "none";
    }
  }

  /* ---------- Historial solo con turno ---------- */
  function syncHistorialVisibility() {
    var tab = document.getElementById("tab-ventas");
    if (!tab) return;
    var sinTurno = tab.classList.contains("bc-venta-sin-turno");
    var ids = ["lista-ventas", "ventas-buscar", "ventas-contador", "venta-detalle"];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (sinTurno) {
        el.classList.add("hidden");
        el.setAttribute("aria-hidden", "true");
        el.style.setProperty("display", "none", "important");
      } else {
        el.classList.remove("hidden");
        el.removeAttribute("aria-hidden");
        el.style.removeProperty("display");
      }
    });
    tab.querySelectorAll("h3").forEach(function (h) {
      if (/Historial/i.test(h.textContent || "")) {
        if (sinTurno) {
          h.style.setProperty("display", "none", "important");
          h.setAttribute("aria-hidden", "true");
        } else {
          h.style.removeProperty("display");
          h.removeAttribute("aria-hidden");
        }
      }
    });
    var cont = tab.querySelector(".ventas-historial-controles");
    if (cont) {
      if (sinTurno) {
        cont.style.setProperty("display", "none", "important");
      } else {
        cont.style.removeProperty("display");
      }
    }
  }

  /* ---------- Form "Agregar a la venta" → almacén del turno ---------- */
  function wireFormAgregar() {
    var form = document.getElementById("form-venta-linea");
    if (!form || form.dataset.bcM267Form === "1") return;
    form.dataset.bcM267Form = "1";

    form.addEventListener(
      "submit",
      function (e) {
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
        ensureAlmacenEnSelect(almId);

        var prodSel = document.getElementById("venta-producto");
        var cantidadInput = document.getElementById("venta-cantidad");
        var buscarInput = document.getElementById("venta-producto-buscar");

        // Si el select de producto está vacío pero hay texto de búsqueda, intentar resolver
        if (prodSel && !prodSel.value && buscarInput && buscarInput.value) {
          var term = buscarInput.value.trim().toLowerCase();
          var lista =
            typeof ventaProductosLista !== "undefined" ? ventaProductosLista : [];
          var match = (lista || []).find(function (p) {
            return (p.nombre || "").toLowerCase() === term;
          });
          if (!match) {
            match = (lista || []).find(function (p) {
              return (p.nombre || "").toLowerCase().indexOf(term) !== -1;
            });
          }
          if (match) prodSel.value = match.id;
        }

        var producto_id = prodSel ? prodSel.value : "";
        var cantidad = cantidadInput ? parseFloat(cantidadInput.value) : NaN;

        if (!producto_id) {
          // dejar que el handler original muestre error, pero asegurar sync
          return;
        }
        if (!(cantidad > 0)) return;

        if (typeof bcAsegurarPrecioProductoVenta === "function") {
          bcAsegurarPrecioProductoVenta(producto_id);
        }

        // Interceptar: agregar con almacén del turno y evitar doble ejecución si original falla por select vacío
        e.preventDefault();
        e.stopImmediatePropagation();

        if (typeof agregarLineaVenta === "function") {
          var ok = agregarLineaVenta(producto_id, cantidad, almId);
          if (ok) {
            if (cantidadInput) cantidadInput.value = "";
            if (prodSel) prodSel.value = "";
            if (buscarInput) buscarInput.value = "";
            if (typeof fillSelect === "function" && typeof ventaProductosLista !== "undefined") {
              try {
                fillSelect(prodSel, ventaProductosLista, "id", function (p) {
                  return p.nombre;
                }, true);
              } catch (err) {}
            }
            if (typeof actualizarStockDisponibleUI === "function") actualizarStockDisponibleUI();
            if (typeof renderCatalogoGrid === "function") renderCatalogoGrid();
          }
        }
      },
      true
    );
  }

  /* ---------- +/- y quitar: reafirmar delegación (por si el nodo se movió) ---------- */
  function wireCartButtons() {
    var contenedor = document.getElementById("venta-lineas");
    if (!contenedor || contenedor.dataset.bcM267Cart === "1") return;
    contenedor.dataset.bcM267Cart = "1";

    contenedor.addEventListener("click", function (e) {
      var btnQuitar = e.target.closest(".venta-linea-borrar");
      if (btnQuitar) {
        e.preventDefault();
        e.stopPropagation();
        var idxQ = Number(btnQuitar.dataset.idx);
        if (typeof ventaLineas !== "undefined" && ventaLineas[idxQ] !== undefined) {
          ventaLineas.splice(idxQ, 1);
          if (typeof setMsg === "function") setMsg("msg-venta-linea", "", true);
          if (typeof renderVentaLineas === "function") renderVentaLineas();
          if (typeof actualizarStockDisponibleUI === "function") actualizarStockDisponibleUI();
        }
        return;
      }
      var btnMas = e.target.closest(".venta-linea-mas");
      if (btnMas) {
        e.preventDefault();
        e.stopPropagation();
        var idxM = Number(btnMas.dataset.idx);
        if (typeof ventaLineas !== "undefined" && ventaLineas[idxM] && typeof actualizarCantidadLinea === "function") {
          actualizarCantidadLinea(idxM, ventaLineas[idxM].cantidad + 1);
        }
        return;
      }
      var btnMenos = e.target.closest(".venta-linea-menos");
      if (btnMenos) {
        e.preventDefault();
        e.stopPropagation();
        var idxN = Number(btnMenos.dataset.idx);
        if (typeof ventaLineas !== "undefined" && ventaLineas[idxN] && typeof actualizarCantidadLinea === "function") {
          actualizarCantidadLinea(idxN, ventaLineas[idxN].cantidad - 1);
        }
        return;
      }
    });

    contenedor.addEventListener("change", function (e) {
      var input = e.target.closest(".venta-linea-cant-input");
      if (!input) return;
      if (typeof actualizarCantidadLinea === "function") {
        actualizarCantidadLinea(Number(input.dataset.idx), parseFloat(input.value));
      }
    });
  }

  /* ---------- Confirmar venta: garantizar flujo completo ---------- */
  function wireConfirmar() {
    var btn = document.getElementById("btn-confirmar-venta");
    if (!btn || btn.dataset.bcM267Confirm === "1") return;
    btn.dataset.bcM267Confirm = "1";

    // Listener en bubble (después de m26 custom confirm capture) como red de seguridad
    btn.addEventListener("click", function () {
      // Si m26 ya interceptó y re-dispara, este path también se ejecuta
      // El handler original en ventas.js hace el trabajo real.
      // Aquí solo aseguramos almacén antes de que el original lea el select.
      var almId = almOperativo();
      if (almId) ensureAlmacenEnSelect(almId);
    });

    // Patch capture temprano: si no hay líneas o no hay turno, mensaje claro
    btn.addEventListener(
      "click",
      function (e) {
        var almId = almOperativo();
        if (!almId) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (typeof setMsg === "function") {
            setMsg("msg-venta", "No puedes vender sin un turno abierto con almacén.", false);
          }
          if (typeof actualizarPanelAlmacenVenta === "function") actualizarPanelAlmacenVenta();
          return;
        }
        ensureAlmacenEnSelect(almId);
        if (typeof ventaLineas === "undefined" || !ventaLineas || ventaLineas.length === 0) {
          // dejar que original maneje, pero mensaje si original no corre
          setTimeout(function () {
            var msg = document.getElementById("msg-venta");
            if (msg && !(msg.textContent || "").trim()) {
              if (typeof setMsg === "function") {
                setMsg("msg-venta", "Agregá al menos un producto a la venta.", false);
              }
            }
          }, 50);
        }
      },
      true
    );
  }

  /* ---------- Drawer layering: clase en body ---------- */
  function wireDrawerLayering() {
    var sidebar = document.getElementById("sidebar");
    var backdrop = document.getElementById("sidebar-backdrop");
    var toggleBtn = document.getElementById("sidebar-toggle-btn");
    var closeBtn = document.getElementById("sidebar-close-btn");
    if (!sidebar || !backdrop) return;
    if (sidebar.dataset.bcM267Drawer === "1") return;
    sidebar.dataset.bcM267Drawer = "1";

    function syncBody() {
      var open = sidebar.classList.contains("open");
      document.body.classList.toggle("bc-sidebar-open", open);
    }

    var obs = new MutationObserver(syncBody);
    obs.observe(sidebar, { attributes: true, attributeFilter: ["class"] });
    obs.observe(backdrop, { attributes: true, attributeFilter: ["class"] });
    syncBody();

    if (toggleBtn) toggleBtn.addEventListener("click", function () { setTimeout(syncBody, 0); });
    if (closeBtn) closeBtn.addEventListener("click", function () { setTimeout(syncBody, 0); });
    backdrop.addEventListener("click", function () { setTimeout(syncBody, 0); });
  }

  /* ---------- Hook panel almacén para historial + layout ---------- */
  function patchActualizarPanel() {
    if (typeof actualizarPanelAlmacenVenta !== "function" || actualizarPanelAlmacenVenta.__bcM267) return;
    var orig = actualizarPanelAlmacenVenta;
    window.actualizarPanelAlmacenVenta = function () {
      var r = orig.apply(this, arguments);
      try {
        ensurePosLayout();
        syncHistorialVisibility();
        wireCartButtons();
      } catch (e) {}
      return r;
    };
    window.actualizarPanelAlmacenVenta.__bcM267 = true;
  }

  function boot() {
    injectStyles();
    ensurePosLayout();
    wireFormAgregar();
    wireCartButtons();
    wireConfirmar();
    wireDrawerLayering();
    patchActualizarPanel();
    syncHistorialVisibility();
    if (typeof actualizarPanelAlmacenVenta === "function") {
      try {
        actualizarPanelAlmacenVenta();
      } catch (e) {}
    }
  }

  function start() {
    boot();
    var n = 0;
    var t = setInterval(function () {
      n++;
      ensurePosLayout();
      wireFormAgregar();
      wireCartButtons();
      wireConfirmar();
      wireDrawerLayering();
      patchActualizarPanel();
      syncHistorialVisibility();
      if (n >= 20) clearInterval(t);
    }, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(start, 600);
    });
  } else {
    setTimeout(start, 600);
  }
})();
