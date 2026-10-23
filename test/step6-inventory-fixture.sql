-- Disposable-only schema for Step 6 PostgreSQL 17 contract tests.
-- This fixture has no connection to Supabase LIVE and contains no copied production rows.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $fn$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $fn$;

CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE private.operaciones_idempotencia(
  idempotency_key uuid PRIMARY KEY,
  usuario_id uuid NOT NULL,
  operacion text NOT NULL,
  payload jsonb NOT NULL,
  resultado_id uuid
);
CREATE OR REPLACE FUNCTION private.reclamar_idempotencia(
  p_key uuid,p_user uuid,p_operation text,p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
AS $fn$
DECLARE v private.operaciones_idempotencia;
BEGIN
  SELECT * INTO v FROM private.operaciones_idempotencia WHERE idempotency_key=p_key FOR UPDATE;
  IF FOUND THEN
    IF v.usuario_id<>p_user OR v.operacion<>p_operation OR v.payload<>p_payload THEN
      RAISE EXCEPTION 'La clave de idempotencia ya se usó con otra operación.';
    END IF;
    RETURN COALESCE(v.resultado_id,p_key);
  END IF;
  INSERT INTO private.operaciones_idempotencia(idempotency_key,usuario_id,operacion,payload)
  VALUES(p_key,p_user,p_operation,p_payload);
  RETURN NULL;
END
$fn$;

CREATE TABLE public.almacenes(id uuid PRIMARY KEY,nombre text NOT NULL);
CREATE TABLE public.productos(id uuid PRIMARY KEY,nombre text NOT NULL);
CREATE TABLE public.usuarios(id uuid PRIMARY KEY REFERENCES auth.users(id),nombre text NOT NULL,activo boolean NOT NULL DEFAULT true);
CREATE TABLE public.lotes_compra(
  id uuid PRIMARY KEY,producto_id uuid NOT NULL,almacen_id uuid NOT NULL,
  cantidad_inicial numeric NOT NULL,cantidad_restante numeric NOT NULL,costo_unitario numeric NOT NULL,
  fecha_compra timestamptz NOT NULL,origen text NOT NULL,usuario_id uuid,creado_en timestamptz NOT NULL DEFAULT now(),compra_id uuid
);
CREATE TABLE public.ventas(id uuid PRIMARY KEY,almacen_id uuid NOT NULL,total numeric NOT NULL DEFAULT 0,estado text NOT NULL DEFAULT 'CONFIRMADA',creado_por uuid,fecha timestamptz NOT NULL);
CREATE TABLE public.ventas_lineas(id uuid PRIMARY KEY,venta_id uuid NOT NULL,producto_id uuid NOT NULL,cantidad numeric NOT NULL,costo_unitario_fifo numeric);
CREATE TABLE public.transferencias(id uuid PRIMARY KEY,almacen_origen_id uuid NOT NULL,almacen_destino_id uuid NOT NULL,estado text NOT NULL DEFAULT 'COMPLETADA',creado_por uuid,fecha timestamptz NOT NULL);
CREATE TABLE public.transferencias_lineas(id uuid PRIMARY KEY,transferencia_id uuid NOT NULL,producto_id uuid NOT NULL,cantidad numeric NOT NULL);
CREATE TABLE public.vales_salida(id uuid PRIMARY KEY,producto_id uuid NOT NULL,almacen_id uuid NOT NULL,tipo text,cantidad numeric NOT NULL,estado text NOT NULL DEFAULT 'CONFIRMADO',creado_por uuid,fecha timestamptz NOT NULL);
CREATE TABLE public.stock(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),producto_id uuid NOT NULL,almacen_id uuid NOT NULL,cantidad numeric NOT NULL,minimo numeric,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(producto_id,almacen_id));
CREATE TABLE public.mermas(
  id uuid PRIMARY KEY,almacen_id uuid NOT NULL,producto_id uuid NOT NULL,ciclo_id uuid,sesion_id uuid,
  cantidad numeric NOT NULL,motivo text NOT NULL,estado text NOT NULL DEFAULT 'PENDIENTE',
  creado_por uuid NOT NULL,creado_nombre text,revisado_por uuid,revisado_nombre text,comentario_revision text,
  fecha_revision timestamptz,idempotency_key uuid,creado_en timestamptz NOT NULL DEFAULT now(),actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bajas(
  id uuid PRIMARY KEY,almacen_id uuid NOT NULL,producto_id uuid NOT NULL,ciclo_id uuid,sesion_id uuid,
  cantidad numeric NOT NULL,motivo text NOT NULL,estado text NOT NULL DEFAULT 'PENDIENTE',
  creado_por uuid NOT NULL,creado_nombre text,revisado_por uuid,revisado_nombre text,comentario_revision text,
  fecha_revision timestamptz,idempotency_key uuid,creado_en timestamptz NOT NULL DEFAULT now(),actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.gastos(
  id uuid PRIMARY KEY,monto numeric NOT NULL,estado text NOT NULL DEFAULT 'PENDIENTE',
  creado_por uuid NOT NULL,revisado_por uuid,revisado_nombre text,comentario_revision text,
  fecha_revision timestamptz,actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.turnos(id uuid PRIMARY KEY,usuario_id uuid NOT NULL,almacen_id uuid NOT NULL,fecha date NOT NULL);
CREATE TABLE public.cuadres(
  id uuid PRIMARY KEY,turno_id uuid NOT NULL,dinero_esperado numeric NOT NULL,dinero_declarado numeric,
  diferencia numeric,estado text NOT NULL DEFAULT 'PENDIENTE',observacion text,revisado_por uuid,revisado_nombre text,
  comentario_revision text,fecha_revision timestamptz,creado_en timestamptz NOT NULL DEFAULT now(),actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.incidencias(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tipo text NOT NULL,descripcion text NOT NULL,usuario_id uuid NOT NULL,
  turno_id uuid NOT NULL,cuadre_id uuid NOT NULL,estado text NOT NULL,creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.tiene_permiso(p_seccion text,p_accion text)
RETURNS boolean LANGUAGE sql STABLE
AS $fn$
  SELECT strpos(','||coalesce(current_setting('test.perms',true),'')||',',
                ','||p_seccion||':'||p_accion||',')>0
$fn$;
CREATE OR REPLACE FUNCTION public._validar_usuario_operacion(p_seccion text,p_accion text)
RETURNS uuid LANGUAGE plpgsql STABLE
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE='42501'; END IF;
  IF NOT public.tiene_permiso(p_seccion,p_accion) THEN
    RAISE EXCEPTION 'Sin permiso para % en %.',p_accion,p_seccion USING ERRCODE='42501';
  END IF;
  RETURN auth.uid();
END
$fn$;
CREATE OR REPLACE FUNCTION public._aplicar_salida_aprobada(p_almacen_id uuid,p_producto_id uuid,p_cantidad numeric)
RETURNS void LANGUAGE plpgsql
AS $fn$
DECLARE v_stock numeric;v_restante numeric;v_l record;v_tomar numeric;
BEGIN
  SELECT cantidad INTO v_stock FROM public.stock WHERE almacen_id=p_almacen_id AND producto_id=p_producto_id FOR UPDATE;
  IF v_stock IS NULL OR v_stock<p_cantidad THEN RAISE EXCEPTION 'Stock insuficiente al aprobar la salida'; END IF;
  v_restante:=p_cantidad;
  FOR v_l IN SELECT id,cantidad_restante FROM public.lotes_compra
    WHERE almacen_id=p_almacen_id AND producto_id=p_producto_id AND cantidad_restante>0
    ORDER BY fecha_compra ASC FOR UPDATE
  LOOP
    EXIT WHEN v_restante<=0;
    v_tomar:=LEAST(v_l.cantidad_restante,v_restante);
    UPDATE public.lotes_compra SET cantidad_restante=cantidad_restante-v_tomar WHERE id=v_l.id;
    v_restante:=v_restante-v_tomar;
  END LOOP;
  IF v_restante>0 THEN RAISE EXCEPTION 'No existe trazabilidad FIFO suficiente para aprobar la salida'; END IF;
  UPDATE public.stock SET cantidad=cantidad-p_cantidad,updated_at=now() WHERE almacen_id=p_almacen_id AND producto_id=p_producto_id;
END
$fn$;
CREATE OR REPLACE FUNCTION public.registrar_auditoria(
  p_tipo text,p_descripcion text,p_resultado text,p_entidad_id text,p_idempotency_key uuid,p_detalles jsonb
) RETURNS bigint LANGUAGE sql AS $fn$ SELECT 1::bigint $fn$;

INSERT INTO public.almacenes(id,nombre) VALUES
 ('10000000-0000-0000-0000-000000000001','Almacén A'),
 ('10000000-0000-0000-0000-000000000002','Almacén B');
INSERT INTO public.productos(id,nombre) VALUES('30000000-0000-0000-0000-000000000001','Producto fixture');
INSERT INTO auth.users(id) VALUES
 ('20000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002');
INSERT INTO public.usuarios(id,nombre) VALUES
 ('20000000-0000-0000-0000-000000000001','Dueño Fixture'),
 ('20000000-0000-0000-0000-000000000002','Revisor Fixture');

INSERT INTO public.lotes_compra(id,producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario,fecha_compra,origen,usuario_id)
VALUES
 ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',50,50,2,'2030-01-02 15:00:00+00','compra','20000000-0000-0000-0000-000000000001');
INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',50,5);

INSERT INTO public.ventas(id,almacen_id,total,creado_por,fecha)
VALUES('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',8,'20000000-0000-0000-0000-000000000001','2030-01-03 15:00:00+00');
INSERT INTO public.ventas_lineas(id,venta_id,producto_id,cantidad,costo_unitario_fifo)
VALUES('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',2,2);

INSERT INTO public.transferencias(id,almacen_origen_id,almacen_destino_id,creado_por,fecha)
VALUES('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','2030-01-04 15:00:00+00');
INSERT INTO public.transferencias_lineas(id,transferencia_id,producto_id,cantidad)
VALUES('61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',3);

INSERT INTO public.vales_salida(id,producto_id,almacen_id,tipo,cantidad,creado_por,fecha)
VALUES('70000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','SALIDA',1,'20000000-0000-0000-0000-000000000001','2030-01-05 15:00:00+00');
INSERT INTO public.mermas(id,almacen_id,producto_id,cantidad,motivo,estado,creado_por,creado_nombre,revisado_nombre,fecha_revision,creado_en,actualizado_en)
VALUES
 ('80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1,'Merma histórica','APROBADA','20000000-0000-0000-0000-000000000001','Dueño Fixture','Revisor Fixture','2030-01-06 15:00:00+00','2030-01-06 15:00:00+00','2030-01-06 15:00:00+00'),
 ('80000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',2,'Merma pendiente','PENDIENTE','20000000-0000-0000-0000-000000000001','Dueño Fixture',NULL,NULL,'2030-01-07 15:00:00+00','2030-01-07 15:00:00+00');
INSERT INTO public.bajas(id,almacen_id,producto_id,cantidad,motivo,estado,creado_por,creado_nombre,revisado_nombre,fecha_revision,creado_en,actualizado_en)
VALUES
 ('81000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1,'Baja histórica','APROBADA','20000000-0000-0000-0000-000000000001','Dueño Fixture','Revisor Fixture','2030-01-08 15:00:00+00','2030-01-08 15:00:00+00','2030-01-08 15:00:00+00'),
 ('81000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',2,'Baja pendiente','PENDIENTE','20000000-0000-0000-0000-000000000001','Dueño Fixture',NULL,NULL,'2030-01-09 15:00:00+00','2030-01-09 15:00:00+00');

INSERT INTO public.turnos(id,usuario_id,almacen_id,fecha)
VALUES
 ('90000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2030-01-10'),
 ('90000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2030-01-11'),
 ('90000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2030-01-12');
INSERT INTO public.cuadres(id,turno_id,dinero_esperado,estado)
VALUES
 ('91000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001',100,'PENDIENTE'),
 ('91000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000002',100,'PENDIENTE'),
 ('91000000-0000-0000-0000-000000000003','90000000-0000-0000-0000-000000000003',100,'PENDIENTE');
