// ==== Battlecruiser · js/auth.js ====
// Autenticación, sesión, actualizar app, ajustes de cuenta, SW, atajos.
// v9.2.80 — M26.4: boot sin flash de login; sesión pendiente hasta que exista cargarContextoUsuario.

const loginForm = document.getElementById("login-form");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const appShell = document.getElementById("app-shell");
const userEmailEl = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");
const lanternWrap = document.getElementById("lantern-wrap");

let _usuarioActualId = null;
let _novedadesVistas = new Set();
let _usuarioActual = null;
let _permisosEfectivos = {};
let _cargandoUsuario = false;
let _permisosCargaExitosa = false;
let _permisosCargaFallidaRed = false;
let _bcSesionActivaId = null;
/** Sesión descubierta antes de que usuarios-permisos.js defina cargarContextoUsuario. */
let _bcPendingSession = null;
let _bcAuthBootResolved = false;
// No descartar una sesión válida mientras termina de prepararse la interfaz.
let _bcAuthSessionDiscovered = false;
let _bcAuthLastGetSessionErrorKind = null;
let _bcAuthLastGetSessionErrorShape = null;
let _bcAuthLastGetSessionErrorFingerprint = null;
let _bcAuthLastGetSessionErrorTrace = null;
let _bcAuthGetSessionRetryAttempts = 0;
let _bcAuthGetSessionRetryPending = false;

// Diagnóstico de restauración sin leer, guardar ni imprimir tokens.
function bcAuthStoragePresence() {
  try {
    return window.localStorage.getItem("sb-papxnkkjtkxsitcsvcme-auth-token") === null
      ? "MISSING"
      : "PRESENT";
  } catch (_) {
    return "BLOCKED";
  }
}
function bcAuthErrorKind(error) {
  if (!error) return "NO_ERROR_OBJECT";
  // Supabase may wrap an unexpected initialization failure in AuthUnknownError.originalError.
  // Inspect nested causes only in memory; never display/log raw error details.
  var pending = [error];
  var visited = [];
  while (pending.length && visited.length < 8) {
    var current = pending.shift();
    if (current == null) continue;
    if (typeof current !== "object" && typeof current !== "string") continue;
    if (typeof current === "object") {
      if (visited.indexOf(current) !== -1) continue;
      visited.push(current);
    }
    var name = typeof current === "object" ? String(current.name || (current.constructor && current.constructor.name) || "").toLowerCase() : "";
    var code = typeof current === "object" ? String(current.code || "").toLowerCase() : "";
    var message = typeof current === "string" ? current.toLowerCase() : String(current.message || "").toLowerCase();
    var signature = name + " " + code + " " + message;
    if (/navigator.?locks?|lock/.test(signature) && /timeout|timed out|acquir|held/.test(signature)) return "LOCK_TIMEOUT";
    if (/refresh.?token|invalid_grant|session_not_found|refresh token/.test(signature)) return "REFRESH_TOKEN_ERROR";
    if (/localstorage|storage|serialize|deserialize|json parse|invalid json|quotaexceeded/.test(signature)) return "STORAGE_ERROR";
    if (/failed to fetch|fetcherror|network|offline|load failed|econn|http.?error|err_network/.test(signature)) return "NETWORK_ERROR";
    if (/jwt|unauthorized|authsessionmissing|session missing|invalid session/.test(signature)) return "AUTH_ERROR";
    if (typeof current === "object") {
      ["originalError", "cause", "error", "innerError", "context"].forEach(function (key) {
        try { if (current[key] != null && current[key] !== current) pending.push(current[key]); } catch (_) {}
      });
    }
  }
  return "OTHER_ERROR";
}
function bcAuthErrorShape(error) {
  var pending = [error];
  var visited = [];
  var shapes = [];
  while (pending.length && visited.length < 8 && shapes.length < 4) {
    var current = pending.shift();
    if (current == null) continue;
    if (typeof current === "object") {
      if (visited.indexOf(current) !== -1) continue;
      visited.push(current);
    }
    var type = "Unknown";
    try {
      if (typeof current === "string") type = "String";
      else if (typeof current === "object") type = String(current.name || (current.constructor && current.constructor.name) || "Object");
      else type = typeof current;
    } catch (_) {
      type = "Object";
    }
    type = type.replace(/[^A-Za-z0-9_$.-]/g, "").slice(0, 32) || "Object";
    if (shapes.indexOf(type) === -1) shapes.push(type);
    if (typeof current === "object") {
      ["originalError", "cause", "error", "innerError", "context"].forEach(function (key) {
        try { if (current[key] != null && current[key] !== current) pending.push(current[key]); } catch (_) {}
      });
    }
  }
  return shapes.length ? shapes.join(">") : "NO_ERROR_OBJECT";
}

