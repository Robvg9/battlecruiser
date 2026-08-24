// ==== Battlecruiser · js/usuarios-permisos.js ====
// B3 — v9.2.79 M26.3: timeout en RPC de arranque + recuperación explícita (fail-closed).

var BC_CONTEXTO_TIMEOUT_MS = 12000;

function esIdentidadInternaOTemporal(valor) {
  if (!valor) return true;
  var s = String(valor).trim();
  if (!s) return true;
  if (/@internal\.battlecruiser\.local$/i.test(s)) return true;
  if (/^bc_[a-f0-9]+@/i.test(s)) return true;
  return false;
}

function mostrarEstadoIdentidadEnHeader(texto) {
  var el = document.getElementById("user-email");
  if (el) el.textContent = texto || "";
}

function bcConTimeout(promesa, ms, etiqueta) {
  return new Promise(function (resolve, reject) {
    var done = false;
    var t = setTimeout(function () {
      if (done) return;
      done = true;
      var err = new Error("timeout:" + (etiqueta || "rpc"));
      err.bcTimeout = true;
      reject(err);
    }, ms || BC_CONTEXTO_TIMEOUT_MS);
    Promise.resolve(promesa).then(
      function (v) {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(v);
      },
      function (e) {
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function asegurarBotonReintentarContexto() {
  var el = document.getElementById("user-email");
  if (!el) return;
  var wrap = el.parentElement;
  if (!wrap) return;
  var btn = document.getElementById("bc-reintentar-contexto");
  if (btn) {
    btn.classList.remove("hidden");
    btn.style.display = "";
    return btn;
  }
  btn = document.createElement("button");
  btn.id = "bc-reintentar-contexto";
  btn.type = "button";
  btn.className = "cc-accion";
  btn.textContent = "Reintentar";
  btn.style.marginLeft = "8px";
  btn.style.fontSize = "11px";
  btn.style.padding = "4px 10px";
  btn.addEventListener("click", function () {
    btn.disabled = true;
    btn.textContent = "…";
    if (typeof cargarContextoUsuario === "function") {
      cargarContextoUsuario().finally(function () {
        btn.disabled = false;
        btn.textContent = "Reintentar";
      });
    }
  });
  wrap.appendChild(btn);
  return btn;
}

function ocultarBotonReintentarContexto() {
  var btn = document.getElementById("bc-reintentar-contexto");
  if (btn) {
    btn.classList.add("hidden");
    btn.style.display = "none";
  }
}

async function cargarContextoUsuario() {
  if (_cargandoUsuario) return;
  _cargandoUsuario = true;
  mostrarEstadoIdentidadEnHeader("Cargando usuario…");
  ocultarBotonReintentarContexto();
  var huboTimeout = false;
  var huboErrorRed = false;
  try {
    var sesionPack;
    try {
      sesionPack = await bcConTimeout(client.auth.getSession(), BC_CONTEXTO_TIMEOUT_MS, "getSession");
    } catch (eSes) {
      huboTimeout = !!(eSes && eSes.bcTimeout);
      huboErrorRed = true;
      console.warn("[BattleCruiser] getSession falló o timeout", eSes);
      mostrarEstadoIdentidadEnHeader(huboTimeout ? "Tiempo agotado — reintentá" : "Sin conexión — reintentá");
      asegurarBotonReintentarContexto();
      return;
    }
    var sesion = sesionPack && sesionPack.data;
    if (!sesion || !sesion.session) {
      limpiarContextoUsuario();
      return;
    }
    var authUser = sesion.session.user;

    var perfilRes = null;
    var permsRes = null;
    try {
      var pair = await Promise.all([
        bcConTimeout(client.rpc("perfil_usuario_actual", {}), BC_CONTEXTO_TIMEOUT_MS, "perfil"),
        bcConTimeout(client.rpc("permisos_usuario_actual", {}), BC_CONTEXTO_TIMEOUT_MS, "permisos")
      ]);
      perfilRes = pair[0];
      permsRes = pair[1];
    } catch (eParallel) {
      huboTimeout = !!(eParallel && eParallel.bcTimeout);
      huboErrorRed = true;
      console.warn("[BattleCruiser] RPC perfil/permisos falló o timeout", eParallel);
      // Fallback secuencial con timeout (red mediocre: una puede vivir)
      try {
        perfilRes = await bcConTimeout(client.rpc("perfil_usuario_actual", {}), BC_CONTEXTO_TIMEOUT_MS, "perfil2");
      } catch (e1) {
        if (e1 && e1.bcTimeout) huboTimeout = true;
      }
      try {
        permsRes = await bcConTimeout(client.rpc("permisos_usuario_actual", {}), BC_CONTEXTO_TIMEOUT_MS, "permisos2");
      } catch (e2) {
        if (e2 && e2.bcTimeout) huboTimeout = true;
        if (typeof esErrorDeRed === "function" && esErrorDeRed(e2)) _permisosCargaFallidaRed = true;
      }
    }

    var perfil = null;
    if (perfilRes && !perfilRes.error && perfilRes.data) {
      perfil = Array.isArray(perfilRes.data) ? perfilRes.data[0] : perfilRes.data;
    }

    if (perfil) {
      var nombrePerfil = perfil.nombre ? String(perfil.nombre).trim() : "";
      if (esIdentidadInternaOTemporal(nombrePerfil)) nombrePerfil = "";
      _usuarioActual = {
        id: perfil.id || authUser.id,
        nombre: nombrePerfil || null,
        activo: perfil.activo !== false,
        role_id: perfil.role_id || null,
        rol: perfil.rol || null,
      };
    } else {
      _usuarioActual = {
        id: authUser.id,
        nombre: null,
        activo: true,
        role_id: null,
        rol: null,
      };
    }

    // FAIL CLOSED: permisos solo si RPC respondió OK con array
    _permisosEfectivos = {};
    _permisosCargaExitosa = false;
    _permisosCargaFallidaRed = false;
    if (permsRes) {
      if (permsRes.error) {
        if (typeof esErrorDeRed === "function" && esErrorDeRed(permsRes.error)) _permisosCargaFallidaRed = true;
        console.warn("[BattleCruiser] permisos_usuario_actual error", permsRes.error);
      } else if (Array.isArray(permsRes.data)) {
        var perms = permsRes.data;
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
    } else {
      _permisosCargaFallidaRed = true;
    }

    if (typeof aplicarPermisosAInterfaz === "function") aplicarPermisosAInterfaz();
    if (typeof mostrarInfoUsuarioEnHeader === "function") mostrarInfoUsuarioEnHeader();

    if (!_permisosCargaExitosa || huboTimeout || huboErrorRed) {
      asegurarBotonReintentarContexto();
    } else {
      ocultarBotonReintentarContexto();
    }
  } catch (e) {
    console.warn("[Battlecruiser] No se pudo cargar el contexto de usuario:", e);
    mostrarEstadoIdentidadEnHeader("Error al cargar — reintentá");
    asegurarBotonReintentarContexto();
  } finally {
    _cargandoUsuario = false;
    if (typeof mostrarInfoUsuarioEnHeader === "function") mostrarInfoUsuarioEnHeader();
  }
}

function limpiarContextoUsuario() {
  _usuarioActual = null;
  _permisosEfectivos = {};
  _permisosCargaExitosa = false;
  _permisosCargaFallidaRed = false;
  _novedadesVistas = new Set();
  mostrarEstadoIdentidadEnHeader("");
  ocultarBotonReintentarContexto();
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
    tienePermiso("reinversiones", "crear") ||
    tienePermiso("responsabilidades", "crear") ||
    tienePermiso("incidencias", "crear")
  );
}

var TAB_A_SECCION = {
  productos: "productos",
  ventas: "ventas",
  almacenes: "almacenes",
  transferencias: "transferencias",
  usuarios: "usuarios",
  mando: "auditoria",
  reportes: "reportes",
  inventario: "reportes",
  movimientos: "reportes",
  turnos: "turnos",
  ciclos: "turnos",
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
    if (tab === "turnos") {
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
    if (tab === "ciclos") {
      const ok = tienePermiso("turnos", "ver");
      if (ok) {
        btn.classList.remove("hidden", "tab-sin-permiso");
        btn.setAttribute("data-bc-permiso", "1");
        btn.style.removeProperty("display");
        btn.textContent = "Turnos";
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
  if (!_usuarioActual) {
    el.textContent = "";
    return;
  }
  if (typeof _cargandoUsuario !== "undefined" && _cargandoUsuario) {
    el.textContent = "Cargando usuario…";
    return;
  }
  var nombre = _usuarioActual.nombre ? String(_usuarioActual.nombre).trim() : "";
  if (nombre && !esIdentidadInternaOTemporal(nombre)) {
    var rol = _usuarioActual.rol ? " · " + _usuarioActual.rol : "";
    el.textContent = nombre + rol;
    return;
  }
  if (typeof _permisosCargaFallidaRed !== "undefined" && _permisosCargaFallidaRed) {
    el.textContent = "Sin permisos (red) — reintentá";
    return;
  }
  if (typeof _permisosCargaExitosa !== "undefined" && !_permisosCargaExitosa) {
    el.textContent = "Sin permisos cargados — reintentá";
    return;
  }
  // Sesión OK, permisos OK, pero sin nombre legible
  var rolSolo = _usuarioActual.rol ? String(_usuarioActual.rol) : "Usuario";
  el.textContent = rolSolo;
}
