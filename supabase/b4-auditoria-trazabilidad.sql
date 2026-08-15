-- ============================================================
-- B4 — Centro de Mando + Auditoría + Trazabilidad Operativa
-- ============================================================
-- Migración SQL para Supabase. Reutiliza la arquitectura existente
-- (usuarios, roles, permisos, tiene_permiso, operaciones_idempotencia).
-- NO duplica tablas ni sistemas existentes.
--
-- AUDITORÍA REAL CONFIRMADA:
--   - Las tablas ventas/transferencias/vales_salida NO tienen columna
--     usuario_id ni idempotency_key (verificado por introspección directa).
--   - No existe tabla de auditoría/historial (auditoria, historial,
--     movimientos, bitacora, etc. — ninguna existe).
--   - La única trazabilidad existente está en:
--       * operaciones_pendientes (IndexedDB, se elimina al sincronizar);
--       * private.operaciones_idempotencia (central, con usuario_id,
--         tipo_operacion, payload_hash, resultado_id).
--
-- Esta migración crea la fuente histórica persistente MÍNIMA que falta:
-- una tabla `auditoria_operaciones` y los RPC para escribir/leer en ella,
-- reutilizando tiene_permiso para la autorización real.
--
-- APLICACIÓN: ejecutar en el SQL Editor de Supabase. Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabla auditoria_operaciones
--    Registro persistente de operaciones importantes: quién hizo qué,
--    cuándo, sobre qué, resultado e identificador. NO almacena
--    contraseñas, tokens ni secretos. El payload se guarda solo con lo
--    necesario para reconstruir (sin datos sensibles).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auditoria_operaciones (
  id bigserial PRIMARY KEY,
  fecha timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid,                       -- auth.users.id de quien originó
  usuario_nombre text,                   -- nombre legible (snapshot)
  tipo text NOT NULL,                    -- compra/venta/transferencia/vale/producto/usuario_rol/usuario_estado/sincronizacion
  descripcion text,                      -- texto legible de qué ocurrió
  estado text,                           -- resultado: exito / requiere_atencion / error / pendiente
  entidad_id text,                      -- id de la entidad afectada cuando aplique
  idempotency_key uuid,                  -- cuando la operación tenga una
  payload_resumen jsonb,                 -- resumen NO sensible del payload
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON public.auditoria_operaciones (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON public.auditoria_operaciones (usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_tipo ON public.auditoria_operaciones (tipo);
CREATE INDEX IF NOT EXISTS idx_auditoria_estado ON public.auditoria_operaciones (estado);

-- RLS: la lectura de auditoría requiere permiso. La escritura la hacen
-- los RPC (SECURITY DEFINER), no inserts directos del cliente.
ALTER TABLE public.auditoria_operaciones ENABLE ROW LEVEL SECURITY;
-- Nótese: la policy de lectura se define vía RPC (listar_auditoria_admin)
-- protegido con tiene_permiso. No se permite SELECT directo desde el
-- cliente para evitar bypass de permisos.
REVOKE ALL ON public.auditoria_operaciones FROM anon;

-- ------------------------------------------------------------
-- 2) registrar_auditoria(p_tipo, p_descripcion, p_estado, ...)
--    Inserta un registro de auditoría. SECURITY DEFINER para poder
--    escribir en la tabla aunque el cliente no tenga permiso directo.
--    Toma usuario_id y usuario_nombre del usuario autenticado actual.
--    No requiere permiso administrativo: cualquier operación legítima
--    puede registrar su propia auditoría (escribe SU propia acción).
--    La protección está en que solo se llama desde los flujos reales.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_auditoria(
  p_tipo text,
  p_descripcion text,
  p_estado text DEFAULT 'exito',
  p_entidad_id text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_payload_resumen jsonb DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id bigint;
  v_usuario_id uuid := auth.uid();
  v_usuario_nombre text;
BEGIN
  -- Snapshot del nombre del usuario actual para trazabilidad histórica
  -- (si el usuario se renombra o se desactiva, el registro conserva el
  -- nombre que tenía al ocurrir la acción).
  SELECT u.nombre INTO v_usuario_nombre FROM public.usuarios u WHERE u.id = v_usuario_id;

  INSERT INTO public.auditoria_operaciones
    (usuario_id, usuario_nombre, tipo, descripcion, estado, entidad_id, idempotency_key, payload_resumen)
  VALUES
    (v_usuario_id, v_usuario_nombre, p_tipo, p_descripcion, p_estado, p_entidad_id, p_idempotency_key, p_payload_resumen)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_auditoria(text, text, text, text, uuid, jsonb) TO anon, authenticated;

-- ------------------------------------------------------------
-- 3) listar_auditoria_admin(p_filtro_json)
--    Lista registros de auditoría con filtros opcionales.
--    Protegida con tiene_permiso('auditoria','ver').
--    Soporta filtro por usuario, tipo, estado y paginación (limit/offset).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_auditoria_admin(
  p_usuario_id uuid DEFAULT NULL,
  p_tipo text DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_limite int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id bigint,
  fecha timestamptz,
  usuario_id uuid,
  usuario_nombre text,
  tipo text,
  descripcion text,
  estado text,
  entidad_id text,
  idempotency_key uuid,
  payload_resumen jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.tiene_permiso('auditoria', 'ver') THEN
    RAISE EXCEPTION 'No tenés permiso para ver auditoría.' USING ERRCODE = '42501';
  END IF;
  -- Límite razonable para no cargar miles de registros.
  IF p_limite IS NULL OR p_limite > 200 THEN p_limite := 50; END IF;
  IF p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
    SELECT a.id, a.fecha, a.usuario_id, a.usuario_nombre, a.tipo, a.descripcion,
           a.estado, a.entidad_id, a.idempotency_key, a.payload_resumen
    FROM public.auditoria_operaciones a
    WHERE (p_usuario_id IS NULL OR a.usuario_id = p_usuario_id)
      AND (p_tipo IS NULL OR p_tipo = '' OR a.tipo = p_tipo)
      AND (p_estado IS NULL OR p_estado = '' OR a.estado = p_estado)
    ORDER BY a.fecha DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_auditoria_admin(uuid, text, text, int, int) TO anon, authenticated;

-- ============================================================
-- NOTAS DE SEGURIDAD:
--   - La tabla auditoria_operaciones tiene RLS habilitado y REVOKE a anon,
--     por lo que el cliente NO puede hacer SELECT directo: solo los RPC
--     (SECURITY DEFINER) acceden, y listar_auditoria_admin valida
--     tiene_permiso('auditoria','ver').
--   - registrar_auditoria toma usuario_id de auth.uid() (no del parámetro
--     del cliente), así que un usuario no puede falsificar el autor de una
--     acción en la auditoría.
--   - No se almacenan contraseñas, tokens ni secretos. payload_resumen
--     debe contener solo lo necesario (cantidades, nombres, ids), nunca
--     datos sensibles.
--   - Reutiliza tiene_permiso existente. No crea otro sistema de permisos.
-- ============================================================
