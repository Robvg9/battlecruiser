# SUPABASE_REAL_STATE.md
Proyecto: `papxnkkjtkxsitcsvcme` (Battlecruiser)
Generado: 2026-08-17, por auditoría directa vía MCP (execute_sql / list_tables / get_advisors sobre la base real, no sobre archivos).

Este documento describe **lo que existe hoy en producción**, verificado por consulta directa. No se basa en los archivos del repositorio ni en la memoria de sesiones anteriores.

---

## 1. Esquemas

- `public` — 24 tablas, 55 funciones, 11 triggers, 24 policies RLS activas.
- `private` — 1 tabla (`operaciones_idempotencia`) + 1 función (`reclamar_idempotencia`). **Este esquema no tiene ningún archivo correspondiente en los 10 archivos del repo revisados.**
- `anon` y `authenticated` **no tienen `USAGE`** sobre el esquema `private` (confirmado), por lo que no es alcanzable desde el cliente aunque RLS esté deshabilitado ahí (ver §6).

## 2. Tablas en `public` (24)

| Tabla | Filas | RLS | Policies propias |
|---|---|---|---|
| categorias | 3 | sí | 4 |
| almacenes | 2 | sí | 4 |
| productos | 1 | sí | 4 |
| stock | 2 | sí | 1 (solo ver; mutación exclusiva vía RPC) |
| roles | 1 | sí | 2 |
| permisos | 53 | sí | 2 |
| usuarios | 1 | sí | 2 |
| lotes_compra | 10 | sí | 1 (solo ver) |
| transferencias | 2 | sí | 1 (solo ver) |
| transferencias_lineas | 2 | sí | 1 (solo ver) |
| vales_salida | 1 | sí | 1 (solo ver) |
| ventas | 4 | sí | 1 (solo ver) |
| ventas_lineas | 4 | sí | 1 (solo ver) |
| unidades | 6 | sí | 3 |
| presentaciones | 8 | sí | 4 |
| producto_presentaciones | 7 | sí | 4 |
| auditoria_operaciones | 0 | sí | **0 (sin policies)** |
| turnos | 0 | sí | **0 (sin policies)** |
| cuadres | 0 | sí | **0 (sin policies)** |
| responsabilidades | 0 | sí | **0 (sin policies)** |
| incidencias | 0 | sí | **0 (sin policies)** |
| conversaciones | 0 | sí | **0 (sin policies)** |
| participantes_conversacion | 0 | sí | **0 (sin policies)** |
| mensajes | 0 | sí | **0 (sin policies)** |

Las 8 tablas de B4/B7/B8 sin policies quedan en **fail-closed total** para acceso directo (ni SELECT ni escritura por `anon`/`authenticated`): toda su interacción pasa por funciones `SECURITY DEFINER` propiedad de `postgres` (que bypassa RLS por diseño). El linter de Supabase lo marca como `rls_enabled_no_policy` (nivel INFO), consistente con esa arquitectura intencional (confirmado también por auditorías previas registradas en memoria).

## 3. Tabla en `private` (1)

| Tabla | Filas | RLS | Nota |
|---|---|---|---|
| private.operaciones_idempotencia | 11 | **NO (deshabilitado)** | `anon`/`authenticated` no tienen `USAGE` sobre el esquema `private`, así que no es alcanzable desde el cliente. Supabase la marca igual como advertencia de seguridad (`rls_disabled`, nivel CRITICAL) porque es una regla ciega al grant de esquema. |

## 4. Funciones en `public` (55) + `private` (1)

Todas las 55 funciones de `public` son `SECURITY DEFINER` con `search_path` fijo (`public, pg_temp`) — sin excepción. La de `private` (`reclamar_idempotencia`) también es `SECURITY DEFINER`.

