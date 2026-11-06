// ==== Battlecruiser · js/catalogos.js ====
// Catálogos simples reutilizables. La categoría conserva un único formulario/lista dentro de su ventana flotante.

function initCatalogoSimple({ tabla, formId, inputId, listaId, singular }) {
  safeInit("catalogo-" + tabla, () => {
    const form = document.getElementById(formId);
    const input = document.getElementById(inputId);
    const lista = document.getElementById(listaId);
    if (!form || !input || !lista) return;

    let editandoId = null;
    let filasActuales = [];
    const submitBtn = form.querySelector("button[type='submit']");
    const cancelarBtn = tabla === "categorias" ? document.getElementById("cat-cancelar-edicion") : null;

    function cancelarEdicion() {
      editandoId = null;
      form.reset();
      if (submitBtn) submitBtn.textContent = "Agregar categoría";
      if (cancelarBtn) cancelarBtn.classList.add("hidden");
    }

    async function refrescar(forzarServidor) {
      setLoading(listaId, "Cargando…");
      let data;
      if (forzarServidor) {
        const result = await client.from(tabla).select("id, nombre, activo").order("nombre");
        if (result.error) {
          setMsg("msg-config", "No se pudo actualizar la lista: " + explicarError(result.error, "leer " + singular), false);
          return;
        }
        data = result.data;
      } else {
        data = await withCache(tabla, () => client.from(tabla).select("id, nombre, activo").order("nombre"));
      }
      filasActuales = Array.isArray(data) ? data : [];
      if (filasActuales.length === 0) {
        setEmpty(listaId, mensajeListaVacia(tabla, "Todavía no hay " + tabla + " cargadas."));
        return;
      }
      lista.innerHTML = "";
      filasActuales.forEach((row) => {
        const div = document.createElement("div");
        div.className = "lista-item";
        const label = document.createElement("span");
        label.textContent = row.nombre + (row.activo ? "" : " · inactivo");
        const actions = document.createElement("span");
        actions.className = "lista-item-acciones";
        if (tabla === "categorias") {
          const edit = document.createElement("button");
          edit.type = "button";
          edit.className = "catalogo-edit-btn";
          edit.dataset.id = row.id;
          edit.textContent = "Editar";
          actions.appendChild(edit);
          if (tabla === "categorias") {
            const remove = document.createElement("button"); remove.type = "button"; remove.className = "catalogo-delete-btn"; remove.dataset.id = row.id; remove.textContent = "Eliminar"; actions.appendChild(remove);
          }
        }
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "catalogo-toggle-btn";
        toggle.dataset.id = row.id;
        toggle.dataset.activo = String(!!row.activo);
        toggle.textContent = row.activo ? "Desactivar" : "Activar";
        actions.appendChild(toggle);
        div.append(label, actions);
        lista.appendChild(div);
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nombre = input.value.trim();
      if (!nombre) return;
      if (submitBtn) submitBtn.disabled = true;
      const result = editandoId
        ? await client.from(tabla).update({ nombre }).eq("id", editandoId)
        : await client.from(tabla).insert({ nombre });
      if (submitBtn) submitBtn.disabled = false;
      if (result.error) {
        const detail = result.error.code === "23505"
          ? "Ya existe un valor con ese nombre."
          : explicarError(result.error, (editandoId ? "editar " : "crear ") + singular);
        setMsg("msg-config", "No se pudo " + (editandoId ? "editar" : "crear") + ": " + detail, false);
        return;
      }
      const wasEditing = !!editandoId;
      setMsg("msg-config", singular.charAt(0).toUpperCase() + singular.slice(1) + (wasEditing ? " actualizada." : " creada."), true);
      cancelarEdicion();
      await refrescar(true);
      if (typeof window.bcNotificarCambioDatos === "function") window.bcNotificarCambioDatos(["categories", "products", "inventory"], false);
      if (tabla === "categorias" && typeof window.refrescarSelectorCategoriasProducto === "function") {
        try { await window.refrescarSelectorCategoriasProducto(); } catch (error) { console.warn(error); }
      }
    });

    lista.addEventListener("click", async (e) => {
      const editBtn = e.target.closest(".catalogo-edit-btn");
      if (editBtn && tabla === "categorias") {
        const row = filasActuales.find((item) => String(item.id) === String(editBtn.dataset.id));
        if (!row) return;
        editandoId = row.id;
        input.value = row.nombre || "";
        if (submitBtn) submitBtn.textContent = "Guardar cambios";
        if (cancelarBtn) cancelarBtn.classList.remove("hidden");
        input.focus();
        return;
      }
      const del = e.target.closest(".catalogo-delete-btn");
      if (del && tabla === "categorias") {
        const row = filasActuales.find((item) => String(item.id) === String(del.dataset.id));
        if (!row || !window.confirm('¿Eliminar la categoría "' + row.nombre + '"? Esta acción no se puede deshacer.')) return;
        del.disabled = true;
        const refs = await client.from("productos").select("id").eq("categoria_id", row.id);
        if (refs.error || (Array.isArray(refs.data) && refs.data.length)) {
          del.disabled = false;
          setMsg("msg-config", refs.error ? explicarError(refs.error, "consultar productos") : "No se puede eliminar: hay productos asociados. Reasígnalos primero.", false);
          return;
        }
        const removed = await client.from("categorias").delete().eq("id", row.id); del.disabled = false;
        if (removed.error) { setMsg("msg-config", explicarError(removed.error, "eliminar categoría"), false); return; }
        setMsg("msg-config", "Categoría eliminada.", true); await refrescar(true);
        if (typeof window.bcNotificarCambioDatos === "function") window.bcNotificarCambioDatos(["categories", "products", "inventory"], false);
        if (typeof window.refrescarSelectorCategoriasProducto === "function") { try { await window.refrescarSelectorCategoriasProducto(); } catch (error) { console.warn(error); } }
        return;
      }
      const btn = e.target.closest(".catalogo-toggle-btn");
      if (!btn) return;
      btn.disabled = true;
      const { error } = await client.from(tabla)
        .update({ activo: btn.dataset.activo !== "true" })
        .eq("id", btn.dataset.id);
      btn.disabled = false;
      if (error) {
        setMsg("msg-config", "No se pudo actualizar: " + explicarError(error, "actualizar " + singular), false);
        return;
      }
      await refrescar();
      if (tabla === "categorias" && typeof window.bcNotificarCambioDatos === "function") window.bcNotificarCambioDatos(["categories", "products", "inventory"], false);
      if (tabla === "categorias" && typeof window.refrescarSelectorCategoriasProducto === "function") {
        try { await window.refrescarSelectorCategoriasProducto(); } catch (error) { console.warn(error); }
      }
    });

    if (cancelarBtn) cancelarBtn.addEventListener("click", cancelarEdicion);
    window["_refrescarCatalogo_" + tabla] = refrescar;
  });
}

initCatalogoSimple({ tabla: "categorias", formId: "form-categoria", inputId: "cat-nombre", listaId: "lista-categorias", singular: "categoría" });

/* Presentaciones se administra en un único panel dentro de Administración.
   El modal heredado de Productos quedó retirado para evitar rutas duplicadas. */

/* La interfaz de Productos la gestiona exclusivamente m26-ui-integridad.js. */
(function initProductosUI22(){})();
