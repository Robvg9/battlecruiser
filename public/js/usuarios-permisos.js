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
    // Perfil real (nombre, activo, rol) vía RPC. Si no existe aún, fallback.
    let perfil = null;
    try {
      const { data, error } = await client.rpc("perfil_usuario_actual", {});
      if (!error && data) perfil = Array.isArray(data) ? data[0] : data;
    } catch (e) { /* RPC inexistente: perfil queda null */ }

    if (perfil) {
      _usuarioActual = {
        id: perfil.id || authUser.id,
        nombre: perfil.nombre || authUser.email,
        activo: perfil.activo !== false,
        role_id: perfil.role_id || null,
        rol: perfil.rol || null,
      };
    } else {
      // SQL de B3 aún no aplicado: contexto mínimo desde Auth (no inventa
      // rol/permisos). La app funciona como antes.
      _usuarioActual = {
        id: authUser.id,
        nombre: authUser.email,
        activo: true, // se asume activo si no hay forma de comprobarlo
        role_id: null,
        rol: null,
      };
    }

    // Permisos efectivos vía RPC (matriz seccion->accion). Si no existe,
    _permisosEfectivos = {};
    _permisosCargaExitosa = false;
    _permisosCargaFallidaRed = false;
    try {
      const { data: perms, error } = await client.rpc("permisos_usuario_actual", {});
      if (error) {
        // Error de red: NO abrir todo por un fallo de conectividad.
        if (esErrorDeRed(error)) _permisosCargaFallidaRed = true;
        // Si el error es 42883 (RPC inexistente, SQL B3 no aplicado), se
        // mantiene la degradacion legitima: ningun flag se setea en true.
      } else if (Array.isArray(perms)) {
        _permisosCargaExitosa = true;
        perms.forEach((p) => {
          if (!_permisosEfectivos[p.seccion]) _permisosEfectivos[p.seccion] = {};
          _permisosEfectivos[p.seccion][p.accion] = true;
        });
      }
    } catch (e) {
      // Excepcion de red (Failed to fetch, etc.): fallo de red, no autorizar.
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

// No borra cachés globales útiles (productos/stock), solo el contexto de
// identidad/permisos. Evita que el usuario B vea permisos del usuario A.
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
  // Multiusuario: resetear el estado en memoria de B7/B8 para que el
  try { _turnoActual = null; } catch (_) {}
  try { _b7CacheAlertas = { turnosAbiertos: 0, cuadresPendientes: 0, cuadresDiferencia: 0, respPendientes: 0, incAbiertas: 0 }; } catch (_) {}
  try { _b8CacheAlertas = { soportePendiente: 0, convRecientes: 0 }; } catch (_) {}
  // Multiusuario: resetear la conversacion abierta en memoria. Sin esto,
  try { _comConvActual = null; _comConvActualTipo = null; } catch (_) {}
  // El badge de Centro de Control se resetea para no arrastrar estado.
  const badge = document.getElementById("resumen-tab-badge");
  if (badge) { badge.classList.add("hidden"); badge.textContent = ""; }
  // Reaplicar permisos: sin usuario, todo oculto salvo login.
  aplicarPermisosAInterfaz();
}

function tienePermiso(seccion, accion) {
  if (!_usuarioActual) return false; // sin sesión: nada
  if (Object.keys(_permisosEfectivos).length === 0) {
    // Sin matriz cargada. La degradación a true solo es legítima cuando el
    if (_permisosCargaFallidaRed || _permisosCargaExitosa) return false;
    return true;
  }
  const sec = _permisosEfectivos[seccion];
  return !!(sec && sec[accion]);
}

// ¿El SQL de B3 está aplicado? (hay perfil real con rol o permisos cargados)
function contextoB3Disponible() {
  return !!(_usuarioActual && (_usuarioActual.rol !== null || Object.keys(_permisosEfectivos).length > 0));
}

// Mapa: tab -> seccion que requiere permiso "ver". El sidebar se oculta
// según permisos, pero la autorización real sigue siendo el backend.
var TAB_A_SECCION = {
  productos: "productos",
  ventas: "ventas",
  almacenes: "almacenes",
  transferencias: "transferencias",
  vales: "vales",
  pendientes: "pendientes",
  config: "config",
  usuarios: "usuarios",
  mando: "auditoria", // B4: Centro de Mando requiere permiso auditoria.ver
  reportes: "reportes", // B5: Reportes requiere permiso reportes.ver
  inventario: "reportes", // B6: Inventario requiere permiso reportes.ver
  movimientos: "reportes", // B6: Movimientos requiere permiso reportes.ver
  turnos: "turnos", // B7: Turnos requiere permiso turnos.ver
  operacion: "turnos", // B7: Operación requiere permiso turnos.ver
  comunicacion: "comunicacion", // B8: Comunicación requiere permiso comunicacion.ver
};

