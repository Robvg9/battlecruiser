// Continuación B3 admin — se carga tras usuarios-permisos.js
// v9.2.57 — catálogo de secciones alineado con Operaciones (gastos/mermas/bajas/reinversiones)
async function usuarioPuedeOperar() {
  if (!_usuarioActual) return false;
  if (!contextoB3Disponible()) return true;
  if (!navigator.onLine) return _usuarioActual.activo !== false;
  try {
    const { data, error } = await client.rpc("usuario_esta_activo", {});
    if (!error) {
      _usuarioActual.activo = data === true;
      return data === true;
    }
  } catch (e) { }
  return _usuarioActual.activo !== false;
}

function sincronizarUsuarioIdParaOperaciones() {
  if (_usuarioActual && _usuarioActual.id) {
    _usuarioActualId = _usuarioActual.id;
  }
}

let _usuariosCache = [];
let _rolesCache = [];

async function refrescarUsuarios() {
  if (!tienePermiso("usuarios", "ver")) {
    setEmpty("lista-usuarios", "No tenés permiso para ver usuarios.");
    return;
  }
  setLoading("lista-usuarios", "Cargando usuarios…");
  await refrescarRoles();
  try {
    const { data, error } = await client.rpc("listar_usuarios_admin", {});
    if (error) {
      const msg = String(error.message || error.code || error);
      if (esRpcFaltante(error)) {
        setEmpty("lista-usuarios", "Falta aplicar supabase/b3-roles-permisos.sql en Supabase (función listar_usuarios_admin).");
      } else {
        setEmpty("lista-usuarios", "No se pudieron cargar los usuarios: " + escHtml(msg));
      }
      return;
    }
    _usuariosCache = data || [];
    renderizarUsuarios(_usuariosCache);
  } catch (e) {
    setEmpty("lista-usuarios", "Error al cargar usuarios.");
    console.warn("[Battlecruiser] listar_usuarios_admin:", e);
  }
}

function renderizarUsuarios(usuarios) {
  const lista = document.getElementById("lista-usuarios");
  if (!lista) return;
  if (!usuarios || usuarios.length === 0) {
    setEmpty("lista-usuarios", "Todavía no hay usuarios registrados.");
    return;
  }
  lista.innerHTML = "";
  const puedeEditar = tienePermiso("usuarios", "editar");
  usuarios.forEach((u) => {
    const div = document.createElement("div");
    div.className = "lista-item usuario-item" + (u.activo === false ? " usuario-inactivo" : "");
    const estado = u.activo === false ? "🔴 Inactivo" : "🟢 Activo";
    let selectRol = '<span class="usuario-rol-fijo">Rol: ' + escHtml(u.rol || "—") + '</span>';
    if (puedeEditar) {
      const opciones = _rolesCache.map((r) => {
        const sel = r.id === u.role_id ? " selected" : "";
        return '<option value="' + escHtml(r.id) + '"' + sel + '>' + escHtml(r.nombre) + '</option>';
      }).join("");
      selectRol = '<select class="usr-rol-select" data-id="' + escHtml(u.id) + '">' + opciones + '</select>';
    }
    let acciones = "";
    if (puedeEditar) {
      acciones = '<span class="usuario-acciones"><button type="button" class="cc-accion usr-estado-btn" data-id="' + escHtml(u.id) + '" data-activo="' + (u.activo !== false ? "true" : "false") + '">' + (u.activo !== false ? "Desactivar" : "Activar") + '</button></span>';
    }
    div.innerHTML = '<span class="usuario-principal"><span class="usuario-nombre">' + escHtml(u.nombre || "—") + '</span><span class="muted">' + selectRol + ' · ' + estado + '</span></span>' + acciones;
    lista.appendChild(div);
  });
}

async function refrescarRoles(incluirInactivos) {
  try {
    const { data, error } = await client.rpc("listar_roles_admin", { p_incluir_inactivos: !!incluirInactivos });
    if (error) { _rolesCache = []; return; }
    _rolesCache = data || [];
  } catch (e) { _rolesCache = []; }
}