function bcAuthErrorFingerprint(error) {
  var pending = [error];
  var visited = [];
  while (pending.length && visited.length < 8) {
    var current = pending.shift();
    if (current == null) continue;
    if (typeof current === "object") {
      if (visited.indexOf(current) !== -1) continue;
      visited.push(current);
    }
    var name = "";
    var message = "";
    try {
      if (typeof current === "string") message = current;
      else if (typeof current === "object") {
        name = String(current.name || (current.constructor && current.constructor.name) || "").toLowerCase();
        message = String(current.message || "").toLowerCase();
      }
    } catch (_) {}
    if (/maximum call stack size exceeded|too much recursion/.test(message)) return "STACK_OVERFLOW";
    if (/invalid array length/.test(message)) return "INVALID_ARRAY_LENGTH";
    if (/invalid string length/.test(message)) return "INVALID_STRING_LENGTH";
    if (/out of memory/.test(message)) return "OUT_OF_MEMORY";
    if (/cyclic|circular/.test(message)) return "CIRCULAR_DATA";
    if (/quotaexceeded|localstorage|storage|serialize|deserialize|json parse|invalid json/.test(name + " " + message)) return "STORAGE_FAILURE";
    if (/lock/.test(name + " " + message) && /timeout|timed out|acquir|held/.test(name + " " + message)) return "LOCK_FAILURE";
    if (name === "rangeerror") return "RANGE_ERROR_UNCLASSIFIED";
    if (name === "typeerror") return "TYPE_ERROR_UNCLASSIFIED";
    if (typeof current === "object") {
      ["originalError", "cause", "error", "innerError", "context"].forEach(function (key) {
        try { if (current[key] != null && current[key] !== current) pending.push(current[key]); } catch (_) {}
      });
    }
  }
  return "UNCLASSIFIED";
}
function bcAuthSafeStack(error) {
  var pending = [error];
  var visited = [];
  while (pending.length && visited.length < 8) {
    var current = pending.shift();
    if (current == null) continue;
    if (typeof current === "object") {
      if (visited.indexOf(current) !== -1) continue;
      visited.push(current);
    }
    var stack = "";
    try { if (current && typeof current.stack === "string") stack = current.stack; } catch (_) {}
    if (stack) {
      var frames = [];
      stack.split(/\r?\n/).slice(0, 12).forEach(function (line) {
        var m = line.match(/^\s*at\s+([A-Za-z_$][A-Za-z0-9_$<>.]*)\s+\(https?:\/\/[^/\s)]+\/([^/?\s):]+\.js)(?:\?[^:\s)]*)?:(\d+):\d+\)/);
        if (m) {
          frames.push(m[1].slice(0, 40) + "@" + m[2].slice(0, 40) + ":" + m[3]);
          return;
        }
        m = line.match(/^\s*at\s+https?:\/\/[^/\s)]+\/([^/?\s):]+\.js)(?:\?[^:\s)]*)?:(\d+):\d+/);
        if (m) frames.push(m[1].slice(0, 40) + ":" + m[2]);
      });
      if (frames.length) return frames.slice(0, 3).join(">");
    }
    if (typeof current === "object") {
      ["originalError", "cause", "error", "innerError", "context"].forEach(function (key) {
        try { if (current[key] != null && current[key] !== current) pending.push(current[key]); } catch (_) {}
      });
    }
  }
  return "NO_SAFE_FRAMES";
}
function bcHandleGetSessionError(error) {
  var kind = bcAuthErrorKind(error);
  var shape = bcAuthErrorShape(error);
  var fingerprint = bcAuthErrorFingerprint(error);
  var trace = bcAuthSafeStack(error);
  var storage = bcAuthStoragePresence();
  _bcAuthLastGetSessionErrorKind = kind;
  _bcAuthLastGetSessionErrorShape = shape;
  _bcAuthLastGetSessionErrorFingerprint = fingerprint;
  _bcAuthLastGetSessionErrorTrace = trace;
  bcAuthDiagnostic("GETSESSION_ERROR", true, kind, shape, fingerprint, trace);
  if (_bcAuthBootResolved) return;
  if (storage !== "PRESENT") {
    bcResolverBootSinSesion();
    return;
  }
  // Keep boot pending briefly and retry the SDK read twice; do not clear stored auth state.
  console.warn("[BattleCruiser] getSession failed while a session key exists; bounded retry scheduled", {
    cause: kind,
    storage: "PRESENT",
    shape: shape,
    fingerprint: fingerprint,
    trace: trace,
    retries: _bcAuthGetSessionRetryAttempts
  });
  bcScheduleGetSessionRetry();
}
function bcScheduleGetSessionRetry() {
  if (_bcAuthBootResolved || _bcAuthSessionDiscovered || _bcAuthGetSessionRetryPending || _bcAuthGetSessionRetryAttempts >= 2) return;
  var attempt = ++_bcAuthGetSessionRetryAttempts;
  _bcAuthGetSessionRetryPending = true;
  window.setTimeout(function () {
    _bcAuthGetSessionRetryPending = false;
    if (_bcAuthBootResolved || _bcAuthSessionDiscovered) return;
    Promise.resolve().then(function () {
      return client.auth.getSession();
    }).then(function (res) {
      if (_bcAuthBootResolved || _bcAuthSessionDiscovered) return;
      var data = res && res.data;
      if (data && data.session) {
        bcAuthDiagnostic("SESSION_FOUND_AFTER_RETRY", false);
        bcResolverBootConSesion(data.session);
        if (_bcRecoveryMode) bcMostrarFormularioRecuperacion();
        return;
      }
      if (res && res.error) {
        bcHandleGetSessionError(res.error);
        return;
      }
      bcAuthDiagnostic("GETSESSION_RETRY_EMPTY", true, "NONE");
      if (_bcAuthGetSessionRetryAttempts < 2) bcScheduleGetSessionRetry();
    }).catch(function (error) {
      bcHandleGetSessionError(error);
    });
  }, attempt === 1 ? 650 : 1400);
}
function bcAuthDiagnostic(code, visible, cause, shape, fingerprint, trace) {
  var storage = bcAuthStoragePresence();
  var safeCause = cause || "NONE";
  var safeShape = shape || "NONE";
  var safeFingerprint = fingerprint || "NONE";
  var safeTrace = trace || "NONE";
  window.__BC_AUTH_DIAGNOSTIC__ = { code: code, storage: storage, cause: safeCause, shape: safeShape, fingerprint: safeFingerprint, trace: safeTrace };
  console.warn("[BattleCruiser] auth diagnostic", { code: code, storage: storage, cause: safeCause, shape: safeShape, fingerprint: safeFingerprint, trace: safeTrace });
  if (!visible || !loginForm) return;
  var el = document.getElementById("bc-auth-diagnostic");
  if (!el) {
    el = document.createElement("p");
    el.id = "bc-auth-diagnostic";
    el.className = "footnote bc-auth-diagnostic";
    el.setAttribute("role", "status");
    loginForm.appendChild(el);
  }
  el.textContent = "Diagnóstico de sesión: " + code
    + (safeCause !== "NONE" ? " · causa: " + safeCause : "")
    + (safeShape !== "NONE" ? " · tipo: " + safeShape : "")
    + (safeFingerprint !== "NONE" ? " · firma: " + safeFingerprint : "")
    + (safeTrace !== "NONE" ? " · traza: " + safeTrace : "")
    + " · almacenamiento local: " + storage
    + ". Comparte solo estos valores; no compartas contraseñas ni datos de sesión.";
}
// Recovery links must open the password form directly; do not make the user hunt for Ajustes.
// Keep a query marker as fallback because Supabase may consume/remove the recovery hash during boot.
let _bcRecoveryMode = (function () {
  try {
    const query = new URLSearchParams(window.location.search || "");
    const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    return query.get("bc_recovery") === "1" || hash.get("type") === "recovery";
  } catch (_) {
    return false;
  }
})();
let _bcRecoveryUiScheduled = false;

