const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadApi() {
  let lastCall = null;
  const rpc = async (name, params) => {
    lastCall = { name, params };
    return { data: { ok: true }, error: null };
  };
  const context = {
    navigator: { onLine: true },
    crypto: { randomUUID: () => '00000000-0000-0000-0000-000000000000' },
    client: { rpc },
    showLoading() {},
    resetLoadingOverlay() {},
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync('public/js/turno-api.js', 'utf8'), context, { filename: 'turno-api.js' });
  return { api: context.BattleCruiserTurnoAPI, getLastCall: () => lastCall };
}

test('expone RPC de registrar llegada de compra con contrato correcto', async () => {
  const { api, getLastCall } = loadApi();
  const result = await api.registrarLlegadaCompra('compra-1', 'almacen-1', 'Sin novedad');
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(getLastCall(), {
    name: 'bc_registrar_llegada_compra',
    params: { p_compra_id: 'compra-1', p_almacen_id: 'almacen-1', p_observacion: 'Sin novedad' }
  });
});

test('expone RPC de confirmar recepción de compra con contrato correcto', async () => {
  const { api, getLastCall } = loadApi();
  const result = await api.confirmarRecepcionCompra('recepcion-1', true, 'Recibida completa');
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(getLastCall(), {
    name: 'bc_confirmar_recepcion_compra',
    params: { p_recepcion_id: 'recepcion-1', p_aceptar: true, p_observacion: 'Recibida completa' }
  });
});

test('normaliza observación vacía a null y aceptar a boolean', async () => {
  const { api, getLastCall } = loadApi();
  await api.registrarLlegadaCompra('compra-2', 'almacen-2');
  assert.deepEqual(getLastCall().params, {
    p_compra_id: 'compra-2', p_almacen_id: 'almacen-2', p_observacion: null
  });
  await api.confirmarRecepcionCompra('recepcion-2', 0);
  assert.deepEqual(getLastCall().params, {
    p_recepcion_id: 'recepcion-2', p_aceptar: false, p_observacion: null
  });
});