async function cambiarRolDesdeSelect(usuarioId, roleId, selectEl) {
  if (!tienePermiso("usuarios", "editar")) return;
  const rol = _rolesCache.find((r) => r.id === roleId);
  const { error } = await client.rpc("asignar_rol_usuario", { p_usuario_id: usuarioId, p_role_id: roleId });
  if (error) {
    setMsg("msg-usuarios", "No se pudo cambiar el rol: " + escHtml(error.message || error.code || error), false);
    await refrescarUsuarios();
    return;
  }
  setMsg("msg-usuarios", "Rol actualizado.", true);
  if (typeof registrarAuditoria === "function") {
    registrarAuditoria("usuario_rol", "Rol de usuario cambiado a '" + (rol ? rol.nombre : roleId) + "'.", "exito", usuarioId, null, null);
  }
  await refrescarUsuarios();
}

async function cambiarEstadoUsuario(usuarioId, activoActual) {
  if (!tienePermiso("usuarios", "editar")) return;
  const nuevo = activoActual !== true;
  const { error } = await client.rpc("cambiar_estado_usuario", { p_usuario_id: usuarioId, p_activo: nuevo });
  if (error) {
    setMsg("msg-usuarios", "No se pudo cambiar el estado: " + escHtml(error.message || error.code || error), false);
    return;
  }
  setMsg("msg-usuarios", nuevo ? "Usuario activado." : "Usuario desactivado.", true);
  if (typeof registrarAuditoria === "function") {
    registrarAuditoria("usuario_estado", nuevo ? "Usuario activado." : "Usuario desactivado.", "exito", usuarioId, null, null);
  }
  await refrescarUsuarios();
}

safeInit("admin-usuarios", () => {
  const lista = document.getElementById("lista-usuarios");
  if (!lista) return;
  lista.addEventListener("click", async (e) => {
    const estBtn = e.target.closest(".usr-estado-btn");
    if (estBtn) {
      e.stopPropagation();
      await cambiarEstadoUsuario(estBtn.dataset.id, estBtn.dataset.activo === "true");
    }
  });
  lista.addEventListener("change", async (e) => {
    const sel = e.target.closest(".usr-rol-select");
    if (!sel) return;
    e.stopPropagation();
    await cambiarRolDesdeSelect(sel.dataset.id, sel.value, sel);
  });
});

// Catálogo local de respaldo (si catalogo_permisos_admin no responde).
// Incluye Operaciones: gastos, mermas, bajas, reinversiones.
const SECCIONES_PERMISOS = [
  "productos", "categorias", "almacenes", "stock",
  "transferencias", "vales_salida", "ventas", "reportes", "usuarios",
  "presentaciones", "auditoria", "turnos", "comunicacion", "unidades",
  "ciclos", "entregas_caja",
  "gastos", "mermas", "bajas", "reinversiones"
];
const ACCIONES_PERMISOS = ["ver", "crear", "editar", "borrar", "editar_any"];
let _rolExpandidoId = null;
let _permisosRolActual = [];

async function refrescarRolesAdmin() {
  if (!tienePermiso("usuarios", "ver")) {
    setEmpty("lista-roles", "No tenés permiso para ver roles.");
    return;
  }
  setLoading("lista-roles", "Cargando roles…");
  try {
    const { data, error } = await client.rpc("listar_roles_admin", { p_incluir_inactivos: true });
    if (error) {
      setEmpty("lista-roles", "No se pudieron cargar los roles: " + escHtml(error.message || error.code || error));
      return;
    }
    renderizarRolesAdmin(data || []);
  } catch (e) {
    setEmpty("lista-roles", "Error al cargar roles.");
  }
}

