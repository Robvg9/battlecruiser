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
    return (typeof _cache !== 'undefined' && Array.isArray(_cache.productos)) ? _cache.productos : [];
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
      '#tab-compras .compra-flow-banner{margin:0 0 14px;padding:12px 14px;border-radius:10px;border:1px solid rgba(201,162,77,.28);background:rgba(12,28,24,.55)}',
      '#tab-compras .compra-flow-banner strong{color:var(--gold,#c9a24d)}',
      '#tab-compras .compra-flow-banner p{margin:4px 0 0;font-size:12.5px;color:var(--mist);line-height:1.4}',
      '#tab-compras .compra-cabecera{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px}',
      '@media(max-width:800px){#tab-compras .compra-cabecera{grid-template-columns:1fr}}',
      '#tab-compras .compra-linea-editor{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}',
      '#tab-compras .compra-resumen-box{margin:12px 0;padding:12px;border:1px solid var(--gold-dim,#c9a24d33);border-radius:10px;background:var(--stone)}',
      '#tab-compras .compra-resumen-box .row{display:flex;justify-content:space-between;gap:8px;font-size:13px;margin:4px 0}',
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
      '<div class="compra-flow-banner">' +
        '<strong>Compra de proveedor</strong>' +
        '<p>Mercancía que entra desde un proveedor al stock de un almacén. ' +
        'No es una transferencia entre almacenes (eso está en <em>Transferencias</em>).</p>' +
      '</div>' +
      '<div class="seccion-cuerpo compra-multiple-panel">' +
        '<div class="seccion-principal">' +
          '<h2>Registrar compra</h2>' +
          '<p class="muted">Proveedor → BattleCruiser → almacén destino. Podés agregar varias líneas y confirmar una sola vez.</p>' +
          '<div class="inline-form compra-cabecera">' +
            '<div><label class="muted" for="compra-multiple-almacen">Almacén destino</label>' +
            '<select id="compra-multiple-almacen" required><option value="">Almacén de destino</option></select></div>' +
            '<div><label class="muted" for="compra-multiple-proveedor">Proveedor</label>' +
            '<input id="compra-multiple-proveedor" placeholder="Nombre del proveedor (opcional)"></div>' +
            '<div><label class="muted" for="compra-multiple-fecha">Fecha</label>' +
            '<input id="compra-multiple-fecha" type="datetime-local"></div>' +
          '</div>' +
          '<h3>Líneas de la compra</h3>' +
          '<div class="inline-form compra-linea-editor">' +
            '<select id="compra-multiple-producto"><option value="">Producto</option></select>' +
            '<select id="compra-multiple-presentacion"><option value="">Unidad / presentación</option></select>' +
            '<input id="compra-multiple-cantidad" type="number" min="0.0001" step="any" inputmode="decimal" placeholder="Cantidad">' +
            '<input id="compra-multiple-costo" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Costo">' +
            '<button type="button" id="compra-multiple-add">+ Agregar</button>' +
          '</div>' +
          '<p id="compra-multiple-pres-ayuda" class="muted">Elegí presentación (caja, paquete…) o unidad base. El costo es por la unidad elegida.</p>' +
          '<div id="compra-multiple-lineas" class="lista"></div>' +
          '<div class="compra-resumen-box" id="compra-multiple-resumen">' +
            '<div class="row"><span>Líneas</span><strong id="compra-multiple-n-lineas">0</strong></div>' +
            '<div class="row"><span>Total compra</span><strong id="compra-multiple-total">$0.00</strong></div>' +
          '</div>' +
          '<div class="btn-row">' +
            '<button type="button" id="compra-multiple-confirmar">Confirmar compra</button>' +
            '<button type="button" id="compra-multiple-limpiar" class="cc-accion">Limpiar</button>' +
          '</div>' +
          '<p id="compra-multiple-msg" class="msg"></p>' +
          '<div class="rule-orn" style="margin:18px 0"></div>' +
          '<h3>Últimas compras</h3>' +
          '<div id="compra-multiple-historial" class="lista"><p class="lista-estado muted">Se actualiza al abrir esta pestaña.</p></div>' +
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
    var historialEl = document.getElementById('compra-multiple-historial');
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
              ? (l.cantidad_presentacion + ' × ' + esc(l.presentacion_nombre))
              : (l.cantidad + ' unidades');
            var subtotal = (l.cantidad_documento * l.costo).toFixed(2);
            return '<div class="lista-item"><span><strong>' + esc(l.nombre) + '</strong>' +
              '<span class="muted"> · ' + etiqueta + ' · costo $' + moneyLocal(l.costo) + ' · $' + subtotal + '</span></span>' +
              '<button type="button" data-compra-remove="' + i + '">Eliminar</button></div>';
          }).join('')
        : '<p class="lista-estado">Todavía no hay productos en esta compra.</p>';
      var tot = lineas.reduce(function(s, l){ return s + l.cantidad_documento * l.costo; }, 0);
      total.textContent = '$' + moneyLocal(tot);
      if (nLineas) nLineas.textContent = String(lineas.length);
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

    async function cargarHistorial(){
      if (!historialEl) return;
      historialEl.innerHTML = '<p class="lista-estado">Cargando historial…</p>';
      try {
        if (!navigator.onLine) {
          historialEl.innerHTML = '<p class="lista-estado">Sin conexión: el historial de compras requiere red.</p>';
          return;
        }
        var res = await client.from('compras')
          .select('id, fecha, total, proveedor, almacenes(nombre)')
          .order('fecha', { ascending: false })
          .limit(15);
        if (res.error) {
          // Tabla puede no estar expuesta por RLS: degradar sin romper
          historialEl.innerHTML = '<p class="lista-estado muted">Historial no disponible en este dispositivo.</p>';
          return;
        }
        var rows = res.data || [];
        if (!rows.length) {
          historialEl.innerHTML = '<p class="lista-estado">Todavía no hay compras registradas.</p>';
          return;
        }
        historialEl.innerHTML = '';
        rows.forEach(function(c){
          var div = document.createElement('div');
          div.className = 'lista-item';
          var alm = c.almacenes && c.almacenes.nombre ? c.almacenes.nombre : '—';
          var prov = c.proveedor || 'Sin proveedor';
          var fec = c.fecha && typeof fechaCorta === 'function' ? fechaCorta(c.fecha) : (c.fecha || '');
          div.innerHTML = '<span>' + esc(prov) + ' <span class="muted">· ' + esc(alm) + '</span></span>' +
            '<span class="muted">' + esc(fec) + ' · $' + moneyLocal(c.total) + '</span>';
          historialEl.appendChild(div);
        });
      } catch (e) {
        historialEl.innerHTML = '<p class="lista-estado muted">No se pudo cargar el historial.</p>';
      }
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
            if (typeof refrescarStockYSelects === 'function') await refrescarStockYSelects();
            await cargarHistorial();
          }
          return;
        }

        // Online: RPC atómica registrar_compra_multiple
        if (navigator.onLine) {
          var key = crypto.randomUUID();
          var res = await client.rpc('registrar_compra_multiple', Object.assign({}, payloadMultiple, { p_idempotency_key: key }));
          if (res.error) {
            // Fallback: líneas con registrar_compra (ejecutarOperacion)
            if (typeof esErrorDeRed === 'function' && esErrorDeRed(res.error) && typeof ejecutarOperacion === 'function') {
              await confirmarLineaALinea();
              return;
            }
            // Si el RPC múltiple no existe, línea a línea
            var em = String((res.error && res.error.message) || '');
            if (/could not find|42883|does not exist/i.test(em) && typeof ejecutarOperacion === 'function') {
              await confirmarLineaALinea();
              return;
            }
            throw res.error;
          }
          lineas = [];
          render();
          msg('✓ Compra registrada. Stock actualizado.', true);
          if (typeof refrescarStockYSelects === 'function') await refrescarStockYSelects();
          await cargarHistorial();
          return;
        }

        // Offline sin mapping múltiple: línea a línea en cola
        if (typeof ejecutarOperacion === 'function') {
          await confirmarLineaALinea();
          return;
        }
        throw new Error('Sin conexión y sin cola offline disponible.');
      } catch (e) {
        msg('No se pudo registrar la compra: ' +
          (typeof explicarError === 'function' ? explicarError(e, 'registrar compra') : (e && e.message) || 'error'), false);
      } finally {
        confirmar.disabled = false;
      }
    }

    async function confirmarLineaALinea(){
      var fallos = 0;
      var offlineAlguno = false;
      for (var i = 0; i < lineas.length; i++) {
        var l = lineas[i];
        var r = await ejecutarOperacion('compra', {
          p_producto_id: l.producto_id,
          p_almacen_id: almacen.value,
          p_cantidad: l.presentacion_id ? (Number(l.cantidad_presentacion) * Number(l.factor || 1)) : l.cantidad,
          p_costo_unitario: l.costo,
          p_presentacion_id: l.presentacion_id,
          p_cantidad_presentacion: l.cantidad_presentacion
        });
        // Nota: registrar_compra espera cantidad base o presentacion; el payload de productos.js usa ambos.
        if (!r.ok) fallos++;
        if (r.offline) offlineAlguno = true;
      }
      if (fallos) {
        msg('Algunas líneas no se registraron (' + fallos + '). Revisá pendientes.', false);
      } else if (offlineAlguno) {
        lineas = [];
        render();
        msg('✓ Compra encolada offline — se sincronizará al recuperar conexión.', true);
      } else {
        lineas = [];
        render();
        msg('✓ Compra registrada (línea a línea). Stock actualizado.', true);
        if (typeof refrescarStockYSelects === 'function') await refrescarStockYSelects();
        await cargarHistorial();
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
      await cargarHistorial();
    }
    // La única entrada visible es Movimientos → Nueva compra.
    // El modal llama este hook cada vez que abre el panel para cargar catálogos e historial.
    window.__BC_COMPRAS_ACTIVAR = cargarDatosYRender;

    poblar();
    render();
    actualizarCamposPresentacion();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
