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
const cashMigration = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261123193000_jornada_daily_cash_without_final_declaration.sql"), "utf8");
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

test("sealed retail Jornada captures only the actual date-specific cash entries", () => {
  assert.match(ui, /sessionState==='CERRADA_OPERATIVAMENTE'&&!!detail\.tramo_registrable/);
  assert.match(ui,/detail\.server_responsible_access===true/);
  assert.match(ui, /sessionState==='CERRADA_OPERATIVAMENTE'&&!!detail\.tramo_registrable/);
  assert.match(ui, /bc7_registrar_entrega_diaria_jornada/);
  assert.match(ui, /bc7_admin_registrar_entrega_diaria_jornada/);
  assert.match(ui, /data-bc7-cash-day-amount/);
  assert.match(ui, /Dinero recogido este día \(CUP\)/);
  const start=ui.indexOf("function renderCashDaysWorkspace(detail){");
  const end=ui.indexOf("async function loadCashDaysWorkspace(detail){",start);
  const daily=ui.slice(start,end);
  assert.doesNotMatch(daily,/Declaración final del período|data-bc7-admin-cash-declaration|data-bc7-rectify-cash-declaration|id="bc7-cash"/);
  assert.match(ui, /bc7_estado_conteo_efectivo_jornada/);
  assert.match(ui, /bc7_contar_efectivo_dueno_jornada/);
  assert.match(ui, /data-bc7-save-cash-days/);
  assert.match(ui,/document\.querySelector\('#bc7-cash-days-manager \\[data-bc7-close-form\\]'\)/);
  assert.match(ui,/dayRoot\.querySelectorAll\('\[data-bc7-cash-day-row\]'\)/);
  // Historical transcription/rectification RPCs remain available for audit repair,
  // but their forms are no longer mounted in the retail Step 5 renderer.
  assert.match(ui, /async function rectifyAdminCashDeclaration/);
  assert.match(ui, /bc5_admin_rectificar_declaracion_a_entrega_diaria/);
  assert.match(cashMigration,/CREATE TABLE IF NOT EXISTS public\.turno_jornada_conteos_caja/);
  assert.match(cashMigration,/REVOKE ALL ON TABLE public\.turno_jornada_conteos_caja/);
});

test("closed retail Jornada keeps the five-step checklist visible while preserving post-seal restrictions", () => {
  const start=ui.indexOf("function checklistHtml(detail,isAssigned,status){");
  const end=ui.indexOf("function calculationPhaseHtml(detail){",start);
  const checklist=ui.slice(start,end);
  assert.match(checklist,/CERRADA_OPERATIVAMENTE/);
  for (const step of ["Gastos","Reinversiones","Bajas","Inventario final","Entregas diarias de efectivo"]) assert.ok(checklist.includes(step), "missing "+step);
  assert.match(checklist,/Completa el registro tardío desde tu cuenta/);
  assert.doesNotMatch(checklist,/Bloqueado tras el sello/);
  assert.match(checklist,/Reabrir sección/);
});

test("Owner physical count is independent and cannot duplicate the daily declared sum", () => {
  assert.match(ui, /countState\?\.puede_contar===true/);
  assert.match(ui, /data-bc7-final-cash-count/);
  assert.match(ui, /bc7_contar_efectivo_dueno_jornada/);
  assert.match(ui, /total_diario_aprobado/);
  const start=ui.indexOf("async function countFinalCash(form){");
  const end=ui.indexOf("function cashDeclarationHtml(detail){",start);
  const block=ui.slice(start,end);
  assert.match(block,/p_monto_contado:amount/);
  assert.doesNotMatch(block,/bc5_contar_dinero_entregado|declarationId/);
  assert.match(cashMigration,/THEN v_final_counted ELSE NULL END/);
  const singleCashBlock=cashMigration.slice(cashMigration.indexOf("v_new := $new$",cashMigration.indexOf("INTO v_final_declared,v_final_counted,v_final_cash_state")),cashMigration.indexOf("$new$;",cashMigration.indexOf("INTO v_final_declared,v_final_counted,v_final_cash_state"))+6);
  assert.match(singleCashBlock,/THEN v_final_counted ELSE NULL END/);
  assert.doesNotMatch(singleCashBlock,/v_daily_cash\+v_final_counted/);
  assert.match(ui, /El conteo físico del Dueño se habilitará cuando la responsable complete los cinco pasos/);
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

test("daily cash workspace trusts server-verified responsibility and reuses its authorized read", () => {
  const start=ui.indexOf("async function loadCashDaysWorkspace(detail){");
  const end=ui.indexOf("async function saveCashDaysWorkspace(",start);
  assert.ok(start>=0&&end>start,"daily cash loader must exist");
  const loader=ui.slice(start,end);
  assert.match(loader,/detail\.server_responsible_access===true/,
    "retail access comes from the authoritative server check, not the local people catalogue");
  assert.match(loader,/state\.dailyCashSessionId===sessionId&&state\.dailyCashData/,
    "the read already authorized for this session is reused instead of fetched twice");
  assert.doesNotMatch(loader,/const isAssigned=String\(currentUser\(\)\?\.id\|\|''\)===String\(detail\.sesion\.responsable_id/,
    "the retail cash view must not reject the worker while local identity data is still loading");
});
