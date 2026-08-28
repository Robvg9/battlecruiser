// BattleCruiser — Turno runtime contract bridge
// Normaliza respuestas reales de Supabase para la UX maestra sin crear una segunda máquina de estados.
(function (global) {
  'use strict';
  function getApi(){ return global.BattleCruiserTurnoAPI; }
  function normalizeConfig(v){
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
    return Object.assign({}, v, {
      duracion_fija: !!v.duracion_fija_habilitada,
      habilitada: !!v.duracion_fija_habilitada,
      fija: !!v.duracion_fija_habilitada,
      dias_fijos: v.dias_fijos
    });
  }
  function install(){
    const api=getApi(); if(!api || api.__bcRuntimeBridgeInstalled) return;
    const rawEstado=api.estado;
    api.estado=async function(turnoId){
      const estado=await rawEstado(turnoId);
      // bc_turno_estado devuelve TEXT; la UX necesita también los metadatos del turno.
      if (estado && typeof estado === 'object') return estado;
      if (typeof client !== 'undefined' && client && client.from) {
        const q=await client.from('turnos').select('*').eq('id',turnoId).limit(1);
        if (!q.error && q.data && q.data[0]) {
          const row=q.data[0];
          row.estado_maestro=estado || row.estado_maestro || row.estado;
          return row;
        }
      }
      return {id:turnoId,estado_maestro:estado,estado:estado};
    };
    const rawConfig=api.obtenerConfiguracion || api.configObtener;
    if(rawConfig){
      const wrapped=async function(){ return normalizeConfig(await rawConfig()); };
      api.obtenerConfiguracion=wrapped;
      api.configObtener=wrapped;
    }
    api.__bcRuntimeBridgeInstalled=true;
  }
  install();
  global.setTimeout(install,0);
})(typeof window!=='undefined'?window:globalThis);
