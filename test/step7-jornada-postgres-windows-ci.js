"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { createWriteStream } = require("node:fs");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const ROOT = process.cwd();
const RESULT_DIR = path.join(ROOT, "test-results");
const CI_LOG = path.join(RESULT_DIR, "step7-postgres-ci.log");
const PG_SERVER_LOG = path.join(RESULT_DIR, "step7-postgres-server.log");
const PG_VERSION = "17.11-4";
const PG_URL = "https://get.enterprisedb.com/postgresql/postgresql-17.11-4-windows-x64-binaries.zip";
const PG_SHA256 = "b9424ee7bc60b52450ff910a3630225df32e633f3cb29c1d126d9299d59aea28";
const PG_PORT = "55439";
const TEMP_ROOT = process.env.BC_STEP7_POSTGRES_ROOT || "D:\\Databank\\BattleCruiser-CI\\Postgres17";
const ZIP_PATH = path.join(TEMP_ROOT, "postgresql-" + PG_VERSION + "-windows-x64-binaries.zip");
const RUNTIME_DIR = path.join(TEMP_ROOT, "runtime-" + PG_VERSION);
const DATA_DIR = path.join(TEMP_ROOT, "data-" + process.env.GITHUB_RUN_ID || "local");
const env = { ...process.env, PGHOST: "127.0.0.1", PGPORT: PG_PORT, PGUSER: "postgres", PGDATABASE: "battlecruiser_step7_test", PGSSLMODE: "disable" };
let pgBinDir = null;
let pgCtl = null;
let serverStarted = false;
let logStream = null;

function log(message) {
  const line = String(message);
  console.log(line);
  if (logStream) logStream.write(line + "\r\n");
}

function run(executable, args, options = {}) {
  log("\r\n[cmd] " + executable + " " + args.join(" "));
  const result = spawnSync(executable, args, {
    cwd: options.cwd || ROOT,
    env: options.env || env,
    encoding: "utf8",
    windowsHide: true,
    timeout: options.timeout || 10 * 60 * 1000,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.stdout) log(result.stdout.trimEnd());
  if (result.stderr) log(result.stderr.trimEnd());
  if (result.error) throw new Error("Failed to start " + executable + ": " + result.error.message);
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(executable + " exited with code " + result.status);
  }
  return result;
}

