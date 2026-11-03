# BattleCruiser — Paso 12: reset aislado y bootstrap del primer administrador

Fecha de ensayo: 2026-11-02 UTC  
Proyecto Supabase observado: `papxnkkjtkxsitcsvcme`  
Rama de trabajo: `aria/sandbox/step12-reset-bootstrap-20261102`  
Base de código de partida: `main` en `61b597b076bf970275ba04eae15bd0b468746927`

## Alcance y seguridad

Este trabajo prepara y prueba el reset final **solo en una copia local desechable**. La migración de este documento no se ha aplicado a Supabase LIVE. No se ejecutó un reset en producción, no se desplegó el endpoint de bootstrap y no se cambió `main`.

El workflow tiene guardas redundantes: exige la rama Step 12; el backup usa la URL LIVE solo para lecturas/exportación; las escrituras de restauración y ensayo solo aceptan un destino PostgreSQL loopback `127.0.0.1:54322` (o localhost equivalente); el endpoint de Auth para el administrador sintético solo acepta la API local `127.0.0.1:54321`. Ningún token de prueba ni contraseña se incluye en informes.

## Backup y manifiesto de partida

La captura actual exporta:

- Esquema, roles, datos de las tablas públicas y migraciones versionadas en el repositorio.
- Usuarios/identidades Auth y datos Auth gestionados que el backup lógico puede restaurar.
- Buckets/metadata de Storage y bytes de los objetos del bucket `productos`.
- RLS, políticas públicas y políticas personalizadas de Auth/Storage, firmas de funciones públicas y extensiones.
- Conteos exactos por tabla pública, conteos Auth/Storage y SHA-256 por cada archivo Storage.

El respaldo se cifra con AES-256 y se comprueba mediante descifrado de ida y vuelta, lectura de manifiesto, restauración local y comparación posterior. El contenido sin cifrar se elimina al acabar el job; el artefacto conservado contiene el backup cifrado y los informes JSON saneados.

## Manifiesto de reset candidato

Se valida contra la lista real de tablas antes de permitir el reset. Si aparece una tabla pública nueva, cambia el bucket base o existe una dependencia Auth inesperada, la operación se niega a ejecutarse.

### Datos operativos que se eliminan

Las 55 tablas de la allowlist:

`almacenes`, `asignaciones_operativas`, `auditoria_operaciones`, `bajas`, `ciclos_operativos`, `compras`, `conversaciones`, `cuadres`, `entregas_caja`, `gastos`, `incidencias`, `lotes_compra`, `mensajes`, `mermas`, `movimientos_caja`, `participantes_conversacion`, `producto_presentaciones`, `productos`, `reinversiones`, `reinversiones_lineas`, `responsabilidades`, `sesiones_ciclo`, `stock`, `transferencias`, `transferencias_lineas`, `turno_asignaciones`, `turno_declaraciones`, `turno_descuentos`, `turno_diferencias`, `turno_entregas_inventario`, `turno_eventos`, `turno_jornada_configuracion`, `turno_jornada_eventos`, `turno_jornada_inventario_cortes`, `turno_jornada_inventario_entrega_lineas`, `turno_jornada_inventario_entregas`, `turno_jornada_inventario_lineas`, `turno_jornada_inventario_recepcion_lineas`, `turno_jornada_inventario_recepciones`, `turno_jornada_patron_dias`, `turno_jornada_patrones`, `turno_jornada_programacion`, `turno_recepciones_compra`, `turno_revisiones`, `turno_sesiones`, `turno_sucesiones`, `turno_tramos`, `turnos`, `turnos_inventario_entrega_lineas`, `turnos_inventario_entregas`, `turnos_inventario_inicial`, `usuarios`, `vales_salida`, `ventas`, `ventas_lineas`.

También se eliminan `auth.users` (con sus dependencias Auth por FK) y `storage.objects`. La operación se ejecuta en una sola transacción PostgreSQL, con una tabla de operaciones/idempotencia fuera de la allowlist.

La tabla `auditoria_operaciones` se vacía junto con los datos antiguos y, dentro de la misma transacción, recibe **un único registro** que documenta el reset, su idempotency key y el manifiesto aplicado. El alta posterior del administrador registra un segundo evento de auditoría.

### Datos y estructura que se conservan