Lista completa (55, orden alfabético — nombre(args)):
```
_es_participante(uuid, uuid)
abrir_turno(uuid, uuid, text)
actualizar_producto(uuid, text, uuid, text, numeric, numeric, uuid)
actualizar_responsabilidad(uuid, text, text, uuid)
agregar_participante(uuid, uuid)
asignar_rol_usuario(uuid, uuid)
auditar_mutacion_operativa() -> trigger
calcular_dinero_esperado_turno(uuid)
cambiar_estado_producto(uuid, boolean, uuid)
cambiar_estado_usuario(uuid, boolean)
cerrar_conversacion(uuid)
cerrar_turno(uuid, uuid, text)
contar_no_leidos_global()
crear_conversacion(text, text, uuid, uuid, uuid, uuid, uuid)
crear_incidencia(text, text, uuid, uuid, uuid)
crear_producto(text, uuid, text, numeric, numeric, uuid)
crear_responsabilidad(text, text, uuid, uuid, timestamptz, text, uuid)
enviar_mensaje(uuid, text, uuid)
historial_compras(date, date, uuid, uuid, int, int)
inventario_enriquecido(uuid)
listar_auditoria_admin(uuid, text, text, int, int)
listar_conversaciones_usuario(boolean, int)
listar_cuadres(text, int, int)
listar_incidencias(text, text, uuid, int, int)
listar_mensajes_conversacion(uuid, int, int)
listar_responsabilidades(uuid, uuid, text, int, int)
listar_roles_admin()
listar_turnos(uuid, text, uuid, int, int)
listar_usuarios_admin()
listar_usuarios_para_chat()
marcar_conversacion_leida(uuid)
movimientos_producto(uuid, uuid, date, date, text, int, int)
obtener_conversion_presentacion(uuid, uuid, numeric)
perfil_usuario_actual()
permisos_por_rol(uuid)
permisos_usuario_actual()
proteger_ultimo_dueno() -> trigger
registrar_auditoria(text, text, text, text, uuid, jsonb)
registrar_compra(uuid, uuid, numeric, numeric, uuid, numeric, uuid)
registrar_cuadre(uuid, numeric, uuid, text)
registrar_transferencia(uuid, uuid, jsonb, uuid)
registrar_vale_salida(uuid, uuid, text, numeric, uuid, numeric, uuid)
registrar_venta(uuid, jsonb, uuid)
rentabilidad_ventas(date, date, uuid, uuid, int, int)
reporte_movimiento_inventario(date, date, uuid, uuid, int, int)
reporte_resumen_ejecutivo(date, date, uuid)
reporte_stock(uuid, uuid)
reporte_transferencias(date, date, uuid, uuid, text, int, int)
reporte_vales(date, date, uuid, text, int, int)
reporte_ventas(date, date, uuid, uuid, int, int)
resolver_incidencia(uuid, text, uuid)
revisar_cuadre(uuid, text, text, uuid)
tiene_permiso(text, text)
turno_actual_usuario()
usuario_esta_activo()
validar_producto_activo_en_mutacion() -> trigger

private.reclamar_idempotencia(uuid, uuid, text, jsonb)
```

Hallazgo clave sobre `registrar_compra`, `registrar_venta`, `registrar_transferencia`, `registrar_vale_salida`: las 4 tienen la lógica de FIFO/conversión de presentaciones **escrita en línea dentro de cada función**, y todas llaman a `private.reclamar_idempotencia(...)` al inicio para el control de idempotencia (no a helpers `_consumir_fifo`/`_registrar_movimiento`/`_resolver_presentacion` — ver §Reconciliación).

## 5. Triggers (11, sobre 6 tablas)

| Tabla | Trigger | Momento | Evento | Función |
|---|---|---|---|---|
| lotes_compra | trg_auditoria_lotes_compra | AFTER | INSERT | auditar_mutacion_operativa |
| lotes_compra | trg_validar_producto_activo_lotes | BEFORE | INSERT | validar_producto_activo_en_mutacion |
| productos | trg_auditoria_productos | AFTER | INSERT, UPDATE | auditar_mutacion_operativa |
| transferencias | trg_auditoria_transferencias | AFTER | INSERT | auditar_mutacion_operativa |
| transferencias_lineas | trg_validar_producto_activo_transferencias_lineas | BEFORE | INSERT | validar_producto_activo_en_mutacion |
| usuarios | trg_auditoria_usuarios | AFTER | UPDATE | auditar_mutacion_operativa |
| usuarios | trg_proteger_ultimo_dueno | BEFORE | UPDATE | proteger_ultimo_dueno |
| vales_salida | trg_auditoria_vales | AFTER | INSERT | auditar_mutacion_operativa |
| vales_salida | trg_validar_producto_activo_vales | BEFORE | INSERT | validar_producto_activo_en_mutacion |
| ventas | trg_auditoria_ventas | AFTER | INSERT | auditar_mutacion_operativa |
| ventas_lineas | trg_validar_producto_activo_ventas_lineas | BEFORE | INSERT | validar_producto_activo_en_mutacion |

## 6. Grants

