// BattleCruiser v9.2.50 — Matriz de permisos canónica (catálogo backend)
// UNA fuente: catalogo_permisos_admin() + permisos_por_rol() + actualizar_permisos_rol()
// Lee explícitamente seccion / accion / permitido. No infiere por existencia de fila.
(function () {
  "use strict";
  if (window.__bcFixPermisosRol50) return;
  window.__bcFixPermisosRol50 = true;

  var _catalogoCache = null;

  function esc(v) {
    return typeof escHtml === "function" ? escHtml(v) : String(v == null ? "" : v);
  }

  async function obtenerCatalogo() {
    if (_catalogoCache && _catalogoCache.length) return _catalogoCache;
    if (typeof client === "undefined" || !client) return [];
    try {
      var res = await client.rpc("catalogo_permisos_admin", {});
      if (res.error) {
        console.warn("[BattleCruiser] catalogo_permisos_admin", res.error);
        return [];
      }
      var rows = Array.isArray(res.data) ? res.data : [];
      _catalogoCache = rows
        .map(function (r) {
          return { seccion: r.seccion || r.p_seccion, accion: r.accion || r.p_accion };
        })
        .filter(function (r) { return r.seccion && r.accion; });
      return _catalogoCache;
    } catch (e) {
      console.warn("[BattleCruiser] catalogo_permisos_admin", e);
      return [];
    }
  }

  function agruparCatalogo(catalogo) {
    var ordenSec = [];
    var porSec = {};
    catalogo.forEach(function (r) {
      if (!porSec[r.seccion]) {
        porSec[r.seccion] = [];
        ordenSec.push(r.seccion);
      }
      if (porSec[r.seccion].indexOf(r.accion) < 0) porSec[r.seccion].push(r.accion);
    });
    var ordenAcc = ["ver", "crear", "editar", "borrar", "editar_any"];
    Object.keys(porSec).forEach(function (s) {
      porSec[s].sort(function (a, b) {
        var ia = ordenAcc.indexOf(a);
        var ib = ordenAcc.indexOf(b);
        if (ia < 0) ia = 99;
        if (ib < 0) ib = 99;
        return ia - ib || a.localeCompare(b);
      });
    });
    return { ordenSec: ordenSec, porSec: porSec };
  }

  async function cargarYRenderizarPermisosRolCanonico(roleId, esDueno) {
    var panel = document.getElementById("rol-permisos-panel");
    if (!panel) return;

    var catalogo = await obtenerCatalogo();
    if (!catalogo.length) {
      panel.innerHTML =
        '<p class="msg">No se pudo cargar el catálogo de permisos (catalogo_permisos_admin). Verificá el backend.</p>';
      return;
    }

    var res;
    try {
      res = await client.rpc("permisos_por_rol", { p_role_id: roleId });
    } catch (e) {
      panel.innerHTML = '<p class="msg">Error al cargar permisos del rol.</p>';
      return;
    }
    if (res.error) {
      panel.innerHTML =
        '<p class="msg">No se pudieron cargar los permisos: ' +
        esc(res.error.message || res.error.code || res.error) +
        "</p>";
      return;
    }

    var filas = Array.isArray(res.data) ? res.data : [];
    var mapaPermitido = {};
    filas.forEach(function (p) {
      var sec = p.seccion;
      var acc = p.accion;
      if (!sec || !acc) return;
      mapaPermitido[sec + "|" + acc] = p.permitido === true;
    });

    var grp = agruparCatalogo(catalogo);
    var todasAcc = [];
    var ordenAcc = ["ver", "crear", "editar", "borrar", "editar_any"];
    ordenAcc.forEach(function (a) {
      catalogo.forEach(function (r) {
        if (r.accion === a && todasAcc.indexOf(a) < 0) todasAcc.push(a);
      });
    });
    catalogo.forEach(function (r) {
      if (todasAcc.indexOf(r.accion) < 0) todasAcc.push(r.accion);
    });

    var html = '<table class="permisos-tabla"><thead><tr><th>Sección</th>';
    todasAcc.forEach(function (a) {
      html += "<th>" + esc(a) + "</th>";
    });
    html += "</tr></thead><tbody>";

    grp.ordenSec.forEach(function (sec) {
      html += "<tr><td>" + esc(sec) + "</td>";
      todasAcc.forEach(function (acc) {
        var key = sec + "|" + acc;
        var existeEnCatalogo = catalogo.some(function (r) {
          return r.seccion === sec && r.accion === acc;
        });
        if (!existeEnCatalogo) {
          html += "<td>—</td>";
          return;
        }
        var checked = mapaPermitido[key] === true ? " checked" : "";
        var disabled = esDueno ? " disabled" : "";
        html +=
          '<td><input type="checkbox" class="permiso-check" data-seccion="' +
          esc(sec) +
          '" data-accion="' +
          esc(acc) +
          '"' +
          checked +
          disabled +
          "></td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table>";

    if (esDueno) {
      html +=
        '<p class="muted">El rol Dueño siempre tiene todos los permisos; no se puede editar.</p>';
    } else {
      html +=
        '<button type="button" class="cc-accion" id="rol-permisos-guardar-btn" data-id="' +
        esc(roleId) +
        '">Guardar permisos</button>';
      html += '<p class="msg op-perm-save-msg" style="margin-top:10px"></p>';
    }
    panel.innerHTML = html;

    window.__bcUltimoMapaPermisosRol = mapaPermitido;
    window.__bcUltimoCatalogo = catalogo;
  }

  window.cargarYRenderizarPermisosRol = cargarYRenderizarPermisosRolCanonico;
  try {
    cargarYRenderizarPermisosRol = cargarYRenderizarPermisosRolCanonico;
  } catch (e) {}

  async function guardarPermisosDesdePanel(btn) {
    var panel = document.getElementById("rol-permisos-panel");
    if (!panel) {
      if (typeof setMsg === "function") setMsg("msg-roles", "No se encontró el panel de permisos.", false);
      return;
    }
    var roleId = btn.getAttribute("data-id");
    if (!roleId) {
      if (typeof setMsg === "function") setMsg("msg-roles", "Rol no identificado.", false);
      return;
    }
    var checks = panel.querySelectorAll(".permiso-check");
    var payload = Array.from(checks).map(function (c) {
      return {
        seccion: c.getAttribute("data-seccion"),
        accion: c.getAttribute("data-accion"),
        permitido: !!c.checked
      };
    });

    var feedback = panel.querySelector(".op-perm-save-msg");
    if (!feedback) {
      feedback = document.createElement("p");
      feedback.className = "msg op-perm-save-msg";
      feedback.style.marginTop = "10px";
      panel.appendChild(feedback);
    }
    feedback.textContent = "Guardando…";
    feedback.style.color = "var(--mist)";

    btn.disabled = true;
    if (typeof showLoading === "function") showLoading();
    try {
      if (typeof client === "undefined" || !client || typeof client.rpc !== "function") {
        throw new Error("Cliente Supabase no inicializado");
      }
      var res = await client.rpc("actualizar_permisos_rol", {
        p_role_id: roleId,
        p_permisos: payload
      });
      if (res.error) throw res.error;
      feedback.textContent = "✓ Permisos guardados.";
      feedback.style.color = "#9dcc9a";
      if (typeof setMsg === "function") {
        setMsg(
          "msg-roles",
          "Permisos guardados. Los usuarios con este rol ya tienen los permisos nuevos.",
          true
        );
      }
      if (typeof registrarAuditoria === "function") {
        registrarAuditoria("rol_permisos", "Permisos del rol actualizados.", "exito", roleId, null, null);
      }
      await cargarYRenderizarPermisosRolCanonico(roleId, false);
    } catch (err) {
      var m = (err && (err.message || err.details || err.hint || err.code)) || String(err);
      feedback.textContent = "No se pudieron guardar: " + m;
      feedback.style.color = "#e8a0a0";
      if (typeof setMsg === "function") setMsg("msg-roles", "No se pudieron guardar los permisos: " + esc(m), false);
      console.warn("[BattleCruiser] actualizar_permisos_rol", err);
    } finally {
      btn.disabled = false;
      if (typeof hideLoading === "function") hideLoading();
    }
  }

  document.addEventListener(
    "click",
    function (e) {
      var btn = e.target.closest && e.target.closest("#rol-permisos-guardar-btn, .rol-permisos-guardar-btn");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      guardarPermisosDesdePanel(btn);
    },
    true
  );
})();
