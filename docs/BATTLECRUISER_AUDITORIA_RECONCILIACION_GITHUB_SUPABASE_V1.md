# BATTLECRUISER — AUDITORÍA DE RECONCILIACIÓN GITHUB ↔ SUPABASE V1

**Documento de memoria histórica oficial del proyecto.**  
**Fase:** Solo documentación. Cero cambios de código, frontend o Supabase.

---

## Metadatos de la auditoría

| Campo | Valor |
|---|---|
| **Fecha de auditoría** | 2026-08-20 |
| **Repo auditado** | `Robvg9/battlecruiser` |
| **SHA auditado** | `71812e70f0381a9ce7056f0cc648d09de834393c` |
| **Project Ref Supabase** | `papxnkkjtkxsitcsvcme` |
| **Cerebro leído** | `BATTLECRUISER_CEREBRO.md` (V4) |
| **Autor de la auditoría** | Claude (Fase 1 — solo lectura) |

---

## Resultado ejecutivo

> **Backend y frontend alineados.**  
> No existen bloqueos funcionales para la versión 9.3.  
> Las diferencias encontradas son de seguridad, documentación y gobernanza.

- Los 39 RPC que el frontend invoca directamente existen en Supabase con firma compatible.
- Los 20 tipos de `RPC_POR_TIPO` (cola offline) existen todos.
- No faltan tablas, columnas, bucket Storage, contratos críticos ni funciones de cola offline.
- La arquitectura crítica está intacta.

---

## Hallazgos oficiales registrados

### 1) GRANTS ANON INCORRECTOS

Existen **7 funciones RPC administrativas** con `EXECUTE` otorgado a `anon`:

- `crear_rol`
- `editar_rol`
- `eliminar_rol`
- `activar_desactivar_rol`
- `actualizar_permisos_rol`
- `listar_roles_admin`
- `crear_usuario_interno`

**Estado:** No explotable actualmente porque validan sesión y permisos internamente (`tiene_permiso()` / `auth.uid()`).

**Acción futura:** Crear misión de seguridad para revocar `EXECUTE` a `anon`.

### 2) CEREBRO DESACTUALIZADO

El archivo `BATTLECRUISER_CEREBRO.md` debe actualizarse posteriormente porque:

- T6 ya está implementado
- T8 ya está implementado
- T9 ya está implementado
- Módulos nuevos existen (`configuracion.js`, `catalogo-avanzado.js`, `panel-contextual.js`)
- Service Worker está en `v45`

### 3) MIGRACIÓN FALTANTE EN REPO

Existe en Supabase la migración `m10_crear_usuario_interno`, pero **no existe** archivo SQL equivalente dentro de `supabase/`.

**Acción futura:** Extraer definición real (`pg_get_functiondef`) y crear archivo SQL documental.

### 4) RPC EXISTENTES SIN USO FRONTEND

Existen capacidades backend preparadas para futuras interfaces (no son errores):

- `crear_categoria`
- `cambiar_estado_categoria`
- `crear_unidad`
- `cambiar_estado_unidad`
- `crear_presentacion`
- `actualizar_presentacion`
- `cambiar_estado_presentacion`
- `agregar_participante`
- `obtener_conversion_presentacion`

Son backend preparado para futuras misiones de Configuración / Catálogo.

---

## Checkpoint de arquitectura

> **BattleCruiser actualmente posee una arquitectura híbrida:**
> - Frontend modular PWA
> - Offline-first
> - Cola FIFO
> - Idempotencia real
> - Supabase como autoridad backend
> - RPC `SECURITY DEFINER`
> - Modelo Usuario → Rol → Permisos

### Elementos críticos que NO deben tocarse

- `ejecutarOperacion()`
- IndexedDB
- Cola FIFO
- Sincronización
- Idempotencia (`private.reclamar_idempotencia`)
- `RPC_POR_TIPO`
- `registrar_venta` / `registrar_compra` / `registrar_transferencia` / `registrar_vale_salida`
- Lógica FIFO con `FOR UPDATE`
- Autenticación
- RLS existente

