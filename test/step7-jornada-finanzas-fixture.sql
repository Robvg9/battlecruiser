-- Disposable-only finance fixture for Step 7 Jornada tests.
-- It keeps the legacy sesion_id foreign keys pointed at sesiones_ciclo.
-- It is applied only after step5/step7 fixtures and is never used against LIVE.

CREATE TABLE IF NOT EXISTS public.ciclos_operativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE IF NOT EXISTS public.sesiones_ciclo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS nombre text;
UPDATE public.usuarios SET nombre='Usuario fixture' WHERE nombre IS NULL;

CREATE TABLE public.gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id uuid REFERENCES public.almacenes(id),
  ciclo_id uuid REFERENCES public.ciclos_operativos(id),
  sesion_id uuid REFERENCES public.sesiones_ciclo(id),
  concepto text NOT NULL,
  descripcion text,
  monto numeric NOT NULL CHECK (monto>0),
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','APROBADO','RECHAZADO')),
  creado_por uuid REFERENCES auth.users(id),
  creado_nombre text,
  revisado_por uuid REFERENCES auth.users(id),
  revisado_nombre text,
  comentario_revision text,
  fecha_revision timestamptz,
  idempotency_key uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gastos_idempotency_actor_idx ON public.gastos(idempotency_key,creado_por);

CREATE TABLE public.reinversiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),
  ciclo_id uuid REFERENCES public.ciclos_operativos(id),
  sesion_id uuid REFERENCES public.sesiones_ciclo(id),
  turno_id uuid REFERENCES public.turnos(id),
  proveedor text,
  fecha timestamptz NOT NULL DEFAULT now(),
  total numeric NOT NULL DEFAULT 0 CHECK (total>=0),
  usuario_id uuid REFERENCES auth.users(id),
  usuario_nombre text,
  idempotency_key uuid NOT NULL UNIQUE,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reinversiones_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reinversion_id uuid NOT NULL REFERENCES public.reinversiones(id),
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  presentacion_id uuid,
  cantidad_presentacion numeric,
  cantidad_base numeric NOT NULL CHECK (cantidad_base>0),
  costo_total numeric NOT NULL CHECK (costo_total>0),
  costo_unitario numeric NOT NULL CHECK (costo_unitario>0)
);

ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reinversiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reinversiones_lineas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gastos,public.reinversiones,public.reinversiones_lineas
  FROM PUBLIC,anon,authenticated;

CREATE TABLE public.lotes_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),
  cantidad_inicial numeric NOT NULL,
  cantidad_restante numeric NOT NULL,
  costo_unitario numeric NOT NULL,
  fecha_compra timestamptz NOT NULL,
  origen text NOT NULL,
  usuario_id uuid NOT NULL REFERENCES auth.users(id),
  compra_id uuid
);

