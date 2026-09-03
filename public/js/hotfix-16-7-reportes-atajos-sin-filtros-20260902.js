// BattleCruiser — 16.7: acciones rápidas no duplican filtros.
(function(){'use strict';if(window.__BC167)return;window.__BC167=true;
function install(){var tab=document.getElementById('tab-reportes');if(!tab)return false;var q=tab.querySelector('.bc-m45-quick');if(!q)return false;var filters=tab.querySelector('.bc-m42-filters');if(filters){filters.dataset.bc167='1';filters.style.display='none';}q.querySelectorAll('.bc-m45-quick-btn').forEach(function(b){if(b.dataset.bc167==='1')return;b.dataset.bc167='1';b.addEventListener('click',function(){var d=tab.querySelector('.bc-m42-detail');if(d)d.open=true;});});return true;}
function boot(){[0,400,1000,2000].forEach(function(ms){setTimeout(install,ms)});}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.__BC167_verify=function(){var f=document.querySelector('#tab-reportes .bc-m42-filters');return{quickExists:!!document.querySelector('#tab-reportes .bc-m45-quick'),filtersHidden:!!(f&&f.style.display==='none')}};
})();
