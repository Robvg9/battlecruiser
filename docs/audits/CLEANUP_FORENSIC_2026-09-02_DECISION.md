# Decision

## Decisión de alcance
Aprobada la eliminación de los 24 assets históricos listados en `CLEANUP_FORENSIC_2026-09-02.md` porque no pertenecen a las raíces de carga actuales de `index.html`, `app.js`, `core.js` y `navegacion.js`.

## Guardas
- Los módulos activos actuales y las capas dinámicas preservadas quedan fuera de la limpieza.
- `test/_leer-app-js.js` fue alineado con el conjunto real de módulos existentes; no se cambió lógica de producción.
- `test/cleanup-forensic.test.js` verifica ausencia física de los 24 archivos y ausencia de referencias literales en `public/*.html` y `public/**/*.js`.

## CI
La suite general permanece roja por 86 fallos que ya están presentes en `main` en el mismo commit base. No se mezclan esas correcciones con esta limpieza.

## Estado
La rama queda preparada para integrar únicamente la limpieza forense y sus guardas. No se autoriza introducir reparaciones funcionales ajenas al alcance para conseguir un verde artificial de CI.