function bcIntentarCargarContexto() {
  if (typeof cargarContextoUsuario !== "function") return false;
  if (_cargandoUsuario) return true;
  if (_usuarioActual && _permisosCargaExitosa) return true;
  cargarContextoUsuario();
  return true;
}

/** Llamado al final de usuarios-permisos.js cuando la función ya existe. */
window.__bcOnContextoLoaderReady = function () {
  if (_bcPendingSession || (_bcSesionActivaId && appShell && appShell.classList.contains("visible"))) {
    _bcPendingSession = null;
    bcIntentarCargarContexto();
  }
};

function bcUIReadyThen(fn) {
  const ready = window.__BC_UI_READY__;
  if (!ready || typeof ready.then !== "function") {
    fn();
    return;
  }
  Promise.race([
    ready,
    new Promise(resolve => setTimeout(resolve, 12000))
  ]).then(fn).catch(fn);
}

function showApp(session) {
  if (!session || !session.user) return;
  _bcAuthSessionDiscovered = true;

  // Nunca expongas el shell estático/legacy antes de que la cadena UI actual
  // termine. Esto elimina el pantallazo de menús/vistas retirados durante boot.
  if (!window.__BC_UI_READY_RESOLVED__) {
    _bcPendingSession = session;
    bcUIReadyThen(() => {
      if (_bcPendingSession === session || _bcPendingSession) {
        const pending = _bcPendingSession || session;
        _bcPendingSession = null;
        showApp(pending);
      }
    });
    return;
  }

  // Idempotencia: misma sesión y shell ya visible → solo asegurar contexto
  if (_bcSesionActivaId === session.user.id && appShell && appShell.classList.contains("visible")) {
    if (!_usuarioActual || !_permisosCargaExitosa) {
      if (!bcIntentarCargarContexto()) {
        _bcPendingSession = session;
      }
    }
    return;
  }
  _bcSesionActivaId = session.user.id;
  _bcAuthBootResolved = true;

  if (typeof resetearNavegacionParaNuevaSesion === "function") {
    resetearNavegacionParaNuevaSesion();
  } else {
    document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
    document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("visible"); });
  }
  loginForm.classList.add("hidden");
  if (lanternWrap) lanternWrap.classList.add("hidden");
  appShell.classList.add("visible");
  if (userEmailEl) userEmailEl.textContent = "Cargando usuario…";
  _usuarioActualId = session.user.id;

  if (!bcIntentarCargarContexto()) {
    // usuarios-permisos.js aún no cargó (orden de scripts / red lenta tras Actualizar app)
    _bcPendingSession = session;
  }
}

