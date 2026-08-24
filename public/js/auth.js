// ==== Battlecruiser · js/auth.js ====
// Autenticación, sesión, actualizar app, ajustes de cuenta, SW, atajos.
// v9.2.61 — M12-FE.6: no pintar email Auth (internal) como identidad.

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

function showApp(session) {
  // Nueva sesión: no conservar pestaña/panel del usuario anterior
  if (typeof resetearNavegacionParaNuevaSesion === "function") {
    resetearNavegacionParaNuevaSesion();
  } else {
    document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
    document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("visible"); });
  }
  loginForm.classList.add("hidden");
  lanternWrap.classList.add("hidden");
  appShell.classList.add("visible");
  // M12-FE.6: nunca mostrar session.user.email aquí (puede ser @internal.battlecruiser.local)
  if (userEmailEl) userEmailEl.textContent = "Cargando usuario…";
  _usuarioActualId = session.user.id;
  if (typeof cargarContextoUsuario === "function") cargarContextoUsuario();
}

function showLogin() {
  if (typeof resetearNavegacionParaNuevaSesion === "function") {
    resetearNavegacionParaNuevaSesion();
  } else {
    document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
    document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("visible"); });
  }
  loginForm.classList.remove("hidden");
  lanternWrap.classList.remove("hidden");
  appShell.classList.remove("visible");
  _usuarioActualId = null;
  if (userEmailEl) userEmailEl.textContent = "";
  if (typeof limpiarContextoUsuario === "function") limpiarContextoUsuario();
  const usuarioInput = document.getElementById("email");
  if (usuarioInput) usuarioInput.focus();
}

showLogin();

client.auth.getSession().then(({ data }) => {
  if (data.session) showApp(data.session);
});

client.auth.onAuthStateChange((_event, session) => {
  if (session) showApp(session);
  else showLogin();
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

      const { data: emailLogin, error: errorUsuario } = await client.rpc(
        "obtener_email_login_por_nombre",
        { p_nombre: nombreUsuario }
      );

      if (errorUsuario || !emailLogin) {
        loginError.textContent = "Usuario o contraseña incorrectos.";
        if (errorUsuario) console.error("[Battlecruiser] (resolver usuario)", errorUsuario);
        return;
      }

      const { error } = await client.auth.signInWithPassword({
        email: emailLogin,
        password,
      });

      if (error) {
        const msg = (error.message || "").toLowerCase();
        loginError.textContent = (!navigator.onLine || msg.includes("failed to fetch") || msg.includes("timeout"))
          ? "Sin conexión o la red está lenta ahora mismo. Intenta de nuevo en un momento."
          : "Usuario o contraseña incorrectos.";
        console.error("[Battlecruiser] (login)", error);
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
        console.error("[Battlecruiser] (nuevo-usuario)", error);
        return;
      }

      const nuevoId = data && data.user && data.user.id;
      if (!nuevoId) {
        msgEl.textContent = "El usuario se creó en autenticación, pero no se recibió su id. Contactá soporte técnico antes de reintentar.";
        console.error("[Battlecruiser] (nuevo-usuario) signUp sin data.user.id", data);
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
      console.error("[Battlecruiser] (nuevo-usuario) excepción inesperada", e);
    } finally {
      hideLoading();
    }
  });
});

async function actualizarApp(btn) {
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Actualizando...";
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("battlecruiser-shell-")).map((k) => caches.delete(k))
      );
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) {}
  location.reload();
}

safeInit("actualizar-app-login", () => {
  const btn = document.getElementById("update-app-btn-login");
  btn.addEventListener("click", () => actualizarApp(btn));
});

safeInit("actualizar-app", () => {
  const updateAppBtn = document.getElementById("update-app-btn");
  updateAppBtn.addEventListener("click", () => actualizarApp(updateAppBtn));
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
