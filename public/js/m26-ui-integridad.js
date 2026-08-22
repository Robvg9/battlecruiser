// BattleCruiser — M26 UI integridad post-pruebas
(function () {
  'use strict';

  function unificarTurnos() {
    // M21 usa técnicamente #tab-ciclos como panel real de Turnos y oculta
    // #tab-turnos. La UI no debe mostrar dos accesos.
    var real = document.getElementById('tab-ciclos');
    if (!real) return;
    document.querySelectorAll('.tab-btn[data-tab="turnos"]').forEach(function (b) { b.remove(); });
    var botonesCiclos = Array.from(document.querySelectorAll('.tab-btn[data-tab="ciclos"]'));
    botonesCiclos.slice(1).forEach(function (b) { b.remove(); });
    var btn = botonesCiclos[0];
    if (btn) btn.textContent = 'Turnos';
    // Todos los accesos internos a "Turnos" deben abrir el panel real.
    document.querySelectorAll('[data-ir-tab="turnos"], [data-tab="turnos"]').forEach(function (el) {
      if (el.classList && el.classList.contains('tab-btn')) return;
      el.setAttribute('data-ir-tab', 'ciclos');
    });
    // Nunca mostrar el panel legacy vacío.
    var legacy = document.getElementById('tab-turnos');
    if (legacy) legacy.style.display = 'none';
  }

  function ocultarCompraEnProductos() {
    var form = document.getElementById('form-compra');
    if (!form) return;
    var h = form.previousElementSibling;
    if (h && /^Registrar compra/i.test((h.textContent || '').trim())) h.remove();
    form.remove();
  }

  function asegurarUnaBusquedaProductos() {
    var panel = document.getElementById('tab-productos');
    if (!panel) return;
    var buscador = document.getElementById('productos-buscar');
    panel.querySelectorAll('input[placeholder*="Buscar"]').forEach(function (input) {
      if (input !== buscador && input.closest('#tab-productos')) {
        var wrap = input.closest('.productos-buscador-controles');
        if (wrap && wrap !== buscador?.parentElement) wrap.remove(); else input.remove();
      }
    });
    if (buscador) buscador.placeholder = 'Buscar productos…';
  }

  function protegerPaneles() {
    if (!document.getElementById('bc-m26-panel-style')) {
      var st = document.createElement('style');
      st.id = 'bc-m26-panel-style';
      st.textContent = '.tab-panel:not(.visible){display:none!important}.tab-panel.visible{display:block}.prod-nom-modal.hidden{display:none!important}';
      document.head.appendChild(st);
    }
  }

  function esconderNomenclaturaFueraDeProductos() {
    var ids = ['lista-categorias', 'lista-unidades', 'lista-presentaciones-catalogo', 'pp-lista-asociaciones'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var bloque = el.closest('.cc-bloque') || el.closest('.card') || el.closest('.presentaciones-catalogo') || el.closest('.presentaciones-producto');
      if (bloque && !bloque.closest('#productos-nomenclatura-modal')) bloque.style.display = 'none';
    });
  }

  function prepararNomenclaturaRobusta() {
    var modal = document.getElementById('productos-nomenclatura-modal');
    var btn = document.getElementById('productos-nomenclatura-btn');
    if (!modal || !btn) return;
    esconderNomenclaturaFueraDeProductos();
    if (btn.dataset.bcM26 === '1') return;
    btn.dataset.bcM26 = '1';
    btn.addEventListener('click', function () {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
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
        if (bloque && !slot.contains(bloque)) { bloque.style.display = ''; slot.appendChild(bloque); }
      });
    });
    var close = document.getElementById('productos-nomenclatura-cerrar');
    if (close) close.addEventListener('click', function () {
      modal.classList.add('hidden');
      modal.style.display = '';
      setTimeout(esconderNomenclaturaFueraDeProductos, 0);
    });
  }

  function arreglarAgregarProducto() {
    var form = document.getElementById('form-producto'), btn = document.getElementById('prod-submit-btn');
    if (!form || !btn || btn.dataset.bcM26 === '1') return;
    btn.dataset.bcM26 = '1';
    btn.addEventListener('click', function (e) {
      if (form.checkValidity()) return;
      e.preventDefault(); e.stopImmediatePropagation();
      var invalido = form.querySelector(':invalid');
      setMsg('msg-productos', 'Completa los campos obligatorios del producto, incluida la presentación minorista.', false);
      if (invalido) invalido.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, true);
  }

  function arreglarEdicionProducto() {
    var form = document.getElementById('form-producto');
    if (!form || form.dataset.bcM26Edit === '1') return;
    form.dataset.bcM26Edit = '1';
    form.addEventListener('submit', function () {
      var editando = document.getElementById('prod-editando-id');
      if (!editando || !editando.value) return;
      setTimeout(function () { if (typeof cancelarEdicionProducto === 'function') cancelarEdicionProducto(); }, 100);
    }, false);
  }

  function asegurarAccesoGasto() {
    var tab = document.getElementById('tab-operacion');
    if (!tab || document.getElementById('bc-acceso-gasto')) return;
    var header = tab.querySelector('.pendientes-header');
    if (!header) return;
    var btn = document.createElement('button');
    btn.id = 'bc-acceso-gasto'; btn.type = 'button'; btn.className = 'cc-accion'; btn.textContent = '💸 Registrar gasto';
    btn.addEventListener('click', function () {
      var form = document.getElementById('form-gasto-operativo');
      if (form) { form.scrollIntoView({ behavior: 'smooth', block: 'center' }); var input = document.getElementById('fin-g-concepto'); if (input) input.focus(); }
      else if (typeof setMsg === 'function') setMsg('msg-operacion', 'No tienes permiso para crear gastos o el módulo todavía está cargando.', false);
    });
    header.appendChild(btn);
  }

  function run() {
    unificarTurnos(); ocultarCompraEnProductos(); asegurarUnaBusquedaProductos(); protegerPaneles(); prepararNomenclaturaRobusta(); arreglarAgregarProducto(); arreglarEdicionProducto(); asegurarAccesoGasto();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(run, 2000); }); else setTimeout(run, 2000);
  setInterval(run, 3000);
})();
