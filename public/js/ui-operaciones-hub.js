// BattleCruiser — Operaciones Hub (v9.2.37)
// 6 tarjetas. Listas de responsabilidades/incidencias solo dentro de modal.
// Sin "Ver movimientos". Sin bloques legacy visibles debajo.
// M12-FE.7: cards + guards RPC solo con *.crear (ver no ejecuta).
(function () {
  'use strict';
  var MODAL_ID = 'bc-op-modal';
  var HUB_ID = 'bc-op-hub';
  var HUB_VER = '40';
  function can(s, a) { return typeof tienePermiso === 'function' && tienePermiso(s, a); }
  /** Defensa en profundidad: ver NUNCA basta para crear. */
  function requireCrear(seccion) {
    if (can(seccion, 'crear')) return true;
    return false;
  }
  function esc(v) { return typeof escHtml === 'function' ? escHtml(v) : String(v == null ? '' : v); }
  function key() { return crypto.randomUUID(); }
  function products() { return Array.isArray(window._cache && window._cache.productos) ? window._cache.productos.filter(function (p) { return p.activo !== false; }) : []; }
  function stores() { return Array.isArray(window._cache && window._cache.almacenes) ? window._cache.almacenes.filter(function (a) { return a.activo !== false; }) : []; }
  function productOpts() { return '<option value="">Seleccionar producto…</option>' + products().map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.nombre) + '</option>'; }).join(''); }
  function storeOpts(optional) { return '<option value="">' + (optional ? 'Almacén (opcional)' : 'Seleccionar almacén…') + '</option>' + stores().map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.nombre) + '</option>'; }).join(''); }

  function injectCss() {
    if (document.getElementById('bc-op-hub-css')) return;
    var s = document.createElement('style');
    s.id = 'bc-op-hub-css';
    s.textContent = [
      '#tab-operacion.bc-ophub > .pendientes-header{display:none!important}',
      '#tab-operacion.bc-ophub > .muted:first-of-type{display:none!important}',
      '#tab-operacion.bc-ophub #finanzas-operativas,#tab-operacion.bc-ophub #admin-solicitudes{display:none!important}',
      '#tab-operacion.bc-ophub > .cc-bloque{display:none!important}',
      '#tab-operacion.bc-ophub #fin-historial{display:none!important}',
      '#tab-operacion.bc-ophub #' + HUB_ID + '{display:block!important}',
      '.op-hero{margin-bottom:16px}',
      '.op-hero h2{margin:0;font-family:Cormorant Garamond,serif;font-size:1.75rem;font-weight:600;color:var(--text)}',
      '.op-hero p{margin:6px 0 0;font-size:13px;color:var(--mist);max-width:520px;line-height:1.45}',
      '.op-grid{display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:12px}',
      '@media(min-width:560px){.op-grid{grid-template-columns:1fr 1fr}}',
      '@media(min-width:900px){.op-grid{grid-template-columns:1fr 1fr 1fr}}',
      '.op-card{display:flex;flex-direction:column;gap:10px;padding:18px 16px;border-radius:14px;border:1px solid rgba(201,162,77,.16);background:rgba(12,28,24,.55);cursor:pointer;transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease;text-align:left;min-height:150px}',
      '.op-card:hover{transform:translateY(-2px);border-color:rgba(201,162,77,.35);box-shadow:0 10px 28px rgba(0,0,0,.25)}',
      '.op-card-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;background:rgba(201,162,77,.1)}',
      '.op-card h3{margin:0;font-family:Cormorant Garamond,serif;font-size:1.2rem;font-weight:600;color:var(--text)}',
      '.op-card p{margin:0;flex:1;font-size:12.5px;line-height:1.4;color:var(--mist)}',
      '.op-card .op-go{align-self:flex-start;margin-top:4px;padding:8px 12px;border-radius:8px;font-size:12.5px;font-weight:600;border:none;cursor:pointer}',
      '.op-card.tone-gold .op-go{background:linear-gradient(180deg,var(--gold-bright),var(--gold));color:#211605}',
      '.op-card.tone-red .op-go{background:rgba(180,60,60,.85);color:#fff}',
      '.op-card.tone-green .op-go{background:rgba(50,140,90,.9);color:#fff}',
      '.op-card.tone-blue .op-go{background:rgba(50,90,160,.9);color:#fff}',
      '.op-card.tone-purple .op-go{background:rgba(100,60,160,.9);color:#fff}',
      '.op-hint{text-align:center;font-size:12.5px;color:var(--mist);margin:0 0 8px}',
      '#' + MODAL_ID + '-backdrop{position:fixed;inset:0;background:rgba(4,12,10,.72);z-index:9000;display:flex;align-items:flex-end;justify-content:center;padding:12px}',
      '@media(min-width:640px){#' + MODAL_ID + '-backdrop{align-items:center;padding:24px}}',
      '#' + MODAL_ID + '{width:100%;max-width:480px;max-height:90vh;overflow:auto;background:linear-gradient(180deg,rgba(16,36,32,.98),rgba(10,24,20,.98));border:1px solid rgba(201,162,77,.22);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.45)}',
      '.op-modal-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(201,162,77,.14)}',
      '.op-modal-head h3{margin:0;font-family:Cormorant Garamond,serif;font-size:1.2rem;font-weight:600;color:var(--text)}',
      '.op-modal-x{background:transparent;border:none;color:var(--mist);font-size:22px;cursor:pointer;padding:4px 8px;border-radius:8px}',
      '.op-modal-body{padding:16px;display:flex;flex-direction:column;gap:12px}',
      '.op-modal-body .field{display:flex;flex-direction:column;gap:5px}',
      '.op-modal-body .field > span{font-size:12px;color:var(--mist)}',
      '.op-modal-body input,.op-modal-body select,.op-modal-body textarea{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid rgba(201,162,77,.2);background:var(--void);color:var(--text);font-size:14px}',
      '.op-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px 16px;border-top:1px solid rgba(201,162,77,.1)}',
      '.op-modal-foot .op-cancel{background:transparent;border:1px solid rgba(201,162,77,.25);color:var(--text);padding:10px 14px;border-radius:10px;cursor:pointer}',
      '.op-modal-foot .op-submit{padding:10px 16px;border-radius:10px;border:none;font-weight:600;cursor:pointer}',
      '.op-modal-foot .op-submit:disabled{opacity:.55;cursor:wait}',
      '.op-msg{font-size:13px;min-height:1.2em}',
      '.op-msg.ok{color:#9dcc9a}',
      '.op-msg.err{color:#e8a0a0}',
      '.op-steps{display:flex;flex-direction:column;gap:10px}',
      '.op-step{display:grid;grid-template-columns:28px 1fr;gap:10px;align-items:start}',
      '.op-step-n{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;background:rgba(201,162,77,.15);color:var(--gold)}',
      '.op-tabs{display:flex;gap:6px;margin-bottom:4px}',
      '.op-tab{flex:1;padding:9px 10px;border-radius:10px;border:1px solid rgba(201,162,77,.2);background:transparent;color:var(--mist);font-size:13px;cursor:pointer}',
      '.op-tab.active{background:rgba(201,162,77,.12);color:var(--gold-bright);border-color:rgba(201,162,77,.35);font-weight:600}',
      '.op-list-box{max-height:240px;overflow:auto;border:1px solid rgba(201,162,77,.12);border-radius:12px;padding:8px}',
      '.op-list-box .lista-item,.op-list-box .rep-fila{margin:0 0 8px;padding:10px;border-radius:10px;background:rgba(8,20,17,.5);font-size:13px}',
      '.op-list-empty{text-align:center;padding:20px 10px;color:var(--mist);font-size:13px}',
      'body.bc-op-modal-open{overflow:hidden}'
    ].join('');
    document.head.appendChild(s);
  }

  function closeModal() {
    var back = document.getElementById(MODAL_ID + '-backdrop');
    if (back) back.remove();
    document.body.classList.remove('bc-op-modal-open');
  }

  function openModal(opts) {
    closeModal();
    document.body.classList.add('bc-op-modal-open');
    var back = document.createElement('div');
    back.id = MODAL_ID + '-backdrop';
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');
    var foot = opts.hideSubmit
      ? '<div class="op-modal-foot"><button type="button" class="op-cancel">Cerrar</button></div>'
      : '<div class="op-modal-foot"><button type="button" class="op-cancel">Cancelar</button><button type="button" class="op-submit" style="background:' + (opts.submitBg || 'linear-gradient(180deg,var(--gold-bright),var(--gold))') + ';color:' + (opts.submitColor || '#211605') + '">' + esc(opts.submitText || 'Confirmar') + '</button></div>';
    back.innerHTML =
      '<div id="' + MODAL_ID + '">' +
      '<div class="op-modal-head"><h3>' + (opts.icon || '') + ' ' + esc(opts.title) + '</h3>' +
      '<button type="button" class="op-modal-x" aria-label="Cerrar">×</button></div>' +
      '<div class="op-modal-body">' + opts.bodyHtml + '<p class="op-msg" id="op-modal-msg"></p></div>' +
      foot + '</div>';
    document.body.appendChild(back);
    back.querySelector('.op-modal-x').onclick = closeModal;
    back.querySelector('.op-cancel').onclick = closeModal;
    back.addEventListener('click', function (e) { if (e.target === back) closeModal(); });
    var submit = back.querySelector('.op-submit');
    if (submit && opts.onSubmit) {
      submit.onclick = async function () {
        var msg = document.getElementById('op-modal-msg');
        submit.disabled = true;
        try {
          await opts.onSubmit(function (text, ok) {
            if (msg) { msg.textContent = text; msg.className = 'op-msg ' + (ok ? 'ok' : 'err'); }
          });
        } catch (err) {
          if (msg) { msg.textContent = String(err && (err.message || err.details) || err); msg.className = 'op-msg err'; }
          submit.disabled = false;
          return;
        }
        submit.disabled = false;
      };
    }
    if (opts.afterOpen) opts.afterOpen(back);
    var first = back.querySelector('input,select,textarea');
    if (first) setTimeout(function () { first.focus(); }, 50);
  }

  async function rpc(name, params) {
    var r = await client.rpc(name, params || {});
    if (r.error) throw r.error;
    return r.data;
  }

  function openGasto() {
    if (!requireCrear('gastos')) return;
    openModal({
      icon: '💸', title: 'Registrar gasto', submitText: 'Enviar a aprobación',
      bodyHtml:
        '<div class="field"><span>Motivo / concepto</span><input id="op-g-concepto" placeholder="Ej. Compra de materiales" required></div>' +
        '<div class="field"><span>Monto</span><input id="op-g-monto" type="number" min="0.01" step="0.01" placeholder="0.00" required></div>' +
        '<div class="field"><span>Descripción (opcional)</span><input id="op-g-desc" placeholder="Detalle breve"></div>' +
        '<div class="field"><span>Almacén (opcional)</span><select id="op-g-alm">' + storeOpts(true) + '</select></div>' +
        '<p class="muted" style="margin:0;font-size:12px">No descuenta caja hasta ser aprobado.</p>',
      onSubmit: async function (setMsg) {
        if (!requireCrear('gastos')) { setMsg('Sin permiso para registrar gastos.', false); throw new Error('permiso'); }
        var concepto = document.getElementById('op-g-concepto').value.trim();
        var monto = Number(document.getElementById('op-g-monto').value);
        if (!concepto || !(monto > 0)) { setMsg('Completá concepto y monto válido.', false); throw new Error('validación'); }
        await rpc('crear_gasto', { p_concepto: concepto, p_monto: monto, p_descripcion: document.getElementById('op-g-desc').value || null, p_almacen_id: document.getElementById('op-g-alm').value || null, p_idempotency_key: key() });
        setMsg('✓ Gasto enviado a aprobación.', true);
        if (typeof refrescarAprobacionesAdmin === 'function') refrescarAprobacionesAdmin();
        if (typeof refrescarFinanzas === 'function') refrescarFinanzas();
        setTimeout(closeModal, 900);
      }
    });
  }

  function openMerma() {
    if (!requireCrear('mermas')) return;
    openModal({
      icon: '📦', title: 'Registrar merma', submitText: 'Enviar a revisión',
      submitBg: 'rgba(180,60,60,.9)', submitColor: '#fff',
      bodyHtml:
        '<div class="field"><span>Almacén</span><select id="op-m-alm" required>' + storeOpts(false) + '</select></div>' +
        '<div class="field"><span>Producto</span><select id="op-m-prod" required>' + productOpts() + '</select></div>' +
        '<div class="field"><span>Cantidad</span><input id="op-m-cant" type="number" min="0.001" step="any" placeholder="0" required></div>' +
        '<div class="field"><span>Motivo</span><input id="op-m-motivo" placeholder="Motivo de la merma" required></div>' +
        '<p class="muted" style="margin:0;font-size:12px">El stock no cambia hasta aprobación administrativa.</p>',
      onSubmit: async function (setMsg) {
        if (!requireCrear('mermas')) { setMsg('Sin permiso para registrar mermas.', false); throw new Error('permiso'); }
        var alm = document.getElementById('op-m-alm').value;
        var prod = document.getElementById('op-m-prod').value;
        var cant = Number(document.getElementById('op-m-cant').value);
        var motivo = document.getElementById('op-m-motivo').value.trim();
        if (!alm || !prod || !(cant > 0) || !motivo) { setMsg('Completá todos los campos.', false); throw new Error('validación'); }
        await rpc('crear_merma', { p_almacen_id: alm, p_producto_id: prod, p_cantidad: cant, p_motivo: motivo, p_idempotency_key: key() });
        setMsg('✓ Solicitud enviada a revisión.', true);
        if (typeof refrescarAprobacionesAdmin === 'function') refrescarAprobacionesAdmin();
        if (typeof refrescarFinanzas === 'function') refrescarFinanzas();
        setTimeout(closeModal, 900);
      }
    });
  }

  function openReinversion() {
    if (!requireCrear('reinversiones')) return;
    openModal({
      icon: '🔄', title: 'Registrar reinversión', submitText: 'Registrar reinversión',
      submitBg: 'rgba(50,140,90,.95)', submitColor: '#fff',
      bodyHtml:
        '<div class="op-steps">' +
        '<div class="op-step"><div class="op-step-n">1</div><div class="field"><span>Almacén</span><select id="op-r-alm" required>' + storeOpts(false) + '</select></div></div>' +
        '<div class="op-step"><div class="op-step-n">2</div><div class="field"><span>Producto</span><select id="op-r-prod" required>' + productOpts() + '</select></div></div>' +
        '<div class="op-step"><div class="op-step-n">3</div><div class="field"><span>Cantidad (unidad base)</span><input id="op-r-cant" type="number" min="0.001" step="any" required></div></div>' +
        '<div class="op-step"><div class="op-step-n">4</div><div class="field"><span>Costo total</span><input id="op-r-cost" type="number" min="0.01" step="0.01" required></div></div>' +
        '</div>' +
        '<div class="field"><span>Proveedor (opcional)</span><input id="op-r-prov" placeholder="Nombre del proveedor"></div>' +
        '<p class="muted" style="margin:0;font-size:12px">Inventario ↑ · costo unitario · caja ↓</p>',
      onSubmit: async function (setMsg) {
        if (!requireCrear('reinversiones')) { setMsg('Sin permiso para registrar reinversiones.', false); throw new Error('permiso'); }
        var alm = document.getElementById('op-r-alm').value;
        var prod = document.getElementById('op-r-prod').value;
        var cant = Number(document.getElementById('op-r-cant').value);
        var cost = Number(document.getElementById('op-r-cost').value);
        if (!alm || !prod || !(cant > 0) || !(cost > 0)) { setMsg('Completá almacén, producto, cantidad y costo.', false); throw new Error('validación'); }
        await rpc('registrar_reinversion_multiple', {
          p_almacen_id: alm, p_proveedor: document.getElementById('op-r-prov').value || null, p_fecha: new Date().toISOString(),
          p_lineas: [{ producto_id: prod, presentacion_id: null, cantidad_presentacion: null, cantidad_base: cant, costo_total: cost }],
          p_idempotency_key: key()
        });
        setMsg('✓ Reinversión registrada.', true);
        if (typeof refrescarFinanzas === 'function') refrescarFinanzas();
        setTimeout(closeModal, 900);
      }
    });
  }

  function snapshotList(id) {
    var el = document.getElementById(id);
    if (!el) return '<p class="op-list-empty">Sin datos todavía.</p>';
    var html = el.innerHTML.trim();
    if (!html || /Sin responsabilidad|Sin incidencia|lista-estado|Cargando/i.test(html) && el.children.length <= 1) {
      var text = el.textContent || '';
      if (/Sin |Cargando|Todavía/i.test(text) || !el.querySelector('.lista-item,.rep-fila,div')) {
        return '<p class="op-list-empty">' + esc(text.trim() || 'Sin registros.') + '</p>';
      }
    }
    return html;
  }

  function openResponsabilidad() {
    if (!requireCrear('turnos')) return;
    openModal({
      icon: '📋', title: 'Responsabilidades', submitText: 'Crear',
      submitBg: 'rgba(50,90,160,.95)', submitColor: '#fff',
      bodyHtml:
        '<div class="op-tabs">' +
        '<button type="button" class="op-tab active" data-panel="crear">Crear</button>' +
        '<button type="button" class="op-tab" data-panel="lista">Ver creadas</button>' +
        '</div>' +
        '<div id="op-resp-crear">' +
        '<div class="field"><span>Título</span><input id="op-resp-t" placeholder="Título de la tarea" required></div>' +
        '<div class="field"><span>Descripción</span><input id="op-resp-d" placeholder="Opcional"></div>' +
        '<div class="field"><span>Prioridad</span><select id="op-resp-p"><option value="normal">Normal</option><option value="alta">Alta</option><option value="baja">Baja</option></select></div>' +
        '</div>' +
        '<div id="op-resp-lista" class="op-list-box" style="display:none"></div>',
      afterOpen: function (back) {
        var crear = back.querySelector('#op-resp-crear');
        var lista = back.querySelector('#op-resp-lista');
        var submit = back.querySelector('.op-submit');
        lista.innerHTML = snapshotList('lista-responsabilidades');
        back.querySelectorAll('.op-tab').forEach(function (tab) {
          tab.onclick = function () {
            back.querySelectorAll('.op-tab').forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            var p = tab.getAttribute('data-panel');
            if (p === 'lista') {
              crear.style.display = 'none';
              lista.style.display = 'block';
              lista.innerHTML = snapshotList('lista-responsabilidades');
              if (submit) submit.style.display = 'none';
            } else {
              crear.style.display = 'block';
              lista.style.display = 'none';
              if (submit) submit.style.display = '';
            }
          };
        });
      },
      onSubmit: async function (setMsg) {
        if (!requireCrear('turnos')) { setMsg('Sin permiso para crear responsabilidades.', false); throw new Error('permiso'); }
        var form = document.getElementById('form-responsabilidad');
        if (!form) { setMsg('Formulario base no disponible.', false); throw new Error('no form'); }
        var t = document.getElementById('op-resp-t').value.trim();
        if (!t) { setMsg('El título es obligatorio.', false); throw new Error('validación'); }
        document.getElementById('resp-titulo').value = t;
        document.getElementById('resp-desc').value = document.getElementById('op-resp-d').value;
        document.getElementById('resp-prioridad').value = document.getElementById('op-resp-p').value;
        if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        setMsg('✓ Creada. Podés verla en «Ver creadas».', true);
        setTimeout(function () {
          var lista = document.getElementById('op-resp-lista');
          if (lista) lista.innerHTML = snapshotList('lista-responsabilidades');
        }, 600);
      }
    });
  }

  function openIncidencia() {
    if (!requireCrear('turnos')) return;
    openModal({
      icon: '⚠️', title: 'Incidencias', submitText: 'Reportar',
      submitBg: 'rgba(100,60,160,.95)', submitColor: '#fff',
      bodyHtml:
        '<div class="op-tabs">' +
        '<button type="button" class="op-tab active" data-panel="crear">Reportar</button>' +
        '<button type="button" class="op-tab" data-panel="lista">Ver creadas</button>' +
        '</div>' +
        '<div id="op-inc-crear">' +
        '<div class="field"><span>Tipo</span><select id="op-inc-t"><option value="faltante">Faltante</option><option value="sobrante">Sobrante</option><option value="dano">Daño</option><option value="error_operativo">Error operativo</option><option value="otro">Otro</option></select></div>' +
        '<div class="field"><span>Descripción</span><input id="op-inc-d" placeholder="Descripción de la incidencia" required></div>' +
        '</div>' +
        '<div id="op-inc-lista" class="op-list-box" style="display:none"></div>',
      afterOpen: function (back) {
        var crear = back.querySelector('#op-inc-crear');
        var lista = back.querySelector('#op-inc-lista');
        var submit = back.querySelector('.op-submit');
        lista.innerHTML = snapshotList('lista-incidencias');
        back.querySelectorAll('.op-tab').forEach(function (tab) {
          tab.onclick = function () {
            back.querySelectorAll('.op-tab').forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            var p = tab.getAttribute('data-panel');
            if (p === 'lista') {
              crear.style.display = 'none';
              lista.style.display = 'block';
              lista.innerHTML = snapshotList('lista-incidencias');
              if (submit) submit.style.display = 'none';
            } else {
              crear.style.display = 'block';
              lista.style.display = 'none';
              if (submit) submit.style.display = '';
            }
          };
        });
      },
      onSubmit: async function (setMsg) {
        if (!requireCrear('turnos')) { setMsg('Sin permiso para reportar incidencias.', false); throw new Error('permiso'); }
        var form = document.getElementById('form-incidencia');
        if (!form) { setMsg('Formulario base no disponible.', false); throw new Error('no form'); }
        var d = document.getElementById('op-inc-d').value.trim();
        if (!d) { setMsg('La descripción es obligatoria.', false); throw new Error('validación'); }
        document.getElementById('inc-tipo').value = document.getElementById('op-inc-t').value;
        document.getElementById('inc-desc').value = d;
        if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        setMsg('✓ Reportada. Podés verla en «Ver creadas».', true);
        setTimeout(function () {
          var lista = document.getElementById('op-inc-lista');
          if (lista) lista.innerHTML = snapshotList('lista-incidencias');
        }, 600);
      }
    });
  }

  function goAprobaciones() {
    var btn = document.querySelector('.tab-btn[data-tab="resumen"]');
    if (btn) btn.click();
    setTimeout(function () {
      var p = document.getElementById('admin-aprobaciones');
      if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
  }

  function hideLegacy() {
    var tab = document.getElementById('tab-operacion');
    if (!tab) return;
    tab.classList.add('bc-ophub');
    ['finanzas-operativas', 'admin-solicitudes', 'fin-historial'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    tab.querySelectorAll(':scope > .cc-bloque').forEach(function (b) {
      if (b.id !== HUB_ID) b.style.display = 'none';
    });
    var fr = document.getElementById('form-responsabilidad');
    if (fr) fr.style.display = 'none';
    var fi = document.getElementById('form-incidencia');
    if (fi) fi.style.display = 'none';
  }

  /** Construye la lista de cards según permisos reales actuales. */
  function buildCardsList() {
    var cards = [];
    if (can('gastos', 'crear')) {
      cards.push({ tone: 'gold', icon: '💸', title: 'Registrar gasto', desc: 'Registra un nuevo gasto de tu negocio.', go: 'Registrar gasto', fn: openGasto });
    }
    if (can('mermas', 'crear')) {
      cards.push({ tone: 'red', icon: '📦', title: 'Registrar merma', desc: 'Productos que salen de inventario por merma.', go: 'Registrar merma', fn: openMerma });
    }
    if (can('reinversiones', 'crear')) {
      cards.push({ tone: 'green', icon: '🔄', title: 'Registrar reinversión', desc: 'Productos reinvertidos: inventario ↑ y caja ↓.', go: 'Registrar reinversión', fn: openReinversion });
    }
    // Backend: crear_responsabilidad / crear_incidencia exigen turnos.crear
    if (can('turnos', 'crear')) {
      cards.push({ tone: 'blue', icon: '📋', title: 'Nueva responsabilidad', desc: 'Creá tareas y revisá las ya asignadas.', go: 'Abrir', fn: openResponsabilidad });
      cards.push({ tone: 'purple', icon: '⚠️', title: 'Reportar incidencia', desc: 'Reportá eventos y consultá los creados.', go: 'Abrir', fn: openIncidencia });
    }
    if (can('gastos', 'editar_any') || can('mermas', 'editar_any') || can('auditoria', 'editar_any') || can('entregas_caja', 'editar_any')) {
      cards.push({ tone: 'purple', icon: '🔐', title: 'Ver aprobaciones', desc: 'Revisá pendientes de gasto, merma y caja.', go: 'Ir a aprobaciones', fn: goAprobaciones });
    }
    return cards;
  }

  /** Rellena (o rellena de nuevo) el grid de cards según permisos actuales. */
  function fillCardsGrid(grid) {
    if (!grid) return;
    grid.innerHTML = '';
    var cards = buildCardsList();
    cards.forEach(function (c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'op-card tone-' + c.tone;
      btn.innerHTML =
        '<div class="op-card-icon" aria-hidden="true">' + c.icon + '</div>' +
        '<h3>' + esc(c.title) + '</h3><p>' + esc(c.desc) + '</p>' +
        '<span class="op-go">' + esc(c.go) + ' →</span>';
      btn.onclick = c.fn;
      grid.appendChild(btn);
    });
  }

  function buildHub() {
    var tab = document.getElementById('tab-operacion');
    if (!tab) return;
    hideLegacy();

    var existing = document.getElementById(HUB_ID);
    if (existing && existing.getAttribute('data-ver') === HUB_VER) {
      // Hub ya presente: solo refrescar cards según permisos actuales (corrige carrera de carga)
      var grid = existing.querySelector('#op-card-grid');
      fillCardsGrid(grid);
      return;
    }
    if (existing) existing.remove();

    var hub = document.createElement('div');
    hub.id = HUB_ID;
    hub.setAttribute('data-ver', HUB_VER);
    hub.innerHTML =
      '<div class="op-hero"><h2>Operaciones</h2><p>Gestioná movimientos de caja, inventario y tareas. Elegí una acción para comenzar.</p></div>' +
      '<div class="op-grid" id="op-card-grid"></div>' +
      '<p class="op-hint">Hacé clic en una tarjeta para abrir su formulario</p>';
    tab.insertBefore(hub, tab.firstChild);

    fillCardsGrid(hub.querySelector('#op-card-grid'));
  }

  function run() { injectCss(); buildHub(); hideLegacy(); }

  /**
   * Enganche al flujo real de permisos: cuando aplicarPermisosAInterfaz
   * termina (tras cargarContextoUsuario), re-renderizamos las cards.
   * Sin setTimeout artificial como solución.
   */
  function hookPermisosRender() {
    var orig = window.aplicarPermisosAInterfaz;
    if (typeof orig !== 'function' || orig.__bcOpHubHook) return;
    var wrapped = function () {
      var ret = orig.apply(this, arguments);
      try { run(); } catch (e) {}
      return ret;
    };
    wrapped.__bcOpHubHook = true;
    window.aplicarPermisosAInterfaz = wrapped;
    try { aplicarPermisosAInterfaz = wrapped; } catch (e) {}
  }

  function boot() {
    hookPermisosRender();
    run();
    // Red de seguridad mínima (ya existían en v36): por si el hook aún no está listo
    // al primer tick. No se introducen setTimeout nuevos como "solución".
    setTimeout(function () { hookPermisosRender(); run(); }, 600);
    setTimeout(function () { hookPermisosRender(); run(); }, 1600);
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-tab]');
    if (b && b.dataset.tab === 'operacion') {
      hookPermisosRender();
      setTimeout(run, 150);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 400); });
  } else {
    setTimeout(boot, 400);
  }
})();
