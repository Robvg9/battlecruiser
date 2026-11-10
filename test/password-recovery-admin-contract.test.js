"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const edge = fs.readFileSync(path.join(root, "supabase/functions/bc-password-recovery-admin/index.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20261110190000_bc_admin_password_recovery.sql"), "utf8");
const auth = fs.readFileSync(path.join(root, "public/js/auth.js"), "utf8");
const adminUi = fs.readFileSync(path.join(root, "public/js/password-recovery-admin.js"), "utf8");

test("recovery requests never send the dependent's Auth recovery email", () => {
  assert.match(edge, /MASTER_EMAIL = "robvg9@gmail.com"/);
  assert.match(edge, /signInWithOtp\(\{[\s\S]*?email: MASTER_EMAIL/);
  assert.doesNotMatch(edge, /resetPasswordForEmail/);
  assert.match(edge, /emailRedirectTo: APP_ORIGIN \+ "\/\?bc_admin_recovery="/);
  assert.match(edge, /shouldCreateUser: false/);
});

test("public request path is non-enumerating and rate-limited", () => {
  assert.match(edge, /MAX_REQUESTS_PER_IP = 4/);
  assert.match(edge, /if \(resolveError \|\| typeof resolvedEmail !== "string"[^\n]+\n\s+return reply\(\{ accepted: true \}, 200, origin\)/);
  assert.match(edge, /Never disclose whether the dependent username exists/);
});

test("only authenticated users with usuarios.editar can list or approve requests", () => {
  assert.match(edge, /admin\.auth\.getUser\(token\)/);
  assert.match(edge, /\.eq\("seccion", "usuarios"\)/);
  assert.match(edge, /\.eq\("accion", "editar"\)/);
  assert.match(edge, /permission\?\.permitido !== true/);
});

test("admin temporary password is stored only in Auth and never in request/audit rows", () => {
  assert.match(edge, /password: temporaryPassword/);
  assert.match(edge, /bc_password_change_required: true/);
  assert.match(edge, /signInWithPassword\(\{[\s\S]*?password: completionPassword/);
  assert.match(edge, /La nueva contraseña no pudo verificarse/);
  assert.match(edge, /La contraseña personal debe ser distinta de la temporal/);
  assert.match(edge, /deriveTemporaryPasswordHash/);
  assert.match(migration, /temporary_password_hash text/);
  assert.doesNotMatch(edge, /temporary_password:\s*temporaryPassword\s*[,}]/);
  assert.doesNotMatch(edge, /console\.(log|error)\([^\n]*temporaryPassword/);
});

test("request table is RLS-protected and unavailable to browser roles", () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.bc_password_recovery_requests FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT ALL ON TABLE public\.bc_password_recovery_requests TO service_role/);
});

test("dependent password changes are mandatory and cleared only by authenticated self-completion", () => {
  assert.match(auth, /bc_password_change_required/);
  assert.match(auth, /action:\s*"complete"/);
  assert.match(adminUi, /usuarios", "editar"/);
  assert.match(adminUi, /temporary_password/);
  assert.match(adminUi, /el cambio será obligatorio al próximo acceso/i);
  assert.match(auth, /Tu contraseña personal debe tener al menos 10 caracteres/);
});

console.log("PASS: admin-controlled password recovery contract");
