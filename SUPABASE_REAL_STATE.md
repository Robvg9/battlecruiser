# SUPABASE — ESTADO REAL DE PRODUCCIÓN

**Proyecto:** `papxnkkjtkxsitcsvcme`
**Verificado por:** consulta directa a producción (Claude, Misión 1/3).
**Fecha de verificación:** 2026-08-17.
**Fuente de verdad del backend:** producción. Este documento refleja lo que realmente hay en producción, no lo que los archivos del repo dicen que debería haber.

> Documento generado a partir de `RECONCILIACION_SUPABASE_GITHUB.md`. Ver ese archivo para el detalle completo de hallazgos y diferencias repo↔producción.

---

## 1. Esquema `private` — idempotencia de servidor

Producción tiene un segundo esquema, `private`, no documentado en ningún archivo previo del repo:

- **Tabla:** `private.operaciones_idempotencia` (con datos reales: 11 filas en la verificación).
  - Columnas: `idempotency_key uuid PK`, `usuario_id uuid NOT NULL`, `tipo_operacion text NOT NULL`, `payload_hash text NOT NULL`, `resultado_id uuid`, `creado_en timestamptz DEFAULT now()`.
- **Función:** `private.reclamar_idempotencia(p_idempotency_key, p_usuario_id, p_tipo_operacion, p_payload)` → `uuid`.
  - `SECURITY DEFINER`, `search_path TO 'public'`.

Este es el mecanismo real de idempotencia que usan `registrar_compra`, `registrar_venta`, `registrar_transferencia`, `registrar_vale_salida` (y las RPC de M3: `crear_producto`, `actualizar_producto`, `cambiar_estado_producto`).

**Nota de seguridad (documentada, no accionable en esta misión):** `private.operaciones_idempotencia` tiene RLS deshabilitado. No es explotable hoy porque ni `anon` ni `authenticated` tienen `USAGE` sobre el esquema `private` — solo es alcanzable desde funciones `SECURITY DEFINER` propiedad de `postgres`. Queda como decisión pendiente de discutir explícitamente, no como fix automático (regla: no inventar cambios).

**Versionado en el repo:** `supabase/m5-reconciliacion-supabase-github.sql` sección 1.

---

## 2. Funciones fundacionales sin archivo propio previo

Estas tres funciones centrales existían en producción desde migraciones fundacionales (2026-08-10/12) pero ningún archivo `.sql` del repo las definía con `CREATE FUNCTION`:

### `public.tiene_permiso(p_seccion text, p_accion text)` → `boolean`
- Base de las 24 policies RLS de `public` y de casi todos los checks de permiso dentro de las funciones.
- `SECURITY DEFINER`, `search_path TO 'public', 'pg_temp'`.
- **Versionado en el repo:** `supabase/m5-reconciliacion-supabase-github.sql` sección 2.

### `public.obtener_conversion_presentacion(p_producto_id, p_presentacion_id, p_cantidad)` → `TABLE(factor, unidades_base)`
- Conversión de presentaciones comerciales a unidades base.
- Creada por la migración real `fn_obtener_conversion_presentacion` (2026-08-12).
- `SECURITY DEFINER`, `search_path TO 'public', 'pg_temp'`.
- **Versionado en el repo:** `supabase/m5-reconciliacion-supabase-github.sql` sección 3.

### `public.proteger_ultimo_dueno()` → `trigger`
- Protege que no quede el sistema sin ningún usuario con rol "Dueño" activo.
- Creada por la migración real `b3_6_trigger_proteccion_ultimo_dueno`.
- Trigger: `trg_proteger_ultimo_dueno BEFORE UPDATE ON public.usuarios`.
- **Versionado en el repo:** `supabase/m5-reconciliacion-supabase-github.sql` sección 4.

---

## 3. Tablas B4/B7/B8 con RLS activo y cero policies (por diseño)

Las siguientes 8 tablas tienen `row_security = true` y **cero policies**:

| Tabla | RLS | Policies | Patrón |
|---|---|---|---|
| `auditoria_operaciones` | ✅ | 0 | Acceso 100% vía RPC |
| `turnos` | ✅ | 0 | Acceso 100% vía RPC |
| `cuadres` | ✅ | 0 | Acceso 100% vía RPC |
| `responsabilidades` | ✅ | 0 | Acceso 100% vía RPC |
| `incidencias` | ✅ | 0 | Acceso 100% vía RPC |
| `conversaciones` | ✅ | 0 | Acceso 100% vía RPC |
| `participantes_conversacion` | ✅ | 0 | Acceso 100% vía RPC |
| `mensajes` | ✅ | 0 | Acceso 100% vía RPC |

Supabase marca esto como advertencia `rls_enabled_no_policy` (nivel INFO). **No es un error** — es el patrón de diseño validado: el acceso a estas tablas es 100% vía RPC `SECURITY DEFINER`, sin depender de policies directas. No se cambia nada.

---

## 4. Grants a `anon` — cero

Confirmado por consulta directa (no por inferencia de archivos):

- `anon` tiene **cero grants** en cualquier tabla de `public`.
- `anon` tiene **cero `EXECUTE`** en cualquier función de `public`.

Esto es consistente con `supabase/m3-seguridad-revoke-anon-global.sql` y con la migración `m3_revoke_anon_execute_all_functions` en el historial. No se encontró ninguna función ni tabla con grant a `anon`.

---

## 5. `b6-nucleo-operativo.sql` — DEPRECATED

El archivo `supabase/b6-nucleo-operativo.sql` fue un **borrador/diseño** de la capa operativa que **nunca se aplicó tal cual** a producción.

Diferencias verificadas:

| Elemento | En el archivo (repo) | En producción |
|---|---|---|
| `_consumir_fifo` | Definida | No existe |
| `_registrar_movimiento` | Definida | No existe |
| `_resolver_presentacion` | Definida | No existe |
| `_validar_usuario_operacion` | Definida | No existe |
| `registrar_compra/venta/transferencia/vale_salida` | Versión con helpers | Versión con lógica inline + `private.reclamar_idempotencia` |
| `crear_producto` | Usa `_validar_usuario_operacion` | Usa `private.reclamar_idempotencia` |

Producción llegó al mismo resultado funcional por un camino incremental distinto (sesión por sesión, vía migraciones con otros nombres en `schema_migrations`).

**Acción tomada:** el archivo se conserva (regla: no borrar SQL viejo) pero tiene un header `DEPRECATED` al inicio. Las versiones reales se documentarán en Misión 2/3.

---

## 6. Migraciones aplicadas sin archivo `.sql` individual

De las ~61 migraciones en `schema_migrations`, solo una fracción tiene un archivo `.sql` de igual alcance entre los del repo. El resto —parches puntuales aplicados sesión a sesión vía MCP directo a producción— no tiene representación individual.

La migración `m5-reconciliacion-supabase-github.sql` cierra esto **consolidando el estado final** de las piezas que no tenían ningún archivo de origen (esquema `private`, `tiene_permiso`, `obtener_conversion_presentacion`, `proteger_ultimo_dueno`), no migración por migración (serían ~35 archivos triviales de grants/revokes/índices/fixes de search_path que no aportan nada nuevo al repo).

---

## 7. Archivos SQL del repo — índice

| Archivo | Estado | Descripción |
|---|---|---|
| `b3-roles-permisos.sql` | Histórico | Roles, permisos, usuarios (B3) |
| `b4-auditoria-trazabilidad.sql` | Histórico | Auditoría y trazabilidad (B4) |
| `b4-b8-production-hardening.sql` | Histórico | Hardening producción B4-B8 |
| `b5-reportes.sql` | Histórico | Reportes y análisis (B5) |
| `b6-nucleo-operativo.sql` | ⚠️ DEPRECATED | Borrador no aplicado tal cual |
| `b7-operacion-humana.sql` | Histórico | Turnos, cuadres, incidencias (B7) |
| `b8-comunicacion.sql` | Histórico | Comunicación, conversaciones (B8) |
| `m3-productos-editar-estado.sql` | Vigente | Crear/editar/activar producto con idempotencia |
| `m3-seguridad-revoke-anon-global.sql` | Vigente | Revocar grants a anon |
| `m4-auditoria-integridad-hardening.sql` | Vigente | Auditoría, integridad, hardening |
| `m5-reconciliacion-supabase-github.sql` | Vigente | **Reconciliación** — esquema private + funciones fundacionales |