function aplicarPermisosAInterfaz() {
  // Sidebar: ocultar tabs sin permiso "ver". UX, no seguridad.
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const tab = btn.dataset.tab;
    if (!tab) return;
    // durante la carga inicial (showApp se dispara via getSession). Tolerante.
    const seccion = (typeof TAB_A_SECCION !== "undefined" && TAB_A_SECCION) ? TAB_A_SECCION[tab] : undefined;
    if (!seccion) return; // resumen (Centro de Control) siempre visible
    const permitido = tienePermiso(seccion, "ver");
    btn.classList.toggle("hidden", !permitido);
    btn.style.display = permitido ? "" : "none";
  });

  // Botones de creación: ocultar según "crear".
  togglePorPermiso("form-producto", "productos", "crear");
  togglePorPermiso("form-compra", "compras", "crear");
  togglePorPermiso("form-venta-linea", "ventas", "crear");
  togglePorPermiso("form-almacen", "almacenes", "crear");
  togglePorPermiso("form-transferencia", "transferencias", "crear");
  togglePorPermiso("form-vale", "vales", "crear");
  togglePorPermiso("form-categoria", "config", "crear");
  togglePorPermiso("form-unidad", "config", "crear");
}

function togglePorPermiso(elId, seccion, accion) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.classList.toggle("hidden", !tienePermiso(seccion, accion));
}

// Muestra nombre/rol del usuario en el header (reemplaza el email crudo).
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
  if (!contextoB3Disponible()) return true; // degradación: no podemos saber
  // Offline: el contexto en memoria es lo único disponible; el backend
  // validará activo al sincronizar la operación (RLS/tiene_permiso).
  if (!navigator.onLine) return _usuarioActual.activo !== false;
  // Online: validar contra el backend para bloqueo real y fresco.
  try {
    const { data, error } = await client.rpc("usuario_esta_activo", {});
    if (!error) {
      // Actualizar el contexto en memoria con el valor fresco del backend.
      _usuarioActual.activo = data === true;
      return data === true;
    }
    // Si el RPC aún no existe (SQL no aplicado), caer al contexto.
  } catch (e) { /* RPC inexistente: usar contexto */ }
  return _usuarioActual.activo !== false;
}

// crearOperacionPendiente con _usuarioActualId). Aseguramos que
// _usuarioActualId esté sincronizado con el contexto.
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
  // Refrescar roles ANTES de renderizar usuarios: el <select> de rol de
  await refrescarRoles();
  try {
    const { data, error } = await client.rpc("listar_usuarios_admin", {});
    if (error) {
      // Si el RPC no existe todavía (SQL no aplicado), mensaje claro.
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

// de renderizarUsuarios (reutiliza asignar_rol_usuario, ya protegido en
// backend). Reemplaza el flujo anterior de window.prompt() con texto libre.
async function cambiarRolDesdeSelect(usuarioId, roleId, selectEl) {
  if (!tienePermiso("usuarios", "editar")) return;
  const rol = _rolesCache.find((r) => r.id === roleId);
  const { error } = await client.rpc("asignar_rol_usuario", { p_usuario_id: usuarioId, p_role_id: roleId });
  if (error) {
    setMsg("msg-usuarios", "No se pudo cambiar el rol: " + escHtml(error.message || error.code || error), false);
    // Revertir el <select> visualmente si la llamada falló (por ejemplo,
    // protección del último Dueño activo), para no mostrar un valor que
    // en realidad no se guardó.
    await refrescarUsuarios();
    return;
  }
  setMsg("msg-usuarios", "Rol actualizado.", true);
  // B4: auditoría del cambio de rol (trazabilidad administrativa).
  if (typeof registrarAuditoria === "function") {
    registrarAuditoria("usuario_rol", "Rol de usuario cambiado a '" + (rol ? rol.nombre : roleId) + "'.", "exito", usuarioId, null, null);
  }
  await refrescarUsuarios();
}

// Cambiar estado activo/inactivo (reutiliza cambiar_estado_usuario).
async function cambiarEstadoUsuario(usuarioId, activoActual) {
  if (!tienePermiso("usuarios", "editar")) return;
  const nuevo = activoActual !== true;
  const { error } = await client.rpc("cambiar_estado_usuario", { p_usuario_id: usuarioId, p_activo: nuevo });
  if (error) {
    setMsg("msg-usuarios", "No se pudo cambiar el estado: " + escHtml(error.message || error.code || error), false);
    return;
  }
  setMsg("msg-usuarios", nuevo ? "Usuario activado." : "Usuario desactivado.", true);
  // B4: auditoría del cambio de estado (trazabilidad administrativa).
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
  // por "change" (no "click" como los botones de arriba).
  lista.addEventListener("change", async (e) => {
    const sel = e.target.closest(".usr-rol-select");
    if (!sel) return;
    e.stopPropagation();
    await cambiarRolDesdeSelect(sel.dataset.id, sel.value, sel);
  });
});

// ---- Regla de arquitectura (mission 9.3): los permisos pertenecen al ROL, no
const SECCIONES_PERMISOS = ["productos", "categorias", "almacenes", "stock",
  "transferencias", "vales_salida", "ventas", "reportes", "usuarios",
  "presentaciones", "auditoria", "turnos", "comunicacion", "unidades"];
const ACCIONES_PERMISOS = ["ver", "crear", "editar", "borrar", "editar_any"];

let _rolExpandidoId = null; // rol cuya matriz de permisos está abierta
let _permisosRolActual = []; // matriz cargada del rol expandido

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
        // B4: auditoría del cambio de permisos.
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