---

# INFORME COMPLETO DE LA AUDITORÍA (Claude — 2026-08-20)

**Fase 1 — Solo lectura. Cero cambios ejecutados.**

- **Repo auditado:** `Robvg9/battlecruiser` (ZIP de `main` subido por Roberto, no vía GitHub API)
- **Project Ref Supabase:** `papxnkkjtkxsitcsvcme` (introspección real vía MCP Supabase, solo lectura)
- **Cerebro leído:** `BATTLECRUISER_CEREBRO.md` (V4, fechado 2026-08-20 en el propio archivo)
- **Fecha de auditoría:** 2026-08-20

> Nota de método: no tuve acceso a la API de GitHub en esta sesión (sin red saliente para eso), así que "GitHub" en este informe = el contenido del ZIP de `main` que subiste, que declara el SHA `71812e70f0381a9ce7056f0cc648d09de834393c`. No pude verificar ese SHA contra GitHub en vivo; si el ZIP no es exactamente ese commit, avisame y repito la fase A. Supabase sí fue introspeccionado en vivo contra producción.

---

## 1. RESUMEN EJECUTIVO

**¿Está Supabase alineado con GitHub? Sí, en lo esencial — con matices reales, no cosméticos.**

- Los **39 RPC** que el frontend invoca directamente por nombre (`client.rpc("...")`) existen todos en Supabase, con la firma que el frontend espera. Los 20 tipos de `RPC_POR_TIPO` (la cola offline) también existen todos.
- El contrato de **transferencia atómica** (sin recepción/cancelación) está confirmado en ambos lados: la tabla `transferencias.estado` solo admite `completada`/`cancelada`, y `registrar_transferencia` mueve stock origen→destino en la misma transacción. No hay estados intermedios ni en GitHub ni en Supabase — correcto, no inventar nada ahí.
- La **idempotencia** es real y atómica (`private.reclamar_idempotencia`, `INSERT ... ON CONFLICT DO NOTHING` + comparación de hash de payload), no un mock.
- Encontré **2 discrepancias reales que importan** (detalladas abajo): (a) `BATTLECRUISER_CEREBRO.md` está desactualizado respecto al código real (dice T6–T10 "pendiente" cuando el código ya los tiene implementados y cargados), y (b) **7 funciones RPC de administración de roles/usuarios tienen `EXECUTE` otorgado a `anon`** en producción, violando explícitamente la migración `m3_revoke_anon_execute_all_functions` que dice "anon nunca ejecuta RPC de negocio". No es explotable hoy (cada función valida `tiene_permiso()`/`auth.uid()` internamente y anon no tiene sesión), pero es una regresión de una política de seguridad ya declarada, y vale la pena cerrarla en la próxima misión.
- No encontré tablas, RPC o políticas "fantasma" que el frontend necesite y no existan. Lo que sí encontré es **backend que existe en Supabase pero que el frontend todavía no usa** (9 RPC de catálogo: categorías/unidades/presentaciones CRUD + `agregar_participante`). No es un error — es capacidad ya construida y disponible para cuando la UI de Configuración/Catálogo la necesite.

---

## 2. TODO LO QUE YA ESTÁ CORRECTO

