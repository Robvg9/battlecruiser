// ==== BattleCruiser · js/compra-multiple.js ====
// Compra de proveedores (≠ transferencia interna).
// Proveedor → stock del almacén destino. Backend: registrar_compra_multiple / registrar_compra.
(function(){
  'use strict';

  function esc(v){
    if (typeof escHtml === 'function') return escHtml(v == null ? '' : String(v));
    return String(v ?? '').replace(/[&<>"']/g, function(c){
      return ({'&':'&','<':'<','>':'>','"':'"',"'":'&#39;'}[c]);
    });
  }
  function productos(){
    var rows = (typeof _cache !== 'undefined' && Array.isArray(_cache.productos)) ? _cache.productos : [];
    return typeof productosOperativos === 'function' ? productosOperativos(rows) : rows.filter(function(p){ return !p.inventario_mixto || !!p.producto_padre_id; });
  }
  function almacenes(){
    return (typeof _cache !== 'undefined' && Array.isArray(_cache.almacenes)) ? _cache.almacenes : [];
  }
  function msg(text, ok){
    var el = document.getElementById('compra-multiple-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = ok ? 'msg success' : 'msg error';
  }
  function fmtNumCompra(v){ return typeof window.numberFmt === 'function' ? window.numberFmt(v) : String(v == null ? 0 : v); }
  function moneyLocal(v){
    return typeof money === 'function' ? money(v) : Number(v || 0).toFixed(2);
  }

  async function presentacionesDeProducto(productoId){
    if (!productoId) return [];
    try {
      if (typeof cargarAsociacionesProducto === 'function') {
        var d = await cargarAsociacionesProducto(productoId);
        return Array.isArray(d) ? d.filter(function(x){ return x.activo !== false && x.presentacion_id && Number(x.factor) > 0; }) : [];
      }
      var data = await withCache('asociaciones:' + productoId, function(){
        return client.from('producto_presentaciones')
          .select('id,presentacion_id,factor,activo,presentaciones(nombre)')
          .eq('producto_id', productoId).eq('activo', true).order('created_at');
      });
      return Array.isArray(data) ? data.filter(function(x){ return x.presentacion_id && Number(x.factor) > 0; }) : [];
    } catch (e) {
      console.warn('[BattleCruiser] presentaciones compra:', e);
      return [];
    }
  }

  function injectStyles(){
    if (document.getElementById('bc-compras-flow-style')) return;
    var s = document.createElement('style');
    s.id = 'bc-compras-flow-style';
    s.textContent = [
      '#bc165-overlay .bc165-modal{width:min(760px,100%);max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;padding:12px}',
      '#bc165-overlay .bc165-head{position:sticky;top:-12px;z-index:5;margin:0 0 8px;padding:0 0 8px;background:var(--stone);border-bottom:1px solid var(--gold-dim)}',
      '#bc165-overlay .bc165-head h3{font-size:16px;line-height:1.2}',
      '#bc165-overlay #tab-compras{width:100%!important;max-width:none!important;margin:0!important;padding:0!important}',
      '#tab-compras .compra-multiple-panel,#tab-compras .seccion-principal{width:100%;max-width:none;margin:0!important;padding:0!important;min-width:0;box-sizing:border-box}',
      '#tab-compras .compra-cabecera{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:7px 8px;margin:0 0 8px}',
      '#tab-compras .compra-cabecera>div{min-width:0;margin:0}',
      '#tab-compras .compra-cabecera>div:nth-child(1){grid-column:1;grid-row:1}',
      '#tab-compras .compra-cabecera>div:nth-child(3){grid-column:2;grid-row:1}',
      '#tab-compras .compra-cabecera>div:nth-child(2){grid-column:1/-1;grid-row:2}',
      '#tab-compras .compra-cabecera label{display:block;margin:0 0 3px;font-size:11px;line-height:1.2}',
      '#tab-compras .compra-cabecera input,#tab-compras .compra-cabecera select{width:100%;min-width:0;min-height:36px;height:36px;margin:0;padding:7px 9px;font-size:13px;box-sizing:border-box}',
      '#tab-compras .compra-subtitulo{margin:8px 0 5px;font-size:14px;line-height:1.2}',
      '#tab-compras .compra-linea-editor{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) minmax(82px,.7fr) minmax(96px,.8fr) auto;gap:6px;align-items:center;margin:0 0 4px}',
      '#tab-compras .compra-linea-editor select,#tab-compras .compra-linea-editor input{width:100%;min-width:0;height:38px;min-height:38px;margin:0;padding:7px 8px;font-size:12px;box-sizing:border-box}',
      '#tab-compras #compra-multiple-add{height:38px;min-height:38px;margin:0;padding:7px 10px;white-space:nowrap;font-size:12px}',
      '#tab-compras #compra-multiple-pres-ayuda{margin:4px 0 6px;font-size:10.5px;line-height:1.25}',
      '#tab-compras #compra-multiple-lineas{margin:6px 0 0;padding:0;border:0}',
      '#tab-compras #compra-multiple-lineas .lista-estado{margin:5px 0;font-size:11px}',
      '#tab-compras #compra-multiple-lineas .lista-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center;margin:0!important;padding:7px 9px;border:1px solid var(--gold-dim);border-radius:7px;background:var(--void);font-size:12px}',
      '#tab-compras #compra-multiple-lineas .lista-item .muted{font-size:10.5px;line-height:1.25}',
      '#tab-compras #compra-multiple-lineas .lista-item button{min-height:30px;padding:5px 8px;font-size:11px}',
      '#tab-compras .compra-resumen-box{margin:7px 0 5px;padding:8px 10px;border:1px solid var(--gold-dim,#c9a24d33);border-radius:8px;background:var(--stone)}',
      '#tab-compras .compra-resumen-box .row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0;font-size:12px;line-height:1.25}',
      '#tab-compras .compra-footer{position:sticky;bottom:-12px;z-index:4;display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,.6fr);gap:8px;margin:7px 0 0;padding:8px 0 0;background:var(--stone);border-top:1px solid var(--gold-dim)}',
      '#tab-compras .compra-footer button{width:100%;min-height:38px;margin:0;padding:8px 10px;font-size:12px}',
      '#tab-compras #compra-multiple-msg{margin:6px 0 0;font-size:11px;line-height:1.3}',
      '@media(max-width:720px){#bc165-overlay .bc165-modal{width:100%;max-width:100%;padding:10px}#bc165-overlay .bc165-head{top:-10px}#tab-compras .compra-linea-editor{grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:6px}#tab-compras .compra-linea-editor #compra-multiple-add{grid-column:1/-1}}',
      '@media(max-width:380px){#tab-compras .compra-cabecera{grid-template-columns:minmax(0,1fr)}#tab-compras .compra-cabecera>div:nth-child(1),#tab-compras .compra-cabecera>div:nth-child(2),#tab-compras .compra-cabecera>div:nth-child(3){grid-column:1;grid-row:auto}#tab-compras .compra-linea-editor{grid-template-columns:minmax(0,1fr)}#tab-compras .compra-linea-editor>*{grid-column:1!important}}'
    ].join('');
    document.head.appendChild(s);
  }

  function init(){
    if (document.getElementById('tab-compras')) {
      // ya existe: reforzar wire si hace falta
      return;
    }
    var main = document.querySelector('.main-content');
    if (!main) return;

    injectStyles();

    var section = document.createElement('section');
    section.id = 'tab-compras';
    section.className = 'tab-panel';
    section.innerHTML =
      '<div class="seccion-cuerpo compra-multiple-panel">' +
        '<div class="seccion-principal">' +
          '<div class="inline-form compra-cabecera">' +
            '<div><label class="muted" for="compra-multiple-almacen">Almacén destino</label>' +
            '<select id="compra-multiple-almacen" required><option value="">Seleccionar almacén</option></select></div>' +
            '<div><label class="muted" for="compra-multiple-proveedor">Proveedor <span class="muted">(opcional)</span></label>' +
            '<input id="compra-multiple-proveedor" placeholder="Nombre del proveedor"></div>' +
            '<div><label class="muted" for="compra-multiple-fecha">Fecha</label>' +
            '<input id="compra-multiple-fecha" type="datetime-local"></div>' +
          '</div>' +
          '<h3 class="compra-subtitulo">Agregar productos</h3>' +
          '<div class="inline-form compra-linea-editor">' +
            '<select id="compra-multiple-producto" aria-label="Producto"><option value="">Producto</option></select>' +
            '<select id="compra-multiple-presentacion" aria-label="Unidad o presentación"><option value="">Unidad base</option></select>' +
            '<input id="compra-multiple-cantidad" type="number" min="0.0001" step="any" inputmode="decimal" placeholder="Cantidad" aria-label="Cantidad">' +
            '<input id="compra-multiple-costo" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Costo" aria-label="Costo por unidad o presentación">' +
            '<button type="button" id="compra-multiple-add">+ Añadir</button>' +
          '</div>' +
          '<p id="compra-multiple-pres-ayuda" class="muted">El costo corresponde a la unidad o presentación seleccionada.</p>' +
          '<div id="compra-multiple-lineas" class="lista"></div>' +
          '<div class="compra-resumen-box" id="compra-multiple-resumen">' +
            '<div class="row"><span id="compra-multiple-n-lineas">0 líneas</span><strong>Total · <span id="compra-multiple-total">$0.00</span></strong></div>' +
          '</div>' +
          '<div class="btn-row compra-footer">' +
            '<button type="button" id="compra-multiple-confirmar">Registrar compra</button>' +
            '<button type="button" id="compra-multiple-limpiar" class="cc-accion">Limpiar</button>' +
          '</div>' +
          '<p id="compra-multiple-msg" class="msg" role="status" aria-live="polite"></p>' +
        '</div>' +
      '</div>';
    main.appendChild(section);

    var almacen = document.getElementById('compra-multiple-almacen');
    var proveedor = document.getElementById('compra-multiple-proveedor');
    var fecha = document.getElementById('compra-multiple-fecha');
    var producto = document.getElementById('compra-multiple-producto');
    var presentacion = document.getElementById('compra-multiple-presentacion');
    var cantidad = document.getElementById('compra-multiple-cantidad');
    var costo = document.getElementById('compra-multiple-costo');
    var ayuda = document.getElementById('compra-multiple-pres-ayuda');
    var lista = document.getElementById('compra-multiple-lineas');
    var total = document.getElementById('compra-multiple-total');
    var nLineas = document.getElementById('compra-multiple-n-lineas');
    var confirmar = document.getElementById('compra-multiple-confirmar');
    var limpiar = document.getElementById('compra-multiple-limpiar');
    var lineas = [];
    var presActual = [];

    fecha.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    function poblar(){
      var av = almacen.value, pv = producto.value;
      almacen.innerHTML = '<option value="">Almacén de destino</option>' +
        almacenes().filter(function(a){ return a.activo !== false; }).map(function(a){
          return '<option value="' + esc(a.id) + '">' + esc(a.nombre) + '</option>';
        }).join('');
      producto.innerHTML = '<option value="">Producto</option>' +
        productos().filter(function(p){ return p.activo !== false; }).map(function(p){
          return '<option value="' + esc(p.id) + '">' + esc(p.nombre) + '</option>';
        }).join('');
      if (av) almacen.value = av;
      if (pv) producto.value = pv;
    }

    function actualizarCamposPresentacion(){
      var seleccion = presActual.find(function(x){ return x.presentacion_id === presentacion.value; });
      if (seleccion) {
        var nom = (seleccion.presentaciones && seleccion.presentaciones.nombre) || 'presentación';
        cantidad.placeholder = 'Cantidad de ' + nom;
        costo.placeholder = 'Costo por ' + nom;
        ayuda.textContent = nom + ' = ' + Number(seleccion.factor) + ' unidades base. El costo se registra por ' + nom + '.';
      } else {
        cantidad.placeholder = 'Cantidad en unidades';
        costo.placeholder = 'Costo por unidad';
        ayuda.textContent = presActual.length
          ? 'Sin presentación: se registra en unidades base.'
          : 'Sin presentaciones asociadas: unidades base.';
      }
    }

    async function cargarPresentaciones(){
      var pid = producto.value;
      presentacion.disabled = true;
      presentacion.innerHTML = '<option value="">Cargando…</option>';
      presActual = await presentacionesDeProducto(pid);
      presentacion.innerHTML = '<option value="">Unidad base</option>' +
        presActual.map(function(p){
          var nom = (p.presentaciones && p.presentaciones.nombre) || 'Presentación';
          return '<option value="' + esc(p.presentacion_id) + '">' + esc(nom) + ' · ×' + Number(p.factor) + '</option>';
        }).join('');
      presentacion.disabled = false;
      actualizarCamposPresentacion();
    }

    function render(){
      lista.innerHTML = lineas.length
        ? lineas.map(function(l, i){
            var etiqueta = l.presentacion_nombre
              ? (fmtNumCompra(l.cantidad_presentacion) + ' × ' + esc(l.presentacion_nombre))
              : (fmtNumCompra(l.cantidad) + ' unidades');
            var subtotal = (l.cantidad_documento * l.costo).toFixed(2);
            return '<div class="lista-item"><span><strong>' + esc(l.nombre) + '</strong>' +
              '<span class="muted"> · ' + etiqueta + ' · costo $' + moneyLocal(l.costo) + ' · $' + subtotal + '</span></span>' +
              '<button type="button" data-compra-remove="' + i + '">Eliminar</button></div>';
          }).join('')
        : '<p class="lista-estado">Todavía no hay productos en esta compra.</p>';
      var tot = lineas.reduce(function(s, l){ return s + l.cantidad_documento * l.costo; }, 0);
      total.textContent = '$' + moneyLocal(tot);
      if (nLineas) nLineas.textContent = fmtNumCompra(lineas.length) + (lineas.length === 1 ? ' línea' : ' líneas');
    }

    function add(){
      var p = productos().find(function(x){ return String(x.id) === String(producto.value); });
      var q = Number(cantidad.value);
      var c = Number(costo.value);
      var pres = presActual.find(function(x){ return x.presentacion_id === presentacion.value; });
      if (!p || !Number.isFinite(q) || q <= 0 || !Number.isFinite(c) || c < 0) {
        msg('Seleccioná producto y escribí cantidad/costo válidos.', false);
        return;
      }
      if (pres && !(Number(pres.factor) > 0)) {
        msg('La presentación no tiene factor válido.', false);
        return;
      }
      var key = p.id + '::' + (pres ? pres.presentacion_id : 'base');
      var existente = lineas.find(function(x){ return x.key === key; });
      if (existente) {
        existente.cantidad_documento += q;
        if (pres) existente.cantidad_presentacion = (Number(existente.cantidad_presentacion) || 0) + q;
        else existente.cantidad = (Number(existente.cantidad) || 0) + q;
      } else {
        lineas.push({
          key: key,
          producto_id: p.id,
          nombre: p.nombre,
          cantidad: pres ? null : q,
          cantidad_presentacion: pres ? q : null,
          cantidad_documento: q,
          presentacion_id: pres ? pres.presentacion_id : null,
          presentacion_nombre: pres && pres.presentaciones ? pres.presentaciones.nombre : null,
          factor: pres ? Number(pres.factor) : 1,
          costo: c
        });
      }
      cantidad.value = '';
      costo.value = '';
      msg('', true);
      render();
    }

    function mapLineasPayload(){
      return lineas.map(function(l){
        return {
          producto_id: l.producto_id,
          cantidad: l.cantidad,
          costo_unitario: l.costo,
          presentacion_id: l.presentacion_id,
          cantidad_presentacion: l.cantidad_presentacion
        };
      });
    }

    async function confirmarCompra(){
      if (!almacen.value) { msg('Seleccioná el almacén de destino.', false); return; }
      if (!lineas.length) { msg('Agregá al menos un producto.', false); return; }

      var tot = lineas.reduce(function(s, l){ return s + l.cantidad_documento * l.costo; }, 0);
      if (!window.confirm('¿Confirmar compra por $' + moneyLocal(tot) + ' al almacén seleccionado? Esto suma stock real.')) return;

      confirmar.disabled = true;
      msg('Registrando compra…', true);

      var payloadMultiple = {
        p_almacen_id: almacen.value,
        p_proveedor: (proveedor.value || '').trim() || null,
        p_fecha: fecha.value ? new Date(fecha.value).toISOString() : new Date().toISOString(),
        p_lineas: mapLineasPayload()
      };

      try {
        // Preferir cola offline unificada si está mapeada compra_multiple
        if (typeof ejecutarOperacion === 'function' && typeof RPC_POR_TIPO !== 'undefined' && RPC_POR_TIPO.compra_multiple) {
          var r = await ejecutarOperacion('compra_multiple', payloadMultiple);
          if (!r.ok) throw (r.error || new Error('No se pudo registrar'));
          lineas = [];
          render();
          if (r.offline) {
            msg('✓ Compra guardada localmente — se sincronizará al recuperar conexión.', true);
          } else {
            msg('✓ Compra registrada. Stock actualizado.', true);
            if (typeof window.bcNotificarCambioDatos === 'function') window.bcNotificarCambioDatos('compra', false);
            if (typeof refrescarStockYSelects === 'function') await refrescarStockYSelects();
          }
          return;
        }

        // Online: RPC atómica registrar_compra_multiple
        if (navigator.onLine) {
          var key = crypto.randomUUID();
          var res = await client.rpc('registrar_compra_multiple', Object.assign({}, payloadMultiple, { p_idempotency_key: key }));
          if (res.error) {
            var em = String((res.error && res.error.message) || res.error.code || 'error');
            if (typeof esErrorDeRed === 'function' && esErrorDeRed(res.error)) {
              throw new Error('No se pudo guardar la lista completa. No se registró ningún producto; revisa la conexión y vuelve a intentar.');
            }
            if (/could not find|42883|does not exist/i.test(em)) {
              throw new Error('No está disponible el registro de compras por lista. No se registró ningún producto.');
            }
            throw res.error;
          }
          lineas = [];
          render();
          msg('✓ Compra registrada. Stock actualizado.', true);
          if (typeof window.bcNotificarCambioDatos === 'function') window.bcNotificarCambioDatos('compra', false);
          if (typeof refrescarStockYSelects === 'function') await refrescarStockYSelects();
          return;
        }

        throw new Error('Sin conexión y sin cola para guardar la lista completa. No se registró ningún producto.');
      } catch (e) {
        msg('No se pudo registrar la compra: ' +
          (typeof explicarError === 'function' ? explicarError(e, 'registrar compra') : (e && e.message) || 'error'), false);
      } finally {
        confirmar.disabled = false;
      }
    }

    document.getElementById('compra-multiple-add').addEventListener('click', add);
    producto.addEventListener('change', cargarPresentaciones);
    presentacion.addEventListener('change', actualizarCamposPresentacion);
    [cantidad, costo].forEach(function(el){
      el.addEventListener('keydown', function(e){
        if (e.key === 'Enter') { e.preventDefault(); add(); }
      });
    });
    lista.addEventListener('click', function(e){
      var b = e.target.closest('[data-compra-remove]');
      if (b) { lineas.splice(Number(b.dataset.compraRemove), 1); render(); }
    });
    limpiar.addEventListener('click', function(){
      lineas = [];
      proveedor.value = '';
      fecha.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      producto.value = '';
      presentacion.innerHTML = '<option value="">Unidad base</option>';
      presActual = [];
      actualizarCamposPresentacion();
      msg('', true);
      render();
    });
    confirmar.addEventListener('click', confirmarCompra);

    async function cargarDatosYRender(){
      if (typeof cargarAlmacenes === 'function' && !almacenes().length) {
        try { var a = await cargarAlmacenes(); if (Array.isArray(a)) _cache.almacenes = a; } catch (e) {}
      }
      if (typeof cargarProductos === 'function' && !productos().length) {
        try { var p = await cargarProductos(); if (Array.isArray(p)) _cache.productos = p; } catch (e) {}
      }
      poblar();
      render();
      if (producto.value) await cargarPresentaciones();
    }
    // La única entrada visible es Movimientos → Nueva compra.
    // El modal llama este hook al abrir para cargar solo los catálogos del formulario.
    if (!window.__BC_COMPRA_DATA_EVENTS__) {
      window.__BC_COMPRA_DATA_EVENTS__ = true;
      var compraRefreshTimer = null;
      window.addEventListener('bc:data-changed', function (event) {
        var detail = event.detail || {};
        var domains = detail.domains || [];
        if (detail.offline || !['stock', 'inventory', 'products', 'categories', 'warehouses'].some(function (domain) {
          return domains.indexOf(domain) >= 0;
        })) return;
        var openPanel = document.querySelector('#bc165-overlay #tab-compras.bc175-active');
        if (!openPanel) return;
        if (!detail.remote && detail.operation === 'compra') return;
        window.clearTimeout(compraRefreshTimer);
        compraRefreshTimer = window.setTimeout(async function () {
          try {
            if (typeof window.refrescarStockYSelects === 'function') await window.refrescarStockYSelects();
            await cargarDatosYRender();
          } catch (error) {
            console.warn('[BattleCruiser] No se pudo actualizar el catálogo de Nueva Compra:', error);
          }
        }, 180);
      });
    }
    window.__BC_COMPRAS_ACTIVAR = cargarDatosYRender;

    poblar();
    render();
    actualizarCamposPresentacion();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
