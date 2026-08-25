// BattleCruiser — M27.5 Theme system (Misión Frontend A1)
// Contraste + Dark/Light coherentes. Una sola fuente de verdad: variables CSS.
// No modifica lógica de negocio.
(function () {
  'use strict';
  if (window.__BC_MA_THEME__) return;
  window.__BC_MA_THEME__ = true;

  var LS = 'bc-ui-preferences-v2';
  var STYLE_ID = 'bc-mission-a-theme';

  function inject() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      /* ========== DARK (default) — contraste alto ========== */
      'body.bc-theme-dark, body:not(.bc-theme-light) {',
      '  --void:#0a1613;',
      '  --stone:#122a24;',
      '  --stone-2:#1a3830;',
      '  --gold:#d4b05c;',
      '  --gold-bright:#efd48a;',
      '  --gold-dim:#9a7c3e;',
      '  --wine:#c44a5a;',
      '  --sage:#9fc4ad;',
      '  --text:#f5efe3;',
      '  --mist:#c9c0a8;',
      '  --mist-dim:#8f8670;',
      '  color-scheme:dark;',
      '}',
      'body.bc-theme-dark, body:not(.bc-theme-light) {',
      '  background:radial-gradient(ellipse at top,#152820 0%,#0a1613 62%)!important;',
      '  color:var(--text)!important;',
      '}',

      /* ========== LIGHT — suave, profesional, alto contraste ========== */
      'body.bc-theme-light {',
      '  --void:#f3f0e8;',
      '  --stone:#fffcf6;',
      '  --stone-2:#ebe6db;',
      '  --gold:#8a6a22;',
      '  --gold-bright:#a87f2e;',
      '  --gold-dim:#b9a06a;',
      '  --wine:#9a3d4a;',
      '  --sage:#4a6b58;',
      '  --text:#1f2420;',
      '  --mist:#5a6058;',
      '  --mist-dim:#7a8078;',
      '  color-scheme:light;',
      '  background:linear-gradient(180deg,#f7f4ec 0%,#ebe7de 100%)!important;',
      '  color:var(--text)!important;',
      '}',

      /* Tipografía con peso — legibilidad prioritaria */
      'body.bc-theme-dark .muted, body:not(.bc-theme-light) .muted,',
      'body.bc-theme-dark label, body:not(.bc-theme-light) label,',
      'body.bc-theme-dark .lista-estado, body:not(.bc-theme-light) .lista-estado,',
      'body.bc-theme-dark .status-line, body:not(.bc-theme-light) .status-line,',
      'body.bc-theme-dark small { color:var(--mist)!important; font-weight:500; }',
      'body.bc-theme-light .muted, body.bc-theme-light label,',
      'body.bc-theme-light .lista-estado, body.bc-theme-light .status-line,',
      'body.bc-theme-light small { color:var(--mist)!important; font-weight:600; }',

      'body.bc-theme-dark h1, body.bc-theme-dark h2, body.bc-theme-dark h3,',
      'body.bc-theme-dark h4, body.bc-theme-dark strong, body.bc-theme-dark b,',
      'body:not(.bc-theme-light) h1, body:not(.bc-theme-light) h2, body:not(.bc-theme-light) h3,',
      'body:not(.bc-theme-light) h4, body:not(.bc-theme-light) strong { color:var(--text)!important; font-weight:700; }',
      'body.bc-theme-light h1, body.bc-theme-light h2, body.bc-theme-light h3,',
      'body.bc-theme-light h4, body.bc-theme-light strong, body.bc-theme-light b { color:var(--text)!important; font-weight:800; }',

      /* Inputs / selects / placeholders — contraste real */
      'body.bc-theme-dark input, body.bc-theme-dark select, body.bc-theme-dark textarea,',
      'body:not(.bc-theme-light) input, body:not(.bc-theme-light) select, body:not(.bc-theme-light) textarea {',
      '  background:var(--void)!important; color:var(--text)!important;',
      '  border-color:rgba(201,162,77,.35)!important;',
      '}',
      'body.bc-theme-dark input::placeholder, body.bc-theme-dark textarea::placeholder,',
      'body:not(.bc-theme-light) input::placeholder, body:not(.bc-theme-light) textarea::placeholder {',
      '  color:var(--mist-dim)!important; opacity:1;',
      '}',
      'body.bc-theme-light input, body.bc-theme-light select, body.bc-theme-light textarea {',
      '  background:#fffef9!important; color:var(--text)!important;',
      '  border-color:#cfc6b0!important;',
      '}',
      'body.bc-theme-light input::placeholder, body.bc-theme-light textarea::placeholder {',
      '  color:#8a9088!important; opacity:1;',
      '}',

      /* Superficies — sin tarjetas blancas en dark, sin restos oscuros en light */
      'body.bc-theme-dark .app-header, body.bc-theme-dark .sidebar,',
      'body.bc-theme-dark .card, body.bc-theme-dark .lista-item,',
      'body.bc-theme-dark .resumen-card, body.bc-theme-dark .cc-bloque,',
      'body.bc-theme-dark .cc-estado, body.bc-theme-dark .pass-panel,',
      'body.bc-theme-dark .ajustes-menu, body.bc-theme-dark .catalogo-card,',
      'body.bc-theme-dark .com-col-chat, body.bc-theme-dark .com-lista,',
      'body.bc-theme-dark .com-input-bar, body.bc-theme-dark .inline-form,',
      'body.bc-theme-dark .venta-almacen-operativo, body.bc-theme-dark .venta-sin-turno,',
      'body.bc-theme-dark .m21-card, body.bc-theme-dark .bc-confirm-dialog,',
      'body.bc-theme-dark #bc-m273-modal, body.bc-theme-dark .alm-info-panel,',
      'body.bc-theme-dark .mov-detalle, body.bc-theme-dark .pendiente-detalle,',
      'body:not(.bc-theme-light) .app-header, body:not(.bc-theme-light) .sidebar,',
      'body:not(.bc-theme-light) .card, body:not(.bc-theme-light) .lista-item,',
      'body:not(.bc-theme-light) .resumen-card, body:not(.bc-theme-light) .cc-bloque,',
      'body:not(.bc-theme-light) .catalogo-card {',
      '  background-color:var(--stone)!important; color:var(--text)!important;',
      '  border-color:rgba(201,162,77,.28)!important;',
      '}',
      'body.bc-theme-dark .sidebar, body:not(.bc-theme-light) .sidebar {',
      '  background:linear-gradient(180deg,var(--stone-2),var(--stone))!important;',
      '}',

      'body.bc-theme-light .app-header, body.bc-theme-light .sidebar,',
      'body.bc-theme-light .card, body.bc-theme-light .lista-item,',
      'body.bc-theme-light .resumen-card, body.bc-theme-light .cc-bloque,',
      'body.bc-theme-light .cc-estado, body.bc-theme-light .pass-panel,',
      'body.bc-theme-light .ajustes-menu, body.bc-theme-light .catalogo-card,',
      'body.bc-theme-light .com-col-chat, body.bc-theme-light .com-lista,',
      'body.bc-theme-light .com-input-bar, body.bc-theme-light .inline-form,',
      'body.bc-theme-light .venta-almacen-operativo, body.bc-theme-light .venta-sin-turno,',
      'body.bc-theme-light .m21-card, body.bc-theme-light .bc-confirm-dialog,',
      'body.bc-theme-light #bc-m273-modal, body.bc-theme-light .alm-info-panel,',
      'body.bc-theme-light .mov-detalle, body.bc-theme-light .pendiente-detalle {',
      '  background-color:var(--stone)!important; color:var(--text)!important;',
      '  border-color:#d4c9b0!important;',
      '}',
      'body.bc-theme-light .sidebar {',
      '  background:linear-gradient(180deg,#fffcf6,#ebe6db)!important;',
      '}',

      /* Tablas */
      'body.bc-theme-dark table, body.bc-theme-dark thead, body.bc-theme-dark tbody,',
      'body.bc-theme-dark tr, body.bc-theme-dark td, body.bc-theme-dark th,',
      'body:not(.bc-theme-light) table, body:not(.bc-theme-light) td, body:not(.bc-theme-light) th {',
      '  background-color:var(--stone)!important; color:var(--text)!important;',
      '  border-color:rgba(201,162,77,.22)!important;',
      '}',
      'body.bc-theme-light table, body.bc-theme-light thead, body.bc-theme-light tbody,',
      'body.bc-theme-light tr, body.bc-theme-light td, body.bc-theme-light th {',
      '  background-color:var(--stone)!important; color:var(--text)!important;',
      '  border-color:#d4c9b0!important;',
      '}',

      /* Precios y acentos legibles */
      'body.bc-theme-dark .catalogo-card-precio, body.bc-theme-dark .venta-total-valor,',
      'body.bc-theme-dark .gold, body.bc-theme-dark .precio-mayorista,',
      'body:not(.bc-theme-light) .catalogo-card-precio, body:not(.bc-theme-light) .venta-total-valor {',
      '  color:var(--gold-bright)!important; font-weight:700;',
      '}',
      'body.bc-theme-light .catalogo-card-precio, body.bc-theme-light .venta-total-valor,',
      'body.bc-theme-light .gold, body.bc-theme-light .precio-mayorista {',
      '  color:var(--gold)!important; font-weight:800;',
      '}',

      /* Botones de acción secundaria legibles */
      'body.bc-theme-light .cc-accion, body.bc-theme-light .header-right button,',
      'body.bc-theme-light .icon-btn, body.bc-theme-light .lista-item-acciones button {',
      '  color:var(--text)!important; font-weight:600;',
      '}',

      /* Chips / tabs activos */
      'body.bc-theme-dark .tab-btn.active, body.bc-theme-dark .catalogo-chip.activo,',
      'body:not(.bc-theme-light) .tab-btn.active, body:not(.bc-theme-light) .catalogo-chip.activo {',
      '  color:var(--gold-bright)!important; font-weight:600;',
      '}',
      'body.bc-theme-light .tab-btn.active, body.bc-theme-light .catalogo-chip.activo {',
      '  color:#2a2418!important; font-weight:700;',
      '}',

      /* Nombres de producto y textos de lista con peso */
      'body.bc-theme-dark .catalogo-card-nombre, body.bc-theme-dark .lista-item,',
      'body:not(.bc-theme-light) .catalogo-card-nombre {',
      '  color:var(--text)!important; font-weight:600;',
      '}',
      'body.bc-theme-light .catalogo-card-nombre { color:var(--text)!important; font-weight:700; }',

      /* Footer / footnote */
      'body.bc-theme-dark .app-footer, body.bc-theme-dark .footnote,',
      'body:not(.bc-theme-light) .app-footer, body:not(.bc-theme-light) .footnote {',
      '  color:var(--mist-dim)!important;',
      '}',
      'body.bc-theme-light .app-footer, body.bc-theme-light .footnote {',
      '  color:var(--mist-dim)!important;',
      '}'
    ].join('');
    document.head.appendChild(s);
  }

  function syncTheme() {
    try {
      var p = JSON.parse(localStorage.getItem(LS) || '{}');
      var appearance = p.appearance === 'light' ? 'light' : 'dark';
      document.body.classList.toggle('bc-theme-light', appearance === 'light');
      document.body.classList.toggle('bc-theme-dark', appearance === 'dark');
    } catch (e) {
      document.body.classList.remove('bc-theme-light');
      document.body.classList.add('bc-theme-dark');
    }
  }

  function init() {
    inject();
    syncTheme();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('pageshow', init);
  window.addEventListener('storage', syncTheme);

  // API pública mínima por si otros módulos quieren forzar re-sync
  window.__BC_syncTheme = syncTheme;
})();
