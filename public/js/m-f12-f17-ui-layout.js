// BattleCruiser F12–F17 — UI layout controlado
(function(){
  "use strict";
  if(window.__BC_F12_UI__)return;
  window.__BC_F12_UI__=true;
  function injectCss(){if(document.getElementById("bc-f12-ui-css"))return;var s=document.createElement("style");s.id="bc-f12-ui-css";s.textContent="#tab-reportes #rep-resumen{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}#tab-reportes .rep-fila{display:grid;grid-template-columns:minmax(120px,1.2fr) minmax(0,2fr);gap:8px 12px;padding:10px 12px;margin:0 0 6px;border-radius:10px}#tab-comunicacion .com-layout,#tab-comunicacion .com-cols{display:flex;flex-wrap:wrap;gap:12px;align-items:stretch}#tab-comunicacion .com-col-chat{flex:2 1 320px;min-width:260px;display:flex;flex-direction:column}#bc-f12-modal{position:fixed;inset:0;z-index:9600;background:rgba(4,12,10,.72);display:flex;align-items:center;justify-content:center;padding:16px}#bc-f12-modal .box{width:min(920px,96vw);max-height:92dvh;overflow:auto;border-radius:14px;padding:16px 18px;background:var(--stone,#10221e);border:1px solid var(--gold-dim,rgba(201,162,77,.28))}";document.head.appendChild(s)}
  function closeModal(){var e=document.getElementById("bc-f12-modal");if(e)e.remove();document.body.classList.remove("bc-f12-modal-open")}
  function openModal(title,html){closeModal();document.body.classList.add("bc-f12-modal-open");var e=document.createElement("div");e.id="bc-f12-modal";e.innerHTML='<div class="box"><button type="button" class="bc-f12-close" aria-label="Cerrar">×</button><h3>'+title+'</h3><div class="bc-f12-body">'+html+'</div></div>';document.body.appendChild(e);e.querySelector(".bc-f12-close").onclick=closeModal;e.onclick=function(x){if(x.target===e)closeModal()}}
  function setup(){injectCss();document.querySelectorAll("[data-bc-f12-detail]").forEach(function(btn){if(btn.dataset.bound)return;btn.dataset.bound="1";btn.onclick=function(){var id=btn.getAttribute("data-bc-f12-detail"),src=document.getElementById(id);openModal(btn.textContent||"Detalle",src?src.innerHTML:"<p>Sin datos disponibles.</p>")}})}
  function boot(){setup()}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){setTimeout(boot,400)},{once:true});else setTimeout(boot,400);
  setTimeout(boot,1200);setTimeout(boot,2500);document.addEventListener("keydown",function(e){if(e.key==="Escape")closeModal()});
})();
