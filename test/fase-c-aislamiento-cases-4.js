// ============================================================
// Fase C — C3-MIG: migración IndexedDB v2 -> v3.
// Este archivo se evalúa dentro del scope de fase-c-aislamiento.test.js
// y reutiliza montarEntornoConIdb, setUsuario, marcarOnline, PERFIL, etc.
// ============================================================

function idbAbrirVersion(idb, nombre, version, onUpgrade) {
  return new Promise((resolve, reject) => {
    const req = idb.open(nombre, version);
    if (onUpgrade) req.onupgradeneeded = () => onUpgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPutOps(idb, nombre, store, registros) {
  return new Promise((resolve, reject) => {
    const req = idb.open(nombre, 2);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(store, "readwrite");
      for (const r of registros) tx.objectStore(store).put(r);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function prepararV2ConOps(ops) {
  const DB_NAME = "battlecruiser-cache";
  const OPS = "operaciones_pendientes";
  return async (idb) => {
    const db = await idbAbrirVersion(idb, DB_NAME, 2, (d) => {
      if (!d.objectStoreNames.contains("lecturas")) d.createObjectStore("lecturas", { keyPath: "clave" });
      if (!d.objectStoreNames.contains(OPS)) {
        const store = d.createObjectStore(OPS, { keyPath: "id" });
        store.createIndex("estado", "estado", { unique: false });
        store.createIndex("creado_en", "creado_en", { unique: false });
      }
    });
    db.close();
    if (ops && ops.length) await idbPutOps(idb, DB_NAME, OPS, ops);
    const dbCheck = await idbAbrirVersion(idb, DB_NAME, 2);
    const storeCheck = dbCheck.transaction(OPS, "readonly").objectStore(OPS);
    assert.ok(
      !storeCheck.indexNames.contains("usuario_id"),
      "Pre-migración (v2): el índice usuario_id NO debe existir. Índices: " + Array.from(storeCheck.indexNames).join(", ")
    );
    dbCheck.close();
  };
}

// C3-MIG: la apertura de la app en v3 debe crear el índice usuario_id,
// conservar los índices v2, conservar las operaciones y mantener el
// aislamiento por usuario.
test("C3-MIG: migración IndexedDB v2 -> v3 crea índice usuario_id sin perder operaciones ni romper aislamiento", async () => {
  const opA = {
    id: "op-A-1", tipo: "venta", payload: {}, usuario_id: "usuario-A",
    creado_en: "2024-01-01T00:00:00.000Z", actualizado_en: "2024-01-01T00:00:00.000Z",
    estado: "PENDIENTE", intentos: 0, ultimo_intento: null, ultimo_error: null,
    idempotency_key: "k-A-1",
  };
  const opB = {
    id: "op-B-1", tipo: "compra", payload: {}, usuario_id: "usuario-B",
    creado_en: "2024-01-01T00:00:01.000Z", actualizado_en: "2024-01-01T00:00:01.000Z",
    estado: "PENDIENTE", intentos: 0, ultimo_intento: null, ultimo_error: null,
    idempotency_key: "k-B-1",
  };

  const { window } = await montarEntornoConIdb(
    { perfil: PERFIL, permisos: PERMISOS_TODOS },
    prepararV2ConOps([opA, opB])
  );
  marcarOnline(window);
  await esperar(80);

  const OPS = "operaciones_pendientes";
  const dbMigrated = await window.idbAbrir();
  const storeInfo = await new Promise((resolve, reject) => {
    const tx = dbMigrated.transaction(OPS, "readonly");
    const store = tx.objectStore(OPS);
    const info = { storeExists: true, indexNames: Array.from(store.indexNames) };
    tx.oncomplete = () => resolve(info);
    tx.onerror = () => reject(tx.error);
  });

  assert.ok(storeInfo.storeExists, "Tras migración: operaciones_pendientes sigue existiendo");
  assert.ok(storeInfo.indexNames.includes("usuario_id"), "Tras migración: el índice usuario_id debe existir. Índices presentes: " + storeInfo.indexNames.join(", "));
  assert.ok(storeInfo.indexNames.includes("estado"), "Tras migración: el índice estado (v2) se conserva");
  assert.ok(storeInfo.indexNames.includes("creado_en"), "Tras migración: el índice creado_en (v2) se conserva");

  const todasCrudas = await new Promise((resolve, reject) => {
    const tx = dbMigrated.transaction(OPS, "readonly");
    const req2 = tx.objectStore(OPS).getAll();
    req2.onsuccess = () => resolve(req2.result || []);
    req2.onerror = () => reject(req2.error);
  });
  assert.strictEqual(todasCrudas.length, 2, "Tras migración: las 2 operaciones originales deben seguir existiendo");
  assert.deepStrictEqual(
    todasCrudas.map((o) => o.id).sort(),
    ["op-A-1", "op-B-1"],
    "Las operaciones originales conservan sus ids"
  );

  setUsuario(window, "usuario-A");
  const opsA = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(opsA.length, 1, "Usuario A solo debe ver 1 operación tras migración");
  assert.strictEqual(opsA[0].usuario_id, "usuario-A", "La operación visible para A es de usuario-A");
  assert.strictEqual(opsA[0].tipo, "venta", "La operación visible para A es la venta original");

  setUsuario(window, "usuario-B");
  const opsB = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(opsB.length, 1, "Usuario B solo debe ver 1 operación tras migración");
  assert.strictEqual(opsB[0].usuario_id, "usuario-B", "La operación visible para B es de usuario-B");
  assert.strictEqual(opsB[0].tipo, "compra", "La operación visible para B es la compra original");

  dbMigrated.close();
});

// C3-MIG2: segunda apertura en v3 debe ser idempotente.
test("C3-MIG2: re-abrir en v3 (índice usuario_id ya existe) es idempotente", async () => {
  const opA = {
    id: "op-A-2", tipo: "venta", payload: {}, usuario_id: "usuario-A",
    creado_en: "2024-01-02T00:00:00.000Z", estado: "PENDIENTE",
    intentos: 0, idempotency_key: "k-A-2",
  };

  const { window } = await montarEntornoConIdb(
    { perfil: PERFIL, permisos: PERMISOS_TODOS },
    prepararV2ConOps([opA])
  );
  marcarOnline(window);
  await esperar(80);

  const OPS = "operaciones_pendientes";
  const db1 = await window.idbAbrir();
  const store1 = db1.transaction(OPS, "readonly").objectStore(OPS);
  assert.ok(store1.indexNames.contains("usuario_id"), "Tras migración: el índice usuario_id existe");
  db1.close();

  window._idbConexionReset();
  const db2 = await window.idbAbrir();
  assert.ok(db2, "Re-abrir en v3 con índice usuario_id existente no debe fallar");
  const store2 = db2.transaction(OPS, "readonly").objectStore(OPS);
  assert.ok(store2.indexNames.contains("usuario_id"), "El índice usuario_id sigue presente tras re-abrir");

  setUsuario(window, "usuario-A");
  const ops = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(ops.length, 1, "La operación de A persiste tras re-abrir en v3");
  assert.strictEqual(ops[0].id, "op-A-2");
  db2.close();
});