function renderizarRolesAdmin(roles) {
  const cont = document.getElementById("lista-roles");
  if (!cont) return;
  if (!roles || roles.length === 0) {
    setEmpty("lista-roles", "Todavía no hay roles.");
    return;
  }
  const puedeEditar = tienePermiso("usuarios", "editar");
  const puedeBorrar = tienePermiso("usuarios", "borrar");
  cont.innerHTML = "";
  roles.forEach((r) => {
    const esDueno = r.nombre === "Dueño";
    const div = document.createElement("div");
    div.className = "lista-item rol-item" + (r.activo === false ? " usuario-inactivo" : "");
    const estado = r.activo === false ? "🔴 Inactivo" : "🟢 Activo";
    let acciones = '<button type="button" class="cc-accion rol-permisos-btn" data-id="' + escHtml(r.id) + '">' + (_rolExpandidoId === r.id ? "Ocultar permisos" : "Ver/editar permisos") + '</button>';
    if (puedeEditar && !esDueno) {
      acciones += '<button type="button" class="cc-accion rol-renombrar-btn" data-id="' + escHtml(r.id) + '" data-nombre="' + escHtml(r.nombre) + '">Renombrar</button><button type="button" class="cc-accion rol-estado-btn" data-id="' + escHtml(r.id) + '" data-activo="' + (r.activo !== false ? "true" : "false") + '">' + (r.activo !== false ? "Desactivar" : "Activar") + '</button>';
    }
    if (puedeBorrar && !esDueno) {
      acciones += '<button type="button" class="cc-accion rol-eliminar-btn" data-id="' + escHtml(r.id) + '" data-nombre="' + escHtml(r.nombre) + '" data-usuarios="' + (r.cantidad_usuarios || 0) + '">Eliminar</button>';
    }
    div.innerHTML = '<span class="usuario-principal"><span class="usuario-nombre">' + escHtml(r.nombre) + (esDueno ? " 🔒" : "") + '</span><span class="muted">' + (r.cantidad_usuarios || 0) + ' usuario(s) · ' + estado + '</span></span><span class="usuario-acciones">' + acciones + '</span>';
    cont.appendChild(div);
    if (_rolExpandidoId === r.id) {
      const panel = document.createElement("div");
      panel.className = "rol-permisos-panel";
      panel.id = "rol-permisos-panel";
      panel.innerHTML = '<p class="muted">Cargando permisos…</p>';
      cont.appendChild(panel);
      cargarYRenderizarPermisosRol(r.id, esDueno);
    }
  });
}

async function cargarYRenderizarPermisosRol(roleId, esDueno) {
  // Si existe el renderer canónico (fix-permisos-rol), usarlo: lee catalogo_permisos_admin.
  if (window.__bcFixPermisosRol50 && window.cargarYRenderizarPermisosRolCanonico) {
    return window.cargarYRenderizarPermisosRolCanonico(roleId, esDueno);
  }
  const panel = document.getElementById("rol-permisos-panel");
  if (!panel) return;
  try {
    const { data, error } = await client.rpc("permisos_por_rol", { p_role_id: roleId });
    if (error) {
      panel.innerHTML = '<p class="msg">No se pudieron cargar los permisos: ' + escHtml(error.message || error.code || error) + '</p>';
      return;
    }
    _permisosRolActual = data || [];
    const permitidos = new Set(_permisosRolActual.filter((p) => p.permitido).map((p) => p.seccion + "|" + p.accion));
    const disponibles = new Set(_permisosRolActual.map((p) => p.seccion + "|" + p.accion));
    // Unir secciones del backend con el catálogo local (por si faltan filas en el rol).
    const secciones = SECCIONES_PERMISOS.slice();
    _permisosRolActual.forEach(function (p) {
      if (p.seccion && secciones.indexOf(p.seccion) < 0) secciones.push(p.seccion);
    });
    let tabla = '<table class="permisos-tabla"><thead><tr><th>Sección</th>';
    ACCIONES_PERMISOS.forEach((a) => { tabla += "<th>" + a + "</th>"; });
    tabla += "</tr></thead><tbody>";
    secciones.forEach((s) => {
      tabla += "<tr><td>" + s + "</td>";
      ACCIONES_PERMISOS.forEach((a) => {
        const key = s + "|" + a;
        // Mostrar checkbox si existe en backend O si es una sección conocida del catálogo local
        // (así se pueden conceder gastos/mermas aunque el rol aún no tenga la fila).
        const conocida = SECCIONES_PERMISOS.indexOf(s) >= 0;
        if (!disponibles.has(key) && !conocida) { tabla += "<td>—</td>"; return; }
        if (!disponibles.has(key) && conocida && ["ver", "crear", "editar", "borrar"].indexOf(a) < 0) {
          tabla += "<td>—</td>";
          return;
        }
        const checked = permitidos.has(key) ? " checked" : "";
        const disabled = esDueno ? " disabled" : "";
        tabla += '<td><input type="checkbox" class="permiso-check" data-seccion="' + s + '" data-accion="' + a + '"' + checked + disabled + '></td>';
      });
      tabla += "</tr>";
    });
    tabla += "</tbody></table>";
    if (esDueno) tabla += '<p class="muted">El rol Dueño siempre tiene todos los permisos; no se puede editar.</p>';
    else tabla += '<button type="button" class="cc-accion" id="rol-permisos-guardar-btn" data-id="' + escHtml(roleId) + '">Guardar permisos</button>';
    panel.innerHTML = tabla;
  } catch (e) {
    panel.innerHTML = '<p class="msg">Error al cargar permisos.</p>';
  }
}

