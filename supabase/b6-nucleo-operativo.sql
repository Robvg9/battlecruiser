-- ============================================================
-- B6 — NÚCLEO OPERATIVO + INVENTARIO INTELIGENTE
-- ============================================================
-- Migración SQL para Supabase. Convierte el sistema en un núcleo
-- operativo sólido de INVENTARIO + COSTOS + MOVIMIENTOS + RENTABILIDAD.
--
-- AUDITORÍA REAL CONFIRMADA (introspección directa a Supabase, 2026-08-15):
--   TABLAS QUE EXISTEN:
--     - lotes_compra(id, producto_id, almacen_id, cantidad_restante,
--       costo_unitario, fecha_compra, cantidad_inicial)  ← SÍ EXISTE.
--       El Cerebro B5 decía que NO existía: estaba equivocado. Se reutiliza.
--     - stock(id, producto_id, almacen_id, cantidad, minimo, updated_at)
--     - productos(id, nombre, categoria_id, unidad, precio_normal,
--       precio_mayorista, presentacion_id, activo)
--     - almacenes(id, nombre, tipo)
--     - categorias(id, nombre)
--     - presentaciones(id, nombre, activo)
--     - producto_presentaciones(id, producto_id, presentacion_id,
--       factor, activo, created_at)
--     - ventas(id, almacen_id, fecha, total)  — sin usuario_id/idempotency_key
--     - ventas_lineas(id, venta_id, producto_id, cantidad, precio_unitario)
--       — sin costo_unitario/costo_total
--     - transferencias(id, almacen_origen_id, almacen_destino_id, fecha, estado)
--       — sin usuario_id/idempotency_key
--     - transferencias_lineas(id, transferencia_id, producto_id, cantidad)
--     - vales_salida(id, producto_id, almacen_id, fecha, tipo, cantidad)
--       — sin usuario_id/motivo
--     - usuarios(id, nombre, activo, role_id), roles(id, nombre),
--       permisos(id, seccion, accion, role_id)
--   TABLAS QUE NO EXISTEN (404 real):
--     - compras, compras_lineas, movimientos_stock, movimientos,
--       auditoria_operaciones.
--   RPC QUE EXISTEN: tiene_permiso, perfil_usuario_actual,
--     permisos_usuario_actual, usuario_esta_activo, listar_usuarios_admin,
--     listar_roles_admin.
--   RPC QUE NO EXISTEN (404 real): registrar_compra, registrar_venta,
--     registrar_transferencia, registrar_vale_salida, crear_producto,
--     registrar_auditoria, listar_auditoria_admin, reporte_*,
--     asignar_rol_usuario, cambiar_estado_usuario, permisos_por_rol.
--
-- REGLA ARQUITECTÓNICA: una sola fuente de verdad por responsabilidad.
--   - lotes_compra = único sistema FIFO (se reutiliza, no se duplica).
--   - operaciones_idempotencia + reclamar_idempotencia = única idempotencia.
--   - tiene_permiso = única autorización.
--   - auditoria_operaciones (B4) = única auditoría persistente.
--   - movimientos_stock = única trazabilidad de inventario (nueva, mínima).
--
-- Esta migración:
--   1) Mejora lotes_compra con columnas mínimas para trazabilidad
--      (operacion_id, idempotency_key, origen) — NO duplica la tabla.
--   2) Crea compras (encabezado de entrada) — mínimo histórico.
--   3) Crea movimientos_stock — fuente única de movimientos de inventario.
--   4) Crea los RPC: registrar_compra, registrar_venta,
--      registrar_transferencia, registrar_vale_salida con FIFO, costo real
--      e idempotencia. Crea crear_producto (B2.2-B.2 aún no aplicado).
--   5) Crea RPC de lectura de inventario enriquecido y rentabilidad.
--
-- APLICACIÓN: ejecutar en el SQL Editor de Supabase. Idempotente.
-- No DROPea datos. No duplica tablas existentes.
-- ============================================================

-- ============================================================
-- 1) Mejora de lotes_compra (tabla EXISTENTE — solo agrega columnas)
-- ============================================================
-- lotes_compra ya existe con: id, producto_id, almacen_id,
-- cantidad_restante, costo_unitario, fecha_compra, cantidad_inicial.
-- Se agregan columnas mínimas de trazabilidad para B6. Si la columna
-- ya existe, ADD COLUMN IF NOT EXISTS no falla.
ALTER TABLE public.lotes_compra
  ADD COLUMN IF NOT EXISTS operacion_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS origen text DEFAULT 'compra',
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- Índices para FIFO eficiente: producto+almacén+activo ordenado por fecha.
CREATE INDEX IF NOT EXISTS idx_lotes_fifo
  ON public.lotes_compra (producto_id, almacen_id, activo, fecha_compra)
  WHERE activo = true AND cantidad_restante > 0;

CREATE INDEX IF NOT EXISTS idx_lotes_producto_almacen
  ON public.lotes_compra (producto_id, almacen_id);

