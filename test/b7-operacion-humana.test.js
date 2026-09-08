// ============================================================
// B7 — Pruebas automatizadas: Operación Humana
// ============================================================
// Verifica: turnos (abrir/cerrar/doble apertura), cuadres (dinero
// esperado/declarado/diferencia), responsabilidades, incidencias,
// permisos, idempotencia, offline, auditoría, integración con B3/B4/B6
// y ausencia de duplicaciones arquitectónicas.
// ============================================================
// Las pruebas de lógica de negocio se validan con un mock de Supabase
// que refleja la semántica de los RPC de supabase/b7-operacion-humana.sql.
// La validación SQL real requiere aplicar el SQL (no disponible en sandbox).
// ============================================================

const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");
const fs = require("fs");
const path = require("path");

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ---- Estado simulado de turnos/cuadres/responsabilidades/incidencias ----
function crearEstadoB7() {
  const st = { turnos: {}, cuadres: {}, responsabilidades: {}, incidencias: {}, seq: 0, turnoAbierto: null };
  return {
    turnos: st.turnos, cuadres: st.cuadres, responsabilidades: st.responsabilidades, incidencias: st.incidencias,
    get turnoAbierto() { return st.turnoAbierto; },
    abrirTurno(uid, nombre, almacen_id) {
      if (st.turnoAbierto) return { id: st.turnoAbierto, estado: "ABIERTO", nota: "Ya tenés un turno abierto." };
      st.seq++;
      const id = "t" + st.seq;
      st.turnos[id] = { id, usuario_id: uid, usuario_nombre: nombre, almacen_id, fecha: "2026-08-15", apertura_real: new Date().toISOString(), estado: "ABIERTO" };
      st.turnoAbierto = id;
      return { id, estado: "ABIERTO" };
    },
    cerrarTurno(turno_id, uid) {
      const t = st.turnos[turno_id];
      if (!t) throw new Error("El turno no existe.");
      if (t.estado !== "ABIERTO") throw new Error("El turno no está abierto.");
      t.estado = "CERRADO";
      t.cierre_real = new Date().toISOString();
      st.seq++;
      const cId = "c" + st.seq;
      st.cuadres[cId] = { id: cId, turno_id, dinero_esperado: 0, dinero_declarado: null, diferencia: null, estado: "PENDIENTE" };
      if (st.turnoAbierto === turno_id) st.turnoAbierto = null;
      return { id: turno_id, estado: "CERRADO", responsabilidades_pendientes: 0 };
    },
    declararCuadre(cuadre_id, declarado) {
      const c = st.cuadres[cuadre_id];
      if (!c) throw new Error("El cuadre no existe.");
      if (c.estado === "CUADRADO" || c.estado === "APROBADO" || c.estado === "RECHAZADO")
        throw new Error("El cuadre ya está cerrado.");
      c.dinero_declarado = declarado;
      c.diferencia = declarado - c.dinero_esperado;
      c.estado = c.diferencia === 0 ? "CUADRADO" : "CON_DIFERENCIA";
      if (c.diferencia !== 0) {
        st.seq++;
        const iId = "i" + st.seq;
        st.incidencias[iId] = { id: iId, tipo: c.diferencia < 0 ? "faltante" : "sobrante", descripcion: "Diferencia de $" + c.diferencia, estado: "ABIERTA", turno_id: c.turno_id, cuadre_id };
      }
      return { id: cuadre_id, estado: c.estado, diferencia: c.diferencia };
    },
    revisarCuadre(cuadre_id, decision) {
      const c = st.cuadres[cuadre_id];
      if (!c) throw new Error("El cuadre no existe.");
      const nuevo = decision === "aprobar" ? "APROBADO" : decision === "rechazar" ? "RECHAZADO" : "EN_REVISION";
      const anterior = c.estado;
      c.estado = nuevo;
      return { id: cuadre_id, estado: nuevo, estado_anterior: anterior };
    },
    crearResponsabilidad(titulo, uid, nombre) {
      st.seq++;
      const id = "r" + st.seq;
      st.responsabilidades[id] = { id, titulo, usuario_id: uid, creador_id: uid, creador_nombre: nombre, estado: "PENDIENTE" };
      return { id, estado: "PENDIENTE" };
    },
    actualizarResponsabilidad(id, estado) {
      const r = st.responsabilidades[id];
      if (!r) throw new Error("La responsabilidad no existe.");
      r.estado = estado;
      if (estado === "COMPLETADA") r.completada_en = new Date().toISOString();
      return r;
    },
    crearIncidencia(descripcion, uid) {
      st.seq++;
      const id = "i" + st.seq;
      st.incidencias[id] = { id, descripcion, creador_id: uid, estado: "ABIERTA" };
      return { id, estado: "ABIERTA" };
    },
    resolverIncidencia(id) {
      const i = st.incidencias[id];
      if (!i) throw new Error("La incidencia no existe.");
      i.estado = "RESUELTA";
      i.resuelta_en = new Date().toISOString();
      return i;
    },
  };
}

function mockCliente({ perfil, permisos } = {}) {
  const rpcCalls = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "u-test", email: "roberto@cueva.test" } } } }),
      onAuthStateChange: () => {},
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ data: { user: {} }, error: null }),
    },
    rpc: async (nombre, params) => {
      rpcCalls.push({ nombre, params });
      if (nombre === "perfil_usuario_actual") return { data: perfil || null, error: null };
      if (nombre === "permisos_usuario_actual") return { data: permisos || [], error: null };
      if (nombre === "usuario_esta_activo") return { data: perfil ? !!perfil[0].activo : null, error: null };
      if (nombre === "registrar_auditoria") return { data: 1, error: null };
      return { data: null, error: { message: "Could not find the function" } };
    },
    from: () => ({ select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
    __rpcCalls: rpcCalls,
  };
  return client;
}

// El resto del archivo permanece sin cambios; único ajuste del contrato de UI:
// la navegación vigente expone la pantalla de turnos bajo data-tab="ciclos",
// con etiqueta visible "Turnos". data-tab="turnos" se conserva oculto.
