// ============================================================
// C3: AISLAMIENTO DE COLA OFFLINE POR USUARIO
// ============================================================

test("C3-1: obtenerOperacionesPorEstado NO devuelve operaciones de otro usuario", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window); await esperar(80);
  setUsuario(window, "usuario-A");
  await window.guardarOperacionPendiente(window.crearOperacionPendiente("venta", { p_almacen_id: "a1", p_lineas: [] }, "key-A"));
  setUsuario(window, "usuario-B");
  await window.guardarOperacionPendiente(window.crearOperacionPendiente("compra", { p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 1, p_costo_unitario: 1 }, "key-B"));
  setUsuario(window, "usuario-A");
  const opsA = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(opsA.length, 1, "Usuario A debe ver solo 1 operación (la suya)");
  assert.strictEqual(opsA[0].tipo, "venta", "La operación de A debe ser venta");
  setUsuario(window, "usuario-B");
  const opsB = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(opsB.length, 1, "Usuario B debe ver solo 1 operación (la suya)");
  assert.strictEqual(opsB[0].tipo, "compra", "La operación de B debe ser compra");
});

test("C3-2: obtenerTodasLasOperaciones NO devuelve operaciones de otro usuario", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window); await esperar(80);
  setUsuario(window, "usuario-A"); await window.guardarOperacionPendiente(window.crearOperacionPendiente("venta", {}, "key-A1"));
  setUsuario(window, "usuario-B"); await window.guardarOperacionPendiente(window.crearOperacionPendiente("compra", {}, "key-B1"));
  setUsuario(window, "usuario-A");
  const todasA = await window.obtenerTodasLasOperaciones();
  assert.strictEqual(todasA.length, 1, "Usuario A debe ver solo 1 operación total");
  assert.strictEqual(todasA[0].usuario_id, "usuario-A", "La operación debe ser de usuario-A");
});

test("C3-3: refrescarOperacionesPendientesCache NO mezcla operaciones entre usuarios", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window); await esperar(80);
  setUsuario(window, "usuario-A"); await window.guardarOperacionPendiente(window.crearOperacionPendiente("venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 5 }] }, "key-A"));
  setUsuario(window, "usuario-B"); await window.guardarOperacionPendiente(window.crearOperacionPendiente("venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 10 }] }, "key-B"));
  setUsuario(window, "usuario-A"); await window.refrescarOperacionesPendientesCache();
  assert.strictEqual(window._operacionesPendientesCache.length, 1, "Cache de A debe tener 1 operación");
  assert.strictEqual(window._operacionesPendientesCache[0].usuario_id, "usuario-A");
});

test("C3-4: sincronizarCola NO procesa operaciones de otro usuario", async () => {
  const { window, client } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window); await esperar(80);
  setUsuario(window, "usuario-A");
  await window.guardarOperacionPendiente(window.crearOperacionPendiente("venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 1 }] }, "key-A"));
  // A partir de aquí solo medimos las llamadas producidas por el intento de B.
  const llamadasAntesDeCambiarA_B = client.__rpcCalls.length;
  setUsuario(window, "usuario-B");
  await window.sincronizarCola(); await esperar(50);
  const llamadasPosteriores = client.__rpcCalls.slice(llamadasAntesDeCambiarA_B);
  const ventaRpc = llamadasPosteriores.find((c) => c.nombre === "registrar_venta");
  assert.ok(!ventaRpc, "Usuario B NO debe haber procesado la venta de usuario A");
  setUsuario(window, "usuario-A");
  const opsA = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(opsA.length, 1, "La operación de A debe seguir pendiente");
});

test("C3-5: logout/login no mezcla cola (limpiarContextoUsuario limpia proyección)", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window); await esperar(80);
  setUsuario(window, "usuario-A"); await window.guardarOperacionPendiente(window.crearOperacionPendiente("venta", {}, "key-A"));
  await window.refrescarOperacionesPendientesCache();
  assert.strictEqual(window._operacionesPendientesCache.length, 1, "A tiene 1 op en proyección");
  window.limpiarContextoUsuario();
  assert.strictEqual(window._operacionesPendientesCache.length, 0, "Tras logout, proyección debe estar vacía");
  assert.strictEqual(window._usuarioActual, null, "Tras logout, _usuarioActual debe ser null");
});

test("C3-6: obtenerOperacionesVisiblesPanel NO devuelve operaciones de otro usuario", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window); await esperar(80);
  setUsuario(window, "usuario-A"); await window.guardarOperacionPendiente(window.crearOperacionPendiente("venta", {}, "key-A"));
  setUsuario(window, "usuario-B"); await window.guardarOperacionPendiente(window.crearOperacionPendiente("compra", {}, "key-B"));
  setUsuario(window, "usuario-A"); const visiblesA = await window.obtenerOperacionesVisiblesPanel();
  assert.strictEqual(visiblesA.length, 1, "Panel de A debe mostrar solo 1 op");
  assert.strictEqual(visiblesA[0].usuario_id, "usuario-A");
});

test("C3-7: actualizarContadorColaPendiente NO cuenta operaciones de otro usuario", async () => {
  const { window, document } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window); await esperar(80);
  setUsuario(window, "usuario-A");
  await window.guardarOperacionPendiente(window.crearOperacionPendiente("venta", {}, "key-A"));
  await window.guardarOperacionPendiente(window.crearOperacionPendiente("compra", {}, "key-A2"));
  setUsuario(window, "usuario-B"); await window.guardarOperacionPendiente(window.crearOperacionPendiente("venta", {}, "key-B"));
  setUsuario(window, "usuario-A"); await window.actualizarContadorColaPendiente(); await esperar(30);
  const badge = document.getElementById("cola-pendientes-badge");
  assert.ok(badge.textContent.includes("2"), "Badge de A debe mostrar 2 pendientes (no 3)");
});

// ============================================================
// C2: AISLAMIENTO DE CACHÉ ENTRE USUARIOS
// ============================================================

test("C2-1: idbSet/idbGet aislan por usuario (B no lee caché de A)", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window); await esperar(80);
  setUsuario(window, "usuario-A"); await window.idbSet("productos", [{ id: "p1", nombre: "Producto de A" }]);
  setUsuario(window, "usuario-B");
  const cacheB = await window.idbGet("productos");
  assert.ok(!cacheB || !cacheB.datos || cacheB.datos.length === 0, "Usuario B NO debe ver caché de A");
  setUsuario(window, "usuario-A");
  const cacheA = await window.idbGet("productos");
  assert.ok(cacheA && cacheA.datos && cacheA.datos.length === 1, "Usuario A debe ver SU caché");
  assert.strictEqual(cacheA.datos[0].nombre, "Producto de A");
});
