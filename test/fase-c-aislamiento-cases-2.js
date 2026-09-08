test("P5-1: tipoAuditableFrontend devuelve false para tipos con trigger", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  assert.strictEqual(window.tipoAuditableFrontend("producto"), false);
  assert.strictEqual(window.tipoAuditableFrontend("producto_actualizar"), false);
  assert.strictEqual(window.tipoAuditableFrontend("producto_estado"), false);
  assert.strictEqual(window.tipoAuditableFrontend("compra"), false);
  assert.strictEqual(window.tipoAuditableFrontend("venta"), false);
  assert.strictEqual(window.tipoAuditableFrontend("transferencia"), false);
  assert.strictEqual(window.tipoAuditableFrontend("vale"), false);
});

test("P5-2: tipoAuditableFrontend devuelve true para tipos sin trigger", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  assert.strictEqual(window.tipoAuditableFrontend("turno"), true);
  assert.strictEqual(window.tipoAuditableFrontend("cuadre"), true);
  assert.strictEqual(window.tipoAuditableFrontend("responsabilidad"), true);
  assert.strictEqual(window.tipoAuditableFrontend("incidencia"), true);
  assert.strictEqual(window.tipoAuditableFrontend("mensaje"), true);
  assert.strictEqual(window.tipoAuditableFrontend("conversacion"), true);
});

test("P5-3: ejecutarOperacion('compra') NO llama registrar_auditoria (trigger lo cubre)", async () => {
  const { window, client } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);
  setUsuario(window, "u-test");

  await window.ejecutarOperacion("compra", {
    p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 1, p_costo_unitario: 1,
  });
  await esperar(30);

  const audCalls = client.__rpcCalls.filter((c) => c.nombre === "registrar_auditoria");
  assert.strictEqual(audCalls.length, 0, "compra NO debe llamar registrar_auditoria (trigger lo cubre)");
});

test("P5-4: ejecutarOperacion('venta') NO llama registrar_auditoria (trigger lo cubre)", async () => {
  const { window, client } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);
  setUsuario(window, "u-test");

  await window.ejecutarOperacion("venta", {
    p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 1 }],
  });
  await esperar(30);

  const audCalls = client.__rpcCalls.filter((c) => c.nombre === "registrar_auditoria");
  assert.strictEqual(audCalls.length, 0, "venta NO debe llamar registrar_auditoria (trigger lo cubre)");
});

test("P5-5: ejecutarOperacion('mensaje') SÍ llama registrar_auditoria (no hay trigger)", async () => {
  const { window, client } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);
  setUsuario(window, "u-test");

  await window.ejecutarOperacion("mensaje", {
    p_conversacion_id: "conv-1", p_contenido: "Hola",
  });
  await esperar(30);

  const audCalls = client.__rpcCalls.filter((c) => c.nombre === "registrar_auditoria");
  assert.ok(audCalls.length > 0, "mensaje SÍ debe llamar registrar_auditoria (no cubierto por trigger)");
});

// ============================================================
// P6: BUG DE CATEGORÍA EN iniciarEdicionProducto
// ============================================================

