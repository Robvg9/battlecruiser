-- Isolated schema fixture for product-presentation PostgreSQL CI.
-- This file is executed only in the ephemeral postgres:17 service container.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;

CREATE TABLE public.almacenes(id uuid PRIMARY KEY,tipo text);
CREATE TABLE public.categorias(id uuid PRIMARY KEY);
CREATE TABLE public.presentaciones(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.productos(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  categoria_id uuid,
  unidad text,
  precio_normal numeric,
  precio_mayorista numeric,
  presentacion_id uuid
);
CREATE TABLE public.producto_presentaciones(
  producto_id uuid NOT NULL,
  presentacion_id uuid NOT NULL,
  factor numeric NOT NULL,
  activo boolean DEFAULT true
);
CREATE TABLE public.turnos(id uuid PRIMARY KEY,usuario_id uuid NOT NULL,estado text NOT NULL,almacen_id uuid);
CREATE TABLE public.turno_sesiones(
  id uuid PRIMARY KEY,turno_id uuid NOT NULL,estado text NOT NULL,
  fecha date NOT NULL,numero_dia integer NOT NULL,bloque text NOT NULL,almacen_id uuid
);
CREATE TABLE public.turno_tramos(
  id uuid PRIMARY KEY,turno_sesion_id uuid NOT NULL,usuario_id uuid NOT NULL,
  estado text NOT NULL,inicio_at timestamptz NOT NULL
);
CREATE TABLE public.ventas(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),almacen_id uuid NOT NULL,
  creado_por uuid NOT NULL,total numeric NOT NULL
);
CREATE TABLE public.ventas_lineas(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),venta_id uuid NOT NULL,
  producto_id uuid NOT NULL,cantidad numeric NOT NULL,precio_unitario numeric NOT NULL,
  subtotal numeric NOT NULL,costo_unitario_fifo numeric
);
CREATE TABLE public.stock(
  producto_id uuid NOT NULL,almacen_id uuid NOT NULL,cantidad numeric NOT NULL,
  PRIMARY KEY(producto_id,almacen_id)
);
CREATE TABLE public.lotes_compra(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),producto_id uuid NOT NULL,almacen_id uuid NOT NULL,
  cantidad_restante numeric NOT NULL,costo_unitario numeric NOT NULL,fecha_compra timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.operaciones_idempotencia(
  idempotency_key uuid PRIMARY KEY,usuario_id uuid NOT NULL,operacion text NOT NULL,
  payload jsonb NOT NULL,resultado_id uuid
);

CREATE OR REPLACE FUNCTION public.tiene_permiso(p_modulo text,p_accion text)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

CREATE OR REPLACE FUNCTION private.reclamar_idempotencia(
  p_key uuid,p_uid uuid,p_operation text,p_payload jsonb
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_row private.operaciones_idempotencia%ROWTYPE;
BEGIN
  INSERT INTO private.operaciones_idempotencia(idempotency_key,usuario_id,operacion,payload)
  VALUES(p_key,p_uid,p_operation,p_payload)
  ON CONFLICT(idempotency_key) DO NOTHING;
  SELECT * INTO v_row FROM private.operaciones_idempotencia WHERE idempotency_key=p_key;
  IF v_row.usuario_id<>p_uid OR v_row.operacion<>p_operation OR v_row.payload<>p_payload THEN
    RAISE EXCEPTION 'Idempotency key reused with a different request';
  END IF;
  RETURN v_row.resultado_id;
END
$$;

CREATE OR REPLACE FUNCTION public.obtener_conversion_presentacion(
  p_producto_id uuid,p_presentacion_id uuid,p_cantidad numeric
) RETURNS TABLE(unidades_base numeric) LANGUAGE sql STABLE AS $$
  SELECT p_cantidad*pp.factor
    FROM public.producto_presentaciones pp
   WHERE pp.producto_id=p_producto_id
     AND pp.presentacion_id=p_presentacion_id
     AND pp.activo IS DISTINCT FROM false
$$;
