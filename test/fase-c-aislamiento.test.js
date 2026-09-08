// ============================================================
// Fase C — Tests de aislamiento de cola/caché por usuario,
// reconciliación B7/B8, XSS, auditoría redundante y bug de categoría.
// ============================================================

const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");
const fs = require("fs");
const path = require("path");

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
      if (nombre === "actualizar_producto") return { data: params.p_producto_id, error: null };
      if (nombre === "cambiar_estado_producto") return { data: params.p_producto_id, error: null };
      if (nombre === "crear_producto") return { data: "prod-uuid-nuevo", error: null };
      if (nombre === "registrar_compra") return { data: "compra-uuid", error: null };
      if (nombre === "registrar_venta") return { data: "venta-uuid", error: null };
      if (nombre === "registrar_transferencia") return { data: "trf-uuid", error: null };
      if (nombre === "registrar_vale_salida") return { data: "vale-uuid", error: null };
      if (nombre === "enviar_mensaje") return { data: { id: "msg-uuid" }, error: null };
      if (nombre === "crear_conversacion") return { data: { id: "conv-uuid" }, error: null };
      if (nombre === "abrir_turno") return { data: { id: "turno-uuid" }, error: null };
      return { data: null, error: { message: "Could not find the function" } };
    },
    from: () => ({
      select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
    __rpcCalls: rpcCalls,
  };
  return client;
}
