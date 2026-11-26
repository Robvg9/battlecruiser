// ==== Battlecruiser · js/almacenes.js ====
// Selector y gestión de almacenes + stock del panel.
// M26.6-FE: estados explícitos de carga de stock (nunca "Cargando…" infinito).
// El panel visual usa proyección de jornada; _cache.stock queda reservado a validación transaccional.
// Query stock sin embeds + safety timeout.
// Bloque 6/7 + DAP-1: tipos UI almacenamiento|minorista|mayorista → RPC venta|mayorista|almacenamiento.

let _almacenSeleccionadoId = null;
/** idle | loading | ok | error */
let _stockCargaEstado = "idle";
let _stockCargaError = null;
let _stockCargaPromise = null;
let _stockVistaCargaEstado = "idle";
let _stockVistaCargaError = null;
let _stockVistaCargaPromise = null;
let _stockVistaRequestId = 0;

var BC_STOCK_TIMEOUT_MS = 12000;

function etiquetaTipoAlmacen(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t === "almacenamiento") return "Almacenamiento";
  if (t === "minorista" || t === "venta") return "Minorista";
  if (t === "mayorista") return "Mayorista";
  return t ? String(tipo) : "Almacenamiento";
}

/** UI / form value → contrato RPC crear_almacen / editar_almacen */
function tipoAlmacenUiARpc(tipo) {
  if (typeof window.__BC_M277_tipoUiARpc === "function") {
    return window.__BC_M277_tipoUiARpc(tipo);
  }
  const t = String(tipo || "").toLowerCase();
  if (t === "minorista" || t === "venta") return "venta";
  if (t === "mayorista") return "mayorista";
  if (t === "almacenamiento") return "almacenamiento";
  return t;
}