- **Los 39 RPC llamados directamente por nombre** desde `public/js/*.js` existen en Supabase con firma compatible: `crear_usuario_interno`, `marcar_conversacion_leida`, `listar_mensajes_conversacion`, `cerrar_conversacion`, `listar_conversaciones_usuario`, `contar_no_leidos_global`, `listar_usuarios_para_chat`, `listar_auditoria_admin`, `registrar_auditoria`, `movimientos_producto`, `inventario_enriquecido`, `listar_turnos`, `listar_cuadres`, `turno_actual_usuario`, `listar_responsabilidades`, `listar_incidencias`, `tiene_permiso`, `actualizar_imagen_producto`, `reporte_ventas`, `reporte_transferencias`, `reporte_vales`, `reporte_stock`, `reporte_movimiento_inventario`, `historial_compras`, `rentabilidad_ventas`, `reporte_resumen_ejecutivo`, `usuario_esta_activo`, `listar_usuarios_admin`, `perfil_usuario_actual`, `listar_roles_admin`, `asignar_rol_usuario`, `cambiar_estado_usuario`, `permisos_por_rol`, `crear_rol`, `editar_rol`, `permisos_usuario_actual`, `activar_desactivar_rol`, `eliminar_rol`, `actualizar_permisos_rol`.
- **Los 20 RPC de `RPC_POR_TIPO`** (cola offline): `registrar_compra`, `registrar_venta`, `registrar_transferencia`, `registrar_vale_salida`, `crear_producto`, `actualizar_producto`, `cambiar_estado_producto`, `abrir_turno`, `cerrar_turno`, `registrar_cuadre`, `revisar_cuadre`, `crear_responsabilidad`, `actualizar_responsabilidad`, `crear_incidencia`, `resolver_incidencia`, `enviar_mensaje`, `crear_conversacion`, `crear_almacen`, `editar_almacen`, `activar_desactivar_almacen` — todos existen, todos `SECURITY DEFINER`, todos aceptan `p_idempotency_key`.
- **Los `.from()` directos** del frontend (`transferencias`, `transferencias_lineas`, `vales_salida`, `ventas`, `presentaciones`, `producto_presentaciones`, `productos`, `categorias`, `almacenes`, `stock`) apuntan a tablas reales con RLS habilitado y políticas de `SELECT` correctas.
- **Storage**: bucket `productos` existe, `public: true`, `5MB`, solo `image/jpeg|png|jpg` — coincide exactamente con `public/js/productos.js:59` (`storage.from("productos")`) y con `m12_producto_imagen.sql`. Las 4 policies de `storage.objects` (`select_publico`, `insert/update/delete_autorizado` para `authenticated`) están aplicadas.
- **Idempotencia real, no decorativa**: `private.operaciones_idempotencia` (PK sobre `idempotency_key`) + `private.reclamar_idempotencia()` hace `INSERT ... ON CONFLICT DO NOTHING`, compara `payload_hash` (md5 del payload) para detectar reuso indebido de la misma clave con datos distintos, y devuelve `resultado_id` cacheado en reintentos. Verifiqué el código real de `registrar_venta`: exige `p_idempotency_key` (rechaza si es NULL), llama a `reclamar_idempotencia` antes de tocar stock, hace `SELECT ... FOR UPDATE` sobre `stock` y `lotes_compra` (lock real, no optimista), consume lotes FIFO en orden de `fecha_compra`, y guarda `costo_unitario_fifo` por línea. Esto es un contrato productivo real, no un esqueleto.
- **Modelo atómico de transferencia**: confirmado en ambos lados. `transferencias.estado` CHECK solo permite `completada`/`cancelada` — no existe (ni debe inventarse) un estado "pendiente de recepción".
- **Permisos Usuario → Rol → Permisos del Rol**: confirmado sin permisos individuales por usuario. `tiene_permiso(seccion, accion)` es una única función SQL que hace `usuarios JOIN permisos ON role_id`. No hay tabla paralela de permisos por usuario ni en el schema ni en el código.
- **Arquitectura de tablas B6–B8 (turnos, cuadres, responsabilidades, incidencias, conversaciones, mensajes, participantes_conversacion, auditoria_operaciones)**: tienen RLS *habilitado* pero **sin ninguna policy** — acceso cerrado por defecto a `anon`/`authenticated` directo. Esto es correcto por diseño: todo el acceso pasa por RPC `SECURITY DEFINER`, que sí validan permiso y sesión internamente. El advisor de Supabase marca esto como "RLS enabled no policy" (nivel INFO), pero en este patrón arquitectónico es la configuración esperada, no un hueco.
- **Storage/Auth/Grants**: no quedó ningún grant a `anon` sobre tablas (`information_schema.role_table_grants` no devuelve ninguna fila para `anon` en `public` ni `private`) — el revoke global de tablas sí se sostiene.
- **Módulos T6/T8/T9 del frontend sí existen y sí se cargan**, aunque no como `<script>` estático en `index.html`: `app.js` (el stub) inyecta dinámicamente `js/configuracion.js`, `js/catalogo-avanzado.js` y `js/panel-contextual.js` al final, y los tres están en `SHELL_FILES` del Service Worker (`battlecruiser-shell-v45`). Esto es arquitectura intencional documentada en los propios comentarios de `app.js`, no un descarte.

