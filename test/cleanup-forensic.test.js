"use strict";

const { test } = require("node:test");
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const publicRoot = path.join(repoRoot, "public");

const DELETED = [
  "m26-7-ventas-fix.js",
  "m27-1-ventas-pos.js",
  "m27-2-fe1-ventas-pos.js",
  "m27-theme-elegant-light.js",
  "catalogo-avanzado.js",
  "historiales-premium.js",
  "m26-14-comunicacion-estabilidad.js",
  "m30-turnos-expediente.js",
  "m31-turno-expediente.js",
  "m32-turnos-home-expediente-final.js",
  "m37-turnos-asignacion-misma.js",
  "m41-turnos-ventana-layout.js",
  "m46-turnos-sesiones-inteligentes.js",
  "m47-turnos-step1-layout.js",
  "m48-turnos-step1-layout.js",
  "m58-ventas-session-sync.js",
  "m59-turno-cierre-moderno.js",
  "m60-turnos-operacion-control.js",
  "m61-auth-ui-cleanup.js",
  "m62-turnos-fecha-operativa-ui-fix.js",
  "m64-ventas-topbar-sticky.js",
  "m65-ventas-smart-panel.js",
  "m66-ventas-polish-final.js",
  "m67-ventas-ux-compact.js",
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

test("cleanup forense: los 24 assets eliminados no existen", () => {
  for (const file of DELETED) {
    assert.strictEqual(
      fs.existsSync(path.join(publicRoot, "js", file)),
      false,
      `el asset eliminado sigue existiendo: ${file}`
    );
  }
});

test("cleanup forense: ningún source público referencia literalmente un asset eliminado", () => {
  const files = walk(publicRoot).filter((f) => /\.(html|js)$/.test(f));
  const hits = [];

  for (const filePath of files) {
    const text = fs.readFileSync(filePath, "utf8");
    for (const deleted of DELETED) {
      if (text.includes(deleted)) {
        hits.push(`${path.relative(repoRoot, filePath)} -> ${deleted}`);
      }
    }
  }

  assert.deepStrictEqual(hits, [], `referencias residuales detectadas:\n${hits.join("\n")}`);
});

assert.strictEqual(DELETED.length, 24, "la auditoría debe cubrir exactamente 24 assets");
