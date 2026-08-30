// BattleCruiser — M28 Archivado de usuarios (Micro-misión 002)
// Extiende listado admin: Archivar / Restaurar + filtro Archivados.
// Reutiliza RPC archivar_usuario / restaurar_usuario / listar_usuarios_admin.
(function () {
  'use strict';

  var _vistaArchivados = false;

  function ensureFiltroUI() {
    var tab = document.getElementById('tab-usuarios');
    if (!tab || document.getElementById('bc-filtro-archivados')) return;

    var wrap = document.createElement('div');
    wrap.id = 'bc-filtro-archivados';
    wrap.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px;align-items:center';
    wrap.innerHTML =
      '<button type="button" class="cc-accion" id="bc-btn-vista-operativos" data-vista="operativos">Operativos</button>' +
      '<button type="button" class="cc-accion" id="bc-btn-vista-archivados" data-vista="archivados">Archivados</button>';

    var lista = document.getElementById('lista-usuarios');
    var card = document.getElementById('ud-card-lista');
    var anchor = card || lista;
    if (anchor && anchor.parentNode) {
      if (card) card.parentNode.insertBefore(wrap, card);
      else lista.parentNode.insertBefore(wrap, lista);
    } else if (tab) {
      tab.appendChild(wrap);
    }

    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('[data-vista]');
      if (!b) return;
      _vistaArchivados = b.getAttribute('data-vista') === 'archivados';
      paintFiltroActivo();
      if (typeof refrescarUsuarios === 'function') refrescarUsuarios();
    });
    paintFiltroActivo();
  }

  function paintFiltroActivo() {
    var op = document.getElementById('bc-btn-vista-operativos');
    var ar = document.getElementById('bc-btn-vista-archivados');
    if (op) {
      op.style.borderColor = _vistaArchivados ? '' : 'var(--gold)';
      op.style.fontWeight = _vistaArchivados ? '' : '600';
    }
    if (ar) {
      ar.style.borderColor = _vistaArchivados ? 'var(--gold)' : '';
      ar.style.fontWeight = _vistaArchivados ? '600' : '';
    }
  }

  async function refrescarUsuariosArchivoAware() {
    if (!tienePermiso('usuarios', 'ver')) {
      setEmpty('lista-usuarios', 'No tenés permiso para ver usuarios.');
      return;
    }
    ensureFiltroUI();
    setLoading('lista-usuarios', _vistaArchivados ? 'Cargando archivados…' : 'Cargando usuarios…');
    if (typeof refrescarRoles === 'function') await refrescarRoles();
    try {
      var params = { p_incluir_archivados: !!_vistaArchivados };
      var res = await client.rpc('listar_usuarios_admin', params);
      if (res.error) {
        res = await client.rpc('listar_usuarios_admin', {});
        if (res.error) {
          setEmpty('lista-usuarios', 'No se pudieron cargar los usuarios: ' + escHtml(String(res.error.message || res.error.code || res.error)));
          return;
        }
        var raw = res.data || [];
        if (_vistaArchivados) {
          raw = raw.filter(function (u) { return u.archivado === true; });
        } else {
          raw = raw.filter(function (u) { return u.archivado !== true; });
        }
        _usuariosCache = raw;
        renderizarUsuariosArchivoAware(_usuariosCache);
        return;
      }
      _usuariosCache = res.data || [];
      renderizarUsuariosArchivoAware(_usuariosCache);
    } catch (e) {
      setEmpty('lista-usuarios', 'Error al cargar usuarios.');
      console.warn('[BattleCruiser] M28 listar_usuarios_admin:', e);
    }
  }

  function renderizarUsuariosArchivoAware(usuarios) {
    var lista = document.getElementById('lista-usuarios');
    if (!lista) return;
    if (!usuarios || usuarios.length === 0) {
      setEmpty('lista-usuarios', _vistaArchivados ? 'No hay usuarios archivados.' : 'Todavía no hay usuarios registrados.');
      return;
    }
    lista.innerHTML = '';
    var puedeEditar = tienePermiso('usuarios', 'editar');
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
        var opciones = (_rolesCache || []).map(function (r) {
          var sel = r.id === u.role_id ? ' selected' : '';
          return '<option value="' + escHtml(r.id) + '"' + sel + '>' + escHtml(r.nombre) + '</option>';
        }).join('');
        selectRol = '<select class="usr-rol-select" data-id="' + escHtml(u.id) + '">' + opciones + '</select>';
      }

      var acciones = '';
      if (puedeEditar) {
        acciones = '<span class="usuario-acciones">';
        if (esArch) {
          acciones += '<button type="button" class="cc-accion usr-restaurar-btn" data-id="' + escHtml(u.id) + '">Restaurar usuario</button>';
        } else {
          acciones +=
            '<button type="button" class="cc-accion usr-estado-btn" data-id="' + escHtml(u.id) + '" data-activo="' + (u.activo !== false ? 'true' : 'false') + '">' +
            (u.activo !== false ? 'Desactivar' : 'Activar') + '</button>' +
            '<button type="button" class="cc-accion usr-archivar-btn" data-id="' + escHtml(u.id) + '" data-nombre="' + escHtml(u.nombre || '') + '">Archivar usuario</button>';
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

  async function archivarUsuario(usuarioId, nombre) {
    if (!tienePermiso('usuarios', 'editar')) return;
    var motivo = window.prompt('Motivo del archivado (opcional) para ' + (nombre || 'este usuario') + ':', '');
    if (motivo === null) return;
    if (!window.confirm('¿Archivar a ' + (nombre || 'este usuario') + '? No podrá iniciar sesión ni recibir asignaciones. El historial se conserva.')) return;
    showLoading();
    try {
      var res = await client.rpc('archivar_usuario', {
        p_usuario_id: usuarioId,
        p_motivo: motivo && motivo.trim() ? motivo.trim() : null
      });
      if (res.error) {
        setMsg('msg-usuarios', 'No se pudo archivar: ' + escHtml(res.error.message || res.error.code || res.error), false);
        return;
      }
      setMsg('msg-usuarios', 'Usuario archivado.', true);
      if (typeof registrarAuditoria === 'function') {
        registrarAuditoria('usuario_archivo', 'Usuario archivado.', 'exito', usuarioId, null, null);
      }
      await refrescarUsuariosArchivoAware();
    } catch (e) {
      setMsg('msg-usuarios', 'Error al archivar usuario.', false);
    } finally {
      hideLoading();
    }
  }

  async function restaurarUsuario(usuarioId) {
    if (!tienePermiso('usuarios', 'editar')) return;
    if (!window.confirm('¿Restaurar este usuario? Volverá a la lista operativa como Inactivo; deberás activarlo si corresponde.')) return;
    showLoading();
    try {
      var res = await client.rpc('restaurar_usuario', { p_usuario_id: usuarioId });
      if (res.error) {
        setMsg('msg-usuarios', 'No se pudo restaurar: ' + escHtml(res.error.message || res.error.code || res.error), false);
        return;
      }
      setMsg('msg-usuarios', 'Usuario restaurado (queda Inactivo hasta que lo actives).', true);
      if (typeof registrarAuditoria === 'function') {
        registrarAuditoria('usuario_restauracion', 'Usuario restaurado.', 'exito', usuarioId, null, null);
      }
      await refrescarUsuariosArchivoAware();
    } catch (e) {
      setMsg('msg-usuarios', 'Error al restaurar usuario.', false);
    } finally {
      hideLoading();
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
  }

  function boot() {
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
})();