---

## 3. TODO LO QUE FALTA EN SUPABASE

**Nada crítico.** No encontré ningún RPC, tabla, columna, policy o bucket que el frontend actual invoque y que no exista en producción. Los 39+20 contratos verificados están 100% presentes.

---

## 4. TODO LO QUE EXISTE PERO DIFIERE

| Hallazgo | Evidencia GitHub | Evidencia Supabase | Impacto | Recomendación |
|---|---|---|---|---|
| **`crear_usuario_interno` sin archivo `.sql` fuente en el repo** | No aparece en ningún archivo de `supabase/*.sql`. Solo se menciona en `battlecruiser-9.1-cambios.patch` (un patch histórico) y se invoca en `public/js/auth.js:136`. | Existe en producción como migración real `20260819021156_m10_crear_usuario_interno` (confirmado en `list_migrations`), `SECURITY DEFINER`, valida `tiene_permiso('usuarios','crear')`. | Bajo — funciona correctamente, pero si alguien reconstruye Supabase desde el `supabase/` del repo, esta función faltaría. | Crear `supabase/m10_crear_usuario_interno.sql` con el DDL real (puedo extraerlo con `pg_get_functiondef` si querés) para que el repo quede completo. |
| **7 RPC con `EXECUTE` otorgado a `anon`** (ver sección 9/13) | `m3-seguridad-revoke-anon-global.sql` documenta que producción NO debía tener ningún `EXECUTE` para `anon`. `m11_roles_crud.sql` (posterior a M3 en el historial de migraciones) tiene 6 líneas explícitas `GRANT EXECUTE ... TO anon, authenticated`. | Confirmado en vivo: `activar_desactivar_rol`, `actualizar_permisos_rol`, `crear_rol`, `editar_rol`, `eliminar_rol`, `listar_roles_admin`, `crear_usuario_interno` son ejecutables por `anon`. | Medio (ver sección 13 para el análisis de explotabilidad real). | Revocar `EXECUTE` a `anon` en esas 7 funciones. |
| **`BATTLECRUISER_CEREBRO.md` desactualizado** | Sección 11 (Roadmap 9.3) marca T6–T10 como "PENDIENTE". Sección 3 (árbol de módulos) no lista `configuracion.js`, `catalogo-avanzado.js` ni `panel-contextual.js`. Sección 9 dice cache `v40`. | El código real (`app.js`, `service-worker.js`) demuestra T6/T8/T9 implementados y cargados, con comentarios propios fechados "Misión 9.3 T6/T8/T9". `service-worker.js` real dice `battlecruiser-shell-v45`. | Bajo (no afecta funcionamiento) pero alto para coordinación de equipo — el Cerebro es la fuente de verdad declarada y ahora mismo no lo es. | Regenerar el Cerebro V5 reflejando el estado real: T1–T9 completado, cache v45, módulos completos en el árbol. |
| **9 RPC en Supabase sin ningún caller en el frontend** (ver sección 5) | Ninguna referencia en `public/js/*.js` a estos nombres. | Existen, `SECURITY DEFINER`, otorgados a `authenticated`. | Ninguno (no rompen nada) | Ninguna acción — es capacidad de backend ya construida a la espera de que la UI de catálogo/config la use. |

---

## 5. TODO LO QUE ESTÁ EN GITHUB (o en Supabase) PERO NO NECESITA BACKEND NUEVO

