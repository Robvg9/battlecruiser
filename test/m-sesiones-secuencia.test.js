/**
 * BattleCruiser — pruebas estáticas de secuencialidad de sesiones_ciclo
 * Espejo de la regla SQL en:
 *   public.bc_orden_bloque_sesion
 *   public.bc_sesion_tiene_predecesora_incompleta
 *   public.iniciar_sesion_operativa (chequeo previo a INSERT turnos ABIERTO)
 *
 * NO ejecuta mutaciones live. Valida la lógica de orden y bloqueo.
 *
 * Casos de la misión:
 *   1 primera elegible → PASS
 *   2 segunda antes de completar primera → FAIL
 *   3 completar 1, abrir 2 → PASS
 *   4 tercera antes de completar 2 → FAIL
 *   5 completar 2, abrir 3 → PASS
 *   6–8 documentados como contrato M14 (SQL, no mockeados aquí)
 *   9 rechazo backend (regla predecesora) — reflejado en FAIL de 2/4
 */

'use strict';

function ordenBloque(bloque) {
  const s = String(bloque || '').toUpperCase().replace('Ñ', 'N');
  if (s === 'MANANA') return 1;
  if (s === 'TARDE') return 2;
  return 99;
}

function esAnterior(a, b) {
  if (a.dia_n < b.dia_n) return true;
  if (a.dia_n > b.dia_n) return false;
  return ordenBloque(a.bloque) < ordenBloque(b.bloque);
}

function tienePredecesoraIncompleta(sesiones, targetId) {
  const target = sesiones.find((s) => s.id === targetId);
  if (!target) throw new Error('Sesión no encontrada');
  return sesiones.some(
    (prev) =>
      prev.ciclo_id === target.ciclo_id &&
      prev.id !== target.id &&
      prev.estado !== 'COMPLETADA' &&
      prev.estado !== 'CANCELADA' &&
      esAnterior(prev, target)
  );
}

function puedeIniciar(sesiones, targetId, uid) {
  const target = sesiones.find((s) => s.id === targetId);
  if (!target) return { ok: false, reason: 'no_encontrada' };
  if (target.estado !== 'PENDIENTE') return { ok: false, reason: 'estado_' + target.estado };
  if (target.usuario_id && target.usuario_id !== uid) {
    return { ok: false, reason: 'asignada_a_otro' };
  }
  if (tienePredecesoraIncompleta(sesiones, targetId)) {
    return { ok: false, reason: 'predecesora_incompleta' };
  }
  return { ok: true };
}

const CICLO = 'ciclo-1';
const UID = 'user-dep-1';
const OTHER = 'user-other';

function buildSesiones(estados) {
  const defs = [
    { id: 's1', dia_n: 1, bloque: 'MANANA' },
    { id: 's2', dia_n: 1, bloque: 'TARDE' },
    { id: 's3', dia_n: 2, bloque: 'MANANA' },
  ];
  return defs.map((d, i) => ({
    ...d,
    ciclo_id: CICLO,
    estado: estados[i],
    usuario_id: null,
  }));
}

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('PASS:', msg);
}

function run() {
  {
    const ses = buildSesiones(['PENDIENTE', 'PENDIENTE', 'PENDIENTE']);
    const r = puedeIniciar(ses, 's1', UID);
    assert(r.ok === true, 'CASO 1 — primera sesión elegible → PASS');
  }

  {
    const ses = buildSesiones(['PENDIENTE', 'PENDIENTE', 'PENDIENTE']);
    const r = puedeIniciar(ses, 's2', UID);
    assert(r.ok === false && r.reason === 'predecesora_incompleta',
      'CASO 2 — abrir segunda con primera PENDIENTE → FAIL');
  }

  {
    const ses = buildSesiones(['COMPLETADA', 'PENDIENTE', 'PENDIENTE']);
    const r = puedeIniciar(ses, 's2', UID);
    assert(r.ok === true, 'CASO 3 — tras COMPLETADA s1, abrir s2 → PASS');
  }

  {
    const ses = buildSesiones(['COMPLETADA', 'PENDIENTE', 'PENDIENTE']);
    const r = puedeIniciar(ses, 's3', UID);
    assert(r.ok === false && r.reason === 'predecesora_incompleta',
      'CASO 4 — abrir tercera con segunda PENDIENTE → FAIL');
  }

  {
    const ses = buildSesiones(['COMPLETADA', 'COMPLETADA', 'PENDIENTE']);
    const r = puedeIniciar(ses, 's3', UID);
    assert(r.ok === true, 'CASO 5 — tras COMPLETADA s1+s2, abrir s3 → PASS');
  }

  {
    const ses = buildSesiones(['PENDIENTE', 'PENDIENTE', 'PENDIENTE']);
    ses[0].usuario_id = OTHER;
    const r = puedeIniciar(ses, 's1', UID);
    assert(r.ok === false && r.reason === 'asignada_a_otro',
      'CASO asignación — sesión de otro → FAIL');
  }

  {
    const ses = buildSesiones(['CANCELADA', 'PENDIENTE', 'PENDIENTE']);
    const r = puedeIniciar(ses, 's2', UID);
    assert(r.ok === true, 'CANCELADA no bloquea la siguiente → PASS');
  }

  {
    const ses = buildSesiones(['EN_CURSO', 'PENDIENTE', 'PENDIENTE']);
    const r = puedeIniciar(ses, 's2', UID);
    assert(r.ok === false && r.reason === 'predecesora_incompleta',
      'EN_CURSO anterior bloquea la siguiente → PASS');
  }

  {
    assert(ordenBloque('MANANA') < ordenBloque('TARDE'), 'orden bloque MANANA < TARDE');
    assert(esAnterior(
      { dia_n: 1, bloque: 'MANANA' },
      { dia_n: 1, bloque: 'TARDE' }
    ), 's1 MANANA es anterior a s2 TARDE');
  }

  console.log('\nTodas las aserciones de secuencia OK.');
  console.log('Contrato M14 (CASOS 6–8): documentado en SQL — iniciar_sesion_operativa INSERT turnos ABIERTO;');
  console.log('turno_actual_usuario y registrar_venta NO modificados.');
}

run();
