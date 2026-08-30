// BattleCruiser — turno-api.js
// Capa única de acceso al contrato backend TURNO (RPC bc_*).
// Fuente de verdad: Documento Maestro Notion 2026-08-28 + introspección live.
// NO inventa firmas. Si el backend rechaza argumentos, se propaga el error real.
// Mutaciones: online-only. No encola ni simula éxito offline.
(function (global) {
  'use strict';

  const TIMEOUT_MS = 25000;
  const RPC = {
    crearTurno: 'bc_crear_turno', crearSesion: 'bc_crear_turno_sesion', asignarSesion: 'bc_asignar_turno_sesion',
    iniciarSesion: 'bc_iniciar_turno_sesion', cerrarSesion: 'bc_cerrar_turno_sesion', interrumpirRelevar: 'bc_interrumpir_y_relevar',
    declararDinero: 'bc_declarar_dinero', enviarAprobacion: 'bc_enviar_turno_a_aprobacion', aprobarTurno: 'bc_aprobar_turno',
    aprobarDiferencia: 'bc_aprobar_diferencia', crearDescuento: 'bc_crear_descuento', registrarEntregaInv: 'bc_registrar_entrega_inventario',
    recibirEntregaInv: 'bc_recibir_entrega_inventario', recibirYCrearSucesor: 'bc_recibir_entrega_inventario_y_crear_sucesor',
    prepararSucesor: 'bc_preparar_turno_sucesor', crearSucesor: 'bc_crear_sucesor_turno', turnoEstado: 'bc_turno_estado',
    turnoTransition: 'bc_turno_transition', actorIsAdmin: 'bc_actor_is_admin', listarTurnos: 'listar_turnos', listarTurnosMaestros: 'bc_listar_turnos_maestros_home',
    configObtener: 'bc_obtener_configuracion_turnos', configDuracion: 'bc_configurar_duracion_turnos', editarDias: 'bc_editar_dias_turno',
    registrarLlegadaCompra: 'bc_registrar_llegada_compra', confirmarRecepcionCompra: 'bc_confirmar_recepcion_compra'
  };

  function uuid() { return crypto.randomUUID(); }
  function onlineRequired() { if (!navigator.onLine) { const e = new Error('Esta operación de Turno requiere Internet.'); e.code = 'OFFLINE'; throw e; } }
  function clientOk() { if (typeof client === 'undefined' || !client || !client.rpc) throw new Error('Cliente Supabase no disponible.'); }
  function normalize(data) { if (data == null) return null; if (Array.isArray(data)) return data.length === 1 ? data[0] : data; return data; }

  async function callRpc(name, params) {
    clientOk(); onlineRequired(); let timer = null;
    try {
      if (typeof showLoading === 'function') showLoading();
      const call = client.rpc(name, params || {});
      const timeout = new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error('Tiempo de espera agotado (' + Math.round(TIMEOUT_MS / 1000) + 's).')); }, TIMEOUT_MS); });
      const r = await Promise.race([call, timeout]);
      if (typeof marcarConectividadReal === 'function') marcarConectividadReal(r && r.error && typeof esErrorDeRed === 'function' && esErrorDeRed(r.error) ? 'offline' : 'online');
      if (r && r.error) { const e = new Error(r.error.message || String(r.error)); e.code = r.error.code || r.error.details || 'RPC_ERROR'; e.rpc = name; e.raw = r.error; throw e; }
      return normalize(r ? r.data : null);
    } catch (e) {
      if (typeof esErrorDeRed === 'function' && esErrorDeRed(e) && typeof marcarConectividadReal === 'function') marcarConectividadReal('offline');
      throw e;
    } finally {
      if (timer) clearTimeout(timer); if (typeof resetLoadingOverlay === 'function') resetLoadingOverlay(); else if (typeof hideLoading === 'function') hideLoading();
    }
  }

  async function selectTable(table, columns, filterColumn, filterValue, orderColumn) {
    clientOk(); onlineRequired();
    if (!client.from) throw new Error('Cliente Supabase no permite consultas directas.');
    let q = client.from(table).select(columns || '*');
    if (filterColumn) q = q.eq(filterColumn, filterValue);
    if (orderColumn) q = q.order(orderColumn, { ascending: true });
    const r = await q;
    if (r && r.error) { const e = new Error(r.error.message || String(r.error)); e.code = r.error.code || 'QUERY_ERROR'; e.table = table; e.raw = r.error; throw e; }
    return r && r.data ? r.data : [];
  }

  const TurnoAPI = {
    RPC: RPC, uuid: uuid,
    crearTurno: function (o) { o=o||{}; return callRpc(RPC.crearTurno,{p_almacen_id:o.almacenId,p_fecha_inicio:o.inicioPlan,p_dias:o.cantidadDias,p_asignaciones:o.asignaciones||[]}); },
    crearSesion: function (id,d,b,f,a) { return callRpc(RPC.crearSesion,{p_turno_id:id,p_numero_dia:Number(d),p_bloque:b,p_fecha:f,p_almacen_id:a}); },
    asignarSesion: function (s,u) { return callRpc(RPC.asignarSesion,{p_turno_sesion_id:s,p_usuario_id:u}); },
    iniciarSesion: function (s) { return callRpc(RPC.iniciarSesion,{p_turno_sesion_id:s}); },
    cerrarSesion: function (s) { return callRpc(RPC.cerrarSesion,{p_turno_sesion_id:s}); },
    interrumpirYRelevar: async function (sesionId, sustitutoId, motivo) {
      const tramos = await selectTable('turno_tramos','*','turno_sesion_id',sesionId,'inicio_at');
      const activo = (tramos || []).find(function (t) { return String(t.estado || '').toUpperCase() === 'ACTIVO'; });
      if (!activo || !activo.id) throw new Error('No hay un tramo activo para interrumpir.');
      return callRpc(RPC.interrumpirRelevar,{p_turno_tramo_id:activo.id,p_sustituto_id:sustitutoId,p_motivo:motivo||'Emergencia'});
    },
    declararDinero: function (t,m) { return callRpc(RPC.declararDinero,{p_turno_tramo_id:t,p_monto:Number(m)}); },
    enviarAprobacion: function (t) { return callRpc(RPC.enviarAprobacion,{p_turno_id:t}); },
    enviarAAprobacion: function (t) { return callRpc(RPC.enviarAprobacion,{p_turno_id:t}); },
    aprobarTurno: function (t,o) { return callRpc(RPC.aprobarTurno,{p_turno_id:t,p_comentario:o||null}); },
    aprobarDiferencia: function (d,o) { return callRpc(RPC.aprobarDiferencia,{p_diferencia_id:d,p_comentario:o||null}); },
    crearDescuento: function (o) { o=o||{}; return callRpc(RPC.crearDescuento,{p_turno_id:o.turnoId,p_usuario_id:o.usuarioId,p_monto:Number(o.monto),p_motivo:o.motivo||'',p_turno_sesion_id:o.sesionId||null,p_turno_tramo_id:o.tramoId||null}); },
    registrarEntregaInventario: function (t,o) { return callRpc(RPC.registrarEntregaInv,{p_turno_id:t,p_usuario_receptor:null,p_comentario:o||null}); },
    recibirEntregaInventario: function (e,o) { return callRpc(RPC.recibirEntregaInv,{p_entrega_id:e,p_comentario:o||null}); },
    recibirEntregaInventarioConDiferencias: function (e,c,o) { return callRpc(RPC.recibirEntregaInv,{p_entrega_id:e,p_con_diferencias:!!c,p_comentario:o||null}); },
    recibirYCrearSucesor: function (e,d,c,o) { return callRpc(RPC.recibirYCrearSucesor,{p_entrega_id:e,p_dias_sucesor:d!=null?Number(d):null,p_con_diferencias:!!c,p_comentario:o||null}); },
    registrarLlegadaCompra: function (compraId, almacenId, observacion) { return callRpc(RPC.registrarLlegadaCompra,{p_compra_id:compraId,p_almacen_id:almacenId,p_observacion:observacion||null}); },
    confirmarRecepcionCompra: function (recepcionId, aceptar, observacion) { return callRpc(RPC.confirmarRecepcionCompra,{p_recepcion_id:recepcionId,p_aceptar:!!aceptar,p_observacion:observacion||null}); },
    prepararSucesor: function (t) { return callRpc(RPC.prepararSucesor,{p_turno_id:t}); },
    crearSucesor: function (t,d) { return callRpc(RPC.crearSucesor,{p_turno_anterior_id:t,p_dias:d!=null?Number(d):null}); },
    turnoEstado: function (t) { return callRpc(RPC.turnoEstado,{p_turno_id:t}); },
    estado: function (t) { return callRpc(RPC.turnoEstado,{p_turno_id:t}); },
    turnoTransition: function (t,e) { return callRpc(RPC.turnoTransition,{p_turno_id:t,p_new_estado:e}); },
    actorIsAdmin: function () { return callRpc(RPC.actorIsAdmin,{}); },
    listarTurnos: function (o) { o=o||{}; return callRpc(RPC.listarTurnos,{p_usuario_id:o.usuarioId||null,p_estado:o.estado||null,p_almacen_id:o.almacenId||null,p_limite:o.limit!=null?o.limit:50,p_offset:o.offset!=null?o.offset:0}); },
    listarTurnosMaestros: function (o) { o=o||{}; return callRpc(RPC.listarTurnosMaestros,{p_limite:o.limit!=null?o.limit:100,p_offset:o.offset!=null?o.offset:0}); },
    listarSesionesTurno: function (turnoId) { return selectTable('turno_sesiones','*','turno_id',turnoId,'numero_dia'); },
    listarTramosSesion: function (sesionId) { return selectTable('turno_tramos','*','turno_sesion_id',sesionId,'inicio_at'); },
    configObtener: function () { return callRpc(RPC.configObtener,{}); },
    obtenerConfiguracion: function () { return callRpc(RPC.configObtener,{}); },
    configDuracion: function (h,d) { return callRpc(RPC.configDuracion,{p_habilitada:!!h,p_dias_fijos:d!=null?Number(d):null}); },
    configurarDuracion: function (h,d) { return callRpc(RPC.configDuracion,{p_habilitada:!!h,p_dias_fijos:d!=null?Number(d):null}); },
    editarDiasTurno: function (t,d) { return callRpc(RPC.editarDias,{p_turno_id:t,p_nuevos_dias:Number(d)}); },
    autenticarSustituto: async function (usuarioOEmail,password) {
      clientOk(); onlineRequired();
      if(!usuarioOEmail||!password) throw new Error('Usuario y contraseña del sustituto son obligatorios.');
      let email=String(usuarioOEmail).trim();
      if(email&&email.indexOf('@')===-1&&typeof client.rpc==='function'){
        try{
          const r=await client.rpc('obtener_email_por_nombre_usuario',{p_nombre_usuario:usuarioOEmail});
          if(!r.error&&r.data)email=typeof r.data==='string'?r.data:(r.data.email||email);
        }catch(e){}
      }
      const supabaseGlobal = global.supabase || (typeof window!=='undefined' ? window.supabase : null);
      const createClient = supabaseGlobal && typeof supabaseGlobal.createClient==='function' ? supabaseGlobal.createClient : null;
      const url = client.supabaseUrl || client.rest && client.rest.url ? String(client.supabaseUrl || client.rest.url).replace(/\/rest\/v1\/?$/,'') : null;
      const key = client.supabaseKey || client.headers && (client.headers.apikey || client.headers['apikey']);
      if(!createClient || !url || !key) throw new Error('No se pudo preparar autenticación aislada del sustituto.');
      const secondary = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'bc-substitute-validation'}});
      try {
        const sign=await secondary.auth.signInWithPassword({email:email,password:password});
        if(sign.error)throw sign.error;
        const sustituto=sign.data&&sign.data.user;
        if(!sustituto)throw new Error('No se pudo autenticar al sustituto.');
        return {id:sustituto.id,email:sustituto.email};
      } finally { try { await secondary.auth.signOut(); } catch(e) {} }
    },
    labelEstado: function (e) { const k=String(e||'').toUpperCase(); return ({PROGRAMADO:'Programado',EN_CURSO:'En curso',PENDIENTE_APROBACION:'Pendiente de aprobación',CERRADO:'Cerrado',CANCELADO:'Cancelado',PENDIENTE:'Pendiente',COMPLETADA:'Completada',EN_CURSO_SESION:'En curso',ACTIVO:'Activo',PLANIFICADO:'Programado',EN_VALIDACION:'Pendiente de aprobación',VALIDADO:'Cerrado'})[k]||e||'—'; },
    mapEstadoLegacy: function (e) { const k=String(e||'').toUpperCase(); if(k==='PLANIFICADO')return'PROGRAMADO';if(k==='ACTIVO')return'EN_CURSO';if(k==='EN_VALIDACION')return'PENDIENTE_APROBACION';if(k==='VALIDADO'||k==='ARCHIVADO')return'CERRADO';return k; }
  };
  global.BattleCruiserTurnoAPI=TurnoAPI;
})(typeof window!=='undefined'?window:globalThis);