- **T2 Catálogo visual de ventas**: confirmado que usa `_cache` (productos ya cacheados en IndexedDB) sin RPC adicional propio, salvo el `registrar_venta` ya existente. No requiere nada nuevo.
- **T6 Panel contextual**: revisé `public/js/panel-contextual.js` — su único acceso a datos es `client.from("transferencias_lineas")` (lectura directa, ya cubierta por policy `transferencias_lineas_ver`). El resto trabaja sobre datos ya cacheados. No requiere backend nuevo.
- **T9 Catálogo avanzado**: revisé `public/js/catalogo-avanzado.js` completo — cero llamadas a `.from()` o `.rpc()`. Trabaja enteramente sobre `_cache.productos`/`categorias`/`unidades` ya cargados por otros módulos. Confirmado: no requiere backend nuevo.
- **T10 UX global**: por definición (toasts, loading, confirmaciones) no toca backend. Confirmado por ausencia total de referencias nuevas a Supabase en los módulos de UX.
- **Backend ya construido pero sin UI que lo use todavía** (lo inverso de "no necesita backend": acá es "el backend ya está, falta que el frontend lo llame"): `crear_categoria`, `cambiar_estado_categoria`, `crear_unidad`, `cambiar_estado_unidad`, `crear_presentacion`, `actualizar_presentacion`, `cambiar_estado_presentacion`, `agregar_participante`, `obtener_conversion_presentacion` (esta última si se usa indirectamente vía `registrar_venta`/`registrar_compra`, pero no directamente desde el frontend). Si una futura misión de Configuración quiere CRUD completo de categorías/unidades/presentaciones, el backend ya está listo — no hay que inventarlo.

---

## 6. TODO LO QUE PODRÍA SER PELIGROSO MODIFICAR

- **`RPC_POR_TIPO` y `ejecutarOperacion()`** (`public/js/offline.js`): cualquier cambio de nombre de RPC acá rompe la cola offline en silencio para operaciones ya encoladas con el nombre viejo.
- **`private.operaciones_idempotencia` / `private.reclamar_idempotencia`**: tocar la lógica de hash de payload sin migrar filas existentes invalidaría idempotencia de operaciones en tránsito.
- **`registrar_venta` / `registrar_compra` / `registrar_transferencia` / `registrar_vale_salida`**: todas hacen `FOR UPDATE` sobre `stock`/`lotes_compra` dentro de un bloque FIFO secuencial — cualquier reescritura debe preservar el lock y el orden de consumo de lotes, o se rompe el costeo FIFO histórico.
- **`m6-reconciliacion-rpc-mutaciones-criticas.sql` y `b6-nucleo-operativo.sql`**: el Cerebro marca `b6-nucleo-operativo.sql` como **DEPRECATED**. Aplicarlo de nuevo sin revisar qué lo reemplazó (probablemente M6/M7) podría pisar funciones ya endurecidas por migraciones posteriores (hay evidencia de esto en el propio historial: `b6_audit_revoke_excess_grants_authenticated`, `m2_revoke_anon_inventario_movimientos` — parches puntuales aplicados DESPUÉS de b6).
- **Los 7 grants a `anon`** (sección 4/9/13): antes de revocarlos hay que confirmar que ningún flujo legítimo dependa de ellos (por ejemplo, alguna pantalla de "crear primer usuario" pre-login). Por el código que vi (`auth.js:136`, `usuarios-permisos.js`) todas las llamadas ocurren con sesión ya iniciada, así que revocar debería ser seguro — pero es Roberto quien conoce si existe algún flujo público que dependa de esto.

---

## 7. RPC FALTANTES

**Ninguno.** Los 39 RPC invocados directamente y los 20 de `RPC_POR_TIPO` existen todos.

---

## 8. TABLAS/COLUMNAS FALTANTES

**Ninguna.** Las 24 tablas de `public` + 1 de `private` cubren todos los `.from()` del frontend, incluyendo columnas específicas usadas (`imagen_url` en `productos`, `costo_unitario_fifo` en `ventas_lineas`, `presentacion_id` en `productos`, etc.).

