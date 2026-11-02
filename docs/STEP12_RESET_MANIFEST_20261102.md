# Paso 12/15 — Manifiesto de reset y límites — 2026-11-02

## Estado
Preparación para ensayo destructivo aislado. Este documento NO autoriza el reset LIVE del Paso 13.

## Proyecto y corte de referencia
- Supabase correcto: `battlecruiser`, ref `papxnkkjtkxsitcsvcme`, organización `slytrsaxmsqmqwakkhfl`, región `us-east-1`, PostgreSQL `17.6.1.155`.
- Corte de lectura: `2026-11-02T20:20:24Z`.
- Esquema público: **61 tablas**, todas con RLS activo; **60 policies** públicas.
- Catálogo de esquema: 207 funciones públicas, 31 triggers no internos, 1 vista pública, 103 CHECK, 171 FK, 61 PK y 32 UNIQUE.
- Historial de migraciones `supabase_migrations.schema_migrations`: **272 versiones**. El repositorio `main` tiene **70 archivos SQL** en `supabase/migrations`; por tanto, no se debe reconstruir el historial a partir del directorio actual. El ensayo exporta y restaura la tabla completa de historial, incluidos `statements`, `rollback`, `name`, `version` y metadatos, y verifica su huella y versiones.
- Supabase-managed migration ledgers que deben permanecer intactos: `auth.schema_migrations` 82; `storage.migrations` 74.
- Auth: 10 users, 10 identities, 1 session y 19 refresh tokens en el corte.
- Storage: bucket público `productos`; 3 objetos; 3,927,366 bytes.
- Funciones Edge LIVE: `bc-username-login` v4 (JWT verificado por su lógica; `verify_jwt=false` en plataforma), y `crear-usuario-sin-email` v2 (`verify_jwt=true`). No se cambia su versión durante este paso.

## Manifiesto propuesto

### Se eliminan en el reset, solo tras backup verificado y Human Gate
- Las **58 tablas operativas/de negocio** enumeradas en `config/bc-step12-reset-scope.json`: usuarios/perfiles, productos/categorías/unidades/presentaciones, almacenes, stock, compras/lotes, ventas/líneas, transferencias, jornadas/sesiones/tramos/asignaciones, inventario, caja, conversaciones/mensajes, incidencias y demás datos operativos.
- Cuentas anteriores de `auth.users`, por medio de Auth Admin API; las identidades/sesiones/tokens dependientes deben quedar eliminados por Auth. Antes se vacían las tablas públicas con FK `RESTRICT` a Auth. No se borra Auth por SQL directo.
- Todos los objetos binarios de Storage, por Storage API, incluido su contenido físico y metadatos. El bucket `productos` permanece configurado y vacío.

### Se conservan
- `public.roles` (3 filas) y `public.permisos` (265 filas): base RBAC necesaria para el primer propietario.
- `public.auditoria_operaciones` (482 filas al corte): registro histórico auditable. El reset añade un evento propio; el archivo cifrado conserva además el estado previo.
- Todo el esquema: tablas, columnas, tipos, constraints, índices, vistas, secuencias, funciones, triggers, grants, RLS y policies.
- Extensiones Postgres y configuración del proyecto.
- `supabase_migrations.schema_migrations` y su historial íntegro (272); además los ledgers internos de Auth/Storage.
- El bucket `productos`, sus reglas/policies y configuración. No se conservan los objetos binarios de los productos anteriores.
- Edge Functions, configuración y secretos externos. Los valores de secretos nunca se exportan ni se escriben en artefactos; la recuperación depende de que sigan presentes en sus gestores de secretos.

## Dependencias y seguridad observadas
- Varias tablas de jornada y eventos tienen FKs `ON DELETE RESTRICT` hacia `auth.users`. El orden obligatorio es: bloqueo/maintenance → vaciar tablas de negocio → eliminar usuarios por Auth Admin → limpiar Storage → reconciliar conteos → registrar auditoría.
- `public.usuarios` es dependiente de `auth.users`; borrar el perfil no elimina Auth por sí solo.
- La operación de Storage es externa a la transacción Postgres. Si falla, la misión no puede declarar reset completo; se requiere reintento idempotente o restaurar los objetos desde el backup verificado.
- El bloqueo advisory serializa reset attempts; el `TRUNCATE` adquiere locks exclusivos y debe usar `lock_timeout` fail-closed. El sistema debe permanecer en maintenance hasta finalizar Auth, Storage y auditoría.
- No se debe eliminar ni truncar `roles`, `permisos`, `auditoria_operaciones`, `supabase_migrations`, `auth.schema_migrations` o `storage.migrations`.

## Bootstrap de primer propietario
El login y la creación normal de usuarios no equivalen a un bootstrap inicial: `crear-usuario-sin-email` requiere una sesión previa con permiso `usuarios/crear`. El ensayo Step 12 verifica una máquina de estados aislada con:
- token de bootstrap comparado fuera del cliente; intentos persistentes máximos = 5;
- reserva serializada por idempotency key;
- creación de Auth seguida de inserción del perfil en una transacción SQL;
- compensación (eliminar Auth) si falla el perfil;
- estado `consumed/complete` de un solo uso; reintento con misma key idempotente, key distinta rechazada.
La comprobación de este modelo no se presenta como despliegue LIVE del endpoint. La integración de PWA/Edge Function se verificará en el Paso 14, antes de usarlo tras el reset.

## Condiciones de cierre
1. Backup nuevo cifrado AES-256; checksum y reapertura verificados.
2. Restore aislado completo: conteos, políticas, RLS, RPC, extensión, Storage y 272 migration entries coinciden.
3. Ensayo usa fixtures sintéticos; prueba permisos, concurrencia, rollback, auditoría, idempotencia y bootstrap.
4. Reporte sanitizado persistido junto al backup cifrado; entorno temporal detenido y datos de trabajo sin cifrar eliminados.
5. El reset LIVE sigue bloqueado. El Paso 13 exige la frase exacta del propietario: `CONFIRMO REINICIAR BATTLECRUISER PRODUCCIÓN`.

