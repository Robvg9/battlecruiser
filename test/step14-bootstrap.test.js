"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("public/bootstrap.html", "utf8");
const js = fs.readFileSync("public/js/bootstrap.js", "utf8");
const edge = fs.readFileSync("supabase/functions/bc-bootstrap-admin/index.ts", "utf8");
const index = fs.readFileSync("public/index.html", "utf8");

test("login exposes a dedicated first-owner bootstrap entry", () => {
  assert.ok(index.includes('href="bootstrap.html"'));
  for (const id of [
    "bc-bootstrap-form",
    "bc-bootstrap-token",
    "bc-bootstrap-password",
    "bc-bootstrap-confirm"
  ]) assert.ok(html.includes('id="' + id + '"'), "missing " + id);
});

test("bootstrap UI submits to the protected Edge Function without persisting credentials", () => {
  assert.ok(js.includes("/functions/v1/bc-bootstrap-admin"));
  assert.ok(js.includes("x-bc-bootstrap-token"));
  assert.ok(js.includes("crypto.randomUUID()"));
  assert.ok(js.includes('credentials: "omit"'));
  assert.ok(js.includes('cache: "no-store"'));
  assert.ok(js.includes("password.length < 12"));
  assert.ok(!js.includes("localStorage"));
  assert.ok(!js.includes("console.log"));
  assert.ok(!js.includes("console.warn"));
  assert.ok(!js.includes("console.error"));
});

test("Edge Function delegates one-time authorization and profile creation to the database", () => {
  assert.ok(edge.includes('admin.rpc("bc_bootstrap_claim"'));
  assert.ok(edge.includes("admin.auth.admin.createUser"));
  assert.ok(edge.includes("bc_bootstrap_request_id"));
  assert.ok(edge.includes('admin.rpc("bc_bootstrap_finalize"'));
  assert.ok(edge.includes("No se pudo inicializar el administrador"));
  assert.ok(!edge.includes("BC_BOOTSTRAP_TOKEN"));
  assert.ok(!edge.includes("console.log("));
  assert.ok(!edge.includes("console.warn("));
  assert.ok(!edge.includes("console.error("));
});
