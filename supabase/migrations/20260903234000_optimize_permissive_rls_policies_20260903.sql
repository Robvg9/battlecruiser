-- BattleCruiser — Remove overlapping permissive RLS policies
-- Applied and verified in LIVE Supabase on 2026-09-03.
-- Purpose: preserve authorization while preventing SELECT policy overlap.

BEGIN;

-- Split the write policy so it no longer overlaps SELECT for authenticated users.
DROP POLICY IF EXISTS asignaciones_operativas_write ON public.asignaciones_operativas;
CREATE POLICY asignaciones_operativas_insert ON public.asignaciones_operativas
  FOR INSERT TO authenticated
  WITH CHECK ((select tiene_permiso('ciclos'::text, 'editar_any'::text)));
CREATE POLICY asignaciones_operativas_update ON public.asignaciones_operativas
  FOR UPDATE TO authenticated
  USING ((select tiene_permiso('ciclos'::text, 'editar_any'::text)))
  WITH CHECK ((select tiene_permiso('ciclos'::text, 'editar_any'::text)));
CREATE POLICY asignaciones_operativas_delete ON public.asignaciones_operativas
  FOR DELETE TO authenticated
  USING ((select tiene_permiso('ciclos'::text, 'editar_any'::text)));

-- Merge logically redundant catalog SELECT policies: P and (P OR Q) => (P OR Q).
DROP POLICY IF EXISTS almacenes_ver ON public.almacenes;
DROP POLICY IF EXISTS almacenes_ver_ventas ON public.almacenes;
CREATE POLICY almacenes_ver ON public.almacenes
  FOR SELECT TO public
  USING ((tiene_permiso('almacenes'::text, 'ver'::text) OR tiene_permiso('ventas'::text, 'ver'::text)));

DROP POLICY IF EXISTS categorias_ver ON public.categorias;
DROP POLICY IF EXISTS categorias_ver_ventas ON public.categorias;
CREATE POLICY categorias_ver ON public.categorias
  FOR SELECT TO public
  USING ((tiene_permiso('categorias'::text, 'ver'::text) OR tiene_permiso('ventas'::text, 'ver'::text)));

DROP POLICY IF EXISTS productos_ver ON public.productos;
DROP POLICY IF EXISTS productos_ver_ventas ON public.productos;
CREATE POLICY productos_ver ON public.productos
  FOR SELECT TO public
  USING ((tiene_permiso('productos'::text, 'ver'::text) OR tiene_permiso('ventas'::text, 'ver'::text)));

DROP POLICY IF EXISTS stock_ver ON public.stock;
DROP POLICY IF EXISTS stock_ver_ventas ON public.stock;
CREATE POLICY stock_ver ON public.stock
  FOR SELECT TO public
  USING ((tiene_permiso('stock'::text, 'ver'::text) OR tiene_permiso('ventas'::text, 'ver'::text)));

DROP POLICY IF EXISTS permisos_admin ON public.permisos;
CREATE POLICY permisos_insert_admin ON public.permisos
  FOR INSERT TO public
  WITH CHECK (tiene_permiso('usuarios'::text, 'editar'::text));
CREATE POLICY permisos_update_admin ON public.permisos
  FOR UPDATE TO public
  USING (tiene_permiso('usuarios'::text, 'editar'::text))
  WITH CHECK (tiene_permiso('usuarios'::text, 'editar'::text));
CREATE POLICY permisos_delete_admin ON public.permisos
  FOR DELETE TO public
  USING (tiene_permiso('usuarios'::text, 'editar'::text));

DROP POLICY IF EXISTS roles_admin ON public.roles;
CREATE POLICY roles_insert_admin ON public.roles
  FOR INSERT TO public
  WITH CHECK (tiene_permiso('usuarios'::text, 'editar'::text));
CREATE POLICY roles_update_admin ON public.roles
  FOR UPDATE TO public
  USING (tiene_permiso('usuarios'::text, 'editar'::text))
  WITH CHECK (tiene_permiso('usuarios'::text, 'editar'::text));
CREATE POLICY roles_delete_admin ON public.roles
  FOR DELETE TO public
  USING (tiene_permiso('usuarios'::text, 'editar'::text));

COMMIT;
