// BattleCruiser — M28 Archivado de usuarios (Micro-misión 002 + CORRECCIÓN)
// Extiende listado admin: Archivar / Restaurar + filtro + acceso desde Ajustes.
// Reutiliza RPC archivar_usuario / restaurar_usuario / listar_usuarios_admin.
// UI compacta: [Activar|Desactivar] [Archivar] en una sola fila.
(function () {
  'use strict';

  var _vistaArchivados = false;

  function injectCss() {
    if (document.getElementById('bc-m28-arch-css')) return;
    var s = document.createElement('style');
    s.id = 'bc-m28-arch-css';
    s.textContent = [
      '#lista-usuarios .usuario-acciones{display:inline-flex!important;flex-wrap:nowrap!important;align-items:center;gap:6px;margin:0;max-width:100%}',
      '#lista-usuarios .usuario-acciones .cc-accion,',
      '#lista-usuarios .usr-estado-btn,',
      '#lista-usuarios .usr-archivar-btn,',
      '#lista-usuarios .usr-restaurar-btn{padding:5px 10px!important;font-size:12px!important;line-height:1.2!important;border-radius:8px!important;white-space:nowrap!important;flex:0 0 auto;margin:0!important}',
      '#lista-usuarios.ud-table .usuario-item{align-items:center}',
      '#lista-usuarios.ud-table .usuario-acciones{justify-content:flex-end}',
      '#bc-filtro-archivados{display:none}',
      '#lista-usuarios .ud-badge-archivado{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:#c9a24d}'
    ].join('');
    document.head.appendChild(s);
  }

  function ensureFiltroUI() {
    injectCss();
  }

  function paintFiltroActivo() {}

  async function refrescarUsuariosArchivoAware() {
    if (typeof tienePermiso !== 'function' || !tienePermiso('usuarios', 'ver')) {
      if (typeof setEmpty === 'function') setEmpty('lista-usuarios', 'No tenés permiso para ver usuarios.');
      return;
    }
    ensureFiltroUI();
    if (typeof setLoading === 'function') {
      setLoading('lista-usuarios', _vistaArchivados ? 'Cargando archivados…' : 'Cargando usuarios…');
    }
    if (typeof refrescarRoles === 'function') await refrescarRoles();
    try {
      var params = { p_incluir_archivados: !!_vistaArchivados };
      var res = await client.rpc('listar_usuarios_admin', params);
      if (res.error) {
        res = await client.rpc('listar_usuarios_admin', {});
        if (res.error) {
          if (typeof setEmpty === 'function') {
            setEmpty('lista-usuarios', 'No se pudieron cargar los usuarios: ' + escHtml(String(res.error.message || res.error.code || res.error)));
          }
          return;
        }
        var raw = res.data || [];
        if (_vistaArchivados) {
          raw = raw.filter(function (u) { return u.archivado === true; });
        } else {
          raw = raw.filter(function (u) { return u.archivado !== true; });
        }
        if (typeof _usuariosCache !== 'undefined') _usuariosCache = raw;
        else window._usuariosCache = raw;
        renderizarUsuariosArchivoAware(raw);
        return;
      }
      var data = res.data || [];
      if (typeof _usuariosCache !== 'undefined') _usuariosCache = data;
      else window._usuariosCache = data;
      renderizarUsuariosArchivoAware(data);
    } catch (e) {
      if (typeof setEmpty === 'function') setEmpty('lista-usuarios', 'Error al cargar usuarios.');
      console.warn('[BattleCruiser] M28 listar_usuarios_admin:', e);
    }
  }

  function renderizarUsuariosArchivoAware(usuarios) {
    var lista = document.getElementById('lista-usuarios');
    if (!lista) return;
    if (!usuarios || usuarios.length === 0) {
      if (typeof setEmpty === 'function') {
        setEmpty('lista-usuarios', _vistaArchivados ? 'No hay usuarios archivados.' : 'Todavía no hay usuarios registrados.');
      }
      return;
    }
    lista.innerHTML = '';
    var puedeEditar = typeof tienePermiso === 'function' && tienePermiso('usuarios', 'editar');
    var roles = (typeof _rolesCache !== 'undefined' && _rolesCache) ? _rolesCache : [];

    usuarios.forEach(function (u) {
      var div = document.createElement('div');
      var esArch = u.archivado === true;
      div.className = 'lista-item usuario-item' + (u.activo === false || esArch ? ' usuario-inactivo' : '');

      var estado;
      if (esArch) estado = '📦 Archivado';
      else if (u.activo === false) estado = '🔴 Inactivo';
      else estado = '🟢 Activo';

      var selectRol = '<span class="usuario-rol-fijo">Rol: ' + escHtml(u.rol || '—') + '</span>';
      if (puedeEditar && !esArch) {
        var opciones = roles.map(function (r) {
          var sel = r.id === u.role_id ? ' selected' : '';
          return '<option value="' + escHtml(r.id) + '"' + sel + '>' + escHtml(r.nombre) + '</option>';
        }).join('');
        selectRol = '<select class="usr-rol-select" data-id="' + escHtml(u.id) + '">' + opciones + '</select>';
      }

      var acciones = '';
      if (puedeEditar) {
        acciones = '<span class="usuario-acciones">';
        if (esArch) {
          acciones += '<button type="button" class="cc-accion usr-restaurar-btn" data-id="' + escHtml(u.id) + '">Restaurar</button>';
        } else {
          acciones +=
            '<button type="button" class="cc-accion usr-estado-btn" data-id="' + escHtml(u.id) + '" data-activo="' + (u.activo !== false ? 'true' : 'false') + '">' +
            (u.activo !== false ? 'Desactivar' : 'Activar') + '</button>' +
            '<button type="button" class="cc-accion usr-archivar-btn" data-id="' + escHtml(u.id) + '" data-nombre="' + escHtml(u.nombre || '') + '">Archivar</button>';
        }
        acciones += '</span>';
      }

      var extra = '';
      if (esArch && u.motivo_archivo) {
        extra = ' · <span class="muted">' + escHtml(u.motivo_archivo) + '</span>';
      }

      div.innerHTML =
        '<span class="usuario-principal"><span class="usuario-nombre">' + escHtml(u.nombre || '—') + '</span>' +
        '<span class="muted">' + selectRol + ' · ' + estado + extra + '</span></span>' + acciones;
      lista.appendChild(div);
    });
  }

  function msgErrorArchivo(texto) {
    if (typeof setMsg === 'function') setMsg('msg-usuarios', texto, false);
    try { console.warn('[BattleCruiser] M28 archivo:', texto); } catch (e) {}
  }

  async function archivarUsuario(usuarioId, nombre) {
    if (typeof tienePermiso !== 'function' || !tienePermiso('usuarios', 'editar')) return;
    var motivo = window.prompt('Motivo del archivado (opcional) para ' + (nombre || 'este usuario') + ':', '');
    if (motivo === null) return;
    if (!window.confirm('¿Archivar a ' + (nombre || 'este usuario') + '? No podrá iniciar sesión ni recibir asignaciones. El historial se conserva.')) return;
    if (typeof showLoading === 'function') showLoading();
    try {
      var res = await client.rpc('archivar_usuario', {
        p_usuario_id: usuarioId,
        p_motivo: motivo && motivo.trim() ? motivo.trim() : null
      });
      if (res.error) {
        var em = String(res.error.message || res.error.code || res.error || '');
        if (/archivar_usuario|does not exist|42883|PGRST202/i.test(em)) {
          msgErrorArchivo('No se pudo archivar: falta aplicar supabase/m28_usuarios_archivado.sql en Supabase.');
        } else {
          msgErrorArchivo('No se pudo archivar: ' + escHtml(em));
        }
        return;
      }
      if (typeof setMsg === 'function') setMsg('msg-usuarios', 'Usuario archivado.', true);
      if (typeof registrarAuditoria === 'function') {
        registrarAuditoria('usuario_archivo', 'Usuario archivado.', 'exito', usuarioId, null, null);
      }
      _vistaArchivados = false;
      await refrescarUsuariosArchivoAware();
    } catch (e) {
      msgErrorArchivo('Error al archivar usuario.');
      console.warn('[BattleCruiser] M28 archivar:', e);
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  }

  async function restaurarUsuario(usuarioId) {
    if (typeof tienePermiso !== 'function' || !tienePermiso('usuarios', 'editar')) return;
    if (!window.confirm('¿Restaurar este usuario? Volverá a la lista operativa como Inactivo; deberás activarlo si corresponde.')) return;
    if (typeof showLoading === 'function') showLoading();
    try {
      var res = await client.rpc('restaurar_usuario', { p_usuario_id: usuarioId });
      if (res.error) {
        var em = String(res.error.message || res.error.code || res.error || '');
        if (/restaurar_usuario|does not exist|42883|PGRST202/i.test(em)) {
          msgErrorArchivo('No se pudo restaurar: falta aplicar supabase/m28_usuarios_archivado.sql en Supabase.');
        } else {
          msgErrorArchivo('No se pudo restaurar: ' + escHtml(em));
        }
        return;
      }
      if (typeof setMsg === 'function') setMsg('msg-usuarios', 'Usuario restaurado (queda Inactivo hasta que lo actives).', true);
      if (typeof registrarAuditoria === 'function') {
        registrarAuditoria('usuario_restauracion', 'Usuario restaurado.', 'exito', usuarioId, null, null);
      }
      _vistaArchivados = false;
      await refrescarUsuariosArchivoAware();
    } catch (e) {
      msgErrorArchivo('Error al restaurar usuario.');
      console.warn('[BattleCruiser] M28 restaurar:', e);
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  }

  function wireLista() {
    var lista = document.getElementById('lista-usuarios');
    if (!lista || lista.dataset.bcM28Arch === '1') return;
    lista.dataset.bcM28Arch = '1';
    lista.addEventListener('click', function (e) {
      var arch = e.target.closest('.usr-archivar-btn');
      if (arch) {
        e.stopPropagation();
        archivarUsuario(arch.dataset.id, arch.dataset.nombre);
        return;
      }
      var rest = e.target.closest('.usr-restaurar-btn');
      if (rest) {
        e.stopPropagation();
        restaurarUsuario(rest.dataset.id);
      }
    });
  }

  function patchGlobals() {
    window.refrescarUsuarios = refrescarUsuariosArchivoAware;
    window.refrescarUsuarios.__bcM28 = true;
    window.renderizarUsuarios = renderizarUsuariosArchivoAware;
    window.__bcM28AbrirArchivados = function () {
      window.__bcM28ForceArchivados = true;
      _vistaArchivados = true;
      var tabBtn = document.querySelector('.tab-btn[data-tab="usuarios"]');
      if (tabBtn) tabBtn.click();
      else if (typeof irATab === 'function') irATab('usuarios');
      setTimeout(function () {
        refrescarUsuariosArchivoAware();
      }, 200);
    };
    window.__bcM28AbrirOperativos = function () {
      _vistaArchivados = false;
      var tabBtn = document.querySelector('.tab-btn[data-tab="usuarios"]');
      if (tabBtn) tabBtn.click();
      else if (typeof irATab === 'function') irATab('usuarios');
      setTimeout(function () {
        refrescarUsuariosArchivoAware();
      }, 200);
    };
  }

  function boot() {
    injectCss();
    patchGlobals();
    ensureFiltroUI();
    wireLista();
    if (document.getElementById('lista-usuarios')) {
      setTimeout(function () {
        if (typeof tienePermiso === 'function' && tienePermiso('usuarios', 'ver')) {
          refrescarUsuariosArchivoAware();
        }
      }, 600);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); });
  } else {
    setTimeout(boot, 300);
  }
  setTimeout(boot, 1200);
  setTimeout(patchGlobals, 2000);

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('.tab-btn[data-tab="usuarios"]');
    if (!btn) return;
    if (window.__bcM28ForceArchivados) {
      window.__bcM28ForceArchivados = false;
      return;
    }
    _vistaArchivados = false;
  }, true);
})();
