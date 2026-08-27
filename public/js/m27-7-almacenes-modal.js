// BattleCruiser M27.7 — Almacenes: crear y editar mediante modal (Bloques 6 y 7)
// Reutiliza: ejecutarOperacion("almacen"), editarAlmacen, refrescarAlmacenes.
// v27.7d — DAP-1: mapear tipos UI→contrato RPC (minorista→venta; almacenamiento permitido tras m13b).
(function () {
  'use strict';
  if (window.__BC_M277_ALM__) return;
  window.__BC_M277_ALM__ = true;

  var TIPOS = [
    { value: 'almacenamiento', label: 'Almacenamiento', hint: 'Reserva interna para reposición' },
    { value: 'minorista', label: 'Minorista', hint: 'Punto de venta al consumidor' },
    { value: 'mayorista', label: 'Mayorista', hint: 'Punto de venta mayorista' }
  ];

  var LABELS = {
    almacenamiento: 'Almacenamiento',
    minorista: 'Minorista',
    mayorista: 'Mayorista',
    venta: 'Minorista'
  };

  /** UI → valor aceptado por crear_almacen / editar_almacen (contrato m13 + m13b). */
  function tipoUiARpc(t) {
    var s = String(t || '').toLowerCase();
    if (s === 'minorista' || s === 'venta') return 'venta';
    if (s === 'mayorista') return 'mayorista';
    if (s === 'almacenamiento') return 'almacenamiento';
    return s;
  }

  function normTipo(t) {
    var s = String(t || '').toLowerCase();
    if (s === 'venta') return 'minorista';
    if (s === 'almacenamiento' || s === 'minorista' || s === 'mayorista') return s;
    return s || '';
  }

  function etiqueta(t) {
    return LABELS[normTipo(t)] || LABELS[String(t || '').toLowerCase()] || 'Almacenamiento';
  }

  function patchEtiquetaGlobal() {
    if (typeof window.etiquetaTipoAlmacen === 'function' && !window.__BC_M277_ETIQUETA__) {
      window.etiquetaTipoAlmacen = function (tipo) { return etiqueta(tipo); };
      window.__BC_M277_ETIQUETA__ = true;
    } else if (typeof window.etiquetaTipoAlmacen !== 'function') {
      window.etiquetaTipoAlmacen = function (tipo) { return etiqueta(tipo); };
      window.__BC_M277_ETIQUETA__ = true;
    }
  }

  function injectStyles() {
    if (document.getElementById('bc-m277-alm-style')) return;
    var s = document.createElement('style');
    s.id = 'bc-m277-alm-style';
    s.textContent = [
      '#tab-almacenes #form-almacen.alm-form-panel{display:none!important}',
      '#tab-almacenes .alm-hero{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}',
      '#tab-almacenes .alm-hero h2{margin:0;font-family:Cormorant Garamond,serif;font-size:1.55rem;font-weight:600;color:var(--text)}',
      '#tab-almacenes .alm-hero p{margin:4px 0 0;font-size:13px;color:var(--mist);max-width:420px;line-height:1.4}',
      '#tab-almacenes .alm-btn-nuevo{background:linear-gradient(180deg,var(--gold-bright,#e8d48b),var(--gold,#c9a24d))!important;color:#211605!important;border:none!important;font-weight:600;padding:10px 16px!important;border-radius:10px!important;cursor:pointer;box-shadow:0 4px 14px rgba(201,162,77,.22)}',
      '#tab-almacenes .alm-btn-nuevo:hover{filter:brightness(1.05)}',
      '#tab-almacenes .alm-acciones-wrap{position:relative;display:inline-block}',
      '#tab-almacenes .alm-acciones-menu{position:absolute;top:100%;left:0;margin-top:4px;min-width:180px;z-index:40;',
      'background:var(--stone-2,var(--stone));border:1px solid rgba(201,162,77,.28);border-radius:10px;',
      'box-shadow:0 12px 28px rgba(0,0,0,.45);padding:6px;display:flex;flex-direction:column;gap:2px}',
      '#tab-almacenes .alm-acciones-menu.hidden{display:none!important}',
      '#tab-almacenes .alm-acciones-menu button{display:block;width:100%;text-align:left;padding:10px 12px;border:none;border-radius:8px;',
      'background:transparent;color:var(--text);font-size:13px;cursor:pointer}',
      '#tab-almacenes .alm-acciones-menu button:hover:not(:disabled){background:rgba(201,162,77,.12);color:var(--gold)}',
      '#tab-almacenes .alm-acciones-menu button:disabled{opacity:.45;cursor:not-allowed}',
      '#tab-almacenes #alm-crear-btn{display:none!important}',
      '#bc-alm-modal{position:fixed;inset:0;z-index:10020;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}',
      '#bc-alm-modal.open{display:flex}',
      '#bc-alm-modal .bc-alm-backdrop{position:absolute;inset:0;background:rgba(6,14,11,.72);backdrop-filter:blur(3px)}',
      '#bc-alm-modal .bc-alm-panel{position:relative;z-index:1;width:100%;max-width:480px;max-height:min(90vh,640px);overflow-y:auto;background:linear-gradient(180deg,var(--stone-2,var(--stone)),var(--stone));border:1px solid rgba(201,162,77,.28);border-radius:16px;padding:20px;box-shadow:0 24px 64px rgba(0,0,0,.55);color:var(--text)}',
      '#bc-alm-modal .bc-alm-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}',
      '#bc-alm-modal .bc-alm-head h3{margin:0;font-family:Cormorant Garamond,serif;font-size:1.3rem;font-weight:600;color:var(--gold-bright,var(--gold))}',
      '#bc-alm-modal .bc-alm-close{width:36px;height:36px;border-radius:8px;border:1px solid rgba(201,162,77,.28);background:rgba(201,162,77,.08);color:var(--text);cursor:pointer;font-size:20px;line-height:1}',
      '#bc-alm-modal .bc-alm-field{margin:0 0 12px}',
      '#bc-alm-modal .bc-alm-field label{display:block;font-size:12px;color:var(--mist);margin-bottom:5px;text-transform:none}',
      '#bc-alm-modal .bc-alm-field input,#bc-alm-modal .bc-alm-field select{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;background:var(--void,#0a1411);border:1px solid rgba(201,162,77,.22);color:var(--text);font-size:14px}',
      '#bc-alm-modal .bc-alm-tipos{display:grid;gap:8px;margin:4px 0 12px}',
      '#bc-alm-modal .bc-alm-tipo{display:flex;align-items:flex-start;gap:10px;width:100%;padding:12px 13px;border:1px solid rgba(201,162,77,.18);border-radius:10px;background:rgba(12,28,24,.45);color:var(--text);text-align:left;cursor:pointer;font-weight:600}',
      '#bc-alm-modal .bc-alm-tipo:hover{border-color:rgba(201,162,77,.45)}',
      '#bc-alm-modal .bc-alm-tipo.selected{outline:2px solid var(--gold,#c9a24d);background:rgba(201,162,77,.12)}',
      '#bc-alm-modal .bc-alm-tipo small{display:block;font-weight:500;color:var(--mist);margin-top:2px;font-size:11.5px}',
      '#bc-alm-modal .bc-alm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}',
      '#bc-alm-modal .bc-alm-actions button{font-weight:600;min-height:40px;padding:8px 14px;border-radius:10px;cursor:pointer}',
      '#bc-alm-modal .bc-alm-actions .bc-alm-save{background:linear-gradient(180deg,var(--gold-bright,#e8d48b),var(--gold,#c9a24d));color:#211605;border:none}',
      '#bc-alm-modal .bc-alm-status{min-height:20px;margin-top:8px;font-size:13px;font-weight:600}',
      '#bc-alm-modal .bc-alm-status.err{color:var(--wine,#c45)}',
      '#bc-alm-modal .bc-alm-status.ok{color:#9dcc9a}',
      '#bc-almacen-tipo-modal{display:none!important}'
    ].join('');
    document.head.appendChild(s);
  }

  function ensureHero() {
    var tab = document.getElementById('tab-almacenes');
    if (!tab || document.getElementById('bc-alm-hero')) return;
    var hero = document.createElement('div');
    hero.id = 'bc-alm-hero';
    hero.className = 'alm-hero';
    hero.innerHTML =
      '<div><h2>Almacenes</h2><p>Puntos de almacenamiento y venta. Creá y editá sin saturar la pantalla.</p></div>' +
      '<div><button type="button" class="alm-btn-nuevo" id="bc-alm-btn-nuevo">+ Nuevo almacén</button></div>';
    tab.insertBefore(hero, tab.firstChild);
  }

  function ensureModal() {
    var root = document.getElementById('bc-alm-modal');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'bc-alm-modal';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'bc-alm-modal-title');
    root.innerHTML =
      '<div class="bc-alm-backdrop" data-bc-alm-close="1"></div>' +
      '<div class="bc-alm-panel">' +
      '<div class="bc-alm-head">' +
      '<h3 id="bc-alm-modal-title">Nuevo almacén</h3>' +
      '<button type="button" class="bc-alm-close" data-bc-alm-close="1" aria-label="Cerrar">×</button>' +
      '</div>' +
      '<input type="hidden" id="bc-alm-modal-id" value="">' +
      '<div class="bc-alm-field">' +
      '<label for="bc-alm-modal-nombre">Nombre</label>' +
      '<input id="bc-alm-modal-nombre" type="text" placeholder="Nombre del almacén" autocomplete="off">' +
      '</div>' +
      '<div class="bc-alm-field"><label>Tipo de almacén</label>' +
      '<div class="bc-alm-tipos" id="bc-alm-modal-tipos">' +
      TIPOS.map(function (t) {
        return '<button type="button" class="bc-alm-tipo" data-tipo="' + t.value + '">' +
          '<span>' + t.label + '<small>' + t.hint + '</small></span></button>';
      }).join('') +
      '</div></div>' +
      '<div class="bc-alm-status" id="bc-alm-modal-status"></div>' +
      '<div class="bc-alm-actions">' +
      '<button type="button" class="cc-accion" data-bc-alm-close="1">Cancelar</button>' +
      '<button type="button" class="bc-alm-save" id="bc-alm-modal-guardar">Guardar</button>' +
      '</div></div>';
    document.body.appendChild(root);
    return root;
  }

  function setStatus(text, ok) {
    var el = document.getElementById('bc-alm-modal-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'bc-alm-status' + (text ? (ok ? ' ok' : ' err') : '');
  }

  function selectTipo(value) {
    var v = normTipo(value) || 'minorista';
    var root = ensureModal();
    root.querySelectorAll('.bc-alm-tipo').forEach(function (b) {
      var on = b.getAttribute('data-tipo') === v;
      b.classList.toggle('selected', on);
    });
  }

  function getSelectedTipo() {
    var b = document.querySelector('#bc-alm-modal .bc-alm-tipo.selected');
    return b ? b.getAttribute('data-tipo') : '';
  }

  function closeModal() {
    var root = document.getElementById('bc-alm-modal');
    if (root) root.classList.remove('open');
    setStatus('', true);
  }

  function openCreate() {
    var root = ensureModal();
    document.getElementById('bc-alm-modal-title').textContent = 'Nuevo almacén';
    document.getElementById('bc-alm-modal-id').value = '';
    document.getElementById('bc-alm-modal-nombre').value = '';
    selectTipo('minorista');
    setStatus('', true);
    document.getElementById('bc-alm-modal-guardar').textContent = 'Crear almacén';
    root.classList.add('open');
    setTimeout(function () {
      var n = document.getElementById('bc-alm-modal-nombre');
      if (n) n.focus();
    }, 40);
  }

  function openEdit(id) {
    if (!id) {
      var sel = document.getElementById('alm-selector');
      id = sel && sel.value ? sel.value : null;
    }
    if (!id) {
      if (typeof setMsg === 'function') setMsg('msg-almacenes', 'Elegí un almacén para editar.', false);
      return;
    }
    var list = (typeof _cache !== 'undefined' && Array.isArray(_cache.almacenes)) ? _cache.almacenes : [];
    var a = list.find(function (x) { return String(x.id) === String(id); });
    if (!a) {
      if (typeof setMsg === 'function') setMsg('msg-almacenes', 'Almacén no encontrado.', false);
      return;
    }
    var root = ensureModal();
    document.getElementById('bc-alm-modal-title').textContent = 'Editar almacén';
    document.getElementById('bc-alm-modal-id').value = a.id;
    document.getElementById('bc-alm-modal-nombre').value = a.nombre || '';
    selectTipo(normTipo(a.tipo) || 'minorista');
    setStatus('', true);
    document.getElementById('bc-alm-modal-guardar').textContent = 'Guardar cambios';
    root.classList.add('open');
    setTimeout(function () {
      var n = document.getElementById('bc-alm-modal-nombre');
      if (n) n.focus();
    }, 40);
  }

  function mensajeErrorReal(resultado, accion) {
    var err = resultado && resultado.error;
    var raw = (err && (err.message || err.details || err.hint)) || '';
    if (!raw && err) raw = String(err);
    if (typeof explicarError === 'function') {
      var explained = explicarError(err, accion);
      if (explained && explained !== 'Error desconocido') return 'Error al ' + accion + ': ' + explained;
    }
    if (raw) return 'Error al ' + accion + ': ' + raw;
    return 'Error al ' + accion + ': respuesta inválida del servidor.';
  }

  async function save() {
    var id = (document.getElementById('bc-alm-modal-id') || {}).value || '';
    var nombreEl = document.getElementById('bc-alm-modal-nombre');
    var nombre = nombreEl ? nombreEl.value.trim() : '';
    var tipoUi = getSelectedTipo();
    var tipoRpc = tipoUiARpc(tipoUi);
    var btn = document.getElementById('bc-alm-modal-guardar');
    var accion = id ? 'editar almacén' : 'crear almacén';

    if (!nombre) {
      setStatus('Completá el nombre del almacén.', false);
      if (nombreEl) nombreEl.focus();
      return;
    }
    if (!tipoUi || !TIPOS.some(function (t) { return t.value === tipoUi; })) {
      setStatus('Seleccioná un tipo válido (almacenamiento, minorista o mayorista).', false);
      return;
    }
    if (!tipoRpc) {
      setStatus('Tipo de almacén no mapeable al backend.', false);
      return;
    }

    if (btn) btn.disabled = true;
    setStatus('Guardando…', true);

    try {
      var resultado;
      if (id) {
        if (typeof editarAlmacen !== 'function') throw new Error('Función de edición no disponible');
        resultado = await editarAlmacen(id, { p_nombre: nombre, p_tipo: tipoRpc });
      } else {
        if (typeof ejecutarOperacion !== 'function') throw new Error('Operación no disponible');
        resultado = await ejecutarOperacion('almacen', { p_nombre: nombre, p_tipo: tipoRpc });
      }

      if (!resultado || !resultado.ok) {
        setStatus(mensajeErrorReal(resultado, accion), false);
        return;
      }

      if (resultado.offline) {
        setStatus((id ? 'Cambios' : 'Almacén') + ' guardado(s) localmente; se sincronizará al recuperar conexión.', true);
        setTimeout(closeModal, 700);
        if (typeof setMsg === 'function') {
          setMsg('msg-almacenes', (id ? 'Cambios' : 'Almacén') + ' guardado(s), se sincronizará cuando vuelva la conexión.', true);
        }
        return;
      }

      setStatus(id ? 'Almacén actualizado.' : 'Almacén creado.', true);
      if (typeof setMsg === 'function') {
        setMsg('msg-almacenes', id ? 'Almacén actualizado.' : 'Almacén creado.', true);
      }

      if (!id && typeof refrescarAlmacenes === 'function') {
        await refrescarAlmacenes();
      } else if (!id) {
        /* editarAlmacen ya refresca online */
      } else if (typeof refrescarAlmacenes === 'function') {
        /* edit path: editarAlmacen refreshes when online; offline already returned */
      }

      if (typeof cargarStockAlmacenes === 'function' && !id) {
        try { await cargarStockAlmacenes(true); } catch (e) {}
      }

      var newId = id;
      if (!newId && resultado.data) {
        newId = typeof resultado.data === 'string' ? resultado.data : (resultado.data.id || null);
      }
      if (newId && typeof seleccionarAlmacen === 'function') {
        try { seleccionarAlmacen(newId); } catch (e) {}
      }

      setTimeout(closeModal, 280);
    } catch (e) {
      setStatus('Error al ' + accion + ': ' + ((e && e.message) || 'fallo inesperado'), false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function hideInlineForm() {
    var form = document.getElementById('form-almacen');
    if (form) {
      form.classList.add('hidden');
      form.style.display = 'none';
    }
    var sel = document.getElementById('alm-tipo');
    if (sel && !sel.dataset.bcM277) {
      sel.dataset.bcM277 = '1';
      var actual = normTipo(sel.value);
      sel.innerHTML =
        '<option value="">Tipo de almacén</option>' +
        TIPOS.map(function (t) {
          return '<option value="' + t.value + '">' + t.label + '</option>';
        }).join('');
      if (actual && TIPOS.some(function (t) { return t.value === actual; })) sel.value = actual;
    }
  }

  function bind() {
    if (document.documentElement.dataset.bcM277Bound === '1') return;
    document.documentElement.dataset.bcM277Bound = '1';

    document.addEventListener('click', function (e) {
      if (e.target.closest('#bc-alm-btn-nuevo')) {
        e.preventDefault();
        e.stopPropagation();
        openCreate();
        return;
      }
      if (e.target.closest('#alm-crear-btn')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        var menu = document.getElementById('alm-acciones-menu');
        if (menu) menu.classList.add('hidden');
        openCreate();
        return;
      }
      if (e.target.closest('#alm-editar-btn')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        var menu2 = document.getElementById('alm-acciones-menu');
        if (menu2) menu2.classList.add('hidden');
        openEdit();
        return;
      }
      var tipoBtn = e.target.closest('#bc-alm-modal .bc-alm-tipo');
      if (tipoBtn) {
        e.preventDefault();
        selectTipo(tipoBtn.getAttribute('data-tipo'));
        return;
      }
      if (e.target.closest('[data-bc-alm-close="1"]')) {
        closeModal();
        return;
      }
      if (e.target.closest('#bc-alm-modal-guardar')) {
        e.preventDefault();
        save();
      }
    }, true);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var root = document.getElementById('bc-alm-modal');
        if (root && root.classList.contains('open')) closeModal();
      }
    });
  }

  function patchLegacyOpeners() {
    try {
      if (typeof window.abrirFormCrearAlmacen === 'function') {
        window.abrirFormCrearAlmacen = function () { openCreate(); };
      }
      if (typeof window.abrirFormEditarAlmacen === 'function') {
        window.abrirFormEditarAlmacen = function () { openEdit(); };
      }
    } catch (e) {}
  }

  function boot() {
    injectStyles();
    patchEtiquetaGlobal();
    hideInlineForm();
    ensureHero();
    ensureModal();
    bind();
    patchLegacyOpeners();
  }

  function schedule() {
    boot();
    setTimeout(boot, 400);
    setTimeout(boot, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }

  window.__BC_M277_openCreateAlmacen = openCreate;
  window.__BC_M277_openEditAlmacen = openEdit;
  window.__BC_M277_tipoUiARpc = tipoUiARpc;
})();