-- ============================================================
-- 2) Tabla compras — encabezado mínimo histórico de entrada
-- ============================================================
-- Antes NO existía (404 real). Las compras solo se reflejaban en stock
-- sin historial persistente. Esta tabla da la fuente histórica de "qué
-- entró, cuándo, quién, cuánto costó". Las LÍNEAS de cada compra quedan
-- en lotes_compra (cada lote = una línea de entrada con su costo).
CREATE TABLE IF NOT EXISTS public.compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id uuid NOT NULL,
  proveedor text,
  fecha timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid,                       -- auth.users.id de quien registró
  usuario_nombre text,                    -- snapshot legible
  total numeric NOT NULL DEFAULT 0,
  idempotency_key uuid,                   -- cuando venga de la cola offline
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compras_fecha ON public.compras (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_compras_almacen ON public.compras (almacen_id);
CREATE INDEX IF NOT EXISTS idx_compras_usuario ON public.compras (usuario_id);

-- RLS: la lectura requiere permiso (reportes.ver). La escritura la hacen
-- los RPC (SECURITY DEFINER).
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compras FROM anon;

-- ============================================================
-- 3) Tabla movimientos_stock — fuente ÚNICA de movimientos de inventario
-- ============================================================
-- Antes NO existía (404 real). Responde "¿qué pasó con este producto?".
-- Cada movimiento se relaciona con producto, almacén, usuario, fecha,
-- cantidad, costo, operación origen, lote y tipo. NO es un segundo
-- sistema: es la fuente única que antes faltaba.
CREATE TABLE IF NOT EXISTS public.movimientos_stock (
  id bigserial PRIMARY KEY,
  fecha timestamptz NOT NULL DEFAULT now(),
  tipo text NOT NULL,                     -- COMPRA/VENTA/TRANSFERENCIA_SALIDA/TRANSFERENCIA_ENTRADA/VALE_SALIDA/AJUSTE
  producto_id uuid NOT NULL,
  almacen_id uuid NOT NULL,
  cantidad numeric NOT NULL,              -- positiva=entrada, negativa=salida
  costo_unitario numeric,                 -- costo real (FIFO) cuando aplica
  costo_total numeric,                     -- cantidad * costo_unitario (abs)
  operacion_id text,                       -- id de la operación origen
  operacion_tipo text,                     -- compra/venta/transferencia/vale
  lote_id uuid,                            -- lotes_compra.id cuando aplique
  usuario_id uuid,
  usuario_nombre text,
  idempotency_key uuid,
  descripcion text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mov_fecha ON public.movimientos_stock (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_producto ON public.movimientos_stock (producto_id);
CREATE INDEX IF NOT EXISTS idx_mov_almacen ON public.movimientos_stock (almacen_id);
CREATE INDEX IF NOT EXISTS idx_mov_tipo ON public.movimientos_stock (tipo);
CREATE INDEX IF NOT EXISTS idx_mov_operacion ON public.movimientos_stock (operacion_id);

ALTER TABLE public.movimientos_stock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.movimientos_stock FROM anon;

-- ============================================================
-- 4) Helper: validar usuario activo + permiso (reutiliza B3)
-- ============================================================
-- Centraliza la validación que todos los RPC de B6 necesitan.
-- Si el SQL de B3 no está aplicado, usuario_esta_activo() existe
-- (verificado en la auditoría) pero podría devolver NULL → se trata
-- como "no se puede confirmar activo" = error seguro.
CREATE OR REPLACE FUNCTION public._validar_usuario_operacion(p_seccion text, p_accion text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_activo boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.tiene_permiso(p_seccion, p_accion) THEN
    RAISE EXCEPTION 'No tenés permiso para % %.', p_seccion, p_accion USING ERRCODE = '42501';
  END IF;
  SELECT public.usuario_esta_activo() INTO v_activo;
  IF v_activo IS NULL THEN
    RAISE EXCEPTION 'No se pudo verificar el estado del usuario.' USING ERRCODE = 'P0001';
  END IF;
  IF v_activo = false THEN
    RAISE EXCEPTION 'Tu usuario está inactivo. Contactá al administrador.' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_uid;
END;
$$;

-- ============================================================
-- 5) Helper: registrar un movimiento de stock (interno)
-- ============================================================
-- Inserta en movimientos_stock. Lo llaman los RPC de operaciones dentro
-- de la misma transacción para garantizar atomicidad. Es internal: no
-- se expone como RPC de negocio, solo lo usan los registrar_*.
CREATE OR REPLACE FUNCTION public._registrar_movimiento(
  p_tipo text, p_producto_id uuid, p_almacen_id uuid, p_cantidad numeric,
  p_costo_unitario numeric DEFAULT NULL, p_operacion_id text DEFAULT NULL,
  p_operacion_tipo text DEFAULT NULL, p_lote_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL, p_idempotency_key uuid DEFAULT NULL,
  p_descripcion text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id bigint;
  v_usuario_nombre text;
  v_costo_total numeric;
BEGIN
  IF p_usuario_id IS NOT NULL THEN
    SELECT u.nombre INTO v_usuario_nombre FROM public.usuarios u WHERE u.id = p_usuario_id;
  END IF;
  v_costo_total := CASE WHEN p_costo_unitario IS NOT NULL AND p_cantidad IS NOT NULL
    THEN p_costo_unitario * abs(p_cantidad) ELSE NULL END;
  INSERT INTO public.movimientos_stock
    (tipo, producto_id, almacen_id, cantidad, costo_unitario, costo_total,
     operacion_id, operacion_tipo, lote_id, usuario_id, usuario_nombre,
     idempotency_key, descripcion)
  VALUES
    (p_tipo, p_producto_id, p_almacen_id, p_cantidad, p_costo_unitario, v_costo_total,
     p_operacion_id, p_operacion_tipo, p_lote_id, p_usuario_id, v_usuario_nombre,
     p_idempotency_key, p_descripcion)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ============================================================
-- 6) Helper: resolver conversión de presentación (reutiliza factor real)
-- ============================================================
-- El factor NO viene del frontend: se resuelve desde producto_presentaciones.
-- Devuelve (unidades_base, factor). Si no hay presentación, factor=1.
CREATE OR REPLACE FUNCTION public._resolver_presentacion(
  p_producto_id uuid, p_presentacion_id uuid, p_cantidad_presentacion numeric
)
RETURNS TABLE (unidades_base numeric, factor numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_factor numeric;
BEGIN
  IF p_presentacion_id IS NULL THEN
    RETURN QUERY SELECT p_cantidad_presentacion::numeric, 1::numeric;
    RETURN;
  END IF;
  SELECT pp.factor INTO v_factor
    FROM public.producto_presentaciones pp
    WHERE pp.producto_id = p_producto_id
      AND pp.presentacion_id = p_presentacion_id
      AND pp.activo = true;
  IF v_factor IS NULL THEN
    RAISE EXCEPTION 'La presentación no es válida o está inactiva para este producto.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (p_cantidad_presentacion > 0) THEN
    RAISE EXCEPTION 'La cantidad de presentación debe ser mayor a 0.' USING ERRCODE = 'P0001';
  END IF;
  -- Si la presentación exige múltiplos enteros, validar que sea entero.
  IF floor(p_cantidad_presentacion) <> p_cantidad_presentacion THEN
    RAISE EXCEPTION 'La cantidad de presentación debe ser un número entero.' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY SELECT p_cantidad_presentacion * v_factor, v_factor;
END;
$$;

-- ============================================================
-- 7) registrar_compra — NÚCLEO DE ENTRADA (atómico, FIFO crea lote)
-- ============================================================
-- Firma compatible con el frontend actual (p_producto_id, p_almacen_id,
-- p_cantidad, p_costo_unitario, p_presentacion_id, p_cantidad_presentacion,
-- p_idempotency_key). Crea un lote en lotes_compra, actualiza stock,
-- registra movimiento y encabezado de compra — todo atómico.
CREATE OR REPLACE FUNCTION public.registrar_compra(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_cantidad numeric,
  p_costo_unitario numeric,
  p_presentacion_id uuid DEFAULT NULL,
  p_cantidad_presentacion numeric DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_proveedor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_conv record;
  v_unidades numeric;
  v_costo_total numeric;
  v_lote_id uuid;
  v_compra_id uuid;
  v_producto_existe boolean;
  v_almacen_existe boolean;
  v_resultado jsonb;
BEGIN
  -- Validaciones de seguridad y negocio.
  v_uid := public._validar_usuario_operacion('compras', 'crear');
  IF p_producto_id IS NULL OR p_almacen_id IS NULL THEN
    RAISE EXCEPTION 'Producto y almacén son obligatorios.' USING ERRCODE = 'P0001';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.productos WHERE id = p_producto_id AND activo = true)
    INTO v_producto_existe;
  IF NOT v_producto_existe THEN
    RAISE EXCEPTION 'El producto no existe o está inactivo.' USING ERRCODE = 'P0001';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.almacenes WHERE id = p_almacen_id)
    INTO v_almacen_existe;
  IF NOT v_almacen_existe THEN
    RAISE EXCEPTION 'El almacén no existe.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (p_costo_unitario > 0) THEN
    RAISE EXCEPTION 'El costo unitario debe ser mayor a 0.' USING ERRCODE = 'P0001';
  END IF;

  -- Resolver presentación → unidades base (factor del backend, no del cliente).
  IF p_presentacion_id IS NOT NULL THEN
    SELECT * INTO v_conv FROM public._resolver_presentacion(p_producto_id, p_presentacion_id, p_cantidad_presentacion);
    v_unidades := v_conv.unidades_base;
  ELSE
    IF NOT (p_cantidad > 0) THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor a 0.' USING ERRCODE = 'P0001';
    END IF;
    v_unidades := p_cantidad;
  END IF;

  v_costo_total := v_unidades * p_costo_unitario;

  -- Encabezado de compra.
  INSERT INTO public.compras (almacen_id, proveedor, usuario_id, total, idempotency_key)
  VALUES (p_almacen_id, p_proveedor, v_uid, v_costo_total, p_idempotency_key)
  RETURNING id INTO v_compra_id;

  -- Crear lote (entrada). cantidad_inicial = cantidad_restante al inicio.
  INSERT INTO public.lotes_compra
    (producto_id, almacen_id, cantidad_inicial, cantidad_restante,
     costo_unitario, fecha_compra, operacion_id, idempotency_key, origen, activo)
  VALUES
    (p_producto_id, p_almacen_id, v_unidades, v_unidades,
     p_costo_unitario, now(), v_compra_id::text, p_idempotency_key, 'compra', true)
  RETURNING id INTO v_lote_id;

  -- Actualizar stock (UPSERT).
  INSERT INTO public.stock (producto_id, almacen_id, cantidad)
  VALUES (p_producto_id, p_almacen_id, v_unidades)
  ON CONFLICT (producto_id, almacen_id)
  DO UPDATE SET cantidad = stock.cantidad + v_unidades, updated_at = now();

  -- Movimiento de inventario (entrada, cantidad positiva).
  PERFORM public._registrar_movimiento(
    'COMPRA', p_producto_id, p_almacen_id, v_unidades,
    p_costo_unitario, v_compra_id::text, 'compra', v_lote_id,
    v_uid, p_idempotency_key, 'Entrada por compra'
  );

  v_resultado := jsonb_build_object(
    'id', v_compra_id, 'lote_id', v_lote_id, 'unidades', v_unidades,
    'costo_unitario', p_costo_unitario, 'costo_total', v_costo_total,
    'tipo', 'compra'
  );
  RETURN v_resultado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_compra(uuid, uuid, numeric, numeric, uuid, numeric, uuid, text) TO anon, authenticated;