- **`anon`**: 0 grants en cualquier tabla de `public`. 0 `EXECUTE` en cualquier función de `public`. Confirmado por consulta directa a `information_schema.role_table_grants` y `has_function_privilege`. Sin `USAGE` en `private`.
- **`authenticated`**: SELECT/REFERENCES/TRIGGER en la mayoría de tablas operativas (lotes_compra, productos, stock, transferencias*, vales_salida, ventas*) — **sin** INSERT/UPDATE/DELETE directo, es decir, la escritura pasa obligatoriamente por RPC. En tablas de configuración (categorias, almacenes, roles, permisos, unidades, presentaciones, producto_presentaciones, usuarios) sí tiene el CRUD completo a nivel de grant, pero gobernado por RLS (`tiene_permiso(...)`). Las 8 tablas B4/B7/B8 no tienen ningún grant a `authenticated` — acceso 100% vía RPC.
- Advisor de seguridad marca 45 funciones como "ejecutables por `authenticated` vía `/rest/v1/rpc/...`" (nivel WARN, informativo): es el diseño esperado — cada una empieza con su propio chequeo interno de `tiene_permiso()`/rol.
- Advisor adicional no relacionado con esta misión: `auth_leaked_password_protection` deshabilitado (WARN, nivel Auth, no es parte del alcance de esta auditoría de esquema).

## 7. Migraciones aplicadas en producción (registradas en `supabase_migrations.schema_migrations`)

Total: **61 migraciones**, desde `20260810001217_tablas_base_battlecruiser` hasta `20260818013738_m4_auditoria_rpc_permission`. Lista completa disponible bajo pedido; se resume por bloques:

- **Fundacionales (10810–10812):** tablas base, roles/permisos, lotes_compra, transferencias, vales_salida, endurecimiento inicial de RPC, usuario dueño inicial, ventas, config admin (categorías/unidades/presentaciones), columna `presentacion_id` en productos, sistema de presentaciones múltiples y su integración en compra/venta/transferencia/vale.
- **Fixes de grants puntuales (10812–10814):** drop de overload viejo de `registrar_vale_salida`, fix de grants, RPC idempotente de `crear_producto`.
- **B3 — roles y permisos (10815–10816):** `b3_roles_permisos`, `b3_6_*` (drop de UNIQUE duplicado en stock, trigger de protección del último Dueño, revoke a `anon` de funciones admin, revoke de función de trigger pública), `b3_7_*` (exigir `idempotency_key` en las 4 mutaciones core, cierre de UPDATE directo a stock), `b3_8_*` (cierre de EXECUTE público en funciones `SECURITY DEFINER`), `b3_9_*` (unificación de `search_path`).
- **B4/B5 — auditoría y reportes (10816):** `b4_b5_auditoria_reportes_y_permisos`, luego 5 migraciones adicionales de B5 (columna de costo FIFO en `ventas_lineas`, costo FIFO en `registrar_venta`, `historial_compras` + revoke anon, `rentabilidad_ventas`, resumen ejecutivo con margen).
- **B6 — auditoría de compras (10817):** 5 migraciones (`b6_audit_*`) que agregan `usuario_id`/origen a lotes_compra y ajustan `registrar_compra`/`registrar_transferencia`/`historial_compras`, más revoke de grants excedentes a `authenticated`.
- **B7/B8 — operación humana y comunicación (10816):** `b7_operacion_humana_corregida`, `b8_comunicacion_corregida`, `b8_1_indices_integridad_y_rendimiento`, `b8_2_optimizar_rls_usuarios`, `b8_6_revocar_grants_anon_tablas_publicas`.
- **M2 (10817):** revoke anon en inventario/movimientos, fix de `order by` y grants en `movimientos_producto`, fix de grant público en `inventario_enriquecido`.
- **M3/M4 (10817–10818):** `productos_editar_estado_y_fix_null_mayorista` + revoke anon, `m3_revoke_anon_execute_all_functions`, `m4_auditoria_rpc_permission`.

**Importante:** el nombre de migración `b6_nucleo_operativo` (que sí existe como archivo `.sql` completo en el repo) **no aparece como tal** en el historial de `schema_migrations`. Lo que sí está aplicado es una secuencia de migraciones incrementales con otros nombres (`crear_ventas`, `presentaciones_multiples_base`, `integrar_presentaciones_registrar_compra`, `registrar_venta_presentaciones`, etc.) que construyeron el mismo resultado final de forma distinta. Ver `RECONCILIACION_SUPABASE_GITHUB.md`.