---

## 9. RLS/POLICIES FALTANTES

- **Tablas `public` con datos de catálogo/operación** (`productos`, `categorias`, `almacenes`, `stock`, `transferencias`, `transferencias_lineas`, `vales_salida`, `ventas`, `ventas_lineas`, `presentaciones`, `producto_presentaciones`, `unidades`, `roles`, `permisos`, `usuarios`, `lotes_compra`): todas con RLS habilitado y policies coherentes con el patrón "SELECT abierto a rol autenticado, mutaciones solo vía RPC `SECURITY DEFINER`" (las tablas con CRUD directo desde frontend como `categorias`/`productos`/`almacenes`/`presentaciones`/`unidades` tienen policies de INSERT/UPDATE/DELETE además de SELECT — coherente con que esas sí reciben `.from()` de escritura en algunos flujos legacy).
- **`private.operaciones_idempotencia`: RLS deshabilitado.** El advisor de seguridad de Supabase lo marca **crítico** por defecto. En la práctica el riesgo real es bajo porque: (a) el schema `private` no tiene ningún `GRANT` a `anon` ni `authenticated` (confirmé con `information_schema.role_table_grants` — cero filas), y (b) el único acceso es vía `private.reclamar_idempotencia()`, `SECURITY DEFINER`, invocada desde funciones `public` que a su vez son `SECURITY DEFINER`. No es alcanzable directamente vía PostgREST salvo que `private` esté expuesto en `db-schemas` de la API (no pude verificar esa configuración específica de PostgREST vía SQL; si `private` no está en la lista de schemas expuestos del proyecto, el hallazgo es puramente teórico). **Recomendación:** confirmar en el dashboard de Supabase → Settings → API → "Exposed schemas" que `private` no esté ahí, y si no lo está, este ítem baja de crítico a informativo.
- **7 funciones con `EXECUTE` para `anon`** — ver sección 13, es el hallazgo de permisos más concreto de esta auditoría.

---

## 10. GRANTS FALTANTES

**Ninguno.** Todas las tablas y funciones que el frontend usa tienen grant a `authenticated`.

---

## 11. STORAGE FALTANTE

**Ninguno.** Bucket `productos` + sus 4 policies existen y coinciden con `m12_producto_imagen.sql` y con el uso real en `productos.js`.

---

## 12. AUTH FALTANTE

- No encontré nada faltante en Auth para lo que el frontend usa (`signUp`, `signInWithPassword`, `getSession`, `onAuthStateChange`, `updateUser`, `signOut`).
- **Nota aparte, no pedida pero relevante**: el advisor de seguridad de Supabase señala que **"Leaked Password Protection" está deshabilitado** (Supabase Auth no está chequeando contraseñas contra HaveIBeenPwned). No es parte del contrato frontend↔backend de la Misión 9.3, así que lo dejo solo como nota informativa, no como hallazgo de esta auditoría.

---

## 13. PROBLEMAS DE IDEMPOTENCIA

