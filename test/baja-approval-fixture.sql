CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE TABLE public.usuarios (
  id uuid PRIMARY KEY,
  nombre text NOT NULL
);

CREATE TABLE public.permisos_usuario (
  usuario_id uuid NOT NULL,
  seccion text NOT NULL,
  accion text NOT NULL,
  permitido boolean NOT NULL DEFAULT true,
  PRIMARY KEY (usuario_id, seccion, accion)
);

CREATE OR REPLACE FUNCTION public.tiene_permiso(p_seccion text, p_accion text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((
    SELECT p.permitido
    FROM public.permisos_usuario p
    WHERE p.usuario_id = auth.uid()
      AND p.seccion = p_seccion
      AND p.accion = p_accion
    LIMIT 1
  ), false);
$$;

CREATE TABLE public.almacenes (
  id uuid PRIMARY KEY,
  nombre text NOT NULL
);

CREATE TABLE public.productos (
  id uuid PRIMARY KEY,
  nombre text NOT NULL
);

CREATE TABLE public.stock (
  almacen_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  cantidad numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (almacen_id, producto_id)
);

CREATE TABLE public.lotes_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  fecha_compra timestamptz NOT NULL,
  cantidad_restante numeric NOT NULL
);

CREATE TABLE public.bajas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  ciclo_id uuid,
  sesion_id uuid,
  cantidad numeric NOT NULL,
  motivo text NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE',
  creado_por uuid,
  creado_nombre text,
  revisado_por uuid,
  revisado_nombre text,
  comentario_revision text,
  fecha_revision timestamptz,
  idempotency_key uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  creado_nombre text,
  almacen_id uuid,
  concepto text NOT NULL,
  monto numeric NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE',
  descripcion text
);

CREATE TABLE public.mermas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  creado_nombre text,
  almacen_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  cantidad numeric NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE',
  motivo text NOT NULL
);

CREATE OR REPLACE FUNCTION public._aplicar_salida_aprobada(
  p_almacen_id uuid,
  p_producto_id uuid,
  p_cantidad numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_stock numeric;
  v_restante numeric;
  v_l record;
  v_tomar numeric;
BEGIN
  SELECT cantidad INTO v_stock
  FROM public.stock
  WHERE almacen_id = p_almacen_id AND producto_id = p_producto_id
  FOR UPDATE;

  IF v_stock IS NULL OR v_stock < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente al aprobar la salida';
  END IF;

  v_restante := p_cantidad;
  FOR v_l IN
    SELECT id, cantidad_restante
    FROM public.lotes_compra
    WHERE almacen_id = p_almacen_id
      AND producto_id = p_producto_id
      AND cantidad_restante > 0
    ORDER BY fecha_compra ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_restante <= 0;
    v_tomar := LEAST(v_l.cantidad_restante, v_restante);
    UPDATE public.lotes_compra
    SET cantidad_restante = cantidad_restante - v_tomar
    WHERE id = v_l.id;
    v_restante := v_restante - v_tomar;
  END LOOP;

  IF v_restante > 0 THEN
    RAISE EXCEPTION 'No existe trazabilidad FIFO suficiente para aprobar la salida';
  END IF;

  UPDATE public.stock
  SET cantidad = cantidad - p_cantidad, updated_at = now()
  WHERE almacen_id = p_almacen_id AND producto_id = p_producto_id;
END;
$function$;

INSERT INTO public.usuarios (id, nombre) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Dueño de prueba'),
  ('22222222-2222-4222-8222-222222222222', 'Empleado de prueba');

INSERT INTO public.permisos_usuario (usuario_id, seccion, accion, permitido) VALUES
  ('11111111-1111-4111-8111-111111111111', 'bajas', 'crear', true),
  ('11111111-1111-4111-8111-111111111111', 'bajas', 'editar_any', true),
  ('22222222-2222-4222-8222-222222222222', 'bajas', 'crear', true);

INSERT INTO public.almacenes (id, nombre)
VALUES ('33333333-3333-4333-8333-333333333333', 'Almacén de prueba');

INSERT INTO public.productos (id, nombre)
VALUES ('44444444-4444-4444-8444-444444444444', 'Producto de prueba');

INSERT INTO public.stock (almacen_id, producto_id, cantidad)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  50
);

INSERT INTO public.lotes_compra (almacen_id, producto_id, fecha_compra, cantidad_restante)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '2026-11-01T10:00:00Z',
  50
);
