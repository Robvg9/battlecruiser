// BattleCruiser — turno-api.js
// Capa única de acceso al contrato backend TURNO (RPC bc_*).
(function (global) {
  'use strict';
  const TIMEOUT_MS=25000;
  const RPC={crearTurno:'bc_crear_turno',crearSesion:'bc_crear_turno_sesion',asignarSesion:'bc_asignar_turno_sesion',iniciarSesion:'bc_iniciar_turno_sesion',cerrarSesion:'bc_cerrar_turno_sesion',interrumpirRelevar:'bc_interrumpir_y_relevar',interrumpirRelevarConDeclaracion:'bc_interrumpir_y_relevar_con_declaracion',declararDinero:'bc_declarar_dinero',enviarAprobacion:'bc_enviar_turno_a_aprobacion',aprobarTurno:'bc_aprobar_turno',aprobarDiferencia:'bc_aprobar_diferencia',crearDescuento:'bc_crear_descuento',registrarEntregaInv:'bc_registrar_entrega_inventario',recibirEntregaInv:'bc_recibir_entrega_inventario',recibirYCrearSucesor:'bc_recibir_entrega_inventario_y_crear_sucesor',prepararSucesor:'bc_preparar_turno_sucesor',crearSucesor:'bc_crear_sucesor_turno',turnoEstado:'bc_turno_estado',turnoTransition:'bc_turno_transition',actorIsAdmin:'bc_actor_is_admin',listarTurnos:'listar_turnos',listarTurnosMaestros:'bc_listar_turnos_maestros_home',anularTurno:'bc_anular_turno',configObtener:'bc_obtener_configuracion_turnos',configDuracion:'bc_configurar_duracion_turnos',editarDias:'bc_editar_dias_turno',registrarLlegadaCompra:'bc_registrar_llegada_compra',confirmarRecepcionCompra:'bc_confirmar_recepcion_compra',expediente:'bc_obtener_expediente_turno'};
  function uuid(){return crypto.randomUUID()}
  function onlineRequired(){if(!navigator.onLine){const e=new Error('Esta operación de Turno requiere Internet.');e.code='OFFLINE';throw e}}
  function clientOk(){if(typeof client==='undefined'||!client||!client.rpc)throw new Error('Cliente Supabase no disponible.')}
  function normalize(data){if(data==null)return null;return Array.isArray(data)?(data.length===1?data[0]:data):data}
  async function callRpc(name,params){clientOk();onlineRequired();let timer=null;try{if(typeof showLoading==='function')showLoading();const call=client.rpc(name,params||{});const timeout=new Promise((_,rej)=>{timer=setTimeout(()=>rej(new Error('Tiempo de espera agotado (25s).')),TIMEOUT_MS)});const r=await Promise.race([call,timeout]);if(r&&r.error){const e=new Error(r.error.message||String(r.error));e.code=r.error.code||'RPC_ERROR';e.rpc=name;e.raw=r.error;throw e}return normalize(r?r.data:null)}finally{if(timer)clearTimeout(timer);if(typeof resetLoadingOverlay==='function')resetLoadingOverlay();else if(typeof hideLoading==='function')hideLoading()}}
  async function selectTable(table,columns,filterColumn,filterValue,orderColumn){clientOk();onlineRequired();if(!client.from)throw new Error('Cliente Supabase no permite consultas directas.');let q=client.from(table).select(columns||'*');if(filterColumn)q=q.eq(filterColumn,filterValue);if(orderColumn)q=q.order(orderColumn,{ascending:true});const r=await q;if(r&&r.error){const e=new Error(r.error.message||String(r.error));e.code=r.error.code||'QUERY_ERROR';e.table=table;throw e}return r&&r.data?r.data:[]}
  async function listarSesionesViaExpediente(id){
    if(!id) return [];
    const expediente=await callRpc(RPC.expediente,{p_turno_id:id});
    if(Array.isArray(expediente)) return expediente.length===1 && Array.isArray(expediente[0]?.sesiones) ? expediente[0].sesiones : [];
    return expediente && Array.isArray(expediente.sesiones) ? expediente.sesiones : [];
  }
  async function interrumpirYRelevar(sesionId,sustitutoId,motivo,monto){
    const tramos=await selectTable('turno_tramos','*','turno_sesion_id',sesionId,'inicio_at');
    const activo=(tramos||[]).find(function(t){return String(t.estado||'').toUpperCase()==='ACTIVO';});
    if(!activo||!activo.id)throw new Error('No hay un tramo activo para interrumpir.');
    if(monto!=null)return callRpc(RPC.interrumpirRelevarConDeclaracion,{p_turno_tramo_id:activo.id,p_sustituto_id:sustitutoId,p_motivo:motivo||'Emergencia',p_monto:Number(monto)});
    return callRpc(RPC.interrumpirRelevar,{p_turno_tramo_id:activo.id,p_sustituto_id:sustitutoId,p_motivo:motivo||'Emergencia'});
  }
  async function autenticarSustituto(usuarioOEmail,password){
    clientOk(); onlineRequired();
    if(!usuarioOEmail||!password)throw new Error('Usuario y contraseña del sustituto son obligatorios.');
    if(!client.auth||!client.auth.getSession||!client.auth.signInWithPassword||!client.auth.setSession)throw new Error('Cliente Supabase no permite autenticación temporal del sustituto.');
    let prevSession=null;
    const sess=await client.auth.getSession();
    prevSession=sess&&sess.data&&sess.data.session;
    try{
      let email=String(usuarioOEmail).trim();
      if(email&&email.indexOf('@')===-1&&typeof client.rpc==='function'){
        try{const r=await client.rpc('obtener_email_por_nombre_usuario',{p_nombre_usuario:usuarioOEmail});if(!r.error&&r.data)email=typeof r.data==='string'?r.data:(r.data.email||email)}catch(e){}
      }
      const sign=await client.auth.signInWithPassword({email:email,password:password});
      if(sign.error)throw sign.error;
      const sustituto=sign.data&&sign.data.user;
      if(!sustituto)throw new Error('No se pudo autenticar al sustituto.');
      return {id:sustituto.id,email:sustituto.email};
    }finally{
      if(prevSession&&prevSession.refresh_token){try{await client.auth.setSession({access_token:prevSession.access_token,refresh_token:prevSession.refresh_token})}catch(e){}}
    }
  }
  const API={
    RPC,uuid,
    crearTurno:o=>{o=o||{};return callRpc(RPC.crearTurno,{p_almacen_id:o.almacenId,p_fecha_inicio:o.inicioPlan,p_dias:o.cantidadDias,p_asignaciones:o.asignaciones||[]})},
    asignarSesion:(s,u)=>callRpc(RPC.asignarSesion,{p_turno_sesion_id:s,p_usuario_id:u}),
    iniciarSesion:s=>callRpc(RPC.iniciarSesion,{p_turno_sesion_id:s}),
    cerrarSesion:s=>callRpc(RPC.cerrarSesion,{p_turno_sesion_id:s}),
    interrumpirYRelevar,
    anularTurno:(t,m)=>callRpc(RPC.anularTurno,{p_turno_id:t,p_motivo:m||null}),
    declararDinero:(t,m)=>callRpc(RPC.declararDinero,{p_turno_tramo_id:t,p_monto:Number(m)}),
    enviarAprobacion:t=>callRpc(RPC.enviarAprobacion,{p_turno_id:t}),
    aprobarTurno:(t,o)=>callRpc(RPC.aprobarTurno,{p_turno_id:t,p_comentario:o||null}),
    aprobarDiferencia:(d,o)=>callRpc(RPC.aprobarDiferencia,{p_diferencia_id:d,p_comentario:o||null}),
    crearDescuento:o=>{o=o||{};return callRpc(RPC.crearDescuento,{p_turno_id:o.turnoId,p_usuario_id:o.usuarioId,p_monto:Number(o.monto),p_motivo:o.motivo||'',p_turno_sesion_id:o.sesionId||null,p_turno_tramo_id:o.tramoId||null})},
    listarTurnos:o=>{o=o||{};if(String(o.estado||'').toUpperCase()==='PENDIENTE_APROBACION'){return callRpc(RPC.listarTurnosMaestros,{p_limite:o.limit??100,p_offset:o.offset??0}).then(function(data){const items=Array.isArray(data)?data:(data&&Array.isArray(data.turnos)?data.turnos:(data&&Array.isArray(data.items)?data.items:[]));return items.filter(function(t){return String((t&&t.estado_maestro)||'').toUpperCase()==='PENDIENTE_APROBACION';});});}return callRpc(RPC.listarTurnos,{p_usuario_id:o.usuarioId||null,p_estado:o.estado||null,p_almacen_id:o.almacenId||null,p_limite:o.limit??50,p_offset:o.offset??0})},
    listarTurnosMaestros:o=>{o=o||{};return callRpc(RPC.listarTurnosMaestros,{p_limite:o.limit??100,p_offset:o.offset??0})},
    // RLS-safe: no lectura directa de turno_sesiones. Usa la RPC del expediente, que ya es SECURITY DEFINER.
    listarSesionesTurno:listarSesionesViaExpediente,
    listarTramosSesion:id=>selectTable('turno_tramos','*','turno_sesion_id',id,'inicio_at'),
    obtenerExpedienteTurno:id=>callRpc(RPC.expediente,{p_turno_id:id}),
    actorIsAdmin:()=>callRpc(RPC.actorIsAdmin,{}),
    obtenerConfiguracion:()=>callRpc(RPC.configObtener,{}),
    configurarDuracion:(habilitada,diasFijos)=>callRpc(RPC.configDuracion,{p_habilitada:Boolean(habilitada),p_dias_fijos:diasFijos==null?null:Number(diasFijos)}),
    editarDiasTurno:(t,d)=>callRpc(RPC.editarDias,{p_turno_id:t,p_nuevos_dias:Number(d)}),
    registrarEntregaInventario:(t,r,c)=>callRpc(RPC.registrarEntregaInv,{p_turno_id:t,p_usuario_receptor:r||null,p_comentario:c||null}),
    autenticarSustituto,
    registrarLlegadaCompra:(compraId,almacenId,observacion)=>callRpc(RPC.registrarLlegadaCompra,{p_compra_id:compraId,p_almacen_id:almacenId,p_observacion:observacion||null}),
    confirmarRecepcionCompra:(recepcionId,aceptar,observacion)=>callRpc(RPC.confirmarRecepcionCompra,{p_recepcion_id:recepcionId,p_aceptar:Boolean(aceptar),p_observacion:observacion||null}),
    turnoEstado:t=>callRpc(RPC.turnoEstado,{p_turno_id:t}),
    estado:t=>callRpc(RPC.turnoEstado,{p_turno_id:t}),
    labelEstado:e=>({PROGRAMADO:'Programado',EN_CURSO:'En curso',PENDIENTE_APROBACION:'Pendiente de aprobación',CERRADO:'Cerrado',CANCELADO:'Cancelado',ACTIVO:'Activo',PLANIFICADO:'Programado',EN_VALIDACION:'Pendiente de aprobación',VALIDADO:'Cerrado'})[String(e||'').toUpperCase()]||e||'—'
  };
  global.BattleCruiserTurnoAPI=API;
})(typeof window!=='undefined'?window:globalThis);