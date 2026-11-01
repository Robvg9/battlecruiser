'use strict';

const { test } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const hotfix = fs.readFileSync(path.join(root, 'public', 'js', 'hotfix-regresiones-20260902.js'), 'utf8');
const force = fs.readFileSync(path.join(root, 'public', 'js', 'hotfix-turno-forceclose-20260902.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260902_bc_regresiones_operativas.sql'), 'utf8');
const NEW_JS = ['hotfix-regresiones-20260902.js','hotfix-turno-forceclose-20260902.js','hotfix-configuracion-20260902.js','hotfix-inventario-inmediato-20260902.js','hotfix-integracion-final-20260902.js'];

test('loader: no vuelve a ocultar Configuración y carga el hotfix final', () => {
  assert.ok(!app.includes('["hide-config-tab.js","42.2"]'));
  assert.ok(app.includes('hotfix-regresiones-20260902.js'));
  assert.ok(app.includes('hotfix-turno-forceclose-20260902.js'));
  assert.ok(app.includes('hotfix-integracion-final-20260902.js'));
});

test('syntax: todos los módulos JS nuevos pasan node --check', () => {
  for (const file of NEW_JS) execFileSync(process.execPath, ['--check', path.join(root,'public','js',file)], {stdio:'pipe'});
});

test('logout: usa LogOut y frontera de sesión', () => {
  assert.ok(hotfix.includes("btn.textContent = 'LogOut'"));
  assert.ok(hotfix.includes('window.__bcLogoutEnCurso = true'));
  assert.ok(hotfix.includes('window.location.replace'));
  assert.ok(hotfix.includes("'.ajustes-wrap{display:none!important}'"));
});

test('ventas: no fabrica stock 0 durante carga', () => {
  assert.ok(hotfix.includes('estado:st')); assert.ok(hotfix.includes('valor:null')); assert.ok(hotfix.includes('cargarStockAlmacenes(false)'));
});

test('turnos: el hotfix legacy ya no inyecta paneles Mañana/Tarde', () => {
  assert.ok(hotfix.includes("function cleanLegacyTurnoPanels()"));
  assert.ok(hotfix.includes(".bc-session-recovery"));
  assert.ok(!hotfix.includes("const grouped = { MAÑANA: [], TARDE: [] }"));
  assert.ok(!hotfix.includes("groupHtml('Tarde',grouped.TARDE)"));
  assert.ok(!hotfix.includes('Asignada a otra dependienta'));
});

test('force-close: solo vía RPC administrativa', () => {
  assert.ok(force.includes("bc_forzar_cierre_turno_admin"));
  assert.ok(force.includes("tienePermiso('turnos', 'editar_any')"));
  assert.ok(force.includes('BattleCruiserTurnoAPI.actorIsAdmin'));
  assert.ok(sql.includes("IF NOT public.bc_actor_is_admin()"));
  assert.ok(sql.includes("estado_maestro = 'CERRADO'"));
});

test('mínimo: contrato está indexado por producto + almacén', () => {
  assert.ok(sql.includes('bc_actualizar_stock_minimo')); assert.ok(sql.includes("ON CONFLICT (producto_id, almacen_id)")); assert.ok(sql.includes('p_minimo numeric')); assert.ok(hotfix.includes('bc_actualizar_stock_minimo'));
});

test('inventario: la vista sin filtro agrega un producto y conserva desglose por almacén', () => {
  assert.ok(hotfix.includes("fn !== 'inventario_enriquecido' || params?.p_almacen_id")); assert.ok(hotfix.includes('row.almacenes = row._bc_almacenes')); assert.ok(hotfix.includes('almacenes_resumen')); assert.ok(hotfix.includes("Editar mín."));
});

test('productos: existen importación Excel y plantillas CSV/XLSX', () => {
  assert.ok(hotfix.includes('bc-importar-excel-hotfix')); assert.ok(hotfix.includes('bc-exportar-plantilla-xlsx')); assert.ok(hotfix.includes('bc-exportar-plantilla-csv')); assert.ok(hotfix.includes('.xlsx,.xls,.csv'));
});

test('permisos: existe diseñador inteligente con perfiles iniciales', () => {
  for (const token of ['Solo lectura','Operación','Inventario','Administrador operativo']) assert.ok(hotfix.includes(token));
});

test('UI: Configuración queda visible y Ajustes deja de ser trigger principal', () => {
  assert.ok(hotfix.includes("button.classList.remove('hidden','bc-config-tab-hidden')")); assert.ok(hotfix.includes("panel.classList.add('bc-reg-config-ready')")); assert.ok(hotfix.includes('.ajustes-wrap{display:none!important}'));
});