function showLogin() {
  _bcSesionActivaId = null;
  _bcPendingSession = null;
  _bcAuthBootResolved = true;
  if (typeof resetearNavegacionParaNuevaSesion === "function") {
    resetearNavegacionParaNuevaSesion();
  } else {
    document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
    document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("visible"); });
  }
  loginForm.classList.remove("hidden");
  if (lanternWrap) lanternWrap.classList.remove("hidden");
  appShell.classList.remove("visible");
  _usuarioActualId = null;
  if (userEmailEl) userEmailEl.textContent = "";
  if (typeof limpiarContextoUsuario === "function") limpiarContextoUsuario();
  const usuarioInput = document.getElementById("email");
  if (usuarioInput) usuarioInput.focus();
}

// M26.4: NO llamar showLogin() de inmediato → evita flash de login con sesión válida.
// Ocultar login visualmente hasta saber si hay sesión (el form puede verse un instante
// por CSS por defecto; lo minimizamos marcando estado de boot).
document.documentElement.classList.add("bc-auth-booting");
if (loginForm) loginForm.setAttribute("aria-busy", "true");

function bcResolverBootSinSesion() {
  document.documentElement.classList.remove("bc-auth-booting");
  if (loginForm) loginForm.removeAttribute("aria-busy");
  showLogin();
}