- Tablas públicas: `categorias`, `permisos`, `presentaciones`, `roles`, `turno_configuracion`, `unidades`.
- Los tres roles existentes y sus 265 permisos iniciales del corte actual.
- El bucket `productos`; se vacían los objetos, no se elimina el bucket.
- Esquemas, tablas, secuencias, índices, constraints, vistas, triggers, funciones/RPC, migraciones, extensiones, RLS y políticas.
- Configuración de proyecto y código versionado en GitHub/Cloudflare.
- Las tablas privadas `private.bc_reset_gate`, `private.bc_reset_operations` y `private.bc_bootstrap_gate`, que gobiernan autorización, idempotencia y bootstrap.

Los conteos que se conservan se comparan con el manifiesto recién respaldado, no con números hardcodeados.

## Protecciones del reset

La migración candidata `20261103014122_step12_reset_bootstrap_guard.sql`:

1. Mantiene la operación inactiva hasta que un administrador provisiona un hash de token temporal y su caducidad.
2. Acepta únicamente `service_role` o el rol administrativo local, exige una clave de solicitud UUID y la frase exacta `CONFIRMO REINICIAR BATTLECRUISER PRODUCCIÓN`.
3. Limita intentos y consume el token tras el primer reset completado.
4. Serializa ejecuciones con advisory lock y mantiene un ledger idempotente por `request_id`.
5. Comprueba esquema, RLS, bucket y dependencias antes del primer `TRUNCATE`.
6. Hace el borrado en una sola transacción. Cualquier fallo de postcondición revierte el borrado, el ledger y el consumo del gate.
7. No concede ejecución a `anon` ni `authenticated`; las funciones RPC públicas solo se conceden a `service_role`/administrador.

## Bootstrap del primer administrador

- Se emite un token de bootstrap independiente, de un solo uso, con hash y caducidad persistidos en la tabla privada.
- El claim requiere que no exista ningún Auth user ni perfil previo; registra intentos erróneos de manera persistente, limita intentos y fija un request UUID idempotente.
- Un trigger `AFTER INSERT ON auth.users` detecta exclusivamente el metadata `bc_bootstrap_request_id` asociado al claim válido y crea el perfil `public.usuarios` con rol `Dueño` dentro de la misma transacción que crea la identidad Auth. Si falla el perfil, también se revierte el Auth insert.
- La función de finalización comprueba identidad, perfil/rol, claim y cardinalidad; consume el gate y escribe auditoría. Repetir el mismo request ID devuelve el resultado previo; otro request queda rechazado.
- La Edge Function `bc-bootstrap-admin` exige el origen exacto de la PWA, token secreto, límites de entrada y rate limit; no registra contraseña, email ni token. Si se interrumpe después de crear Auth, el mismo request ID puede reanudar la operación sin crear otra identidad.

El token `BC_BOOTSTRAP_TOKEN` no se crea en este paso. Se provisionará de forma controlada después del reset autorizado, como parte del Paso 14. La contraseña real la introducirá el propietario directamente en la PWA; nunca se guardará en CI, GitHub, logs o Notion.

## Secretos y configuración

Un dump SQL no exporta las credenciales de Supabase, Cloudflare, GitHub Actions ni secretos de Edge Functions. El workflow solo comprueba presencia de los secretos de CI que usa; no lee ni imprime sus valores. Las credenciales de producción de Auth/Edge Functions permanecen en el gestor de secretos de Supabase y no se sobrescriben ni se copian al entorno local. `supabase/config.toml`, `wrangler.toml`, migraciones y código sí permanecen versionados en el repositorio.

## Criterio de cierre

El Paso 12 solo se marca PASS cuando el workflow exacto termine SUCCESS y el artefacto `step12-reset-bootstrap-report.json` confirme: backup actual restaurable; manifiesto completo; rollback sin diferencias; dos resets concurrentes con una sola ejecución y un replay; datos operativos vacíos en la copia aislada; catálogos/roles/policies/RLS/RPC/storage preservados; intentos erróneos persistentes; primer usuario/Auth + perfil Dueño atómicos; bootstrap idempotente y cerrado tras el uso; limpieza del stack temporal.

Este documento y la migración son candidatos de sandbox. **No autorizan ni ejecutan el Paso 13 (reset LIVE)**. El Paso 13 conserva su confirmación escrita exacta y su revisión humana independiente.
