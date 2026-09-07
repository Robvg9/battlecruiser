"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const repoRoot = path.join(__dirname, "..");
const publicDir = path.join(repoRoot, "public");
const jsDir = path.join(publicDir, "js");

function listarJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listarJs(full);
    return entry.isFile() && entry.name.endsWith(".js") ? [full] : [];
  });
}

function ejecutarGit(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

const head = ejecutarGit(["rev-parse", "HEAD"]);
const status = ejecutarGit(["status", "--short"]);
if (status) {
  console.error("[preflight] Working tree dirty after checkout:");
  console.error(status);
  process.exit(1);
}

console.log(`[preflight] HEAD=${head}`);

const appSource = fs.readFileSync(path.join(publicDir, "app.js"), "utf8");
const referenciasDinamicas = [...appSource.matchAll(/\[\s*["']([^"']+\.js)["']\s*,/g)].map((m) => m[1]);
const faltantes = [...new Set(referenciasDinamicas)].filter((nombre) => !fs.existsSync(path.join(jsDir, nombre)));
if (faltantes.length) {
  console.error("[preflight] Missing modules referenced by public/app.js:");
  faltantes.forEach((nombre) => console.error(`  - ${nombre}`));
  process.exit(1);
}
console.log(`[preflight] Module references OK — ${new Set(referenciasDinamicas).size} dynamic module(s).`);

const archivos = [path.join(publicDir, "app.js"), path.join(publicDir, "service-worker.js"), ...listarJs(jsDir)];
let errores = 0;
for (const archivo of archivos) {
  const source = fs.readFileSync(archivo, "utf8");
  try {
    new vm.Script(source, { filename: path.relative(repoRoot, archivo) });
  } catch (error) {
    errores += 1;
    console.error(`\n[preflight] SYNTAX ERROR: ${path.relative(repoRoot, archivo)}`);
    console.error(error && error.stack ? error.stack : error);
  }
}

const m276Path = path.join(jsDir, "m27-6-ventas-presentaciones.js");
if (fs.existsSync(m276Path)) {
  const line = fs.readFileSync(m276Path, "utf8").split(/\r?\n/).find((l) => l.includes("function canSell"));
  console.log(`[preflight] public/js/m27-6-ventas-presentaciones.js canSell=${line ? line.trim().slice(0, 260) : "NOT FOUND"}`);
}

if (errores) {
  console.error(`\n[preflight] ${errores} JavaScript file(s) failed syntax validation.`);
  process.exit(1);
}

console.log(`[preflight] OK — ${archivos.length} JavaScript file(s) parsed successfully.`);
