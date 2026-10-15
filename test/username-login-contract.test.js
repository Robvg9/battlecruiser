"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const auth = fs.readFileSync(path.join(root, "public", "js", "auth.js"), "utf8").replace(/\r\n/g, "\n");
const edge = fs.readFileSync(path.join(root, "supabase", "functions", "bc-username-login", "index.ts"), "utf8");

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
  assert.ok(auth.includes('window.__BC_AUTH_DIAGNOSTIC__ = { code: code, storage: storage, cause: safeCause }'));
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
  assert.match(auth, /bcAuthDiagnostic\("GETSESSION_ERROR", true, bcAuthErrorKind\(error\)\)/);
  assert.match(auth, /cause: safeCause/);
  const diagnosticAndBoot = auth.slice(
    auth.indexOf("function bcAuthErrorKind(error)"),
    auth.indexOf("// Red de seguridad: si getSession cuelga")
  );
  assert.doesNotMatch(diagnosticAndBoot, /textContent\s*=\s*[^;]*error\.message/);
  assert.doesNotMatch(diagnosticAndBoot, /console\.(warn|log|error)\([^\n]*error\.message/);
});

test("getSession error classifier maps representative failures to fixed categories", () => {
  const match = auth.match(/(function bcAuthErrorKind\(error\) \{[\s\S]*?\n\})\nfunction bcAuthDiagnostic/);
  assert.ok(match, "classifier function must be extractable for unit checks");
  const classify = vm.runInNewContext("(" + match[1] + ")");
  assert.equal(classify({ name: "LockAcquireTimeoutError", message: "Lock acquisition timed out" }), "LOCK_TIMEOUT");
  assert.equal(classify({ name: "AuthApiError", message: "Invalid Refresh Token: Refresh Token Not Found" }), "REFRESH_TOKEN_ERROR");
  assert.equal(classify({ name: "StorageError", message: "localStorage write failed" }), "STORAGE_ERROR");
  assert.equal(classify({ name: "AuthRetryableFetchError", message: "Failed to fetch" }), "NETWORK_ERROR");
  assert.equal(classify({ name: "AuthSessionMissingError", message: "Auth session missing" }), "AUTH_ERROR");
  assert.equal(classify({ name: "UnexpectedError", message: "unclassified" }), "OTHER_ERROR");
});
