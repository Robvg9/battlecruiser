// BattleCruiser — M29/M33 archive surfaced inside canonical BC7 Jornada.
(function () {
  'use strict';
  if (window.__BC7_LEGACY_HISTORY_MODULE__) return;
  window.__BC7_LEGACY_HISTORY_MODULE__ = true;

  const DETAIL_ID = 'bc7-legacy-history';
  const HOST_ID = 'bc7-legacy-history-host';
  const ROOT_ID = 'ciclos-m18-root';
  const STYLE_ID = 'bc7-legacy-history-style';
  let observer = null;

  function allowed() {
    return typeof window.tienePermiso === 'function' && window.tienePermiso('turnos', 'ver');
  }

  function ensureDetails(wrapper) {
    let details = document.getElementById(DETAIL_ID);
    if (details) return details;
    details = document.createElement('details');
    details.id = DETAIL_ID;
    details.className = 'bc7-legacy-history';
    details.innerHTML =
      '<summary>Historial y expedientes anteriores</summary>' +
      '<div class="bc7-legacy-history-body">' +
        '<p class="bc7-legacy-history-note">Conserva aquí los registros heredados de Turnos y sus expedientes. Para organizar, crear y abrir nuevas jornadas utiliza únicamente el calendario y el espacio de trabajo de arriba.</p>' +
        '<div id="' + HOST_ID + '"></div>' +
      '</div>';
    const anchor = wrapper.querySelector('#bc7-workspace') ||
      wrapper.querySelector('#bc7-calendar-section') || wrapper.lastElementChild;
    if (anchor && anchor.parentNode) anchor.insertAdjacentElement('afterend', details);
    else wrapper.appendChild(details);
    return details;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '#tab-jornada .bc7-legacy-history{margin:8px 0 14px;border:1px solid var(--gold-dim);border-radius:8px;background:rgba(255,255,255,.018);padding:0 9px}' +
      '#tab-jornada .bc7-legacy-history>summary{display:flex;align-items:center;min-height:36px;cursor:pointer;list-style:none;font-size:11px;font-weight:700;color:var(--gold)}' +
      '#tab-jornada .bc7-legacy-history>summary::-webkit-details-marker{display:none}' +
      '#tab-jornada .bc7-legacy-history-body{padding:0 0 9px;min-width:0}' +
      '#tab-jornada .bc7-legacy-history-note{margin:0 0 8px;font-size:10px;line-height:1.35;color:var(--mist)}' +
      '#tab-jornada .bc7-legacy-history .m29-wrap{max-width:100%;padding:0 0 8px}' +
      '#tab-jornada .bc7-legacy-history .m29-hero{margin:0 0 8px!important}' +
      '#tab-jornada .bc7-legacy-history .m29-hero h2{font-size:14px!important}' +
      '#tab-jornada .bc7-legacy-history .m29-hero p{font-size:10px!important}' +
      '#tab-jornada .bc7-legacy-history .m29-hero-actions{display:flex;gap:6px;flex-wrap:wrap}' +
      '#tab-jornada .bc7-legacy-history .m29-btn-crear{display:none!important}';
    document.head.appendChild(style);
  }

  function mount() {
    const tab = document.getElementById('tab-jornada');
    const wrapper = tab && tab.querySelector('.bc7-wrap');
    const legacyRoot = document.getElementById(ROOT_ID);
    const legacyApi = window.__BC_M29__;
    if (!tab || !wrapper || !legacyRoot || !allowed() || !legacyApi || typeof legacyApi.renderHome !== 'function') return false;
    const details = ensureDetails(wrapper);
    const host = details.querySelector('#' + HOST_ID);
    if (!host) return false;
    window.__BC7_LEGACY_ARCHIVE_ONLY__ = true;
    if (legacyRoot.parentNode !== host) host.appendChild(legacyRoot);
    details.hidden = false;
    if (!legacyRoot.dataset.bc7ArchiveInitialized) {
      legacyRoot.dataset.bc7ArchiveInitialized = '1';
      Promise.resolve(legacyApi.renderHome()).catch(function (error) {
        legacyRoot.dataset.bc7ArchiveInitialized = '';
        console.error('[BC7] No se pudo inicializar el historial heredado:', error);
      });
    }
    return true;
  }

  function boot() {
    injectStyles();
    if (mount()) return;
    if (typeof MutationObserver === 'function' && !observer && document.body) {
      observer = new MutationObserver(function () {
        if (mount()) {
          observer.disconnect();
          observer = null;
        }
      });
      observer.observe(document.body, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'data-bc-permisos-cargados']
      });
    }
  }

  window.__BC7_LEGACY_HISTORY_MOUNT__ = mount;
  window.__BC7_LEGACY_HISTORY_VERIFY__ = function () {
    const details = document.getElementById(DETAIL_ID);
    const root = document.getElementById(ROOT_ID);
    return {
      mounted: !!details,
      expanded: !!(details && details.open),
      legacyRootInsideCanonicalRoute: !!(details && root && details.contains(root)),
      createTurnButtonCount: details ? details.querySelectorAll('#m29-btn-crear').length : null,
      archiveOnly: window.__BC7_LEGACY_ARCHIVE_ONLY__ === true,
      initialized: !!(root && root.dataset.bc7ArchiveInitialized),
      summary: details ? details.querySelector('summary')?.textContent || '' : ''
    };
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
