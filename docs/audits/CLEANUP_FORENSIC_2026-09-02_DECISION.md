# Decision

Approved for deletion on branch `cleanup-forensic-20260902`: 24 historical/unreachable frontend JS assets listed in CLEANUP_FORENSIC_2026-09-02.md.

Evidence threshold:
1. Not statically loaded by public/index.html.
2. Not dynamically loaded by public/app.js current module chain.
3. Not injected by public/js/core.js.
4. Not the dynamic dependency `ciclos-unificacion.js` from navegacion.js.
5. Inspected source indicates historical/superseded functionality or explicit retirement/placeholder status.
6. Current active authorities (Ventas M68 + ventas.js/m26-ventas-ux, current Turnos/Ciclos stack, communication/reporting/product modules) do not rely on these as runtime entrypoints.

Not approved for deletion in this pass: panel-contextual.js, runtime-productos-hardening.js, ui-revision-2026-08.js, and m31-turno-asignaciones.js because they were not sufficiently proven dead from the available reference graph. This conservative exclusion is intentional.
