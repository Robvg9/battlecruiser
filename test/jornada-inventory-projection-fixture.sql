DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '00000000-0000-4000-8000-000000000001'::uuid $$;

CREATE TABLE public.almacenes (
  id uuid PRIMARY KEY,
  nombre text NOT NULL,
  tipo text NOT NULL,
  activo boolean NOT NULL DEFAULT true
);
CREATE TABLE public.productos (
  id uuid PRIMARY KEY,
  nombre text NOT NULL,
  unidad text,
  activo boolean NOT NULL DEFAULT true,
  inventario_mixto boolean NOT NULL DEFAULT false,
  producto_padre_id uuid,
  variante_nombre text
);
CREATE TABLE public.stock (
  id uuid PRIMARY KEY,
  producto_id uuid NOT NULL,
  almacen_id uuid NOT NULL,
  cantidad numeric NOT NULL DEFAULT 0,
  minimo numeric NOT NULL DEFAULT 0,
  UNIQUE(producto_id, almacen_id)
);
CREATE TABLE public.productos_stock_mixto_minimos (
  id uuid PRIMARY KEY,
  producto_id uuid NOT NULL,
  almacen_id uuid NOT NULL,
  minimo numeric NOT NULL DEFAULT 0,
  UNIQUE(producto_id, almacen_id)
);
CREATE TABLE public.turnos (
  id uuid PRIMARY KEY,
  apertura_real timestamptz,
  cierre_real timestamptz,
  estado text
);
CREATE TABLE public.turno_jornada_programacion (
  id uuid PRIMARY KEY,
  fecha date NOT NULL,
  hora_inicio_prevista time NOT NULL DEFAULT '07:00',
  zona_horaria text NOT NULL DEFAULT 'America/Havana'
);
CREATE TABLE public.turno_sesiones (
  id uuid PRIMARY KEY,
  turno_id uuid NOT NULL,
  almacen_id uuid NOT NULL,
  jornada_programacion_id uuid NOT NULL,
  fecha date NOT NULL,
  bloque text NOT NULL,
  estado text NOT NULL,
  apertura_retroactiva boolean NOT NULL DEFAULT false
);
CREATE TABLE public.turno_jornada_inventario_cortes (
  id uuid PRIMARY KEY,
  turno_sesion_id uuid NOT NULL,
  tipo text NOT NULL,
  estado text NOT NULL,
  creado_en timestamptz NOT NULL,
  confirmado_en timestamptz
);
CREATE TABLE public.turno_jornada_inventario_lineas (
  id uuid PRIMARY KEY,
  corte_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  cantidad_contada numeric NOT NULL
);
CREATE TABLE public.turno_jornada_entradas_vinculadas (
  id uuid PRIMARY KEY,
  turno_sesion_id uuid NOT NULL,
  transferencia_id uuid NOT NULL
);
CREATE TABLE public.transferencias (
  id uuid PRIMARY KEY,
  almacen_origen_id uuid NOT NULL,
  almacen_destino_id uuid NOT NULL,
  estado text NOT NULL,
  fecha timestamptz NOT NULL
);
CREATE TABLE public.transferencias_lineas (
  id uuid PRIMARY KEY,
  transferencia_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  cantidad numeric NOT NULL
);
CREATE TABLE public.lotes_compra (
  id uuid PRIMARY KEY,
  almacen_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  origen text,
  fecha_compra timestamptz NOT NULL,
  cantidad_inicial numeric NOT NULL,
  cantidad_restante numeric NOT NULL DEFAULT 0,
  costo_unitario numeric NOT NULL DEFAULT 0
);
CREATE TABLE public.reinversiones (
  id uuid PRIMARY KEY,
  almacen_id uuid NOT NULL,
  turno_sesion_id uuid NOT NULL,
  estado text NOT NULL,
  fecha_revision timestamptz
);
CREATE TABLE public.reinversiones_lineas (
  id uuid PRIMARY KEY,
  reinversion_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  cantidad_base numeric NOT NULL
);
CREATE TABLE public.vales_salida (
  id uuid PRIMARY KEY,
  almacen_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  cantidad numeric NOT NULL,
  fecha timestamptz NOT NULL,
  estado text
);
CREATE TABLE public.mermas (
  id uuid PRIMARY KEY,
  almacen_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  cantidad numeric NOT NULL,
  estado text NOT NULL,
  fecha_revision timestamptz,
  actualizado_en timestamptz,
  creado_en timestamptz NOT NULL
);
CREATE TABLE public.bajas (
  id uuid PRIMARY KEY,
  almacen_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  cantidad numeric NOT NULL,
  estado text NOT NULL,
  fecha_revision timestamptz,
  actualizado_en timestamptz,
  creado_en timestamptz NOT NULL
);
CREATE TABLE public.ventas (
  id uuid PRIMARY KEY,
  almacen_id uuid NOT NULL,
  estado text NOT NULL,
  fecha timestamptz NOT NULL
);
CREATE TABLE public.ventas_lineas (
  id uuid PRIMARY KEY,
  venta_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  cantidad numeric NOT NULL
);

CREATE OR REPLACE FUNCTION public.tiene_permiso(p_modulo text, p_accion text)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

CREATE OR REPLACE FUNCTION public.inventario_enriquecido(p_almacen_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(producto_id uuid, producto text, almacen text, cantidad numeric, minimo numeric, estado text, costo_promedio numeric, valor_inventario numeric)
LANGUAGE sql AS $$ SELECT NULL::uuid,NULL::text,NULL::text,NULL::numeric,NULL::numeric,NULL::text,NULL::numeric,NULL::numeric WHERE false $$;

CREATE OR REPLACE FUNCTION public.inventario_mixto_enriquecido(p_almacen_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(producto_id uuid, producto text, almacen text, cantidad numeric, minimo numeric, estado text, costo_promedio numeric, valor_inventario numeric, unidad text, variantes jsonb)
LANGUAGE sql AS $$ SELECT NULL::uuid,NULL::text,NULL::text,NULL::numeric,NULL::numeric,NULL::text,NULL::numeric,NULL::numeric,NULL::text,NULL::jsonb WHERE false $$;

GRANT EXECUTE ON FUNCTION public.inventario_enriquecido(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventario_mixto_enriquecido(uuid) TO authenticated;
