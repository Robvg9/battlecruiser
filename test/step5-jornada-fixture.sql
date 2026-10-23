-- Minimal PostgreSQL 17 fixture for Step 5 migration contract tests only.
-- This is disposable CI schema, not a production dump.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $fn$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $fn$;

CREATE TABLE public.almacenes (
  id uuid PRIMARY KEY, nombre text NOT NULL, tipo text,
  created_at timestamptz NOT NULL DEFAULT now(), activo boolean NOT NULL DEFAULT true
);
CREATE TABLE public.roles (id uuid PRIMARY KEY, nombre text NOT NULL, activo boolean NOT NULL DEFAULT true);
CREATE TABLE public.usuarios (
  id uuid PRIMARY KEY REFERENCES auth.users(id), activo boolean NOT NULL DEFAULT true,
  role_id uuid NOT NULL REFERENCES public.roles(id)
);
CREATE TABLE public.turnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id uuid, usuario_nombre text,
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id), fecha date NOT NULL,
  estado text NOT NULL CHECK (estado IN ('PROGRAMADO','ABIERTO','CERRADO','CANCELADO')),
  creado_por uuid NOT NULL REFERENCES auth.users(id), created_by uuid NOT NULL REFERENCES auth.users(id),
  estado_maestro text, dias_turno integer, actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_turnos_maestro_unico_activo_por_almacen
  ON public.turnos(almacen_id)
  WHERE dias_turno IS NOT NULL AND COALESCE(estado_maestro,estado) NOT IN ('CERRADO','CANCELADO');
CREATE TABLE public.turno_sesiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id uuid NOT NULL REFERENCES public.turnos(id) ON DELETE RESTRICT,
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  numero_dia integer NOT NULL CHECK (numero_dia > 0),
  bloque text NOT NULL CHECK (bloque IN ('MANANA','TARDE')),
  fecha date NOT NULL,
  estado text NOT NULL CHECK (estado IN ('PENDIENTE','PROGRAMADA','EN_CURSO','INTERRUMPIDA','COMPLETADA','CANCELADA')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turno_sesiones_turno_id_numero_dia_bloque_key UNIQUE (turno_id,numero_dia,bloque),
  CONSTRAINT turno_sesiones_id_turno_id_key UNIQUE (id,turno_id)
);
CREATE TABLE public.turno_asignaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_sesion_id uuid NOT NULL REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT,
  turno_id uuid NOT NULL REFERENCES public.turnos(id) ON DELETE RESTRICT,
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  asignado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  asignado_at timestamptz NOT NULL DEFAULT now(),
  retirado_at timestamptz, motivo text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX turno_asignacion_activa_unica
  ON public.turno_asignaciones(turno_sesion_id) WHERE retirado_at IS NULL;
CREATE TABLE public.turno_tramos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), turno_id uuid NOT NULL REFERENCES public.turnos(id),
  turno_sesion_id uuid NOT NULL REFERENCES public.turno_sesiones(id),
  usuario_id uuid REFERENCES auth.users(id), estado text NOT NULL, inicio_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.turno_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), turno_id uuid NOT NULL REFERENCES public.turnos(id),
  turno_sesion_id uuid, turno_tramo_id uuid, actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  tipo text NOT NULL, payload jsonb, idempotency_key text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.bc_actor_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$ SELECT coalesce(current_setting('test.bc_admin',true),'false')='true' $fn$;

INSERT INTO public.almacenes(id,nombre,tipo,activo) VALUES
 ('10000000-0000-0000-0000-000000000001','Almacén de prueba A','VENTA',true),
 ('10000000-0000-0000-0000-000000000002','Almacén de prueba B','VENTA',true);
INSERT INTO auth.users(id) VALUES
 ('20000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002');
INSERT INTO public.roles(id,nombre,activo) VALUES
 ('30000000-0000-0000-0000-000000000001','Dueño',true),
 ('30000000-0000-0000-0000-000000000002','Dependienta',true);
INSERT INTO public.usuarios(id,activo,role_id) VALUES
 ('20000000-0000-0000-0000-000000000001',true,'30000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002',true,'30000000-0000-0000-0000-000000000002');

SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('test.bc_admin','true',false);
