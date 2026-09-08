"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const appPath = path.join(__dirname, "..", "public", "app.js");
const appSource = fs.readFileSync(appPath, "utf8");
const match = appSource.match(/const VERSION="([^"]+)"/);
if (!match) {
  throw new Error("Could not determine expected application version from public/app.js.");
}
const expected = match[1];
const pattern = `const VERSION="${expected}"`;
const baseUrl = "https://battlecruiser.robvg9.workers.dev/app.js";

function request(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "Cache-Control": "no-cache" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error(`HTTP ${res.statusCode || "unknown"}`));
      });
    });
    req.setTimeout(30000, () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
  });
}

(async () => {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const url = `${baseUrl}?bc_verify=${Date.now()}-${attempt}`;
      const body = await request(url);
      if (body.includes(pattern)) {
        console.log(`[production-version] PASS — ${expected}`);
        return;
      }
      console.log(`[production-version] attempt ${attempt}: expected ${expected} not present`);
    } catch (error) {
      console.log(`[production-version] attempt ${attempt} failed: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  throw new Error(`Production is not serving expected version ${expected}.`);
})().catch((error) => {
  console.error("[production-version] FAIL", error);
  process.exitCode = 1;
});
