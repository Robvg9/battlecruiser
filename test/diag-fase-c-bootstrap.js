"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const target = process.argv[2];
if (!target) {
  console.error("Uso: node test/diag-fase-c-bootstrap.js <test-file>");
  process.exit(2);
}

const absolute = path.resolve(__dirname, target);
let instrumented = fs.readFileSync(absolute, "utf8");

function mark(needle, suffix) {
  if (!instrumented.includes(needle)) {
    console.error("[FaseC DIAG] marker missing:", needle);
    return;
  }
  instrumented = instrumented.replace(needle, needle + suffix);
}

mark(
  "function inyectarApp(window, opciones = {}) {",
  "\n  if (process.env.BC_DIAG_BOOT === \"1\") console.error(\"[FaseC DIAG] ENTER inyectarApp\");"
);
mark(
  "let appJs = require(\"./_leer-app-js\").leerAppJsConcatenado(__dirname);",
  "\n  if (process.env.BC_DIAG_BOOT === \"1\") console.error(\"[FaseC DIAG] AFTER leerAppJsConcatenado chars=\" + appJs.length);"
);
mark(
  ".replace(/let _idbConexion = null;/, \"let _idbConexion = null; window._idbConexion = () => _idbConexion; window._idbConexionReset = () => { _idbConexion = null; };\");",
  "\n  if (process.env.BC_DIAG_BOOT === \"1\") console.error(\"[FaseC DIAG] AFTER transforms\");"
);
mark(
  "s.textContent = appJs;",
  "\n  if (process.env.BC_DIAG_BOOT === \"1\") console.error(\"[FaseC DIAG] BEFORE append\");"
);
mark(
  "window.document.body.appendChild(s);",
  "\n  if (process.env.BC_DIAG_BOOT === \"1\") console.error(\"[FaseC DIAG] AFTER append\");"
);
mark(
  "function montarEntorno(opciones = {}) {",
  "\n  if (process.env.BC_DIAG_BOOT === \"1\") console.error(\"[FaseC DIAG] ENTER montarEntorno\");"
);
mark(
  "async function montarEntornoConIdb(opciones, prepararIdb) {",
  "\n  if (process.env.BC_DIAG_BOOT === \"1\") console.error(\"[FaseC DIAG] ENTER montarEntornoConIdb\");"
);

const bootstrap = path.join(__dirname, ".diag-fase-c-instrumented.cjs");
fs.writeFileSync(
  bootstrap,
  `"use strict";\nconst Module=require("node:module");\nconst m=new Module(${JSON.stringify(absolute)},module);\nm.filename=${JSON.stringify(absolute)};\nm.paths=Module._nodeModulePaths(${JSON.stringify(path.dirname(absolute))});\nm._compile(${JSON.stringify(instrumented)},${JSON.stringify(absolute)});\n`,
  "utf8"
);

console.error(`[FaseC DIAG] TARGET=${target}`);
console.error("[FaseC DIAG] spawning instrumented node:test process");

const child = spawn(process.execPath, [
  "-r", path.join(__dirname, "node-global-compat.js"),
  "--test",
  "--test-timeout=60000",
  bootstrap,
], {
  cwd: path.join(__dirname, ".."),
  env: { ...process.env, BC_DIAG_BOOT: "1" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: false,
});

child.stdout.on("data", (chunk) => process.stdout.write(String(chunk)));
child.stderr.on("data", (chunk) => process.stderr.write(String(chunk)));

let finished = false;
const timer = setTimeout(() => {
  if (finished) return;
  console.error("[FaseC DIAG] HARD TIMEOUT 12000ms — bootstrap/test process remains alive");
  try { child.kill(); } catch (_) {}
  finished = true;
  process.exitCode = 1;
}, 12000);

child.on("error", (error) => {
  if (finished) return;
  clearTimeout(timer);
  finished = true;
  console.error("[FaseC DIAG] child process error:", error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (finished) return;
  clearTimeout(timer);
  finished = true;
  console.error(`[FaseC DIAG] child exited code=${code} signal=${signal || "none"}`);
  process.exitCode = code === 0 ? 0 : 1;
  try { fs.unlinkSync(bootstrap); } catch (_) {}
});