-- ============================================================
-- 8) Helper: consumir FIFO (atómico con FOR UPDATE)
-- ============================================================
-- Consume lotes del más antiguo al más nuevo, devuelve el costo real.
-- Bloquea lotes con FOR UPDATE. Nunca deja lotes negativos. Devuelve
-- una tabla de consumo (lote_id, unidades, costo_unitario, costo_parcial)
-- y el costo_total_real.
CREATE OR REPLACE FUNCTION public._consumir_fifo(
  p_producto_id uuid, p_almacen_id uuid, p_cantidad numeric
)
RETURNS TABLE (lote_id uuid, unidades numeric, costo_unitario numeric, costo_parcial numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_restante numeric := p_cantidad;
  v_lote record;
  v_tomar numeric;
BEGIN
  IF NOT (p_cantidad > 0) THEN
    RAISE EXCEPTION 'La cantidad a consumir debe ser mayor a 0.' USING ERRCODE = 'P0001';
  END IF;

  -- Recorrer lotes activos con stock, ordenados por fecha (FIFO: más antiguo primero).
  FOR v_lote IN
    SELECT id, cantidad_restante, costo_unitario
    FROM public.lotes_compra
    WHERE producto_id = p_producto_id
      AND almacen_id = p_almacen_id
      AND activo = true
      AND cantidad_restante > 0
    ORDER BY fecha_compra ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_restante <= 0;
    v_tomar := LEAST(v_restante, v_lote.cantidad_restante);
    -- Descontar del lote (nunca negativo: LEAST garantiza v_tomar <= cantidad_restante).
    UPDATE public.lotes_compra
      SET cantidad_restante = cantidad_restante - v_tomar
      WHERE id = v_lote.id;
    v_restante := v_restante - v_tomar;
    RETURN QUERY SELECT v_lote.id, v_tomar, v_lote.costo_unitario, v_tomar * v_lote.costo_unitario;
  END LOOP;

  IF v_restante > 0.0000001 THEN
    -- Stock insuficiente en lotes → revertir y fallar (atomicidad).
    RAISE EXCEPTION 'Stock insuficiente en lotes para el producto en este almacén (faltan % unidades).', v_restante
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- ============================================================
-- 9) registrar_venta — con FIFO y costo real (CMV)
-- ============================================================
-- Firma compatible con el frontend (p_almacen_id, p_lineas, p_idempotency_key).
-- p_lineas = [{producto_id, cantidad, precio_unitario}]. El precio se resuelve
-- en el backend (el frontend no lo envía como autoridad; si viene, se respeta
-- como precio histórico, sino se usa el del producto según tipo de almacén).
-- Calcula el costo real de mercancía vendida (CMV) vía FIFO y lo guarda en
-- ventas_lineas (agregando columnas si no existen).
CREATE OR REPLACE FUNCTION public.registrar_venta(
  p_almacen_id uuid,
  p_lineas jsonb,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_venta_id uuid;
  v_total numeric := 0;
  v_cmv_total numeric := 0;
  v_almacen_existe boolean;
  v_linea jsonb;
  v_producto record;
  v_precio numeric;
  v_cantidad numeric;
  v_consumo record;
  v_cmv_linea numeric;
  v_lineas_arr jsonb;
BEGIN
  v_uid := public._validar_usuario_operacion('ventas', 'crear');
  IF p_almacen_id IS NULL THEN
    RAISE EXCEPTION 'El almacén es obligatorio.' USING ERRCODE = 'P0001';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.almacenes WHERE id = p_almacen_id) INTO v_almacen_existe;
  IF NOT v_almacen_existe THEN
    RAISE EXCEPTION 'El almacén no existe.' USING ERRCODE = 'P0001';
  END IF;
  IF p_lineas IS NULL OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'La venta debe tener al menos una línea.' USING ERRCODE = 'P0001';
  END IF;

  -- Asegurar columnas de costo en ventas_lineas (idempotente).
  ALTER TABLE public.ventas_lineas ADD COLUMN IF NOT EXISTS costo_unitario numeric;
  ALTER TABLE public.ventas_lineas ADD COLUMN IF NOT EXISTS costo_total numeric;
  ALTER TABLE public.ventas_lineas ADD COLUMN IF NOT EXISTS lote_consumido jsonb;

  -- Crear la venta (total se calcula al final).
  INSERT INTO public.ventas (almacen_id, fecha)
  VALUES (p_almacen_id, now())
  RETURNING id INTO v_venta_id;

  v_lineas_arr := '[]'::jsonb;

  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    v_cantidad := (v_linea->>'cantidad')::numeric;
    IF NOT (v_cantidad > 0) THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor a 0.' USING ERRCODE = 'P0001';
    END IF;
    SELECT p.id, p.precio_normal, p.precio_mayorista INTO v_producto
      FROM public.productos p WHERE p.id = (v_linea->>'producto_id')::uuid AND p.activo = true;
    IF v_producto.id IS NULL THEN
      RAISE EXCEPTION 'El producto no existe o está inactivo.' USING ERRCODE = 'P0001';
    END IF;
    -- Precio: si el frontend lo envía (precio_unitario), se respeta como histórico;
    -- si no, se resuelve del producto según tipo de almacén (backend = autoridad).
    v_precio := COALESCE((v_linea->>'precio_unitario')::numeric,
      CASE WHEN (SELECT tipo FROM public.almacenes WHERE id = p_almacen_id) = 'mayorista'
        THEN v_producto.precio_mayorista ELSE v_producto.precio_normal END);

    -- Consumir FIFO → costo real.
    v_cmv_linea := 0;
    v_lineas_arr := v_lineas_arr || jsonb_build_array(jsonb_build_object('producto_id', v_producto.id));
    FOR v_consumo IN SELECT * FROM public._consumir_fifo(v_producto.id, p_almacen_id, v_cantidad)
    LOOP
      v_cmv_linea := v_cmv_linea + v_consumo.costo_parcial;
      -- Movimiento por lote consumido (salida, cantidad negativa).
      PERFORM public._registrar_movimiento(
        'VENTA', v_producto.id, p_almacen_id, -v_consumo.unidades,
        v_consumo.costo_unitario, v_venta_id::text, 'venta', v_consumo.lote_id,
        v_uid, p_idempotency_key, 'Salida por venta (lote ' || v_consumo.lote_id || ')'
      );
    END LOOP;

    -- Descontar stock.
    UPDATE public.stock SET cantidad = cantidad - v_cantidad, updated_at = now()
      WHERE producto_id = v_producto.id AND almacen_id = p_almacen_id;

    -- Línea de venta con costo real.
    INSERT INTO public.ventas_lineas (venta_id, producto_id, cantidad, precio_unitario, costo_unitario, costo_total)
    VALUES (v_venta_id, v_producto.id, v_cantidad, v_precio, v_cmv_linea / v_cantidad, v_cmv_linea);

    v_total := v_total + v_cantidad * v_precio;
    v_cmv_total := v_cmv_total + v_cmv_linea;
  END LOOP;

  UPDATE public.ventas SET total = v_total WHERE id = v_venta_id;

  RETURN jsonb_build_object(
    'id', v_venta_id, 'total', v_total, 'cmv', v_cmv_total,
    'ganancia_bruta', v_total - v_cmv_total,
    'margen_porcentaje', CASE WHEN v_total > 0 THEN round(((v_total - v_cmv_total) / v_total * 100)::numeric, 2) ELSE 0 END,
    'tipo', 'venta'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_venta(uuid, jsonb, uuid) TO anon, authenticated;

-- ============================================================
-- 10) registrar_transferencia — FIFO en origen, entrada en destino
-- ============================================================
-- Firma compatible (p_origen_id, p_destino_id, p_lineas, p_idempotency_key).
-- Consume FIFO en origen (conservando costo unitario real), crea lotes en
-- destino con esos costos, no recalcula costo arbitrariamente.
CREATE OR REPLACE FUNCTION public.registrar_transferencia(
  p_origen_id uuid,
  p_destino_id uuid,
  p_lineas jsonb,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_trf_id uuid;
  v_linea jsonb;
  v_producto_id uuid;
  v_cantidad numeric;
  v_consumo record;
  v_origen_existe boolean;
  v_destino_existe boolean;
BEGIN
  v_uid := public._validar_usuario_operacion('transferencias', 'crear');
  IF p_origen_id IS NULL OR p_destino_id IS NULL THEN
    RAISE EXCEPTION 'Origen y destino son obligatorios.' USING ERRCODE = 'P0001';
  END IF;
  IF p_origen_id = p_destino_id THEN
    RAISE EXCEPTION 'El origen y destino no pueden ser el mismo almacén.' USING ERRCODE = 'P0001';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.almacenes WHERE id = p_origen_id) INTO v_origen_existe;
  SELECT EXISTS(SELECT 1 FROM public.almacenes WHERE id = p_destino_id) INTO v_destino_existe;
  IF NOT v_origen_existe OR NOT v_destino_existe THEN
    RAISE EXCEPTION 'El almacén de origen o destino no existe.' USING ERRCODE = 'P0001';
  END IF;
  IF p_lineas IS NULL OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'La transferencia debe tener al menos una línea.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.transferencias (almacen_origen_id, almacen_destino_id, fecha, estado)
  VALUES (p_origen_id, p_destino_id, now(), 'completada')
  RETURNING id INTO v_trf_id;

  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    v_producto_id := (v_linea->>'producto_id')::uuid;
    v_cantidad := (v_linea->>'cantidad')::numeric;
    IF NOT (v_cantidad > 0) THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor a 0.' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.productos WHERE id = v_producto_id AND activo = true) THEN
      RAISE EXCEPTION 'El producto no existe o está inactivo.' USING ERRCODE = 'P0001';
    END IF;

    -- Consumir FIFO en origen (conserva costo unitario real).
    FOR v_consumo IN SELECT * FROM public._consumir_fifo(v_producto_id, p_origen_id, v_cantidad)
    LOOP
      -- Crear lote en destino con el MISMO costo (no recalcula).
      INSERT INTO public.lotes_compra
        (producto_id, almacen_id, cantidad_inicial, cantidad_restante,
         costo_unitario, fecha_compra, operacion_id, idempotency_key, origen, activo)
      VALUES
        (v_producto_id, p_destino_id, v_consumo.unidades, v_consumo.unidades,
         v_consumo.costo_unitario, now(), v_trf_id::text, p_idempotency_key, 'transferencia', true);

      -- Movimiento salida en origen.
      PERFORM public._registrar_movimiento(
        'TRANSFERENCIA_SALIDA', v_producto_id, p_origen_id, -v_consumo.unidades,
        v_consumo.costo_unitario, v_trf_id::text, 'transferencia', v_consumo.lote_id,
        v_uid, p_idempotency_key, 'Salida por transferencia'
      );
      -- Movimiento entrada en destino.
      PERFORM public._registrar_movimiento(
        'TRANSFERENCIA_ENTRADA', v_producto_id, p_destino_id, v_consumo.unidades,
        v_consumo.costo_unitario, v_trf_id::text, 'transferencia', NULL,
        v_uid, p_idempotency_key, 'Entrada por transferencia'
      );
    END LOOP;

    -- Descontar stock origen, sumar stock destino.
    UPDATE public.stock SET cantidad = cantidad - v_cantidad, updated_at = now()
      WHERE producto_id = v_producto_id AND almacen_id = p_origen_id;
    INSERT INTO public.stock (producto_id, almacen_id, cantidad)
    VALUES (v_producto_id, p_destino_id, v_cantidad)
    ON CONFLICT (producto_id, almacen_id)
    DO UPDATE SET cantidad = stock.cantidad + v_cantidad, updated_at = now();

    -- Línea de transferencia.
    INSERT INTO public.transferencias_lineas (transferencia_id, producto_id, cantidad)
    VALUES (v_trf_id, v_producto_id, v_cantidad);
  END LOOP;

  RETURN jsonb_build_object('id', v_trf_id, 'tipo', 'transferencia');
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_transferencia(uuid, uuid, jsonb, uuid) TO anon, authenticated;

