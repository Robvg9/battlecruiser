// BattleCruiser · UI revision 2026-08
// Ajustes de UX del Centro de Control, Configuración y Productos.
(function () {
  "use strict";

  const LS = "bc-ui-preferences-v1";
  const prefs = Object.assign({ compacto: false, autoRefresh: true }, JSON.parse(localStorage.getItem(LS) || "{}"));
  let autoTimer = null;

  function save() { localStorage.setItem(LS, JSON.stringify(prefs)); }
  function go(tab) {
    if (typeof irATab === "function") return irATab(tab);
    const b = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
    if (b) b.click();
  }

  function injectStyles() {
    if (document.getElementById("bc-ui-revision-style")) return;
    const s = document.createElement("style"); s.id = "bc-ui-revision-style";
    s.textContent = `
      .bc-hidden{display:none!important}
      .bc-product-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 14px}
      .bc-product-toolbar input,.bc-product-toolbar select{flex:1 1 180px;min-width:160px}
      .bc-add-product{flex:0 0 auto}
      .bc-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.58);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px}
      .bc-modal{width:min(760px,96vw);max-height:90vh;overflow:auto;background:var(--stone);border:1px solid var(--gold-dim);border-radius:10px;padding:18px;box-shadow:0 18px 60px rgba(0,0,0,.5)}
      .bc-modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
      .bc-modal-head h3{margin:0}.bc-modal-close{font-size:22px;line-height:1;padding:6px 10px}
      .bc-settings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:14px}
      .bc-setting{padding:13px;border:1px solid var(--gold-dim);border-radius:8px;background:var(--stone)}
      .bc-setting label{display:flex;gap:10px;align-items:flex-start;cursor:pointer}.bc-setting strong{display:block}.bc-setting small{display:block;margin-top:4px;color:var(--mist)}
      .bc-activity-more{margin-top:8px;width:100%}
      body.bc-compact .cc-bloque{padding:10px} body.bc-compact .cc-actividad-item{padding:6px 0} body.bc-compact .resumen-card{padding:9px}
    `;
    document.head.appendChild(s);
  }

  function hideCenterBlockByHeading(text) {
    document.querySelectorAll("#tab-resumen h3").forEach(h => {
      if ((h.textContent || "").trim().toLowerCase() === text.toLowerCase()) {
        const block = h.closest(".cc-bloque,.resumen-movs,.resumen-alertas,.seccion-panel,.seccion-principal");
        if (block) block.classList.add("bc-hidden");
      }
    });
  }

  function refineCenter() {
    const tab = document.getElementById("tab-resumen"); if (!tab) return;
    hideCenterBlockByHeading("Inventario");
    hideCenterBlockByHeading("Otros movimientos");
    hideCenterBlockByHeading("Últimos movimientos");
    hideCenterBlockByHeading("Stock bajo mínimo");

    const actividad = document.getElementById("cc-actividad");
    if (actividad) {
      [...actividad.children].forEach((el, i) => { if (i >= 5) el.classList.add("bc-hidden"); });
      let more = document.getElementById("bc-actividad-more");
      if (!more && actividad.children.length > 5) {
        more = document.createElement("button"); more.id = "bc-actividad-more"; more.type = "button"; more.className = "cc-accion bc-activity-more"; more.textContent = "Ver más";
        more.onclick = () => go("movimientos");
        actividad.parentElement.appendChild(more);
      }
    }

    const cards = document.querySelectorAll("#resumen-grid .resumen-card");
    cards.forEach(card => {
      const label = (card.querySelector(".etiqueta")?.textContent || "").trim().toLowerCase();
      if (label === "otros movimientos") card.classList.add("bc-hidden");
      if (label === "stock bajo mínimo") card.classList.add("bc-hidden");
      if (label === "ventas recientes") {
        const l = card.querySelector(".etiqueta"); if (l) l.textContent = "Ventas del día";
        const v = card.querySelector(".valor");
        const hoy = new Date(); hoy.setHours(0,0,0,0);
        const total = (_cache.ventas || []).filter(x => x.fecha && new Date(x.fecha) >= hoy).reduce((s,x) => s + (Number(x.total)||0), 0);
        if (v) v.textContent = "$" + (typeof money === "function" ? money(total) : total.toFixed(2));
      }
    });

    const at = document.getElementById("cc-atencion");
    if (at && typeof construirStockBajo === "function") {
      const bajo = construirStockBajo();
      let stockBtn = document.getElementById("bc-stock-attention-btn");
      if (bajo.length) {
        if (!stockBtn) {
          stockBtn = document.createElement("button"); stockBtn.id = "bc-stock-attention-btn"; stockBtn.type = "button"; stockBtn.className = "cc-accion";
          at.appendChild(stockBtn);
          stockBtn.onclick = () => go("inventario");
        }
        stockBtn.textContent = "📉 " + bajo.length + (bajo.length === 1 ? " producto bajo mínimo" : " productos bajo mínimo");
      } else if (stockBtn) stockBtn.remove();
    }
  }

  function setupProducts() {
    const tab = document.getElementById("tab-productos"); if (!tab || tab.dataset.bcUiReady === "1") return;
    const form = document.getElementById("form-producto"); const list = document.getElementById("lista-productos");
    const search = document.getElementById("productos-buscar");
    if (!form || !list || !search) return;
    tab.dataset.bcUiReady = "1";

    const h = form.querySelector("#prod-submit-btn")?.closest("h3"); if (h) h.classList.add("bc-hidden");
    form.classList.add("bc-hidden");

    const toolbar = document.createElement("div"); toolbar.className = "bc-product-toolbar";
    toolbar.innerHTML = '<input id="bc-product-search" type="search" placeholder="Buscar por nombre, categoría o unidad…" autocomplete="off">' +
      '<select id="bc-product-category"><option value="">Todas las categorías</option></select>' +
      '<select id="bc-product-unit"><option value="">Todas las unidades</option></select>' +
      '<button type="button" class="cc-accion bc-add-product">＋ Agregar producto</button>';
    const oldControls = search.closest(".productos-buscador-controles");
    if (oldControls) oldControls.classList.add("bc-hidden");
    tab.insertBefore(toolbar, list);

    const modal = document.createElement("div"); modal.id = "bc-product-modal"; modal.className = "bc-modal-backdrop bc-hidden";
    modal.innerHTML = '<div class="bc-modal" role="dialog" aria-modal="true" aria-label="Producto"><div class="bc-modal-head"><h3 id="bc-product-modal-title">Agregar producto</h3><button type="button" class="bc-modal-close">×</button></div><div id="bc-product-form-host"></div></div>';
    document.body.appendChild(modal);
    modal.querySelector("#bc-product-form-host").appendChild(form);
    form.classList.remove("bc-hidden"); form.classList.add("bc-modal-form");

    const close = () => { modal.classList.add("bc-hidden"); };
    modal.querySelector(".bc-modal-close").onclick = close;
    modal.addEventListener("click", e => { if (e.target === modal) close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !modal.classList.contains("bc-hidden")) close(); });

    toolbar.querySelector(".bc-add-product").onclick = () => {
      if (typeof cancelarEdicionProducto === "function") cancelarEdicionProducto(); else form.reset();
      document.getElementById("bc-product-modal-title").textContent = "Agregar producto";
      modal.classList.remove("bc-hidden");
    };

    const cat = toolbar.querySelector("#bc-product-category"), unit = toolbar.querySelector("#bc-product-unit"), q = toolbar.querySelector("#bc-product-search");
    function rebuildFilters() {
      const products = _cache.productos || [];
      const cats = [...new Set(products.map(p => p.categorias?.nombre).filter(Boolean))].sort();
      const units = [...new Set(products.map(p => p.unidad).filter(Boolean))].sort();
      cat.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(x => '<option>' + escHtml(x) + '</option>').join("");
      unit.innerHTML = '<option value="">Todas las unidades</option>' + units.map(x => '<option>' + escHtml(x) + '</option>').join("");
    }
    function filter() {
      const term = q.value.trim().toLowerCase(), c = cat.value, u = unit.value;
      _productosBusqueda = term;
      const all = _cache.productos || [];
      const filtered = all.filter(p => (!term || [p.nombre,p.unidad,p.categorias?.nombre].some(x => String(x||"").toLowerCase().includes(term))) && (!c || p.categorias?.nombre === c) && (!u || p.unidad === u));
      const original = _cache.productos; _cache.productos = filtered; renderProductosLista(); _cache.productos = original;
    }
    q.oninput = filter; cat.onchange = filter; unit.onchange = filter;

    const observer = new MutationObserver(() => { rebuildFilters(); refineCenter(); });
    observer.observe(list, { childList: true, subtree: true });
    rebuildFilters();

    list.addEventListener("click", e => {
      const edit = e.target.closest(".btn-editar-producto");
      if (edit) {
        setTimeout(() => { document.getElementById("bc-product-modal-title").textContent = "Editar producto"; modal.classList.remove("bc-hidden"); }, 0);
      }
    });
  }

  function setupSettings() {
    const menu = document.getElementById("ajustes-menu"); if (!menu || menu.dataset.bcUiReady === "1") return;
    menu.dataset.bcUiReady = "1";
    const sep = document.createElement("div"); sep.className = "bc-settings-sep";
    const wrap = document.createElement("div"); wrap.className = "bc-settings-grid";
    wrap.innerHTML = '<div class="bc-setting"><label><input id="bc-pref-compacto" type="checkbox"> <span><strong>Modo compacto</strong><small>Reduce espacios para mostrar más información.</small></span></label></div>' +
      '<div class="bc-setting"><label><input id="bc-pref-refresh" type="checkbox"> <span><strong>Actualización automática</strong><small>Refresca el Centro de Control periódicamente.</small></span></label></div>';
    const panel = document.createElement("div"); panel.className = "bc-settings-panel"; panel.appendChild(wrap);
    menu.appendChild(sep); menu.appendChild(panel);
    const compact = panel.querySelector("#bc-pref-compacto"), refresh = panel.querySelector("#bc-pref-refresh");
    compact.checked = !!prefs.compacto; refresh.checked = !!prefs.autoRefresh;
    compact.onchange = () => { prefs.compacto = compact.checked; document.body.classList.toggle("bc-compact", prefs.compacto); save(); };
    refresh.onchange = () => { prefs.autoRefresh = refresh.checked; save(); startAutoRefresh(); };
    document.body.classList.toggle("bc-compact", prefs.compacto);
  }

  function startAutoRefresh() {
    clearInterval(autoTimer);
    if (!prefs.autoRefresh) return;
    autoTimer = setInterval(() => {
      if (document.hidden) return;
      if (typeof refrescarCentroControl === "function") refrescarCentroControl().catch(() => {});
      if (document.getElementById("tab-productos")?.classList.contains("visible") && typeof refrescarProductos === "function") refrescarProductos().catch(() => {});
    }, 60000);
  }

  function boot() {
    injectStyles();
    setupSettings(); setupProducts(); refineCenter(); startAutoRefresh();
    const shell = document.getElementById("app-shell");
    if (shell) new MutationObserver(() => { setupSettings(); setupProducts(); refineCenter(); }).observe(shell, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
