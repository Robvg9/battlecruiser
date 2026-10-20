// BattleCruiser — Android scroll fallback for long sections (v20261020.4)
(function () {
  "use strict";
  if (window.__BCConfigMove20260902) return;
  window.__BCConfigMove20260902 = true;

  function installStyles() {
    if (document.getElementById("bc-config-unified-css")) return;
    var style = document.createElement("style");
    style.id = "bc-config-unified-css";
    style.textContent = "@media(max-width:759px){" +
      "html.bc-config-scroll-unlocked,body.bc-config-scroll-unlocked{height:auto!important;max-height:none!important;overflow-x:hidden!important;overflow-y:auto!important;touch-action:pan-y}" +
      "body.bc-config-scroll-unlocked #app-shell.visible{height:auto!important;min-height:100vh!important;max-height:none!important;overflow:visible!important}" +
      "body.bc-config-scroll-unlocked #app-shell.visible>main.main-content{height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important}" +
      "body.bc-config-scroll-unlocked .tab-panel.bc-config-scroll-region{box-sizing:border-box;height:auto!important;min-height:0!important;max-height:calc(100vh - 240px)!important;max-height:calc(100dvh - 240px)!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding-bottom:max(20px,env(safe-area-inset-bottom))}" +
      "}";
    document.head.appendChild(style);
  }

  function releaseScrollLock() {
    if (!document.body) return;
    // Clear stale drawer state so a previous cached UI cannot keep the page locked.
    document.body.classList.remove("bc-aj-open");
    var legacyPanel = document.getElementById("bc-aj-panel");
    if (legacyPanel && legacyPanel.parentNode) legacyPanel.parentNode.removeChild(legacyPanel);
    var legacyBackdrop = document.getElementById("bc-aj-backdrop");
    if (legacyBackdrop && legacyBackdrop.parentNode) legacyBackdrop.parentNode.removeChild(legacyBackdrop);
    var sections = ["config", "conectividad", "preferencias"].map(function (name) {
      return document.getElementById("tab-" + name);
    }).filter(Boolean);
    var active = sections.find(function (tab) { return tab.classList.contains("visible"); });
    var enabled = !!active && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 759px)").matches;
    document.body.classList.toggle("bc-config-scroll-unlocked", enabled);
    if (document.documentElement) document.documentElement.classList.toggle("bc-config-scroll-unlocked", enabled);
    sections.forEach(function (tab) {
      tab.classList.toggle("bc-config-scroll-region", enabled && tab === active);
      if (enabled && tab === active && !tab.hasAttribute("tabindex")) tab.setAttribute("tabindex", "0");
    });
  }

  installStyles();
  document.addEventListener("click", function (event) {
    var trigger = event.target && event.target.closest ? event.target.closest("[data-tab]") : null;
    if (trigger) window.setTimeout(releaseScrollLock, 0);
  }, true);
  window.addEventListener("pageshow", releaseScrollLock);
  window.addEventListener("resize", releaseScrollLock);
  window.addEventListener("orientationchange", releaseScrollLock);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", releaseScrollLock, { once: true });
  else releaseScrollLock();
})();
