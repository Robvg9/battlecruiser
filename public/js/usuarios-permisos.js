// ==== Battlecruiser · js/usuarios-permisos.js ====
// B3 — v9.2.60 M12-FE.5: _permisosEfectivos estricto; Operaciones por crear;
// vales retirado del menú.

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
        console.warn("[BattleCruiser] permisos_usuario_actual error", error);
      } else if (Array.isArray(perms)) {
        _permisosCargaExitosa = true;
        var usaCampoPermitido = perms.some(function (p) {
          return p && Object.prototype.hasOwnProperty.call(p, "permitido");
        });
        perms.forEach(function (p) {
          if (!p || !p.seccion || !p.accion) return;
          if (usaCampoPermitido) {
            if (p.permitido !== true && p.permitido !== 1 && p.permitido !== "true") return;
          }
          if (!_permisosEfectivos[p.seccion]) _permisosEfectivos[p.seccion] = {};
          _permisosEfectivos[p.seccion][p.accion] = true;
        });
        try {
          console.info("[BattleCruiser] permisos efectivos",
            Object.keys(_permisosEfectivos),
            "filas RPC:", perms.length,
            "usaCampoPermitido:", usaCampoPermitido);
        } catch (e) {}
      }
    } catch (e) {
      if (esErrorDeRed(e)) _permisosCargaFallidaRed = true;
    }

    if (typeof aplicarPermisosAInterfaz === "function") aplicarPermisosAInterfaz();
    if (typeof mostrarInfoUsuarioEnHeader === "function") mostrarInfoUsuarioEnHeader();
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
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.remove("active");
    b.classList.add("hidden", "tab-sin-permiso");
    b.setAttribute("data-bc-permiso", "0");
  });
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("visible"));
  var sinPerm = document.getElementById("bc-sin-permisos-panel");
  if (sinPerm) sinPerm.style.display = "none";
  if (typeof aplicarPermisosAInterfaz === "function") aplicarPermisosAInterfaz();
}

function tienePermiso(seccion, accion) {
  if (!_usuarioActual) return false;
  if (!_permisosCargaExitosa) return false;
  const sec = _permisosEfectivos[seccion];
  return !!(sec && sec[accion] === true);
}

function contextoB3Disponible() {
  return !!(_usuarioActual && (_usuarioActual.rol !== null || Object.keys(_permisosEfectivos).length > 0));
}

function puedeVerOperacionesLocal() {
  return (
    tienePermiso("gastos", "crear") ||
    tienePermiso("mermas", "crear") ||
    tienePermiso("reinversiones", "crear")
  );
}

var TAB_A_SECCION = {
  productos: "productos",
  ventas: "ventas",
  almacenes: "almacenes",
  transferencias: "transferencias",
  // vales: eliminado (M12-FE.5)
  usuarios: "usuarios",
  mando: "auditoria",
  reportes: "reportes",
  inventario: "reportes",
  movimientos: "reportes",
  turnos: "turnos",
  ciclos: "ciclos",
  // operacion: no usa turnos.ver
  comunicacion: "comunicacion",
};

function aplicarPermisosAInterfaz() {
  if (window.__BC_PERMISOS_CANONICO__ && typeof window.aplicarPermisosAInterfaz === "function"
      && window.aplicarPermisosAInterfaz !== aplicarPermisosAInterfaz) {
    return window.aplicarPermisosAInterfaz();
  }
  document.querySelectorAll(".tab-btn[data-tab]").forEach((btn) => {
    const tab = btn.dataset.tab;
    if (!tab) return;
    if (tab === "config" || tab === "resumen" || tab === "pendientes" || tab === "vales") {
      btn.classList.add("hidden", "tab-sin-permiso");
      btn.setAttribute("data-bc-permiso", "0");
      btn.style.setProperty("display", "none", "important");
      btn.classList.remove("active");
      const panel = document.getElementById("tab-" + tab);
      if (panel) panel.classList.remove("visible");
      return;
    }
    if (tab === "operacion") {
      const ok = puedeVerOperacionesLocal();
      if (ok) {
        btn.classList.remove("hidden", "tab-sin-permiso");
        btn.setAttribute("data-bc-permiso", "1");
        btn.style.removeProperty("display");
      } else {
        btn.classList.add("hidden", "tab-sin-permiso");
        btn.setAttribute("data-bc-permiso", "0");
        btn.style.setProperty("display", "none", "important");
        btn.classList.remove("active");
        const panel = document.getElementById("tab-" + tab);
        if (panel) panel.classList.remove("visible");
      }
      return;
    }
    const seccion = TAB_A_SECCION[tab];
    const permitido = !!(seccion && tienePermiso(seccion, "ver"));
    if (permitido) {
      btn.classList.remove("hidden", "tab-sin-permiso");
      btn.setAttribute("data-bc-permiso", "1");
      btn.style.removeProperty("display");
    } else {
      btn.classList.add("hidden", "tab-sin-permiso");
      btn.setAttribute("data-bc-permiso", "0");
      btn.style.setProperty("display", "none", "important");
      btn.classList.remove("active");
      const panel = document.getElementById("tab-" + tab);
      if (panel) panel.classList.remove("visible");
    }
  });

  togglePorPermiso("form-producto", "productos", "crear");
  togglePorPermiso("form-compra", "stock", "crear");
  if (!tienePermiso("stock", "crear")) togglePorPermiso("form-compra", "productos", "crear");
  togglePorPermiso("form-venta-linea", "ventas", "crear");
  togglePorPermiso("form-almacen", "almacenes", "crear");
  togglePorPermiso("form-transferencia", "transferencias", "crear");
  const formVale = document.getElementById("form-vale");
  if (formVale) formVale.classList.add("hidden");
  togglePorPermiso("form-categoria", "categorias", "crear");
  togglePorPermiso("form-unidad", "unidades", "crear");
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