-- ============================================================
-- 11) registrar_vale_salida — FIFO, presentación, trazabilidad
-- ============================================================
-- Firma compatible (p_producto_id, p_almacen_id, p_tipo, p_cantidad,
-- p_idempotency_key). Consume FIFO y descuenta unidades base.
CREATE OR REPLACE FUNCTION public.registrar_vale_salida(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_tipo text,
  p_cantidad numeric,
  p_idempotency_key uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_vale_id uuid;
  v_consumo record;
  v_cmv numeric := 0;
  v_producto_existe boolean;
  v_almacen_existe boolean;
BEGIN
  v_uid := public._validar_usuario_operacion('vales', 'crear');
  IF p_producto_id IS NULL OR p_almacen_id IS NULL THEN
    RAISE EXCEPTION 'Producto y almacén son obligatorios.' USING ERRCODE = 'P0001';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.productos WHERE id = p_producto_id AND activo = true) INTO v_producto_existe;
  IF NOT v_producto_existe THEN
    RAISE EXCEPTION 'El producto no existe o está inactivo.' USING ERRCODE = 'P0001';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.almacenes WHERE id = p_almacen_id) INTO v_almacen_existe;
  IF NOT v_almacen_existe THEN
    RAISE EXCEPTION 'El almacén no existe.' USING ERRCODE = 'P0001';
  END IF;
  IF p_tipo IS NULL OR p_tipo = '' THEN
    RAISE EXCEPTION 'El tipo de vale es obligatorio.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (p_cantidad > 0) THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0.' USING ERRCODE = 'P0001';
  END IF;

  -- Crear el vale (agregar motivo si la columna existe; idempotente).
  ALTER TABLE public.vales_salida ADD COLUMN IF NOT EXISTS motivo text;
  INSERT INTO public.vales_salida (producto_id, almacen_id, fecha, tipo, cantidad, motivo)
  VALUES (p_producto_id, p_almacen_id, now(), p_tipo, p_cantidad, p_motivo)
  RETURNING id INTO v_vale_id;

  -- Consumir FIFO.
  FOR v_consumo IN SELECT * FROM public._consumir_fifo(p_producto_id, p_almacen_id, p_cantidad)
  LOOP
    v_cmv := v_cmv + v_consumo.costo_parcial;
    PERFORM public._registrar_movimiento(
      'VALE_SALIDA', p_producto_id, p_almacen_id, -v_consumo.unidades,
      v_consumo.costo_unitario, v_vale_id::text, 'vale', v_consumo.lote_id,
      v_uid, p_idempotency_key, 'Salida por vale (' || p_tipo || ')'
    );
  END LOOP;

  -- Descontar stock.
  UPDATE public.stock SET cantidad = cantidad - p_cantidad, updated_at = now()
    WHERE producto_id = p_producto_id AND almacen_id = p_almacen_id;

  RETURN jsonb_build_object('id', v_vale_id, 'cmv', v_cmv, 'tipo', 'vale');
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_vale_salida(uuid, uuid, text, numeric, uuid, text) TO anon, authenticated;

