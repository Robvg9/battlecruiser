// BattleCruiser v9.2.93 — M26.17: no sobrescribir cargarContextoUsuario de M26.3
// (timeouts + recovery). Solo envuelve versiones antiguas cacheadas.
// Si envuelve: NO vaciar permisos antes de una respuesta RPC válida.
(function () {
  "use strict";
  if (window.__bcPermisosCargaFix) return;
  window.__bcPermisosCargaFix = true;

  function rebuildFromRpcRows(perms) {
    _permisosEfectivos = {};
    if (!Array.isArray(perms)) return;
    perms.forEach(function (p) {
      if (!p || !p.seccion || !p.accion) return;
      if (p.permitido === false || p.permitido === 0 || p.permitido === "false") return;
      if (!_permisosEfectivos[p.seccion]) _permisosEfectivos[p.seccion] = {};
      _permisosEfectivos[p.seccion][p.accion] = true;
    });
  }

  function wrapCargar() {
    if (typeof cargarContextoUsuario !== "function") return;
    if (cargarContextoUsuario.__bcM263Timeout || cargarContextoUsuario.__bcPermitidoFix || cargarContextoUsuario.__bcM2617) return;
    if (typeof bcConTimeout === "function" && typeof BC_CONTEXTO_TIMEOUT_MS === "number") {
      cargarContextoUsuario.__bcM263Timeout = true;
      return;
    }

    var wrapped = async function () {
      if (_cargandoUsuario) return;
      _cargandoUsuario = true;
      if (typeof mostrarEstadoIdentidadEnHeader === "function") {
        mostrarEstadoIdentidadEnHeader("Cargando usuario…");
      }
      try {
        var ses = await client.auth.getSession();
        var sesion = ses && ses.data;
        if (!sesion || !sesion.session) {
          if (typeof limpiarContextoUsuario === "function") limpiarContextoUsuario();
          return;
        }
        var authUser = sesion.session.user;

        var perfilRes = null;
        var permsRes = null;
        try {
          var pair = await Promise.all([
            client.rpc("perfil_usuario_actual", {}),
            client.rpc("permisos_usuario_actual", {})
          ]);
          perfilRes = pair[0];
          permsRes = pair[1];
        } catch (eParallel) {
          try { perfilRes = await client.rpc("perfil_usuario_actual", {}); } catch (e1) {}
          try { permsRes = await client.rpc("permisos_usuario_actual", {}); } catch (e2) {
            if (typeof esErrorDeRed === "function" && esErrorDeRed(e2)) _permisosCargaFallidaRed = true;
          }
        }

        var perfil = null;
        if (perfilRes && !perfilRes.error && perfilRes.data) {
          perfil = Array.isArray(perfilRes.data) ? perfilRes.data[0] : perfilRes.data;
        }

        if (perfil) {
          _usuarioActual = {
            id: perfil.id || authUser.id,
            nombre: perfil.nombre || authUser.email,
            activo: perfil.activo !== false,
            role_id: perfil.role_id || null,
            rol: perfil.rol || null
          };
        } else if (!(_usuarioActual && _usuarioActual.id)) {
          _usuarioActual = {
            id: authUser.id,
            nombre: authUser.email,
            activo: true,
            role_id: null,
            rol: null
          };
        }

        if (permsRes && !permsRes.error && Array.isArray(permsRes.data)) {
          _permisosCargaFallidaRed = false;
          _permisosCargaExitosa = true;
          rebuildFromRpcRows(permsRes.data);
        } else if (permsRes && permsRes.error) {
          var msg = String(permsRes.error.message || permsRes.error.code || "").toLowerCase();
          var faltanFuncionesB3 = permsRes.error.code === "42883" || msg.indexOf("could not find the function") >= 0;
          if (faltanFuncionesB3) window.__bcB3NoAplicado = true;
          if (typeof esErrorDeRed === "function" && esErrorDeRed(permsRes.error)) {
            _permisosCargaFallidaRed = true;
          }
        }

        if (typeof aplicarPermisosAInterfaz === "function") aplicarPermisosAInterfaz();
        if (typeof mostrarInfoUsuarioEnHeader === "function") mostrarInfoUsuarioEnHeader();
      } catch (e) {
        console.warn("[Battlecruiser] No se pudo cargar el contexto de usuario:", e);
      } finally {
        _cargandoUsuario = false;
        if (typeof mostrarInfoUsuarioEnHeader === "function") mostrarInfoUsuarioEnHeader();
      }
    };
    wrapped.__bcPermitidoFix = true;
    window.cargarContextoUsuario = wrapped;
    try { cargarContextoUsuario = wrapped; } catch (e) {}
  }

  wrapCargar();
  window.addEventListener("load", wrapCargar, { once: true });

  try {
    if (typeof window.tienePermiso === "function" && !window.__bcTienePermisoDegradacion) {
      var permisoOriginal = window.tienePermiso;
      var permisoDegradado = function (seccion, accion) {
        if (window.__bcB3NoAplicado && window._usuarioActual && !window._permisosCargaExitosa) return true;
        return permisoOriginal(seccion, accion);
      };
      window.tienePermiso = permisoDegradado;
      try { tienePermiso = permisoDegradado; } catch (e1) {}
      window.__bcTienePermisoDegradacion = true;
    }
  } catch (e2) {}
})();
