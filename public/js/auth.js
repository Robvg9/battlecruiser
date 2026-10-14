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
  const mostrar = () => {
    document.documentElement.classList.remove("bc-auth-booting");
    if (loginForm) loginForm.removeAttribute("aria-busy");
    showApp(session);
  };
  bcUIReadyThen(mostrar);
}

client.auth.getSession().then(function (res) {
  var data = res && res.data;
  if (data && data.session) bcResolverBootConSesion(data.session);
  else if (!_bcAuthBootResolved) bcResolverBootSinSesion();
}).catch(function () {
  if (!_bcAuthBootResolved) bcResolverBootSinSesion();
});

// Red de seguridad: si getSession cuelga, no dejar la UI en limbo
setTimeout(function () {
  if (!_bcAuthBootResolved) {
    console.warn("[BattleCruiser] getSession lento — mostrando login (fail-safe)");
    bcResolverBootSinSesion();
  }
}, 8000);

client.auth.onAuthStateChange(function (event, session) {
  // TOKEN_REFRESHED / INITIAL_SESSION con misma sesión: showApp es idempotente
  if (session) {
    if (event === "SIGNED_OUT") {
      showLogin();
      return;
    }
    showApp(session);
  } else if (event === "SIGNED_OUT" || _bcAuthBootResolved) {
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
