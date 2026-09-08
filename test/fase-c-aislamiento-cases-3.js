test("P6-1: iniciarEdicionProducto limpia categoría cuando p.categorias es null", async () => {
  const { window, document } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  const form = document.getElementById("form-producto");
  if (form) form.scrollIntoView = () => {};
  const select = document.getElementById("prod-categoria");
  select.innerHTML = '<option value="">Categoría</option><option value="cat1">Bebidas</option><option value="cat2">Comidas</option>';

  window.iniciarEdicionProducto({ id: "p1", nombre: "Coca", categorias: { nombre: "Bebidas" } });
  assert.strictEqual(select.value, "cat1", "Debe seleccionar Bebidas");

  window.iniciarEdicionProducto({ id: "p2", nombre: "Producto sin cat", categorias: null });
  assert.strictEqual(select.value, "", "Debe limpiar la categoría (vacía) cuando el producto no tiene categoría");
});

test("P6-2: iniciarEdicionProducto mantiene categoría cuando p.categorias existe", async () => {
  const { window, document } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  const form = document.getElementById("form-producto");
  if (form) form.scrollIntoView = () => {};
  const select = document.getElementById("prod-categoria");
  select.innerHTML = '<option value="">Categoría</option><option value="cat1">Bebidas</option>';

  window.iniciarEdicionProducto({ id: "p1", nombre: "Coca", categorias: { nombre: "Bebidas" } });
  assert.strictEqual(select.value, "cat1", "Debe seleccionar Bebidas correctamente");
});