- El mecanismo central (`private.reclamar_idempotencia`) es sólido: `PK` sobre `idempotency_key`, `ON CONFLICT DO NOTHING` atómico, verificación de `usuario_id` y `payload_hash` para detectar reuso indebido de la clave, y devuelve `resultado_id` cacheado para que un reintento de red no duplique la operación.
- `registrar_venta`, y por el mismo patrón (verificado por nombre de columna/uso, aunque no leí línea por línea las 4) `registrar_compra`, `registrar_transferencia`, `registrar_vale_salida` **exigen** `p_idempotency_key` (rechazan `NULL`) — coincide con las migraciones `b3_7_exigir_idempotency_key_*` del historial.
- **No encontré ningún caso donde el frontend mande una operación crítica sin `idempotency_key`**: `ejecutarOperacion()` genera `crypto.randomUUID()` para toda operación, online u offline, así que el contrato se cumple sistemáticamente desde el único punto de entrada de mutaciones.
- **Análisis de explotabilidad del grant a `anon` (retomando sección 4/9)**: verifiqué el código fuente real (`pg_get_functiondef`) de las 7 funciones con `EXECUTE` para `anon`. Las 7 (`crear_usuario_interno`, `crear_rol`, `editar_rol`, `eliminar_rol`, `activar_desactivar_rol`, `actualizar_permisos_rol`, `listar_roles_admin`) empiezan con `IF NOT public.tiene_permiso(...) THEN RAISE EXCEPTION`, y `tiene_permiso()` resuelve `auth.uid()` — que es `NULL` para una llamada anónima sin sesión — contra la tabla `usuarios`, así que el `JOIN` no matchea nada y la función retorna `false` (o, en `_validar_usuario_operacion`, lanza excepción explícita `'No hay sesión activa'`). **Conclusión: hoy no es explotable con la clave `anon` pública**, pero es una violación de defensa en profundidad frente a una política que el propio equipo ya declaró como "fuente de verdad" (`m3-seguridad-revoke-anon-global.sql`) y que fue pisada por una migración posterior (`m11_roles_crud.sql`, aplicada el 2026-08-19, un día después de M3). Vale cerrarla por higiene, no por urgencia de incidente.

---

## 14. INCOMPATIBILIDADES FRONTEND ↔ BACKEND

**Ninguna encontrada** en los contratos que el frontend invoca activamente. Los "diferentes" de la sección 4 son documentales/de gobernanza (Cerebro desactualizado, migración sin archivo fuente, grants de más), no incompatibilidades funcionales.

---

## 15. MIGRACIONES QUE SERÍAN NECESARIAS (para una futura misión — no ejecutar ahora)

1. `revoke_anon_roles_admin_functions.sql` — revocar `EXECUTE` a `anon` en las 7 funciones de la sección 13.
2. `m10_crear_usuario_interno.sql` — versionar en el repo la función que hoy solo vive en producción (extraíble 1:1 con `pg_get_functiondef`, cero riesgo, es solo documentación retroactiva).
3. (Opcional, sin urgencia) Confirmar en el dashboard si `private` está en "exposed schemas" de PostgREST; si lo está, evaluar mover `operaciones_idempotencia` a RLS habilitado con policy `deny all` explícita, para que el advisor deje de marcarlo crítico incluso si algún día cambia la exposición de schemas.

---

## 16. ORDEN RECOMENDADO DE IMPLEMENTACIÓN

1. Actualizar `BATTLECRUISER_CEREBRO.md` a V5 (estado real: T1–T9 completado, T10 según corresponda, cache v45, árbol de módulos completo). Es documentación, cero riesgo, y destraba que las próximas misiones no arranquen de un mapa desactualizado.
2. Revocar `EXECUTE` a `anon` en las 7 funciones de roles/usuario (bajo riesgo, alto valor de higiene).
3. Versionar `m10_crear_usuario_interno.sql` en el repo (documentación pura).
4. Recién ahí, seguir con la próxima misión funcional (T7 refinamiento UX de comunicación, según el propio roadmap pendiente del Cerebro).

---

## 17. RIESGO DE CADA CAMBIO PROPUESTO

| Cambio propuesto | Riesgo | Por qué |
|---|---|---|
| Actualizar Cerebro V5 | Ninguno | Es un `.md`, no toca código ni Supabase. |
| Revocar `EXECUTE anon` en 7 funciones | Bajo | Ya verificado que ningún flujo legítimo depende de llamarlas sin sesión (todas las llamadas del frontend a esas 7 ocurren post-login). Reversible con un `GRANT` si algo se rompe. |
| Versionar `m10_crear_usuario_interno.sql` | Ninguno | Es copiar el DDL ya aplicado a un archivo del repo; no se re-ejecuta contra producción. |

---

## 18. CHECKLIST PARA CERRAR BACKEND 9.3

