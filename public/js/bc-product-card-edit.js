// BattleCruiser — edición táctil/teclado desde la tarjeta de producto.
// Release 1.1: respeta permisos que terminan de hidratarse después del render.
(function () {
  "use strict";
  if (window.__BC_PRODUCT_CARD_EDIT_V1) return;
  window.__BC_PRODUCT_CARD_EDIT_V1 = true;

  var SELECTOR = '[data-ctx-tipo="producto"][data-ctx-id]';
  var STYLE_ID = "bc-product-card-edit-v1-style";

  function canEditProducts() {
    try {
      return typeof tienePermiso === "function" &&
        tienePermiso("productos", "editar") === true;
    } catch (_) {
      return false;
    }
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      '#lista-productos [data-bc-card-editable="1"]{cursor:pointer!important}' +
      '#lista-productos [data-bc-card-editable="1"]:focus-visible{outline:2px solid var(--gold,#d4b05c)!important;outline-offset:2px!important}' +
      '#lista-productos [data-bc-card-editable="1"] .lista-item-acciones{cursor:default!important}';
    document.head.appendChild(style);
  }

  function markCards(list) {
    var allowed = canEditProducts();
    list.querySelectorAll(SELECTOR).forEach(function (card) {
      if (!allowed) {
        card.removeAttribute("role");
        card.removeAttribute("tabindex");
        card.removeAttribute("aria-label");
        card.removeAttribute("title");
        card.removeAttribute("data-bc-card-editable");
        return;
      }
      var id = card.getAttribute("data-ctx-id") || "";
      var product = typeof _cache !== "undefined" && Array.isArray(_cache.productos)
        ? _cache.productos.find(function (item) { return String(item.id) === String(id); })
        : null;
      var name = product && product.nombre ? String(product.nombre) : "producto";
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", "Editar producto: " + name);
      card.setAttribute("title", "Selecciona para editar " + name);
      card.setAttribute("data-bc-card-editable", "1");
    });
  }

  function getCard(target, list) {
    if (!target || typeof target.closest !== "function") return null;
    var card = target.closest(SELECTOR);
    return card && list.contains(card) ? card : null;
  }

  function isNestedControl(target, card) {
    if (!target || !card || typeof target.closest !== "function") return false;
    var control = target.closest("button,a,input,select,textarea,summary,.lista-item-acciones,[data-bc-no-card-edit]");
    return !!(control && card.contains(control));
  }

  function openEditor(card) {
    if (!canEditProducts()) return false;
    var id = card.getAttribute("data-ctx-id") || "";
    if (!id || typeof _cache === "undefined" || !Array.isArray(_cache.productos)) return false;
    var product = _cache.productos.find(function (item) { return String(item.id) === String(id); });
    if (!product || typeof iniciarEdicionProducto !== "function") return false;
    try {
      Promise.resolve(iniciarEdicionProducto(product)).catch(function (error) {
        console.warn("[BattleCruiser] No se pudo abrir el editor del producto.", error);
      });
      return true;
    } catch (error) {
      console.warn("[BattleCruiser] No se pudo abrir el editor del producto.", error);
      return false;
    }
  }

  function bind() {
    var list = document.getElementById("lista-productos");
    if (!list || list.dataset.bcCardEditV1 === "1") return;
    list.dataset.bcCardEditV1 = "1";
    injectStyles();
    markCards(list);

    list.addEventListener("click", function (event) {
      var card = getCard(event.target, list);
      if (!card) return;
      markCards(list);
      if (isNestedControl(event.target, card) || !canEditProducts()) return;
      event.preventDefault();
      openEditor(card);
    });

    list.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      var card = getCard(event.target, list);
      if (!card || event.target !== card) return;
      markCards(list);
      if (isNestedControl(event.target, card) || !canEditProducts()) return;
      event.preventDefault();
      openEditor(card);
    });

    if (typeof MutationObserver === "function") {
      var listObserver = new MutationObserver(function () { markCards(list); });
      listObserver.observe(list, { childList: true, subtree: true });

      var shell = document.getElementById("app-shell");
      if (shell) {
        var permissionObserver = new MutationObserver(function () { markCards(list); });
        permissionObserver.observe(shell, {
          attributes: true,
          attributeFilter: ["data-bc-permisos-cargados"]
        });
      }
    }

    window.__BC_PRODUCT_CARD_EDIT_VERIFY__ = function () {
      return {
        bound: list.dataset.bcCardEditV1 === "1",
        permission: canEditProducts(),
        cards: list.querySelectorAll(SELECTOR).length,
        editableCards: list.querySelectorAll(SELECTOR + '[data-bc-card-editable="1"]').length
      };
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  }
  bind();
})();
