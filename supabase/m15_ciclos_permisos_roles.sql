-- =================================================================
-- M15 — CICLOS OPERATIVOS: crear_rol() incluye la sección 'ciclos'
-- Corrección puntual aplicada en Supabase (papxnkkjtkxsitcsvcme)
-- el 2026-08-21.
--
-- PROBLEMA: public.crear_rol(text) generaba la matriz de permisos
-- para roles nuevos SIN incluir la sección 'ciclos' (M15). Un rol
-- nuevo se creaba correctamente, pero nunca recibía las filas
-- ciclos/ver, ciclos/crear, ciclos/editar, ciclos/borrar,
-- ciclos/editar_any, por lo que no se podían habilitar luego desde
-- la gestión de roles. No era una falla de seguridad (tiene_permiso
-- deniega por defecto si no hay fila), sino un hueco funcional.
--
-- Mismo patrón que la corrección ya aplicada para 'entregas_caja'
-- (M16). Esta es la definición REAL de crear_rol() en producción,
-- con el único cambio de agregar 'ciclos' a la matriz base y su
-- editar_any. No se modificó ninguna otra lógica de la función.
-- =================================================================

CREATE OR REPLACE FUNCTION public.crear_rol(p_nombre text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_nombre text;
  v_role_id uuid;
BEGIN
  IF NOT public.tiene_permiso('usuarios', 'crear') THEN
    RAISE EXCEPTION 'No tenés permiso para crear roles.' USING ERRCODE = '42501';
  END IF;

  v_nombre := trim(p_nombre);
  IF v_nombre IS NULL OR v_nombre = '' THEN
    RAISE EXCEPTION 'El nombre del rol es obligatorio.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.roles WHERE lower(nombre) = lower(v_nombre)) THEN
    RAISE EXCEPTION 'Ya existe un rol con ese nombre.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.roles (nombre, activo) VALUES (v_nombre, true)
    RETURNING id INTO v_role_id;

  -- Generar la matriz canónica completa en false (sin acceso por defecto):
  -- las secciones reales con [ver,crear,editar,borrar] ...
  INSERT INTO public.permisos (role_id, seccion, accion, permitido)
    SELECT v_role_id, s.seccion, a.accion, false
    FROM (VALUES ('productos'),('categorias'),('almacenes'),('stock'),
                 ('transferencias'),('vales_salida'),('ventas'),('reportes'),
                 ('usuarios'),('presentaciones'),('auditoria'),('turnos'),
                 ('comunicacion'),('unidades'),('entregas_caja'),('ciclos')) AS s(seccion)
    CROSS JOIN (VALUES ('ver'),('crear'),('editar'),('borrar')) AS a(accion);

  -- ... más el 'editar_any' extra que existe para 'turnos', 'entregas_caja' y 'ciclos'.
  INSERT INTO public.permisos (role_id, seccion, accion, permitido)
    VALUES (v_role_id, 'turnos', 'editar_any', false),
           (v_role_id, 'entregas_caja', 'editar_any', false),
           (v_role_id, 'ciclos', 'editar_any', false);

  RETURN v_role_id;
END;
$function$;