function bcResolverBootConSesion(session) {
  if (session && session.user) _bcAuthSessionDiscovered = true;
  const mostrar = () => {
    document.documentElement.classList.remove("bc-auth-booting");
    if (loginForm) loginForm.removeAttribute("aria-busy");
    showApp(session);
  };
  bcUIReadyThen(mostrar);
}

// Recovery links land here with a valid Supabase recovery session.
// Display the existing secure updateUser form immediately, without requiring Ajustes.
function bcMostrarFormularioRecuperacion() {
  if (_bcRecoveryUiScheduled) return;
  _bcRecoveryUiScheduled = true;
  let intentos = 0;

  const intentar = () => {
    const shell = document.getElementById("app-shell");
    const panel = document.getElementById("pass-panel");
    if (!shell || !panel) {
      if (intentos++ < 120) window.setTimeout(intentar, 250);
      return;
    }
    if (!shell.classList.contains("visible")) {
      if (intentos++ < 120) window.setTimeout(intentar, 250);
      return;
    }

    panel.classList.remove("hidden");
    const heading = panel.querySelector("h3");
    if (heading) heading.textContent = "Establecer nueva contraseña";
    const message = document.getElementById("msg-pass");
    if (message) {
      message.className = "msg";
      message.textContent = "Enlace de recuperación reconocido. Escribe la nueva contraseña dos veces y pulsa Guardar nueva contraseña.";
    }
    const form = document.getElementById("form-pass");
    const submit = form && form.querySelector("button[type='submit']");
    if (submit) submit.textContent = "Guardar nueva contraseña";
    const input = document.getElementById("pass-new");
    if (input) input.focus({ preventScroll: true });
    panel.scrollIntoView({ block: "start", behavior: "auto" });
  };

  intentar();
}

client.auth.getSession().then(function (res) {
  var data = res && res.data;
  if (data && data.session) {
    bcAuthDiagnostic("SESSION_FOUND", false);
    bcResolverBootConSesion(data.session);
    if (_bcRecoveryMode) bcMostrarFormularioRecuperacion();
  } else if (!_bcAuthBootResolved) {
    if (res && res.error) {
      bcHandleGetSessionError(res.error);
    } else {
      bcAuthDiagnostic("GETSESSION_EMPTY", true);
      bcResolverBootSinSesion();
    }
  }
}).catch(function (error) {
  bcHandleGetSessionError(error);
});

// Red de seguridad: si getSession cuelga, no dejar la UI en limbo
setTimeout(function () {
  if (!_bcAuthBootResolved && !_bcAuthSessionDiscovered && !_bcPendingSession) {
    bcAuthDiagnostic("BOOT_TIMEOUT", true, _bcAuthLastGetSessionErrorKind || "NONE", _bcAuthLastGetSessionErrorShape || "NONE", _bcAuthLastGetSessionErrorFingerprint || "NONE", _bcAuthLastGetSessionErrorTrace || "NONE");
    bcResolverBootSinSesion();
  } else if (!_bcAuthBootResolved) {
    console.warn("[BattleCruiser] arranque de sesión aún pendiente; no se fuerza login porque ya se detectó una sesión");
  }
}, 8000);

client.auth.onAuthStateChange(function (event, session) {
  // PASSWORD_RECOVERY is the authoritative signal; open the reset form immediately.
  if (event === "PASSWORD_RECOVERY" && session) {
    _bcRecoveryMode = true;
    showApp(session);
    bcMostrarFormularioRecuperacion();
    return;
  }
  // TOKEN_REFRESHED / INITIAL_SESSION con misma sesión: showApp es idempotente
  if (session) {
    if (event === "SIGNED_OUT") {
      bcAuthDiagnostic("AUTH_SIGNED_OUT_EVENT", true);
      showLogin();
      return;
    }
    showApp(session);
  } else if (event === "SIGNED_OUT") {
    bcAuthDiagnostic("AUTH_SIGNED_OUT_EVENT", true);
    showLogin();
  } else if (_bcAuthBootResolved && event !== "INITIAL_SESSION") {
    bcAuthDiagnostic("AUTH_EVENT_" + String(event || "UNKNOWN") + "_NO_SESSION", true);
    showLogin();
  }
});

