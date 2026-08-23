// BattleCruiser — UI Visual Salón (v9.2.30)
// Iconos de menú lateral + empty states al estilo de la captura de referencia.
// No toca lógica de negocio ni RPC. Solo presentación.
(function () {
  'use strict';

  var ICONS = {
    resumen:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    productos:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 L12 12 l8.7-5"/><path d="M12 22V12"/></svg>',
    ventas:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2H18a1.5 1.5 0 0 0 1.4-1l1.6-7H7"/></svg>',
    almacenes:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 L12 4 l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.5z"/><path d="M9 21V12h6v9"/></svg>',
    transferencias:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h12l-3-3"/><path d="M17 17H5l3 3"/><path d="M5 12h14"/></svg>',
    vales:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M9 13h6M9 17h4"/></svg>',
    pendientes:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    reportes:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16V10"/><path d="M12 16V7"/><path d="M16 16v-4"/></svg>',
    inventario:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
    movimientos:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h6l2-7 4 14 2-7h4"/></svg>',
    turnos:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.5 3.8-5 7-5s5.8 1.5 7 5"/></svg>',
    ciclos:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.5 3.8-5 7-5s5.8 1.5 7 5"/></svg>',
    operacion:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',
    comunicacion:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>',
    mando:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5L12 14.8 7.5 16.7l.9-5L4.8 8.2l5-.7L12 3z"/></svg>',
    usuarios:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c.9-3.2 3.2-4.8 6.5-4.8s5.6 1.6 6.5 4.8"/><circle cx="17" cy="9" r="2.4"/><path d="M16 15.2c2.2.2 3.9 1.4 4.6 3.8"/></svg>',
    config:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
  };

  function injectStyles() {
    if (document.getElementById('bc-ui-visual-salon')) return;
    var s = document.createElement('style');
    s.id = 'bc-ui-visual-salon';
    s.textContent = [
      '.sidebar-nav .tab-btn{display:flex!important;align-items:center;gap:12px;padding:11px 14px!important;font-family:Inter,system-ui,sans-serif!important;font-size:13.5px!important;font-weight:500!important;letter-spacing:.01em;color:var(--mist);border-radius:10px!important;border-left:none!important;margin:2px 0!important;transition:background .15s ease,color .15s ease,box-shadow .15s ease}',
      '.sidebar-nav .tab-btn .bc-nav-icon{width:20px;height:20px;flex:0 0 20px;display:inline-flex;align-items:center;justify-content:center;opacity:.88}',
      '.sidebar-nav .tab-btn .bc-nav-icon svg{width:18px;height:18px;display:block}',
      '.sidebar-nav .tab-btn .bc-nav-label{flex:1;min-width:0;text-align:left}',
      '.sidebar-nav .tab-btn:hover{background:rgba(201,162,77,.08)!important;color:var(--text)!important}',
      '.sidebar-nav .tab-btn:hover .bc-nav-icon{opacity:1;color:var(--gold)}',
      '.sidebar-nav .tab-btn.active{background:rgba(201,162,77,.14)!important;color:var(--gold-bright)!important;box-shadow:inset 0 0 0 1px rgba(201,162,77,.22)}',
      '.sidebar-nav .tab-btn.active .bc-nav-icon{opacity:1;color:var(--gold)}',
      '.sidebar-nav .tab-btn .pendientes-tab-badge{margin-left:auto}',
      '.sidebar-title{font-family:Cormorant Garamond,serif;font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-dim)!important}',
      '.header-left h1{font-family:Cormorant Garamond,serif;font-weight:600;letter-spacing:.02em}',
      '.bc-header-logo{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin-right:2px;color:var(--gold)}',
      '.bc-header-logo svg{width:22px;height:22px}',
      '.com-lista-header{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px}',
      '.com-lista-header #com-nueva-btn{background:linear-gradient(180deg,var(--gold-bright),var(--gold))!important;color:#211605!important;border:none!important;font-weight:600;padding:9px 14px!important;border-radius:8px!important;box-shadow:0 4px 14px rgba(201,162,77,.25)}',
      '.com-lista-header #com-nueva-btn:hover{filter:brightness(1.05)}',
      '.com-lista-header #com-soporte-btn{background:transparent!important;border:1px solid var(--gold-dim)!important;color:var(--text)!important;padding:9px 14px!important;border-radius:8px!important}',
      '.com-lista-header #com-soporte-btn:hover{border-color:var(--gold)!important;color:var(--gold)!important}',
      '.com-lista{border-radius:12px!important;min-height:280px;position:relative}',
      '.com-empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 20px;gap:10px;min-height:260px}',
      '.com-empty-state .bc-empty-illu{width:72px;height:72px;color:var(--gold-dim);opacity:.85;margin-bottom:4px}',
      '.com-empty-state .bc-empty-illu svg{width:100%;height:100%}',
      '.com-empty-state p{margin:0;color:var(--mist);font-size:13.5px;line-height:1.45;max-width:220px}',
      '.com-empty-state .bc-empty-title{color:var(--text);font-weight:500;font-size:14px}',
      '.com-col-chat{border-radius:12px!important;position:relative;background:linear-gradient(180deg,rgba(20,48,42,.9),var(--stone))!important}',
      '.com-chat-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;pointer-events:none;z-index:0}',
      '.com-chat-empty .bc-compass{width:160px;height:160px;opacity:.12;color:var(--gold);margin-bottom:8px}',
      '.com-chat-empty h3{font-family:Cormorant Garamond,serif;font-weight:600;font-size:26px;color:var(--gold);margin:0 0 8px;letter-spacing:.02em}',
      '.com-chat-empty p{margin:0;color:var(--mist);font-size:13.5px;max-width:280px;line-height:1.5}',
      '.com-mensajes{position:relative;z-index:1}',
      '.com-chat-header,.com-input-bar{position:relative;z-index:2}',
      '.com-input-bar{gap:10px;padding:12px 14px!important;background:rgba(12,28,24,.55)!important}',
      '.com-input-bar input{border-radius:10px!important;background:var(--void)!important;border:1px solid rgba(201,162,77,.22)!important;padding:11px 14px!important}',
      '.com-input-bar button[type=submit]{width:auto!important;min-width:0;padding:11px 18px!important;border-radius:10px!important;flex:0 0 auto}',
      '@media(min-width:769px){.com-col-chat.hidden{display:flex!important}.com-col-chat.hidden .com-chat-header,.com-col-chat.hidden .com-input-bar,.com-col-chat.hidden .com-mensajes{visibility:hidden}.com-col-chat.hidden .com-chat-empty{visibility:visible}}',
      '.pendientes-header{border-bottom:1px solid rgba(201,162,77,.18)!important;padding-bottom:12px!important;margin-bottom:14px!important}',
      '.pendientes-header h3{font-family:Cormorant Garamond,serif!important;font-weight:600!important;font-size:22px!important;color:var(--text)!important;letter-spacing:.02em}',
      '.tab-panel > .muted:first-of-type{margin-top:-6px;margin-bottom:16px;font-size:13px}',
      '.status-line-app{font-size:11px!important;letter-spacing:.04em}',
      '.header-right #user-email{color:var(--mist);font-size:12.5px}'
    ].join('');
    document.head.appendChild(s);
  }

  function decorateSidebar() {
    var nav = document.getElementById('tabs');
    if (!nav || nav.dataset.bcIcons === '1') return;
    nav.dataset.bcIcons = '1';
    nav.querySelectorAll('.tab-btn[data-tab]').forEach(function (btn) {
      if (btn.querySelector('.bc-nav-icon')) return;
      var key = btn.getAttribute('data-tab');
      var svg = ICONS[key];
      if (!svg) return;
      var badge = btn.querySelector('.pendientes-tab-badge');
      var labelText = '';
      btn.childNodes.forEach(function (n) {
        if (n.nodeType === 3) labelText += n.textContent;
      });
      labelText = labelText.trim() || (btn.textContent || '').replace(/\d+/g, '').trim();
      btn.innerHTML = '';
      var icon = document.createElement('span');
      icon.className = 'bc-nav-icon';
      icon.innerHTML = svg;
      var lab = document.createElement('span');
      lab.className = 'bc-nav-label';
      lab.textContent = labelText;
      btn.appendChild(icon);
      btn.appendChild(lab);
      if (badge) btn.appendChild(badge);
    });
  }

  function decorateHeaderLogo() {
    var left = document.querySelector('.header-left');
    if (!left || left.querySelector('.bc-header-logo')) return;
    var h1 = left.querySelector('h1');
    if (!h1) return;
    var logo = document.createElement('span');
    logo.className = 'bc-header-logo';
    logo.setAttribute('aria-hidden', 'true');
    logo.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none">' +
      '<path d="M12 2v3" stroke="#8a7038" stroke-width="1.4" stroke-linecap="round"/>' +
      '<rect x="8" y="5" width="8" height="3" rx="1" fill="#8a7038"/>' +
      '<path d="M9 8 L15 8 L16.5 18 C16.5 20 14.5 21.5 12 21.5 C9.5 21.5 7.5 20 7.5 18 Z" fill="#c9a24d" fill-opacity="0.9"/>' +
      '<ellipse cx="12" cy="13" rx="2.4" ry="3.2" fill="#f5e2ac"/>' +
      '</svg>';
    left.insertBefore(logo, h1);
  }

  var EMPTY_CHAT_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M8 10.5a6.5 6.5 0 0 1 11.2-4.4 6.5 6.5 0 0 1-1.1 9.1l.4 3.3-3.2-1.5A6.5 6.5 0 0 1 8 10.5z" opacity=".55"/>' +
    '<path d="M5.2 19.2a5.8 5.8 0 1 1 2.1-11.2 5.8 5.8 0 0 0 8.2 6.9l2.4 1.2-.3-2.5a5.8 5.8 0 0 1 .3 1.8 5.8 5.8 0 0 1-9.6 4.3l-3.1 1.5z"/>' +
    '</svg>';

  var COMPASS_SVG =
    '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.2">' +
    '<circle cx="60" cy="60" r="52" opacity=".5"/>' +
    '<circle cx="60" cy="60" r="40" opacity=".35"/>' +
    '<path d="M60 12 L64 56 L60 48 L56 56 Z" fill="currentColor" opacity=".5"/>' +
    '<path d="M60 108 L56 64 L60 72 L64 64 Z" fill="currentColor" opacity=".35"/>' +
    '<path d="M12 60 L56 56 L48 60 L56 64 Z" fill="currentColor" opacity=".35"/>' +
    '<path d="M108 60 L64 64 L72 60 L64 56 Z" fill="currentColor" opacity=".35"/>' +
    '<circle cx="60" cy="60" r="4" fill="currentColor"/>' +
    '</svg>';

  function enhanceComunicacion() {
    var lista = document.getElementById('lista-conversaciones');
    if (lista && !lista.dataset.bcEmptyHook) {
      lista.dataset.bcEmptyHook = '1';
      var obs = new MutationObserver(function () { paintListaEmpty(lista); });
      obs.observe(lista, { childList: true, subtree: true });
      paintListaEmpty(lista);
    }

    var chat = document.getElementById('com-col-chat');
    if (chat && !chat.querySelector('.com-chat-empty')) {
      var empty = document.createElement('div');
      empty.className = 'com-chat-empty';
      empty.innerHTML =
        '<div class="bc-compass" aria-hidden="true">' +
        COMPASS_SVG +
        '</div>' +
        '<h3>¡Hola!</h3>' +
        '<p>Seleccioná una conversación o iniciá una nueva para comenzar a comunicarte.</p>';
      chat.insertBefore(empty, chat.firstChild);
    }

    var userEl = document.getElementById('user-email');
    var title = chat && chat.querySelector('.com-chat-empty h3');
    if (userEl && title) {
      var raw = (userEl.textContent || '').trim();
      var name = raw.split('·')[0].trim().split('@')[0];
      if (name && name.length < 24) title.textContent = '¡Hola, ' + name + '!';
    }

    var n = document.getElementById('com-nueva-btn');
    if (n && !n.dataset.bcIcon) {
      n.dataset.bcIcon = '1';
      if (!/^\+/.test(n.textContent.trim())) n.textContent = '+ Nueva conversación';
    }
    var sop = document.getElementById('com-soporte-btn');
    if (sop && !sop.dataset.bcIcon) {
      sop.dataset.bcIcon = '1';
      if (!/Soporte/.test(sop.textContent)) sop.textContent = 'Soporte';
    }
  }

  function paintListaEmpty(lista) {
    if (!lista) return;
    var hasItems = lista.querySelector('.com-conv-item, .lista-item, [data-conv-id]');
    var existing = lista.querySelector('.com-empty-state');
    if (hasItems) {
      if (existing) existing.remove();
      return;
    }
    if (!existing) {
      var estado = lista.querySelector('.lista-estado');
      if (estado) estado.style.display = 'none';
      existing = document.createElement('div');
      existing.className = 'com-empty-state';
      existing.innerHTML =
        '<div class="bc-empty-illu" aria-hidden="true">' +
        EMPTY_CHAT_SVG +
        '</div>' +
        '<p class="bc-empty-title">No tenés conversaciones todavía.</p>' +
        '<p>Iniciá una nueva conversación para comenzar a chatear.</p>';
      lista.appendChild(existing);
    }
  }

  function run() {
    injectStyles();
    decorateSidebar();
    decorateHeaderLogo();
    enhanceComunicacion();
  }

  function watchSidebarRelabel() {
    var nav = document.getElementById('tabs');
    if (!nav) return;
    var obs = new MutationObserver(function () {
      nav.dataset.bcIcons = '';
      decorateSidebar();
    });
    obs.observe(nav, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      run();
      setTimeout(run, 400);
      setTimeout(run, 1200);
      setTimeout(watchSidebarRelabel, 1300);
    });
  } else {
    run();
    setTimeout(run, 400);
    setTimeout(run, 1200);
    setTimeout(watchSidebarRelabel, 1300);
  }
})();
