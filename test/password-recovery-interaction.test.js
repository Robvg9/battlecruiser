"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");

const AUTH = fs.readFileSync(path.join(__dirname, "..", "public", "js", "auth.js"), "utf8");

function recoveryDom(fetchImpl) {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
    "<input id='email' value=''>" +
    "<button id='password-recovery-request-btn' type='button'>Enviar correo de recuperación</button>" +
    "<p id='password-recovery-msg' class='msg' role='status' aria-live='polite'></p>" +
    "</body></html>",
    { url: "https://battlecruiser-recovery.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  window.SUPABASE_URL = "https://supabase.example.invalid";
  window.SUPABASE_ANON_KEY = "test-anon-key";
  window.fetch = fetchImpl;
  window.safeInit = (name, callback) => {
    if (name === "password-recovery-request") callback();
  };
  const start = AUTH.indexOf("// Recuperación coherente con el login");
  const end = AUTH.indexOf('\nsafeInit("logout", () => {', start);
  assert.ok(start >= 0 && end > start, "must find the production recovery handler");
  window.eval(AUTH.slice(start, end));
  return { dom, window };
}

function passwordDom(options = {}) {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
    "<div id='pass-panel'><h3>Cambiar contraseña</h3>" +
    "<form id='form-pass'>" +
    "<input id='pass-new' type='password'>" +
    "<input id='pass-confirm' type='password'>" +
    "<button type='submit'>Guardar contraseña</button>" +
    "<button type='button' id='pass-cancel-btn'>Cancelar</button>" +
    "</form><p id='msg-pass' class='msg'></p></div>" +
    "<button id='change-pass-btn' type='button'>Cambiar contraseña</button>" +
    "</body></html>",
    { url: "https://battlecruiser-password.test/?bc_recovery=1", runScripts: "outside-only" }
  );
  const { window } = dom;
  const calls = [];
  window.client = {
    auth: {
      getSession: async () => ({ data: { session: options.session === false ? null : { user: { id: "fixture-user" } } }, error: null }),
      updateUser: async (payload) => {
        calls.push(payload);
        return options.updateError
          ? { data: null, error: { message: "fixture update rejected" } }
          : { data: { user: { id: "fixture-user", email: "fixture@example.invalid" } }, error: null };
      }
    }
  };
  window.safeInit = (name, callback) => {
    if (name === "cambiar-contraseña") callback();
  };
  window._bcRecoveryMode = !!options.recoveryMode;
  window.setMsg = (id, message, ok) => {
    const element = window.document.getElementById(id);
    element.textContent = message;
    element.className = ok ? "msg ok" : "msg error";
  };
  window.explicarError = (error) => String(error && error.message || error || "error");
  const start = AUTH.indexOf('safeInit("cambiar-contraseña", () => {');
  const end = AUTH.indexOf('\nif ("serviceWorker" in navigator', start);
  assert.ok(start >= 0 && end > start, "must find the production password form handler");
  window.eval(AUTH.slice(start, end));
  return { dom, window, calls };
}

async function waitFor(predicate, timeout = 1200) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

test("Paso 4 recovery: campo vacío no envía solicitud y enfoca identificador", async (t) => {
  let fetchCalls = 0;
  const c = recoveryDom(async () => { fetchCalls += 1; return { ok: true, status: 200 }; });
  t.after(() => c.dom.window.close());
  c.window.document.getElementById("email").value = "  ";
  c.window.document.getElementById("password-recovery-request-btn").click();
  assert.match(c.window.document.getElementById("password-recovery-msg").textContent, /Escribe tu correo o nombre de usuario/i);
  assert.equal(fetchCalls, 0, "invalid input must stop before fetch");
});

test("Paso 4 recovery: submits email/username through server-side resolver and shows generic success", async (t) => {
  const calls = [];
  const c = recoveryDom(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200 };
  });
  t.after(() => c.dom.window.close());
  c.window.document.getElementById("email").value = "  owner@example.invalid  ";
  const button = c.window.document.getElementById("password-recovery-request-btn");
  button.click();
  assert.ok(await waitFor(() => /correo o nombre de usuario corresponde a una cuenta activa/i.test(
    c.window.document.getElementById("password-recovery-msg").textContent
  )), "successful recovery response must show a non-enumerating generic result");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://supabase.example.invalid/functions/v1/bc-username-login");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.headers.apikey, "test-anon-key");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    mode: "password-recovery",
    username: "owner@example.invalid"
  });
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "Enviar correo de recuperación");
});

