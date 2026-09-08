"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const TEST_DIR = __dirname;
const TIMEOUT_MS = Number(process.env.BC_TEST_FILE_TIMEOUT_MS || 120000);

const files = fs.readdirSync(TEST_DIR)
  .filter((name) => name.endsWith(".test.js"))
  .sort((a, b) => a.localeCompare(b));

function runFile(file) {
  return new Promise((resolve) => {
    const absolute = path.join(TEST_DIR, file);
    const child = spawn(process.execPath, [
      "-r", path.join(TEST_DIR, "node-global-compat.js"),
      "--test",
      "--test-force-exit",
      "--test-timeout=120000",
      absolute,
    ], {
      cwd: path.join(TEST_DIR, ".."),
      stdio: "inherit",
      windowsHide: false,
      env: { ...process.env, NODE_OPTIONS: "" },
    });

    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      console.error(`\n[SUITE] TIMEOUT ${file} after ${TIMEOUT_MS} ms`);
      try { child.kill("SIGKILL"); } catch (_) {}
      finished = true;
      resolve(false);
    }, TIMEOUT_MS);

    child.on("error", (error) => {
      if (finished) return;
      clearTimeout(timer);
      finished = true;
      console.error(`[SUITE] ${file} process error:`, error);
      resolve(false);
    });

    child.on("exit", (code, signal) => {
      if (finished) return;
      clearTimeout(timer);
      finished = true;
      if (code === 0) {
        console.log(`[SUITE] PASS ${file}`);
        resolve(true);
      } else {
        console.error(`[SUITE] FAIL ${file} (code=${code}, signal=${signal || "none"})`);
        resolve(false);
      }
    });
  });
}

(async () => {
  console.log(`[SUITE] ${files.length} archivos; timeout por archivo=${TIMEOUT_MS} ms`);
  let failures = 0;

  for (const file of files) {
    console.log(`\n[SUITE] ===== ${file} =====`);
    const ok = await runFile(file);
    if (!ok) failures++;
  }

  console.log(`\n[SUITE] FINAL: ${files.length - failures}/${files.length} archivos PASS`);
  process.exitCode = failures ? 1 : 0;
})();
