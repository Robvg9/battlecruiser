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
   PRODUCTOS — PRESENTACIONES COMERCIALES
   Categorías y unidades se gestionan exclusivamente en Administración.
   M26 es el único responsable de abrir el modal y reunir sus bloques.
   ================================================================ */
(function initProductosNomenclatura() {
  const boot = () => {
    const productosTab = document.getElementById("tab-productos");
    const form = document.getElementById("form-producto");
    if (!productosTab || !form || document.getElementById("productos-nomenclatura-btn")) return;
    const tools = document.createElement("div");
    tools.id = "productos-tools-nomenclatura";
    tools.innerHTML = '<button type="button" class="cc-accion" id="productos-nomenclatura-btn" aria-haspopup="dialog" aria-controls="productos-nomenclatura-modal">Presentaciones comerciales</button>';
    form.insertAdjacentElement("beforebegin", tools);
    const modal = document.createElement("div");
    modal.id = "productos-nomenclatura-modal";
    modal.className = "prod-nom-modal hidden";
    modal.innerHTML = `
      <div class="prod-nom-dialog" role="dialog" aria-modal="true" aria-labelledby="prod-nom-title">
        <div class="prod-nom-head">
          <div><h3 id="prod-nom-title">Presentaciones comerciales</h3><p>Formatos y equivalencias utilizados al comprar, mover y vender productos.</p></div>
          <button type="button" class="icon-btn" id="productos-nomenclatura-cerrar" aria-label="Cerrar">×</button>
        </div>
        <div class="prod-nom-grid">
          <section class="prod-nom-card"><h4>Catálogo y equivalencias</h4><p>Administra los formatos disponibles y su relación con cada producto.</p><div id="prod-nom-presentaciones-slot"></div></section>
        </div>
      </div>`;
    document.body.appendChild(modal);
    instalarEstilosNomenclatura();
  };
  function instalarEstilosNomenclatura() {
    if (document.getElementById("productos-nomenclatura-style")) return;
    const style = document.createElement("style");
    style.id = "productos-nomenclatura-style";
    style.textContent = `
      .prod-nom-modal{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.62);display:flex;align-items:flex-end;justify-content:center;padding:12px;overflow:auto}
      .prod-nom-modal.hidden{display:none!important}
      .prod-nom-dialog{display:flex;flex-direction:column;width:min(680px,100%);max-height:min(84vh,720px);max-height:min(84dvh,720px);overflow:hidden;background:var(--void,#101512);border:1px solid var(--gold-dim,#c9a24d33);border-radius:14px;padding:12px;box-shadow:0 20px 70px rgba(0,0,0,.45)}
      .prod-nom-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 9px;padding:0 0 9px;border-bottom:1px solid rgba(201,162,77,.16)}
      .prod-nom-head h3{margin:0 0 3px;font-size:19px;line-height:1.15}
      .prod-nom-head p{margin:0;color:var(--mist,#aaa);font-size:11px;line-height:1.35}
      .prod-nom-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;min-height:0;overflow:auto;overscroll-behavior:contain}
      .prod-nom-card{min-width:0;border:1px solid var(--gold-dim,#c9a24d33);border-radius:9px;padding:9px}
      .prod-nom-card h4{margin:0 0 3px;font-size:13px}
      .prod-nom-card>p{font-size:10.5px;line-height:1.35;color:var(--mist,#aaa);margin:0 0 7px}
      #prod-nom-presentaciones-slot{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;min-width:0}
      #prod-nom-presentaciones-slot .presentaciones-catalogo,#prod-nom-presentaciones-slot .presentaciones-producto{min-width:0;margin:0;padding:8px;border:1px solid rgba(201,162,77,.14);border-radius:8px}
      #prod-nom-presentaciones-slot .presentaciones-catalogo h4,#prod-nom-presentaciones-slot .presentaciones-producto h4{margin:0 0 6px;font-size:12px}
      #prod-nom-presentaciones-slot .inline-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;margin:0}
      #prod-nom-presentaciones-slot .inline-form input,#prod-nom-presentaciones-slot .inline-form select{min-width:0;min-height:36px;padding:7px 9px;font-size:11px}
      #prod-nom-presentaciones-slot .inline-form button{min-height:36px;padding:7px 10px;font-size:10.5px}
      #prod-nom-presentaciones-slot .lista{max-height:150px;overflow:auto;overscroll-behavior:contain}
      @media(min-width:700px){.prod-nom-modal{align-items:center}.prod-nom-dialog{padding:16px;max-height:80vh;max-height:80dvh}}
      @media(max-width:360px){.prod-nom-dialog{padding:9px}.prod-nom-head h3{font-size:17px}#prod-nom-presentaciones-slot .inline-form{grid-template-columns:minmax(0,1fr)}}
    `;
    document.head.appendChild(style);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();

/* ================================================================
   M22 — PRODUCTOS: EXPERIENCIA LIMPIA
   DESACTIVADO en v9.2.22: competía con M26 (botón/form duplicados).
   La UI de Productos la gestiona exclusivamente m26-ui-integridad.js.
   ================================================================ */
(function initProductosUI22(){
  // no-op: M26 es el único sistema de UI de Productos desde 9.2.22
})();