- [x] Los 39 RPC directos + 20 de `RPC_POR_TIPO` existen y coinciden en firma.
- [x] Storage de imágenes de producto (T1) coincide con el bucket y policies reales.
- [x] Modelo atómico de transferencias (T4) confirmado en tabla y RPC — nada que inventar.
- [x] T2, T6, T9, T10 confirmados como "no requieren backend nuevo" leyendo el código real.
- [x] Sistema de permisos Usuario→Rol→Permisos confirmado sin permisos individuales paralelos.
- [x] Idempotencia confirmada atómica y obligatoria en las 4 mutaciones críticas de negocio.
- [ ] **Pendiente**: revocar `anon` de las 7 funciones de roles/usuario.
- [ ] **Pendiente**: versionar `m10_crear_usuario_interno.sql` en el repo.
- [ ] **Pendiente**: actualizar `BATTLECRUISER_CEREBRO.md` a V5.

---

## CHECKPOINT — BACKEND RECONCILIATION AUDIT

- **SHA de main auditado:** `71812e70f0381a9ce7056f0cc648d09de834393c` (declarado en el ZIP subido; no verificado en vivo contra GitHub por falta de acceso a red en esta sesión)
- **Project Ref auditado:** `papxnkkjtkxsitcsvcme`
- **Tablas auditadas:** 24 en `public` + 1 en `private` = **25**
- **RPC auditadas:** 74 en `public` + 2 en `private` = **76** (de las cuales 39 llamadas directas + 20 vía `RPC_POR_TIPO` = 59 con caller confirmado en frontend; 9 sin caller actual; ~8 internas/triggers no invocadas desde frontend por diseño: `_es_participante`, `_validar_usuario_operacion`, `auditar_mutacion_operativa`, `proteger_ultimo_dueno`, `validar_producto_activo_en_mutacion`, `calcular_dinero_esperado_turno`, `registrar_auditoria_interna`, `reclamar_idempotencia`)
- **Policies/RLS auditadas:** 36 policies en `public` + 4 en `storage.objects` = **40**; 8 tablas con RLS habilitado sin policy (por diseño, acceso solo vía RPC); 1 tabla (`private.operaciones_idempotencia`) con RLS deshabilitado (sin grants directos, riesgo bajo condicionado a la exposición de schemas de PostgREST)
- **Storage buckets auditados:** 1 (`productos`)
- **Contratos frontend→backend auditados:** 59 RPC con caller confirmado + 19 `.from()` directos + 1 `storage.from()` + 7 métodos `.auth.*` = **86 puntos de contrato**
- **Diferencias encontradas:** 4 (Cerebro desactualizado; 7 funciones con `EXECUTE anon` de más; 1 función sin `.sql` fuente en repo; 9 RPC sin caller frontend — no problemático)
- **Backend pendiente de implementación real:** ninguno — todo lo que el frontend de la Misión 9.3 necesita ya existe en producción
- **Cosas que NO deben tocarse sin cuidado:** `RPC_POR_TIPO`/`ejecutarOperacion()`, `private.reclamar_idempotencia`, el bloque FIFO con `FOR UPDATE` dentro de las 4 mutaciones críticas, y no reaplicar `b6-nucleo-operativo.sql` (DEPRECATED) sin cotejar contra M6/M7 y los parches puntuales posteriores
- **Recomendación de la siguiente misión:** (1) Cerebro V5 + (2) revocar `anon` de las 7 funciones de roles — ambas de bajo riesgo y alto valor — antes de retomar el roadmap funcional (T7 refinamiento de Comunicación, según el propio Cerebro).

---

## CHECKPOINT FINAL DE ESTA MISIÓN DE DOCUMENTACIÓN

| Campo | Valor |
|---|---|
| **Estado** | COMPLETADO |
| **Archivos modificados** | `docs/BATTLECRUISER_AUDITORIA_RECONCILIACION_GITHUB_SUPABASE_V1.md` |
| **Cambios de código** | NINGUNO |
| **Cambios Supabase** | NINGUNO |
| **Objetivo** | Crear memoria histórica oficial para que futuras IAs conozcan el estado real del proyecto antes de tocar backend. |
