// BattleCruiser — Panel Ajustes lateral (v9.2.96 — M27.3 logout global)
// Estructura proporcional al mock: drawer derecho, Rápido / Apariencia / Sync / Preferencias.
// Un solo botón: borrar caché SW + recargar última versión (Cloudflare/origen).
// M27.3: "Cerrar sesión" (logout auth) vive aquí; NO confundir con cerrar sesión operativa.
(function () {
  'use strict';
  if (window.__bcAjustesPanel) return;
  window.__bcAjustesPanel = true;

  var LS = 'bc-ui-preferences-v2';
  var defaults = {
    compacto: false,
    autoRefresh: true,
    syncAuto: true,
    syncOnOpen: true,
    syncWifiOnly: false,
    onlinePref: 'auto',
    notifications: true,
    appearance: 'dark'
  };

  function loadPrefs() {
    try {
      return Object.assign({}, defaults, JSON.parse(localStorage.getItem(LS) || '{}'));
    } catch (e) {
      return Object.assign({}, defaults);
    }
  }
  function savePrefs(p) {
    try { localStorage.setItem(LS, JSON.stringify(p)); } catch (e) {}
  }

  var prefs = loadPrefs();

  function injectCss() {
    if (document.getElementById('bc-ajustes-panel-css')) return;
    var s = document.createElement('style');
    s.id = 'bc-ajustes-panel-css';
    s.textContent = [
      '#ajustes-menu.bc-legacy-hidden{display:none!important}',
      '.ajustes-wrap{position:relative}',
      '#bc-aj-backdrop{position:fixed;inset:0;background:rgba(4,12,10,.55);z-index:9500;opacity:0;pointer-events:none;transition:opacity .2s ease}',
      '#bc-aj-backdrop.open{opacity:1;pointer-events:auto}',
      '#bc-aj-panel{position:fixed;top:0;right:0;height:100%;height:100dvh;z-index:9501;',
      'width:min(420px,92vw);max-width:100%;',
      'background:linear-gradient(180deg,rgba(14,32,28,.98),rgba(8,20,17,.99));',
      'border-left:1px solid rgba(201,162,77,.22);',
      'box-shadow:-16px 0 48px rgba(0,0,0,.45);',
      'transform:translateX(105%);transition:transform .22s ease;',
      'display:flex;flex-direction:column;overflow:hidden}',
      '#bc-aj-panel.open{transform:translateX(0)}',
      '@media(min-width:1100px){#bc-aj-panel{width:min(400px,38vw)}}',
      '@media(max-width:480px){#bc-aj-panel{width:100%;max-width:100%;border-left:none;border-radius:0}}',
      '.bc-aj-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px;border-bottom:1px solid rgba(201,162,77,.14);flex:0 0 auto}',
      '.bc-aj-head h2{margin:0;font-family:Cormorant Garamond,serif;font-size:1.35rem;font-weight:600;color:var(--gold-bright);display:flex;align-items:center;gap:8px}',
      '.bc-aj-x{background:transparent;border:none;color:var(--mist);font-size:22px;cursor:pointer;padding:4px 8px;border-radius:8px;line-height:1}',
      '.bc-aj-x:hover{color:var(--text);background:rgba(255,255,255,.06)}',
      '.bc-aj-body{flex:1 1 auto;overflow:auto;-webkit-overflow-scrolling:touch;padding:14px 16px 28px}',
      '.bc-aj-sec{margin-bottom:18px}',
      '.bc-aj-sec-title{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold-dim);font-weight:600}',
      '.bc-aj-quick{display:grid;grid-template-columns:1fr;gap:10px}',
      '.bc-aj-quick-btn{display:flex;align-items:flex-start;gap:12px;padding:14px 14px;border-radius:12px;border:1px solid rgba(201,162,77,.2);background:rgba(12,28,24,.55);cursor:pointer;text-align:left;color:var(--text);transition:border-color .15s,transform .15s}',
      '.bc-aj-quick-btn:hover{border-color:rgba(201,162,77,.4);transform:translateY(-1px)}',
      '.bc-aj-quick-btn:disabled{opacity:.6;cursor:wait}',
      '.bc-aj-quick-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;background:rgba(201,162,77,.12);flex:0 0 auto}',
      '.bc-aj-quick-btn strong{display:block;font-size:14px;font-weight:600;margin-bottom:2px}',
      '.bc-aj-quick-btn span{display:block;font-size:12px;color:var(--mist);line-height:1.35}',
      '.bc-aj-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05)}',
      '.bc-aj-row:last-child{border-bottom:none}',
      '.bc-aj-row-text strong{display:block;font-size:13.5px;font-weight:600;color:var(--text)}',
      '.bc-aj-row-text small{display:block;font-size:11.5px;color:var(--mist);margin-top:2px;line-height:1.35}',
      '.bc-aj-toggle{position:relative;width:46px;height:26px;flex:0 0 auto}',
      '.bc-aj-toggle input{opacity:0;width:0;height:0}',
      '.bc-aj-slider{position:absolute;inset:0;background:rgba(255,255,255,.12);border-radius:999px;cursor:pointer;transition:.2s}',
      '.bc-aj-slider:before{content:"";position:absolute;width:20px;height:20px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}',
      '.bc-aj-toggle input:checked + .bc-aj-slider{background:rgba(201,162,77,.55)}',
      '.bc-aj-toggle input:checked + .bc-aj-slider:before{transform:translateX(20px);background:#f0d78c}',
      '.bc-aj-appearance{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '.bc-aj-app-btn{padding:12px 10px;border-radius:12px;border:1px solid rgba(201,162,77,.18);background:rgba(12,28,24,.4);color:var(--mist);cursor:pointer;font-size:13px;font-weight:500}',
      '.bc-aj-app-btn.active{border-color:rgba(201,162,77,.45);background:rgba(201,162,77,.12);color:var(--gold-bright)}',
      '.bc-aj-select{width:100%;padding:11px 12px;border-radius:10px;border:1px solid rgba(201,162,77,.2);background:var(--void);color:var(--text);font-size:13px;margin-top:6px}',
      '.bc-aj-link{display:flex;align-items:center;justify-content:space-between;width:100%;padding:12px 0;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.05);color:var(--text);cursor:pointer;font-size:13.5px;text-align:left}',
      '.bc-aj-link span{color:var(--mist);font-size:12px}',
      '.bc-aj-danger{width:100%;margin-top:8px;padding:12px;border-radius:12px;border:1px solid rgba(200,80,80,.35);background:rgba(80,20,20,.25);color:#e8a0a0;font-weight:600;cursor:pointer;font-size:13.5px}',
      '.bc-aj-danger:hover{background:rgba(100,30,30,.35)}',
      '.bc-aj-logout{width:100%;margin-top:14px;padding:14px;border-radius:12px;border:1px solid rgba(200,80,80,.5);background:rgba(100,24,24,.45);color:#f0c0c0;font-weight:700;cursor:pointer;font-size:14px}',
      '.bc-aj-logout:hover{background:rgba(120,30,30,.55)}',
      '.bc-aj-status{margin-top:10px;font-size:12.5px;color:var(--mist);min-height:1.2em}',
      '.bc-aj-status.ok{color:#9dcc9a}',
      '.bc-aj-status.err{color:#e8a0a0}',
      'body.bc-aj-open{overflow:hidden}'
    ].join('');
    document.head.appendChild(s);
  }

  function applyAppearance() {
    document.body.classList.remove('bc-theme-light', 'bc-theme-dark');
    if (prefs.appearance === 'light') document.body.classList.add('bc-theme-light');
    else document.body.classList.add('bc-theme-dark');
    document.body.classList.toggle('bc-compact', !!prefs.compacto);
  }

  async function actualizarYBorrarCache(btn) {
    var status = document.getElementById('bc-aj-status');
    if (btn) {
      btn.disabled = true;
      var label = btn.querySelector('strong');
      if (label) label.textContent = 'Actualizando…';
    }
    if (status) {
      status.className = 'bc-aj-status';
      status.textContent = 'Borrando caché y buscando la última versión…';
    }
    try {
      if ('serviceWorker' in navigator) {
        var regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(function (r) { return r.unregister(); }));
      }
      if ('caches' in window) {
        var keys = await caches.keys();
        await Promise.all(keys.filter(function (k) {
          return k.indexOf('battlecruiser-shell-') === 0 || k.indexOf('battlecruiser') === 0;
        }).map(function (k) { return caches.delete(k); }));
      }
    } catch (e) {
      console.warn('[BattleCruiser] limpieza caché parcial', e);
    }
    var u = new URL(location.href);
    u.searchParams.set('bc_update', String(Date.now()));
    location.replace(u.toString());
  }

  async function logoutGlobal() {
    close();
    if (typeof window.__BC_M273_logout === 'function') {
      await window.__BC_M273_logout();
      return;
    }
    try {
      if (typeof resetearNavegacionParaNuevaSesion === 'function') resetearNavegacionParaNuevaSesion();
    } catch (e) {}
    try {
      if (typeof limpiarContextoUsuario === 'function') limpiarContextoUsuario();
    } catch (e2) {}
    var ue = document.getElementById('user-email');
    if (ue) ue.textContent = '';
    try {
      await client.auth.signOut();
    } catch (e3) {
      console.warn('[BattleCruiser] signOut', e3);
    }
  }

  function ensurePanel() {
    var existingPanel = document.getElementById('bc-aj-panel');
    var existingBackdrop = document.getElementById('bc-aj-backdrop');
    // Recover a partial UI mount instead of throwing when the panel or backdrop is missing.
    if (existingPanel && existingBackdrop) return;
    if (existingPanel) existingPanel.remove();
    if (existingBackdrop) existingBackdrop.remove();

    var back = document.createElement('div');
    back.id = 'bc-aj-backdrop';
    back.addEventListener('click', close);

    var panel = document.createElement('div');
    panel.id = 'bc-aj-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Ajustes');
    panel.innerHTML =
      '<div class="bc-aj-head">' +
      '<h2>⚙️ Ajustes</h2>' +
      '<button type="button" class="bc-aj-x" id="bc-aj-close" aria-label="Cerrar">×</button>' +
      '</div>' +
      '<div class="bc-aj-body">' +

      '<div class="bc-aj-sec">' +
      '<div class="bc-aj-sec-title">⚡ Rápido</div>' +
      '<div class="bc-aj-quick">' +
      '<button type="button" class="bc-aj-quick-btn" id="bc-aj-update">' +
      '<span class="bc-aj-quick-icon">☁️</span>' +
      '<div><strong>Actualizar app</strong>' +
      '<span>Borra caché y descarga la última versión disponible.</span></div>' +
      '</button>' +
      '</div></div>' +

      '<div class="bc-aj-sec">' +
      '<div class="bc-aj-sec-title">◐ Apariencia</div>' +
      '<div class="bc-aj-appearance">' +
      '<button type="button" class="bc-aj-app-btn" data-app="dark">🌙 Modo oscuro</button>' +
      '<button type="button" class="bc-aj-app-btn" data-app="light">☀️ Modo claro</button>' +
      '</div></div>' +

      '<div class="bc-aj-sec">' +
      '<div class="bc-aj-sec-title">🔄 Sincronización</div>' +
      rowToggle('bc-aj-auto-refresh', 'Actualización automática', 'Mantener datos siempre actualizados en segundo plano.') +
      rowToggle('bc-aj-sync-auto', 'Sincronización automática', 'Sincroniza cambios de forma automática.') +
      rowToggle('bc-aj-sync-open', 'Sincronizar al abrir app', 'Sincroniza automáticamente al abrir la aplicación.') +
      rowToggle('bc-aj-sync-wifi', 'Sincronizar solo en Wi‑Fi', 'Ahorra datos móviles sincronizando solo con Wi‑Fi.') +
      '</div>' +

      '<div class="bc-aj-sec">' +
      '<div class="bc-aj-sec-title">☰ Preferencias</div>' +
      '<div class="bc-aj-row" style="flex-direction:column;align-items:stretch">' +
      '<div class="bc-aj-row-text"><strong>Región / Conexión</strong><small>Configura la región y preferencias de conexión.</small></div>' +
      '<select class="bc-aj-select" id="bc-aj-online">' +
      '<option value="auto">🌐 Automática</option>' +
      '<option value="online">Preferir online</option>' +
      '<option value="offline">Preferir offline</option>' +
      '</select></div>' +
      rowToggle('bc-aj-notify', 'Notificaciones', 'Recibe alertas sobre actividades importantes.') +
      rowToggle('bc-aj-compact', 'Modo compacto', 'Reduce espacios para mostrar más información.') +
      '<button type="button" class="bc-aj-link" id="bc-aj-pass"><div class="bc-aj-row-text"><strong>Cambiar contraseña</strong><small>Actualizá tu clave de acceso.</small></div><span>›</span></button>' +
      '<button type="button" class="bc-aj-link" id="bc-aj-data"><div class="bc-aj-row-text"><strong>Administrador de datos</strong><small>Pendientes, diagnóstico y mantenimiento.</small></div><span>›</span></button>' +
      '</div>' +

      '<button type="button" class="bc-aj-danger" id="bc-aj-reset">↻ Restaurar ajustes</button>' +
      '<button type="button" class="bc-aj-logout" id="bc-aj-logout">Cerrar sesión</button>' +
      '<p class="bc-aj-status" id="bc-aj-status"></p>' +
      '</div>';

    document.body.appendChild(back);
    document.body.appendChild(panel);

    document.getElementById('bc-aj-close').onclick = close;
    document.getElementById('bc-aj-update').onclick = function () {
      actualizarYBorrarCache(this);
    };

    panel.querySelectorAll('.bc-aj-app-btn').forEach(function (b) {
      b.onclick = function () {
        prefs.appearance = b.getAttribute('data-app');
        savePrefs(prefs);
        applyAppearance();
        syncUi();
        statusOk('Apariencia guardada.');
      };
    });

    wireToggle('bc-aj-auto-refresh', 'autoRefresh');
    wireToggle('bc-aj-sync-auto', 'syncAuto');
    wireToggle('bc-aj-sync-open', 'syncOnOpen');
    wireToggle('bc-aj-sync-wifi', 'syncWifiOnly');
    wireToggle('bc-aj-notify', 'notifications');
    wireToggle('bc-aj-compact', 'compacto');

    var online = document.getElementById('bc-aj-online');
    online.value = prefs.onlinePref || 'auto';
    online.onchange = function () {
      prefs.onlinePref = online.value;
      savePrefs(prefs);
      statusOk('Preferencia de conexión guardada.');
    };

    document.getElementById('bc-aj-pass').onclick = function () {
      close();
      var legacy = document.getElementById('change-pass-btn');
      if (legacy) legacy.click();
      else {
        var p = document.getElementById('pass-panel');
        if (p) p.classList.remove('hidden');
      }
    };

    document.getElementById('bc-aj-data').onclick = function () {
      close();
      var btn = document.querySelector('.tab-btn[data-tab="config"]');
      if (btn) btn.click();
      else if (typeof irATab === 'function') irATab('config');
    };

    document.getElementById('bc-aj-reset').onclick = function () {
      if (!window.confirm('¿Restaurar todos los ajustes a los valores por defecto?')) return;
      prefs = Object.assign({}, defaults);
      savePrefs(prefs);
      applyAppearance();
      syncUi();
      statusOk('Ajustes restaurados.');
    };

    document.getElementById('bc-aj-logout').onclick = function () {
      if (!window.confirm('¿Cerrar sesión y volver al login?')) return;
      logoutGlobal();
    };

    syncUi();
  }

  function rowToggle(id, title, desc) {
    return '<div class="bc-aj-row">' +
      '<div class="bc-aj-row-text"><strong>' + title + '</strong><small>' + desc + '</small></div>' +
      '<label class="bc-aj-toggle"><input type="checkbox" id="' + id + '"><span class="bc-aj-slider"></span></label>' +
      '</div>';
  }

  function wireToggle(id, key) {
    var el = document.getElementById(id);
    if (!el) return;
    el.checked = !!prefs[key];
    el.onchange = function () {
      prefs[key] = el.checked;
      savePrefs(prefs);
      if (key === 'compacto') document.body.classList.toggle('bc-compact', prefs.compacto);
      statusOk('Ajuste guardado.');
    };
  }

  function syncUi() {
    var map = {
      'bc-aj-auto-refresh': 'autoRefresh',
      'bc-aj-sync-auto': 'syncAuto',
      'bc-aj-sync-open': 'syncOnOpen',
      'bc-aj-sync-wifi': 'syncWifiOnly',
      'bc-aj-notify': 'notifications',
      'bc-aj-compact': 'compacto'
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.checked = !!prefs[map[id]];
    });
    var online = document.getElementById('bc-aj-online');
    if (online) online.value = prefs.onlinePref || 'auto';
    document.querySelectorAll('.bc-aj-app-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-app') === prefs.appearance);
    });
  }

  function statusOk(t) {
    var s = document.getElementById('bc-aj-status');
    if (!s) return;
    s.className = 'bc-aj-status ok';
    s.textContent = t;
  }

  function open() {
    var existingPanel = document.getElementById('bc-aj-panel');
    if (existingPanel && existingPanel.dataset.bcMovedToConfig === '1') {
      // Ajustes has been migrated into the Configuración tab. The header action
      // should navigate there, not reopen a drawer that locks document scrolling.
      var configTab = document.querySelector('.tab-btn[data-tab="config"]');
      existingPanel.classList.remove('open');
      if (document.body) {
        document.body.classList.remove('bc-aj-open');
        if (configTab) document.body.classList.add('bc-config-scroll-unlocked');
      }
      var backdrop = document.getElementById('bc-aj-backdrop');
      if (backdrop) backdrop.remove();
      if (configTab && !configTab.classList.contains('active')) configTab.click();
      return;
    }
    ensurePanel();
    prefs = loadPrefs();
    syncUi();
    applyAppearance();
    document.getElementById('bc-aj-backdrop').classList.add('open');
    document.getElementById('bc-aj-panel').classList.add('open');
    document.body.classList.add('bc-aj-open');
  }

  function close() {
    var b = document.getElementById('bc-aj-backdrop');
    var p = document.getElementById('bc-aj-panel');
    if (b) b.classList.remove('open');
    if (p) p.classList.remove('open');
    document.body.classList.remove('bc-aj-open');
  }

  function wireHeader() {
    var btn = document.getElementById('ajustes-btn');
    if (!btn || btn.dataset.bcAj === '1') return;
    btn.dataset.bcAj = '1';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var p = document.getElementById('bc-aj-panel');
      if (p && p.classList.contains('open')) close();
      else open();
    }, true);

    var menu = document.getElementById('ajustes-menu');
    if (menu) menu.classList.add('bc-legacy-hidden');
  }

  function boot() {
    injectCss();
    applyAppearance();
    wireHeader();
    setTimeout(wireHeader, 500);
    setTimeout(wireHeader, 1500);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
