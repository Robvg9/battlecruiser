"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const auth = fs.readFileSync(path.join(root, "public", "js", "auth.js"), "utf8");
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
  assert.match(auth, /let _bcAuthSessionDiscovered = false;/);
  assert.match(auth, /function bcResolverBootConSesion\\(session\\) \\{\\s*if \\(session && session\\.user\\) _bcAuthSessionDiscovered = true;/);
  assert.match(auth, /function showApp\\(session\\) \\{\\s*if \\(!session \\|\\| !session\\.user\\) return;\\s*_bcAuthSessionDiscovered = true;/);
  assert.match(auth, /if \\(!_bcAuthBootResolved && !_bcAuthSessionDiscovered && !_bcPendingSession\\)/);
  assert.match(auth, /no se fuerza login porque ya se detectó una sesión/);
});
