"use strict";

const WORKER_VERSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractWorkerVersionId(output) {
  const text = String(output || "");
  const match = text.match(/Current Version ID:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
  if (!match || !WORKER_VERSION_ID_RE.test(match[1])) {
    throw new Error("Wrangler deploy output did not include a valid Current Version ID.");
  }
  return match[1].toLowerCase();
}

function buildWorkerVersionBaseUrl(productionBaseUrl, workerVersionId) {
  const id = String(workerVersionId || "").trim().toLowerCase();
  if (!WORKER_VERSION_ID_RE.test(id)) throw new Error("workerVersionId must be a full Cloudflare UUID.");
  const url = new URL(String(productionBaseUrl || ""));
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("productionBaseUrl must be an HTTPS Worker URL without credentials.");
  }
  const labels = url.hostname.split(".");
  if (labels.length < 3 || labels[0].includes("-")) {
    throw new Error("productionBaseUrl must be the unversioned <worker>.<subdomain>.workers.dev hostname.");
  }
  url.hostname = id.slice(0, 8) + "-" + url.hostname;
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.origin;
}

module.exports = { extractWorkerVersionId, buildWorkerVersionBaseUrl };
