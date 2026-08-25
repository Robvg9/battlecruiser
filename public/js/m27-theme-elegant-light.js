// BattleCruiser — M27 Theme Elegant Light
// Paleta clara completa y coherente. No modifica lógica de negocio.
(function () {
  'use strict';
  if (window.__BC_THEME_ELEGANT_LIGHT__) return;
  window.__BC_THEME_ELEGANT_LIGHT__ = true;

  var STYLE_ID = 'bc-theme-elegant-light-css';

  function inject() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      'body.bc-theme-light{',
      '--void:#f4f1ea;',
      '--stone:#fffdf8;',
      '--stone-2:#eee9df;',
      '--gold:#9a7423;',
      '--gold-bright:#b58d35;',
      '--gold-dim:#cdb985;',
      '--wine:#8a3d4b;',
      '--sage:#557866;',
      '--text:#2e312d;',
      '--mist:#6f746d;',
      '--mist-dim:#969b93;',
      'background:linear-gradient(180deg,#f8f6f0 0%,#eeeae1 100%)!important;',
      'color:var(--text)!important;',
      'color-scheme:light;',
      '}',
      'body.bc-theme-light .stalactites{background:linear-gradient(90deg,transparent,#cdb985 20%,#b58d35 50%,#cdb985 80%,transparent)!important;opacity:.7}',
      'body.bc-theme-light .motes .mote{background:#b58d35!important;}',
      'body.bc-theme-light .card{background:linear-gradient(180deg,#fffdf8 0%,#f4efe6 100%)!important;border-color:#d5c79f!important;box-shadow:0 24px 60px rgba(73,61,35,.12),inset 0 0 0 1px rgba(181,141,53,.18),inset 0 0 0 5px #f0eadf!important}',
      'body.bc-theme-light input,body.bc-theme-light select,body.bc-theme-light textarea{background:#fffdf8!important;color:#2e312d!important;border-color:#d8cfb8!important}',
      'body.bc-theme-light input::placeholder,body.bc-theme-light textarea::placeholder{color:#9a9d97!important}',
      'body.bc-theme-light button[type="submit"]{color:#2e2818!important}',
      'body.bc-theme-light .app-header{color:var(--text)!important}',
      'body.bc-theme-light .header-right{color:var(--mist)!important}',
      'body.bc-theme-light .header-right button{background:#fffdf8!important;color:var(--text)!important;border-color:#d2c39d!important;box-shadow:0 3px 10px rgba(73,61,35,.06)}',
      'body.bc-theme-light .header-right button:hover{background:#f1ebdd!important;border-color:#bda76b!important}',
      'body.bc-theme-light .sidebar{background:linear-gradient(180deg,#fbf8f1 0%,#e9e3d8 100%)!important;border-color:#d2c39d!important;box-shadow:10px 0 32px rgba(73,61,35,.10)!important}',
      'body.bc-theme-light .sidebar-head{border-color:#ddd2bb!important}',
      'body.bc-theme-light .sidebar-title{color:#5b4c2d!important}',
      'body.bc-theme-light .sidebar-nav{background:transparent!important}',
      'body.bc-theme-light .tab-btn{background:transparent!important;color:#676b64!important;border-color:transparent!important}',
      'body.bc-theme-light .tab-btn:hover{background:#eee8dc!important;color:#3f433e!important}',
      'body.bc-theme-light .tab-btn.active{background:linear-gradient(180deg,#d9c48e,#c9ad61)!important;color:#2f2a1e!important;border-color:#b5964f!important;box-shadow:0 4px 12px rgba(151,117,35,.16)}',
      'body.bc-theme-light .main-content{color:var(--text)!important}',
      'body.bc-theme-light .tab-panel,body.bc-theme-light .seccion-cuerpo,body.bc-theme-light .seccion-principal,body.bc-theme-light .seccion-panel,body.bc-theme-light .cc-col-ppal,body.bc-theme-light .cc-col-lateral{color:var(--text)!important}',
      'body.bc-theme-light .cc-bloque,body.bc-theme-light .resumen-card,body.bc-theme-light .lista,body.bc-theme-light .mando-filtros,body.bc-theme-light .rep-fila,body.bc-theme-light .com-col-chat,body.bc-theme-light .com-lista,body.bc-theme-light .com-nueva-panel,body.bc-theme-light .com-input-bar{background:#fffdf8!important;border-color:#d8cfb8!important;box-shadow:0 4px 14px rgba(73,61,35,.05)}',
      'body.bc-theme-light .lista-item,body.bc-theme-light .usuario-item,body.bc-theme-light .cc-actividad-item{background:#fbf9f3!important;border-color:#e0d7c6!important;color:var(--text)!important}',
      'body.bc-theme-light .lista-item:hover,body.bc-theme-light .alerta-item:hover,body.bc-theme-light .lista-item-accion:hover{background:#f2ecdf!important}',
      'body.bc-theme-light .muted,body.bc-theme-light .status-line,body.bc-theme-light label,body.bc-theme-light .bc-aj-row-text small{color:#6f746d!important}',
      'body.bc-theme-light .ajustes-menu{background:#fffdf8!important;border-color:#d4c6a4!important;box-shadow:0 16px 32px rgba(73,61,35,.13)!important}',
      'body.bc-theme-light .ajustes-menu button{color:#3d403b!important}',
      'body.bc-theme-light .ajustes-menu button:hover{background:#f0eadf!important;color:#80641f!important}',
      'body.bc-theme-light .bc-aj-panel{background:linear-gradient(180deg,#fbf8f1 0%,#eee8de 100%)!important;border-color:#d4c6a4!important;box-shadow:-16px 0 48px rgba(73,61,35,.16)!important}',
      'body.bc-theme-light .bc-aj-quick-btn,body.bc-theme-light .bc-aj-app-btn{background:#fffdf8!important;border-color:#ddd1b7!important;color:#444842!important}',
      'body.bc-theme-light .bc-aj-quick-btn:hover,body.bc-theme-light .bc-aj-app-btn:hover{background:#f2ecdf!important}',
      'body.bc-theme-light .bc-aj-select{background:#fffdf8!important;color:#3d403b!important;border-color:#d8cfb8!important}',
      'body.bc-theme-light .bc-aj-danger{background:#fff1f2!important;color:#8a3d4b!important;border-color:#d8a9b2!important}',
      'body.bc-theme-light .bc-aj-logout{background:#8a3d4b!important;color:#fff6f7!important;border-color:#753441!important}',
      'body.bc-theme-light .com-chat-header{background:#f4efe6!important;border-color:#d8cfb8!important}',
      'body.bc-theme-light .com-conv-item{border-color:#e0d7c6!important}',
      'body.bc-theme-light .com-conv-item:hover{background:#f3ede3!important}',
      'body.bc-theme-light .com-conv-activa{background:#ece2c9!important}',
      'body.bc-theme-light .com-conv-titulo,body.bc-theme-light .com-chat-titulo,body.bc-theme-light .com-msg-contenido{color:#31352f!important}',
      'body.bc-theme-light .com-msg{background:#fbf9f3!important;border-color:#d8cfb8!important}',
      'body.bc-theme-light .com-msg-propio{background:#eee3c8!important;border-color:#cdb985!important}',
      'body.bc-theme-light .com-input-bar input{background:#fffdf8!important}',
      'body.bc-theme-light .catalogo-chip{background:#fffdf8!important;color:#6b6f67!important;border-color:#d6c8a7!important}',
      'body.bc-theme-light .catalogo-chip.activo{background:linear-gradient(180deg,#d9c48e,#c9ad61)!important;color:#2f2a1e!important;border-color:#b5964f!important}',
      'body.bc-theme-light .catalogo-card{background:#fffdf8!important;border-color:#d8cfb8!important;box-shadow:0 5px 14px rgba(73,61,35,.06)!important}',
      'body.bc-theme-light .catalogo-card-nombre{color:#30342f!important}',
      'body.bc-theme-light .catalogo-card-precio{color:#80641f!important}',
      'body.bc-theme-light .venta-almacen-operativo,body.bc-theme-light .venta-sin-turno{background:#fffdf8!important;border-color:#d8cfb8!important}',
      'body.bc-theme-light .bc-venta-carrito-bar{background:linear-gradient(180deg,transparent 0%,#f4f1ea 18%,#f4f1ea 100%)!important;border-color:#d8cfb8!important}',
      'body.bc-theme-light .bc-confirm-dialog,body.bc-theme-light #bc-m273-modal{background:#fffdf8!important;border-color:#d8cfb8!important;color:#2e312d!important}',
      'body.bc-theme-light .bc-confirm-cancel{color:#5f655d!important;border-color:#d1c6b2!important}',
      'body.bc-theme-light .bc-confirm-ok{color:#2e2818!important}',
      'body.bc-theme-light .bc-m273-cancel{color:#5f655d!important;border-color:#d1c6b2!important}',
      'body.bc-theme-light .bc-m273-ok{color:#6d5418!important}',
      'body.bc-theme-light .icon-btn{color:#5f655d!important}',
      'body.bc-theme-light .icon-btn:hover{background:#eee8dc!important;color:#3f433e!important}',
      'body.bc-theme-light .cola-badge{color:#80641f!important;border-color:#cdb985!important}',
      'body.bc-theme-light .status-line.reconectando{color:#80641f!important}',
      'body.bc-theme-light .status-line.offline{color:#8a3d4b!important}',
      'body.bc-theme-light .m21-card{background:#fffdf8!important;color:#2e312d!important;border-color:#d8cfb8!important}',
      'body.bc-theme-light .m21-msg.error{background:#fff1f2!important;color:#8a3d4b!important;border-color:#d8a9b2!important}',
      'body.bc-theme-light .m21-msg.ok{background:#edf6f0!important;color:#557866!important;border-color:#bad1bf!important}',
      'body.bc-theme-light .cc-estado,body.bc-theme-light .venta-auditoria,body.bc-theme-light .mov-detalle{background:#fbf9f3!important;border-color:#d8cfb8!important}',
      'body.bc-theme-light .alerta-cabecera{background:#fff1f2!important}',
      'body.bc-theme-light .detalle-cabecera,body.bc-theme-light .detalle-cuerpo{color:#2e312d!important}',
      'body.bc-theme-light .pass-panel{background:#fffdf8!important;border-color:#d8cfb8!important;color:#2e312d!important}',
      'body.bc-theme-light .btn-row button{background:#fffdf8!important;color:#3d403b!important;border-color:#d8cfb8!important}',
      'body.bc-theme-light .footnote{color:#93978f!important}',
      'body.bc-theme-light .error{color:#8a3d4b!important}',
      'body.bc-theme-light .gold,body.bc-theme-light .precio-mayorista{color:#80641f!important}'
    ].join('');
    document.head.appendChild(s);
  }

  inject();
  window.addEventListener('pageshow', inject);
})();
