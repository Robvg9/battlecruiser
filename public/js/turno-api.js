// BattleCruiser — turno-api.js
// Capa única de acceso al contrato backend TURNO (RPC bc_*).
// Fuente de verdad: Documento Maestro Notion 2026-08-28 + introspección live.
// NO inventa firmas. Si el backend rechaza argumentos, se propaga el error real.
// Mutaciones: online-only. No encola ni simula éxito offline.
(function (global) {
  'use strict';

  const TIMEOUT_MS = 25000;
  const RPC = {
    crearTurno: 'bc_crear_turno',
    crearSesion: 'bc_crear_turno_sesion',
    asignarSesion: 'bc_asignar_turno_sesion',
    iniciarSesion: 'bc_iniciar_turno_sesion',
    cerrarSesion: 'bc_cerrar_turno_sesion',
    interrumpirRelevar: 'bc_interrumpir_y_relevar',
    declararDinero: 'bc_declarar_dinero',
    enviarAprobacion: 'bc_enviar_turno_a_aprobacion',
    aprobarTurno: 'bc_aprobar_turno',
    aprobarDiferencia: 'bc_aprobar_diferencia',
    crearDescuento: 'bc_crear_descuento',
    registrarEntregaInv: 'bc_registrar_entrega_inventario',
    recibirEntregaInv: 'bc_recibir_entrega_inventario',
    recibirYCrearSucesor: 'bc_recibir_entrega_inventario_y_crear_sucesor',
    prepararSucesor: 'bc_preparar_turno_sucesor',
    crearSucesor: 'bc_crear_sucesor_turno',
    turnoEstado: 'bc_turno_estado',
    turnoTransition: 'bc_turno_transition',
    actorIsAdmin: 'bc_actor_is_admin',
    listarTurnos: 'listar_turnos',
    turnoActualUsuario: 'turno_actual_usuario',
    configObtener: 'bc_obtener_configuracion_turnos',
    configDuracion: 'bc_configurar_duracion_turnos',
    editarDias: 'bc_editar_dias_turno'
  };

  function uuid() { return crypto.randomUUID(); }

  function onlineRequired() {
    if (!navigator.onLine) {
      const err = new Error('Esta operación de Turno requiere Internet.');
      err.code = 'OFFLINE';
      throw err;
    }
  }

  function clientOk() {
    if (typeof client === 'undefined' || !client || !client.rpc) {
      throw new Error('Cliente Supabase no disponible.');
    }
  }

  function normalize(data) {
    if (data == null) return null;
    if (Array.isArray(data)) return data.length === 1 ? data[0] : data;
    return data;
  }

  async function callRpc(name, params) {
    clientOk();
    onlineRequired();
    let timer = null;
    try {
      if (typeof showLoading === 'function') showLoading();
      const call = client.rpc(name, params || {});
      const timeout = new Promise(function (_, reject) {
        timer = setTimeout(function () {
          reject(new Error('Tiempo de espera agotado (' + Math.round(TIMEOUT_MS / 1000) + 's).'));
        }, TIMEOUT_MS);
      });
      const r = await Promise.race([call, timeout]);
      if (typeof marcarConectividadReal === 'function') {
        const offline = r && r.error && typeof esErrorDeRed === 'function' && esErrorDeRed(r.error);
        marcarConectividadReal(offline ? 'offline' : 'online');
      }
      if (r && r.error) {
        const err = new Error(r.error.message || String(r.error));
        err.code = r.error.code || r.error.details || 'RPC_ERROR';
        err.rpc = name;
        err.raw = r.error;
        throw err;
      }
      return normalize(r ? r.data : null);
    } catch (e) {
      if (typeof esErrorDeRed === 'function' && esErrorDeRed(e) && typeof marcarConectividadReal === 'function') {
        marcarConectividadReal('offline');
      }
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
      if (typeof resetLoadingOverlay === 'function') resetLoadingOverlay();
      else if (typeof hideLoading === 'function') hideLoading();
    }
  }

  const TurnoAPI = {
    RPC: RPC,
    uuid: uuid,

    crearTurno: function (opts) {
      opts = opts || {};
      return callRpc(RPC.crearTurno, {
        p_almacen_id: opts.almacenId,
        p_fecha_inicio: opts.inicioPlan,
        p_dias: opts.cantidadDias,
        p_asignaciones: opts.asignaciones || []
      });
    },

    crearSesion: function (turnoId, numeroDia, bloque, fecha, almacenId) {
      return callRpc(RPC.crearSesion, {
        p_turno_id: turnoId,
        p_numero_dia: Number(numeroDia),
        p_bloque: bloque,
        p_fecha: fecha,
        p_almacen_id: almacenId
      });
    },

    asignarSesion: function (sesionId, usuarioId) {
      return callRpc(RPC.asignarSesion, { p_turno_sesion_id: sesionId, p_usuario_id: usuarioId });
    },

    iniciarSesion: function (sesionId) {
      return callRpc(RPC.iniciarSesion, { p_turno_sesion_id: sesionId });
    },

    cerrarSesion: function (sesionId) {
      return callRpc(RPC.cerrarSesion, { p_turno_sesion_id: sesionId });
    },

    interrumpirYRelevar: function (tramoId, sustitutoId, motivo) {
      return callRpc(RPC.interrumpirRelevar, {
        p_turno_tramo_id: tramoId,
        p_sustituto_id: sustitutoId,
        p_motivo: motivo || 'Emergencia'
      });
    },

    declararDinero: function (tramoId, monto) {
      return callRpc(RPC.declararDinero, { p_turno_tramo_id: tramoId, p_monto: Number(monto) });
    },

    enviarAprobacion: function (turnoId) {
      return callRpc(RPC.enviarAprobacion, { p_turno_id: turnoId });
    },

    aprobarTurno: function (turnoId, observacion) {
      return callRpc(RPC.aprobarTurno, { p_turno_id: turnoId, p_comentario: observacion || null });
    },

    aprobarDiferencia: function (diferenciaId, observacion) {
      return callRpc(RPC.aprobarDiferencia, { p_diferencia_id: diferenciaId, p_comentario: observacion || null });
    },

    crearDescuento: function (opts) {
      opts = opts || {};
      return callRpc(RPC.crearDescuento, {
        p_turno_id: opts.turnoId,
        p_usuario_id: opts.usuarioId,
        p_monto: Number(opts.monto),
        p_motivo: opts.motivo || '',
        p_turno_sesion_id: opts.sesionId || null,
        p_turno_tramo_id: opts.tramoId || null
      });
    },

    registrarEntregaInventario: function (turnoId, observacion) {
      return callRpc(RPC.registrarEntregaInv, {
        p_turno_id: turnoId,
        p_usuario_receptor: null,
        p_comentario: observacion || null
      });
    },

    recibirEntregaInventario: function (entregaId, observacion) {
      return callRpc(RPC.recibirEntregaInv, {
        p_entrega_id: entregaId,
        p_comentario: observacion || null
      });
    },

    recibirYCrearSucesor: function (entregaId, dias, conDiferencias, observacion) {
      return callRpc(RPC.recibirYCrearSucesor, {
        p_entrega_id: entregaId,
        p_dias_sucesor: dias != null ? Number(dias) : null,
        p_con_diferencias: !!conDiferencias,
        p_comentario: observacion || null
      });
    },

    prepararSucesor: function (turnoId) {
      return callRpc(RPC.prepararSucesor, { p_turno_id: turnoId });
    },

    crearSucesor: function (turnoAnteriorId, dias) {
      return callRpc(RPC.crearSucesor, {
        p_turno_anterior_id: turnoAnteriorId,
        p_dias: dias != null ? Number(dias) : null
      });
    },

    turnoEstado: function (turnoId) {
      return callRpc(RPC.turnoEstado, { p_turno_id: turnoId });
    },

    turnoTransition: function (turnoId, nuevoEstado) {
      return callRpc(RPC.turnoTransition, { p_turno_id: turnoId, p_new_estado: nuevoEstado });
    },

    actorIsAdmin: function () {
      return callRpc(RPC.actorIsAdmin, {});
    },

    listarTurnos: function (opts) {
      opts = opts || {};
      return callRpc(RPC.listarTurnos, {
        p_usuario_id: opts.usuarioId || null,
        p_estado: opts.estado || null,
        p_almacen_id: opts.almacenId || null,
        p_limite: opts.limit != null ? opts.limit : 50,
        p_offset: opts.offset != null ? opts.offset : 0
      });
    },

    turnoActualUsuario: function () { return callRpc(RPC.turnoActualUsuario, {}); },

    configObtener: function () { return callRpc(RPC.configObtener, {}); },
    obtenerConfiguracion: function () { return callRpc(RPC.configObtener, {}); },

    configDuracion: function (habilitada, diasFijos) {
      return callRpc(RPC.configDuracion, {
        p_habilitada: !!habilitada,
        p_dias_fijos: diasFijos != null ? Number(diasFijos) : null
      });
    },

    editarDiasTurno: function (turnoId, nuevosDias) {
      return callRpc(RPC.editarDias, {
        p_turno_id: turnoId,
        p_nuevos_dias: Number(nuevosDias)
      });
    },

    autenticarSustituto: async function (usuarioOEmail, password) {
      clientOk();
      onlineRequired();
      if (!usuarioOEmail || !password) throw new Error('Usuario y contraseña del sustituto son obligatorios.');
      let prevSession = null;
      try {
        const sess = await client.auth.getSession();
        prevSession = sess && sess.data && sess.data.session;
        let email = String(usuarioOEmail).trim();
        if (email && email.indexOf('@') === -1 && typeof client.rpc === 'function') {
          try {
            const r = await client.rpc('obtener_email_por_nombre_usuario', { p_nombre_usuario: usuarioOEmail });
            if (!r.error && r.data) email = typeof r.data === 'string' ? r.data : (r.data.email || email);
          } catch (e) {}
        }
        const sign = await client.auth.signInWithPassword({ email: email, password: password });
        if (sign.error) throw sign.error;
        const sustituto = sign.data && sign.data.user;
        if (!sustituto) throw new Error('No se pudo autenticar al sustituto.');
        if (prevSession && prevSession.refresh_token) {
          await client.auth.setSession({ access_token: prevSession.access_token, refresh_token: prevSession.refresh_token });
        }
        return { id: sustituto.id, email: sustituto.email };
      } catch (e) {
        try {
          if (prevSession && prevSession.refresh_token) {
            await client.auth.setSession({ access_token: prevSession.access_token, refresh_token: prevSession.refresh_token });
          }
        } catch (x) {}
        throw e;
      }
    },

    labelEstado: function (e) {
      const k = String(e || '').toUpperCase();
      return ({
        PROGRAMADO: 'Programado', EN_CURSO: 'En curso', PENDIENTE_APROBACION: 'Pendiente de aprobación',
        CERRADO: 'Cerrado', CANCELADO: 'Cancelado', PENDIENTE: 'Pendiente', COMPLETADA: 'Completada',
        EN_CURSO_SESION: 'En curso', ACTIVO: 'Activo', PLANIFICADO: 'Programado',
        EN_VALIDACION: 'Pendiente de aprobación', VALIDADO: 'Cerrado'
      })[k] || e || '—';
    },

    mapEstadoLegacy: function (e) {
      const k = String(e || '').toUpperCase();
      if (k === 'PLANIFICADO') return 'PROGRAMADO';
      if (k === 'ACTIVO') return 'EN_CURSO';
      if (k === 'EN_VALIDACION') return 'PENDIENTE_APROBACION';
      if (k === 'VALIDADO' || k === 'ARCHIVADO') return 'CERRADO';
      return k;
    }
  };

  global.BattleCruiserTurnoAPI = TurnoAPI;
})(typeof window !== 'undefined' ? window : globalThis);