async function sha256File(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const input = fs.createReadStream(filePath);
    input.on("error", reject);
    input.on("data", chunk => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

async function downloadVerifiedArchive() {
  if (fs.existsSync(ZIP_PATH)) {
    const cachedHash = await sha256File(ZIP_PATH);
    if (cachedHash.toLowerCase() === PG_SHA256) {
      log("[postgres] Reusing cached, checksum-verified EDB PostgreSQL " + PG_VERSION + " ZIP.");
      return;
    }
    log("[postgres] Cached ZIP checksum mismatch; deleting it before download.");
    fs.rmSync(ZIP_PATH, { force: true });
  }

  log("[postgres] Downloading official EDB PostgreSQL " + PG_VERSION + " Windows x64 binaries ZIP.");
  const response = await fetch(PG_URL, {
    redirect: "follow",
    headers: { "user-agent": "BattleCruiser-Step7-CI/1.0" },
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  if (!response.ok || !response.body) throw new Error("EDB download failed: HTTP " + response.status);
  const partial = ZIP_PATH + ".part";
  fs.rmSync(partial, { force: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  const actualHash = await sha256File(partial);
  if (actualHash.toLowerCase() !== PG_SHA256) {
    fs.rmSync(partial, { force: true });
    throw new Error("EDB PostgreSQL ZIP SHA-256 mismatch; refusing to extract or execute it. Expected " + PG_SHA256 + ", got " + actualHash);
  }
  fs.renameSync(partial, ZIP_PATH);
  log("[postgres] Download checksum PASS: " + actualHash);
}

function findFile(root, name, maxDepth = 5) {
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    let entries;
    try { entries = fs.readdirSync(current.dir, { withFileTypes: true }); } catch (_) { continue; }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) {
        return path.join(current.dir, entry.name);
      }
      if (entry.isDirectory() && current.depth < maxDepth &&
          entry.name !== "doc" && entry.name !== "include" && entry.name !== "symbols") {
        queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
      }
    }
  }
  return null;
}

function ensureRuntime() {
  const existing = findFile(RUNTIME_DIR, "initdb.exe");
  const existingCtl = findFile(RUNTIME_DIR, "pg_ctl.exe");
  const existingPsql = findFile(RUNTIME_DIR, "psql.exe");
  if (existing && existingCtl && existingPsql) {
    pgBinDir = path.dirname(existing);
    log("[postgres] Reusing cached PostgreSQL binaries at " + pgBinDir);
    return;
  }

  fs.rmSync(RUNTIME_DIR, { recursive: true, force: true });
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  run("tar.exe", ["-xf", ZIP_PATH, "-C", RUNTIME_DIR], { timeout: 12 * 60 * 1000 });
  const initdb = findFile(RUNTIME_DIR, "initdb.exe");
  const ctl = findFile(RUNTIME_DIR, "pg_ctl.exe");
  const psql = findFile(RUNTIME_DIR, "psql.exe");
  const postgres = findFile(RUNTIME_DIR, "postgres.exe");
  const createdb = findFile(RUNTIME_DIR, "createdb.exe");
  if (!initdb || !ctl || !psql || !postgres || !createdb) {
    throw new Error("The verified EDB archive did not contain all PostgreSQL 17 executables.");
  }
  pgBinDir = path.dirname(initdb);
  log("[postgres] PostgreSQL " + PG_VERSION + " binaries extracted and found at " + pgBinDir);
}

function pgExe(name) {
  const found = findFile(RUNTIME_DIR, name);
  if (!found) throw new Error("Missing PostgreSQL executable " + name);
  return found;
}

function pgEnv(extra = {}) {
  return { ...env, PATH: pgBinDir + path.delimiter + process.env.PATH, ...extra };
}

function applySql(file) {
  run(pgExe("psql.exe"), ["-X", "-v", "ON_ERROR_STOP=1", "-f", file], {
    env: pgEnv(),
    timeout: 3 * 60 * 1000,
  });
}

(async () => {
  fs.mkdirSync(RESULT_DIR, { recursive: true });
  logStream = fs.createWriteStream(CI_LOG, { flags: "w" });
  let failure = null;
  try {
    log("=== Step 7 PostgreSQL 17 disposable contract — Windows self-hosted ===");
    log("Repository checkout: " + ROOT);
    log("PostgreSQL runtime/cache: " + TEMP_ROOT);
    log("C-drive workaround: PostgreSQL archive/runtime/data are stored on D: when available.");
    try {
      fs.mkdirSync(TEMP_ROOT, { recursive: true });
      const probe = path.join(TEMP_ROOT, ".write-test-" + process.pid);
      fs.writeFileSync(probe, "ok");
      fs.rmSync(probe, { force: true });
    } catch (error) {
      throw new Error("Cannot write to " + TEMP_ROOT + ". Allow the GitHub Actions runner service to modify D:\\Databank\\BattleCruiser-CI\\Postgres17; refusing to fill the nearly-full C: drive. Cause: " + error.message);
    }

    await downloadVerifiedArchive();
    ensureRuntime();

    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.rmSync(PG_SERVER_LOG, { force: true });
    const binEnv = pgEnv();
    const pgPrefix = path.dirname(pgBinDir);
    run(pgExe("initdb.exe"), [
      "-D", DATA_DIR,
      "-U", "postgres",
      "--encoding=UTF8",
      "--locale=C",
      "--auth-local=trust",
      "--auth-host=trust",
    ], { env: { ...binEnv, PATH: pgBinDir + path.delimiter + process.env.PATH }, timeout: 3 * 60 * 1000 });
    pgCtl = pgExe("pg_ctl.exe");
    run(pgCtl, [
      "-D", DATA_DIR,
      "-l", PG_SERVER_LOG,
      "-o", "-h 127.0.0.1 -p " + PG_PORT + " -c listen_addresses=127.0.0.1",
      "-w", "start",
    ], { env: binEnv, timeout: 2 * 60 * 1000 });
    serverStarted = true;

    run(pgExe("createdb.exe"), ["-h", "127.0.0.1", "-p", PG_PORT, "-U", "postgres", "battlecruiser_step7_test"], {
      env: binEnv, timeout: 60 * 1000,
    });

    log("\r\n=== 1/4 Build disposable fixture (includes Step 5 base schema) ===");
    applySql("test/step7-jornada-fixture.sql");
    log("\r\n=== 2/4 Apply Step 5 baseline migration ===");
    applySql("supabase/migrations/20261023053011_step5_jornada_unica_backend.sql");
    log("\r\n=== 3/4 Apply Step 7 inventory migration ===");
    applySql("supabase/migrations/20261023122714_step7_jornada_inventory_ui.sql");
    log("\r\n=== 4/4 Verify snapshot, guarded open/close, idempotency and ACL contract ===");
    applySql("test/step7-jornada-contract.sql");
    log("\r\nPASS Step 7 PostgreSQL 17 disposable fixture and ACL contract.");
  } catch (error) {
    failure = error;
    log("\r\nFAIL Step 7 PostgreSQL 17 contract: " + (error && error.stack ? error.stack : String(error)));
  } finally {
    if (serverStarted && pgCtl) {
      try {
        run(pgCtl, ["-D", DATA_DIR, "-m", "fast", "-w", "stop"], {
          env: pgEnv(), timeout: 60 * 1000, allowFailure: true,
        });
      } catch (error) {
        log("WARN Could not stop temporary PostgreSQL server cleanly: " + error.message);
      }
    }
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (error) {
      log("WARN Could not remove disposable database directory: " + error.message);
    }
    if (logStream) {
      logStream.end();
      await new Promise(resolve => logStream.once("close", resolve));
    }
  }
  if (failure) process.exitCode = 1;
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
