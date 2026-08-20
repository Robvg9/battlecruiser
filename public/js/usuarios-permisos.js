// ==== Battlecruiser · js/usuarios-permisos.js ====
// B3 — Sistema operacional de usuarios, roles y permisos.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

// ---- B3 — SISTEMA OPERACIONAL DE USUARIOS, ROLES, PERMISOS Y CONTROL
// Una sola fuente para saber quién usa la app. Evita cargarUsuario() /
async function cargarContextoUsuario() {
  if (_cargandoUsuario) return;
  _cargandoUsuario = true;
  try {
    const { data: sesion } = await client.auth.getSession();
    if (!sesion || !sesion.session) {
      limpiarContextoUsuario();
      _cargandoUsuario = false;
      return;
    }
    const authUser = sesion.session.user;
    let perfil = null;
    try {
      const { data, error } = await client.rpc("perfil_usuario_actual", {});
      if (!error && data) perfil = Array.isArray(data) ? data[0] : data;
    } catch (e) { }

    if (perfil) {
      _usuarioActual = {
        id: perfil.id || authUser.id,
        nombre: perfil.nombre || authUser.email,
        activo: perfil.activo !== false,
        role_id: perfil.role_id || null,
        rol: perfil.rol || null,
      };
    } else {
      _usuarioActual = {
        id: authUser.id,
        nombre: authUser.email,
        activo: true,
        role_id: null,
        rol: null,
      };
    }

    _permisosEfectivos = {};
    _permisosCargaExitosa = false;
    _permisosCargaFallidaRed = false;
    try {
      const { data: perms, error } = await client.rpc("permisos_usuario_actual", {});
      if (error) {
        if (esErrorDeRed(error)) _permisosCargaFallidaRed = true;
      } else if (Array.isArray(perms)) {
        _permisosCargaExitosa = true;
        perms.forEach((p) => {
          if (!_permisosEfectivos[p.seccion]) _permisosEfectivos[p.seccion] = {};
          _permisosEfectivos[p.seccion][p.accion] = true;
        });
      }
    } catch (e) {
      if (esErrorDeRed(e)) _permisosCargaFallidaRed = true;
    }

    aplicarPermisosAInterfaz();
    mostrarInfoUsuarioEnHeader();
  } catch (e) {
    console.warn("[Battlecruiser] No se pudo cargar el contexto de usuario:", e);
  } finally {
    _cargandoUsuario = false;
  }
}

function limpiarContextoUsuario() {
  _usuarioActual = null;
  _permisosEfectivos = {};
  _permisosCargaExitosa = false;
  _permisosCargaFallidaRed = false;
  _novedadesVistas = new Set();
  try {
    _cache.productos = []; _cache.almacenes = []; _cache.stock = [];
    _cache.transferencias = []; _cache.vales = []; _cache.ventas = [];
  } catch (_) {}
  try {
    Object.keys(_estadoCacheClaves).forEach((k) => delete _estadoCacheClaves[k]);
  } catch (_) {}
  try { _operacionesPendientesCache = []; } catch (_) {}
  try { _turnoActual = null; } catch (_) {}
  try { _b7CacheAlertas = { turnosAbiertos: 0, cuadresPendientes: 0, cuadresDiferencia: 0, respPendientes: 0, incAbiertas: 0 }; } catch (_) {}
  try { _b8CacheAlertas = { soportePendiente: 0, convRecientes: 0 }; } catch (_) {}
  try { _comConvActual = null; _comConvActualTipo = null; } catch (_) {}
  const badge = document.getElementById("resumen-tab-badge");
  if (badge) { badge.classList.add("hidden"); badge.textContent = ""; }
  aplicarPermisosAInterfaz();
}

function tienePermiso(seccion, accion) {
  if (!_usuarioActual) return false;
  if (Object.keys(_permisosEfectivos).length === 0) {
    if (_permisosCargaFallidaRed || _permisosCargaExitosa) return false;
    return true;
  }
  const sec = _permisosEfectivos[seccion];
  return !!(sec && sec[accion]);
}

function contextoB3Disponible() {
  return !!(_usuarioActual && (_usuarioActual.rol !== null || Object.keys(_permisosEfectivos).length > 0));
}

var TAB_A_SECCION = {
  productos: "productos",
  ventas: "ventas",
  almacenes: "almacenes",
  transferencias: "transferencias",
  vales: "vales",
  pendientes: "pendientes",
  config: "config",
  usuarios: "usuarios",
  mando: "auditoria",
  reportes: "reportes",
  inventario: "reportes",
  movimientos: "reportes",
  turnos: "turnos",
  operacion: "turnos",
  comunicacion: "comunicacion",
};

