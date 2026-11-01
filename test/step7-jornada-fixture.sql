-- Disposable-only baseline for Step 7 contract checks. Uses the Step 5 fixture; no LIVE rows.
\i test/step5-jornada-fixture.sql

CREATE TABLE public.productos(
  id uuid PRIMARY KEY,nombre text NOT NULL,unidad text NOT NULL DEFAULT 'ud',
  activo boolean NOT NULL DEFAULT true
);
CREATE TABLE public.stock(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),producto_id uuid NOT NULL REFERENCES public.productos(id),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),cantidad numeric(14,3) NOT NULL DEFAULT 0,
  minimo numeric(14,3),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(producto_id,almacen_id)
);
CREATE TABLE public.mermas(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),almacen_id uuid NOT NULL,producto_id uuid NOT NULL,
  ciclo_id uuid,sesion_id uuid,cantidad numeric(14,3) NOT NULL,motivo text NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE',creado_por uuid NOT NULL,creado_nombre text,
  idempotency_key uuid,creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bajas(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),almacen_id uuid NOT NULL,producto_id uuid NOT NULL,
  ciclo_id uuid,sesion_id uuid,cantidad numeric(14,3) NOT NULL,motivo text NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE',creado_por uuid NOT NULL,creado_nombre text,
  idempotency_key uuid,creado_en timestamptz NOT NULL DEFAULT now()
);

-- Mirror the production approval metadata used by the Jornada finance read RPCs.
ALTER TABLE public.mermas
  ADD COLUMN revisado_por uuid,
  ADD COLUMN revisado_nombre text,
  ADD COLUMN comentario_revision text,
  ADD COLUMN fecha_revision timestamptz,
  ADD COLUMN actualizado_en timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.bajas
  ADD COLUMN revisado_por uuid,
  ADD COLUMN revisado_nombre text,
  ADD COLUMN comentario_revision text,
  ADD COLUMN fecha_revision timestamptz,
  ADD COLUMN actualizado_en timestamptz NOT NULL DEFAULT now();
CREATE OR REPLACE FUNCTION public.tiene_permiso(p_seccion text,p_accion text)
RETURNS boolean LANGUAGE sql STABLE
AS $fn$
 SELECT coalesce(current_setting('test.bc_admin',true),'false')='true'
   OR strpos(','||coalesce(current_setting('test.perms',true),'')||',',
             ','||p_seccion||':'||p_accion||',')>0
$fn$;

-- Mirror the production authorization boundary: creation is operational, not administrative.
CREATE OR REPLACE FUNCTION public.bc_actor_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
 SELECT public.tiene_permiso('turnos','editar_any')
     OR public.tiene_permiso('ciclos','editar_any')
$fn$;

CREATE OR REPLACE FUNCTION public.crear_merma(
 p_almacen_id uuid,p_producto_id uuid,p_cantidad numeric,p_motivo text,
 p_ciclo_id uuid DEFAULT NULL,p_sesion_id uuid DEFAULT NULL,p_idempotency_key uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_id uuid;
BEGIN
 IF NOT public.tiene_permiso('mermas','crear') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
 SELECT id INTO v_id FROM public.mermas WHERE idempotency_key=p_idempotency_key AND creado_por=auth.uid();
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 INSERT INTO public.mermas(almacen_id,producto_id,cantidad,motivo,ciclo_id,sesion_id,creado_por,idempotency_key)
 VALUES(p_almacen_id,p_producto_id,p_cantidad,p_motivo,p_ciclo_id,p_sesion_id,auth.uid(),p_idempotency_key)
 RETURNING id INTO v_id;
 RETURN v_id;
END
$fn$;
CREATE OR REPLACE FUNCTION public.crear_baja(
 p_almacen_id uuid,p_producto_id uuid,p_cantidad numeric,p_motivo text,
 p_ciclo_id uuid DEFAULT NULL,p_sesion_id uuid DEFAULT NULL,p_idempotency_key uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_id uuid;
BEGIN
 IF NOT public.tiene_permiso('bajas','crear') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
 SELECT id INTO v_id FROM public.bajas WHERE idempotency_key=p_idempotency_key AND creado_por=auth.uid();
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 INSERT INTO public.bajas(almacen_id,producto_id,cantidad,motivo,ciclo_id,sesion_id,creado_por,idempotency_key)
 VALUES(p_almacen_id,p_producto_id,p_cantidad,p_motivo,p_ciclo_id,p_sesion_id,auth.uid(),p_idempotency_key)
 RETURNING id INTO v_id;
 RETURN v_id;
END
$fn$;

INSERT INTO public.productos(id,nombre,unidad,activo) VALUES
 ('31000000-0000-0000-0000-000000000001','Pan','ud',true),
 ('31000000-0000-0000-0000-000000000002','Jugo','botella',true);
INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo) VALUES
 ('31000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',10,2),
 ('31000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',5,1);
