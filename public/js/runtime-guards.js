/* BattleCruiser — runtime guards
 * Conectividad real + aislamiento táctil del menú lateral.
 * No crea otra caché ni otra cola; reutiliza sondearBackend() y el menú existente.
 */
(function () {
  'use strict';

  function arrancarConectividad() {
    if (typeof sondearBackend !== 'function') {
      setTimeout(arrancarConectividad, 500);
      return;
    }
    let timer = null;
    const sondear = () => {
      try { sondearBackend(); } catch (e) { console.warn('[BattleCruiser] Sondeo de conectividad:', e); }
    };
    sondear();
    window.addEventListener('online', sondear, { passive: true });
    window.addEventListener('offline', () => {
      try { marcarConectividadReal('offline'); } catch (e) {}
    }, { passive: true });
    timer = window.setInterval(sondear, 15000);
    window.addEventListener('beforeunload', () => { if (timer) clearInterval(timer); }, { once: true });
  }

  function aislarMenuLateral() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) { setTimeout(aislarMenuLateral, 300); return; }
    let scrollAnterior = '';
    const actualizar = () => {
      const abierto = sidebar.classList.contains('open');
      if (abierto) {
        if (document.body.dataset.bcOverflowGuard !== '1') {
          scrollAnterior = document.body.style.overflow;
          document.body.dataset.bcOverflowAnterior = scrollAnterior;
          document.body.dataset.bcOverflowGuard = '1';
        }
        document.body.style.overflow = 'hidden';
      } else if (document.body.dataset.bcOverflowGuard === '1') {
        document.body.style.overflow = document.body.dataset.bcOverflowAnterior || '';
        delete document.body.dataset.bcOverflowAnterior;
        delete document.body.dataset.bcOverflowGuard;
      }
    };
    sidebar.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    sidebar.addEventListener('touchmove', e => e.stopPropagation(), { passive: true });
    sidebar.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
    new MutationObserver(actualizar).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    actualizar();
  }

  function iniciar() {
    arrancarConectividad();
    aislarMenuLateral();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();
})();
