# BattleCruiser — Auditoría Forense de Limpieza

Fecha: 2026-09-02
Rama de respaldo: cleanup-forensic-20260902

## Alcance
Limpieza conservadora de archivos JavaScript históricos no alcanzables por la cadena runtime actual.

## Autoridades runtime auditadas
- public/index.html — scripts estáticos actuales
- public/app.js — cadena dinámica actual
- public/js/core.js — inyecciones dinámicas adicionales
- public/js/navegacion.js — carga dinámica confirmada de ciclos-unificacion.js
- public/js/m68-ventas-pos-definitivo.js — autoridad visual actual de Ventas
- public/js/ventas.js — lógica de ventas actual
- public/js/usuarios-permisos.js — contexto/permisos actual
- public/js/turno-api.js — API TURNO actual
- public/js/m18-ciclos-ux.js y public/js/turnos-maestro.js — flujo vigente de Turnos

## Conclusión previa a la operación
Los archivos que siguen NO aparecen en los entrypoints actuales de index.html/app.js/core.js y fueron verificados como capas históricas/retiradas:
- m26-7-ventas-fix.js (PLACEHOLDER)
- m27-1-ventas-pos.js (retirada explícita)
- m27-2-fe1-ventas-pos.js (capa POS antigua)
- m27-theme-elegant-light.js (tema visual retirado)
- m64-ventas-topbar-sticky.js
- m65-ventas-smart-panel.js
- m66-ventas-polish-final.js
- m67-ventas-ux-compact.js
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

## Archivos NO eliminados deliberadamente
ciclos-unificacion.js está cargado dinámicamente por navegacion.js y por tanto es activo.
core.js inyecta historial-detalle.js, compra-multiple.js, compra-vale-style.js, movimiento-multiple.js, inventario-detalle.js y runtime-guards.js; se conservan.
offline.js se conserva por ser la capa IndexedDB/cola offline.

## Nota
La eliminación se ejecuta en rama de respaldo antes de promover a main. Después de la operación debe hacerse una auditoría de referencias y de integridad de los entrypoints.