safeInit("admin-roles", () => {
  const form = document.getElementById("form-nuevo-rol");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("rol-nombre");
      const nombre = input.value.trim();
      if (!nombre) return;
      showLoading();
      try {
        const { error } = await client.rpc("crear_rol", { p_nombre: nombre });
        if (error) { setMsg("msg-roles", "No se pudo crear el rol: " + escHtml(error.message || error.code || error), false); return; }
        setMsg("msg-roles", "Rol creado. Asignale permisos con Ver/editar permisos.", true);
        form.reset();
        await refrescarRolesAdmin();
      } catch (err) {
        setMsg("msg-roles", "Error inesperado al crear el rol.", false);
      } finally { hideLoading(); }
    });
  }
  const lista = document.getElementById("lista-roles");
  if (!lista) return;
  lista.addEventListener("click", async (e) => {
    const permisosBtn = e.target.closest(".rol-permisos-btn");
    if (permisosBtn) {
      e.stopPropagation();
      const id = permisosBtn.dataset.id;
      _rolExpandidoId = (_rolExpandidoId === id) ? null : id;
      await refrescarRolesAdmin();
      return;
    }
    const renombrarBtn = e.target.closest(".rol-renombrar-btn");
    if (renombrarBtn) {
      e.stopPropagation();
      const nuevo = window.prompt("Nuevo nombre:", renombrarBtn.dataset.nombre);
      if (!nuevo || !nuevo.trim()) return;
      showLoading();
      try {
        const { error } = await client.rpc("editar_rol", { p_role_id: renombrarBtn.dataset.id, p_nombre: nuevo.trim() });
        if (error) { setMsg("msg-roles", "No se pudo renombrar: " + escHtml(error.message || error.code || error), false); return; }
        setMsg("msg-roles", "Rol renombrado.", true);
        await refrescarRolesAdmin();
        await refrescarUsuarios();
      } finally { hideLoading(); }
      return;
    }
    const estadoBtn = e.target.closest(".rol-estado-btn");
    if (estadoBtn) {
      e.stopPropagation();
      const activar = estadoBtn.dataset.activo !== "true";
      showLoading();
      try {
        const { error } = await client.rpc("activar_desactivar_rol", { p_role_id: estadoBtn.dataset.id, p_activo: activar });
        if (error) { setMsg("msg-roles", "No se pudo cambiar el estado.", false); return; }
        setMsg("msg-roles", activar ? "Rol activado." : "Rol desactivado.", true);
        await refrescarRolesAdmin();
      } finally { hideLoading(); }
      return;
    }
    const eliminarBtn = e.target.closest(".rol-eliminar-btn");
    if (eliminarBtn) {
      e.stopPropagation();
      if (parseInt(eliminarBtn.dataset.usuarios || "0", 10) > 0) {
        setMsg("msg-roles", "No se puede eliminar: hay usuarios asignados.", false);
        return;
      }
      if (!window.confirm("¿Eliminar el rol?")) return;
      showLoading();
      try {
        const { error } = await client.rpc("eliminar_rol", { p_role_id: eliminarBtn.dataset.id });
        if (error) { setMsg("msg-roles", "No se pudo eliminar.", false); return; }
        setMsg("msg-roles", "Rol eliminado.", true);
        if (_rolExpandidoId === eliminarBtn.dataset.id) _rolExpandidoId = null;
        await refrescarRolesAdmin();
      } finally { hideLoading(); }
      return;
    }
    const guardarBtn = e.target.closest("#rol-permisos-guardar-btn");
    if (guardarBtn) {
      e.stopPropagation();
      const panel = document.getElementById("rol-permisos-panel");
      if (!panel) return;
      const payload = Array.from(panel.querySelectorAll(".permiso-check")).map((c) => ({
        seccion: c.dataset.seccion, accion: c.dataset.accion, permitido: c.checked
      }));
      showLoading();
      try {
        const { error } = await client.rpc("actualizar_permisos_rol", { p_role_id: guardarBtn.dataset.id, p_permisos: payload });
        if (error) { setMsg("msg-roles", "No se pudieron guardar los permisos.", false); return; }
        setMsg("msg-roles", "Permisos guardados.", true);
      } finally { hideLoading(); }
    }
  });
});

Object.assign(window, {
  cargarContextoUsuario, limpiarContextoUsuario, tienePermiso, contextoB3Disponible,
  usuarioPuedeOperar, refrescarUsuarios, cambiarRolDesdeSelect, cambiarEstadoUsuario, refrescarRolesAdmin
});
