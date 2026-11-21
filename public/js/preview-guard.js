// BattleCruiser — read-only PR preview boundary.
// This file loads before Supabase JS so every SDK request passes through this guard.
(function () {
  "use strict";
  var PREVIEW_ORIGINS = new Set([
    "https://bc-pr-224-battlecruiser.robvg9.workers.dev",
    "https://ux-jornada-status-colors-transfer-modern-picker-battlecruiser.robvg9.workers.dev"
  ]);
  var SUPABASE_ORIGIN = "https://papxnkkjtkxsitcsvcme.supabase.co";
  if (!PREVIEW_ORIGINS.has(window.location.origin)) return;

  window.__BC_PREVIEW_READ_ONLY__ = true;
  window.__BC_PREVIEW_GUARD_VERSION__ = "1.0";

  // RPCs whose contracts are read-only. Every other PostgREST RPC is denied
  // in preview rather than risking a write to the single LIVE Supabase project.
  var SAFE_RPC_PREFIXES = [
    "obtener_", "listar_", "consultar_", "buscar_", "ver_",
    "perfil_", "permisos_", "turno_actual_", "bc5_mis_",
    "bc5_previsualizar_", "bc5_estado_",
    "bc7_obtener_", "bc7_estado_", "bc7_movimientos_",
    "bc7_productos_ajuste_", "bc7_liquidacion_", "bc7_ventas_",
    "bc7_finanzas_", "bc7_previsualizar_"
  ];
  var SAFE_RPC_EXACT = new Set([
    "turno_actual_usuario",
    "perfil_usuario_actual",
    "permisos_usuario_actual",
    "bc5_mis_jornadas",
    "bc7_movimientos_sesion",
    "listar_receptores_transferencia",
    "obtener_transferencia_compartir",
    "listar_movimientos_caja",
    "listar_reinversiones",
    "bc7_obtener_revision_jornada_rectificada",
    "bc7_obtener_revision_jornada"
  ]);
  function isReadRpc(name) {
    return SAFE_RPC_EXACT.has(name) || SAFE_RPC_PREFIXES.some(function (prefix) {
      return name.indexOf(prefix) === 0;
    });
  }
  function denied(url, method) {
    return new Response(JSON.stringify({
      code: "BC_PREVIEW_READ_ONLY",
      message: "El preview está conectado a la base LIVE en modo de solo lectura. La operación no se aplicó."
    }), {
      status: 403,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-BattleCruiser-Preview": "read-only",
        "Vary": "Origin"
      }
    });
  }
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url;
    try {
      var source = typeof input === "string" ? input : input && input.url;
      url = new URL(source, window.location.href);
    } catch (_) {
      return nativeFetch(input, init);
    }
    if (url.origin !== SUPABASE_ORIGIN) return nativeFetch(input, init);
    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var path = url.pathname;
    // Supabase Auth and the two allowlisted login/recovery proxy calls are
    // required to authenticate the reviewer's own account. They do not mutate
    // BattleCruiser inventory, transfers, cash or operational records.
    if (path.indexOf("/auth/v1/") === 0) return nativeFetch(input, init);
    if (path === "/functions/v1/bc-username-login" ||
        path === "/functions/v1/bc-password-recovery-admin") return nativeFetch(input, init);

    if (path.indexOf("/functions/v1/") === 0) return Promise.resolve(denied(url, method));
    if (path.indexOf("/rest/v1/rpc/") === 0) {
      var rpcName = decodeURIComponent(path.slice("/rest/v1/rpc/".length));
      if (method === "POST" && isReadRpc(rpcName)) return nativeFetch(input, init);
      return Promise.resolve(denied(url, method));
    }
    if (path.indexOf("/rest/v1/") === 0) {
      if (method === "GET" || method === "HEAD") return nativeFetch(input, init);
      return Promise.resolve(denied(url, method));
    }
    if (path.indexOf("/storage/v1/") === 0) {
      if (method === "GET" || method === "HEAD") return nativeFetch(input, init);
      return Promise.resolve(denied(url, method));
    }
    return nativeFetch(input, init);
  };

  function showNotice() {
    var shell = document.getElementById("app-shell");
    if (!shell || document.getElementById("bc-preview-read-only")) return;
    var notice = document.createElement("aside");
    notice.id = "bc-preview-read-only";
    notice.setAttribute("role", "status");
    notice.style.cssText = "margin:10px 12px;padding:10px 13px;border:1px solid #c9a24d;border-radius:8px;background:#3a301b;color:#ffedc5;font:600 12px/1.45 Inter,system-ui,sans-serif;";
    notice.textContent = "PREVIEW · conectado para revisar tus datos y permisos. Las compras, transferencias y demás cambios se guardan solo en este dispositivo; no se aplican a LIVE ni se sincronizan desde este preview.";
    shell.insertBefore(notice, shell.firstChild);
  }
  window.addEventListener("bc:ui-ready", showNotice);
  document.addEventListener("DOMContentLoaded", showNotice, { once: true });
  if (document.readyState !== "loading") showNotice();
})();