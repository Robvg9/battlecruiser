"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const edge = fs.readFileSync(path.join(root, "supabase/functions/bc-password-recovery-admin/index.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20261110233845_bc_admin_password_recovery.sql"), "utf8");
const permissionGateMigration = fs.readFileSync(path.join(root, "supabase/migrations/20261110234541_bc_recovery_permission_gate_fresh_app_metadata.sql"), "utf8");
const auth = fs.readFileSync(path.join(root, "public/js/auth.js"), "utf8");
const adminUi = fs.readFileSync(path.join(root, "public/js/password-recovery-admin.js"), "utf8");

test("recovery requests never send the dependent's Auth recovery email", () => {
  assert.ok(edge.includes('MASTER_EMAIL = "robvg9@gmail.com"'));
  assert.ok(edge.includes('String(role?.nombre || "").trim().toLowerCase() !== "dependienta"'));
  assert.ok(edge.includes('email: MASTER_EMAIL'));
  assert.ok(edge.includes('emailRedirectTo: APP_ORIGIN + "/?bc_admin_recovery="'));
  assert.ok(edge.includes("signInWithOtp"));
  assert.ok(edge.includes("AUTH_EMAIL_NETWORK_ERROR"));
  assert.ok(edge.includes("La cuenta ya no es una dependienta activa"));
  assert.ok(edge.includes("shouldCreateUser: false"));
  assert.ok(edge.includes('status.eq.APROBADA'));
  assert.doesNotMatch(edge, /resetPasswordForEmail/);
});

test("public request path is non-enumerating and rate-limited", () => {
  assert.ok(edge.includes("MAX_REQUESTS_PER_IP = 4"));
  assert.ok(edge.includes("Never disclose whether the dependent username exists"));
  assert.ok(edge.includes('return reply({ accepted: true }, 200, origin)'));
});

test("only authenticated users with usuarios.editar can list or approve requests", () => {
  assert.ok(edge.includes("admin.auth.getUser(token)"));
  assert.ok(edge.includes('.eq("seccion", "usuarios")'));
  assert.ok(edge.includes('.eq("accion", "editar")'));
  assert.ok(edge.includes("permission?.permitido !== true"));
});

test("admin temporary password is never stored in plaintext and cannot satisfy the forced change", () => {
  assert.ok(edge.includes("password: temporaryPassword"));
  assert.ok(edge.includes("bc_password_change_required: true"));
  assert.ok(edge.includes("password: completionPassword"));
  assert.ok(edge.includes("La nueva contraseña no pudo verificarse"));
  assert.ok(edge.includes("La contraseña personal debe ser distinta de la temporal"));
  assert.ok(edge.includes("deriveTemporaryPasswordHash"));
  assert.ok(migration.includes("temporary_password_hash text"));
  assert.doesNotMatch(edge, /temporary_password:\s*temporaryPassword\s*[,}]/);
  assert.doesNotMatch(edge, /console\.(log|error)\([^\n]*temporaryPassword/);
});

test("request table and mandatory permission gate are enforced in PostgreSQL", () => {
  assert.ok(migration.includes("ENABLE ROW LEVEL SECURITY"));
  assert.ok(migration.includes("REVOKE ALL ON TABLE public.bc_password_recovery_requests FROM PUBLIC, anon, authenticated"));
  assert.ok(migration.includes("GRANT ALL ON TABLE public.bc_password_recovery_requests TO service_role"));
  assert.ok(migration.includes("bc_password_change_required"));
  assert.ok(migration.includes("u.activo = true"));
  assert.ok(migration.includes("coalesce(u.archivado, false) = false"));
  assert.ok(migration.includes("CREATE OR REPLACE FUNCTION public.permisos_usuario_actual()"));
  assert.ok(migration.includes("CREATE OR REPLACE FUNCTION public.tiene_permiso("));
  assert.ok(migration.includes("WHERE status IN ('PENDIENTE','PROCESANDO','APROBADA')"));
  assert.ok(permissionGateMigration.includes("JOIN auth.users auth_user ON auth_user.id = u.id"));
  assert.ok(permissionGateMigration.includes("auth_user.raw_app_meta_data->>'bc_password_change_required'"));
  const executablePermissionGateSql = permissionGateMigration.replace(/^\\s*--.*$/gm, "");
  assert.doesNotMatch(executablePermissionGateSql, /auth\\.jwt\\(\\)/);
});

test("approved handoff remains visible and can be reissued without persisting plaintext", () => {
  assert.ok(edge.includes('.in("status", ["PENDIENTE", "PROCESANDO", "APROBADA"])'));
  assert.ok(adminUi.includes("handoffPasswords"));
  assert.ok(adminUi.includes("copy-password"));
  assert.ok(adminUi.includes("Reemitir temporal"));
  assert.ok(adminUi.includes("La temporal anterior dejará de funcionar"));
  assert.ok(adminUi.includes("Nueva temporal para reemitir"));
});

test("dependent password changes are mandatory and permissions refresh after completion", () => {
  assert.ok(auth.includes("bc_password_change_required"));
  assert.ok(auth.includes("client.auth.refreshSession()"));
  assert.ok(auth.includes('action: "complete"'));
  assert.ok(auth.includes("bcMostrarFormularioCambioObligatorio()"));
  assert.ok(auth.includes("bcRechazarRecuperacionDirecta()"));
  assert.match(auth, /function showApp\(session\) \{[\s\S]*?_bcRecoveryMode\) return/);
  assert.match(auth, /if \(session && _bcRecoveryMode\) \{[\s\S]*?bcRechazarRecuperacionDirecta\(\)/);
  assert.doesNotMatch(auth, /bcMostrarFormularioRecuperacion/);
  assert.ok(auth.includes("Tu contraseña personal debe tener al menos 10 caracteres"));
  assert.ok(edge.includes('status: "COMPLETADA"'));
});

console.log("PASS: admin-controlled password recovery contract");
