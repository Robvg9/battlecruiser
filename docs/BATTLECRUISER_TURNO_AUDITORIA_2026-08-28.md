# BattleCruiser — Auditoría profunda TURNO — 2026-08-28

## Estado

Auditoría realizada contra GitHub `main` y Supabase live (`papxnkkjtkxsitcsvcme`).

### Hallazgos cerrados

- `public/js/turnos-maestro.js` ya no es un stub: está presente en GitHub.
- `public/js/turno-api.js` existe y fue actualizado para cubrir los adaptadores que la UX ya consume.
- Supabase live contiene las tablas `turnos`, `turno_sesiones`, `turno_asignaciones`, `turno_tramos`, `turno_declaraciones`, `turno_entregas_inventario`, `turno_revisiones`, `turno_diferencias`, `turno_descuentos`, `turno_sucesiones`, `turno_recepciones_compra` y `turno_configuracion`.
- Supabase live contiene las RPC principales del contrato TURNO, incluidas creación, asignación, inicio, cierre, interrupción/relevo, declaración, aprobación, descuentos, recepción, sucesión y configuración de duración.
- La recepción de compras distingue punto de venta vs almacén de almacenamiento: en punto de venta el backend determina al responsable por sesión/tramo activo; en almacén de almacenamiento exige ADMIN.
- El registro de llegada de compra admite ADMIN o usuario autorizado para transportar mercancía.
- La recepción de inventario de un Turno exige al responsable activo del punto; el receptor no puede ser elegido arbitrariamente.
- La duración fija está protegida por backend y puede habilitarse/deshabilitarse por ADMIN.
- El backend impide reasignar una sesión activa y solo permite iniciar a la persona actualmente asignada.
- El cierre de sesión exige declaración de dinero por cada tramo y no permite cerrar mientras exista un tramo activo.

## Corrección aplicada en esta auditoría

`public/js/turno-api.js` fue actualizado para añadir los adaptadores que `turnos-maestro.js` ya utilizaba pero que no existían en la capa API:

- `estado()` → `bc_turno_estado`
- `enviarAAprobacion()` → `bc_enviar_turno_a_aprobacion`
- `configurarDuracion()` → `bc_configurar_duracion_turnos`
- `listarSesionesTurno()` → lectura RLS de `turno_sesiones`
- `listarTramosSesion()` → lectura RLS de `turno_tramos`

Commit: `4e6e06ed20a4c078621ef8d1cc96ea059f380030`.

## Bloqueadores restantes

### 1. Interrupción/relevo en UX

`turnos-maestro.js` recibe `sesionId` en `doInterrumpir()` y actualmente lo pasa directamente a `API().interrumpirYRelevar()`. La RPC exige `p_turno_tramo_id` y el backend valida que el tramo esté ACTIVO.

La capa API ya usa correctamente `p_turno_tramo_id`. Falta ajustar la UX para localizar primero el tramo ACTIVO de la sesión y enviar su `id`.

### 2. UX de sucesión

El backend dispone de la cadena de recepción + sucesor, incluida la selección de días cuando la duración no está fijada. La UX maestra todavía no expone toda la experiencia de sucesión/recepción como flujo completo.

### 3. Fallback legacy

`turnos-maestro.js` todavía tiene un fallback que, si `listar_turnos` falla, consulta `listar_ciclos_operativos` y los presenta como Turnos. Esto debe limitarse a compatibilidad/histórico para no ocultar un fallo real del backend TURNO.

### 4. Validación runtime

Todavía falta ejecutar el flujo E2E con una cuenta real de ADMIN y una cuenta real de dependiente. No se declara 100% hasta comprobar runtime.

## Contrato confirmado en Supabase

### Creación
`bc_crear_turno(p_almacen_id, p_fecha_inicio, p_dias, p_asignaciones)`.

Genera `2 × días` sesiones. Si la duración fija está habilitada, backend fuerza exactamente `dias_fijos`.

### Inicio
`bc_iniciar_turno_sesion(p_turno_sesion_id)`.

Requiere asignación activa y que `auth.uid()` sea la persona asignada.

### Interrupción
`bc_interrumpir_y_relevar(p_turno_tramo_id, p_sustituto_id, p_motivo)`.

Cierra el tramo anterior como `INTERRUMPIDO` y crea inmediatamente un nuevo tramo `ACTIVO` para el sustituto.

### Dinero
`bc_declarar_dinero(p_turno_tramo_id, p_monto)`.

Permite `$0`, exige monto no negativo y una sola declaración por tramo.

### Cierre
`bc_cerrar_turno_sesion(p_turno_sesion_id)`.

No permite cerrar si hay tramo activo; exige que cada tramo de la sesión tenga declaración.

### Aprobación
`bc_enviar_turno_a_aprobacion(p_turno_id)` requiere todas las sesiones `COMPLETADA` y cambia el Turno a `PENDIENTE_APROBACION`.

`bc_aprobar_turno(p_turno_id, p_comentario)` es exclusivo de ADMIN y cambia a `CERRADO`.

### Descuentos
`bc_crear_descuento(...)` permite registrar manualmente responsable, monto, motivo y referencias de sesión/tramo.

### Recepción de compras
`bc_registrar_llegada_compra(...)` permite ADMIN o transportista autorizado. Para punto de venta, el receptor se determina por sesión + tramo activo. Para almacén de almacenamiento, ADMIN.

### Recepción de inventario
`bc_registrar_entrega_inventario(...)` determina el receptor activo en backend; no permite elegir arbitrariamente otra persona.

## Próximo orden seguro

1. Corregir `doInterrumpir()` para obtener tramo ACTIVO antes del relevo.
2. Completar UX de recepción + sucesión + elección de días del sucesor.
3. Eliminar el fallback operativo Ciclo o convertirlo en vista histórica explícita.
4. Añadir tests dedicados del módulo TURNO.
5. Ejecutar E2E real.
6. Triangular Notion ↔ Supabase ↔ GitHub después del bloque completo.

## Regla de integridad

No se debe simular una RPC inexistente, no se deben inventar firmas y ningún error de backend debe convertirse en falso éxito de UI.
