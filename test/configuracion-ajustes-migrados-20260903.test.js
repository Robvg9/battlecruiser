const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('configuración incluye las funciones principales del antiguo panel Ajustes', () => {
  const src = read('public/js/configuracion.js');
  for (const token of [
    'Ajustes básicos','Actualizar app / borrar caché','Modo oscuro','Modo claro',
    'Actualización automática','Sincronización automática','Sincronizar al abrir app',
    'Sincronizar solo en Wi‑Fi','Región / Conexión','Notificaciones','Modo compacto',
    'Cambiar contraseña','Administrador de datos','Restaurar ajustes','Cerrar sesión',
    'bc-ui-preferences-v2'
  ]) assert.match(src, new RegExp(token.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')));
  assert.match(src, /document\.getElementById\("update-app-btn"\)/);
  assert.match(src, /document\.getElementById\("change-pass-btn"\)/);
  assert.match(src, /document\.getElementById\("logout-btn"\)/);
});
