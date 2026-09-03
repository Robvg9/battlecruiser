// BattleCruiser — turno-api.js
// Capa única de acceso al contrato backend TURNO (RPC bc_*).
(function (global) {
  'use strict';
  const TIMEOUT_MS=25000;
  const RPC={crearTurno:'bc_crear_turno',crearSesion:'bc_crear_turno_sesion',asignarSesion:'bc_asignar_turno_sesion',iniciarSesion:'bc_iniciar_turno_sesion',cerrarSesion:'bc_cerrar_turno_sesion',interrumpirRelevar:'bc_interrumpir_y_relevar',declararDinero:'bc_declarar_dinero',enviarAprobacion:'bc_enviar_turno_a_aprobacion',aprobarTurno:'bc_aprobar_turno',aprobarDiferencia:'bc_aprobar_diferencia',crearDescuento:'bc_crear_descuento',registrarEntregaInv:'bc_registrar_entrega_inventario',recibirEntregaInv:'bc_recibir_entrega_inventario',recibirYCrearSucesor:'bc_recibir_entrega_inventario_y_crear_sucesor',prepararSucesor:'bc_preparar_turno_sucesor',crearSucesor:'bc_crear_sucesor_turno',turnoEstado:'bc_turno_estado',turnoTransition:'bc_turno_transition',actorIsAdmin:'bc_actor_is_admin',listarTurnos:'listar_turnos',listarTurnosMaestros:'bc_listar_turnos_maestros_home',anularTurno:'bc_anular_turno',configObtener:'bc_obtener_configuracion_turnos',configDuracion:'bc_configurar_duracion_turnos',editarDias:'bc_editar_dias_turno',registrarLlegadaCompra:'bc_registrar_llegada_compra',confirmarRecepcionCompra:'bc_confirmar_recepcion_compra',expediente:'bc_obtener_expediente_turno'};
  function uuid(){return crypto.randomUUID()}
  function onlineRequired(){if(!navigator.onLine){const e=new Error('Esta operación de Turno requiere Internet.');e.code='OFFLINE';throw e}}
  function clientOk(){if(typeof client==='undefined'||!client||!client.rpc)throw new Error('Cliente Supabase no disponible.')}
  function normalize(data){if(data==null)return null;return Array.isArray(data)?(data.length===1?data[0]:data):data}
  async function callRpc(name,params){clientOk();onlineRequired();let timer=null;try{if(typeof showLoading==='function')showLoading();const call=client.rpc(name,params||{});const timeout=new Promise((_,rej)=>{timer=setTimeout(()=>rej(new Error('Tiempo de espera agotado (25s).')),TIMEOUT_MS)});const r=await Promise.race([call,timeout]);if(r&&r.error){const e=new Error(r.error.message||String(r.error));e.code=r.error.code||'RPC_ERROR';e.rpc=name;e.raw=r.error;throw e}return normalize(r?r.data:null)}finally{if(timer)clearTimeout(timer);if(typeof resetLoadingOverlay==='function')resetLoadingOverlay();else if(typeof hideLoading==='function')hideLoading()}}
  function callRpcWithObject(o){return callRpc(o.name,o.params)}
  function registerCall(name,params){return callRpcWithObject({name,params})}
  function selectTable(table,columns,filterColumn,filterValue,orderColumn){clientOk();onlineRequired();if(!client.from)throw new Error('Cliente Supabase no permite consultas directas.');let q=client.from(table).select(columns||'*');if(filterColumn)q=q.eq(filterColumn,filterValue);if(orderColumn)q=q.order(orderColumn,{ascending:true});return q.then(r=>{if(r&&r.error){const e=new Error(r.error.message||String(r.error));e.code=r.error.code||'QUERY_ERROR';e.table=table;throw e}return r&&r.data?r.data:[]})}
  async function listarSesionesViaExpediente(id){
    if(!id) return [];
    const expediente=await callRpc(RPC.expediente,{p_turno_id:id});
    if(Array.isArray(expediente)) return expediente.length===1 && Array.isArray(expediente[0]?.sesiones) ? expediente[0].sesiones : [];
    return expediente && Array.isArray(expediente.sesiones) ? expediente.sesiones : [];
  }
  const API={
    RPC,uuid,
    crearTurno:o=>{o=o||{};return callRpc(RPC.crearTurno,{p_almacen_id:o.almacenId,p_fecha_inicio:o.inicioPlan,p_dias:o.cantidadDias,p_asignaciones:o.asignaciones||[]})},
    asignarSesion:(s,u)=>callRpc(RPC.asignarSesion,{p_turno_sesion_id:s,p_usuario_id:u}),
    iniciarSesion:s=>callRpc(RPC.iniciarSesion,{p_turno_sesion_id:s}),
    cerrarSesion:s=>callRpc(RPC.cerrarSesion,{p_turno_sesion_id:s}),
    anularTurno:(t,m)=>callRpc(RPC.anularTurno,{p_turno_id:t,p_motivo:m||null}),
    declararDinero:(t,m)=>callRpc(RPC.declararDinero,{p_turno_tramo_id:t,p_monto:Number(m)}),
    enviarAprobacion:t=>callRpc(RPC.enviarAprobacion,{p_turno_id:t}),
    aprobarTurno:(t,o)=>callRpc(RPC.aprobarTurno,{p_turno_id:t,p_comentario:o||null}),
    aprobarDiferencia:(d,o)=>callRpc(RPC.aprobarDiferencia,{p_diferencia_id:d,p_comentario:o||null}),
    crearDescuento:o=>{o=o||{};return callRpc(RPC.crearDescuento,{p_turno_id:o.turnoId,p_usuario_id:o.usuarioId,p_monto:Number(o.monto),p_motivo:o.motivo||'',p_turno_sesion_id:o.sesionId||null,p_turno_tramo_id:o.tramoId||null})},
    listarTurnos:o=>{o=o||{};return callRpc(RPC.listarTurnos,{p_usuario_id:o.usuarioId||null,p_estado:o.estado||null,p_almacen_id:o.almacenId||null,p_limite:o.limit??50,p_offset:o.offset??0})},
    listarTurnosMaestros:o=>{o=o||{};return callRpc(RPC.listarTurnosMaestros,{p_limite:o.limit??100,p_offset:o.offset??0})},
    // RLS-safe: no lectura directa de turno_sesiones. Usa la RPC del expediente, que ya es SECURITY DEFINER.
    listarSesionesTurno:listarSesionesViaExpediente,
    listarTramosSesion:id=>selectTable('turno_tramos','*','turno_sesion_id',id,'inicio_at'),
    obtenerExpedienteTurno:id=>callRpc(RPC.expediente,{p_turno_id:id}),
    actorIsAdmin:()=>callRpc(RPC.actorIsAdmin,{}),
    obtenerConfiguracion:()=>callRpc(RPC.configObtener,{}),
    registrarLlegadaCompra:(compraId,almacenId,observacion)=>callRpc(RPC.registrarLlegadaCompra,{p_compra_id:compraId,p_almacen_id:almacenId,p_observacion:observacion||null}),
    confirmarRecepcionCompra:(recepcionId,aceptar,observacion)=>callRpc(RPC.confirmarRecepcionCompra,{p_recepcion_id:recepcionId,p_aceptar:Boolean(aceptar),p_observacion:observacion||null}),
    turnoEstado:t=>callRpc(RPC.turnoEstado,{p_turno_id:t}),
    estado:t=>callRpc(RPC.turnoEstado,{p_turno_id:t}),
    labelEstado:e=>({PROGRAMADO:'Programado',EN_CURSO:'En curso',PENDIENTE_APROBACION:'Pendiente de aprobación',CERRADO:'Cerrado',CANCELADO:'Cancelado',ACTIVO:'Activo',PLANIFICADO:'Programado',EN_VALIDACION:'Pendiente de aprobación',VALIDADO:'Cerrado'})[String(e||'').toUpperCase()]||e||'—'
  };
  global.BattleCruiserTurnoAPI=API;
})(typeof window!=='undefined'?window:globalThis);