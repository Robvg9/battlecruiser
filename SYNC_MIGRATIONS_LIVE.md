# BattleCruiser — Sincronización Supabase LIVE ↔ GitHub

Fecha: 2026-09-03

Estado LIVE verificado: migraciones más recientes registradas por Supabase son `20260903175826` y `20260903175852`.

Estas migraciones ahora están presentes en GitHub con los mismos identificadores y nombres. La migración temporal `20260903180000_bc_turno_estado_unico_cierre_aprobacion.sql` fue eliminada porque no pertenecía a la historia registrada por LIVE.

Regla operativa: no editar manualmente el historial interno de migraciones de Supabase para corregir drift. Toda nueva modificación SQL debe entrar mediante una migración versionada en `supabase/migrations/` y quedar aplicada en LIVE de forma trazable.
