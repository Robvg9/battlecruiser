"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ui = fs.readFileSync(path.join(__dirname, "../public/js/bc7-jornada-ui.js"), "utf8");
const migration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20261122170000_jornada_daily_cash_post_close_rectification.sql"),
  "utf8"
);
const mobileCss = fs.readFileSync(
  path.join(__dirname, "../public/bc7-jornada-inventory-mobile.css"),
  "utf8"
);

test("advanced monthly calendar is an isolated desktop modal, not the default Jornada screen", () => {
  assert.match(ui, /id="bc7-visual-calendar-modal" class="bc7-visual-calendar-modal" hidden/);
  assert.match(ui, /data-bc7-open-visual-calendar/);
  assert.match(ui, /function openVisualCalendar\(\)/);
  assert.match(ui, /function closeVisualCalendar\(\)/);
  assert.match(ui, /matchMedia\('\(min-width:761px\) and \(hover:hover\) and \(pointer:fine\)'\)/);
  assert.match(ui, /@media\(max-width:760px\),\(hover:none\) and \(pointer:coarse\)\{\.bc7-visual-calendar-modal\{display:none!important\}/);
  assert.match(ui, /#tab-jornada #bc7-schedule-list\{display:grid!important\}/);
  assert.match(ui, /#tab-jornada \.bc7-visual-calendar-open\{display:none!important\}/);

  const calendarStart = ui.indexOf('<section class="bc7-card" id="bc7-calendar-section">');
  const workspaceStart = ui.indexOf('<section id="bc7-workspace"', calendarStart);
  assert.ok(calendarStart >= 0 && workspaceStart > calendarStart, "calendar screen markup exists");
  const section = ui.slice(calendarStart, workspaceStart);
  const modalStart = section.indexOf('id="bc7-visual-calendar-modal"');
  const board = section.indexOf('id="bc7-month-board"');
  const scheduleList = section.indexOf('id="bc7-schedule-list"');
  assert.ok(modalStart >= 0 && board > modalStart, "advanced board is inside the modal");
  assert.ok(scheduleList > board, "regular schedule list follows the closed modal in the normal page");
  assert.ok(section.includes("Jornadas programadas"), "the normal Jornada section remains present");
  assert.ok(section.includes("Abrir tablero visual"), "the desktop entry is explicit");
  assert.match(ui, /data-bc7-close-visual-calendar/);
  assert.match(ui, /Escape/);
  assert.match(mobileCss, /@media \(max-width: 759px\), \(hover: none\) and \(pointer: coarse\)/);
});

test("sealed Jornada keeps date-specific cash entries separate from the final-period declaration", () => {
  assert.match(ui, /detail\.tramo_registrable\|\|detail\.tramo_activo/);
  assert.match(ui, /sessionState==='CERRADA_OPERATIVAMENTE'&&!!detail\.tramo_registrable/);
  assert.match(ui, /bc7_registrar_entrega_diaria_jornada/);
  assert.match(ui, /bc7_admin_registrar_entrega_diaria_jornada/);
  assert.match(ui, /Guardar entregas diarias/);
  assert.match(ui, /Dinero recogido este día \(CUP\)/);
  assert.match(ui, /Declaración final del período/);
  assert.match(ui, /data-bc7-admin-cash-declaration/);
  assert.match(ui, /data-bc7-rectify-cash-declaration/);
  assert.match(ui, /data-bc7-rectify-cash-date/);
  assert.match(ui, /data-bc7-rectify-cash-note/);
  assert.match(ui, /async function rectifyAdminCashDeclaration/);
  assert.match(ui, /bc5_admin_rectificar_declaracion_a_entrega_diaria/);
  assert.match(ui, /data-bc7-save-cash-days/);
  assert.match(ui, /closest\('\[data-bc7-close-form\]'\)/);
  assert.match(ui, /const declarationState=String\(declaration\?\.estado_aprobacion\|\|''\)\.toUpperCase\(\);/);
  assert.match(ui, /declarationState==='RECTIFICADA'/);
});

test("Owner physical cash count stays locked until Jornada is completed", () => {
  assert.match(ui, /if\(detail\.is_admin&&sessionState==='COMPLETADA'&&declaration\.monto_contado==null/);
  assert.match(ui, /else if\(detail\.is_admin&&sessionState!=='COMPLETADA'\)/);
  assert.match(ui, /El conteo físico del Dueño se habilitará cuando la jornada esté completada\./);
  assert.doesNotMatch(ui, /if\(detail\.is_admin&&\['COMPLETADA','CERRADA_OPERATIVAMENTE'\]\.includes\(sessionState\)/);
});

test("post-seal daily cash backfill is ADMIN-gated, period-bounded, idempotent and audited", () => {
  assert.match(migration, /ALTER TABLE public\.turno_declaraciones/);
  assert.match(migration, /'RECTIFICADA'::text/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.bc7_admin_registrar_entrega_diaria_jornada/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.bc5_admin_rectificar_declaracion_a_entrega_diaria/);
  assert.match(migration, /public\.bc_actor_is_admin\(\)/);
  assert.match(migration, /v_turno\.estado IS DISTINCT FROM 'ABIERTO'/);
  assert.match(migration, /p_fecha<v_p\.fecha OR p_fecha>v_fecha_fin OR p_fecha>v_hoy/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /idempotency_key/);
  assert.match(migration, /DINERO_ENTREGA_DIARIA_TRANSCRITA_ADMIN/);
  assert.match(migration, /DINERO_DECLARACION_RECTIFICADA_A_ENTREGA_DIARIA/);
  assert.match(migration, /ENTREGA_DIARIA_TRANSCRITA_ADMIN/);
  assert.match(migration, /estado_aprobacion='RECTIFICADA'/);
  assert.match(migration, /aprobado_por_anterior/);
  assert.match(migration, /'tramo_registrable'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.bc7_admin_registrar_entrega_diaria_jornada/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.bc5_admin_rectificar_declaracion_a_entrega_diaria/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.bc7_admin_registrar_entrega_diaria_jornada/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.bc5_admin_rectificar_declaracion_a_entrega_diaria/);
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b|\bTRUNCATE\s/i);
});

test("desktop calendar uses a warm per-user month cache and an exact seven-column week grid", () => {
  assert.match(ui,/state\.calendarCache\.get\(key\)/);
  assert.match(ui,/Date\.now\(\)-cached\.at<60000/);
  assert.match(ui,/state\.calendarPromises\.get\(key\)/);
  assert.match(ui,/loadCalendar\(\{force:true\}\)/);
  assert.match(ui,/await Promise\.all\(\[loadCurrentSession\(\),loadCalendar\(\)\]\)/);
  assert.match(ui,/host\.style\.gridTemplateColumns='repeat\(7,minmax\(0,1fr\)\)'/);
  assert.match(ui,/host\.style\.gridTemplateRows='34px repeat\('\+weekRows\+',minmax\(62px,1fr\)\)\)'/);
  assert.match(ui,/#tab-jornada \.bc7-visual-calendar-layout\{display:grid!important;grid-template-columns:minmax\(0,1fr\) clamp\(300px,27vw,380px\)!important/);
  assert.match(ui,/#tab-jornada \.bc7-visual-calendar-main\{display:flex!important/);
  assert.match(ui,/#tab-jornada \.bc7-visual-calendar-side\{display:flex!important/);
});

test("sealed retail operation forms wait for Supabase's assigned-responsible authorization", () => {
  const start=ui.indexOf("function ensureWorkspaceOperationData(detail){");
  const end=ui.indexOf("function activateWorkspaceTab(name){",start);
  assert.ok(start>=0&&end>start);
  const access=ui.slice(start,end);
  assert.match(access,/serverAccessPromise=isRetail&&!state\.admin/);
  assert.match(access,/rpc\('bc7_entregas_diarias_jornada'/);
  assert.match(access,/detail\.server_responsible_access=true/);
  assert.match(access,/canAdjust=sessionAcceptsPendingOps&&isAssigned/);
  assert.match(access,/canCreateReinvestment=sessionAcceptsPendingOps&&isAssigned/);
  assert.doesNotMatch(access,/currentUser\(\)\?\.id===String\(detail\.sesion\.responsable_id/);
  assert.doesNotMatch(ui,/No tienes acceso a los importes de esta jornada\./);
});
