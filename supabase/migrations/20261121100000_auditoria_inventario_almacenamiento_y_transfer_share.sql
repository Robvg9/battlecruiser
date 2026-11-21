-- BattleCruiser: physical inventory audits for storage warehouses + transfer share metadata.
-- Live changes require an explicit production gate. This file is applied through Supabase migration history.

BEGIN;

ALTER TABLE public.transferencias
  ADD COLUMN IF NOT EXISTS responsable_receptor_id uuid
  REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsable_receptor_nombre text;

CREATE INDEX IF NOT EXISTS idx_transferencias_responsable_receptor
  ON public.transferencias(responsable_receptor_id)
  WHERE responsable_receptor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.auditorias_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),
  estado text NOT NULL DEFAULT 'EN_CONTEO'
    CHECK (estado IN ('EN_CONTEO','CERRADA','CANCELADA')),
  fecha_apertura timestamptz NOT NULL DEFAULT now(),
  fecha_cierre timestamptz,
  vence_en timestamptz NOT NULL DEFAULT (now() + interval '4 hours'),
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  creado_por uuid NOT NULL REFERENCES auth.users(id),
  creado_nombre text NOT NULL,
  idempotency_key uuid NOT NULL,
  observacion text,
  UNIQUE (creado_por, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_auditoria_inventario_un_conteo_por_almacen
  ON public.auditorias_inventario(almacen_id)
  WHERE estado = 'EN_CONTEO';

CREATE INDEX IF NOT EXISTS idx_auditoria_inventario_fecha
  ON public.auditorias_inventario(fecha_apertura DESC);

CREATE TABLE IF NOT EXISTS public.auditorias_inventario_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id uuid NOT NULL REFERENCES public.auditorias_inventario(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  producto_nombre text NOT NULL,
  unidad text NOT NULL DEFAULT 'unidad',
  variante_nombre text,
  cantidad_sistema numeric NOT NULL DEFAULT 0 CHECK (cantidad_sistema >= 0),
  cantidad_fisica numeric CHECK (cantidad_fisica IS NULL OR cantidad_fisica >= 0),
  diferencia numeric,
  decision text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (decision IN ('PENDIENTE','JUSTIFICADA','INVESTIGAR','SOBRANTE_PENDIENTE','BAJA_REGISTRADA')),
  motivo text,
  baja_id uuid REFERENCES public.bajas(id) ON DELETE SET NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auditoria_id, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_auditoria_inventario_lineas_auditoria
  ON public.auditorias_inventario_lineas(auditoria_id, producto_nombre);

CREATE OR REPLACE FUNCTION public.bc_guard_almacen_tipo_durante_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (OLD.tipo IS DISTINCT FROM NEW.tipo
      OR (OLD.activo IS DISTINCT FROM NEW.activo AND NEW.activo IS FALSE))
     AND EXISTS (
       SELECT 1 FROM public.auditorias_inventario ai
       WHERE ai.almacen_id = OLD.id
         AND ai.estado = 'EN_CONTEO'
         AND ai.vence_en > now()
     ) THEN
    RAISE EXCEPTION 'No se puede cambiar el tipo ni desactivar el almacén mientras tenga un conteo físico abierto.'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc_guard_almacen_tipo_durante_auditoria() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bc_guard_almacen_tipo_durante_auditoria ON public.almacenes;
CREATE TRIGGER bc_guard_almacen_tipo_durante_auditoria
BEFORE UPDATE OF tipo, activo ON public.almacenes
FOR EACH ROW
EXECUTE FUNCTION public.bc_guard_almacen_tipo_durante_auditoria();

ALTER TABLE public.auditorias_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditorias_inventario_lineas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auditorias_inventario_admin_only ON public.auditorias_inventario;
CREATE POLICY auditorias_inventario_admin_only
  ON public.auditorias_inventario
  FOR ALL TO authenticated
  USING (public.bc_actor_is_admin())
  WITH CHECK (public.bc_actor_is_admin());

DROP POLICY IF EXISTS auditorias_inventario_lineas_admin_only ON public.auditorias_inventario_lineas;
CREATE POLICY auditorias_inventario_lineas_admin_only
  ON public.auditorias_inventario_lineas
  FOR ALL TO authenticated
  USING (public.bc_actor_is_admin())
  WITH CHECK (public.bc_actor_is_admin());

REVOKE ALL ON public.auditorias_inventario FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.auditorias_inventario_lineas FROM PUBLIC, anon, authenticated;

-- The lock is enforced at the stock table boundary, so all existing inventory
-- writers (sales, purchases, transfers, write-offs, and adjustments) respect it.
-- FOR SHARE serializes each stock write with the warehouse FOR UPDATE taken
-- when a count begins or ends. A write already in flight finishes before the
-- snapshot; a new write sees the committed count window and is rejected.
CREATE OR REPLACE FUNCTION public.bc_guard_stock_during_inventory_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_almacen_id uuid;
  v_blocked boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.almacen_id IS DISTINCT FROM NEW.almacen_id THEN
    PERFORM 1 FROM public.almacenes WHERE id = OLD.almacen_id FOR SHARE;
    SELECT EXISTS (
      SELECT 1 FROM public.auditorias_inventario ai
      WHERE ai.almacen_id = OLD.almacen_id
        AND ai.estado = 'EN_CONTEO'
        AND ai.vence_en > now()
    ) INTO v_blocked;
    IF v_blocked THEN
      RAISE EXCEPTION 'El almacén tiene un conteo físico abierto. Termina o cancela la auditoría antes de mover inventario.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  v_almacen_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.almacen_id ELSE NEW.almacen_id END;
  PERFORM 1 FROM public.almacenes WHERE id = v_almacen_id FOR SHARE;

  SELECT EXISTS (
    SELECT 1 FROM public.auditorias_inventario ai
    WHERE ai.almacen_id = v_almacen_id
      AND ai.estado = 'EN_CONTEO'
      AND ai.vence_en > now()
  ) INTO v_blocked;

  IF v_blocked THEN
    RAISE EXCEPTION 'No se puede mover stock: el almacén tiene un conteo físico abierto. Termina o cancela la auditoría.'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc_guard_stock_during_inventory_audit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bc_stock_inventory_audit_guard ON public.stock;
CREATE TRIGGER bc_stock_inventory_audit_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.stock
FOR EACH ROW
EXECUTE FUNCTION public.bc_guard_stock_during_inventory_audit();

CREATE OR REPLACE FUNCTION public.bc_listar_almacenes_auditoria_inventario()
RETURNS TABLE (id uuid, nombre text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede consultar los almacenes auditables.'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.id, a.nombre
  FROM public.almacenes a
  WHERE a.activo IS DISTINCT FROM false
    AND a.tipo = 'almacenamiento'
  ORDER BY a.nombre;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc_listar_auditorias_inventario()
RETURNS TABLE (
  id uuid,
  almacen_id uuid,
  almacen_nombre text,
  estado text,
  fecha_apertura timestamptz,
  fecha_cierre timestamptz,
  vence_en timestamptz,
  total_lineas bigint,
  lineas_contadas bigint,
  diferencias bigint,
  pendientes_revision bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede consultar auditorías físicas.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ai.id,
    ai.almacen_id,
    a.nombre,
    CASE WHEN ai.estado = 'EN_CONTEO' AND ai.vence_en <= now()
      THEN 'CADUCADA' ELSE ai.estado END,
    ai.fecha_apertura,
    ai.fecha_cierre,
    ai.vence_en,
    count(l.id),
    count(l.id) FILTER (WHERE l.cantidad_fisica IS NOT NULL),
    count(l.id) FILTER (WHERE l.diferencia IS NOT NULL AND l.diferencia <> 0),
    count(l.id) FILTER (WHERE l.diferencia IS NOT NULL AND l.diferencia <> 0 AND l.decision = 'PENDIENTE')
  FROM public.auditorias_inventario ai
  JOIN public.almacenes a ON a.id = ai.almacen_id
  LEFT JOIN public.auditorias_inventario_lineas l ON l.auditoria_id = ai.id
  WHERE a.tipo = 'almacenamiento'
  GROUP BY ai.id, a.nombre
  ORDER BY ai.fecha_apertura DESC
  LIMIT 40;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc_crear_auditoria_inventario(
  p_almacen_id uuid,
  p_observacion text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tipo text;
  v_nombre text;
  v_id uuid;
  v_existente uuid;
  v_lineas integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede abrir una auditoría física.'
      USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Falta la clave anti-duplicados de la auditoría.';
  END IF;
  IF p_observacion IS NOT NULL AND length(btrim(p_observacion)) > 500 THEN
    RAISE EXCEPTION 'La observación no puede superar 500 caracteres.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_idempotency_key::text, 0));

  SELECT id INTO v_existente
  FROM public.auditorias_inventario
  WHERE creado_por = auth.uid() AND idempotency_key = p_idempotency_key;
  IF v_existente IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'id', v_existente, 'repetida', true);
  END IF;

  -- Serialize count creation with every stock write at this warehouse.
  SELECT tipo INTO v_tipo
  FROM public.almacenes
  WHERE id = p_almacen_id AND activo IS DISTINCT FROM false
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El almacén no existe o está inactivo.';
  END IF;
  IF v_tipo <> 'almacenamiento' THEN
    RAISE EXCEPTION 'La auditoría física solo está disponible para almacenes de almacenamiento. Los minoristas no se pueden auditar con este conteo.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.auditorias_inventario
  SET estado = 'CANCELADA',
      fecha_cierre = coalesce(fecha_cierre, now()),
      observacion = concat_ws(E'\n', nullif(observacion,''), 'Conteo caducado automáticamente al abrir una nueva auditoría.')
  WHERE almacen_id = p_almacen_id
    AND estado = 'EN_CONTEO'
    AND vence_en <= now();

  IF EXISTS (
    SELECT 1 FROM public.auditorias_inventario
    WHERE almacen_id = p_almacen_id AND estado = 'EN_CONTEO' AND vence_en > now()
  ) THEN
    RAISE EXCEPTION 'Ya existe un conteo físico abierto para este almacén. Termínalo o cancélalo antes de iniciar otro.';
  END IF;

  SELECT nombre INTO v_nombre FROM public.usuarios WHERE id = auth.uid();

  INSERT INTO public.auditorias_inventario(
    almacen_id, estado, creado_por, creado_nombre, idempotency_key, observacion, vence_en
  )
  VALUES(
    p_almacen_id, 'EN_CONTEO', auth.uid(), coalesce(v_nombre,'Dueño'),
    p_idempotency_key, nullif(btrim(p_observacion),''), now() + interval '4 hours'
  )
  RETURNING id INTO v_id;

  INSERT INTO public.auditorias_inventario_lineas(
    auditoria_id, producto_id, producto_nombre, unidad, variante_nombre, cantidad_sistema
  )
  SELECT
    v_id,
    p.id,
    p.nombre,
    coalesce(nullif(btrim(p.unidad),''),'unidad'),
    CASE
      WHEN p.inventario_mixto IS TRUE
        AND p.producto_padre_id IS NULL
        AND coalesce(s.cantidad,0) > 0
      THEN 'Inventario sin distribuir'
      ELSE nullif(btrim(p.variante_nombre),'')
    END,
    coalesce(s.cantidad,0)
  FROM public.productos p
  LEFT JOIN public.stock s
    ON s.producto_id = p.id AND s.almacen_id = p_almacen_id
  WHERE p.activo IS TRUE
    AND p.archivado_at IS NULL
    AND (
      p.producto_padre_id IS NOT NULL
      OR p.inventario_mixto IS NOT TRUE
      OR coalesce(s.cantidad,0) > 0
      OR NOT EXISTS (
        SELECT 1 FROM public.productos v
        WHERE v.producto_padre_id = p.id AND v.activo IS TRUE
      )
    )
  ORDER BY p.nombre, p.id;

  GET DIAGNOSTICS v_lineas = ROW_COUNT;
  IF v_lineas = 0 THEN
    RAISE EXCEPTION 'Este almacén no tiene productos activos para contar.';
  END IF;

  PERFORM private.registrar_auditoria_interna(
    'auditoria_inventario',
    'Se inició un conteo físico en ' || (SELECT nombre FROM public.almacenes WHERE id = p_almacen_id) || '.',
    'exito',
    v_id::text,
    p_idempotency_key,
    jsonb_build_object('almacen_id',p_almacen_id,'lineas',v_lineas,'vence_en',now() + interval '4 hours')
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'lineas', v_lineas,
    'vence_en', now() + interval '4 hours',
    'repetida', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc_detalle_auditoria_inventario(p_auditoria_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cabecera jsonb;
  v_lineas jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede consultar el detalle de auditoría.'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', ai.id,
    'almacen_id', ai.almacen_id,
    'almacen_nombre', a.nombre,
    'estado', CASE WHEN ai.estado = 'EN_CONTEO' AND ai.vence_en <= now()
      THEN 'CADUCADA' ELSE ai.estado END,
    'fecha_apertura', ai.fecha_apertura,
    'fecha_cierre', ai.fecha_cierre,
    'vence_en', ai.vence_en,
    'creado_nombre', ai.creado_nombre,
    'observacion', ai.observacion
  )
  INTO v_cabecera
  FROM public.auditorias_inventario ai
  JOIN public.almacenes a ON a.id = ai.almacen_id
  WHERE ai.id = p_auditoria_id AND a.tipo = 'almacenamiento';

  IF v_cabecera IS NULL THEN
    RAISE EXCEPTION 'No se encontró la auditoría o el almacén no es de almacenamiento.';
  END IF;

  SELECT coalesce(
    jsonb_agg(jsonb_build_object(
      'id', l.id,
      'producto_id', l.producto_id,
      'producto_nombre', l.producto_nombre,
      'unidad', l.unidad,
      'variante_nombre', l.variante_nombre,
      'cantidad_sistema', l.cantidad_sistema,
      'cantidad_fisica', l.cantidad_fisica,
      'diferencia', l.diferencia,
      'decision', l.decision,
      'motivo', l.motivo,
      'baja_id', l.baja_id
    ) ORDER BY l.producto_nombre, l.variante_nombre NULLS FIRST, l.id),
    '[]'::jsonb
  )
  INTO v_lineas
  FROM public.auditorias_inventario_lineas l
  WHERE l.auditoria_id = p_auditoria_id;

  RETURN jsonb_build_object('cabecera',v_cabecera,'lineas',v_lineas);
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc_guardar_conteo_auditoria_inventario(
  p_auditoria_id uuid,
  p_lineas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_estado text;
  v_almacen_id uuid;
  v_actualizadas integer;
  v_total integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede guardar el conteo.'
      USING ERRCODE = '42501';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) > 500 THEN
    RAISE EXCEPTION 'El conteo debe enviarse como una lista válida de hasta 500 productos.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_lineas) AS x(id uuid, cantidad_fisica numeric)
    WHERE x.id IS NULL OR x.cantidad_fisica IS NULL OR x.cantidad_fisica < 0
  ) THEN
    RAISE EXCEPTION 'Cada cantidad física debe ser un número igual o mayor que cero.';
  END IF;
  IF EXISTS (
    SELECT x.id FROM jsonb_to_recordset(p_lineas) AS x(id uuid, cantidad_fisica numeric)
    GROUP BY x.id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Un producto aparece más de una vez en el conteo.';
  END IF;

  SELECT ai.estado, ai.almacen_id INTO v_estado, v_almacen_id
  FROM public.auditorias_inventario ai
  JOIN public.almacenes a ON a.id = ai.almacen_id
  WHERE ai.id = p_auditoria_id AND a.tipo = 'almacenamiento'
  FOR UPDATE OF ai;

  IF v_estado IS DISTINCT FROM 'EN_CONTEO' THEN
    RAISE EXCEPTION 'La auditoría no está abierta para introducir cantidades.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.auditorias_inventario
    WHERE id = p_auditoria_id AND vence_en <= now()
  ) THEN
    RAISE EXCEPTION 'La ventana de conteo caducó. Cancela esta auditoría y abre una nueva para evitar datos desactualizados.';
  END IF;

  UPDATE public.auditorias_inventario_lineas l
  SET cantidad_fisica = x.cantidad_fisica,
      diferencia = x.cantidad_fisica - l.cantidad_sistema,
      actualizado_en = now()
  FROM jsonb_to_recordset(p_lineas) AS x(id uuid, cantidad_fisica numeric)
  WHERE l.id = x.id AND l.auditoria_id = p_auditoria_id;

  GET DIAGNOSTICS v_actualizadas = ROW_COUNT;
  v_total := jsonb_array_length(p_lineas);
  IF v_actualizadas <> v_total THEN
    RAISE EXCEPTION 'El conteo contiene líneas que no pertenecen a esta auditoría.';
  END IF;

  RETURN jsonb_build_object('ok',true,'lineas_guardadas',v_actualizadas);
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc_cerrar_auditoria_inventario(p_auditoria_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_almacen_id uuid;
  v_faltan integer;
  v_diferencias integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede cerrar el conteo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT ai.almacen_id INTO v_almacen_id
  FROM public.auditorias_inventario ai
  JOIN public.almacenes a ON a.id = ai.almacen_id
  WHERE ai.id = p_auditoria_id
    AND ai.estado = 'EN_CONTEO'
    AND a.tipo = 'almacenamiento'
  FOR UPDATE OF ai;

  IF v_almacen_id IS NULL THEN
    RAISE EXCEPTION 'La auditoría no existe o ya no está abierta.';
  END IF;

  -- Serialize closure with stock writers. Once the state is committed as
  -- CERRADA, queued writers may proceed and the snapshot remains immutable.
  PERFORM 1 FROM public.almacenes WHERE id = v_almacen_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.auditorias_inventario
    WHERE id = p_auditoria_id AND vence_en <= now()
  ) THEN
    RAISE EXCEPTION 'La ventana de conteo caducó. Cancela la auditoría y comienza otra.';
  END IF;

  SELECT count(*)::integer INTO v_faltan
  FROM public.auditorias_inventario_lineas
  WHERE auditoria_id = p_auditoria_id AND cantidad_fisica IS NULL;

  IF v_faltan > 0 THEN
    RAISE EXCEPTION 'Todavía faltan % productos por contar. Completa todas las cantidades antes de cerrar.', v_faltan;
  END IF;

  SELECT count(*)::integer INTO v_diferencias
  FROM public.auditorias_inventario_lineas
  WHERE auditoria_id = p_auditoria_id AND diferencia <> 0;

  UPDATE public.auditorias_inventario
  SET estado = 'CERRADA', fecha_cierre = now()
  WHERE id = p_auditoria_id;

  PERFORM private.registrar_auditoria_interna(
    'auditoria_inventario',
    'Se cerró el conteo físico de ' || (SELECT nombre FROM public.almacenes WHERE id = v_almacen_id) || '.',
    'exito',
    p_auditoria_id::text,
    md5('bc-auditoria-inventario-cierre:' || p_auditoria_id::text)::uuid,
    jsonb_build_object('diferencias',v_diferencias)
  );

  RETURN jsonb_build_object(
    'ok',true,
    'diferencias',v_diferencias,
    'estado','CERRADA'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc_cancelar_auditoria_inventario(
  p_auditoria_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_almacen_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede cancelar un conteo.'
      USING ERRCODE = '42501';
  END IF;
  IF p_motivo IS NOT NULL AND length(btrim(p_motivo)) > 500 THEN
    RAISE EXCEPTION 'El motivo de cancelación no puede superar 500 caracteres.';
  END IF;

  SELECT ai.almacen_id INTO v_almacen_id
  FROM public.auditorias_inventario ai
  JOIN public.almacenes a ON a.id = ai.almacen_id
  WHERE ai.id = p_auditoria_id
    AND ai.estado = 'EN_CONTEO'
    AND a.tipo = 'almacenamiento'
  FOR UPDATE OF ai;

  IF v_almacen_id IS NULL THEN
    RAISE EXCEPTION 'La auditoría no está abierta o ya fue cerrada.';
  END IF;

  PERFORM 1 FROM public.almacenes WHERE id = v_almacen_id FOR UPDATE;

  UPDATE public.auditorias_inventario
  SET estado = 'CANCELADA',
      fecha_cierre = now(),
      observacion = concat_ws(E'\n', nullif(observacion,''), 'Cancelada: ' || coalesce(nullif(btrim(p_motivo),''),'sin motivo adicional'))
  WHERE id = p_auditoria_id;

  PERFORM private.registrar_auditoria_interna(
    'auditoria_inventario',
    'Se canceló el conteo físico de ' || (SELECT nombre FROM public.almacenes WHERE id = v_almacen_id) || '.',
    'exito',
    p_auditoria_id::text,
    md5('bc-auditoria-inventario-cancelacion:' || p_auditoria_id::text)::uuid,
    jsonb_build_object('motivo',nullif(btrim(p_motivo),''))
  );

  RETURN jsonb_build_object('ok',true,'estado','CANCELADA');
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc_resolver_linea_auditoria_inventario(
  p_auditoria_id uuid,
  p_linea_id uuid,
  p_decision text,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_diferencia numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede revisar diferencias.'
      USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('JUSTIFICADA','INVESTIGAR','SOBRANTE_PENDIENTE') THEN
    RAISE EXCEPTION 'La decisión de revisión no es válida.';
  END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 3 OR length(btrim(p_motivo)) > 500 THEN
    RAISE EXCEPTION 'Escribe una explicación de entre 3 y 500 caracteres.';
  END IF;

  SELECT diferencia INTO v_diferencia
  FROM public.auditorias_inventario_lineas l
  JOIN public.auditorias_inventario ai ON ai.id = l.auditoria_id
  JOIN public.almacenes a ON a.id = ai.almacen_id
  WHERE l.id = p_linea_id
    AND ai.id = p_auditoria_id
    AND ai.estado = 'CERRADA'
    AND a.tipo = 'almacenamiento'
  FOR UPDATE OF l;

  IF v_diferencia IS NULL OR v_diferencia = 0 THEN
    RAISE EXCEPTION 'Esta línea no tiene una diferencia pendiente de revisar.';
  END IF;
  IF p_decision = 'SOBRANTE_PENDIENTE' AND v_diferencia <= 0 THEN
    RAISE EXCEPTION 'La decisión de sobrante solo aplica cuando el conteo físico supera el stock del sistema.';
  END IF;

  UPDATE public.auditorias_inventario_lineas
  SET decision = p_decision, motivo = btrim(p_motivo), actualizado_en = now()
  WHERE id = p_linea_id AND auditoria_id = p_auditoria_id;

  PERFORM private.registrar_auditoria_interna(
    'auditoria_inventario',
    'Se revisó una diferencia del conteo físico.',
    'exito',
    p_linea_id::text,
    md5('bc-auditoria-inventario-revision:' || p_linea_id::text || ':' || p_decision || ':' || md5(p_motivo))::uuid,
    jsonb_build_object('auditoria_id',p_auditoria_id,'decision',p_decision,'motivo',btrim(p_motivo))
  );

  RETURN jsonb_build_object('ok',true,'decision',p_decision);
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc_registrar_baja_auditoria_inventario(
  p_auditoria_id uuid,
  p_linea_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_linea public.auditorias_inventario_lineas%ROWTYPE;
  v_almacen_id uuid;
  v_baja_id uuid;
  v_estado_baja text;
  v_nombre_baja text;
  v_key uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede registrar una baja desde auditoría.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.tiene_permiso('bajas','crear') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar bajas.'
      USING ERRCODE = '42501';
  END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 3 OR length(btrim(p_motivo)) > 200 THEN
    RAISE EXCEPTION 'La baja requiere un motivo de entre 3 y 200 caracteres.';
  END IF;

  SELECT l.* INTO v_linea
  FROM public.auditorias_inventario_lineas l
  JOIN public.auditorias_inventario ai ON ai.id = l.auditoria_id
  JOIN public.almacenes a ON a.id = ai.almacen_id
  WHERE l.id = p_linea_id
    AND ai.id = p_auditoria_id
    AND ai.estado = 'CERRADA'
    AND a.tipo = 'almacenamiento'
  FOR UPDATE OF l;

  IF NOT FOUND OR v_linea.diferencia IS NULL OR v_linea.diferencia >= 0 THEN
    RAISE EXCEPTION 'Solo puedes registrar una baja cuando el conteo físico muestra un faltante.';
  END IF;
  IF v_linea.baja_id IS NOT NULL THEN
    SELECT estado INTO v_estado_baja FROM public.bajas WHERE id = v_linea.baja_id;
    RETURN jsonb_build_object('ok',true,'baja_id',v_linea.baja_id,'estado',v_estado_baja,'repetida',true);
  END IF;

  SELECT almacen_id INTO v_almacen_id
  FROM public.auditorias_inventario
  WHERE id = p_auditoria_id;

  v_key := md5('bc-auditoria-inventario:' || p_auditoria_id::text || ':' || p_linea_id::text)::uuid;

  v_baja_id := public.crear_baja(
    v_almacen_id,
    v_linea.producto_id,
    abs(v_linea.diferencia),
    'Auditoría física: ' || btrim(p_motivo),
    NULL,
    NULL,
    v_key
  );

  SELECT estado, motivo INTO v_estado_baja, v_nombre_baja
  FROM public.bajas WHERE id = v_baja_id;

  UPDATE public.auditorias_inventario_lineas
  SET decision = 'BAJA_REGISTRADA',
      motivo = btrim(p_motivo),
      baja_id = v_baja_id,
      actualizado_en = now()
  WHERE id = p_linea_id;

  PERFORM private.registrar_auditoria_interna(
    'auditoria_inventario',
    'Se registró una baja desde una auditoría física.',
    'exito',
    p_linea_id::text,
    v_key,
    jsonb_build_object('auditoria_id',p_auditoria_id,'baja_id',v_baja_id,'cantidad',abs(v_linea.diferencia),'motivo',btrim(p_motivo))
  );

  RETURN jsonb_build_object(
    'ok',true,
    'baja_id',v_baja_id,
    'estado',v_estado_baja,
    'cantidad',abs(v_linea.diferencia),
    'repetida',false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc_listar_responsables_transferencia()
RETURNS TABLE (id uuid, nombre text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.tiene_permiso('transferencias','crear') THEN
    RAISE EXCEPTION 'No tienes permiso para consultar responsables de recepción.'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT u.id, u.nombre
  FROM public.usuarios u
  WHERE u.activo IS TRUE
    AND coalesce(u.archivado,false) IS FALSE
  ORDER BY u.nombre;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_transferencia_con_receptor(
  p_origen_id uuid,
  p_destino_id uuid,
  p_lineas jsonb,
  p_responsable_receptor_id uuid,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transferencia_id uuid;
  v_existente uuid;
  v_nombre_receptor_actual text;
  v_nombre_receptor text;
  v_destino_tipo text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.tiene_permiso('transferencias','crear') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar transferencias.'
      USING ERRCODE = '42501';
  END IF;
  IF p_responsable_receptor_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona la persona responsable que recibe la mercancía.';
  END IF;
  SELECT a.tipo INTO v_destino_tipo
  FROM public.almacenes a
  WHERE a.id = p_destino_id AND a.activo IS DISTINCT FROM false;
  IF NOT FOUND OR v_destino_tipo <> 'minorista' THEN
    RAISE EXCEPTION 'El responsable de recepción solo se exige para transferencias hacia almacenes minoristas.';
  END IF;
  SELECT u.nombre INTO v_nombre_receptor
  FROM public.usuarios u
  WHERE u.id = p_responsable_receptor_id
    AND u.activo IS TRUE
    AND coalesce(u.archivado,false) IS FALSE;
  IF NOT FOUND OR nullif(btrim(v_nombre_receptor),'') IS NULL THEN
    RAISE EXCEPTION 'La persona responsable seleccionada no está activa.';
  END IF;

  -- Reuse the established atomic transfer/FIFO/idempotency implementation.
  -- The metadata update is in the same outer transaction: no transfer can
  -- commit without its receiving person when using this RPC.
  v_transferencia_id := public.registrar_transferencia(
    p_origen_id, p_destino_id, p_lineas, p_idempotency_key
  );

  SELECT t.responsable_receptor_id, t.responsable_receptor_nombre
  INTO v_existente, v_nombre_receptor_actual
  FROM public.transferencias t
  WHERE t.id = v_transferencia_id
  FOR UPDATE;

  IF v_existente IS NOT NULL AND v_existente IS DISTINCT FROM p_responsable_receptor_id THEN
    RAISE EXCEPTION 'La clave de idempotencia ya está asociada a otra persona receptora.';
  END IF;

  UPDATE public.transferencias
  SET responsable_receptor_id = coalesce(responsable_receptor_id,p_responsable_receptor_id),
      responsable_receptor_nombre = coalesce(responsable_receptor_nombre,v_nombre_receptor)
  WHERE id = v_transferencia_id;

  RETURN v_transferencia_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc_mensaje_transferencia(p_transferencia_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.tiene_permiso('transferencias','ver')
    OR public.tiene_permiso('transferencias','crear')
    OR public.bc_actor_is_admin()
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar el reporte de esta transferencia.'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'transferencia_id', t.id,
    'fecha', t.fecha,
    'almacen', destino.nombre,
    'responsable', t.responsable_receptor_nombre,
    'productos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'nombre', p.nombre,
        'unidad', coalesce(nullif(btrim(p.unidad),''),'unidad'),
        'cantidad', tl.cantidad
      ) ORDER BY p.nombre, tl.id)
      FROM public.transferencias_lineas tl
      JOIN public.productos p ON p.id = tl.producto_id
      WHERE tl.transferencia_id = t.id
    ), '[]'::jsonb)
  )
  INTO v_resultado
  FROM public.transferencias t
  JOIN public.almacenes destino ON destino.id = t.almacen_destino_id
  WHERE t.id = p_transferencia_id
    AND t.estado = 'completada'
    AND t.responsable_receptor_id IS NOT NULL
    AND nullif(btrim(t.responsable_receptor_nombre),'') IS NOT NULL;

  IF v_resultado IS NULL THEN
    RAISE EXCEPTION 'La transferencia no existe, no está completada o no tiene responsable receptor.';
  END IF;
  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc_listar_almacenes_auditoria_inventario() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc_listar_auditorias_inventario() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc_crear_auditoria_inventario(uuid,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc_detalle_auditoria_inventario(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc_guardar_conteo_auditoria_inventario(uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc_cerrar_auditoria_inventario(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc_cancelar_auditoria_inventario(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc_resolver_linea_auditoria_inventario(uuid,uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc_registrar_baja_auditoria_inventario(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc_listar_responsables_transferencia() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_transferencia_con_receptor(uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc_mensaje_transferencia(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.bc_listar_almacenes_auditoria_inventario() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc_listar_auditorias_inventario() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc_crear_auditoria_inventario(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc_detalle_auditoria_inventario(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc_guardar_conteo_auditoria_inventario(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc_cerrar_auditoria_inventario(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc_cancelar_auditoria_inventario(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc_resolver_linea_auditoria_inventario(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc_registrar_baja_auditoria_inventario(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc_listar_responsables_transferencia() TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_transferencia_con_receptor(uuid,uuid,jsonb,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc_mensaje_transferencia(uuid) TO authenticated;

COMMIT;
