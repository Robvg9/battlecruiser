CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $roles$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END; $roles$;
DO $roles$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END; $roles$;
DO $roles$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END; $roles$;
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

CREATE UNIQUE INDEX bajas_creador_idempotency_key_uidx
ON public.bajas (creado_por, idempotency_key)
WHERE idempotency_key IS NOT NULL;

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

-- Test-only implementation of the existing single-line resolver RPC. The
-- grouped approval migration delegates each locked child to this established
-- operation; the fixture models its stock/FIFO and audit effects in isolation.
CREATE OR REPLACE FUNCTION public.resolver_aprobacion_operativa(
  p_tipo text,
  p_id uuid,
  p_decision text,
  p_comentario text,
  p_cantidad_real numeric,
  p_monto_real numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_baja public.bajas%ROWTYPE;
  v_nombre text;
BEGIN
  IF p_tipo<>'baja' THEN
    RAISE EXCEPTION 'La fixture solo modela la resolución de Bajas.';
  END IF;
  IF auth.uid() IS NULL OR NOT (
    public.tiene_permiso('bajas','editar_any')
    OR public.tiene_permiso('auditoria','editar_any')
  ) THEN
    RAISE EXCEPTION 'Sin permiso para resolver Bajas.';
  END IF;
  SELECT * INTO v_baja FROM public.bajas WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v_baja.estado<>'PENDIENTE' THEN
    RAISE EXCEPTION 'La Baja no está pendiente o no existe.';
  END IF;
  SELECT nombre INTO v_nombre FROM public.usuarios WHERE id=auth.uid();

  IF p_decision='APROBAR' THEN
    IF p_cantidad_real IS NULL OR p_cantidad_real<=0 OR p_cantidad_real>v_baja.cantidad THEN
      RAISE EXCEPTION 'La cantidad real debe ser positiva y no superar la cantidad solicitada.';
    END IF;
    PERFORM public._aplicar_salida_aprobada(
      v_baja.almacen_id,v_baja.producto_id,p_cantidad_real
    );
    UPDATE public.bajas
    SET cantidad=p_cantidad_real,estado='APROBADA',
        revisado_por=auth.uid(),revisado_nombre=v_nombre,
        comentario_revision=NULLIF(btrim(p_comentario),''),
        fecha_revision=now(),actualizado_en=now()
    WHERE id=p_id;
  ELSIF p_decision='RECHAZAR' THEN
    IF NULLIF(btrim(p_comentario),'') IS NULL THEN
      RAISE EXCEPTION 'El rechazo requiere un motivo.';
    END IF;
    UPDATE public.bajas
    SET estado='RECHAZADA',revisado_por=auth.uid(),
        revisado_nombre=v_nombre,comentario_revision=btrim(p_comentario),
        fecha_revision=now(),actualizado_en=now()
    WHERE id=p_id;
  ELSE
    RAISE EXCEPTION 'Decisión inválida.';
  END IF;

  RETURN jsonb_build_object('ok',true,'id',p_id,'decision',p_decision);
END;
$function$;

INSERT INTO public.usuarios (id, nombre) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Dueño de prueba'),
  ('22222222-2222-4222-8222-222222222222', 'Empleado de prueba'),
  ('55555555-5555-4555-8555-555555555555', 'Aprobador de gastos'),
  ('66666666-6666-4666-8666-666666666666', 'Aprobador de mermas');

INSERT INTO public.permisos_usuario (usuario_id, seccion, accion, permitido) VALUES
  ('11111111-1111-4111-8111-111111111111', 'bajas', 'crear', true),
  ('11111111-1111-4111-8111-111111111111', 'bajas', 'editar_any', true),
  ('22222222-2222-4222-8222-222222222222', 'bajas', 'crear', true),
  ('55555555-5555-4555-8555-555555555555', 'gastos', 'editar_any', true),
  ('66666666-6666-4666-8666-666666666666', 'mermas', 'editar_any', true);

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

-- Historical rows for the grouped-request migration: two lines share the
-- exact transaction timestamp; the third is deliberately 1 ms apart.
INSERT INTO public.productos (id,nombre)
VALUES ('77777777-7777-4777-8777-777777777777','Producto histórico de prueba');

INSERT INTO public.stock (almacen_id,producto_id,cantidad)
VALUES ('33333333-3333-4333-8333-333333333333',
        '77777777-7777-4777-8777-777777777777',10);

INSERT INTO public.lotes_compra (almacen_id,producto_id,fecha_compra,cantidad_restante)
VALUES ('33333333-3333-4333-8333-333333333333',
        '77777777-7777-4777-8777-777777777777','2026-11-01T10:00:00Z',10);

INSERT INTO public.bajas (
  almacen_id,producto_id,cantidad,motivo,estado,creado_por,creado_nombre,creado_en
) VALUES
  ('33333333-3333-4333-8333-333333333333','77777777-7777-4777-8777-777777777777',
   1,'Histórico línea 1','APROBADA','22222222-2222-4222-8222-222222222222',
   'Empleado de prueba','2026-11-09T12:00:00Z'),
  ('33333333-3333-4333-8333-333333333333','77777777-7777-4777-8777-777777777777',
   2,'Histórico línea 2','APROBADA','22222222-2222-4222-8222-222222222222',
   'Empleado de prueba','2026-11-09T12:00:00Z'),
  ('33333333-3333-4333-8333-333333333333','77777777-7777-4777-8777-777777777777',
   1,'Histórico separado','APROBADA','22222222-2222-4222-8222-222222222222',
   'Empleado de prueba','2026-11-09T12:00:00.001Z');

INSERT INTO public.lotes_compra (almacen_id, producto_id, fecha_compra, cantidad_restante)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '2026-11-01T10:00:00Z',
  50
);


-- One row from each other approval domain proves that module permissions stay isolated.
INSERT INTO public.gastos (almacen_id, concepto, monto, estado, creado_nombre, descripcion)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  'Gasto pendiente de prueba', 10, 'PENDIENTE', 'Usuario de prueba', 'No debe mostrarse a aprobadores de Baja.'
);

INSERT INTO public.mermas (almacen_id, producto_id, cantidad, estado, creado_nombre, motivo)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  1, 'PENDIENTE', 'Usuario de prueba', 'No debe mostrarse a aprobadores de Baja.'
);