test("Paso 4 recovery: rate limit is explicit and button is re-enabled", async (t) => {
  const c = recoveryDom(async () => ({ ok: false, status: 429 }));
  t.after(() => c.dom.window.close());
  c.window.document.getElementById("email").value = "owner";
  c.window.document.getElementById("password-recovery-request-btn").click();
  assert.ok(await waitFor(() => /Demasiados intentos/i.test(c.window.document.getElementById("password-recovery-msg").textContent)));
  assert.equal(c.window.document.getElementById("password-recovery-request-btn").disabled, false);
});

test("Paso 4 recovery: network/server failure does not expose raw error and button is re-enabled", async (t) => {
  const c = recoveryDom(async () => { throw new Error("secret raw transport detail"); });
  t.after(() => c.dom.window.close());
  c.window.document.getElementById("email").value = "owner";
  c.window.document.getElementById("password-recovery-request-btn").click();
  assert.ok(await waitFor(() => /No se pudo completar la solicitud/i.test(c.window.document.getElementById("password-recovery-msg").textContent)));
  assert.doesNotMatch(c.window.document.getElementById("password-recovery-msg").textContent, /secret raw transport detail/);
  assert.equal(c.window.document.getElementById("password-recovery-request-btn").disabled, false);
});

test("Paso 4 reset: mismatched or short passwords are rejected before auth updateUser", async (t) => {
  const c = passwordDom();
  t.after(() => c.dom.window.close());
  const form = c.window.document.getElementById("form-pass");
  c.window.document.getElementById("pass-new").value = "123456";
  c.window.document.getElementById("pass-confirm").value = "654321";
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.match(c.window.document.getElementById("msg-pass").textContent, /no coinciden/i);
  assert.equal(c.calls.length, 0);

  c.window.document.getElementById("pass-new").value = "12345";
  c.window.document.getElementById("pass-confirm").value = "12345";
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.match(c.window.document.getElementById("msg-pass").textContent, /al menos 6 caracteres/i);
  assert.equal(c.calls.length, 0);
});

test("Paso 4 reset: missing session does not call updateUser", async (t) => {
  const c = passwordDom({ session: false });
  t.after(() => c.dom.window.close());
  c.window.document.getElementById("pass-new").value = "validpass123";
  c.window.document.getElementById("pass-confirm").value = "validpass123";
  c.window.document.getElementById("form-pass").dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(await waitFor(() => /Se perdió la sesión/i.test(c.window.document.getElementById("msg-pass").textContent)));
  assert.equal(c.calls.length, 0);
});

test("Paso 4 reset: valid recovery session updates password, clears form and ends recovery mode", async (t) => {
  const c = passwordDom({ recoveryMode: true });
  t.after(() => c.dom.window.close());
  const form = c.window.document.getElementById("form-pass");
  const submit = form.querySelector("button[type='submit']");
  c.window.document.getElementById("pass-new").value = "validpass123";
  c.window.document.getElementById("pass-confirm").value = "validpass123";
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(await waitFor(() => /Contraseña actualizada/i.test(c.window.document.getElementById("msg-pass").textContent)));
  assert.equal(c.calls.length, 1, "la sesión de recuperación válida debe ejecutar updateUser una sola vez");
  assert.equal(c.calls[0].password, "validpass123", "updateUser debe recibir la nueva contraseña");
  assert.equal(c.window.document.getElementById("pass-new").value, "");
  assert.equal(c.window.document.getElementById("pass-confirm").value, "");
  assert.equal(c.window._bcRecoveryMode, false);
  assert.equal(c.window.document.querySelector("#pass-panel h3").textContent, "Contraseña actualizada");
  assert.equal(submit.disabled, false);
});

test("Paso 4 reset: server rejection is shown and form contents remain for correction", async (t) => {
  const c = passwordDom({ updateError: true });
  t.after(() => c.dom.window.close());
  const form = c.window.document.getElementById("form-pass");
  c.window.document.getElementById("pass-new").value = "validpass123";
  c.window.document.getElementById("pass-confirm").value = "validpass123";
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(await waitFor(() => /No se pudo cambiar/i.test(c.window.document.getElementById("msg-pass").textContent)));
  assert.equal(c.calls.length, 1);
  assert.equal(c.window.document.getElementById("pass-new").value, "validpass123");
  assert.equal(c.window.document.getElementById("pass-confirm").value, "validpass123");
});


