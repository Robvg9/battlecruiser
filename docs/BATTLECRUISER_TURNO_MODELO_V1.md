# BattleCruiser — Modelo TURNO V1 (Frontend)

**Fecha:** 2026-08-28  
**Versión FE:** v9.4.0  
**Estado:** Implementación FE contra contrato backend `bc_*` documentado en Notion.

## Concepto
TURNO es el único concepto operativo. Ciclo = legacy/compatibilidad.

Estados: PROGRAMADO → EN_CURSO → PENDIENTE_APROBACION → CERRADO (+ CANCELADO).
Sesiones: N días × 2 = 2N.

## Módulos
- `public/js/turno-api.js` — capa RPC bc_*
- `public/js/turnos-maestro.js` — UX Turnos

## Legacy conservado
ciclos.js, m18, m22–m24, SQL M15–M17. No DROP.

## Estado
COMPLETO TÉCNICAMENTE (FE) — PENDIENTE VALIDACIÓN ROBERT.

SHA256 locales de entrega:
- turno-api.js: c29e0ff35c52f5046f507f35b8548ad0a423e70f56cf0d895a90e8a645eac438
- turnos-maestro.js: c2d101a800fcc57069feadb777ab5e1e693a41d80cd9fc1ca5deb564f93f3010
- app.js: 4784df70398b19c27374f558be70681293ecb5ebf41e1301d3e4548c1ab2b11e
- service-worker.js: 43f863a18c14b7df45b7e0ab05764c90fcdfb25b85f13674189e9d202da7872b
