"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const auth = fs.readFileSync(path.join(root, "public", "js", "auth.js"), "utf8").replace(/\r\n/g, "\n");
const context = fs.readFileSync(path.join(root, "public", "js", "usuarios-permisos.js"), "utf8").replace(/\r\n/g, "\n");
const edge = fs.readFileSync(path.join(root, "supabase", "functions", "bc-username-login", "index.ts"), "utf8");
const identifierMigration = fs.readFileSync(path.join(root, "supabase", "migrations", "20261018005015_bc_login_identifier_recovery.sql"), "utf8");

test("frontend routes username login through the server-side credential bridge", () => {
  assert.match(auth, /\/functions\/v1\/bc-username-login/);
  assert.match(auth, /client\.auth\.setSession\(/);
  assert.doesNotMatch(auth, /obtener_email_login_por_nombre/);
  assert.doesNotMatch(auth, /client\.auth\.signInWithPassword\(\s*\{\s*email:\s*emailLogin/);
});

test("username login bridge keeps internal email resolution server-side", () => {
  assert.match(edge, /admin\.rpc\("obtener_email_login_por_nombre"/);
  assert.match(edge, /genericFailure\(401\)/);
  assert.match(edge, /MAX_ATTEMPTS_PER_IP/);
  assert.match(edge, /Cache-Control.*no-store/);
  assert.doesNotMatch(edge, /console\.(log|error)\(.*password/i);
  assert.doesNotMatch(edge, /reply\(\{\s*email\s*:/i);
});

test("a discovered session is not replaced by the auth boot fail-safe while UI modules prepare", () => {
  assert.ok(auth.includes("let _bcAuthSessionDiscovered = false;"));
  assert.ok(auth.includes("function bcResolverBootConSesion(session) {\n  if (session && session.user) _bcAuthSessionDiscovered = true;"));
  assert.ok(auth.includes("function showApp(session) {\n  if (!session || !session.user) return;\n  _bcAuthSessionDiscovered = true;"));
  assert.ok(auth.includes("if (!_bcAuthBootResolved && !_bcAuthSessionDiscovered && !_bcPendingSession)"));
  assert.ok(auth.includes("no se fuerza login porque ya se detectó una sesión"));
});

test("session restoration reports only a safe diagnostic code and storage-key presence", () => {
  assert.ok(auth.includes('function bcAuthStoragePresence()'));
  assert.ok(auth.includes('sb-papxnkkjtkxsitcsvcme-auth-token'));
  assert.ok(auth.includes('bc-auth-diagnostic'));
  assert.ok(auth.includes('GETSESSION_EMPTY'));
  assert.ok(auth.includes('GETSESSION_ERROR'));
  assert.ok(auth.includes('BOOT_TIMEOUT'));
  assert.ok(auth.includes('AUTH_SIGNED_OUT_EVENT'));
  assert.ok(auth.includes('window.__BC_AUTH_DIAGNOSTIC__ = { code: code, storage: storage, cause: safeCause, shape: safeShape, fingerprint: safeFingerprint, trace: safeTrace }'));
  assert.ok(auth.includes("function bcAuthErrorShape(error)"));
  assert.ok(auth.includes("function bcScheduleGetSessionRetry()"));
  assert.ok(auth.includes("_bcAuthGetSessionRetryAttempts >= 2"));
  assert.ok(auth.includes("bcAuthDiagnostic(\"GETSESSION_ERROR\", true, kind, shape, fingerprint, trace)"));
  assert.ok(auth.includes("function bcHandleGetSessionError(error)"));
  assert.ok(auth.includes('if (storage !== "PRESENT")'));
  assert.ok(auth.includes("bounded retry scheduled"));
  assert.ok(auth.includes('_bcAuthLastGetSessionErrorKind || "NONE"'));
  assert.doesNotMatch(auth, /textContent\s*=\s*[^;]*(?:access_token|refresh_token)/);
});


test("getSession diagnostic exposes only an allowlisted error category", () => {
  assert.ok(auth.includes("function bcAuthErrorKind(error)"));
  for (const kind of [
    "LOCK_TIMEOUT",
    "REFRESH_TOKEN_ERROR",
    "STORAGE_ERROR",
    "NETWORK_ERROR",
    "AUTH_ERROR",
    "OTHER_ERROR"
  ]) assert.ok(auth.includes('return "' + kind + '"'));
  assert.match(auth, /bcAuthDiagnostic\("GETSESSION_ERROR", true, kind, shape, fingerprint, trace\)/);
  assert.match(auth, /cause: safeCause/);
  const diagnosticAndBoot = auth.slice(
    auth.indexOf("function bcAuthErrorKind(error)"),
    auth.indexOf("// Red de seguridad: si getSession cuelga")
  );
  assert.doesNotMatch(diagnosticAndBoot, /textContent\s*=\s*[^;]*error\.message/);
  assert.doesNotMatch(diagnosticAndBoot, /console\.(warn|log|error)\([^\n]*error\.message/);
});

test("getSession error classifier maps representative failures to fixed categories", () => {
  const match = auth.match(/(function bcAuthErrorKind\(error\) \{[\s\S]*?\n\})\nfunction bcAuthErrorShape/);
  assert.ok(match, "classifier function must be extractable for unit checks");
  const classify = vm.runInNewContext("(" + match[1] + ")");
  assert.equal(classify({ name: "LockAcquireTimeoutError", message: "Lock acquisition timed out" }), "LOCK_TIMEOUT");
  assert.equal(classify({ name: "AuthApiError", message: "Invalid Refresh Token: Refresh Token Not Found" }), "REFRESH_TOKEN_ERROR");
  assert.equal(classify({ name: "StorageError", message: "localStorage write failed" }), "STORAGE_ERROR");
  assert.equal(classify({ name: "AuthRetryableFetchError", message: "Failed to fetch" }), "NETWORK_ERROR");
  assert.equal(classify({ name: "AuthSessionMissingError", message: "Auth session missing" }), "AUTH_ERROR");
  assert.equal(classify({ name: "UnexpectedError", message: "unclassified" }), "OTHER_ERROR");
  assert.equal(classify({
    name: "AuthUnknownError",
    message: "Unexpected error during initialization",
    originalError: { name: "TypeError", message: "Failed to fetch" }
  }), "NETWORK_ERROR");
  assert.equal(classify({
    name: "AuthUnknownError",
    message: "Unexpected error during initialization",
    originalError: { name: "AuthApiError", message: "Invalid Refresh Token: Refresh Token Not Found" }
  }), "REFRESH_TOKEN_ERROR");
  assert.equal(classify({
    name: "AuthUnknownError",
    originalError: { cause: { name: "DOMException", message: "localStorage JSON parse failed" } }
  }), "STORAGE_ERROR");
});

test("session diagnostic fingerprints only safe nested error types", () => {
  const match = auth.match(/(function bcAuthErrorShape\(error\) \{[\s\S]*?\n\})\n\s*function bcAuthErrorFingerprint/);
  assert.ok(match, "shape function must be extractable for unit checks");
  const shape = vm.runInNewContext("(" + match[1] + ")");
  const result = shape({
    name: "AuthUnknownError",
    message: "DO_NOT_EXPOSE_THIS_MESSAGE",
    originalError: { name: "TypeError", message: "network details should not leak" }
  });
  assert.equal(result, "AuthUnknownError>TypeError");
  assert.doesNotMatch(result, /DO_NOT_EXPOSE|network details/);
  assert.ok(shape(null) === "NO_ERROR_OBJECT");
});


test("RangeError fingerprint uses allowlisted signatures without exposing raw messages", () => {
  const match = auth.match(/(function bcAuthErrorFingerprint\(error\) \{[\s\S]*?\n\})\nfunction bcAuthSafeStack/);
  assert.ok(match, "fingerprint function must be extractable for unit checks");
  const fingerprint = vm.runInNewContext("(" + match[1] + ")");
  assert.equal(fingerprint({ name: "RangeError", message: "Maximum call stack size exceeded" }), "STACK_OVERFLOW");
  assert.equal(fingerprint({ name: "RangeError", message: "Invalid array length" }), "INVALID_ARRAY_LENGTH");
  assert.equal(fingerprint({ name: "AuthUnknownError", originalError: { name: "RangeError", message: "Maximum call stack size exceeded" } }), "STACK_OVERFLOW");
  const unknown = fingerprint({ name: "RangeError", message: "DO_NOT_EXPOSE_THIS_MESSAGE" });
  assert.equal(unknown, "RANGE_ERROR_UNCLASSIFIED");
  assert.doesNotMatch(unknown, /DO_NOT_EXPOSE/);
});

test("safe auth stack exposes only function names, script basenames and line numbers", () => {
  const match = auth.match(/(function bcAuthSafeStack\(error\) \{[\s\S]*?\n\})\nfunction bcHandleGetSessionError/);
  assert.ok(match, "safe stack function must be extractable for unit checks");
  const safeStack = vm.runInNewContext("(" + match[1] + ")");
  const result = safeStack({
    stack: [
      "RangeError: DO_NOT_EXPOSE_THIS_MESSAGE",
      "    at getSession (https://battlecruiser.robvg9.workers.dev/js/auth.js?v=9.4.88:321:11)",
      "    at Object.process (https://cdn.example/supabase.js?secret=DO_NOT_EXPOSE_THIS:98:2)"
    ].join("\n")
  });
  assert.equal(result, "getSession@auth.js:321>Object.process@supabase.js:98");
  assert.doesNotMatch(result, /https|secret|DO_NOT_EXPOSE/);
  assert.equal(safeStack({ stack: "no parseable frame" }), "NO_SAFE_FRAMES");
});


test("auth state callbacks defer context loading and forward their session", () => {
  const match = auth.match(/(function bcIntentarCargarContexto\(session\) \{[\s\S]*?\n\})/);
  assert.ok(match, "context helper must be extractable for checks");
  assert.match(match[1], /window\.setTimeout\(function/);
  assert.match(match[1], /cargarContextoUsuario\(readySession \|\| null\)/);
  assert.doesNotMatch(match[1], /cargarContextoUsuario\(\);/);
  assert.match(auth, /bcIntentarCargarContexto\(session\)/);
});

test("context loader reuses the session supplied by auth before calling getSession", () => {
  const match = context.match(/(async function cargarContextoUsuario\(sessionInicial\) \{[\s\S]*?\n\})\ncargarContextoUsuario\.__bcM263Timeout/);
  assert.ok(match, "context loader must be extractable for checks");
  const source = match[1];
  assert.match(source, /if \(sessionInicial && sessionInicial\.user\)/);
  assert.match(source, /authUser = sessionInicial\.user/);
  assert.ok(source.indexOf("authUser = sessionInicial.user") < source.indexOf("client.auth.getSession()"));
  assert.match(source, /client\.rpc\("perfil_usuario_actual", \{\}\)/);
  assert.match(source, /client\.rpc\("permisos_usuario_actual", \{\}\)/);
});


test("UI-ready bootstrap waits asynchronously when auth loads before app.js", () => {
  const match = auth.match(/(var _bcAuthUIReadyFallback = false;\nfunction bcUIReadyThen\(fn\) \{[\s\S]*?\n\})\n\s*function showApp/);
  assert.ok(match, "UI-ready gate must be extractable");
  const source = match[1];
  const queued = [];
  const runtime = {
    window: {
      __BC_UI_READY_RESOLVED__: false,
      setTimeout(fn) { queued.push(fn); return queued.length; }
    },
    Date: { now: () => 0 },
    console: { warn() {} },
    callbackCount: 0
  };
  vm.runInNewContext(source + "\nbcUIReadyThen(function () { callbackCount++; });", runtime);
  assert.equal(runtime.callbackCount, 0, "callback must not run synchronously while the UI flag is absent/false");
  assert.equal(queued.length, 1, "the missing UI-ready flag must schedule an asynchronous check");
  runtime.window.__BC_UI_READY_RESOLVED__ = true;
  queued.shift()();
  assert.equal(runtime.callbackCount, 1, "callback runs once after UI-ready resolves");
});

test("UI-ready gate has a real timeout escape from the bootstrap loop", () => {
  const match = auth.match(/(var _bcAuthUIReadyFallback = false;\nfunction bcUIReadyThen\(fn\) \{[\s\S]*?\n\})\n\s*function showApp/);
  assert.ok(match, "UI-ready gate must be extractable");
  const queued = [];
  const runtime = {
    clock: 0,
    window: {
      __BC_UI_READY_RESOLVED__: false,
      setTimeout(fn) { queued.push(fn); return queued.length; }
    },
    Date: { now: () => runtime.clock },
    console: { warn() {} },
    callbackCount: 0
  };
  vm.runInNewContext(match[1] + "\nbcUIReadyThen(function () { callbackCount++; });", runtime);
  assert.equal(runtime.callbackCount, 0);
  runtime.clock = 12000;
  queued.shift()();
  assert.equal(runtime._bcAuthUIReadyFallback, true);
  assert.equal(runtime.callbackCount, 1);
  assert.ok(auth.includes("if (!window.__BC_UI_READY_RESOLVED__ && !_bcAuthUIReadyFallback)"));
});


test("login bridge resolves either email or username through the server-side active-user resolver", () => {
  assert.ok(edge.includes('admin.rpc("obtener_email_login_por_nombre", { p_nombre: username })'));
  assert.ok(edge.includes('email: email || "bc-rwht-nonexistent-user@internal.battlecruiser.local"'));
  assert.ok(!edge.includes("reply({ email"));
});

test("identifier resolver accepts either email or username and preserves active-user privilege gates", () => {
  assert.ok(identifierMigration.includes("lower(trim(au.email)) = lower(trim(p_nombre))"));
  assert.ok(identifierMigration.includes("lower(trim(u.nombre)) = lower(trim(p_nombre))"));
  assert.ok(identifierMigration.includes("u.activo = true"));
  assert.ok(identifierMigration.includes("REVOKE ALL ON FUNCTION public.obtener_email_login_por_nombre(text) FROM PUBLIC, anon, authenticated"));
  assert.ok(identifierMigration.includes("GRANT EXECUTE ON FUNCTION public.obtener_email_login_por_nombre(text) TO service_role"));
});

test("username recovery uses the server-side resolver, direct recovery redirect, and a generic response", () => {
  assert.ok(edge.includes('body.mode === "password-recovery"'));
  assert.ok(edge.includes('auth.auth.resetPasswordForEmail(recoveryEmail, {'));
  assert.ok(edge.includes('redirectTo: APP_ORIGIN + "/?bc_recovery=1"'));
  assert.ok(edge.includes("return reply({ accepted: true }, 200)"));
  assert.ok(!edge.includes("reply({ email"));
});

test("login bridge handles preflight before enforcing the production origin and never opens POST to other origins", () => {
  const normalizeMatch = edge.match(/function normalizeOrigin\(value: string \| null\): string \| null \{[\s\S]*?\n\}/);
  assert.ok(normalizeMatch, "origin normalization must be available for the preflight contract");
  const normalize = vm.runInNewContext("(" + normalizeMatch[0].replace("function normalizeOrigin(value: string | null): string | null", "function") + ")");
  assert.equal(normalize("https://battlecruiser.robvg9.workers.dev"), "https://battlecruiser.robvg9.workers.dev");
  assert.equal(normalize("https://battlecruiser.robvg9.workers.dev/"), "https://battlecruiser.robvg9.workers.dev");
  assert.equal(normalize("https://evil.example/"), "https://evil.example");
  assert.equal(normalize(null), null);
  const preflight = edge.indexOf('if (req.method === "OPTIONS")');
  const strictPostOriginGate = edge.indexOf('if (origin !== APP_ORIGIN) return reply({ error: "Origen no permitido." }, 403);', preflight);
  assert.ok(preflight > -1 && strictPostOriginGate > preflight,
    "preflight handling must precede the mandatory origin check for actual requests");
  assert.match(edge, /if \(origin && origin !== APP_ORIGIN\) return reply\(\{ error: "Origen no permitido\." \}, 403\)/);
  assert.match(edge, /if \(origin !== APP_ORIGIN\) return reply\(\{ error: "Origen no permitido\." \}, 403\);/,
    "all actual POST requests still require the exact production origin");
});
