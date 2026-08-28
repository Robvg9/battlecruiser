# BattleCruiser — Modelo TURNO V1 (Frontend)

**Fecha:** 2026-08-28  
**Versión FE:** v9.4.0  
**HEAD de referencia:** ver commits de restauración de `turno-api.js`  
**Estado:** Implementación FE contra contrato backend `bc_*` documentado en Notion + introspección live.

## Concepto operativo

**TURNO** es el único concepto operativo visible y consumido por la nueva UX.

`Ciclo` queda como **LEGACY / compatibilidad**: tablas, RPC y módulos históricos se conservan; no se hace DROP.

### Estados maestro

`PROGRAMADO → EN_CURSO → PENDIENTE_APROBACION → CERRADO` (+ `CANCELADO`).

Sesiones: N días × 2 bloques (MANANA/TARDE) = **2N** sesiones.

## Módulos FE nuevos

| Archivo | Rol |
|---------|-----|
| `public/js/turno-api.js` | Capa única de acceso a RPC `bc_*`. Online-only. Propaga errores reales. No simula éxito offline. |
| `public/js/turnos-maestro.js` | UX Turnos: home por almacén, crear Turno, sesiones, declaración, interrupción/relevo, revisión ADMIN, descuentos. |

Carga: `public/app.js` v9.4.0 incluye ambos al inicio de la lista dinámica.  
Cache: `public/service-worker.js` v9.4.0.

## RPC consumidas (contrato)

- `bc_crear_turno`
- `bc_asignar_turno_sesion`
- `bc_iniciar_turno_sesion`
- `bc_cerrar_turno_sesion`
- `bc_interrumpir_y_relevar`
- `bc_declarar_dinero`
- `bc_enviar_turno_a_aprobacion`
- `bc_aprobar_turno`
- `bc_aprobar_diferencia`
- `bc_crear_descuento`
- `bc_registrar_entrega_inventario`
- `bc_recibir_entrega_inventario`
- `bc_recibir_entrega_inventario_y_crear_sucesor`
- `bc_crear_sucesor_turno` / `bc_preparar_turno_sucesor`
- `bc_turno_estado` / `bc_turno_transition`
- `bc_actor_is_admin`
- `bc_obtener_configuracion_turnos` / `bc_configurar_duracion_turnos`
- `bc_editar_dias_turno`
- `listar_turnos` / `turno_actual_usuario`

Autenticación de sustituto: **Supabase Auth** (`signInWithPassword`), no contraseñas a RPC propia.

## Reglas implementadas en FE (sin inventar backend)

1. ADMIN crea Turno (almacén + días + asignaciones opcionales).
2. Sesión sin asignar no inicia (backend es autoridad; FE refleja).
3. Solo asignada inicia.
4. Declaración de dinero obligatoria (incluido `$0`) para cerrar sesión.
5. Cerrar sesión ≠ cerrar Turno.
6. Turno → `PENDIENTE_APROBACION` vía `bc_enviar_turno_a_aprobacion`.
7. Solo ADMIN aprueba / descuenta / revisa.
8. Interrupción/relevo con modal de autenticación del sustituto (sin logout general).
9. Online-only para mutaciones de Turno; sin falso éxito offline.
10. Labels UI: **Turnos** (no Ciclos Operativos como concepto nuevo).

## Legacy conservado

- `ciclos.js`, `m18-ciclos-ux.js`, `m22-*`, `m24-*`, `m27-3-*`, `m27-4-*`
- SQL M15–M17 y tablas `ciclos_operativos` / `sesiones_ciclo`
- No DROP masivo.

## Triangulación (checkpoint)

| Capa | Estado |
|------|--------|
| **Notion** | Contrato TURNO vigente (Documento Maestro 2026-08-28). |
| **Supabase** | Tablas `turno_*` + RPC `bc_*` live; legacy ciclo aún presente (aditivo). |
| **GitHub** | FE v9.4.0 + `turno-api.js` restaurado; `turnos-maestro.js` puede requerir subida manual si el push de archivo grande falló/truncó. |

## Integridad archivos grandes

SHA256 locales de entrega:

- `turno-api.js`: `c29e0ff35c52f5046f507f35b8548ad0a423e70f56cf0d895a90e8a645eac438`
- `turnos-maestro.js`: `c2d101a800fcc57069feadb777ab5e1e693a41d80cd9fc1ca5deb564f93f3010`

## Estado final de esta entrega FE

**COMPLETO TÉCNICAMENTE (FE) — PENDIENTE VALIDACIÓN DE ROBERT**

No declarar validado por Robert hasta prueba runtime real.
