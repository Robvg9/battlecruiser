# BattleCruiser — Triangulación TURNO — 2026-08-28

## Estado
Auditoría directa de Notion ↔ Supabase LIVE ↔ GitHub `main`.

## GitHub
- `public/js/turnos-maestro.js`: presente en `main`, no stub. Blob SHA actual verificado: `1d218fafdea4bab67dc4f2717a27f607cf2ba7da`.
- `public/js/turno-api.js`: presente; incluye wrappers para `bc_*`, `listarSesionesTurno()` y `listarTramosSesion()`.
- `public/app.js`: v9.4.0.
- `public/service-worker.js`: v9.4.0.
- SQL TURNO: existe versionado parcial; el volcado 1:1 completo de todas las migraciones LIVE aún no está en el repo.

## Supabase LIVE
Verificadas tablas TURNO y RPC principales mediante `information_schema`, `pg_proc`, `pg_policies` y privilegios.

Tablas principales: `turnos`, `turno_sesiones`, `turno_asignaciones`, `turno_tramos`, `turno_declaraciones`, `turno_entregas_inventario`, `turno_sucesiones`, `turno_revisiones`, `turno_diferencias`, `turno_descuentos`, `turno_eventos`, `turno_recepciones_compra`, `turno_configuracion`.

Reglas verificadas:
- creación solo ADMIN;
- 2 sesiones por día;
- asignación/reasignación solo antes de una sesión activa;
- solo la persona asignada inicia;
- cierre exige una declaración por tramo;
- interrupción/relevo crea el siguiente tramo dentro de la misma transacción;
- aprobación final solo ADMIN;
- descuentos manuales solo ADMIN;
- recepción de compras POS deriva al responsable de sesión/tramo activo;
- almacén de almacenamiento recibe/aprueba ADMIN;
- duración fija es respetada por creación/sucesión y edición queda bloqueada fuera de PROGRAMADO;
- RLS SELECT existe para las tablas TURNO y las RPC críticas no tienen EXECUTE para `anon` en la comprobación realizada.

## Corrección aplicada en este bloque
Se corrigió `bc_registrar_entrega_inventario` y las dos sobrecargas de `bc_recibir_entrega_inventario` para distinguir correctamente punto de venta vs almacén de almacenamiento y permitir ADMIN/transportista autorizado como entregador sin permitir selección arbitraria del receptor.

Migration GitHub:
`supabase/migrations/20260828_bc_fix_inventario_recepcion_transportista_almacen.sql`

Commit:
`b30f70f2921189d3684782c3e1dcbcc6514a6ca9`

## Gaps no resueltos sin inventar
1. Versionar 1:1 todo el historial SQL TURNO LIVE, no solo las últimas migraciones.
2. Integrar/validar en frontend el flujo de recepción física de compras (`bc_registrar_llegada_compra` + `bc_confirmar_recepcion_compra`) sin mezclarlo con entrega/sucesión de inventario.
3. Auditar el fallback legacy que convierte Ciclos en Turnos cuando falla `listar_turnos`.
4. Implementar el rol futuro explícito Transportista/Entrega de mercancía, si se desea como rol separado de la bandera actual `puede_transportar_mercancia`.
5. Ejecutar pruebas E2E reales en dispositivo y validación final de Robert.

## Regla de cierre
No marcar 100% hasta que Notion, Supabase LIVE y GitHub representen el mismo contrato y los flujos críticos hayan pasado pruebas técnicas y E2E.