safeInit("login", () => {
  const usuarioInput = document.getElementById("email");
  const usuarioLabel = document.querySelector('label[for="email"]');
  if (usuarioInput) {
    usuarioInput.type = "text";
    usuarioInput.autocomplete = "username";
    usuarioInput.placeholder = "Tu usuario";
    usuarioInput.removeAttribute("inputmode");
  }
  if (usuarioLabel) usuarioLabel.textContent = "Usuario";

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";
    loginBtn.disabled = true;
    showLoading();
    loginBtn.textContent = "Entrando...";

    const nombreUsuario = usuarioInput ? usuarioInput.value.trim() : "";
    const password = document.getElementById("password").value;

    try {
      if (!nombreUsuario) {
        loginError.textContent = "Escribe tu usuario.";
        return;
      }

      let respuestaLogin;
      try {
        respuestaLogin = await fetch(SUPABASE_URL + "/functions/v1/bc-username-login", {
          method: "POST",
          headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ username: nombreUsuario, password }),
          cache: "no-store",
        });
      } catch (errorRed) {
        loginError.textContent = "Sin conexión o la red está lenta ahora mismo. Intenta de nuevo en un momento.";
        return;
      }

      const resultadoLogin = await respuestaLogin.json().catch(() => null);
      if (respuestaLogin.status === 401) {
        loginError.textContent = "Usuario o contraseña incorrectos.";
        return;
      }
      if (respuestaLogin.status === 429) {
        loginError.textContent = "Demasiados intentos. Espera unos minutos y vuelve a probar.";
        return;
      }
      if (!respuestaLogin.ok || !resultadoLogin?.session?.access_token || !resultadoLogin?.session?.refresh_token) {
        loginError.textContent = (!navigator.onLine || respuestaLogin.status >= 500)
          ? "El servicio de acceso no está disponible temporalmente. Intenta de nuevo en un momento."
          : "Usuario o contraseña incorrectos.";
        return;
      }

      const { error: errorSesion } = await client.auth.setSession({
        access_token: resultadoLogin.session.access_token,
        refresh_token: resultadoLogin.session.refresh_token,
      });
      if (errorSesion) {
        loginError.textContent = "No se pudo establecer la sesión. Intenta nuevamente.";
        return;
      }
    } catch (e) {
      loginError.textContent = "Sin conexión o la red está lenta ahora mismo. Intenta de nuevo en un momento.";
      console.error("[Battlecruiser] (login) excepción inesperada", e);
    } finally {
      hideLoading();
      loginBtn.disabled = false;
      loginBtn.textContent = "Entrar";
    }
  });
});

// Permitir solicitar otro enlace de recuperación directamente desde el login.
safeInit("password-recovery-request", () => {
  const recoveryBtn = document.getElementById("password-recovery-request-btn");
  const recoveryMsg = document.getElementById("password-recovery-msg");
  const usuarioInput = document.getElementById("email");
  if (!recoveryBtn || !recoveryMsg || !usuarioInput) return;

  recoveryBtn.addEventListener("click", async () => {
    const email = usuarioInput.value.trim();
    recoveryMsg.className = "msg";
    recoveryMsg.textContent = "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      recoveryMsg.className = "msg error";
      recoveryMsg.textContent = "Escribe un correo válido en el campo superior para enviarte el enlace.";
      usuarioInput.focus();
      return;
    }

    recoveryBtn.disabled = true;
    recoveryBtn.textContent = "Enviando correo…";
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/?bc_recovery=1"
      });
      if (error) {
        recoveryMsg.className = "msg error";
        recoveryMsg.textContent = "No se pudo solicitar el correo: " + (error.message || "inténtalo más tarde.");
        return;
      }
      recoveryMsg.className = "msg";
      recoveryMsg.textContent = "Solicitud enviada. Revisa la bandeja de entrada y spam; usa el correo más reciente.";
    } catch (error) {
      recoveryMsg.className = "msg error";
      recoveryMsg.textContent = "No se pudo conectar para solicitar el correo. Comprueba la conexión e inténtalo otra vez.";
      console.error("[BattleCruiser] password recovery request failed", error);
    } finally {
      recoveryBtn.disabled = false;
      recoveryBtn.textContent = "Enviar correo de recuperación";
    }
  });
});

