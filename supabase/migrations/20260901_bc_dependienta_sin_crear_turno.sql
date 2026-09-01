-- ============================================================
-- v9.4.45 — Dependienta NO puede crear Turnos maestros
-- ============================================================
-- Regla de negocio:
--   DEPENDIENTA: ver turnos + abrir su sesión asignada
--   NO: crear Turno maestro (turnos.crear)
-- Abrir sesión usa iniciar_sesion_operativa (asignación + secuencia),
-- NO el permiso turnos.crear.
-- Idempotente.
-- ============================================================

-- Quitar turnos.crear del rol Dependienta (cualquier variante de nombre)
DELETE FROM public.permisos p
USING public.roles r
WHERE p.role_id = r.id
  AND lower(r.nombre) IN ('dependienta', 'dependiente')
  AND lower(p.seccion) = 'turnos'
  AND lower(p.accion) = 'crear';

-- Asegurar turnos.ver para Dependienta (si no existe)
INSERT INTO public.permisos (role_id, seccion, accion)
SELECT r.id, 'turnos', 'ver'
FROM public.roles r
WHERE lower(r.nombre) IN ('dependienta', 'dependiente')
  AND NOT EXISTS (
    SELECT 1 FROM public.permisos p
    WHERE p.role_id = r.id
      AND lower(p.seccion) = 'turnos'
      AND lower(p.accion) = 'ver'
  );

-- Nota: ciclos.crear puede seguir existiendo para flujos legacy;
-- el FE de CREAR TURNO ya no lo usa como isAdmin (solo editar_any / dueño / actorIsAdmin).
