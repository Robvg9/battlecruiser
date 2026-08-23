-- ============================================================
-- M12 — Permisos de Operaciones (gastos, mermas, bajas, reinversiones)
-- ============================================================
-- Problema: actualizar_permisos_rol valida contra filas EXISTENTES del rol.
-- Si el rol no tiene filas gastos/mermas/bajas/reinversiones →
--   "Permiso no reconocido: gastos.ver"
--
-- Solución en 3 pasos (idempotente):
--   1) Sembrar filas faltantes en public.permisos para TODOS los roles
--   2) Ampliar catalogo_permisos_admin
--   3) Ampliar la siembra dentro de actualizar_permisos_rol / crear_rol
--
-- NO toca: RLS, permisos ya concedidos (solo INSERT de faltantes con permitido=false),
--          permisos_usuario_actual, firmas de RPC.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Sembrar filas faltantes en public.permisos (todos los roles)
-- ------------------------------------------------------------
INSERT INTO public.permisos (role_id, seccion, accion, permitido)
SELECT r.id, s.seccion, a.accion, false
FROM public.roles r
CROSS JOIN (VALUES
  ('gastos'),
  ('mermas'),
  ('bajas'),
  ('reinversiones')
) AS s(seccion)
CROSS JOIN (VALUES
  ('ver'),
  ('crear')
) AS a(accion)
WHERE NOT EXISTS (
  SELECT 1 FROM public.permisos p
  WHERE p.role_id = r.id
    AND p.seccion = s.seccion
    AND p.accion  = a.accion
);

-- editar_any solo donde el sistema lo usa (gastos, mermas, bajas)
INSERT INTO public.permisos (role_id, seccion, accion, permitido)
SELECT r.id, s.seccion, 'editar_any', false
FROM public.roles r
CROSS JOIN (VALUES ('gastos'), ('mermas'), ('bajas')) AS s(seccion)
WHERE NOT EXISTS (
  SELECT 1 FROM public.permisos p
  WHERE p.role_id = r.id
    AND p.seccion = s.seccion
    AND p.accion  = 'editar_any'
);

-- ------------------------------------------------------------
-- 2) catalogo_permisos_admin — debe listar las nuevas secciones
--    ChatGPT debe reemplazar la función real con la definición
--    actual + estas secciones en el VALUES / UNION del catálogo.
--    Plantilla mínima si la función es un listado fijo:
-- ------------------------------------------------------------
/*
CREATE OR REPLACE FUNCTION public.catalogo_permisos_admin()
RETURNS TABLE (seccion text, accion text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM (VALUES
    -- ... secciones ya existentes (productos, ventas, ...) ...
    ('gastos', 'ver'),
    ('gastos', 'crear'),
    ('gastos', 'editar_any'),
    ('mermas', 'ver'),
    ('mermas', 'crear'),
    ('mermas', 'editar_any'),
    ('bajas', 'ver'),
    ('bajas', 'crear'),
    ('bajas', 'editar_any'),
    ('reinversiones', 'ver'),
    ('reinversiones', 'crear')
  ) AS t(seccion, accion);
$$;
*/

-- Alternativa segura: si el catálogo se deriva de filas distintas en permisos,
-- tras el INSERT del paso 1 ya aparecerán al hacer DISTINCT seccion, accion.

-- ------------------------------------------------------------
-- 3) Nota para actualizar_permisos_rol
--    Tras el paso 1, las filas YA existen → el IF NOT EXISTS que lanza
--    "Permiso no reconocido" deja de fallar para gastos/mermas/bajas/reinversiones.
--    Opcional: en la siembra interna de la función (y en crear_rol), añadir
--    las mismas 4 secciones para roles nuevos.
-- ============================================================

-- Verificación rápida (ejecutar después):
-- SELECT seccion, accion, count(*)
-- FROM public.permisos
-- WHERE seccion IN ('gastos','mermas','bajas','reinversiones')
-- GROUP BY 1,2
-- ORDER BY 1,2;