test("Paso 4 reset: cada botón Mostrar contraseña controla solo su campo", (t) => {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
    "<input id='pass-new' type='password'>" +
    "<button class='pass-toggle' data-target='pass-new' aria-label='Mostrar contraseña'>ojo 1</button>" +
    "<input id='pass-confirm' type='password'>" +
    "<button class='pass-toggle' data-target='pass-confirm' aria-label='Mostrar contraseña'>ojo 2</button>" +
    "</body></html>",
    { url: "https://battlecruiser-password-visibility.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  t.after(() => dom.window.close());
  window.safeInit = (name, callback) => {
    if (name === "ojito-contraseña") callback();
  };
  const start = AUTH.indexOf("const OJO_ABIERTO_SVG");
  const end = AUTH.indexOf('safeInit("menu-ajustes", () => {', start);
  assert.ok(start >= 0 && end > start, "must find the production password-visibility handler");
  window.eval(AUTH.slice(start, end));

  const passNew = window.document.getElementById("pass-new");
  const passConfirm = window.document.getElementById("pass-confirm");
  const [newButton, confirmButton] = window.document.querySelectorAll(".pass-toggle");
  newButton.click();
  assert.equal(passNew.type, "text");
  assert.equal(passConfirm.type, "password", "first toggle must not reveal the confirmation field");
  assert.equal(newButton.getAttribute("aria-label"), "Ocultar contraseña");
  confirmButton.click();
  assert.equal(passConfirm.type, "text");
  assert.equal(passNew.type, "text", "each toggle must control its own field");
  newButton.click();
  confirmButton.click();
  assert.equal(passNew.type, "password");
  assert.equal(passConfirm.type, "password");
});

test("Paso 4 reset: Cancelar limpia el formulario y cierra el panel sin llamar Auth", (t) => {
  const c = passwordDom();
  t.after(() => c.dom.window.close());
  const { window } = c;
  window.document.getElementById("pass-panel").classList.remove("hidden");
  window.document.getElementById("pass-new").value = "validpass123";
  window.document.getElementById("pass-confirm").value = "validpass123";
  window.document.getElementById("msg-pass").textContent = "mensaje anterior";
  window.document.getElementById("pass-cancel-btn").click();
  assert.equal(window.document.getElementById("pass-new").value, "");
  assert.equal(window.document.getElementById("pass-confirm").value, "");
  assert.equal(window.document.getElementById("msg-pass").textContent, "");
  assert.ok(window.document.getElementById("pass-panel").classList.contains("hidden"));
  assert.equal(c.calls.length, 0, "cancel must not submit a password update");
});


test("Paso 4 auth: Cerrar sesión limpia el contexto local y llama signOut una sola vez", async (t) => {
  const dom = new JSDOM(
    "<!doctype html><html><body><span id='user-email'>owner@example.invalid</span><button id='logout-btn'>Cerrar sesión</button></body></html>",
    { url: "https://battlecruiser-logout.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  t.after(() => dom.window.close());
  let resets = 0;
  let contextClears = 0;
  let signOutCalls = 0;
  window.logoutBtn = window.document.getElementById("logout-btn");
  window.userEmailEl = window.document.getElementById("user-email");
  window._bcSesionActivaId = "fixture-session";
  window._bcPendingSession = { id: "fixture-session" };
  window.resetearNavegacionParaNuevaSesion = () => { resets += 1; };
  window.limpiarContextoUsuario = () => { contextClears += 1; };
  window.client = {
    auth: {
      signOut: async () => { signOutCalls += 1; return { error: null }; }
    }
  };
  window.safeInit = (name, callback) => {
    if (name === "logout") callback();
  };
  const start = AUTH.indexOf('safeInit("logout", () => {');
  const end = AUTH.indexOf('\nsafeInit("nuevo-usuario", () => {', start);
  assert.ok(start >= 0 && end > start, "must find the production logout handler");
  window.eval(AUTH.slice(start, end));

  window.logoutBtn.click();
  assert.ok(await waitFor(() => signOutCalls === 1));
  assert.equal(resets, 1, "logout must reset navigation state");
  assert.equal(contextClears, 1, "logout must clear the prior user's context");
  assert.equal(window.userEmailEl.textContent, "");
  assert.equal(window._bcSesionActivaId, null);
  assert.equal(window._bcPendingSession, null);
  assert.equal(signOutCalls, 1, "one click must make exactly one signOut call");
});
