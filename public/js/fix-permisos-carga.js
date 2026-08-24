// BattleCruiser v9.2.78 — corrige construcción de _permisosEfectivos + paralelo M26.2
// Causa raíz FE: se ignoraba p.permitido y se marcaba TODA fila del RPC como true.
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
    if (typeof cargarContextoUsuario !== "function" || cargarContextoUsuario.__bcPermitidoFix) return;
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
        } else {
          _usuarioActual = {
            id: authUser.id,
            nombre: authUser.email,
            activo: true,
            role_id: null,
            rol: null
          };
        }

        _permisosEfectivos = {};
        _permisosCargaExitosa = false;
        _permisosCargaFallidaRed = false;
        if (permsRes) {
          if (permsRes.error) {
            if (typeof esErrorDeRed === "function" && esErrorDeRed(permsRes.error)) _permisosCargaFallidaRed = true;
          } else if (Array.isArray(permsRes.data)) {
            _permisosCargaExitosa = true;
            rebuildFromRpcRows(permsRes.data);
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

  // Una sola pasada + reintento en load (antes: 3 llamadas wrapCargar)
  wrapCargar();
  window.addEventListener("load", wrapCargar, { once: true });
})();
