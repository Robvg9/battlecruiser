// BattleCruiser — Administración de recuperación de contraseñas.
(function () {
  "use strict";
  if (window.__BC_PASSWORD_RECOVERY_ADMIN_V1) return;
  window.__BC_PASSWORD_RECOVERY_ADMIN_V1 = true;

  var ENDPOINT = window.location.origin === "https://bc-pr-224-battlecruiser.robvg9.workers.dev"
    ? "/__bc_preview/functions/v1/bc-password-recovery-admin"
    : SUPABASE_URL + "/functions/v1/bc-password-recovery-admin";
  var ROOT_ID = "bc-password-recovery-admin";
  var currentRequests = [];
  var busy = false;

  function isAdmin() {
    try {
      return typeof tienePermiso === "function" &&
        tienePermiso("usuarios", "editar") === true;
    } catch (_) { return false; }
  }

  async function callApi(action, payload) {
    var pack = await client.auth.getSession();
    var session = pack && pack.data && pack.data.session;
    if (!session || !session.access_token) throw new Error("SESSION_REQUIRED");

    var response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + session.access_token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(Object.assign({ action: action }, payload || {})),
      cache: "no-store"
    });
    var result = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error(result.error || "No se pudo completar la operación.");
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function addText(parent, tag, className, value) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value == null ? "" : String(value);
    parent.appendChild(element);
    return element;
  }

  function formatDate(value) {
    try {
      return new Intl.DateTimeFormat("es-CU", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Havana"
      }).format(new Date(value));
    } catch (_) { return String(value || "—"); }
  }

  function ensurePanel() {
    var existing = document.getElementById(ROOT_ID);
    if (existing) return existing;

    var tab = document.getElementById("tab-usuarios");
    if (!tab) return null;
    var panel = document.createElement("section");
    panel.id = ROOT_ID;
    panel.className = "cc-bloque bc-password-recovery-admin";
    panel.innerHTML =
      '<div class="bc-recovery-admin-head">' +
        '<div><h3>Recuperación de contraseñas</h3>' +
        '<p class="muted">Solicitudes enviadas al correo maestro. Solo Administración puede autorizar el restablecimiento.</p></div>' +
        '<button type="button" class="cc-accion" data-action="refresh">Actualizar</button>' +
      '</div>' +
      '<p class="msg" data-role="message" aria-live="polite"></p>' +
      '<div class="lista" data-role="requests"></div>';

    var firstBlock = tab.querySelector(".cc-bloque");
    if (firstBlock) tab.insertBefore(panel, firstBlock);
    else tab.appendChild(panel);
    return panel;
  }

  function renderRequests() {
    var panel = ensurePanel();
    if (!panel) return;
    var list = panel.querySelector('[data-role="requests"]');
    if (!list) return;
    list.replaceChildren();

    if (!currentRequests.length) {
      addText(list, "p", "lista-estado", "No hay solicitudes pendientes.");
      return;
    }

    currentRequests.forEach(function (request) {
      var card = document.createElement("article");
      card.className = "lista-item bc-recovery-request";
      card.dataset.requestId = request.id;

      var details = document.createElement("div");
      details.className = "bc-recovery-request-details";
      addText(details, "strong", "", request.target_name || request.target_username);
      addText(details, "small", "muted", "Usuario: " + (request.target_username || "—"));
      addText(details, "small", "muted", "Solicitada: " + formatDate(request.requested_at));
      addText(details, "small", "muted",
        request.notification_status === "ENVIADA"
          ? "Aviso enviado al correo maestro"
          : request.notification_status === "FALLIDA"
            ? "Aviso por correo no confirmado; solicitud visible aquí"
            : "Aviso de correo pendiente");
      card.appendChild(details);

      var form = document.createElement("div");
      form.className = "bc-recovery-request-actions";
      var password = document.createElement("input");
      password.type = "password";
      password.autocomplete = "new-password";
      password.minLength = 10;
      password.maxLength = 128;
      password.placeholder = "Contraseña temporal (mín. 10)";
      password.setAttribute("aria-label", "Contraseña temporal para " + (request.target_username || "dependienta"));
      password.dataset.role = "temporary-password";
      form.appendChild(password);

      var approve = document.createElement("button");
      approve.type = "button";
      approve.className = "cc-accion";
      approve.dataset.action = "approve";
      approve.textContent = "Autorizar y establecer contraseña";
      form.appendChild(approve);

      var reject = document.createElement("button");
      reject.type = "button";
      reject.className = "cc-accion";
      reject.dataset.action = "reject";
      reject.textContent = "Rechazar";
      form.appendChild(reject);
      card.appendChild(form);

      if (new URLSearchParams(window.location.search).get("bc_admin_recovery") === request.id) {
        card.classList.add("bc-recovery-request-highlight");
        card.setAttribute("tabindex", "-1");
      }
      list.appendChild(card);
    });
  }

  function setMessage(message, ok) {
    var panel = ensurePanel();
    var node = panel && panel.querySelector('[data-role="message"]');
    if (!node) return;
    node.className = ok ? "msg ok" : "msg error";
    node.textContent = message || "";
  }

  async function refresh() {
    if (busy || !isAdmin()) return;
    busy = true;
    var panel = ensurePanel();
    var refresh = panel && panel.querySelector('[data-action="refresh"]');
    if (refresh) { refresh.disabled = true; refresh.textContent = "Cargando…"; }
    try {
      var result = await callApi("list");
      currentRequests = Array.isArray(result.requests) ? result.requests : [];
      renderRequests();
      setMessage("", true);
      var focusId = new URLSearchParams(window.location.search).get("bc_admin_recovery");
      if (focusId) {
        if (typeof irATab === "function") irATab("usuarios");
        var focused = document.querySelector('[data-request-id="' + focusId + '"]');
        if (focused && typeof focused.scrollIntoView === "function") {
          focused.scrollIntoView({ behavior: "smooth", block: "center" });
          try { focused.focus({ preventScroll: true }); } catch (_) {}
        }
      }
    } catch (error) {
      setMessage(error.status === 403
        ? "Solo Administración puede revisar estas solicitudes."
        : "No se pudieron cargar las solicitudes. Comprueba la conexión y vuelve a intentar.", false);
    } finally {
      busy = false;
      if (refresh) { refresh.disabled = false; refresh.textContent = "Actualizar"; }
    }
  }

  async function onClick(event) {
    var button = event.target && event.target.closest ? event.target.closest("button[data-action]") : null;
    if (!button || !isAdmin() || busy) return;
    var action = button.dataset.action;
    if (action === "refresh") { await refresh(); return; }

    var card = button.closest("[data-request-id]");
    if (!card) return;
    var requestId = card.dataset.requestId;

    if (action === "approve") {
      var input = card.querySelector('[data-role="temporary-password"]');
      var temporaryPassword = input ? input.value : "";
      if (temporaryPassword.length < 10 || temporaryPassword.length > 128) {
        setMessage("Escribe una contraseña temporal de entre 10 y 128 caracteres.", false);
        if (input) input.focus();
        return;
      }
      if (!window.confirm("¿Autorizar el restablecimiento de esta cuenta? La dependienta deberá cambiar la contraseña en su próximo acceso.")) return;
      busy = true;
      button.disabled = true;
      button.textContent = "Autorizando…";
      try {
        await callApi("approve", { request_id: requestId, temporary_password: temporaryPassword });
        if (input) input.value = "";
        setMessage("Contraseña temporal establecida. Entrégala directamente a la dependienta; el cambio será obligatorio al próximo acceso.", true);
        await refreshAfterMutation();
      } catch (error) {
        setMessage(error.message || "No se pudo autorizar la solicitud.", false);
      } finally {
        busy = false;
        button.disabled = false;
        button.textContent = "Autorizar y establecer contraseña";
      }
      return;
    }

    if (action === "reject") {
      if (!window.confirm("¿Rechazar esta solicitud de recuperación?")) return;
      busy = true;
      button.disabled = true;
      try {
        await callApi("reject", { request_id: requestId });
        setMessage("Solicitud rechazada.", true);
        await refreshAfterMutation();
      } catch (error) {
        setMessage(error.message || "No se pudo rechazar la solicitud.", false);
      } finally {
        busy = false;
        button.disabled = false;
      }
    }
  }

  async function refreshAfterMutation() {
    var result = await callApi("list");
    currentRequests = Array.isArray(result.requests) ? result.requests : [];
    renderRequests();
  }

  function bootWhenReady(attempt) {
    if (!isAdmin()) return;
    var panel = ensurePanel();
    if (panel) {
      var tab = document.getElementById("tab-usuarios");
      if (tab && tab.dataset.bcPasswordRecoveryBound !== "1") {
        tab.dataset.bcPasswordRecoveryBound = "1";
        tab.addEventListener("click", onClick);
      }
      refresh();
      window.__BC_PASSWORD_RECOVERY_ADMIN_VERIFY__ = function () {
        return { visible: !!document.getElementById(ROOT_ID), admin: isAdmin(), pending: currentRequests.length };
      };
      return;
    }
    if (attempt < 30) window.setTimeout(function () { bootWhenReady(attempt + 1); }, 250);
  }

  function tryBoot() {
    if (!isAdmin()) return;
    bootWhenReady(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryBoot, { once: true });
  } else {
    tryBoot();
  }
  if (client && client.auth && typeof client.auth.onAuthStateChange === "function") {
    client.auth.onAuthStateChange(function () { window.setTimeout(tryBoot, 0); });
  }
  window.addEventListener("focus", tryBoot);
  window.setTimeout(tryBoot, 500);
})();
