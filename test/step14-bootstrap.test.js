"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("public/bootstrap.html", "utf8");
const js = fs.readFileSync("public/js/bootstrap.js", "utf8");
const edge = fs.readFileSync("supabase/functions/bc-bootstrap-admin/index.ts", "utf8");
const index = fs.readFileSync("public/index.html", "utf8");

test("login exposes a dedicated first-owner bootstrap entry", () => {
  assert.match(index, /href="bootstrap\\.html"/);
  assert.match(html, /id="bc-bootstrap-form"/);
  assert.match(html, /id="bc-bootstrap-token"/);
  assert.match(html, /id="bc-bootstrap-password"/);
  assert.match(html, /id="bc-bootstrap-confirm"/);
});

test("bootstrap UI submits over HTTPS to the protected Edge Function", () => {
  assert.match(js, /\\/functions\\/v1\\/bc-bootstrap-admin/);
  assert.match(js, /x-bc-bootstrap-token/);
  assert.match(js, /crypto\\.randomUUID\\(\\)/);
  assert.match(js, /credentials: "omit"/);
  assert.match(js, /cache: "no-store"/);
  assert.match(js, /password\\.length < 12/);
  assert.doesNotMatch(js, /localStorage/);
  assert.doesNotMatch(js, /console\\.(log|warn|error)/);
});

test("Edge Function delegates one-time authorization and profile creation to the database", () => {
  assert.match(edge, /admin\\.rpc\\("bc_bootstrap_claim"/);
  assert.match(edge, /admin\\.auth\\.admin\\.createUser/);
  assert.match(edge, /bc_bootstrap_request_id/);
  assert.match(edge, /admin\\.rpc\\("bc_bootstrap_finalize"/);
  assert.match(edge, /No se pudo inicializar el administrador/);
  assert.doesNotMatch(edge, /BC_BOOTSTRAP_TOKEN/);
  assert.doesNotMatch(edge, /console\\.(log|warn|error)\\(/);
});
