# BattleCruiser — Auditoría Forense de Limpieza

Fecha: 2026-09-02
Rama: `cleanup-forensic-20260902`
Base auditada: `main` @ `f52982dddcce01ec97f181f8ad59eff3b3b89215`

## Alcance
Limpieza conservadora de 24 archivos JavaScript históricos que no pertenecen a la cadena de carga runtime actualmente declarada.

## Evidencia de carga actual
- `public/index.html` contiene la cadena estática de módulos actuales y no referencia los 24 archivos eliminados.
- `public/app.js` contiene la cadena dinámica actual y no referencia los 24 archivos eliminados; la cadena actual incluye la capa POS activa de `m26-7-ventas-repair.js` y `m68-ventas-pos-definitivo.js`.
- `public/js/core.js` y `public/js/navegacion.js` fueron revisados como raíces dinámicas adicionales; ninguno carga los 24 archivos eliminados.
- Se añadió `test/cleanup-forensic.test.js`, que comprueba automáticamente que los 24 archivos no existan en `public/js/` y que ningún `.html`/`.js` de `public/` conserve una referencia literal a sus nombres.

## Archivos eliminados
- m26-7-ventas-fix.js
- m27-1-ventas-pos.js
- m27-2-fe1-ventas-pos.js
- m27-theme-elegant-light.js
- catalogo-avanzado.js
- historiales-premium.js
- m26-14-comunicacion-estabilidad.js
- m30-turnos-expediente.js
- m31-turno-expediente.js
- m32-turnos-home-expediente-final.js
- m37-turnos-asignacion-misma.js
- m41-turnos-ventana-layout.js
- m46-turnos-sesiones-inteligentes.js
- m47-turnos-step1-layout.js
- m48-turnos-step1-layout.js
- m58-ventas-session-sync.js
- m59-turno-cierre-moderno.js
- m60-turnos-operacion-control.js
- m61-auth-ui-cleanup.js
- m62-turnos-fecha-operativa-ui-fix.js
- m64-ventas-topbar-sticky.js
- m65-ventas-smart-panel.js
- m66-ventas-polish-final.js
- m67-ventas-ux-compact.js

## Verificaciones específicas
- `m26-7-ventas-fix.js` era un placeholder literal y no una implementación activa.
- `m27-1-ventas-pos.js` estaba retirado/deshabilitado (`__BC_M271_POS__ = "disabled"`) y no formaba parte de la cadena actual.
- `m27-2-fe1-ventas-pos.js` sí era código funcional histórico, pero su propio encabezado identifica que solo aporta la capa visual/catálogo POS. La revisión de la cadena actual confirma que no se carga: el POS actual utiliza las capas M26 actuales y M68.
- La eliminación no modifica la lógica de negocio activa; los archivos de runtime actuales permanecen fuera del diff de limpieza.

## CI y línea base
El primer fallo del cleanup fue una referencia obsoleta de `test/_leer-app-js.js` hacia `catalogo-avanzado.js`. Se corrigió en `0fe6f6e0940c420d697331219bfcdc28e20f7f27` sin modificar lógica de producción.

Después de ese ajuste, la suite ejecutó 243 pruebas y obtuvo 157 PASS / 86 FAIL. La misma base exacta `main` (`f52982dddcce01ec97f181f8ad59eff3b3b89215`) también ejecuta 243 pruebas con 157 PASS / 86 FAIL. Por lo tanto, esos 86 fallos pertenecen al estado previo y no son evidencia de una regresión introducida por esta limpieza.

## Estado de cierre
La limpieza está aislada del runtime activo y cuenta con una barrera de regresión ejecutable específica. El PR debe mantenerse separado de la corrección de los 86 fallos preexistentes de la suite general.
