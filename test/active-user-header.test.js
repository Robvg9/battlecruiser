"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const index=fs.readFileSync("public/index.html","utf8");
const css=fs.readFileSync("public/style.css","utf8");
const auth=fs.readFileSync("public/js/auth.js","utf8");
const user=fs.readFileSync("public/js/usuarios-permisos.js","utf8");
const app=fs.readFileSync("public/app.js","utf8");
const sw=fs.readFileSync("public/service-worker.js","utf8");

test("the header displays one active identity beside the BattleCruiser title",()=>{
  assert.equal((index.match(/id="user-email"/g)||[]).length,1);
  assert.match(index,/<div class="header-left">[\s\S]*?<h1>Battlecruiser<\/h1>[\s\S]*?<span id="user-email" class="bc-active-user"/);
  assert.doesNotMatch(index,/<div class="header-right">[\s\S]*?<span id="user-email"/);
});

test("Owner/Admin displays Admin; dependiente profiles display their first name",()=>{
  const adminBranch=user.indexOf("if (esRolAdmin)");
  const nameBranch=user.indexOf("if (nombre && !esIdentidadInternaOTemporal(nombre))");
  assert.ok(adminBranch>=0 && nameBranch>adminBranch);
  assert.match(user,/el\.textContent = "Admin"/);
  assert.match(user,/nombre \+ " · Admin"/);
  assert.match(user,/el\.textContent = nombreCorto/);
});

test("the identity comes from the active authenticated profile and offline snapshot",()=>{
  assert.match(user,/client\.rpc\("perfil_usuario_actual"/);
  assert.match(user,/usuario: clonarUsuarioActual\(_usuarioActual\)/);
  assert.match(user,/nombre: u\.nombre/);
  assert.match(user,/rol: u\.rol/);
  assert.match(user,/mostrarInfoUsuarioEnHeader\(\)/);
  assert.match(auth,/if \(userEmailEl\) userEmailEl\.textContent = ""/);
  assert.match(auth,/_usuarioActualId = session\.user\.id/);
});

test("the active-user chip remains visible and compact in the Android header",()=>{
  assert.match(css,/\.header-left \.bc-active-user/);
  assert.match(css,/@media \(max-width: 759px\), \(hover: none\) and \(pointer: coarse\)/);
  assert.match(css,/\.header-left #user-email\s*\{[\s\S]*?max-width: 27vw/);
  const visibleRule = css.lastIndexOf("#app-shell.visible > header.app-header.app-header #user-email:not(:empty)");
  const hiddenRule = css.lastIndexOf("#user-email{display:none!important}");
  assert.ok(visibleRule>=0 && visibleRule>hiddenRule,"the final compact-header override must keep the nonempty identity visible");
  assert.match(css.slice(visibleRule),/display:inline-flex!important/);
});

test("PWA 9.5.170 serves the refreshed compact header and synchronized cache",()=>{
  assert.match(app,/const VERSION="9\.5\.170"/);
  assert.match(index,/style\.css\?v=9\.5\.170/);
  assert.match(index,/app\.js\?v=9\.5\.170/);
  assert.match(index,/usuarios-permisos\.js\?v=9\.5\.168/);
  assert.match(sw,/BC_SW_VERSION = "9\.5\.170"/);
  assert.match(sw,/usuarios-permisos\.js\?v=9\.5\.168/);
});
