// ==== Battlecruiser · js/catalogos.js ====
// Catálogos simples reutilizables (categorías, unidades).
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

// ---- Formas de presentación. Los 3 catálogos comparten la misma regla de
function initCatalogoSimple({ tabla, formId, inputId, listaId, singular }) {
  safeInit("catalogo-" + tabla, () => {
    const form = document.getElementById(formId);
    const input = document.getElementById(inputId);
    const lista = document.getElementById(listaId);
    if (!form || !input || !lista) return;

    async function refrescar() {
      setLoading(listaId, "Cargando…");
      const data = await withCache(tabla, () => client.from(tabla).select("id, nombre, activo").order("nombre"));
      if (!data || data.length === 0) {
        setEmpty(listaId, mensajeListaVacia(tabla, "Todavía no hay " + tabla + " cargadas."));
        return;
      }
      lista.innerHTML = "";
      data.forEach((row) => {
        const div = document.createElement("div");
        div.className = "lista-item";
        div.innerHTML = `<span>${escHtml(row.nombre)} ${row.activo ? "" : '<span class="muted">· inactivo</span>'}</span>
          <button type="button" class="catalogo-toggle-btn" data-id="${row.id}" data-activo="${row.activo}">${row.activo ? "Desactivar" : "Activar"}</button>`;
        lista.appendChild(div);
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nombre = input.value.trim();
      if (!nombre) return;
      const submitBtn = form.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      const { error } = await client.from(tabla).insert({ nombre });
      submitBtn.disabled = false;
      if (error) {
        const msg = error.code === "23505" ? "Ya existe un valor con ese nombre." : explicarError(error, "crear " + singular);
        setMsg("msg-config", "No se pudo crear: " + msg, false);
        return;
      }
      setMsg("msg-config", singular.charAt(0).toUpperCase() + singular.slice(1) + " creada.", true);
      form.reset();
      await refrescar();
    });

    lista.addEventListener("click", async (e) => {
      const btn = e.target.closest(".catalogo-toggle-btn");
      if (!btn) return;
      const id = btn.dataset.id;
      const activoActual = btn.dataset.activo === "true";
      btn.disabled = true;
      const { error } = await client.from(tabla).update({ activo: !activoActual }).eq("id", id);
      btn.disabled = false;
      if (error) {
        setMsg("msg-config", "No se pudo actualizar: " + explicarError(error, "actualizar " + singular), false);
        return;
      }
      await refrescar();
    });

    window["_refrescarCatalogo_" + tabla] = refrescar;
  });
}

initCatalogoSimple({ tabla: "categorias", formId: "form-categoria", inputId: "cat-nombre", listaId: "lista-categorias", singular: "categoría" });
initCatalogoSimple({ tabla: "unidades", formId: "form-unidad", inputId: "uni-nombre", listaId: "lista-unidades", singular: "unidad" });

/* ================================================================
   PRODUCTOS — NOMENCLATURA + PRESENTACIONES OBLIGATORIAS
   ================================================================ */
(function initProductosNomenclatura() {
  const boot = () => {
    const productosTab = document.getElementById("tab-productos");
    const form = document.getElementById("form-producto");
    if (!productosTab || !form) return;

    if (!document.getElementById("productos-nomenclatura-btn")) {
      const tools = document.createElement("div");
      tools.id = "productos-tools-nomenclatura";
      tools.innerHTML = `<button type="button" class="cc-accion" id="productos-nomenclatura-btn">⚙️ Nomenclatura y catálogos</button>`;
      // Keep the toolbar inside #tab-productos. M26 removes this UI if it is outside that panel.
      form.insertAdjacentElement("beforebegin", tools);

      const modal = document.createElement("div");
      modal.id = "productos-nomenclatura-modal";
      modal.className = "prod-nom-modal hidden";
      modal.innerHTML = `
        <div class="prod-nom-dialog" role="dialog" aria-modal="true" aria-labelledby="prod-nom-title">
          <div class="prod-nom-head">
            <div><h3 id="prod-nom-title">Nomenclatura de productos</h3><p>Catálogos que clasifican y definen cómo se maneja cada producto.</p></div>
            <button type="button" class="icon-btn" id="productos-nomenclatura-cerrar" aria-label="Cerrar">×</button>
          </div>
          <div class="prod-nom-grid">
            <section class="prod-nom-card"><h4>Presentaciones comerciales</h4><p>Formatos usados para comprar, mover o vender.</p><div id="prod-nom-presentaciones-slot"></div></section>
            <section class="prod-nom-card"><h4>Categorías</h4><p>Clasificación principal de los productos.</p><div id="prod-nom-categorias-slot"></div></section>
            <section class="prod-nom-card"><h4>Unidades</h4><p>Unidad base con la que se expresa el inventario.</p><div id="prod-nom-unidades-slot"></div></section>
          </div>
        </div>`;
      document.body.appendChild(modal);

      const btn = document.getElementById("productos-nomenclatura-btn");
      const close = () => { modal.classList.add("hidden"); restaurarNomenclatura(); };
      btn.addEventListener("click", () => { prepararNomenclatura(); modal.classList.remove("hidden"); });
      document.getElementById("productos-nomenclatura-cerrar").addEventListener("click", close);
      modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    }

    // Product-specific presentations and prices are managed only by the single
    // commercial-options panel. This file owns master catalog management only.
    instalarEstilosNomenclatura();
  };

  let nomenclaturaOrigenes = [];

  // Catalog lists sometimes sit directly under #tab-config rather than in a
  // card. Never use the tab-panel itself as a movable fallback: that would
  // place all of Configuration inside the hidden product-nomenclature modal.
  function obtenerBloqueNomenclatura(id, el) {
    if (!el) return null;
    const panel = el.closest(".tab-panel");
    const existente = el.closest(".card") || el.closest(".cc-bloque");

    // Existing cards are movable only when they are strictly inside the tab
    // that owns the catalogue. A shared/outer .cc-bloque may wrap #tab-config;
    // moving that ancestor into the hidden modal hides Configuration itself.
    if (existente && (!panel || (
      panel.contains(existente) &&
      existente !== panel &&
      !existente.contains(panel)
    ))) return existente;

    if (!panel) return el.parentElement;
    let encabezado = el.previousElementSibling;
    while (encabezado && encabezado.tagName !== "H3") encabezado = encabezado.previousElementSibling;
    if (!encabezado) return null;

    const bloque = document.createElement("div");
    bloque.className = "cc-bloque";
    bloque.dataset.bcNomenclatureBlock = id;
    panel.insertBefore(bloque, encabezado);

    let nodo = encabezado;
    while (nodo) {
      const siguiente = nodo.nextElementSibling;
      if (nodo !== encabezado && nodo.tagName === "H3") break;
      bloque.appendChild(nodo);
      if (nodo === el) break;
      nodo = siguiente;
    }

    if (!bloque.contains(el)) {
      [...bloque.children].forEach((hijo) => panel.insertBefore(hijo, bloque));
      bloque.remove();
      return null;
    }
    return bloque;
  }

  function prepararNomenclatura() {
    // Reopening an already-open modal must not overwrite the original parents.
    if (nomenclaturaOrigenes.length) return;
    const items = [["presentaciones-catalogo", "prod-nom-presentaciones-slot"], ["lista-categorias", "prod-nom-categorias-slot"], ["lista-unidades", "prod-nom-unidades-slot"]];
    items.forEach(([id, slotId]) => {
      const el = document.getElementById(id);
      const slot = document.getElementById(slotId);
      if (!el || !slot) return;
      const bloque = obtenerBloqueNomenclatura(id, el);
      if (!bloque || !bloque.parentElement || bloque.matches(".tab-panel")) return;
      if (nomenclaturaOrigenes.some((origen) => origen.bloque === bloque)) return;
      const parent = bloque.parentElement;
      const placeholder = document.createComment("bc-nomenclature-" + id);
      parent.insertBefore(placeholder, bloque);
      nomenclaturaOrigenes.push({ bloque, parent, placeholder });
      slot.appendChild(bloque);
    });
    if (typeof _refrescarCatalogo_categorias === "function") _refrescarCatalogo_categorias();
    if (typeof _refrescarCatalogo_unidades === "function") _refrescarCatalogo_unidades();
    if (typeof refrescarPresentacionesCatalogo === "function") refrescarPresentacionesCatalogo();
  }
  function restaurarNomenclatura() {
    nomenclaturaOrigenes.reverse().forEach(({ bloque, parent, placeholder }) => {
      if (!parent) return;
      if (placeholder && placeholder.parentNode === parent) {
        parent.insertBefore(bloque, placeholder);
        placeholder.remove();
      } else {
        parent.appendChild(bloque);
        if (placeholder && placeholder.parentNode) placeholder.remove();
      }
    });
    nomenclaturaOrigenes = [];
  }

  function instalarEstilosNomenclatura() {
    if (document.getElementById("productos-nomenclatura-style")) return;
    const style = document.createElement("style");
    style.id = "productos-nomenclatura-style";
    style.textContent = `
      #productos-tools-nomenclatura{display:flex;justify-content:flex-end;margin:0 0 10px}
      .prod-nom-modal{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.58);display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}
      .prod-nom-modal.hidden{display:none!important}
      .prod-nom-dialog{width:min(900px,100%);max-height:88vh;overflow:auto;background:var(--void,#101512);border:1px solid var(--gold-dim,#c9a24d33);border-radius:12px;padding:18px;box-shadow:0 20px 70px rgba(0,0,0,.45)}
      .prod-nom-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}
      .prod-nom-head h3{margin:0 0 4px}.prod-nom-head p{margin:0;color:var(--mist,#aaa);font-size:12px}
      .prod-nom-grid{display:grid;grid-template-columns:1fr;gap:12px}.prod-nom-card{border:1px solid var(--gold-dim,#c9a24d33);border-radius:9px;padding:12px}.prod-nom-card h4{margin:0 0 5px}.prod-nom-card>p{font-size:12px;color:var(--mist,#aaa);margin:0 0 10px}
      .prod-pres-config{margin:12px 0;padding:12px;border:1px solid var(--gold-dim,#c9a24d33);border-radius:9px}.prod-pres-config legend{padding:0 6px;font-weight:600}.prod-required{font-size:10px;text-transform:uppercase;opacity:.7;margin-left:5px}.prod-pres-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.prod-pres-config small{display:block;color:var(--mist,#aaa);font-size:11px;margin-top:4px}
      @media(max-width:700px){.prod-pres-grid{grid-template-columns:1fr}.prod-nom-modal{padding:3vh 10px}.prod-nom-dialog{max-height:94vh}}
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();

/* ================================================================
   M22 — PRODUCTOS: EXPERIENCIA LIMPIA
   DESACTIVADO en v9.2.22: competía con M26 (botón/form duplicados).
   La UI de Productos la gestiona exclusivamente m26-ui-integridad.js.
   ================================================================ */
(function initProductosUI22(){
  // no-op: M26 es el único sistema de UI de Productos desde 9.2.22
})();
