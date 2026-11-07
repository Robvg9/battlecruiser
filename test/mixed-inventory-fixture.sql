-- Disposable PostgreSQL fixture for optional mixed inventory.
-- Runs only in the isolated postgres:17 service created by CI.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;

CREATE TABLE public.almacenes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'almacenamiento',
  created_at timestamptz NOT NULL DEFAULT now(),
  activo boolean NOT NULL DEFAULT true
);
CREATE TABLE public.presentaciones(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.productos(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  categoria_id uuid,
  unidad text,
  precio_normal numeric,
  precio_mayorista numeric,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  presentacion_id uuid,
  imagen_url text
);
CREATE TABLE public.producto_presentaciones(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  presentacion_id uuid NOT NULL REFERENCES public.presentaciones(id),
  factor numeric NOT NULL CHECK (factor>0),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_producto_presentacion_fixture
  ON public.producto_presentaciones(producto_id,presentacion_id) WHERE activo=true;
CREATE TABLE public.stock(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),
  cantidad numeric NOT NULL DEFAULT 0,
  minimo numeric DEFAULT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(producto_id,almacen_id)
);
CREATE TABLE public.lotes_compra(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),
  cantidad_inicial numeric NOT NULL,
  cantidad_restante numeric NOT NULL,
  costo_unitario numeric NOT NULL,
  fecha_compra timestamptz NOT NULL DEFAULT now(),
  origen text,
  usuario_id uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  compra_id uuid
);

CREATE OR REPLACE FUNCTION public.tiene_permiso(p_modulo text,p_accion text)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.bc_actor_is_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.bc_admin',true),'true')='true'
$$;

-- Legacy product/warehouse stock row with an unset minimum. The new minimum
-- migration must backfill this row and make the column mandatory.
INSERT INTO public.almacenes(id,nombre)
VALUES ('55555555-5555-4555-8555-555555555555','Almacén legado');
INSERT INTO public.productos(id,nombre,unidad,precio_normal,activo)
VALUES ('66666666-6666-4666-8666-666666666666','Producto legado','unidad',1,true);
INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
VALUES ('66666666-6666-4666-8666-666666666666','55555555-5555-4555-8555-555555555555',5,NULL);
