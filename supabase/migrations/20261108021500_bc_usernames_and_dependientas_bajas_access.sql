BEGIN;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS username text;

-- Backfill a concise, deterministic first-name alias for existing accounts.
-- Collisions are disambiguated with a stable suffix derived from each profile UUID.
WITH candidates AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        trim(both '-' from regexp_replace(
          translate(
            replace(replace(lower(split_part(btrim(nombre), ' ', 1)), 'ü', 'u'), 'ñ', 'n'),
            'áéíóú', 'aeiou'
          ),
          '[^a-z0-9]+', '-', 'g'
        )),
        ''
      ),
      'user'
    ) AS base
  FROM public.usuarios
  WHERE username IS NULL OR btrim(username) = ''
),
ranked AS (
  SELECT id, base, count(*) OVER (PARTITION BY base) AS duplicate_count
  FROM candidates
)
UPDATE public.usuarios u
SET username = CASE
  WHEN length(r.base) < 3 THEN left(r.base || '-user', 17)
  WHEN r.duplicate_count > 1 THEN left(r.base, 17) || '-' || left(replace(r.id::text, '-', ''), 6)
  ELSE left(r.base, 24)
END
FROM ranked r
WHERE u.id = r.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.usuarios'::regclass
      AND conname = 'usuarios_username_format_check'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT usuarios_username_format_check
      CHECK (username IS NULL OR username ~ '^[a-z0-9][a-z0-9._-]{2,23}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_username_normalized_uidx
  ON public.usuarios (lower(username))
  WHERE username IS NOT NULL AND btrim(username) <> '';

-- A dependienta may submit a Baja request but cannot approve, reject, or edit
-- another person's operation. Keep all other role capabilities unchanged.
INSERT INTO public.permisos(role_id,seccion,accion,permitido)
SELECT r.id,'bajas',v.accion,true
FROM public.roles r
CROSS JOIN (VALUES ('ver'::text),('crear'::text)) AS v(accion)
WHERE lower(r.nombre)='dependientas'
  AND NOT EXISTS (
    SELECT 1 FROM public.permisos p
    WHERE p.role_id=r.id AND p.seccion='bajas' AND p.accion=v.accion
  );

UPDATE public.permisos p
SET permitido=true
FROM public.roles r
WHERE p.role_id=r.id AND lower(r.nombre)='dependientas'
  AND p.seccion='bajas' AND p.accion IN ('ver','crear');

-- Repair the one newly created dependent profile that the previous deployed
-- Edge Function left without a role. Only update the exact unique active profile.
UPDATE public.usuarios u
SET role_id = r.id
FROM public.roles r
WHERE lower(r.nombre)='dependientas'
  AND r.activo=true
  AND lower(btrim(u.nombre))=lower('Evelyn Dayanis Leyva Peña')
  AND u.role_id IS NULL
  AND u.activo=true
  AND coalesce(u.archivado,false)=false
  AND (
    SELECT count(*) FROM public.usuarios match_user
    WHERE lower(btrim(match_user.nombre))=lower('Evelyn Dayanis Leyva Peña')
  )=1;

-- Let a Baja creator read just the product and warehouse catalogs used by
-- the request form without granting Products or Warehouses module access.
DROP POLICY IF EXISTS productos_ver ON public.productos;
CREATE POLICY productos_ver ON public.productos
  FOR SELECT USING (
    public.tiene_permiso('productos','ver')
    OR public.tiene_permiso('ventas','ver')
    OR public.tiene_permiso('bajas','crear')
  );

DROP POLICY IF EXISTS almacenes_ver ON public.almacenes;
CREATE POLICY almacenes_ver ON public.almacenes
  FOR SELECT USING (
    public.tiene_permiso('almacenes','ver')
    OR public.tiene_permiso('ventas','ver')
    OR public.tiene_permiso('bajas','crear')
  );

CREATE OR REPLACE FUNCTION public.obtener_email_login_por_nombre(p_nombre text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT au.email
  FROM public.usuarios u
  JOIN auth.users au ON au.id = u.id
  WHERE u.activo = true
    AND coalesce(u.archivado,false) = false
    AND au.deleted_at IS NULL
    AND (
      lower(trim(au.email)) = lower(trim(p_nombre))
      OR lower(trim(u.username)) = lower(trim(p_nombre))
      OR (
        lower(trim(u.nombre)) = lower(trim(p_nombre))
        AND (
          SELECT count(*)
          FROM public.usuarios duplicate_profile
          JOIN auth.users duplicate_auth ON duplicate_auth.id=duplicate_profile.id
          WHERE duplicate_profile.activo=true
            AND coalesce(duplicate_profile.archivado,false)=false
            AND duplicate_auth.deleted_at IS NULL
            AND lower(trim(duplicate_profile.nombre))=lower(trim(p_nombre))
        ) = 1
      )
    )
  ORDER BY CASE
    WHEN lower(trim(au.email)) = lower(trim(p_nombre)) THEN 0
    WHEN lower(trim(u.username)) = lower(trim(p_nombre)) THEN 1
    ELSE 2
  END
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.obtener_email_login_por_nombre(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_email_login_por_nombre(text) TO service_role;

COMMIT;
