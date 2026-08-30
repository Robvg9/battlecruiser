# ChatBending — Micro-misión 003
**Fecha:** 2026-08-30
**Estado:** 🟡 IMPLEMENTADO / PENDIENTE VALIDACIÓN DE ROBERT

## Objetivo
Reorganizar la pantalla principal de Turnos como centro organizado:
`[+ Crear Turno]` + cards de turnos existentes (sin cards vacías ni Secciones Operativas sueltas).

## Estado anterior
- Home de `turnos-maestro.js` listaba **una card por almacén** (incluso vacías: "No hay turno creado").
- "Nuevo turno" repetido por almacén.
- Formulario de creación a pantalla completa (no modal).
- Tab legacy `Ciclos Operativos` / `tab-turnos` coexistían.

## Cambios
- Nuevo módulo `public/js/m29-turnos-organizacion.js` (v29.1):
  - Home: hero + **+ Crear Turno** (solo admin / permisos reales).
  - Sin turnos → solo botón + mensaje vacío (sin cards vacías).
  - Con turnos → cards con almacén, estado, inicio, duración, final, responsable si viene del backend.
  - Click en card → detalle existente (`BattleCruiserTurnosMaestro.open` / M21 legacy).
  - Modal **Crear Turno**: almacén, fecha inicio, días 1–7 → `TurnoAPI.crearTurno`.
  - Oculta headers/bloques legacy de ciclos en la pantalla principal.
  - Parchea `refrescarCiclos` / `refrescarTurnos` / `TurnosMaestro.home`.
- `public/app.js`: carga `m29-turnos-organizacion.js?v=29.1`.

## Supabase
Sin cambios. RPC existentes: `bc_crear_turno`, `listar_turnos`, `bc_actor_is_admin`, fallback `listar_ciclos_operativos`.

## No-regresión
No se modificaron Usuarios, Roles, Archivado, Ventas, Inventario, offline, dinero, tramos, relevo, aprobación.

## Problemas documentados (no tocados)
- Asignación de trabajadoras en el modal de creación queda para el detalle (RPC `bc_asignar_turno_sesion` ya existe).
- Posible carrera residual m18-ciclos-ux vs maestro; M29 re-aplica home al entrar al tab.

## Archivos
- `public/js/m29-turnos-organizacion.js` (nuevo)
- `public/app.js` (carga m29)
- `docs/CHATBENDING_MICRO_MISION_003.md`

## Tests
- `node --check` OK en m29 y app.js

## Commit SHA
(ver último commit en main)

## Prueba Robert
1. Actualizar app.
2. Entrar a **Turnos**.
3. Sin turnos: solo **+ Crear Turno** (admin), sin cards vacías ni Secciones Operativas.
4. Crear turno → modal (almacén / fecha / días) → aparece card → abrir detalle.
5. No admin: no ve **+ Crear Turno**.
6. Usuarios / Nuevo Usuario / Roles / navegación intactos.