safeInit("logout", () => {
  logoutBtn.addEventListener("click", async () => {
    if (typeof resetearNavegacionParaNuevaSesion === "function") resetearNavegacionParaNuevaSesion();
    if (typeof limpiarContextoUsuario === "function") limpiarContextoUsuario();
    if (userEmailEl) userEmailEl.textContent = "";
    _bcSesionActivaId = null;
    _bcPendingSession = null;
    await client.auth.signOut();
  });
});

safeInit("nuevo-usuario", () => {
  const form = document.getElementById("form-nuevo-usuario");
  const msgEl = document.getElementById("msg-nuevo-usuario");
  if (!form || !msgEl) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgEl.textContent = "";
    const nombre = document.getElementById("nuevo-usuario-nombre").value.trim();
    const email = document.getElementById("nuevo-usuario-email").value.trim();
    const password = document.getElementById("nuevo-usuario-password").value;

    if (!nombre) {
      msgEl.textContent = "El nombre es obligatorio.";
      return;
    }
    if (password.length < 6) {
      msgEl.textContent = "La contraseña debe tener al menos 6 caracteres.";
      return;
    }

    showLoading();
    try {
      const clienteTemporal = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await clienteTemporal.auth.signUp({ email, password });
      if (error) {
        msgEl.textContent = "Error al crear usuario: " + (error.message || "Error desconocido");
        console.error("[BattleCruiser] (nuevo-usuario)", error);
        return;
      }

      const nuevoId = data && data.user && data.user.id;
      if (!nuevoId) {
        msgEl.textContent = "El usuario se creó en autenticación, pero no se recibió su id. Contactá soporte técnico antes de reintentar.";
        console.error("[BattleCruiser] (nuevo-usuario) signUp sin data.user.id", data);
        return;
      }

      const { error: errorPerfil } = await client.rpc("crear_usuario_interno", { p_id: nuevoId, p_nombre: nombre });
      if (errorPerfil) {
        msgEl.textContent = "El usuario se creó en autenticación, pero falló al crear su perfil interno (" + (errorPerfil.message || "error desconocido") + "). Contactá soporte técnico antes de reintentar con el mismo correo.";
        console.error("[Battlecruiser] (nuevo-usuario) crear_usuario_interno", errorPerfil);
        return;
      }

      msgEl.textContent = "Usuario creado correctamente. Asignale un rol en la lista de usuarios. Si la confirmación de email está activada en el proyecto, deberá confirmar su correo antes de poder entrar.";
      form.reset();
      if (typeof refrescarUsuarios === "function") refrescarUsuarios();
    } catch (e) {
      msgEl.textContent = "Ocurrió un error inesperado al crear el usuario (" + (e && e.message ? e.message : "error desconocido") + "). No se pudo confirmar si quedó creado — revisá la lista antes de reintentar.";
      console.error("[BattleCruiser] (nuevo-usuario) excepción inesperada", e);
    } finally {
      hideLoading();
    }
  });
});

/** M26.4: una sola ruta de actualización — limpia SW + caches y fuerza URL nueva. */
async function actualizarApp(btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Actualizando...";
  }
  try {
    if ("serviceWorker" in navigator) {
      var regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(function (r) { return r.unregister(); }));
    }
    if ("caches" in window) {
      var keys = await caches.keys();
      await Promise.all(
        keys.filter(function (k) {
          return k.startsWith("battlecruiser-shell-") || k.startsWith("battlecruiser");
        }).map(function (k) { return caches.delete(k); })
      );
    }
  } catch (e) {
    console.warn("[BattleCruiser] actualización: limpieza parcial", e);
  }
  var ver = (typeof window.__BC_VERSION__ === "string" && window.__BC_VERSION__) || "9.2.80";
  var u = new URL(location.href);
  u.searchParams.set("bc_update", ver + "-" + Date.now());
  location.replace(u.toString());
}

safeInit("actualizar-app-login", () => {
  const btn = document.getElementById("update-app-btn-login");
  if (btn) btn.addEventListener("click", () => actualizarApp(btn));
});

safeInit("actualizar-app", () => {
  const updateAppBtn = document.getElementById("update-app-btn");
  if (updateAppBtn) updateAppBtn.addEventListener("click", () => actualizarApp(updateAppBtn));
});

