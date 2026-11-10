"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const auth = fs.readFileSync(path.join(__dirname, "../public/js/auth.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const edge = fs.readFileSync(path.join(__dirname, "../supabase/functions/bc-password-recovery-admin/index.ts"), "utf8");

assert.match(auth, /PASSWORD_RECOVERY/, "recovery auth event must be handled");
assert.match(auth, /action: "request", identifier: identifier/, "recovery must request owner approval");
assert.match(auth, /bcPasswordRecoveryEndpoint\(\)/, "recovery must use the administrator recovery endpoint");
assert.match(auth, /Usuario o correo/, "the login and recovery field must clearly accept either identifier");
assert.match(auth, /password-recovery-request-btn/, "recovery request must be wired to a visible login button");
assert.ok(edge.includes('const MASTER_EMAIL = "robvg9@gmail.com"'), "recovery notices must go to the confirmed master mailbox");
assert.ok(edge.includes("signInWithOtp"), "admin notification must use a one-time owner sign-in link");
assert.ok(edge.includes('emailRedirectTo: APP_ORIGIN + "/?bc_admin_recovery="'), "the admin email must deep-link to the pending request");
assert.doesNotMatch(edge, /resetPasswordForEmail/, "the dependent must not receive a self-service reset link");
assert.match(auth, /bc_recovery/, "recovery URL marker must survive auth hash consumption");
assert.match(auth, /bcMostrarFormularioRecuperacion\(\)/, "legacy recovery links must remain compatible");
assert.match(auth, /bcMostrarFormularioCambioObligatorio\(\)/, "a reset dependent must be forced to choose a personal password");
assert.match(auth, /bcCompletarCambioObligatorio\(nueva\)/, "the server must verify the new password before clearing the mandatory-change flag");
assert.match(auth, /Crea tu contraseña personal/, "the forced-change form must identify its purpose");
assert.match(auth, /updateUser\(\{ password: nueva \}\)/, "password change must use Supabase Auth updateUser");
assert.match(auth, /Contraseña actualizada/, "successful reset must confirm completion");
assert.match(html, /id="password-recovery-request-btn"/, "login must show the recovery-email button");
assert.match(html, /usuario para solicitar recuperación a Administración/, "the login screen must explain that recovery goes through Administration");
assert.match(html, /id="password-recovery-msg"/, "login must display recovery request status");
assert.match(html, /id="pass-panel"/, "the password form must exist in the app shell");
assert.match(html, /id="pass-new"/, "new password field must exist");
assert.match(html, /id="pass-confirm"/, "confirmation field must exist");

console.log("PASS: dependent recovery is routed to owner approval and forces a personal password change");
