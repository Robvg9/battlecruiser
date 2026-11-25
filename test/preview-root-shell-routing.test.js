"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const PREVIEW_ORIGIN = "https://bc-pr-224-battlecruiser.robvg9.workers.dev";
const workerModule = import(pathToFileURL(path.join(ROOT, "preview-worker.mjs")).href);

test("preview root is served from the current index.html asset, not a separately cached root shell", async () => {
  const worker = (await workerModule).default;
  let assetRequest = null;
  const env = {
    ASSETS: {
      fetch: async (request) => {
        assetRequest = request;
        return new Response("<!doctype html><title>BattleCruiser 9.5.159</title>", {
          status: 200,
          headers: { "Content-Type": "text/html", "Cache-Control": "public, max-age=3600" }
        });
      }
    }
  };
  const response = await worker.fetch(
    new Request(PREVIEW_ORIGIN + "/", { headers: { Accept: "text/html" } }),
    env
  );

  assert.equal(new URL(assetRequest.url).pathname, "/index.html");
  assert.ok(new URL(assetRequest.url).searchParams.has("__bc_preview_asset"));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "<!doctype html><title>BattleCruiser 9.5.159</title>");
  assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
});

test("versioned core assets retain their requested cache key and receive a unique bypass key", async () => {
  const worker = (await workerModule).default;
  let assetRequest = null;
  const env = {
    ASSETS: {
      fetch: async (request) => {
        assetRequest = request;
        return new Response("const VERSION=\"9.5.159\";", { status: 200 });
      }
    }
  };
  const response = await worker.fetch(
    new Request(PREVIEW_ORIGIN + "/app.js?v=9.5.159", { headers: { Accept: "text/javascript" } }),
    env
  );
  const target = new URL(assetRequest.url);
  assert.equal(target.pathname, "/app.js");
  assert.equal(target.searchParams.get("v"), "9.5.159");
  assert.ok(target.searchParams.has("__bc_preview_asset"));
  assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
});

test("preview config invokes Worker first for root and every versioned core asset", () => {
  const config = fs.readFileSync(path.join(ROOT, "wrangler.preview.toml"), "utf8");
  const connectedConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "wrangler.jsonc"), "utf8"));
  const worker = fs.readFileSync(path.join(ROOT, "preview-worker.mjs"), "utf8");
  const verifier = fs.readFileSync(path.join(ROOT, "test/verify-pr-preview-assets.js"), "utf8");

  for (const route of ["/", "/index.html", "/app.js", "/service-worker.js", "/style.css", "/__bc_preview/*"]) {
    assert.ok(config.includes('"'+route+'"'), "missing Worker-first route " + route);
  }
  assert.deepEqual(connectedConfig.assets.run_worker_first, ["/", "/index.html", "/app.js", "/service-worker.js", "/style.css", "/__bc_preview/*"]);
  assert.match(worker, /PREVIEW_CORE_ASSETS/);
  assert.match(worker, /url\.pathname === "\/" \? "\/index\.html"/);
  assert.match(worker, /__bc_preview_asset/);
  assert.match(verifier, /sha256\(root\.body\) === sha256\(index\.body\)/);
});
