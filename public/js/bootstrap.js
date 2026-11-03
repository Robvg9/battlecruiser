"use strict";

(function bootstrapFirstOwner() {
  const SUPABASE_URL = "https://papxnkkjtkxsitcsvcme.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_pczHaS1JDPGrEA31vdbOLg_1l2qFhbm";
  const FUNCTION_URL = SUPABASE_URL + "/functions/v1/bc-bootstrap-admin";
  const REQUEST_ID_KEY = "bc-bootstrap-request-id";

  const form = document.getElementById("bc-bootstrap-form");
  const submit = document.getElementById("bc-bootstrap-submit");
  const message = document.getElementById("bc-bootstrap-message");
  if (!form || !submit || !message) return;

  function field(id) {
    const node = document.getElementById(id);
    return node ? node.value : "";
  }

  function showMessage(text, kind) {
    message.textContent = text;
    message.dataset.kind = kind || "";
  }

  function requestId() {
    try {
      let current = sessionStorage.getItem(REQUEST_ID_KEY);
      if (!current) {
        current = crypto.randomUUID();
        sessionStorage.setItem(REQUEST_ID_KEY, current);
      }
      return current;
    } catch (_) {
      return crypto.randomUUID();
    }
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    showMessage("", "");

    const username = field("bc-bootstrap-name").trim();
    const email = field("bc-bootstrap-email").trim().toLowerCase();
    const password = field("bc-bootstrap-password");
    const confirm = field("bc-bootstrap-confirm");
    const token = field("bc-bootstrap-token");

    if (!username || username.length > 120) {
      showMessage("Escribe un nombre válido.", "error");
      return;
    }
    const atPosition = email.indexOf("@");
    const lastDot = email.lastIndexOf(".");
    if (atPosition < 1 || atPosition !== email.lastIndexOf("@") ||
        lastDot <= atPosition + 1 || lastDot === email.length - 1 ||
        email.includes(" ") || email.length > 254) {
      showMessage("Escribe un correo válido.", "error");
      return;
    }
    if (password.length < 12 || password.length > 256) {
      showMessage("La contraseña debe tener entre 12 y 256 caracteres.", "error");
      return;
    }
    if (password !== confirm) {
      showMessage("Las contraseñas no coinciden.", "error");
      return;
    }
    if (token.length < 32 || token.length > 512) {
      showMessage("El código temporal no es válido.", "error");
      return;
    }
    if (!navigator.onLine) {
      showMessage("Necesitas conexión a Internet para inicializar el administrador.", "error");
      return;
    }

    submit.disabled = true;
    submit.textContent = "Inicializando…";
    let completed = false;
    try {
      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
          "x-bc-bootstrap-token": token
        },
        body: JSON.stringify({
          username: username,
          email: email,
          password: password,
          request_id: requestId()
        }),
        cache: "no-store",
        credentials: "omit"
      });
      const result = await response.json().catch(function () { return null; });
      if (response.ok && result && result.initialized === true) {
        try { sessionStorage.removeItem(REQUEST_ID_KEY); } catch (_) {}
        form.reset();
        completed = true;
        submit.disabled = true;
        submit.textContent = "Cuenta Dueño creada";
        showMessage("Cuenta Dueño creada. Ya puedes volver al acceso e iniciar sesión con tu correo y la contraseña nueva.", "success");
        return;
      }
      if (response.status === 401) {
        showMessage("El código no es válido, expiró o el proceso ya fue utilizado. No sigas probando códigos distintos.", "error");
      } else if (response.status === 429) {
        showMessage("Se alcanzó el límite temporal de intentos. No repitas solicitudes.", "error");
      } else if (response.status === 503) {
        showMessage("La solicitud no quedó confirmada. Mantén exactamente los mismos datos y vuelve a intentar; la operación está protegida por la misma clave de solicitud.", "error");
      } else {
        showMessage("No se pudo inicializar el administrador. Revisa los datos e inténtalo una sola vez más.", "error");
      }
    } catch (_) {
      showMessage("No se pudo confirmar la respuesta. Mantén los mismos datos y reintenta esta solicitud.", "error");
    } finally {
      if (!completed) {
        submit.disabled = false;
        submit.textContent = "Crear cuenta Dueño";
      }
    }
  });
})();