function aplicarPermisosAInterfaz() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const tab = btn.dataset.tab;
    if (!tab) return;
    const seccion = (typeof TAB_A_SECCION !== "undefined" && TAB_A_SECCION) ? TAB_A_SECCION[tab] : undefined;
    if (!seccion) return;
    const permitido = tienePermiso(seccion, "ver");
    btn.classList.toggle("hidden", !permitido);
    btn.style.display = permitido ? "" : "none";
  });

  togglePorPermiso("form-producto", "productos", "crear");
  togglePorPermiso("form-compra", "compras", "crear");
  togglePorPermiso("form-venta-linea", "ventas", "crear");
  togglePorPermiso("form-almacen", "almacenes", "crear");
  togglePorPermiso("form-transferencia", "transferencias", "crear");
  togglePorPermiso("form-vale", "vales", "crear");
  togglePorPermiso("form-categoria", "config", "crear");
  togglePorPermiso("form-unidad", "config", "crear");
  togglePorPermiso("form-nuevo-usuario", "usuarios", "crear");
}

function togglePorPermiso(elId, seccion, accion) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.classList.toggle("hidden", !tienePermiso(seccion, accion));
}

function mostrarInfoUsuarioEnHeader() {
  const el = document.getElementById("user-email");
  if (!el) return;
  if (!_usuarioActual) { el.textContent = ""; return; }
  const nombre = _usuarioActual.nombre || "";
  const rol = _usuarioActual.rol ? " · " + _usuarioActual.rol : "";
  el.textContent = nombre + rol;
}

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
      acciones = '<span class="usuario-acciones">'
        + '<button type="button" class="cc-accion usr-estado-btn" data-id="' + escHtml(u.id) + '" data-activo="' + (u.activo !== false ? "true" : "false") + '">' + (u.activo !== false ? "Desactivar" : "Activar") + '</button>'
        + "</span>";
    }
    div.innerHTML = '<span class="usuario-principal">'
      + '<span class="usuario-nombre">' + escHtml(u.nombre || "—") + '</span>'
      + '<span class="muted">' + selectRol + ' · ' + estado + '</span>'
      + '</span>' + acciones;
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
      return;
    }
  });
  lista.addEventListener("change", async (e) => {
    const sel = e.target.closest(".usr-rol-select");
    if (!sel) return;
    e.stopPropagation();
    await cambiarRolDesdeSelect(sel.dataset.id, sel.value, sel);
  });
});

