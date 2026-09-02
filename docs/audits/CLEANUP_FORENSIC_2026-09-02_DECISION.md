# Decision

Approved for deletion on branch `cleanup-forensic-20260902`: historical/unreachable frontend JS assets listed in the audit, after runtime-root inspection.

Conservative exclusions are intentional: current loaders, dynamic dependencies, current Turnos/Ciclos modules, current Ventas business logic, current M68 POS authority, and ambiguous non-entrypoint files remain untouched.

A separate test issue (#19) was created accidentally while validating connector write access; it is unrelated to the application and will be closed immediately.