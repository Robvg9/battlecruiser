// BattleCruiser — M26 UI integridad
// v9.2.23 — Productos: formulario de creación/edición en ventana emergente única
(function () {
  'use strict';

  function unificarTurnos() {
    var real = document.getElementById('tab-ciclos');
    if (!real) return;
    document.querySelectorAll('.tab-btn[data-tab="turnos"]').forEach(function (b) { b.remove(); });
    var botones = Array.from(document.querySelectorAll('.tab-btn[data-tab="ciclos"]'));
    botones.slice(1).forEach(function (b) { b.remove(); });
    if (botones[0]) botones[0].textContent = 'Turnos';
    var legacy = document.getElementById('tab-turnos');
    if (legacy) legacy.style.display = 'none';
  }

  function ocultarCompraEnProductos() {
    var form = document.getElementById('form-compra');
    if (!form) return;
    var h = form.previousElementSibling;
    if (h && /^Registrar compra/i.test((h.textContent || '').trim())) h.style.display = 'none';
    form.style.display = 'none';
    form.setAttribute('aria-hidden', 'true');
  }

  function fijarNomenclaturaSoloProductos() {
    var productos = document.getElementById('tab-productos');
    var modal = document.getElementById('productos-nomenclatura-modal');
    if (!productos || !modal) return;
    document.querySelectorAll('#productos-tools-nomenclatura,#productos-nomenclatura-btn').forEach(function (el) {
      if (!el.closest('#tab-productos')) el.remove();
    });
    var slots = {
      'lista-categorias': 'prod-nom-categorias-slot',
      'lista-unidades': 'prod-nom-unidades-slot',
      'lista-presentaciones-catalogo': 'prod-nom-presentaciones-slot',
      'pp-lista-asociaciones': 'prod-nom-presentaciones-slot'
    };
    Object.keys(slots).forEach(function (id) {
      var el = document.getElementById(id), slot = document.getElementById(slots[id]);
      if (!el || !slot) return;
      var bloque = el.closest('.cc-bloque') || el.closest('.card') || el.closest('.presentaciones-catalogo') || el.closest('.presentaciones-producto') || el.parentElement;
      if (bloque && !slot.contains(bloque)) slot.appendChild(bloque);
    });
  }

  function prepararNomenclatura() {
    var modal = document.getElementById('productos-nomenclatura-modal');
    var btn = document.getElementById('productos-nomenclatura-btn');
    if (!modal || !btn || !btn.closest('#tab-productos')) return;
    fijarNomenclaturaSoloProductos();
    if (btn.dataset.bcM26 === '1') return;
    btn.dataset.bcM26 = '1';
    btn.addEventListener('click', function () {
      fijarNomenclaturaSoloProductos();
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    });
    var close = document.getElementById('productos-nomenclatura-cerrar');
    if (close) close.addEventListener('click', function () {
      modal.classList.add('hidden');
      modal.style.display = '';
    });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        modal.classList.add('hidden');
        modal.style.display = '';
      }
    });
  }

  function limpiarInterfazAgregarProducto() {
    var panel = document.getElementById('tab-productos');
    if (!panel) return;
    var m22 = document.getElementById('m22-productos-ui');
    if (m22) m22.remove();
    var m22Btn = document.getElementById('m22-agregar-producto');
    if (m22Btn) m22Btn.remove();
    var m22Close = document.getElementById('m22-cerrar-form');
    if (m22Close) m22Close.remove();
    var modalUi = document.getElementById('bc-product-modal');
    if (modalUi) modalUi.remove();
    var toolbarUi = document.querySelector('.bc-product-toolbar');
    if (toolbarUi) toolbarUi.remove();

    panel.querySelectorAll('button').forEach(function (btn) {
      var t = (btn.textContent || '').trim().toLowerCase();
      if ((t === 'cerrar' || t === '×') && !btn.closest('#productos-nomenclatura-modal')) btn.remove();
    });
    panel.querySelectorAll('h1,h2,h3,h4,p,small,legend').forEach(function (el) {
      var t = (el.textContent || '').trim().toLowerCase();
      if (t === 'agregar producto' || t === 'productos' || t === 'catálogo operativo' || t === 'catalogo operativo' || t === 'presentaciones comerciales' || t === 'define la presentación obligatoria antes de guardar' || t === 'define la presentacion obligatoria antes de guardar') {
        if (!el.closest('#form-producto') && !el.closest('#productos-nomenclatura-modal')) el.remove();
      }
    });
    panel.querySelectorAll('button').forEach(function (btn) {
      var t = (btn.textContent || '').trim().toLowerCase().replace(/^＋\s*/, '');
      if ((t === 'agregar producto' || t === '＋ agregar producto') && btn.id !== 'prod-submit-btn' && btn.id !== 'bc-productos-agregar' && btn.type !== 'submit') btn.remove();
    });
  }

  function asegurarModalProducto() {
    var modal = document.getElementById('bc-product-modal');
    var form = document.getElementById('form-producto');
    if (!form) return null;
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bc-product-modal';
      modal.className = 'bc-product-modal hidden';
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = '<div class="bc-product-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="bc-product-modal-title"><div class="bc-product-modal-head"><h3 id="bc-product-modal-title">Agregar producto</h3><button type="button" id="bc-product-modal-close" class="bc-product-modal-close" aria-label="Cerrar">×</button></div><div id="bc-product-form-host"></div></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', function (e) {
        if (e.target === modal) cerrarModalProducto(true);
      });
      var close = modal.querySelector('#bc-product-modal-close');
      if (close) close.addEventListener('click', function () { cerrarModalProducto(true); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) cerrarModalProducto(true);
      });
    }
    var host = modal.querySelector('#bc-product-form-host');
    if (host && !host.contains(form)) host.appendChild(form);
    form.classList.remove('hidden');
    form.removeAttribute('hidden');
    form.classList.add('bc-producto-modal-form');
    return modal;
  }

  function cerrarModalProducto(cancelar) {
    var modal = document.getElementById('bc-product-modal');
    if (!modal) return;
    var form = document.getElementById('form-producto');
    if (cancelar && typeof window.cancelarEdicionProducto === 'function') {
      try { window.cancelarEdicionProducto(); } catch (e) {}
    }
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    if (form) form.classList.add('hidden');
  }

  function mostrarFormularioProducto() {
    var form = document.getElementById('form-producto');
    if (!form) return;
    var modal = asegurarModalProducto();
    if (!modal) return;
    var editando = document.getElementById('prod-editando-id');
    var title = modal.querySelector('#bc-product-modal-title');
    var submitBtn = document.getElementById('prod-submit-btn');
    var edit = !!(editando && editando.value);
    if (title) title.textContent = edit ? 'Editar producto' : 'Agregar producto';
    if (submitBtn) submitBtn.textContent = edit ? 'Guardar cambios' : 'Guardar producto';
    form.classList.remove('hidden');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    form.dataset.bcProductFormOpen = '1';
    var nombre = document.getElementById('prod-nombre');
    if (nombre) setTimeout(function () { try { nombre.focus(); } catch (e) {} }, 0);
  }

  function ocultarFormularioProducto() {
    var form = document.getElementById('form-producto');
    if (form) {
      form.classList.add('hidden');
      form.dataset.bcProductFormOpen = '0';
    }
    var modal = document.getElementById('bc-product-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function simplificarProductos() {
    var panel = document.getElementById('tab-productos');
    if (!panel || panel.dataset.bcSimple === '1') return;
    var form = document.getElementById('form-producto');
    var lista = document.getElementById('lista-productos');
    var buscar = document.getElementById('productos-buscar');
    if (!form || !lista || !buscar || typeof renderProductosLista !== 'function') return;
    panel.dataset.bcSimple = '1';
    limpiarInterfazAgregarProducto();
    form = document.getElementById('form-producto');
    if (!form) return;
    ocultarFormularioProducto();

    var barra = document.createElement('div');
    barra.id = 'bc-productos-barra';
    barra.className = 'bc-productos-barra';
    var searchWrap = document.createElement('div');
    searchWrap.className = 'bc-productos-search';
    var parent = buscar.parentElement;
    searchWrap.appendChild(buscar);
    if (parent && parent !== panel && parent !== searchWrap) parent.style.display = 'none';
    barra.appendChild(searchWrap);

    var controles = document.createElement('div');
    controles.id = 'bc-productos-controles';
    controles.className = 'bc-productos-controles';
    var orden = document.createElement('div');
    orden.id = 'bc-productos-orden';
    orden.className = 'bc-productos-orden';
    [['nombre-asc', 'A–Z'], ['nombre-desc', 'Z–A'], ['categoria', 'Categoría']].forEach(function (pair) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'cc-accion bc-prod-sort'; b.dataset.sort = pair[0]; b.textContent = pair[1]; orden.appendChild(b);
    });
    var vista = document.createElement('div');
    vista.id = 'bc-productos-vista'; vista.className = 'bc-productos-vista';
    var fila = document.createElement('button');
    fila.type = 'button'; fila.className = 'cc-accion active'; fila.textContent = '☰'; fila.title = 'Vista en filas';
    var cuadricula = document.createElement('button');
    cuadricula.type = 'button'; cuadricula.className = 'cc-accion'; cuadricula.textContent = '■ ■ ■ ■'; cuadricula.title = 'Vista en cuadros';
    vista.appendChild(fila); vista.appendChild(cuadricula); orden.appendChild(vista); controles.appendChild(orden);

    var agregar = document.createElement('button');
    agregar.type = 'button'; agregar.id = 'bc-productos-agregar'; agregar.className = 'cc-accion'; agregar.textContent = 'Agregar producto'; agregar.setAttribute('aria-controls', 'form-producto');
    agregar.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (typeof cancelarEdicionProducto === 'function') { try { cancelarEdicionProducto(); } catch (err) {} }
      mostrarFormularioProducto();
    });
    controles.appendChild(agregar); barra.appendChild(controles); panel.insertBefore(barra, panel.firstChild);

    if (!panel.contains(lista)) panel.appendChild(lista);
    if (!panel.contains(form) && !document.getElementById('bc-product-form-host')) panel.appendChild(form);

    Array.from(panel.children).forEach(function (el) {
      if (el === barra || el === lista || el === form || el.id === 'msg-productos' || el.id === 'productos-nomenclatura-btn' || el.id === 'productos-tools-nomenclatura') return;
      var tag = (el.tagName || '').toLowerCase();
      if (tag === 'h3' || el.id === 'form-compra' || el.classList.contains('presentaciones-panel') || el.classList.contains('productos-buscador-controles')) { el.style.display = 'none'; el.setAttribute('aria-hidden', 'true'); }
    });

    var sortMode = 'nombre-asc';
    function ordenarProductos() {
      if (typeof _cache === 'undefined' || !Array.isArray(_cache.productos)) return;
      var arr = _cache.productos.slice();
      arr.sort(function (a, b) {
        if (sortMode === 'categoria') {
          var ca = ((a.categorias && a.categorias.nombre) || '').localeCompare((b.categorias && b.categorias.nombre) || '', 'es', { sensitivity: 'base' });
          return ca || (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
        }
        var c = (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
        return sortMode === 'nombre-desc' ? -c : c;
      });
      _cache.productos = arr; renderProductosLista();
    }
    orden.querySelectorAll('.bc-prod-sort').forEach(function (b) {
      b.addEventListener('click', function () { sortMode = b.dataset.sort; orden.querySelectorAll('.bc-prod-sort').forEach(function (x) { x.classList.toggle('active', x === b); }); ordenarProductos(); });
    });
    orden.querySelector('.bc-prod-sort').classList.add('active');

    function setVista(grid) { lista.classList.toggle('bc-grid', grid); fila.classList.toggle('active', !grid); cuadricula.classList.toggle('active', grid); try { localStorage.setItem('bc-productos-vista', grid ? 'grid' : 'lista'); } catch (e) {} }
    fila.addEventListener('click', function () { setVista(false); });
    cuadricula.addEventListener('click', function () { setVista(true); });
    var guardada = 'lista'; try { guardada = localStorage.getItem('bc-productos-vista') || 'lista'; } catch (e) {}
    setVista(guardada === 'grid');

    if (typeof window.cancelarEdicionProducto === 'function' && !window.cancelarEdicionProducto.__bcM26) {
      var originalCancel = window.cancelarEdicionProducto;
      window.cancelarEdicionProducto = function () { originalCancel.apply(this, arguments); ocultarFormularioProducto(); var submitBtn = document.getElementById('prod-submit-btn'); if (submitBtn) submitBtn.textContent = 'Guardar producto'; };
      window.cancelarEdicionProducto.__bcM26 = true;
    }

    if (form && !form.dataset.bcM26SubmitHook) {
      form.dataset.bcM26SubmitHook = '1';
      form.addEventListener('submit', function () {
        setTimeout(function () {
          var editando = document.getElementById('prod-editando-id');
          var msg = document.getElementById('msg-productos');
          if (msg && /creado|actualizado|✓/i.test(msg.textContent || '')) {
            if (!editando || !editando.value) ocultarFormularioProducto();
            else ocultarFormularioProducto();
          }
        }, 500);
      });
    }

    if (lista && !lista.dataset.bcM26EditHook) {
      lista.dataset.bcM26EditHook = '1';
      lista.addEventListener('click', function (e) {
        if (e.target.closest('.btn-editar-producto')) setTimeout(function () { mostrarFormularioProducto(); }, 0);
      });
    }

    if (!document.getElementById('bc-productos-simple-style')) {
      var style = document.createElement('style'); style.id = 'bc-productos-simple-style';
      style.textContent = [
        '#bc-productos-barra{display:flex;flex-direction:column;gap:10px;margin-bottom:14px;position:sticky;top:0;z-index:20;background:var(--void);padding:6px 0}',
        '#bc-productos-barra .bc-productos-search{width:100%}',
        '#bc-productos-barra #productos-buscar{display:block!important;width:100%;box-sizing:border-box}',
        '#bc-productos-controles{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
        '#bc-productos-orden{display:flex;gap:7px;flex-wrap:wrap;flex:1 1 auto}',
        '#bc-productos-orden button{flex:0 1 auto}',
        '#bc-productos-orden button.active{border-color:var(--gold);color:var(--gold)}',
        '#bc-productos-vista{display:flex;gap:6px;margin-left:auto}',
        '#bc-productos-agregar{flex:0 0 auto;visibility:visible!important;opacity:1!important;display:inline-flex!important}',
        '#lista-productos{display:block!important}',
        '#lista-productos.bc-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:stretch}',
        '#lista-productos.bc-grid>.lista-item{box-sizing:border-box;min-width:0;min-height:0;aspect-ratio:1/1;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:6px;padding:8px;overflow:hidden}',
        '#lista-productos.bc-grid>.lista-item .producto-thumb{display:block;width:100%;height:60%;min-height:0;max-height:none;object-fit:cover;flex:0 0 60%;border-radius:7px}',
        '#lista-productos.bc-grid>.lista-item .producto-thumb-vacia{height:60%;flex:0 0 60%;background:rgba(255,255,255,.06);border-radius:7px}',
        '#lista-productos.bc-grid>.lista-item>span:not(.lista-item-acciones){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '#lista-productos.bc-grid>.lista-item .lista-item-acciones{display:flex;gap:4px;margin-top:auto}',
        '#lista-productos.bc-grid>.lista-item .lista-item-acciones button{flex:1 1 0;min-width:0;padding:5px 4px;font-size:11px}',
        '#bc-product-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.68);box-sizing:border-box}',
        '#bc-product-modal.hidden{display:none!important}',
        '#bc-product-modal .bc-product-modal-dialog{width:min(720px,96vw);max-height:92vh;overflow:auto;background:var(--panel,#111);border:1px solid rgba(255,255,255,.14);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.45);padding:0}',
        '#bc-product-modal .bc-product-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.1);position:sticky;top:0;background:inherit;z-index:2}',
        '#bc-product-modal .bc-product-modal-head h3{margin:0}',
        '#bc-product-modal .bc-product-modal-close{border:0;background:transparent;color:inherit;font-size:28px;line-height:1;cursor:pointer;padding:2px 8px}',
        '#bc-product-modal #bc-product-form-host{padding:16px}',
        '#bc-product-modal #form-producto{display:block!important}',
        '#bc-product-modal #form-producto.hidden{display:block!important}',
        '@media(max-width:700px){#lista-productos.bc-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}#lista-productos.bc-grid>.lista-item{padding:7px}#bc-product-modal{padding:8px}#bc-product-modal .bc-product-modal-dialog{width:100%;max-height:96vh;border-radius:12px}}'
      ].join('');
      document.head.appendChild(style);
    }
  }

  function arreglarEdicionProducto() {}

  function asegurarAccesoGasto() {
    var tab = document.getElementById('tab-operacion');
    if (!tab || document.getElementById('bc-acceso-gasto')) return;
    var header = tab.querySelector('.pendientes-header');
    if (!header) return;
    var btn = document.createElement('button'); btn.id = 'bc-acceso-gasto'; btn.type = 'button'; btn.className = 'cc-accion'; btn.textContent = '💸 Registrar gasto';
    btn.addEventListener('click', function () {
      var form = document.getElementById('form-gasto-operativo');
      if (form) { form.scrollIntoView({ behavior: 'smooth', block: 'center' }); var input = document.getElementById('fin-g-concepto'); if (input) input.focus(); }
      else if (typeof setMsg === 'function') setMsg('msg-operacion', 'No tienes permiso para crear gastos o el módulo todavía está cargando.', false);
    });
    header.appendChild(btn);
  }

  function run() {
    unificarTurnos(); ocultarCompraEnProductos(); prepararNomenclatura(); fijarNomenclaturaSoloProductos(); limpiarInterfazAgregarProducto(); simplificarProductos(); arreglarEdicionProducto(); asegurarAccesoGasto();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(run, 1000); });
  else setTimeout(run, 1000);
})();