CREATE TABLE public.movimientos_caja_fixture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id uuid NOT NULL,
  turno_id uuid,
  tipo text NOT NULL,
  direccion text NOT NULL,
  monto numeric NOT NULL,
  referencia_tipo text,
  referencia_id uuid,
  descripcion text,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.registrar_movimiento_caja(
  p_almacen_id uuid,p_ciclo_id uuid,p_sesion_id uuid,p_turno_id uuid,
  p_tipo text,p_direccion text,p_monto numeric,p_referencia_tipo text,
  p_referencia_id uuid,p_concepto text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.movimientos_caja_fixture
    (almacen_id,turno_id,tipo,direccion,monto,referencia_tipo,referencia_id,descripcion)
  VALUES (p_almacen_id,p_turno_id,p_tipo,p_direccion,p_monto,p_referencia_tipo,p_referencia_id,p_concepto)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- A disposable implementation of the existing reinvestment contract. It exercises
-- the same inputs and stock/FIFO/cash side effects required by the Jornada wrapper.
CREATE OR REPLACE FUNCTION public.registrar_reinversion_multiple(
  p_almacen_id uuid,
  p_proveedor text DEFAULT NULL,
  p_fecha timestamptz DEFAULT now(),
  p_lineas jsonb DEFAULT '[]'::jsonb,
  p_ciclo_id uuid DEFAULT NULL,
  p_sesion_id uuid DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $fn$
DECLARE
  v_uid uuid:=auth.uid();
  v_id uuid;
  v_line jsonb;
  v_producto uuid;
  v_cantidad numeric;
  v_costo numeric;
  v_total numeric:=0;
  v_nombre text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE='42501'; END IF;
  IF NOT public.tiene_permiso('reinversiones','crear') THEN RAISE EXCEPTION 'Sin permiso.' USING ERRCODE='42501'; END IF;
  IF p_idempotency_key IS NULL OR p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array'
     OR jsonb_array_length(p_lineas)=0 THEN
    RAISE EXCEPTION 'Líneas y clave de idempotencia obligatorias.' USING ERRCODE='22023';
  END IF;
  SELECT id INTO v_id FROM public.reinversiones WHERE idempotency_key=p_idempotency_key;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.almacenes WHERE id=p_almacen_id) THEN
    RAISE EXCEPTION 'Almacén no encontrado.' USING ERRCODE='23503';
  END IF;
  SELECT nombre INTO v_nombre FROM public.usuarios WHERE id=v_uid;
  INSERT INTO public.reinversiones
    (almacen_id,ciclo_id,sesion_id,turno_id,proveedor,fecha,usuario_id,usuario_nombre,idempotency_key)
  VALUES
    (p_almacen_id,p_ciclo_id,p_sesion_id,p_turno_id,NULLIF(btrim(p_proveedor),''),coalesce(p_fecha,now()),v_uid,v_nombre,p_idempotency_key)
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lineas) AS x(value) LOOP
    v_producto:=nullif(v_line->>'producto_id','')::uuid;
    v_cantidad:=nullif(v_line->>'cantidad_base','')::numeric;
    v_costo:=nullif(v_line->>'costo_total','')::numeric;
    IF v_producto IS NULL OR v_cantidad IS NULL OR v_cantidad<=0 OR v_costo IS NULL OR v_costo<=0 THEN
      RAISE EXCEPTION 'Línea de reinversión inválida.' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.productos WHERE id=v_producto) THEN
      RAISE EXCEPTION 'Producto no encontrado.' USING ERRCODE='23503';
    END IF;
    INSERT INTO public.reinversiones_lineas
      (reinversion_id,producto_id,presentacion_id,cantidad_presentacion,cantidad_base,costo_total,costo_unitario)
    VALUES (v_id,v_producto,nullif(v_line->>'presentacion_id','')::uuid,
      nullif(v_line->>'cantidad_presentacion','')::numeric,v_cantidad,v_costo,v_costo/v_cantidad);
    INSERT INTO public.lotes_compra
      (producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario,fecha_compra,origen,usuario_id,compra_id)
    VALUES (v_producto,p_almacen_id,v_cantidad,v_cantidad,v_costo/v_cantidad,
      coalesce(p_fecha,now()),'reinversion',v_uid,NULL);
    UPDATE public.stock SET cantidad=cantidad+v_cantidad,updated_at=now()
    WHERE producto_id=v_producto AND almacen_id=p_almacen_id;
    IF NOT FOUND THEN
      INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
      VALUES(v_producto,p_almacen_id,v_cantidad,0);
    END IF;
    v_total:=v_total+v_costo;
  END LOOP;
  UPDATE public.reinversiones SET total=v_total WHERE id=v_id;
  PERFORM private.registrar_movimiento_caja(p_almacen_id,p_ciclo_id,p_sesion_id,p_turno_id,
    'REINVERSION','SALIDA',v_total,'reinversion',v_id,
    coalesce(nullif(btrim(p_proveedor),''),'Reinversión de inventario'));
  RETURN v_id;
END;
$fn$;
