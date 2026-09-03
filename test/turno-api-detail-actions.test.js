const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function stable(value) { return JSON.stringify(value); }

function loadApi() {
  let lastRpc = null;
  const sessions = [
    { access_token: 'prev-token', refresh_token: 'prev-refresh', user: { id: 'original-user' } },
    { access_token: 'sub-token', refresh_token: 'sub-refresh', user: { id: 'sub-user' } }
  ];
  const authCalls = [];
  let sessionIndex = 0;
  const rpc = async (name, params) => {
    lastRpc = { name, params };
    if (name === 'obtener_email_por_nombre_usuario') return { data: 'sustituto@example.com', error: null };
    return { data: { ok: true }, error: null };
  };
  const from = () => ({
    select: () => ({
      eq: () => ({
        order: async () => ({ data: [{ id: 'tramo-1', estado: 'ACTIVO' }], error: null })
      })
    })
  });
  const auth = {
    getSession: async () => ({ data: { session: sessions[sessionIndex] } }),
    signInWithPassword: async ({ email, password }) => {
      authCalls.push({ type: 'signInWithPassword', email, password });
      sessionIndex = 1;
      return { data: { user: { id: 'sub-user', email } }, error: null };
    },
    setSession: async (session) => {
      authCalls.push({ type: 'setSession', session });
      sessionIndex = 0;
      return { data: { session }, error: null };
    }
  };
  const context = {
    navigator: { onLine: true },
    crypto: { randomUUID: () => '00000000-0000-0000-0000-000000000000' },
    client: { rpc, from, auth },
    showLoading() {},
    resetLoadingOverlay() {},
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync('public/js/turno-api.js', 'utf8'), context, { filename: 'turno-api.js' });
  return { api: context.BattleCruiserTurnoAPI, getLastRpc: () => lastRpc, getAuthCalls: () => authCalls };
}

test('interrumpirYRelevar resuelve el tramo activo y llama el RPC correcto', async () => {
  const { api, getLastRpc } = loadApi();
  await api.interrumpirYRelevar('sesion-1', 'sustituto-1', 'Emergencia');
  assert.equal(stable(getLastRpc()), stable({
    name: 'bc_interrumpir_y_relevar',
    params: { p_turno_tramo_id: 'tramo-1', p_sustituto_id: 'sustituto-1', p_motivo: 'Emergencia' }
  }));
});

test('registrarEntregaInventario expone el contrato moderno', async () => {
  const { api, getLastRpc } = loadApi();
  await api.registrarEntregaInventario('turno-1', null, 'Entrega normal');
  assert.equal(stable(getLastRpc()), stable({
    name: 'bc_registrar_entrega_inventario',
    params: { p_turno_id: 'turno-1', p_usuario_receptor: null, p_comentario: 'Entrega normal' }
  }));
});

test('configurarDuracion normaliza boolean y días', async () => {
  const { api, getLastRpc } = loadApi();
  await api.configurarDuracion(1, '7');
  assert.equal(stable(getLastRpc()), stable({
    name: 'bc_configurar_duracion_turnos',
    params: { p_habilitada: true, p_dias_fijos: 7 }
  }));
});

test('editarDiasTurno llama la RPC correcta', async () => {
  const { api, getLastRpc } = loadApi();
  await api.editarDiasTurno('turno-2', '5');
  assert.equal(stable(getLastRpc()), stable({
    name: 'bc_editar_dias_turno',
    params: { p_turno_id: 'turno-2', p_nuevos_dias: 5 }
  }));
});

test('autenticarSustituto restaura la sesión principal después de autenticar temporalmente', async () => {
  const { api, getAuthCalls } = loadApi();
  const result = await api.autenticarSustituto('Roberto', 'secreto-prueba');
  assert.equal(result.id, 'sub-user');
  const calls = getAuthCalls();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].type, 'signInWithPassword');
  assert.equal(calls[0].email, 'sustituto@example.com');
  assert.equal(calls[1].type, 'setSession');
  assert.equal(calls[1].session.refresh_token, 'prev-refresh');
});
