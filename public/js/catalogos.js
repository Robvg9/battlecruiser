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
      const formAnchor = form.parentElement || productosTab.firstElementChild;
      if (formAnchor) formAnchor.insertAdjacentElement("beforebegin", tools);

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

    if (!document.getElementById("prod-presentaciones-config")) {
      const cfg = document.createElement("fieldset");
      cfg.id = "prod-presentaciones-config";
      cfg.className = "prod-pres-config";
      cfg.innerHTML = `
        <legend>Presentaciones del producto <span class="prod-required">obligatorio</span></legend>
        <div class="prod-pres-grid">
          <div class="field"><label for="prod-pres-min">Presentación minorista</label><select id="prod-pres-min" required><option value="">Selecciona presentación</option></select><small>Factor fijo: 1 unidad base.</small></div>
          <div class="field"><label for="prod-pres-may-habilitado">¿Maneja mayorista?</label><select id="prod-pres-may-habilitado"><option value="no">No</option><option value="si">Sí</option></select><small>Solo si el producto se comercializará por mayor.</small></div>
          <div class="field prod-pres-may-field hidden"><label for="prod-pres-may">Presentación mayorista</label><select id="prod-pres-may"><option value="">Selecciona presentación</option></select></div>
          <div class="field prod-pres-may-field hidden"><label for="prod-pres-may-factor">Unidades base por presentación mayorista</label><input id="prod-pres-may-factor" type="number" min="2" step="1" inputmode="numeric" placeholder="Ej. 24"><small>Ej.: 1 caja = 24 unidades.</small></div>
        </div>`;
      const imageField = form.querySelector(".prod-imagen-campo");
      if (imageField) imageField.insertAdjacentElement("beforebegin", cfg); else form.appendChild(cfg);

      const toggle = document.getElementById("prod-pres-may-habilitado");
      toggle.addEventListener("change", () => {
        const visible = toggle.value === "si";
        form.querySelectorAll(".prod-pres-may-field").forEach((el) => el.classList.toggle("hidden", !visible));
        document.getElementById("prod-pres-may").required = visible;
        document.getElementById("prod-pres-may-factor").required = visible;
      });
    }

    cargarSelectsPresentacionesProducto();
    instalarEstilosNomenclatura();
    instalarValidacionCreacionProducto();
  };

  function cargarSelectsPresentacionesProducto() {
    const min = document.getElementById("prod-pres-min");
    const may = document.getElementById("prod-pres-may");
    if (!min || !may) return;
    const cargar = async () => {
      let rows = [];
      try {
        if (typeof cargarPresentacionesTodas === "function") rows = await cargarPresentacionesTodas();
        else rows = await withCache("presentaciones", () => client.from("presentaciones").select("id, nombre, activo").order("nombre"));
      } catch (e) { console.warn("[Battlecruiser] No se pudieron cargar presentaciones:", e); return; }
      const activas = (rows || []).filter((p) => p.activo !== false);
      [min, may].forEach((select) => {
        const actual = select.value;
        select.innerHTML = '<option value="">Selecciona presentación</option>';
        activas.forEach((p) => { const o = document.createElement("option"); o.value = p.id; o.textContent = p.nombre; select.appendChild(o); });
        if (actual && activas.some((p) => p.id === actual)) select.value = actual;
      });
    };
    cargar();
    window._recargarPresentacionesProducto = cargar;
  }

  let nomenclaturaOrigenes = [];
  function prepararNomenclatura() {
    nomenclaturaOrigenes = [];
    const items = [["presentaciones-catalogo", "prod-nom-presentaciones-slot"], ["lista-categorias", "prod-nom-categorias-slot"], ["lista-unidades", "prod-nom-unidades-slot"]];
    items.forEach(([id, slotId]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const bloque = el.closest(".card") || el.closest(".cc-bloque") || el.parentElement;
      if (!bloque || !bloque.parentElement) return;
      nomenclaturaOrigenes.push({ bloque, parent: bloque.parentElement, next: bloque.nextSibling });
      document.getElementById(slotId).appendChild(bloque);
    });
    if (typeof _refrescarCatalogo_categorias === "function") _refrescarCatalogo_categorias();
    if (typeof _refrescarCatalogo_unidades === "function") _refrescarCatalogo_unidades();
    if (typeof refrescarPresentacionesCatalogo === "function") refrescarPresentacionesCatalogo();
  }
  function restaurarNomenclatura() {
    nomenclaturaOrigenes.reverse().forEach(({ bloque, parent, next }) => {
      if (!parent) return;
      if (next && next.parentNode === parent) parent.insertBefore(bloque, next); else parent.appendChild(bloque);
    });
    nomenclaturaOrigenes = [];
  }

  function instalarValidacionCreacionProducto() {
    const form = document.getElementById("form-producto");
    if (!form || form.dataset.presGuard === "1") return;
    form.dataset.presGuard = "1";
    form.addEventListener("submit", async (e) => {
      const editando = document.getElementById("prod-editando-id")?.value;
      if (editando) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      await crearProductoConPresentaciones(e);
    }, true);
  }

  async function crearProductoConPresentaciones(e) {
    const form = e.target;
    const nombre = document.getElementById("prod-nombre")?.value.trim();
    const categoria_id = document.getElementById("prod-categoria")?.value || null;
    const unidad = document.getElementById("prod-unidad")?.value.trim() || null;
    const precio_normal = parseFloat(document.getElementById("prod-precio-normal")?.value);
    const precio_mayorista_raw = document.getElementById("prod-precio-mayorista")?.value.trim();
    const precio_mayorista = precio_mayorista_raw === "" ? null : parseFloat(precio_mayorista_raw);
    const presMin = document.getElementById("prod-pres-min")?.value;
    const mayorista = document.getElementById("prod-pres-may-habilitado")?.value === "si";
    const presMay = document.getElementById("prod-pres-may")?.value;
    const factorMay = parseFloat(document.getElementById("prod-pres-may-factor")?.value);
    const imagen = document.getElementById("prod-imagen-input")?.files?.[0] || null;
    const submitBtn = form.querySelector("button[type='submit']");

    if (!nombre) return setMsg("msg-productos", "El nombre del producto es obligatorio.", false);
    if (!(precio_normal > 0)) return setMsg("msg-productos", "El precio normal debe ser mayor a 0.", false);
    if (precio_mayorista !== null && !(precio_mayorista > 0)) return setMsg("msg-productos", "El precio mayorista debe ser mayor a 0.", false);
    if (!presMin) return setMsg("msg-productos", "Debes definir la presentación minorista.", false);
    if (mayorista && (!presMay || !(factorMay >= 2))) return setMsg("msg-productos", "Define la presentación mayorista y cuántas unidades base contiene.", false);
    if (imagen && typeof validarArchivoImagenProducto === "function") {
      const errorImagen = validarArchivoImagenProducto(imagen);
      if (errorImagen) return setMsg("msg-prod-imagen", errorImagen, false);
    }
    if (typeof estaRealmenteDesconectado === "function" && estaRealmenteDesconectado()) return setMsg("msg-productos", "Para crear un producto con sus presentaciones necesitas conexión. Así evitamos crear un producto sin su configuración obligatoria.", false);

    submitBtn.disabled = true;
    const resultado = await ejecutarOperacion("producto", { p_nombre: nombre, p_categoria_id: categoria_id, p_unidad: unidad, p_precio_normal: precio_normal, p_precio_mayorista: mayorista ? precio_mayorista : null });
    if (!resultado.ok || resultado.offline || !resultado.data) {
      submitBtn.disabled = false;
      return setMsg("msg-productos", resultado.offline ? "El producto necesita conexión para guardar sus presentaciones obligatorias." : "No se pudo crear el producto: " + explicarError(resultado.error, "crear producto"), false);
    }

    const productoId = resultado.data;
    const asociaciones = [{ producto_id: productoId, presentacion_id: presMin, factor: 1 }];
    if (mayorista) asociaciones.push({ producto_id: productoId, presentacion_id: presMay, factor: factorMay });
    const { error: errorPres } = await client.from("producto_presentaciones").insert(asociaciones);
    if (errorPres) {
      try { await client.from("productos").delete().eq("id", productoId); } catch (_) {}
      submitBtn.disabled = false;
      return setMsg("msg-productos", "El producto no quedó creado porque no se pudieron guardar sus presentaciones: " + explicarError(errorPres, "guardar presentaciones"), false);
    }

    if (imagen && typeof subirImagenProducto === "function") {
      const rImg = await subirImagenProducto(productoId, imagen);
      if (!rImg.ok) setMsg("msg-productos", "Producto creado con sus presentaciones, pero la imagen no pudo subirse: " + explicarError(rImg.error, "subir imagen"), false);
    }

    submitBtn.disabled = false;
    if (typeof cancelarEdicionProducto === "function") cancelarEdicionProducto();
    setMsg("msg-productos", mayorista ? "✓ Producto creado con presentación minorista y mayorista." : "✓ Producto creado con presentación minorista.", true);
    if (typeof refrescarProductos === "function") await refrescarProductos();
    if (typeof window._recargarPresentacionesProducto === "function") window._recargarPresentacionesProducto();
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