function mismoIdAlmacen(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function stockDelAlmacen(almacenId) {
  if (!almacenId) return [];
  return (_cache.stock || []).filter(function (s) {
    return s && mismoIdAlmacen(s.almacen_id, almacenId);
  });
}

function stockVisualDelAlmacen(almacenId) {
  if (!almacenId) return [];
  return (_cache.stock_visual || []).filter(function (s) {
    return s && mismoIdAlmacen(s.almacen_id, almacenId);
  });
}

function almacenPanelVisible() {
  const tab = document.getElementById("tab-almacenes");
  return !!(tab && tab.classList.contains("visible"));
}

function invalidarStockVisualAlmacenes() {
  _stockVistaRequestId++;
  _stockVistaCargaEstado = "idle";
  _stockVistaCargaError = null;
  _stockVistaCargaPromise = null;
}

function cargarStockVisualAlmacenes(force) {
  if (_stockVistaCargaPromise && !force) return _stockVistaCargaPromise;
  if (_stockVistaCargaEstado === "ok" && !force) {
    return Promise.resolve(_cache.stock_visual || []);
  }

  var requestId = ++_stockVistaRequestId;
  var warehouseId = _almacenSeleccionadoId || null;
  _stockVistaCargaEstado = "loading";
  _stockVistaCargaError = null;
  renderPanelAlmacenSeleccionado();

  var pending = (async function () {
    try {
      if (!client || typeof client.rpc !== "function") {
        throw new Error("Cliente de inventario no disponible.");
      }
      var pair = await bcConTimeoutLocal(Promise.all([
        client.rpc("inventario_enriquecido", { p_almacen_id: warehouseId }),
        client.rpc("inventario_mixto_enriquecido", { p_almacen_id: warehouseId })
      ]), BC_STOCK_TIMEOUT_MS, "inventario visual");
      var ordinaryResult = pair[0];
      var mixedResult = pair[1];
      if (!ordinaryResult || ordinaryResult.error) {
        throw new Error(ordinaryResult && ordinaryResult.error && (ordinaryResult.error.message || ordinaryResult.error.details) || "No se pudo leer el inventario por almacén.");
      }
      if (!mixedResult || mixedResult.error) {
        throw new Error(mixedResult && mixedResult.error && (mixedResult.error.message || mixedResult.error.details) || "No se pudo leer el inventario mixto por almacén.");
      }

      var warehouseIdByName = new Map();
      (_cache.almacenes || []).forEach(function (warehouse) {
        if (!warehouse || !warehouse.id) return;
        var key = String(warehouse.nombre || "").trim().toLocaleLowerCase("es");
        if (!key) return;
        if (warehouseIdByName.has(key)) warehouseIdByName.set(key, null);
        else warehouseIdByName.set(key, warehouse.id);
      });
      function resolveWarehouseId(row) {
        if (row && row.almacen_id) return row.almacen_id;
        var key = String(row && row.almacen || "").trim().toLocaleLowerCase("es");
        return warehouseIdByName.get(key) || null;
      }

      var mixedRows = Array.isArray(mixedResult.data) ? mixedResult.data : [];
      var mixedParentIds = new Set();
      var mixedVariantIds = new Set();
      mixedRows.forEach(function (row) {
        if (row && row.producto_id) mixedParentIds.add(String(row.producto_id));
        (Array.isArray(row && row.variantes) ? row.variantes : []).forEach(function (variant) {
          if (variant && variant.producto_id) mixedVariantIds.add(String(variant.producto_id));
        });
      });

      var productById = new Map();
      (_cache.productos || []).forEach(function (product) {
        if (product && product.id) productById.set(String(product.id), product);
      });
      var ordinaryRows = (Array.isArray(ordinaryResult.data) ? ordinaryResult.data : [])
        .filter(function (row) {
          var id = String(row && row.producto_id || "");
          return id && !mixedParentIds.has(id) && !mixedVariantIds.has(id);
        })
        .map(function (row) {
          var product = productById.get(String(row.producto_id));
          return Object.assign({}, row, {
            almacen_id: resolveWarehouseId(row),
            unidad: (product && product.unidad) || row.unidad || "unidad"
          });
        });

      var mixedViewRows = [];
      mixedRows.forEach(function (row) {
        var warehouseId = resolveWarehouseId(row);
        (Array.isArray(row && row.variantes) ? row.variantes : []).forEach(function (variant) {
          var variantId = variant && variant.producto_id || null;
          mixedViewRows.push({
            producto_id: variantId,
            producto: variant && variant.nombre || row.producto || "Inventario inicial sin distribuir",
            almacen: row.almacen,
            almacen_id: warehouseId,
            cantidad: Number(variant && variant.cantidad) || 0,
            minimo: variant && variant.minimo != null ? variant.minimo : null,
            estado: variant && variant.estado || (variantId ? "sin_minimo" : "sin_minimo"),
            unidad: variant && variant.unidad || row.unidad || "unidad",
            __bc_sin_producto: !variantId
          });
        });
      });

      var projectedRows = ordinaryRows.concat(mixedViewRows);
      if (requestId !== _stockVistaRequestId) return _cache.stock_visual || [];
      _cache.stock_visual = projectedRows;
      _stockVistaCargaEstado = "ok";
      _stockVistaCargaError = null;
      return projectedRows;
    } catch (error) {
      if (requestId === _stockVistaRequestId) {
        _cache.stock_visual = [];
        _stockVistaCargaEstado = "error";
        _stockVistaCargaError = error && error.message ? error.message : "Error de lectura";
      }
      return [];
    } finally {
      if (requestId === _stockVistaRequestId) {
        _stockVistaCargaPromise = null;
        renderPanelAlmacenSeleccionado();
      }
    }
  })();

  _stockVistaCargaPromise = pending;
  return pending;
}

function bcConTimeoutLocal(promesa, ms, etiqueta) {
  return new Promise(function (resolve, reject) {
    var done = false;
    var t = setTimeout(function () {
      if (done) return;
      done = true;
      var err = new Error("timeout:" + (etiqueta || "op"));
      err.bcTimeout = true;
      reject(err);
    }, ms || BC_STOCK_TIMEOUT_MS);
    Promise.resolve(promesa).then(
      function (v) {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(v);
      },
      function (e) {
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function llenarSelectorAlmacenes(almacenes) {
  const sel = document.getElementById("alm-selector");
  if (!sel) return;
  const prev = _almacenSeleccionadoId || sel.value;
  sel.innerHTML = '<option value="">Elegí un almacén…</option>';
  (almacenes || []).forEach((a) => {
    const o = document.createElement("option");
    o.value = a.id;
    const estado = a.activo === false ? " · Inactivo" : "";
    o.textContent = a.nombre + " — " + etiquetaTipoAlmacen(a.tipo) + estado;
    if (a.activo === false) o.className = "alm-option-inactivo";
    sel.appendChild(o);
  });
  if (prev && (almacenes || []).some((a) => mismoIdAlmacen(a.id, prev))) {
    sel.value = prev;
    _almacenSeleccionadoId = prev;
  } else {
    _almacenSeleccionadoId = null;
    sel.value = "";
  }
  actualizarBotonesAccionesAlmacen();
}

function actualizarBotonesAccionesAlmacen() {
  const editar = document.getElementById("alm-editar-btn");
  const toggle = document.getElementById("alm-toggle-btn");
  const tiene = !!_almacenSeleccionadoId;
  if (editar) editar.disabled = !tiene;
  if (toggle) {
    toggle.disabled = !tiene;
    if (tiene) {
      const a = (_cache.almacenes || []).find((x) => mismoIdAlmacen(x.id, _almacenSeleccionadoId));
      toggle.textContent = a && a.activo === false ? "Activar almacén" : "Desactivar almacén";
    } else {
      toggle.textContent = "Activar / desactivar";
    }
  }
}

let _bcAlmacenEquipoRequestId = 0;

function bcAlmacenEquipoSectionHtml(almacenId, almacenActivo) {
  return '<section class="bc-alm-equipo" data-bc-alm-equipo data-almacen-id="' + escHtml(almacenId) + '" data-almacen-activo="' + (almacenActivo ? 'true' : 'false') + '">' +
    '<div class="bc-alm-equipo-head"><h4>Personal y salarios</h4>' +
      '<button type="button" class="bc-alm-equipo-add-trigger" data-bc-alm-equipo-open-modal="assign" title="Asignar dependienta" aria-label="Asignar dependienta" disabled>' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M16 11h6"/></svg>' +
      '</button></div>' +
    '<div class="bc-alm-equipo-body" data-bc-alm-equipo-body><p class="lista-estado">Consultando el equipo…</p></div>' +
    '<div class="bc-alm-modal-backdrop" data-bc-alm-modal hidden></div>' +
    '<p class="bc-alm-equipo-status" data-bc-alm-equipo-status role="status" aria-live="polite"></p></section>';
}

function bcAlmacenEquipoStatus(section, message, isError) {
  const status = section && section.querySelector('[data-bc-alm-equipo-status]');
  if (!status) return;
  status.textContent = message || '';
  status.classList.toggle('is-error', !!isError);
  status.classList.toggle('is-ok', !!message && !isError);
}

function bcAlmacenEquipoBodyHtml(data, almacenActivo) {
  const assigned = Array.isArray(data && data.dependientas) ? data.dependientas : [];
  const warehouse = (_cache.almacenes || []).find(function (item) {
    return mismoIdAlmacen(item.id, _almacenSeleccionadoId);
  });
  const warehouseName = warehouse && warehouse.nombre || 'Este almacén';
  if (!assigned.length) {
    return '<p class="bc-alm-equipo-empty">Todavía no hay dependientas asignadas.</p>';
  }
  return '<div class="bc-alm-equipo-list">' + assigned.map(function (person) {
    const userId = escHtml(person.usuario_id);
    const name = escHtml(person.nombre || 'Dependienta');
    const permanent = person.salario_porcentaje_permanente;
    const rate = permanent == null ? 'Sin porcentaje' : escHtml(String(permanent)) + '%';
    return '<button type="button" class="bc-alm-equipo-persona" data-bc-alm-equipo-open-modal="edit" data-user-id="' + userId + '"' +
      (almacenActivo ? '' : ' disabled') + '>' +
      '<span class="bc-alm-equipo-persona-copy"><b>' + name + '</b><small>' + escHtml(warehouseName) + ' · ' + rate + '</small></span>' +
      '<span class="bc-alm-equipo-persona-edit" aria-hidden="true">✎</span></button>';
  }).join('') + '</div>';
}

function abrirModalEquipoAlmacen(section, mode, userId) {
  const host = section && section.querySelector('[data-bc-alm-modal]');
  if (!host) return;
  const data = section.__bcEquipoData || {};
  const assigned = Array.isArray(data.dependientas) ? data.dependientas : [];
  const available = Array.isArray(data.disponibles) ? data.disponibles : [];
  const person = mode === 'edit' ? assigned.find(function (item) {
    return String(item.usuario_id) === String(userId);
  }) : null;
  if (mode === 'edit' && !person) return;
  const options = available.map(function (item) {
    return '<option value="' + escHtml(item.usuario_id) + '">' + escHtml(item.nombre || 'Dependienta') + '</option>';
  }).join('');
  const permanent = person && person.salario_porcentaje_permanente;
  const temporary = person && person.salario_porcentaje_temporal;
  let temporaryNote = '';
  if (temporary != null) {
    let detail = 'Porcentaje temporal: ' + escHtml(String(temporary)) + '%.';
    if (person.salario_temporal_consumido_en) detail += ' Ya fue aplicado y la jornada conserva su porcentaje congelado.';
    else if (person.salario_temporal_fecha) detail += ' Reservado para ' + escHtml(person.salario_temporal_fecha) + '.';
    else detail += ' Se aplicará a la próxima jornada elegible.';
    temporaryNote = '<p class="bc-alm-modal-note">' + detail + '</p>';
  }
  const isAssign = mode === 'assign';
  const title = isAssign ? 'Asignar dependienta' : 'Editar asignación';
  const content = isAssign
    ? (available.length
      ? '<label>Dependienta<select data-bc-alm-equipo-new-user><option value="">Selecciona una dependienta</option>' + options + '</select></label>'
      : '<p class="bc-alm-equipo-empty">Todas las dependientas activas ya están asignadas a este almacén.</p>')
    : '<div class="bc-alm-modal-person"><strong>' + escHtml(person.nombre || 'Dependienta') + '</strong><small>Configuración para este almacén</small></div>' + temporaryNote;
  const form = (isAssign && !available.length) ? '' :
    content +
    '<label>Porcentaje salarial (%)<input type="number" min="0" max="100" step="0.01" inputmode="decimal" data-bc-alm-equipo-rate ' +
      (isAssign ? 'data-bc-alm-equipo-new-rate ' : '') +
      'value="' + escHtml(permanent == null ? '' : String(permanent)) + '" placeholder="Ej. 5" required></label>' +
    '<label>Vigencia<select data-bc-alm-equipo-scope ' + (isAssign ? 'data-bc-alm-equipo-new-scope ' : '') + '>' +
      '<option value="PERMANENTE">Permanente · futuras jornadas</option>' +
      '<option value="PROXIMA_JORNADA">Solo próxima jornada</option></select></label>';
  host.innerHTML =
    '<section class="bc-alm-modal" role="dialog" aria-modal="true" aria-label="' + title + '">' +
      '<div class="bc-alm-modal-head"><h5>' + title + '</h5><button type="button" class="bc-alm-modal-close" data-bc-alm-equipo-modal-close aria-label="Cerrar">×</button></div>' +
      '<div class="bc-alm-modal-fields">' + form + '</div>' +
      '<p class="bc-alm-modal-error" data-bc-alm-modal-error role="alert"></p>' +
      '<div class="bc-alm-modal-actions">' +
        (isAssign && !available.length ? '' : '<button type="button" class="cc-accion" data-bc-alm-equipo-action="' + (isAssign ? 'assign' : 'save') + '"' + (section.dataset.almacenActivo === 'true' ? '' : ' disabled') + '>' + (isAssign ? 'Asignar' : 'Guardar') + '</button>') +
        (!isAssign ? '<button type="button" class="cc-accion danger" data-bc-alm-equipo-action="remove" data-user-id="' + escHtml(userId) + '"' + (section.dataset.almacenActivo === 'true' ? '' : ' disabled') + '>Quitar del almacén</button>' : '') +
        '<button type="button" class="cc-accion" data-bc-alm-equipo-modal-close>Cancelar</button>' +
      '</div></section>';
  host.hidden = false;
  host.setAttribute('aria-hidden', 'false');
  const focus = host.querySelector('input,select,button');
  if (focus && focus.focus) focus.focus();
}

function cerrarModalEquipoAlmacen(section) {
  const host = section && section.querySelector('[data-bc-alm-modal]');
  if (!host) return;
  host.hidden = true;
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = '';
}

async function cargarEquipoAlmacen(almacenId) {
  const section = document.querySelector('[data-bc-alm-equipo][data-almacen-id="' + String(almacenId).replace(/"/g, '') + '"]');
  if (!section) return;
  const body = section.querySelector('[data-bc-alm-equipo-body]');
  if (!body) return;
  const requestId = ++_bcAlmacenEquipoRequestId;
  const api = window.client || (typeof client !== 'undefined' ? client : null);
  if (!api || typeof api.rpc !== 'function') {
    body.innerHTML = '<p class="lista-estado">El servicio de configuración no está disponible.</p>';
    return;
  }
  try {
    const result = await api.rpc('bc8_listar_dependientas_almacen', { p_almacen_id: almacenId });
    if (requestId !== _bcAlmacenEquipoRequestId || !section.isConnected || String(_almacenSeleccionadoId) !== String(almacenId)) return;
    if (result && result.error) throw result.error;
    section.__bcEquipoData = result && result.data || {};
    body.innerHTML = bcAlmacenEquipoBodyHtml(section.__bcEquipoData, section.dataset.almacenActivo === 'true');
    const addButton = section.querySelector('[data-bc-alm-equipo-open-modal="assign"]');
    if (addButton) addButton.disabled = section.dataset.almacenActivo !== 'true' || !Array.isArray(section.__bcEquipoData.disponibles) || !section.__bcEquipoData.disponibles.length;
  } catch (error) {
    if (requestId !== _bcAlmacenEquipoRequestId || !section.isConnected) return;
    const message = error && (error.message || error.details) || 'No se pudo consultar el equipo del almacén.';
    body.innerHTML = '<p class="lista-estado">' + escHtml(message) + '</p><button type="button" class="cc-accion" data-bc-alm-equipo-action="retry">Reintentar</button>';
  }
}

async function guardarConfiguracionDependientaAlmacen(section, actionButton) {
  const almacenId = section.dataset.almacenId;
  const action = actionButton.dataset.bcAlmEquipoAction;
  const isAssign = action === 'assign';
  const modal = section.querySelector('[data-bc-alm-modal]');
  const userId = isAssign
    ? (modal.querySelector('[data-bc-alm-equipo-new-user]') || {}).value
    : actionButton.dataset.userId || (section.querySelector('[data-bc-alm-equipo-open-modal="edit"][data-user-id]') || {}).dataset.userId;
  const rateInput = modal && modal.querySelector('[data-bc-alm-equipo-rate]');
  const scopeInput = modal && modal.querySelector('[data-bc-alm-equipo-scope]');
  const modalError = modal && modal.querySelector('[data-bc-alm-modal-error]');
  if (action === 'remove') {
    if (!confirm('¿Quitar esta dependienta del equipo del almacén? Las jornadas ya programadas conservarán su porcentaje registrado.')) return;
  } else {
    const raw = rateInput && String(rateInput.value || '').trim();
    const rate = Number(raw);
    if (!userId) { if (modalError) modalError.textContent = 'Selecciona una dependienta.'; return; }
    if (!raw || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      if (modalError) modalError.textContent = 'Escribe un porcentaje entre 0 y 100.';
      if (rateInput) rateInput.focus();
      return;
    }
    if (!scopeInput || !['PERMANENTE', 'PROXIMA_JORNADA'].includes(scopeInput.value)) {
      if (modalError) modalError.textContent = 'Selecciona la vigencia del porcentaje.';
      return;
    }
  }
  if (!navigator.onLine) { if (modalError) modalError.textContent = 'Necesitas conexión para guardar la configuración salarial.'; return; }
  const api = window.client || (typeof client !== 'undefined' ? client : null);
  if (!api || typeof api.rpc !== 'function') { if (modalError) modalError.textContent = 'Backend no disponible.'; return; }
  const originalLabel = actionButton.textContent;
  actionButton.disabled = true;
  actionButton.textContent = 'Guardando…';
  bcAlmacenEquipoStatus(section, 'Guardando configuración y registrando auditoría…', false);
  try {
    const result = await api.rpc('bc8_configurar_dependienta_almacen', {
      p_almacen_id: almacenId,
      p_usuario_id: userId,
      p_asignada: action !== 'remove',
      p_salario_porcentaje: action === 'remove' ? null : Number(rateInput.value),
      p_vigencia_tipo: action === 'remove' ? null : scopeInput.value
    });
    if (result && result.error) throw result.error;
    cerrarModalEquipoAlmacen(section);
    await cargarEquipoAlmacen(almacenId);
    const currentSection = document.querySelector('[data-bc-alm-equipo][data-almacen-id="' + String(almacenId).replace(/"/g, '') + '"]');
    if (currentSection) bcAlmacenEquipoStatus(currentSection, action === 'remove'
      ? 'Dependienta retirada del equipo. Las jornadas ya programadas siguen intactas.'
      : 'Configuración salarial guardada.', false);
  } catch (error) {
    const message = error && (error.message || error.details) || 'No se pudo guardar la configuración.';
    if (modalError) modalError.textContent = message;
    bcAlmacenEquipoStatus(section, message, true);
  } finally {
    if (actionButton.isConnected) { actionButton.disabled = false; actionButton.textContent = originalLabel; }
  }
}

function renderPanelAlmacenSeleccionado() {
  const panel = document.getElementById("alm-info-panel");
  if (!panel) return;
  const id = _almacenSeleccionadoId;
  if (!id) {
    panel.innerHTML = '<div class="bc-alm-empty"><strong>Almacenes</strong><span>Selecciona un almacén para consultar su personal, salarios e inventario.</span></div>';
    const productsTitle = document.querySelector(".alm-productos-titulo");
    if (productsTitle) productsTitle.hidden = true;
    renderProductosDelAlmacen(null);
    actualizarBotonesAccionesAlmacen();
    return;
  }
  const productsTitle = document.querySelector(".alm-productos-titulo");
  if (productsTitle) productsTitle.hidden = false;
  const a = (_cache.almacenes || []).find((x) => mismoIdAlmacen(x.id, id));
  if (!a) {
    panel.innerHTML = '<p class="lista-estado">Almacén no encontrado.</p>';
    renderProductosDelAlmacen(null);
    return;
  }
  if (_stockVistaCargaEstado !== "ok") {
    const active = a.activo !== false;
    const message = _stockVistaCargaEstado === "error"
      ? "No se pudo confirmar el saldo actual del almacén."
      : "Calculando saldo actual de la jornada…";
    panel.innerHTML =
      '<div class="alm-info-grid">' +
        '<div class="alm-info-item"><span class="alm-info-label">Nombre</span><span class="alm-info-valor">' + escHtml(a.nombre) + "</span></div>" +
        '<div class="alm-info-item"><span class="alm-info-label">Tipo</span><span class="alm-info-valor">' + escHtml(etiquetaTipoAlmacen(a.tipo)) + "</span></div>" +
        '<div class="alm-info-item"><span class="alm-info-label">Estado</span><span class="alm-info-valor ' + (active ? "alm-estado-activo" : "alm-estado-inactivo") + '">' + (active ? "Activo" : "Inactivo") + "</span></div>" +
        '<div class="alm-info-item"><span class="alm-info-label">Inventario</span><span class="alm-info-valor">' + escHtml(message) + "</span></div>" +
      "</div>" + bcAlmacenEquipoSectionHtml(id, active);
    cargarEquipoAlmacen(id);
    renderProductosDelAlmacen(id);
    actualizarBotonesAccionesAlmacen();
    return;
  }

  const stock = stockVisualDelAlmacen(id);
  const productosCount = stock.filter((row) => !row.__bc_sin_producto).length;
  let unidades = 0;
  let bajoMin = 0;
  let agotados = 0;
  let sinMinimo = 0;
  stock.forEach((row) => {
    const cant = Number(row.cantidad) || 0;
    unidades += cant;
    if (row.__bc_sin_producto) return;
    if (row.estado === "sin_minimo" || row.minimo == null || Number(row.minimo) <= 0) sinMinimo++;
    else if (cant <= 0) agotados++;
    else if (cant <= Number(row.minimo)) bajoMin++;
  });
  const activo = a.activo !== false;
  const fmtQty = (v) => typeof window.numberFmt === 'function' ? window.numberFmt(v) : String(v == null ? 0 : v);
  panel.innerHTML =
    '<div class="alm-info-grid">' +
      '<div class="alm-info-item"><span class="alm-info-label">Nombre</span><span class="alm-info-valor">' + escHtml(a.nombre) + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Tipo</span><span class="alm-info-valor">' + escHtml(etiquetaTipoAlmacen(a.tipo)) + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Estado</span><span class="alm-info-valor ' + (activo ? "alm-estado-activo" : "alm-estado-inactivo") + '">' + (activo ? "Activo" : "Inactivo") + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Productos</span><span class="alm-info-valor">' + productosCount + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Unidades</span><span class="alm-info-valor">' + fmtQty(unidades) + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Alertas</span><span class="alm-info-valor">' +
        (bajoMin + agotados + sinMinimo > 0
          ? (agotados ? fmtQty(agotados) + " agotado(s)" : "") +
            (agotados && (bajoMin || sinMinimo) ? " · " : "") +
            (bajoMin ? fmtQty(bajoMin) + " bajo mínimo" : "") +
            (bajoMin && sinMinimo ? " · " : "") +
            (sinMinimo ? fmtQty(sinMinimo) + " sin mínimo" : "")
          : "Sin alertas") +
      "</span></div>" +
    "</div>" + bcAlmacenEquipoSectionHtml(id, activo);
  cargarEquipoAlmacen(id);
  renderProductosDelAlmacen(id);
  actualizarBotonesAccionesAlmacen();
}

function renderProductosDelAlmacen(almacen_id) {
  const lista = document.getElementById("lista-stock");
  if (!lista) return;
  if (!almacen_id) {
    lista.innerHTML = '<p class="bc-alm-stock-empty">El inventario aparecerá aquí al seleccionar un almacén.</p>';
    return;
  }
  if (_stockVistaCargaEstado === "idle" || _stockVistaCargaEstado === "loading") {
    lista.innerHTML = '<p class="lista-estado">Cargando inventario del almacén…</p>';
    if (_stockVistaCargaEstado === "idle" && almacenPanelVisible()) cargarStockVisualAlmacenes(false);
    return;
  }
  if (_stockVistaCargaEstado === "error") {
    lista.innerHTML =
      '<p class="lista-estado">No se pudo confirmar el inventario actual' +
      (_stockVistaCargaError ? ": " + escHtml(String(_stockVistaCargaError).slice(0, 120)) : ".") +
      "</p>" +
      '<button type="button" class="cc-accion" id="bc-alm-stock-reintentar">Reintentar</button>';
    var retry = document.getElementById("bc-alm-stock-reintentar");
    if (retry && !retry.dataset.bound) {
      retry.dataset.bound = "1";
      retry.addEventListener("click", function () { cargarStockVisualAlmacenes(true); });
    }
    return;
  }
  const stock = stockVisualDelAlmacen(almacen_id);
  if (stock.length === 0) {
    lista.innerHTML = '<p class="lista-estado">Este almacén no tiene productos ni saldos de jornada registrados.</p>';
    return;
  }
  const productsById = {};
  (_cache.productos || []).forEach((item) => { productsById[String(item.id)] = item; });
  const rows = stock.slice().map(function (row) {
    const product = productsById[String(row.producto_id)];
    const name = (product && product.variante_nombre) || (row.productos && row.productos.nombre) ||
      (product && product.nombre) || row.producto || "—";
    const category = product && product.categorias && product.categorias.nombre || "Sin categoría";
    const quantity = Number(row.cantidad) || 0;
    const unit = row.unidad || (product && product.unidad) || "unidad";
    const minimum = row.minimo != null && Number(row.minimo) > 0 ? Number(row.minimo) : null;
    const status = row.estado === "sin_minimo" || minimum == null
      ? "Sin mínimo" : quantity <= 0 ? "Agotado" : quantity <= minimum ? "Bajo mínimo" : "";
    const quantityText = (typeof window.numberFmt === "function" ? window.numberFmt(quantity) : money(quantity)) + " " + unit;
    return { name, category, quantity, quantityText, status };
  }).sort((a,b)=>a.name.localeCompare(b.name,"es"));
  const categories = Array.from(new Set(rows.map(row=>row.category))).sort((a,b)=>a.localeCompare(b,"es"));
  const options = ['<option value="">Todas las categorías</option>'].concat(categories.map(category =>
    '<option value="' + escHtml(category) + '">' + escHtml(category) + '</option>'
  )).join('');
  lista.innerHTML =
    '<div class="bc-alm-stock-toolbar"><span class="bc-alm-stock-count" data-bc-alm-stock-count>' + rows.length + ' productos</span>' +
      '<label class="bc-alm-stock-filter"><span>Categoría</span><select data-bc-alm-category-filter aria-label="Filtrar productos por categoría">' + options + '</select></label></div>' +
    '<div class="bc-alm-stock-table-wrap"><table class="bc-alm-stock-table"><thead><tr><th scope="col">Producto</th><th scope="col">Categoría</th><th scope="col">Cantidad</th></tr></thead><tbody>' +
    rows.map(row =>
      '<tr data-bc-alm-stock-row data-category="' + escHtml(row.category) + '">' +
        '<td class="bc-alm-stock-name" title="' + escHtml(row.name) + '">' + escHtml(row.name) + '</td>' +
        '<td class="bc-alm-stock-category" title="' + escHtml(row.category) + '">' + escHtml(row.category) + '</td>' +
        '<td class="bc-alm-stock-quantity' + (row.status ? ' is-alert' : '') + '" title="' + escHtml(row.status) + '">' +
          escHtml(row.quantityText) + (row.status ? '<small>' + escHtml(row.status) + '</small>' : '') +
        '</td></tr>'
    ).join('') +
    '</tbody></table></div>';
}

function seleccionarAlmacen(id) {
  const nextId = id || null;
  const changed = String(nextId || '') !== String(_almacenSeleccionadoId || '');
  if (changed) {
    invalidarStockVisualAlmacenes();
    _cache.stock_visual = [];
  }
  _almacenSeleccionadoId = nextId;
  const sel = document.getElementById("alm-selector");
  if (sel) sel.value = nextId || "";
  renderPanelAlmacenSeleccionado();
  if (nextId && _stockCargaEstado !== "ok" && _stockCargaEstado !== "loading") {
    cargarStockAlmacenes(false);
  } else if (nextId) {
    cargarStockVisualAlmacenes(false);
  }
}

let _stockCargaForcedPromise = null;
function cargarStockAlmacenes(force, internalForcedRetry) {
  if (_stockCargaForcedPromise && !internalForcedRetry) return _stockCargaForcedPromise;
  if (_stockCargaEstado === "loading" && _stockCargaPromise) {
    if (!force) return _stockCargaPromise;
    // If an older read was already in flight at the moment a purchase committed,
    // wait for it and then issue a new, forced read. Never treat that older read
    // as confirmation of the post-commit balance.
    var pendingRead = _stockCargaPromise;
    _cache.stock = [];
    window.__BC_STOCK_CONFIRMED__ = false;
    if (_stockCargaForcedPromise) return _stockCargaForcedPromise;
    _stockCargaForcedPromise = pendingRead.catch(function () { return []; }).then(function () {
      return cargarStockAlmacenes(true, true);
    }).finally(function () { _stockCargaForcedPromise = null; });
    return _stockCargaForcedPromise;
  }
  if (_stockCargaEstado === "ok" && !force) {
    renderPanelAlmacenSeleccionado();
    if (_stockVistaCargaEstado !== "ok" && almacenPanelVisible()) cargarStockVisualAlmacenes(false);
    return Promise.resolve(_cache.stock || []);
  }
  if (force) {
    _cache.stock = [];
    window.__BC_STOCK_CONFIRMED__ = false;
    if (almacenPanelVisible()) cargarStockVisualAlmacenes(true);
    else invalidarStockVisualAlmacenes();
  }
  _stockCargaEstado = "loading";
  _stockCargaError = null;
  renderPanelAlmacenSeleccionado();

  _stockCargaPromise = (async function () {
    var safetyTimer = setTimeout(function () {
      if (_stockCargaEstado === "loading") {
        console.warn("[BattleCruiser] stock safety timeout");
        _stockCargaEstado = "error";
        _stockCargaError = "timeout de seguridad";
        _stockCargaPromise = null;
        try { renderPanelAlmacenSeleccionado(); } catch (e) {}
      }
    }, (BC_STOCK_TIMEOUT_MS || 12000) + 2500);

    try {
      var productosP = Promise.resolve();
      if (typeof cargarProductos === "function") {
        productosP = bcConTimeoutLocal(cargarProductos(), BC_STOCK_TIMEOUT_MS, "productos").then(function (p) {
          if (Array.isArray(p)) _cache.productos = p;
        }).catch(function () {});
      }

      // A forced refresh must bypass withCache entirely. Purchases and
      // transfers commit to Supabase first; reusing a fulfilled cache entry
      // leaves the stock validator reading the previous balance until reload.
      var stockRequest = force
        ? Promise.resolve().then(function () {
            return client.from("stock").select("producto_id, almacen_id, cantidad, minimo");
          }).then(function (result) {
            if (result && result.error) throw result.error;
            return result && Array.isArray(result.data) ? result.data : [];
          })
        : withCache("stock", function () {
            return client.from("stock").select("producto_id, almacen_id, cantidad, minimo");
          });
      var stockP = bcConTimeoutLocal(stockRequest, BC_STOCK_TIMEOUT_MS, "stock");

      var pair = await Promise.all([stockP, productosP]);
      var stock = pair[0];
      _cache.stock = Array.isArray(stock) ? stock : [];
      window.__BC_STOCK_CONFIRMED__ = true;
      window.__BC_STOCK_ERROR__ = null;
      _stockCargaEstado = "ok";
      _stockCargaError = null;
      try { if (typeof renderResumen === "function") renderResumen(); } catch (e) {}
      return _cache.stock;
    } catch (e) {
      console.warn("[BattleCruiser] cargarStockAlmacenes", e);
      window.__BC_STOCK_CONFIRMED__ = false;
      _stockCargaEstado = "error";
      _stockCargaError = (e && e.message) ? e.message : "Error de red";
      window.__BC_STOCK_ERROR__ = _stockCargaError;
      return [];
    } finally {
      clearTimeout(safetyTimer);
      _stockCargaPromise = null;
      if (!force && almacenPanelVisible()) cargarStockVisualAlmacenes(false);
      renderPanelAlmacenSeleccionado();
    }
  })();

  if (force && !internalForcedRetry) {
    _stockCargaForcedPromise = _stockCargaPromise.finally(function () { _stockCargaForcedPromise = null; });
    return _stockCargaForcedPromise;
  }
  return _stockCargaPromise;
}

function cerrarFormAlmacen() {
  const form = document.getElementById("form-almacen");
  if (!form) return;
  form.reset();
  form.classList.add("hidden");
  const editId = document.getElementById("alm-editando-id");
  if (editId) editId.value = "";
  const submit = document.getElementById("alm-submit-btn");
  if (submit) submit.textContent = "Crear almacén";
  setMsg("msg-almacenes", "", true);
}

function abrirFormCrearAlmacen() {
  if (typeof window.__BC_M277_openCreateAlmacen === "function") {
    window.__BC_M277_openCreateAlmacen();
    return;
  }
  cerrarFormAlmacen();
  const form = document.getElementById("form-almacen");
  if (form) form.classList.remove("hidden");
  const nombre = document.getElementById("alm-nombre");
  if (nombre) nombre.focus();
}

function abrirFormEditarAlmacen() {
  if (typeof window.__BC_M277_openEditAlmacen === "function") {
    window.__BC_M277_openEditAlmacen();
    return;
  }
  if (!_almacenSeleccionadoId) return;
  const a = (_cache.almacenes || []).find((x) => mismoIdAlmacen(x.id, _almacenSeleccionadoId));
  if (!a) return;
  const form = document.getElementById("form-almacen");
  if (!form) return;
  form.classList.remove("hidden");
  document.getElementById("alm-editando-id").value = a.id;
  document.getElementById("alm-nombre").value = a.nombre || "";
  var tipo = a.tipo === "venta" ? "minorista" : (a.tipo || "");
  document.getElementById("alm-tipo").value = tipo;
  document.getElementById("alm-submit-btn").textContent = "Guardar cambios";
  document.getElementById("alm-nombre").focus();
}

async function refrescarAlmacenes() {
  setLoading("lista-almacenes", "Cargando almacenes…");
  const almacenes = await cargarAlmacenes();
  _cache.almacenes = almacenes;
  renderResumen();
  const lista = document.getElementById("lista-almacenes");
  if (lista) {
    if (almacenes.length === 0) {
      setEmpty("lista-almacenes", mensajeListaVacia("almacenes", "Todavía no hay almacenes cargados."));
    } else {
      lista.innerHTML = "";
      almacenes.forEach((a) => {
        const div = document.createElement("div");
        div.className = "lista-item" + (a.activo === false ? " lista-item-inactivo" : "");
        const estado = a.activo === false ? ' <span class="muted">· Inactivo</span>' : "";
        div.innerHTML = "<span>" + escHtml(a.nombre) + estado + '</span><span class="muted">' + escHtml(etiquetaTipoAlmacen(a.tipo)) + "</span>";
        lista.appendChild(div);
      });
    }
  }

  llenarSelectorAlmacenes(almacenes);
  renderPanelAlmacenSeleccionado();
  cargarStockAlmacenes(false);

  fillSelect(document.getElementById("trf-origen"), almacenes, "id", (a) => a.nombre);
  fillSelect(document.getElementById("trf-destino"), almacenes, "id", (a) => a.nombre);
  fillSelect(document.getElementById("vale-almacen"), almacenes, "id", (a) => a.nombre);
  return almacenes;
}

async function bcRefrescarStockYSelectsInterno() {
  try {
    const { productos } = await refrescarProductos();
    const productosMovimiento = typeof productosOperativos === "function"
      ? productosOperativos(productos)
      : productos.filter((p) => !p.inventario_mixto || !!p.producto_padre_id);
    fillSelect(document.getElementById("trf-producto"), productosMovimiento, "id", (p) => p.nombre);
    fillSelect(document.getElementById("vale-producto"), productosMovimiento, "id", (p) => p.nombre);
  } catch (e) {
    console.warn("[BattleCruiser] refrescarStockYSelects productos", e);
  }
  // Read the post-commit balance from Supabase, not from the last completed
  // cache load. This keeps Transfers immediately consistent after a purchase.
  const refreshedStock = await cargarStockAlmacenes(true);
  if (_stockCargaEstado !== "ok") {
    // Never leave stale quantities available to the transfer validator after a
    // committed operation if the fresh database read itself failed. Return a
    // safe empty result instead of throwing into offline reconciliation callers.
    _cache.stock = [];
    window.__BC_STOCK_CONFIRMED__ = false;
    console.warn("[BattleCruiser] No se pudo confirmar stock nuevo desde Supabase; las transferencias quedan bloqueadas hasta actualizar.");
    return [];
  }
  return refreshedStock;
}

let _bcStockSelectsRefreshPromise = null;
function refrescarStockYSelects() {
  if (_bcStockSelectsRefreshPromise) return _bcStockSelectsRefreshPromise;
  const current = bcRefrescarStockYSelectsInterno();
  _bcStockSelectsRefreshPromise = current.finally(function () { _bcStockSelectsRefreshPromise = null; });
  return _bcStockSelectsRefreshPromise;
}

safeInit("form-almacen", () => {
  const form = document.getElementById("form-almacen");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("alm-nombre").value.trim();
    let tipoUi = document.getElementById("alm-tipo").value;
    const tipoRpc = tipoAlmacenUiARpc(tipoUi);
    const editandoId = (document.getElementById("alm-editando-id") || {}).value || "";
    const submitBtn = document.getElementById("alm-submit-btn") || e.target.querySelector("button[type='submit']");

    if (!nombre || !tipoRpc) {
      setMsg("msg-almacenes", "Completá nombre y tipo.", false);
      return;
    }

    submitBtn.disabled = true;
    let resultado;
    if (editandoId) {
      resultado = await editarAlmacen(editandoId, { p_nombre: nombre, p_tipo: tipoRpc });
    } else {
      resultado = await ejecutarOperacion("almacen", {
        p_nombre: nombre,
        p_tipo: tipoRpc,
      });
    }
    submitBtn.disabled = false;

    if (!resultado.ok) {
      setMsg("msg-almacenes", "No se pudo " + (editandoId ? "editar" : "crear") + ": " + explicarError(resultado.error, editandoId ? "editar almacén" : "crear almacén"), false);
      return;
    }
    if (resultado.offline) {
      setMsg("msg-almacenes", (editandoId ? "Cambios" : "Almacén") + " guardado(s), se sincronizará cuando vuelva la conexión.", true);
      cerrarFormAlmacen();
    } else {
      setMsg("msg-almacenes", editandoId ? "Almacén actualizado." : "Almacén creado.", true);
      cerrarFormAlmacen();
      await refrescarAlmacenes();
      await cargarStockAlmacenes(true);
      if (editandoId) seleccionarAlmacen(editandoId);
      else if (resultado.data && resultado.data.id) seleccionarAlmacen(resultado.data.id);
      else if (typeof resultado.data === "string") seleccionarAlmacen(resultado.data);
    }
  });
});

safeInit("almacenes-ui", () => {
  const sel = document.getElementById("alm-selector");
  if (sel) {
    sel.addEventListener("change", () => {
      seleccionarAlmacen(sel.value || null);
    });
  }

  const btnMenu = document.getElementById("alm-acciones-btn");
  const menu = document.getElementById("alm-acciones-menu");
  if (btnMenu && menu) {
    btnMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("hidden");
    });
    document.addEventListener("click", (e) => {
      if (!menu.classList.contains("hidden") && !menu.contains(e.target) && e.target !== btnMenu) {
        menu.classList.add("hidden");
      }
    });
  }

  const btnCrear = document.getElementById("alm-crear-btn");
  if (btnCrear) {
    btnCrear.addEventListener("click", () => {
      if (menu) menu.classList.add("hidden");
      abrirFormCrearAlmacen();
    });
  }
  const btnEditar = document.getElementById("alm-editar-btn");
  if (btnEditar) {
    btnEditar.addEventListener("click", () => {
      if (menu) menu.classList.add("hidden");
      abrirFormEditarAlmacen();
    });
  }
  const btnToggle = document.getElementById("alm-toggle-btn");
  if (btnToggle) {
    btnToggle.addEventListener("click", async () => {
      if (menu) menu.classList.add("hidden");
      if (!_almacenSeleccionadoId) return;
      const a = (_cache.almacenes || []).find((x) => mismoIdAlmacen(x.id, _almacenSeleccionadoId));
      if (!a) return;
      const nuevoActivo = a.activo === false;
      btnToggle.disabled = true;
      const resultado = await activarDesactivarAlmacen(a.id, nuevoActivo);
      btnToggle.disabled = false;
      if (!resultado.ok) {
        setMsg("msg-almacenes", "No se pudo cambiar el estado: " + explicarError(resultado.error, "cambiar estado de almacén"), false);
        return;
      }
      setMsg("msg-almacenes", resultado.offline
        ? "Cambio de estado guardado, se sincronizará cuando vuelva la conexión."
        : (nuevoActivo ? "Almacén activado." : "Almacén desactivado."), true);
      if (!resultado.offline) {
        await refrescarAlmacenes();
        await cargarStockAlmacenes(true);
        seleccionarAlmacen(a.id);
      }
    });
  }
  const btnCancelar = document.getElementById("alm-cancelar-btn");
  if (btnCancelar) btnCancelar.addEventListener("click", () => cerrarFormAlmacen());

  const equipoPanel = document.getElementById("alm-info-panel");
  if (equipoPanel && !equipoPanel.dataset.bcAlmEquipoBound) {
    equipoPanel.dataset.bcAlmEquipoBound = "1";
    equipoPanel.addEventListener("click", function (event) {
      const section = event.target && event.target.closest ? event.target.closest("[data-bc-alm-equipo]") : null;
      if (!section) return;
      const close = event.target.closest("[data-bc-alm-equipo-modal-close]");
      const modalBackdrop = event.target.closest("[data-bc-alm-modal]");
      if (close || (modalBackdrop && event.target === modalBackdrop)) {
        cerrarModalEquipoAlmacen(section);
        return;
      }
      const open = event.target.closest("[data-bc-alm-equipo-open-modal]");
      if (open) {
        abrirModalEquipoAlmacen(section, open.dataset.bcAlmEquipoOpenModal, open.dataset.userId || null);
        return;
      }
      const button = event.target.closest("[data-bc-alm-equipo-action]");
      if (!button) return;
      const action = button.dataset.bcAlmEquipoAction;
      if (action === "retry") { cargarEquipoAlmacen(section.dataset.almacenId); return; }
      if (!["assign", "save", "remove"].includes(action)) return;
      guardarConfiguracionDependientaAlmacen(section, button);
    });
  }
  const stockList = document.getElementById("lista-stock");
  if (stockList && !stockList.dataset.bcCategoryBound) {
    stockList.dataset.bcCategoryBound = "1";
    stockList.addEventListener("change", function (event) {
      const filter = event.target && event.target.closest ? event.target.closest("[data-bc-alm-category-filter]") : null;
      if (!filter) return;
      const value = String(filter.value || "");
      let shown = 0;
      stockList.querySelectorAll("[data-bc-alm-stock-row]").forEach(function (row) {
        const visible = !value || row.dataset.category === value;
        row.hidden = !visible;
        if (visible) shown++;
      });
      const count = stockList.querySelector("[data-bc-alm-stock-count]");
      if (count) count.textContent = shown + (shown === 1 ? " producto" : " productos");
    });
  }
});

async function editarAlmacen(almacen_id, cambios) {
  const payload = Object.assign({ p_almacen_id: almacen_id }, cambios || {});
  if (payload.p_tipo != null && payload.p_tipo !== "") {
    payload.p_tipo = tipoAlmacenUiARpc(payload.p_tipo);
  }
  const resultado = await ejecutarOperacion("almacen_actualizar", payload);
  if (resultado.ok && !resultado.offline) {
    await refrescarAlmacenes();
    await cargarStockAlmacenes(true);
  }
  return resultado;
}

async function activarDesactivarAlmacen(almacen_id, activo) {
  const resultado = await ejecutarOperacion("almacen_estado", {
    p_almacen_id: almacen_id,
    p_activo: !!activo,
  });
  if (resultado.ok && !resultado.offline) {
    await refrescarAlmacenes();
    await cargarStockAlmacenes(true);
  }
  return resultado;
}


// Actualiza el panel de almacenes cuando otra pestaña de la misma PWA confirma
// una operación de inventario. La navegación conserva su refresco habitual.
if (!window.__BC_ALMACENES_DATA_EVENTS__) {
  window.__BC_ALMACENES_DATA_EVENTS__ = true;
  let warehouseRefreshTimer = null;
  window.addEventListener("bc:data-changed", function (event) {
    const detail = event.detail || {};
    if (detail.offline) return;
    if (!detail.remote && ['almacen', 'almacen_actualizar', 'almacen_estado'].includes(detail.operation)) return;
    const domains = detail.domains || [];
    if (!domains.includes("warehouses") && !domains.includes("stock")) return;
    const tab = document.getElementById("tab-almacenes");
    if (!tab || !tab.classList.contains("visible")) return;
    clearTimeout(warehouseRefreshTimer);
    warehouseRefreshTimer = setTimeout(async function () {
      try {
        if (domains.includes("warehouses") && typeof refrescarAlmacenes === "function") await refrescarAlmacenes();
        if (typeof cargarStockAlmacenes === "function") await cargarStockAlmacenes(true);
      } catch (error) {
        console.warn("[BattleCruiser] No se pudo actualizar el panel de almacenes tras un cambio:", error);
      }
    }, 160);
  });
}
