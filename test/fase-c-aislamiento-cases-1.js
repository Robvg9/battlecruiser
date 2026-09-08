test("C2-2: limpiarContextoUsuario limpia _cache en memoria", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  setUsuario(window, "usuario-A");
  window._cache.productos = [{ id: "p1", nombre: "Producto de A" }];
  window._cache.stock = [{ producto_id: "p1", cantidad: 100 }];

  window.limpiarContextoUsuario();
  assert.strictEqual(window._cache.productos.length, 0, "_cache.productos debe estar vacío tras logout");
  assert.strictEqual(window._cache.stock.length, 0, "_cache.stock debe estar vacío tras logout");
});

// ============================================================
// A1: RECONCILIACIÓN B7/B8
// ============================================================

test("A1-1: reconciliarTrasOperacion('mensaje') marca 'comunicacion', no 'stock'", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  window._refrescosPendientes = new Set();
  window.reconciliarTrasOperacion("mensaje", "exito");
  assert.ok(window._refrescosPendientes.has("comunicacion"), "Debe marcar 'comunicacion'");
  assert.ok(!window._refrescosPendientes.has("stock"), "NO debe marcar 'stock'");
});

test("A1-2: reconciliarTrasOperacion('conversacion') marca 'conversaciones', no 'stock'", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  window._refrescosPendientes = new Set();
  window.reconciliarTrasOperacion("conversacion", "exito");
  assert.ok(window._refrescosPendientes.has("conversaciones"), "Debe marcar 'conversaciones'");
  assert.ok(!window._refrescosPendientes.has("stock"), "NO debe marcar 'stock'");
});

test("A1-3: reconciliarTrasOperacion('responsabilidad') marca 'responsabilidades'", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  window._refrescosPendientes = new Set();
  window.reconciliarTrasOperacion("responsabilidad", "exito");
  assert.ok(window._refrescosPendientes.has("responsabilidades"), "Debe marcar 'responsabilidades'");
  assert.ok(!window._refrescosPendientes.has("stock"), "NO debe marcar 'stock'");
});

test("A1-4: reconciliarTrasOperacion('incidencia') marca 'incidencias'", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  window._refrescosPendientes = new Set();
  window.reconciliarTrasOperacion("incidencia", "exito");
  assert.ok(window._refrescosPendientes.has("incidencias"), "Debe marcar 'incidencias'");
  assert.ok(!window._refrescosPendientes.has("stock"), "NO debe marcar 'stock'");
});

test("A1-5: reconciliarTrasOperacion('turno') marca 'turnos'", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  window._refrescosPendientes = new Set();
  window.reconciliarTrasOperacion("turno", "exito");
  assert.ok(window._refrescosPendientes.has("turnos"), "Debe marcar 'turnos'");
  assert.ok(!window._refrescosPendientes.has("stock"), "NO debe marcar 'stock'");
});

test("A1-6: reconciliarTrasOperacion('venta') marca 'stock'", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  window._refrescosPendientes = new Set();
  window.reconciliarTrasOperacion("venta", "exito");
  assert.ok(window._refrescosPendientes.has("stock"), "Debe marcar 'stock'");
});

test("A1-7: reconciliarTrasOperacion con tipo desconocido no lanza", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  window._refrescosPendientes = new Set();
  assert.doesNotThrow(() => window.reconciliarTrasOperacion("tipo-desconocido-xyz", "exito"));
});

// ============================================================
// P5: AUDITORÍA REDUNDANTE
// ============================================================

