"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const auth = fs.readFileSync(path.join(__dirname, "../public/js/auth.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const edge = fs.readFileSync(path.join(__dirname, "../supabase/functions/bc-username-login/index.ts"), "utf8");

assert.match(auth, /PASSWORD_RECOVERY/, "recovery auth event must be handled");
assert.match(auth, /mode: "password-recovery", username: identifier/, "recovery must route email and usernames through the secure server-side resolver");
assert.match(auth, /Usuario o correo/, "the login and recovery field must clearly accept either identifier");
assert.match(auth, /password-recovery-request-btn/, "recovery request must be wired to a visible login button");
assert.ok(edge.includes('redirectTo: APP_ORIGIN + "/?bc_recovery=1"'), "server-side recovery email must redirect to the direct reset UI");
assert.match(auth, /bc_recovery/, "recovery URL marker must survive auth hash consumption");
assert.match(auth, /bcMostrarFormularioRecuperacion\(\)/, "recovery must open the password form automatically");
assert.match(auth, /Establecer nueva contraseña/, "recovery form must identify its purpose");
assert.match(auth, /updateUser\(\{ password: nueva \}\)/, "password change must use Supabase Auth updateUser");
assert.match(auth, /Contraseña actualizada/, "successful reset must confirm completion");
assert.match(html, /id="password-recovery-request-btn"/, "login must show the recovery-email button");
assert.match(html, /correo o nombre de usuario/, "the login screen must explain the supported recovery identifiers");
assert.match(html, /id="password-recovery-msg"/, "login must display recovery request status");
assert.match(html, /id="pass-panel"/, "the password form must exist in the app shell");
assert.match(html, /id="pass-new"/, "new password field must exist");
assert.match(html, /id="pass-confirm"/, "confirmation field must exist");

console.log("PASS: recovery link automatically exposes password reset form");