const SECCIONES_PERMISOS = ["productos", "categorias", "almacenes", "stock",
  "transferencias", "vales_salida", "ventas", "reportes", "usuarios",
  "presentaciones", "auditoria", "turnos", "comunicacion", "unidades"];
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
    console.warn("[Battlecruiser] listar_roles_admin:", e);
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
    let acciones = '<button type="button" class="cc-accion rol-permisos-btn" data-id="' + escHtml(r.id) + '">'
      + (_rolExpandidoId === r.id ? "Ocultar permisos" : "Ver/editar permisos") + '</button>';
    if (puedeEditar && !esDueno) {
      acciones += '<button type="button" class="cc-accion rol-renombrar-btn" data-id="' + escHtml(r.id) + '" data-nombre="' + escHtml(r.nombre) + '">Renombrar</button>'
        + '<button type="button" class="cc-accion rol-estado-btn" data-id="' + escHtml(r.id) + '" data-activo="' + (r.activo !== false ? "true" : "false") + '">' + (r.activo !== false ? "Desactivar" : "Activar") + '</button>';
    }
    if (puedeBorrar && !esDueno) {
      acciones += '<button type="button" class="cc-accion rol-eliminar-btn" data-id="' + escHtml(r.id) + '" data-nombre="' + escHtml(r.nombre) + '" data-usuarios="' + (r.cantidad_usuarios || 0) + '">Eliminar</button>';
    }
    div.innerHTML = '<span class="usuario-principal">'
      + '<span class="usuario-nombre">' + escHtml(r.nombre) + (esDueno ? " 🔒" : "") + '</span>'
      + '<span class="muted">' + (r.cantidad_usuarios || 0) + ' usuario(s) · ' + estado + '</span>'
      + '</span><span class="usuario-acciones">' + acciones + '</span>';
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

    let tabla = '<table class="permisos-tabla"><thead><tr><th>Sección</th>';
    ACCIONES_PERMISOS.forEach((a) => { tabla += "<th>" + a + "</th>"; });
    tabla += "</tr></thead><tbody>";
    SECCIONES_PERMISOS.forEach((s) => {
      tabla += "<tr><td>" + s + "</td>";
      ACCIONES_PERMISOS.forEach((a) => {
        const key = s + "|" + a;
        if (!disponibles.has(key)) { tabla += "<td>—</td>"; return; }
        const checked = permitidos.has(key) ? " checked" : "";
        const disabled = esDueno ? " disabled" : "";
        tabla += '<td><input type="checkbox" class="permiso-check" data-seccion="' + s + '" data-accion="' + a + '"' + checked + disabled + '></td>';
      });
      tabla += "</tr>";
    });
    tabla += "</tbody></table>";
    if (esDueno) {
      tabla += '<p class="muted">El rol Dueño siempre tiene todos los permisos; no se puede editar.</p>';
    } else {
      tabla += '<button type="button" class="cc-accion" id="rol-permisos-guardar-btn" data-id="' + escHtml(roleId) + '">Guardar permisos</button>';
    }
    panel.innerHTML = tabla;
  } catch (e) {
    panel.innerHTML = '<p class="msg">Error al cargar permisos.</p>';
    console.warn("[Battlecruiser] permisos_por_rol:", e);
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
        if (error) {
          setMsg("msg-roles", "No se pudo crear el rol: " + escHtml(error.message || error.code || error), false);
          return;
        }
        setMsg("msg-roles", "Rol creado. Asignale permisos con \"Ver/editar permisos\".", true);
        form.reset();
        await refrescarRolesAdmin();
      } catch (err) {
        setMsg("msg-roles", "Error inesperado al crear el rol.", false);
        console.error("[Battlecruiser] crear_rol", err);
      } finally {
        hideLoading();
      }
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
      const nuevo = window.prompt("Nuevo nombre para el rol \"" + renombrarBtn.dataset.nombre + "\":", renombrarBtn.dataset.nombre);
      if (!nuevo || !nuevo.trim() || nuevo.trim() === renombrarBtn.dataset.nombre) return;
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
        if (error) { setMsg("msg-roles", "No se pudo cambiar el estado: " + escHtml(error.message || error.code || error), false); return; }
        setMsg("msg-roles", activar ? "Rol activado." : "Rol desactivado.", true);
        await refrescarRolesAdmin();
      } finally { hideLoading(); }
      return;
    }

    const eliminarBtn = e.target.closest(".rol-eliminar-btn");
    if (eliminarBtn) {
      e.stopPropagation();
      const cantUsuarios = parseInt(eliminarBtn.dataset.usuarios || "0", 10);
      if (cantUsuarios > 0) {
        setMsg("msg-roles", "No se puede eliminar \"" + eliminarBtn.dataset.nombre + "\": " + cantUsuarios + " usuario(s) todavía lo tienen asignado.", false);
        return;
      }
      if (!window.confirm("¿Eliminar el rol \"" + eliminarBtn.dataset.nombre + "\"? Esta acción no se puede deshacer.")) return;
      showLoading();
      try {
        const { error } = await client.rpc("eliminar_rol", { p_role_id: eliminarBtn.dataset.id });
        if (error) { setMsg("msg-roles", "No se pudo eliminar: " + escHtml(error.message || error.code || error), false); return; }
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
      const checks = panel.querySelectorAll(".permiso-check");
      const payload = Array.from(checks).map((c) => ({
        seccion: c.dataset.seccion,
        accion: c.dataset.accion,
        permitido: c.checked,
      }));
      showLoading();
      try {
        const { error } = await client.rpc("actualizar_permisos_rol", { p_role_id: guardarBtn.dataset.id, p_permisos: payload });
        if (error) { setMsg("msg-roles", "No se pudieron guardar los permisos: " + escHtml(error.message || error.code || error), false); return; }
        setMsg("msg-roles", "Permisos guardados. Los usuarios con este rol ya tienen los permisos nuevos.", true);
        if (typeof registrarAuditoria === "function") {
          registrarAuditoria("rol_permisos", "Permisos del rol actualizados.", "exito", guardarBtn.dataset.id, null, null);
        }
      } finally { hideLoading(); }
      return;
    }
  });
});

Object.assign(window, {
  _usuarioActual: function () { return _usuarioActual; },
  _permisosEfectivosRef: function () { return _permisosEfectivos; },
  cargarContextoUsuario,
  limpiarContextoUsuario,
  tienePermiso,
  contextoB3Disponible,
  usuarioPuedeOperar,
  refrescarUsuarios,
  cambiarRolDesdeSelect,
  cambiarEstadoUsuario,
  refrescarRolesAdmin,
});