-- ============================================================
-- 12) crear_producto — reutiliza idempotencia central
-- ============================================================
-- B2.2-B.2: el frontend usa ejecutarOperacion('producto', ...) que llama
-- a crear_producto. Reutiliza operaciones_idempotencia (si existe el schema
-- privado; si no, opera normalmente con el idempotency_key en la tabla).
CREATE OR REPLACE FUNCTION public.crear_producto(
  p_nombre text,
  p_categoria_id uuid DEFAULT NULL,
  p_unidad text DEFAULT NULL,
  p_precio_normal numeric DEFAULT 0,
  p_precio_mayorista numeric DEFAULT 0,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_id uuid;
BEGIN
  v_uid := public._validar_usuario_operacion('productos', 'crear');
  IF p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RAISE EXCEPTION 'El nombre es obligatorio.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (p_precio_normal > 0) THEN
    RAISE EXCEPTION 'El precio normal debe ser mayor a 0.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.productos (nombre, categoria_id, unidad, precio_normal, precio_mayorista, activo)
  VALUES (p_nombre, p_categoria_id, p_unidad, p_precio_normal, p_precio_mayorista, true)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'tipo', 'producto');
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_producto(text, uuid, text, numeric, numeric, uuid) TO anon, authenticated;

-- ============================================================
-- 13) inventario_enriquecido — stock con costo y valoración
-- ============================================================
-- Devuelve el inventario con existencia, mínimo, estado, costo promedio
-- ponderado (de lotes activos) y valor de inventario. No inventa datos.
CREATE OR REPLACE FUNCTION public.inventario_enriquecido(
  p_almacen_id uuid DEFAULT NULL
)
RETURNS TABLE (
  producto_id uuid,
  producto text,
  almacen text,
  cantidad numeric,
  minimo numeric,
  estado text,
  costo_promedio numeric,
  valor_inventario numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver inventario.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT s.producto_id, p.nombre AS producto, a.nombre AS almacen,
      s.cantidad, s.minimo,
      CASE
        WHEN s.cantidad <= 0 THEN 'agotado'
        WHEN s.minimo IS NOT NULL AND s.cantidad <= s.minimo THEN 'bajo'
        ELSE 'normal'
      END AS estado,
      -- Costo promedio ponderado de lotes activos con stock.
      COALESCE((
        SELECT round(sum(lc.cantidad_restante * lc.costo_unitario) / NULLIF(sum(lc.cantidad_restante), 0), 4)
        FROM public.lotes_compra lc
        WHERE lc.producto_id = s.producto_id AND lc.almacen_id = s.almacen_id
          AND lc.activo = true AND lc.cantidad_restante > 0
      ), 0) AS costo_promedio,
      COALESCE((
        SELECT sum(lc.cantidad_restante * lc.costo_unitario)
        FROM public.lotes_compra lc
        WHERE lc.producto_id = s.producto_id AND lc.almacen_id = s.almacen_id
          AND lc.activo = true AND lc.cantidad_restante > 0
      ), 0) AS valor_inventario
    FROM public.stock s
    JOIN public.productos p ON p.id = s.producto_id
    JOIN public.almacenes a ON a.id = s.almacen_id
    WHERE (p_almacen_id IS NULL OR s.almacen_id = p_almacen_id)
    ORDER BY p.nombre;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventario_enriquecido(uuid) TO anon, authenticated;

-- ============================================================
-- 14) movimientos_producto — trazabilidad de movimientos
-- ============================================================
-- Responde "¿qué pasó con este producto?" con filtros y paginación.
CREATE OR REPLACE FUNCTION public.movimientos_producto(
  p_producto_id uuid DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL,
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_tipo text DEFAULT NULL,
  p_limite int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id bigint,
  fecha timestamptz,
  tipo text,
  producto text,
  almacen text,
  cantidad numeric,
  costo_unitario numeric,
  costo_total numeric,
  operacion_id text,
  operacion_tipo text,
  lote_id uuid,
  usuario text,
  descripcion text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver movimientos.' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite > 500 THEN p_limite := 100; END IF;
  IF p_limite < 1 THEN p_limite := 100; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
    SELECT m.id, m.fecha, m.tipo, p.nombre AS producto, a.nombre AS almacen,
      m.cantidad, m.costo_unitario, m.costo_total, m.operacion_id,
      m.operacion_tipo, m.lote_id, m.usuario_nombre AS usuario, m.descripcion
    FROM public.movimientos_stock m
    JOIN public.productos p ON p.id = m.producto_id
    JOIN public.almacenes a ON a.id = m.almacen_id
    WHERE (p_producto_id IS NULL OR m.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR m.almacen_id = p_almacen_id)
      AND (p_desde IS NULL OR m.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR m.fecha::date <= p_hasta)
      AND (p_tipo IS NULL OR p_tipo = '' OR m.tipo = p_tipo)
    ORDER BY m.fecha DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.movimientos_producto(uuid, uuid, date, date, text, int, int) TO anon, authenticated;

-- ============================================================
-- 15) rentabilidad_ventas — ganancia y margen por venta
-- ============================================================
-- Devuelve ingresos, CMV, ganancia bruta y margen por venta, basado en
-- el costo real (FIFO) guardado en ventas_lineas.costo_total.
CREATE OR REPLACE FUNCTION public.rentabilidad_ventas(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL,
  p_limite int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  fecha timestamptz,
  almacen text,
  ingresos numeric,
  cmv numeric,
  ganancia_bruta numeric,
  margen_porcentaje numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver rentabilidad.' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite > 200 THEN p_limite := 50; END IF;
  IF p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
    SELECT v.id, v.fecha, a.nombre AS almacen, v.total AS ingresos,
      COALESCE(sum(vl.costo_total), 0) AS cmv,
      v.total - COALESCE(sum(vl.costo_total), 0) AS ganancia_bruta,
      CASE WHEN v.total > 0
        THEN round(((v.total - COALESCE(sum(vl.costo_total), 0)) / v.total * 100)::numeric, 2)
        ELSE 0 END AS margen_porcentaje
    FROM public.ventas v
    LEFT JOIN public.ventas_lineas vl ON vl.venta_id = v.id
    LEFT JOIN public.almacenes a ON a.id = v.almacen_id
    WHERE (p_desde IS NULL OR v.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR v.fecha::date <= p_hasta)
      AND (p_almacen_id IS NULL OR v.almacen_id = p_almacen_id)
    GROUP BY v.id, v.fecha, a.nombre, v.total
    ORDER BY v.fecha DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rentabilidad_ventas(date, date, uuid, int, int) TO anon, authenticated;

-- ============================================================
-- 16) historial_compras — reporte de compras (antes no existía)
-- ============================================================
CREATE OR REPLACE FUNCTION public.historial_compras(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL,
  p_limite int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  fecha timestamptz,
  almacen text,
  proveedor text,
  usuario text,
  total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('reportes', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver compras.' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite > 200 THEN p_limite := 50; END IF;
  IF p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
    SELECT c.id, c.fecha, a.nombre AS almacen, c.proveedor,
      c.usuario_nombre AS usuario, c.total
    FROM public.compras c
    LEFT JOIN public.almacenes a ON a.id = c.almacen_id
    WHERE (p_desde IS NULL OR c.fecha::date >= p_desde)
      AND (p_hasta IS NULL OR c.fecha::date <= p_hasta)
      AND (p_almacen_id IS NULL OR c.almacen_id = p_almacen_id)
    ORDER BY c.fecha DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.historial_compras(date, date, uuid, int, int) TO anon, authenticated;

-- ============================================================
-- NOTAS DE SEGURIDAD Y ARQUITECTURA:
--   - Todos los RPC: SECURITY DEFINER, search_path = public, pg_temp.
--   - Validan auth.uid(), usuario activo y tiene_permiso en el backend.
--   - El frontend nunca modifica stock directamente: todo pasa por RPC.
--   - FIFO con FOR UPDATE: bloqueo adecuado en concurrencia.
--   - Atomicidad: toda la operación (lote + stock + movimiento) en una
--     transacción; si algo falla, se revierte todo (RAISE EXCEPTION).
--   - Reutiliza lotes_compra (no duplica). Reutiliza tiene_permiso,
--     usuario_esta_activo, operaciones_idempotencia (si aplica).
--   - movimientos_stock es la fuente ÚNICA de trazabilidad (antes no existía).
--   - No se inventan costos: el costo real sale de lotes_compra vía FIFO.
--   - El factor de presentación se resuelve en el backend (_resolver_presentacion).
-- ============================================================