const OJO_ABIERTO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const OJO_TACHADO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-7-11-7a20.6 20.6 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a20.6 20.6 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

safeInit("ojito-contraseña", () => {
  document.querySelectorAll(".pass-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      const mostrando = input.type === "text";
      const ahoraVisible = !mostrando;
      input.type = ahoraVisible ? "text" : "password";
      btn.setAttribute("aria-label", ahoraVisible ? "Ocultar contraseña" : "Mostrar contraseña");
      btn.classList.toggle("activo", ahoraVisible);
      btn.innerHTML = ahoraVisible ? OJO_TACHADO_SVG : OJO_ABIERTO_SVG;
    });
  });
});

safeInit("menu-ajustes", () => {
  const ajustesBtn = document.getElementById("ajustes-btn");
  const ajustesMenu = document.getElementById("ajustes-menu");

  ajustesBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    ajustesMenu.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!ajustesMenu.classList.contains("hidden") && !ajustesMenu.contains(e.target) && e.target !== ajustesBtn) {
      ajustesMenu.classList.add("hidden");
    }
  });
});

safeInit("cambiar-contraseña", () => {
  const changePassBtn = document.getElementById("change-pass-btn");
  const passPanel = document.getElementById("pass-panel");
  const passCancelBtn = document.getElementById("pass-cancel-btn");
  const formPass = document.getElementById("form-pass");
  const ajustesMenu = document.getElementById("ajustes-menu");

  changePassBtn.addEventListener("click", () => {
    passPanel.classList.toggle("hidden");
    if (ajustesMenu) ajustesMenu.classList.add("hidden");
  });

  passCancelBtn.addEventListener("click", () => {
    formPass.reset();
    document.getElementById("msg-pass").textContent = "";
    passPanel.classList.add("hidden");
  });

  formPass.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nueva = document.getElementById("pass-new").value;
    const confirmar = document.getElementById("pass-confirm").value;
    const submitBtn = formPass.querySelector("button[type='submit']");

    if (nueva !== confirmar) {
      setMsg("msg-pass", "Las contraseñas no coinciden.", false);
      return;
    }
    if (nueva.length < 6) {
      setMsg("msg-pass", "La contraseña debe tener al menos 6 caracteres.", false);
      return;
    }

    const { data: sesionActual } = await client.auth.getSession();
    if (!sesionActual.session) {
      setMsg("msg-pass", "Se perdió la sesión — cerrá sesión y volvé a entrar antes de cambiar la contraseña.", false);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";

    const { data, error } = await client.auth.updateUser({ password: nueva });

    submitBtn.disabled = false;
    submitBtn.textContent = "Guardar contraseña";

    if (error) {
      console.error("[Battlecruiser] updateUser password error:", error);
      setMsg("msg-pass", "No se pudo cambiar: " + explicarError(error, "cambiar contraseña"), false);
      return;
    }
    console.log("[Battlecruiser] Contraseña actualizada para:", data.user && data.user.email);
    setMsg("msg-pass", "Contraseña actualizada. Ya podés usarla la próxima vez que entres.", true);
    if (_bcRecoveryMode) {
      _bcRecoveryMode = false;
      const heading = passPanel.querySelector("h3");
      if (heading) heading.textContent = "Contraseña actualizada";
      const resetBtn = formPass.querySelector("button[type='submit']");
      if (resetBtn) resetBtn.textContent = "Guardar contraseña";
      try { window.history.replaceState({}, document.title, window.location.pathname); } catch (_) {}
    }
    formPass.reset();
  });
});

if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

safeInit("escape-cierra-paneles", () => {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const ajustesMenu = document.getElementById("ajustes-menu");
    const passPanel = document.getElementById("pass-panel");
    if (ajustesMenu && !ajustesMenu.classList.contains("hidden")) {
      ajustesMenu.classList.add("hidden");
    }
    if (passPanel && !passPanel.classList.contains("hidden")) {
      passPanel.classList.add("hidden");
    }
    if (typeof window._battlecruiserCerrarMenuLateral === "function") {
      window._battlecruiserCerrarMenuLateral();
    }
  });
});

safeInit("bloqueo-scroll-numeros", () => {
  document.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener("wheel", () => input.blur(), { passive: true });
  });
});
