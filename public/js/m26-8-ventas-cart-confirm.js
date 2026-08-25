// BattleCruiser — M26.8-FE: corrección definitiva carrito (+/−) + confirmar venta
// Reutiliza: ventaLineas, agregarLineaVenta, renderVentaLineas, actualizarCantidadLinea,
// obtenerStockDisponible, ejecutarOperacion("venta"), obtenerAlmacenIdOperativoVenta,
// bcSincronizarSelectAlmacenTurno, bcAsegurarPrecioProductoVenta.
// NO toca Supabase. NO duplica carrito ni reemplaza ventas.js.
(function () {
  "use strict";

  var FLAG = "bcM268";
  var _enviandoLocal = false;

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

  function showVentaError(msg) {
    if (typeof setMsg === "function") {
      setMsg("msg-venta", "❌ " + msg, false);
    } else {
      var el = document.getElementById("msg-venta");
      if (el) {
        el.textContent = "❌ " + msg;
        el.className = "msg error";
      }
    }
    try {
      console.warn("[M26.8] venta error:", msg);
    } catch (e) {}
  }

  function showVentaOk(msg) {
    if (typeof setMsg === "function") {
      setMsg("msg-venta", msg, true);
    } else {
      var el = document.getElementById("msg-venta");
      if (el) {
        el.textContent = msg;
        el.className = "msg ok";
      }
    }
  }

  /* ---------- PARTE 1/2: patch actualizarCantidadLinea (almacén del turno) ---------- */
  function patchActualizarCantidadLinea() {
    if (typeof actualizarCantidadLinea !== "function" || actualizarCantidadLinea.__bcM268) return;
    var orig = actualizarCantidadLinea;
    window.actualizarCantidadLinea = function (idx, nuevaCantidad) {
      var almId = almOperativo();
      if (almId) ensureAlmacenSelect(almId);

      var linea =
        typeof ventaLineas !== "undefined" && ventaLineas ? ventaLineas[idx] : null;
      if (!linea) return;

      if (!(nuevaCantidad > 0)) {
        ventaLineas.splice(idx, 1);
        if (typeof setMsg === "function") setMsg("msg-venta-linea", "", true);
        if (typeof renderVentaLineas === "function") renderVentaLineas();
        if (typeof actualizarStockDisponibleUI === "function") actualizarStockDisponibleUI();
        if (typeof renderCatalogoGrid === "function") {
          try {
            renderCatalogoGrid();
          } catch (e) {}
        }
        return;
      }

      var stockAlmacen = almId;
      if (!stockAlmacen) {
        var sel = document.getElementById("venta-almacen");
        stockAlmacen = sel ? sel.value : null;
      }
      if (!stockAlmacen) {
        if (typeof setMsg === "function") {
          setMsg(
            "msg-venta-linea",
            "No hay almacén del turno para validar stock.",
            false
          );
        }
        if (typeof renderVentaLineas === "function") renderVentaLineas();
        return;
      }

      var stockInfo =
        typeof obtenerStockDisponible === "function"
          ? obtenerStockDisponible(linea.producto_id, stockAlmacen)
          : { valor: 0 };
      var stockTotal = stockInfo && typeof stockInfo.valor === "number" ? stockInfo.valor : 0;
      var enOtras = 0;
      if (typeof cantidadEnCarrito === "function") {
        enOtras = cantidadEnCarrito(linea.producto_id, idx);
      } else if (typeof ventaLineas !== "undefined") {
        for (var i = 0; i < ventaLineas.length; i++) {
          if (i === idx) continue;
          if (ventaLineas[i] && sameId(ventaLineas[i].producto_id, linea.producto_id)) {
            enOtras += Number(ventaLineas[i].cantidad) || 0;
          }
        }
      }
      var disponible = stockTotal - enOtras;
      if (nuevaCantidad > disponible) {
        if (typeof setMsg === "function") {
          setMsg(
            "msg-venta-linea",
            "No hay suficiente stock de " +
              (linea.nombre || "producto") +
              " (disponible: " +
              (typeof money === "function" ? money(Math.max(disponible, 0)) : Math.max(disponible, 0)) +
              ").",
            false
          );
        }
        if (typeof renderVentaLineas === "function") renderVentaLineas();
        return;
      }

      linea.cantidad = nuevaCantidad;
      linea.subtotal = nuevaCantidad * (Number(linea.precio_unitario) || 0);
      if (typeof setMsg === "function") setMsg("msg-venta-linea", "", true);
      if (typeof renderVentaLineas === "function") renderVentaLineas();
      if (typeof actualizarStockDisponibleUI === "function") actualizarStockDisponibleUI();
      if (typeof renderCatalogoGrid === "function") {
        try {
          renderCatalogoGrid();
        } catch (e3) {}
      }
    };
    window.actualizarCantidadLinea.__bcM268 = true;
    window.actualizarCantidadLinea.__bcM268Orig = orig;
  }

  /* ---------- Delegación robusta + / − / quitar (una sola, document capture) ---------- */
  function wireCartButtonsOnce() {
    if (document.documentElement.dataset[FLAG + "Cart"] === "1") return;
    document.documentElement.dataset[FLAG + "Cart"] = "1";

    document.addEventListener(
      "click",
      function (e) {
        var tab = document.getElementById("tab-ventas");
        if (!tab || !tab.classList.contains("visible")) return;

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
            if (typeof renderCatalogoGrid === "function") {
              try {
                renderCatalogoGrid();
              } catch (err) {}
            }
          }
          return;
        }

        var btnMas = e.target.closest(".venta-linea-mas");
        if (btnMas) {
          e.preventDefault();
          e.stopPropagation();
          var idxM = Number(btnMas.dataset.idx);
          if (
            typeof ventaLineas !== "undefined" &&
            ventaLineas[idxM] &&
            typeof actualizarCantidadLinea === "function"
          ) {
            actualizarCantidadLinea(idxM, Number(ventaLineas[idxM].cantidad) + 1);
          }
          return;
        }

        var btnMenos = e.target.closest(".venta-linea-menos");
        if (btnMenos) {
          e.preventDefault();
          e.stopPropagation();
          var idxN = Number(btnMenos.dataset.idx);
          if (
            typeof ventaLineas !== "undefined" &&
            ventaLineas[idxN] &&
            typeof actualizarCantidadLinea === "function"
          ) {
            actualizarCantidadLinea(idxN, Number(ventaLineas[idxN].cantidad) - 1);
          }
          return;
        }
      },
      true
    );

    document.addEventListener(
      "change",
      function (e) {
        var input = e.target.closest(".venta-linea-cant-input");
        if (!input) return;
        var tab = document.getElementById("tab-ventas");
        if (!tab || !tab.classList.contains("visible")) return;
        if (typeof actualizarCantidadLinea === "function") {
          actualizarCantidadLinea(Number(input.dataset.idx), parseFloat(input.value));
        }
      },
      true
    );
  }

  /* ---------- PARTE 3/4/5: Confirmar venta ---------- */
  function wireConfirmarVenta() {
    var btn = document.getElementById("btn-confirmar-venta");
    if (!btn || btn.dataset[FLAG + "Confirm"] === "1") return;
    btn.dataset[FLAG + "Confirm"] = "1";

    btn.addEventListener(
      "click",
      async function (e) {
        if (e.__bcM268Handled) return;
        e.__bcM268Handled = true;

        if (_enviandoLocal) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }

        var almId = almOperativo();
        if (!almId) {
          e.preventDefault();
          e.stopImmediatePropagation();
          showVentaError("No puedes vender sin un turno abierto con almacén.");
          if (typeof actualizarPanelAlmacenVenta === "function") {
            try {
              actualizarPanelAlmacenVenta();
            } catch (err) {}
          }
          return;
        }
        ensureAlmacenSelect(almId);

        if (typeof ventaLineas === "undefined" || !ventaLineas || ventaLineas.length === 0) {
          e.preventDefault();
          e.stopImmediatePropagation();
          showVentaError("Agregá al menos un producto a la venta.");
          return;
        }

        var btnEl = btn;
        var textoAntes = btnEl.textContent;
        var lineasSnapshot = ventaLineas.slice();
        var totalSnapshot = lineasSnapshot.reduce(function (s, l) {
          return s + (Number(l.subtotal) || 0);
        }, 0);

        setTimeout(function () {
          if (
            (typeof enviandoVenta !== "undefined" && enviandoVenta) ||
            _enviandoLocal ||
            (btnEl.disabled && /proces|registr/i.test(btnEl.textContent || ""))
          ) {
            return;
          }
          var modal = document.getElementById("bc-venta-confirm-modal");
          if (modal && !modal.classList.contains("hidden")) return;
          if (!ventaLineas || ventaLineas.length === 0) return;
          var msgEl = document.getElementById("msg-venta");
          var msgTxt = (msgEl && msgEl.textContent) || "";
          if (/no se pudo|error|❌|agregá|turno/i.test(msgTxt) && msgTxt.trim()) return;

          forzarRegistroVenta(btnEl, textoAntes, lineasSnapshot, totalSnapshot, almId);
        }, 450);
      },
      true
    );
  }

  async function forzarRegistroVenta(btn, textoOriginal, lineas, total, almId) {
    if (_enviandoLocal) return;
    if (typeof enviandoVenta !== "undefined" && enviandoVenta) return;

    if (!lineas || lineas.length === 0) {
      showVentaError("Agregá al menos un producto a la venta.");
      return;
    }
    if (!almId) {
      showVentaError("No puedes vender sin un turno abierto con almacén.");
      return;
    }

    var okConfirm = true;
    try {
      if (typeof window.confirm === "function") {
        okConfirm = window.confirm(
          "¿Confirmar venta por $" +
            (typeof money === "function" ? money(total) : Number(total).toFixed(2)) +
            "? Esto descuenta stock real."
        );
      }
    } catch (e) {
      okConfirm = true;
    }
    if (!okConfirm) return;

    _enviandoLocal = true;
    if (typeof enviandoVenta !== "undefined") {
      try {
        enviandoVenta = true;
      } catch (e2) {}
    }

    btn.disabled = true;
    btn.textContent = "Registrando venta...";
    showVentaOk("Registrando venta…");

    var p_lineas = lineas.map(function (l) {
      return { producto_id: l.producto_id, cantidad: l.cantidad };
    });

    var resultado;
    try {
      if (typeof ejecutarOperacion !== "function") {
        throw new Error("ejecutarOperacion no está disponible en el frontend.");
      }
      resultado = await ejecutarOperacion("venta", {
        p_almacen_id: almId,
        p_lineas: p_lineas,
      });
    } catch (err) {
      resultado = {
        ok: false,
        error: { message: (err && err.message) || String(err) },
      };
      try {
        console.error("[M26.8] excepción en ejecutarOperacion(venta):", err);
      } catch (e3) {}
    }

    _enviandoLocal = false;
    if (typeof enviandoVenta !== "undefined") {
      try {
        enviandoVenta = false;
      } catch (e4) {}
    }

    if (!resultado || !resultado.ok) {
      var errObj = (resultado && resultado.error) || {};
      var causa =
        (typeof explicarError === "function"
          ? explicarError(errObj, "registrar venta")
          : errObj.message || errObj.code || String(errObj)) || "Error desconocido";
      showVentaError("No se pudo registrar la venta. " + causa);
      try {
        console.error("[M26.8] RPC registrar_venta falló:", {
          rpc: "registrar_venta",
          params: { p_almacen_id: almId, p_lineas: p_lineas },
          error: errObj,
        });
      } catch (e5) {}
      btn.disabled = false;
      btn.textContent = textoOriginal || "Confirmar venta";
      return;
    }

    btn.textContent = textoOriginal || "Confirmar venta";
    if (typeof setMsg === "function") setMsg("msg-venta-linea", "", true);
    ventaLineas = [];
    if (typeof renderVentaLineas === "function") renderVentaLineas();

    if (resultado.offline) {
      showVentaOk(
        "✓ Venta guardada localmente por $" +
          (typeof money === "function" ? money(total) : Number(total).toFixed(2)) +
          " — se sincronizará al recuperar conexión."
      );
      if (typeof actualizarStockDisponibleUI === "function") actualizarStockDisponibleUI();
      if (typeof renderCatalogoGrid === "function") {
        try {
          renderCatalogoGrid();
        } catch (e6) {}
      }
      return;
    }

    showVentaOk(
      "✓ Venta registrada por $" +
        (typeof money === "function" ? money(total) : Number(total).toFixed(2)) +
        ". Todo listo para la próxima venta."
    );
    try {
      if (typeof refrescarStockYSelects === "function") await refrescarStockYSelects();
    } catch (e7) {}
    try {
      if (typeof refrescarVentas === "function") await refrescarVentas();
    } catch (e8) {}
  }

  function patchOriginalConfirmHandler() {
    if (typeof setMsg === "function" && !setMsg.__bcM268) {
      var origSet = setMsg;
      window.setMsg = function (id, text, ok) {
        if (id === "msg-venta" && text && !ok) {
          var t = String(text);
          if (!/^❌/.test(t) && /no se pudo|error|elegí|agregá/i.test(t)) {
            text = "❌ " + t.replace(/^❌\s*/, "");
          }
        }
        return origSet.apply(this, [id, text, ok]);
      };
      window.setMsg.__bcM268 = true;
    }
  }

  function ensureConfirmVisible() {
    var btn = document.getElementById("btn-confirmar-venta");
    if (!btn) return;
    if (btn.dataset[FLAG + "Confirm"] !== "1") {
      wireConfirmarVenta();
    }
  }

  function boot() {
    patchActualizarCantidadLinea();
    wireCartButtonsOnce();
    wireConfirmarVenta();
    patchOriginalConfirmHandler();
    ensureConfirmVisible();
  }

  function start() {
    boot();
    var n = 0;
    var t = setInterval(function () {
      n++;
      patchActualizarCantidadLinea();
      wireConfirmarVenta();
      ensureConfirmVisible();
      if (n >= 25) clearInterval(t);
    }, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(start, 700);
    });
  } else {
    setTimeout(start, 700);
  }
})();
