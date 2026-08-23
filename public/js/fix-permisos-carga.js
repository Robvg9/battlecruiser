// BattleCruiser v9.2.52 — corrige construcción de _permisosEfectivos
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
      try {
        var ses = await client.auth.getSession();
        var sesion = ses && ses.data;
        if (!sesion || !sesion.session) {
          if (typeof limpiarContextoUsuario === "function") limpiarContextoUsuario();
          return;
        }
        var authUser = sesion.session.user;
        var perfil = null;
        try {
          var pr = await client.rpc("perfil_usuario_actual", {});
          if (!pr.error && pr.data) perfil = Array.isArray(pr.data) ? pr.data[0] : pr.data;
        } catch (e) {}

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
        try {
          var res = await client.rpc("permisos_usuario_actual", {});
          if (res.error) {
            if (typeof esErrorDeRed === "function" && esErrorDeRed(res.error)) _permisosCargaFallidaRed = true;
          } else if (Array.isArray(res.data)) {
            _permisosCargaExitosa = true;
            rebuildFromRpcRows(res.data);
          }
        } catch (e) {
          if (typeof esErrorDeRed === "function" && esErrorDeRed(e)) _permisosCargaFallidaRed = true;
        }

        if (typeof aplicarPermisosAInterfaz === "function") aplicarPermisosAInterfaz();
        if (typeof mostrarInfoUsuarioEnHeader === "function") mostrarInfoUsuarioEnHeader();
      } catch (e) {
        console.warn("[Battlecruiser] No se pudo cargar el contexto de usuario:", e);
      } finally {
        _cargandoUsuario = false;
      }
    };
    wrapped.__bcPermitidoFix = true;
    window.cargarContextoUsuario = wrapped;
    try { cargarContextoUsuario = wrapped; } catch (e) {}
  }

  wrapCargar();
  Promise.resolve().then(wrapCargar);
  window.addEventListener("load", wrapCargar);
})();
