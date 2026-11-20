/* BattleCruiser — shared modal lifecycle and accessibility controller, v1.0.
 * Owns Escape/backdrop handling, focus containment/restoration and nested scroll locks.
 * Dialog content, permissions and business actions remain owned by each feature.
 */
(function installBCModalManager(window, document) {
  "use strict";

  if (!window || !document || window.BCModalManager) return;

  var FOCUSABLE_SELECTOR = [
    "a[href]",
    "area[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "iframe",
    "object",
    "embed",
    "[contenteditable='true']",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  var scrollLockOwners = new Set();
  var originalBodyOverflow = "";
  var originalRootOverflow = "";

  function focusElement(element) {
    if (!element || typeof element.focus !== "function") return;
    try {
      element.focus({ preventScroll: true });
    } catch (_) {
      try { element.focus(); } catch (__) {}
    }
  }

  function acquireScrollLock(owner) {
    if (scrollLockOwners.has(owner)) return;
    if (scrollLockOwners.size === 0 && document.body && document.documentElement) {
      originalBodyOverflow = document.body.style.overflow;
      originalRootOverflow = document.documentElement.style.overflow;
    }
    scrollLockOwners.add(owner);
    if (document.body) document.body.style.overflow = "hidden";
    if (document.documentElement) document.documentElement.style.overflow = "hidden";
  }

  function releaseScrollLock(owner) {
    if (!scrollLockOwners.delete(owner) || scrollLockOwners.size !== 0) return;
    if (document.body) document.body.style.overflow = originalBodyOverflow;
    if (document.documentElement) document.documentElement.style.overflow = originalRootOverflow;
    originalBodyOverflow = "";
    originalRootOverflow = "";
  }

  function isUsable(element) {
    if (!element || element.disabled) return false;
    if (element.tabIndex < 0) return false;
    if (element.closest && element.closest("[hidden], .hidden, [aria-hidden='true']")) return false;
    return true;
  }

  function focusableElements(dialog) {
    if (!dialog || typeof dialog.querySelectorAll !== "function") return [];
    return Array.prototype.filter.call(
      dialog.querySelectorAll(FOCUSABLE_SELECTOR),
      isUsable
    );
  }

  function callHook(hook, api) {
    if (typeof hook !== "function") return;
    try {
      hook(api);
    } catch (error) {
      console.error("[BattleCruiser] Modal lifecycle hook failed:", error);
    }
  }

  function create(element, options) {
    if (!element || typeof element.querySelector !== "function") {
      throw new TypeError("BCModalManager.create requires a modal overlay element.");
    }

    var config = Object.assign({
      dialogSelector: '[role="dialog"]',
      initialFocusSelector: null,
      closeSelector: null,
      backdropSelector: null,
      hiddenClass: "hidden",
      hiddenAttribute: false,
      closeOnEscape: true,
      closeOnBackdrop: true,
      trapFocus: true,
      lockScroll: true,
      onOpen: null,
      onClose: null
    }, options || {});

    var dialog = element.querySelector(config.dialogSelector) || element;
    var ownerToken = {};
    var opened = false;
    var destroyed = false;
    var returnFocus = null;
    var api;

    function findInitialFocus() {
      var target = null;
      if (config.initialFocusSelector && dialog.querySelector) {
        target = dialog.querySelector(config.initialFocusSelector);
      }
      if (target && isUsable(target)) return target;
      var items = focusableElements(dialog);
      return items.length ? items[0] : dialog;
    }

    function handleKeydown(event) {
      if (!opened) return;

      if (event.key === "Escape" && config.closeOnEscape) {
        event.preventDefault();
        event.stopPropagation();
        api.close();
        return;
      }

      if (event.key !== "Tab" || !config.trapFocus) return;
      var items = focusableElements(dialog);
      if (!items.length) {
        event.preventDefault();
        focusElement(dialog);
        return;
      }

      var first = items[0];
      var last = items[items.length - 1];
      var active = document.activeElement;
      var dialogFocused = active === dialog;
      var outsideDialog = !dialog.contains(active);

      if (event.shiftKey && (active === first || dialogFocused || outsideDialog)) {
        event.preventDefault();
        focusElement(last);
      } else if (!event.shiftKey && (active === last || dialogFocused || outsideDialog)) {
        event.preventDefault();
        focusElement(first);
      }
    }

    function handleClick(event) {
      if (!opened) return;
      var target = event.target;

      if (config.closeSelector && target && typeof target.closest === "function") {
        var closeTarget = target.closest(config.closeSelector);
        if (closeTarget && element.contains(closeTarget)) {
          event.preventDefault();
          api.close();
          return;
        }
      }

      if (!config.closeOnBackdrop) return;
      if (target === element) {
        api.close();
        return;
      }

      if (config.backdropSelector && target && typeof target.closest === "function") {
        var backdrop = target.closest(config.backdropSelector);
        if (backdrop && element.contains(backdrop)) api.close();
      }
    }

    api = {
      open: function() {
        if (destroyed || opened) return false;
        opened = true;
        returnFocus = document.activeElement || null;

        if (config.hiddenClass) element.classList.remove(config.hiddenClass);
        if (config.hiddenAttribute) element.hidden = false;
        element.setAttribute("aria-hidden", "false");

        if (config.lockScroll) acquireScrollLock(ownerToken);
        document.addEventListener("keydown", handleKeydown, true);
        element.addEventListener("click", handleClick);

        callHook(config.onOpen, api);
        focusElement(findInitialFocus());
        return true;
      },

      close: function(closeOptions) {
        if (!opened) return false;
        var restore = !closeOptions || closeOptions.restoreFocus !== false;
        opened = false;

        document.removeEventListener("keydown", handleKeydown, true);
        element.removeEventListener("click", handleClick);
        if (config.hiddenClass) element.classList.add(config.hiddenClass);
        if (config.hiddenAttribute) element.hidden = true;
        element.setAttribute("aria-hidden", "true");

        if (config.lockScroll) releaseScrollLock(ownerToken);
        callHook(config.onClose, api);

        var previous = returnFocus;
        returnFocus = null;
        if (restore && previous && previous.isConnected !== false) focusElement(previous);
        return true;
      },

      isOpen: function() {
        return opened;
      },

      destroy: function() {
        if (destroyed) return;
        api.close({ restoreFocus: false });
        destroyed = true;
      }
    };

    return api;
  }

  window.BCModalManager = Object.freeze({
    version: "1.0",
    create: create
  });
})(window, document);
