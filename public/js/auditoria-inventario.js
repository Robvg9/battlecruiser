// BattleCruiser — auditoría física independiente para almacenes de almacenamiento.
// Mantiene los conteos fuera de Jornada y delega en Supabase el bloqueo y las reglas.
(function () {
  "use strict";
  if (window.__BC_AUDITORIA_INVENTARIO__ === "1.0") return;
  window.__BC_AUDITORIA_INVENTARIO__ = "1.0";

  const RPC = {
    warehouses: "bc_listar_almacenes_auditoria_inventario",
    list: "bc_listar_auditorias_inventario",
    create: "bc_crear_auditoria_inventario",
    detail: "bc_detalle_auditoria_inventario",
    save: "bc_guardar_conteo_auditoria_inventario",
    close: "bc_cerrar_auditoria_inventario",
    cancel: "bc_cancelar_auditoria_inventario",
    resolve: "bc_resolver_linea_auditoria_inventario",
    writeoff: "bc_registrar_baja_auditoria_inventario",
  };

  let currentAudit = null;
  let currentDetail = null;
  let warehouseOptions = [];
  let searchTerm = "";
  let busy = false;

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return typeof escHtml === "function"
      ? escHtml(String(value == null ? "" : value))
      : String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
          return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
        });
  }
  function number(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0";
    return typeof window.numberFmt === "function"
      ? window.numberFmt(n)
      : new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(n);
  }
  function dateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(d);
  }
  function setMessage(message, ok) {
    const el = byId("bc-auditoria-inv-message");
    if (!el) return;
    el.textContent = message || "";
    el.className = "msg bc-auditoria-inv-message" + (message ? (ok ? " success" : " error") : "");
  }
  function setBusy(value) {
    busy = !!value;
    const root = byId("mando-auditoria-inventario");
    if (!root) return;
    root.querySelectorAll("button").forEach((button) => {
      if (button.dataset.keepEnabled === "true") return;
      button.disabled = busy;
    });
    root.setAttribute("aria-busy", busy ? "true" : "false");
  }
  function rpcError(error, fallback) {
    return String((error && (error.message || error.details || error.hint)) || fallback || "No se pudo completar la operación.");
  }
  function requirePermission() {
    if (typeof tienePermiso === "function" && tienePermiso("auditoria", "ver")) return true;
    setMessage("Tu usuario no tiene permiso para acceder a las auditorías de inventario.", false);
    return false;
  }

  async function loadWarehouses() {
    const select = byId("bc-auditoria-inv-warehouse");
    if (!select) return;
    const { data, error } = await client.rpc(RPC.warehouses);
    if (error) throw new Error(rpcError(error, "No se pudieron cargar los almacenes."));
    warehouseOptions = Array.isArray(data) ? data : [];
    select.innerHTML = '<option value="">Selecciona un almacén de almacenamiento…</option>' +
      warehouseOptions.map((w) => '<option value="' + esc(w.id) + '">' + esc(w.nombre) + "</option>").join("");
    if (!warehouseOptions.length) {
      select.innerHTML = '<option value="">No hay almacenes de almacenamiento activos.</option>';
    }
  }

  async function loadAudits() {
    const list = byId("bc-auditoria-inv-list");
    if (!list) return;
    const { data, error } = await client.rpc(RPC.list);
    if (error) {
      list.innerHTML = '<p class="lista-estado">' + esc(rpcError(error, "No se pudo cargar el historial.")) + "</p>";
      return;
    }
    const audits = Array.isArray(data) ? data : [];
    if (!audits.length) {
      list.innerHTML = '<p class="lista-estado">Todavía no hay auditorías físicas. Puedes iniciar la primera en un almacén de almacenamiento.</p>';
      return;
    }
    list.innerHTML = audits.map((a) => {
      const state = a.estado === "EN_CONTEO" ? "Conteo abierto"
        : a.estado === "CERRADA" ? "Conteo cerrado"
        : a.estado === "CADUCADA" ? "Ventana caducada" : "Cancelada";
      const statusClass = a.estado === "EN_CONTEO" ? "open"
        : a.estado === "CERRADA" && Number(a.pendientes_revision) > 0 ? "review"
        : "closed";
      return '<button type="button" class="bc-auditoria-inv-history" data-audit-open="' + esc(a.id) + '">' +
        '<span class="bc-auditoria-inv-history-main"><strong>' + esc(a.almacen_nombre || "Almacén") +
        '</strong><span class="muted">' + esc(dateTime(a.fecha_apertura)) + " · " + esc(a.creado_nombre || "") + '</span></span>' +
        '<span class="bc-auditoria-inv-history-state ' + statusClass + '">' + esc(state) + '</span>' +
        '<span class="bc-auditoria-inv-history-meta">' + number(a.lineas_contadas || 0) + "/" + number(a.total_lineas || 0) +
        " contados · " + number(a.diferencias || 0) + " diferencias" +
        (Number(a.pendientes_revision) > 0 ? " · " + number(a.pendientes_revision) + " por revisar" : "") +
        "</span></button>";
    }).join("");
  }

  async function createAudit() {
    if (!requirePermission() || busy) return;
    const warehouseId = (byId("bc-auditoria-inv-warehouse") || {}).value || "";
    const observation = (byId("bc-auditoria-inv-note") || {}).value || "";
    if (!warehouseId) {
      setMessage("Selecciona un almacén de almacenamiento.", false);
      return;
    }
    if (!window.crypto || typeof window.crypto.randomUUID !== "function") {
      setMessage("Este dispositivo no permite generar una clave segura. Actualiza el navegador y vuelve a intentarlo.", false);
      return;
    }
    setBusy(true);
    setMessage("Preparando el inventario de referencia y protegiendo el almacén…", true);
    try {
      const { data, error } = await client.rpc(RPC.create, {
        p_almacen_id: warehouseId,
        p_observacion: observation.trim() || null,
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) throw new Error(rpcError(error, "No se pudo iniciar la auditoría."));
      currentAudit = data && data.id;
      if (!currentAudit) throw new Error("El servidor no devolvió el identificador del conteo.");
      searchTerm = "";
      if (byId("bc-auditoria-inv-note")) byId("bc-auditoria-inv-note").value = "";
      await openAudit(currentAudit);
      setMessage("Conteo iniciado. Los movimientos de stock de este almacén están temporalmente protegidos.", true);
    } catch (error) {
      setMessage(error.message || "No se pudo iniciar la auditoría.", false);
    } finally {
      setBusy(false);
    }
  }

  async function openAudit(id) {
    if (!requirePermission()) return;
    const { data, error } = await client.rpc(RPC.detail, { p_auditoria_id: id });
    if (error) throw new Error(rpcError(error, "No se pudo abrir el detalle de la auditoría."));
    if (!data || !data.cabecera || !Array.isArray(data.lineas)) {
      throw new Error("El servidor devolvió un detalle de auditoría incompleto.");
    }
    currentAudit = id;
    currentDetail = data;
    renderDetail();
    setMessage("", true);
  }

  function renderDetail() {
    const panel = byId("bc-auditoria-inv-detail");
    if (!panel || !currentDetail) return;
    const header = currentDetail.cabecera;
    const lines = currentDetail.lineas;
    const open = header.estado === "EN_CONTEO";
    const expired = header.estado === "CADUCADA";
    const count = lines.filter((l) => l.cantidad_fisica != null).length;
    const differences = lines.filter((l) => l.diferencia != null && Number(l.diferencia) !== 0);
    const pending = differences.filter((l) => l.decision === "PENDIENTE").length;
    const filtered = lines.filter((l) => {
      const query = searchTerm.trim().toLocaleLowerCase();
      return !query || String(l.producto_nombre || "").toLocaleLowerCase().includes(query) ||
        String(l.variante_nombre || "").toLocaleLowerCase().includes(query);
    });

    let body = '<div class="bc-auditoria-inv-detail-head"><div><h4>' + esc(header.almacen_nombre) +
      '</h4><p class="muted">Abierta ' + esc(dateTime(header.fecha_apertura)) + " · Responsable: " +
      esc(header.creado_nombre || "Dueño") + "</p></div>" +
      '<span class="bc-auditoria-inv-state ' + (open ? "open" : expired ? "review" : "closed") + '">' +
      (open ? "Conteo en curso" : expired ? "Ventana caducada" : header.estado === "CERRADA" ? "Conteo cerrado" : "Cancelada") +
      "</span></div>";

    if (header.observacion) body += '<p class="bc-auditoria-inv-note">' + esc(header.observacion) + "</p>";
    if (open) {
      body += '<div class="bc-auditoria-inv-warning"><strong>Almacén protegido durante el conteo.</strong> Las compras, transferencias, bajas y otros cambios de stock de este almacén se rechazan temporalmente. La ventana expira a las ' +
        esc(dateTime(header.vence_en)) + ". Completa el conteo y ciérralo; si lo interrumpes, cancélalo.</div>";
    } else if (expired) {
      body += '<div class="bc-auditoria-inv-warning">La ventana caducó y el almacén ya no está bloqueado. Este conteo no se puede cerrar; cancélalo y abre uno nuevo.</div>';
    }

    body += '<div class="bc-auditoria-inv-kpis">' +
      '<div><strong>' + number(lines.length) + '</strong><span>Productos</span></div>' +
      '<div><strong>' + number(count) + "/" + number(lines.length) + '</strong><span>Contados</span></div>' +
      '<div><strong>' + number(differences.length) + '</strong><span>Diferencias</span></div>' +
      '<div><strong>' + number(pending) + '</strong><span>Por revisar</span></div>' +
      "</div>";

    body += '<label class="bc-auditoria-inv-search"><span>Buscar producto</span><input type="search" data-audit-search placeholder="Nombre o variante…" value="' + esc(searchTerm) + '"></label>';
    body += '<div class="bc-auditoria-inv-lines">';
    if (!filtered.length) {
      body += '<p class="lista-estado">No encontramos productos con esa búsqueda.</p>';
    } else {
      body += filtered.map((line) => renderLine(line, open)).join("");
    }
    body += "</div>";

    if (open) {
      body += '<div class="bc-auditoria-inv-actions"><button type="button" class="cc-accion" data-audit-save>Guardar conteo</button>' +
        '<button type="button" class="cc-accion primary" data-audit-close>Cerrar auditoría</button>' +
        '<button type="button" class="cc-accion danger" data-audit-cancel>Cancelar conteo</button></div>' +
        '<p class="muted bc-auditoria-inv-footnote">Puedes guardar por partes. Para cerrar, todos los productos deben tener una cantidad física.</p>';
    } else if (expired) {
      body += '<div class="bc-auditoria-inv-actions"><button type="button" class="cc-accion danger" data-audit-cancel>Cancelar conteo caducado</button></div>';
    }

    panel.innerHTML = body;
    panel.classList.remove("hidden");
  }

  function renderLine(line, open) {
    const diff = line.diferencia == null ? null : Number(line.diferencia);
    const diffClass = diff == null ? "unknown" : diff < 0 ? "negative" : diff > 0 ? "positive" : "zero";
    const diffText = diff == null ? "Pendiente" : diff === 0 ? "Cuadra" : (diff > 0 ? "+" : "") + number(diff);
    const productLabel = line.variante_nombre
      ? String(line.producto_nombre) + " · " + String(line.variante_nombre)
      : String(line.producto_nombre);
    let content = '<article class="bc-auditoria-inv-line ' + diffClass + '">' +
      '<div class="bc-auditoria-inv-line-title"><strong>' + esc(productLabel) + '</strong><span class="bc-auditoria-inv-difference ' +
      diffClass + '">' + esc(diffText) + "</span></div>" +
      '<div class="bc-auditoria-inv-line-values"><span>En sistema <strong>' + number(line.cantidad_sistema) +
      " " + esc(line.unidad || "unidad") + "</strong></span>";
    if (open) {
      content += '<label><span>Conteo físico</span><input type="number" min="0" step="0.01" inputmode="decimal" data-audit-line="' +
        esc(line.id) + '" value="' + (line.cantidad_fisica == null ? "" : esc(line.cantidad_fisica)) +
        '" placeholder="Cantidad contada"></label>';
    } else {
      content += '<span>Conteo físico <strong>' + (line.cantidad_fisica == null ? "—" : number(line.cantidad_fisica)) +
        " " + esc(line.unidad || "unidad") + "</strong></span>";
    }
    content += "</div>";
    if (!open && diff != null && diff !== 0) {
      if (line.decision === "BAJA_REGISTRADA") {
        content += '<div class="bc-auditoria-inv-review-result"><strong>Baja registrada</strong><span class="muted">Referencia ' +
          esc(String(line.baja_id || "").slice(0, 8)) + "</span></div>";
      } else {
        const options = diff < 0
          ? '<option value="INVESTIGAR">Investigar el faltante</option><option value="JUSTIFICADA">Dejar explicación registrada</option>'
          : '<option value="INVESTIGAR">Investigar el sobrante</option><option value="SOBRANTE_PENDIENTE">Sobrante pendiente de ajuste</option><option value="JUSTIFICADA">Dejar explicación registrada</option>';
        content += '<div class="bc-auditoria-inv-review">' +
          '<label><span>Decisión</span><select data-audit-decision="' + esc(line.id) + '">' +
          '<option value="">Seleccionar decisión…</option>' + options + "</select></label>" +
          '<label><span>Explicación</span><input type="text" maxlength="500" data-audit-reason="' + esc(line.id) +
          '" value="' + esc(line.motivo || "") + '" placeholder="¿Qué ocurrió con este producto?"></label>' +
          '<div class="bc-auditoria-inv-actions"><button type="button" class="cc-accion" data-audit-resolve="' + esc(line.id) + '">Guardar decisión</button>' +
          (diff < 0 ? '<button type="button" class="cc-accion danger" data-audit-writeoff="' + esc(line.id) + '">Registrar como baja</button>' : "") +
          "</div></div>";
      }
    } else if (!open && diff === 0) {
      content += '<p class="bc-auditoria-inv-review-result">La cantidad física coincide con el sistema.</p>';
    }
    content += "</article>";
    return content;
  }

  async function saveCount() {
    if (!currentAudit || busy) return;
    const panel = byId("bc-auditoria-inv-detail");
    const inputs = panel ? [...panel.querySelectorAll("[data-audit-line]")] : [];
    const lines = [];
    for (const input of inputs) {
      if (input.value.trim() === "") continue;
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0) {
        input.focus();
        setMessage("Introduce cantidades válidas e iguales o mayores que cero.", false);
        return;
      }
      lines.push({ id: input.dataset.auditLine, cantidad_fisica: value });
    }
    setBusy(true);
    try {
      const { data, error } = await client.rpc(RPC.save, {
        p_auditoria_id: currentAudit,
        p_lineas: lines,
      });
      if (error) throw new Error(rpcError(error, "No se pudo guardar el conteo."));
      await openAudit(currentAudit);
      setMessage("Conteo guardado: " + number(data && data.lineas_guardadas || 0) + " productos actualizados.", true);
    } catch (error) {
      setMessage(error.message || "No se pudo guardar el conteo.", false);
    } finally {
      setBusy(false);
    }
  }

  async function closeAudit() {
    if (!currentAudit || busy) return;
    const detail = currentDetail;
    const inputs = byId("bc-auditoria-inv-detail").querySelectorAll("[data-audit-line]");
    const incomplete = [...inputs].some((input) => input.value.trim() === "");
    if (incomplete) {
      setMessage("Completa la cantidad física de todos los productos antes de cerrar.", false);
      return;
    }
    if (!window.confirm("¿Cerrar el conteo? Se liberará el almacén para volver a registrar movimientos. Las diferencias quedarán pendientes de revisión y no se ajustará stock automáticamente.")) return;
    setBusy(true);
    try {
      const lines = [...inputs].map((input) => ({
        id: input.dataset.auditLine,
        cantidad_fisica: Number(input.value),
      }));
      const { error: saveError } = await client.rpc(RPC.save, {
        p_auditoria_id: currentAudit,
        p_lineas: lines,
      });
      if (saveError) throw new Error(rpcError(saveError, "No se pudo guardar el conteo."));
      const { error } = await client.rpc(RPC.close, { p_auditoria_id: currentAudit });
      if (error) throw new Error(rpcError(error, "No se pudo cerrar la auditoría."));
      await openAudit(currentAudit);
      await loadAudits();
      setMessage("Conteo cerrado. El stock no fue modificado; revisa las diferencias y decide cómo resolver cada una.", true);
    } catch (error) {
      setMessage(error.message || "No se pudo cerrar la auditoría.", false);
    } finally {
      setBusy(false);
    }
  }

  async function cancelAudit() {
    if (!currentAudit || busy) return;
    const reason = window.prompt("Motivo para cancelar este conteo (opcional):", "Conteo interrumpido");
    if (reason === null) return;
    setBusy(true);
    try {
      const { error } = await client.rpc(RPC.cancel, {
        p_auditoria_id: currentAudit,
        p_motivo: reason.trim() || null,
      });
      if (error) throw new Error(rpcError(error, "No se pudo cancelar el conteo."));
      currentAudit = null;
      currentDetail = null;
      const panel = byId("bc-auditoria-inv-detail");
      if (panel) { panel.classList.add("hidden"); panel.innerHTML = ""; }
      await loadAudits();
      setMessage("Conteo cancelado. El almacén vuelve a aceptar movimientos de stock.", true);
    } catch (error) {
      setMessage(error.message || "No se pudo cancelar el conteo.", false);
    } finally {
      setBusy(false);
    }
  }

  async function resolveLine(lineId) {
    if (!currentAudit || busy) return;
    const decision = byId("bc-auditoria-inv-detail").querySelector('[data-audit-decision="' + lineId + '"]').value;
    const reason = byId("bc-auditoria-inv-detail").querySelector('[data-audit-reason="' + lineId + '"]').value.trim();
    if (!decision) { setMessage("Selecciona qué hacer con esta diferencia.", false); return; }
    if (reason.length < 3) { setMessage("Explica la diferencia con al menos tres caracteres.", false); return; }
    setBusy(true);
    try {
      const { error } = await client.rpc(RPC.resolve, {
        p_auditoria_id: currentAudit,
        p_linea_id: lineId,
        p_decision: decision,
        p_motivo: reason,
      });
      if (error) throw new Error(rpcError(error, "No se pudo guardar la decisión."));
      await openAudit(currentAudit);
      await loadAudits();
      setMessage("Decisión guardada. El stock no se ha modificado.", true);
    } catch (error) {
      setMessage(error.message || "No se pudo guardar la decisión.", false);
    } finally {
      setBusy(false);
    }
  }

  async function registerWriteoff(lineId) {
    if (!currentAudit || busy) return;
    const reason = byId("bc-auditoria-inv-detail").querySelector('[data-audit-reason="' + lineId + '"]').value.trim();
    if (reason.length < 3) { setMessage("Escribe el motivo de la baja antes de continuar.", false); return; }
    if (!window.confirm("Esto registrará una baja por la cantidad faltante y puede descontar stock inmediatamente según tus permisos. ¿Confirmas?")) return;
    setBusy(true);
    try {
      const { data, error } = await client.rpc(RPC.writeoff, {
        p_auditoria_id: currentAudit,
        p_linea_id: lineId,
        p_motivo: reason,
      });
      if (error) throw new Error(rpcError(error, "No se pudo registrar la baja."));
      await openAudit(currentAudit);
      await loadAudits();
      setMessage("Baja registrada (" + String(data && data.estado || "pendiente") + "). Referencia: " +
        String(data && data.baja_id || "").slice(0, 8) + ".", true);
      if (typeof refrescarStockYSelects === "function") await refrescarStockYSelects();
    } catch (error) {
      setMessage(error.message || "No se pudo registrar la baja.", false);
    } finally {
      setBusy(false);
    }
  }

  function onClick(event) {
    const target = event.target.closest("[data-audit-open],[data-audit-create],[data-audit-save],[data-audit-close],[data-audit-cancel],[data-audit-resolve],[data-audit-writeoff],[data-audit-refresh]");
    if (!target) return;
    if (target.hasAttribute("data-audit-create")) return void createAudit();
    if (target.hasAttribute("data-audit-refresh")) return void loadAudits();
    if (target.hasAttribute("data-audit-open")) return void openAudit(target.dataset.auditOpen).catch((e) => setMessage(e.message, false));
    if (target.hasAttribute("data-audit-save")) return void saveCount();
    if (target.hasAttribute("data-audit-close")) return void closeAudit();
    if (target.hasAttribute("data-audit-cancel")) return void cancelAudit();
    if (target.hasAttribute("data-audit-resolve")) return void resolveLine(target.dataset.auditResolve);
    if (target.hasAttribute("data-audit-writeoff")) return void registerWriteoff(target.dataset.auditWriteoff);
  }

  function onInput(event) {
    if (event.target.matches("[data-audit-search]")) {
      searchTerm = event.target.value;
      const cursor = event.target.selectionStart;
      renderDetail();
      const next = byId("bc-auditoria-inv-detail").querySelector("[data-audit-search]");
      if (next) { next.focus(); next.setSelectionRange(cursor, cursor); }
    }
  }

  async function initialize() {
    const root = byId("mando-auditoria-inventario");
    if (!root) return;
    if (!requirePermission()) {
      root.innerHTML = '<p class="lista-estado">No tienes permiso para acceder a esta sección.</p>';
      return;
    }
    root.addEventListener("click", onClick);
    root.addEventListener("input", onInput);
    try {
      await loadWarehouses();
      await loadAudits();
    } catch (error) {
      setMessage(error.message || "No se pudo cargar la auditoría de inventario.", false);
    }
  }

  window.refrescarAuditoriasInventario = loadAudits;
  window.__BC_FORMAT_AUDITORIA_INVENTARIO_NUMBER__ = number;

  if (typeof safeInit === "function") {
    safeInit("auditoria-inventario", initialize);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
