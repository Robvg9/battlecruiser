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

/* Presentaciones se administra en un único panel dentro de Administración.
   El modal heredado de Productos quedó retirado para evitar rutas duplicadas. */

/* ================================================================
   M22 — PRODUCTOS: EXPERIENCIA LIMPIA
   DESACTIVADO en v9.2.22: competía con M26 (botón/form duplicados).
   La UI de Productos la gestiona exclusivamente m26-ui-integridad.js.
   ================================================================ */
(function initProductosUI22(){
  // no-op: M26 es el único sistema de UI de Productos desde 9.2.22
})();
