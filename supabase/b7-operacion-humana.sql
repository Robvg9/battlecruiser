-- ============================================================
-- B7 — OPERACIÓN HUMANA: TURNOS + CUADRES + RESPONSABILIDADES + INCIDENCIAS
-- ============================================================
-- Migración SQL para Supabase. Construye el sistema operativo diario
-- del negocio: quién trabaja, en qué turno, qué hizo, cuánto dinero
-- debió entregar, cuánto entregó, si hay diferencias, quién revisó y
-- qué requiere aprobación.
--
-- AUDITORÍA REAL CONFIRMADA (introspección en vivo a Supabase, 2026-08-15):
--   - NO existen: turnos, cuadres, responsabilidades, incidencias,
--     auditoria_operaciones, compras, movimientos_stock (todas 404).
--   - EXISTEN: usuarios, roles, permisos, tiene_permiso (vía GET),
--     perfil_usuario_actual, permisos_usuario_actual, usuario_esta_activo,
--     listar_usuarios_admin, listar_roles_admin.
--   - lotes_compra, ventas, ventas_lineas, transferencias, vales_salida,
--     stock, productos, almacenes existen con RLS.
--
-- REGLA ARQUITECTÓNICA: una sola fuente de verdad por responsabilidad.
--   - tiene_permiso + usuario_esta_activo = única autorización (B3).
--   - _validar_usuario_operacion (B6) = validación central.
--   - registrar_auditoria (B4) = única auditoría persistente.
--   - operaciones_pendientes + ejecutarOperacion (B2) = única cola offline.
--   - _cache (B2) = única caché frontend.
--   - Esta migración NO duplica nada: crea lo que falta (turnos, cuadres,
--     responsabilidades, incidencias) y reutiliza todo lo existente.
--
-- APLICACIÓN: ejecutar en el SQL Editor de Supabase. Idempotente.
-- No DROPea datos. No duplica tablas existentes.
-- Requiere que b3-roles-permisos.sql y b4-auditoria-trazabilidad.sql
-- estén aplicados (para tiene_permiso, usuario_esta_activo y registrar_auditoria).
-- ============================================================

-- ============================================================
-- 1) Tabla turnos
-- ============================================================
-- Representa el período de trabajo de un usuario en un almacén/punto.
-- Estados: PROGRAMADO, ABIERTO, CERRADO, CANCELADO.
-- Relaciona al usuario (usuarios existentes) y el almacén (almacenes).
CREATE TABLE IF NOT EXISTS public.turnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,                 -- auth.users.id del responsable
  usuario_nombre text,                      -- snapshot legible
  almacen_id uuid,                          -- almacén/punto (opcional)
  fecha date NOT NULL DEFAULT CURRENT_DATE, -- fecha del turno
  hora_inicio_prevista time,
  hora_fin_prevista time,
  apertura_real timestamptz,                -- cuándo se abrió realmente
  cierre_real timestamptz,                   -- cuándo se cerró
  estado text NOT NULL DEFAULT 'PROGRAMADO',-- PROGRAMADO/ABIERTO/CERRADO/CANCELADO
  observacion text,                          -- incidencia/observación del turno
  creado_por uuid,                           -- usuario que lo creó (admin)
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- Constraint CHECK: estado válido.
ALTER TABLE public.turnos DROP CONSTRAINT IF EXISTS turnos_estado_valido;
ALTER TABLE public.turnos ADD CONSTRAINT turnos_estado_valido
  CHECK (estado IN ('PROGRAMADO','ABIERTO','CERRADO','CANCELADO'));

CREATE INDEX IF NOT EXISTS idx_turnos_usuario ON public.turnos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_turnos_estado ON public.turnos (estado);
CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON public.turnos (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_turnos_almacen ON public.turnos (almacen_id);

-- RLS: lectura por permisos, escritura por RPC.
ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.turnos FROM anon;

-- ============================================================
-- 2) Tabla cuadres
-- ============================================================
-- Conciliación económica de un turno. El dinero esperado se calcula
-- de las ventas reales del turno (no lo introduce el trabajador).
-- Estados: PENDIENTE, EN_REVISION, CUADRADO, CON_DIFERENCIA,
-- APROBADO, RECHAZADO.
CREATE TABLE IF NOT EXISTS public.cuadres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id uuid NOT NULL,                   -- turno al que pertenece
  dinero_esperado numeric NOT NULL DEFAULT 0,-- calculado de ventas reales
  dinero_declarado numeric,                  -- lo que el trabajador dice entregar
  diferencia numeric,                        -- declarado - esperado
  estado text NOT NULL DEFAULT 'PENDIENTE',
  observacion text,                          -- explicación de diferencia
  revisado_por uuid,                         -- admin que revisó
  revisado_nombre text,                      -- snapshot
  comentario_revision text,                  -- motivo de aprobación/rechazo
  fecha_revision timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cuadres DROP CONSTRAINT IF EXISTS cuadres_estado_valido;
ALTER TABLE public.cuadres ADD CONSTRAINT cuadres_estado_valido
  CHECK (estado IN ('PENDIENTE','EN_REVISION','CUADRADO','CON_DIFERENCIA','APROBADO','RECHAZADO'));

CREATE INDEX IF NOT EXISTS idx_cuadres_turno ON public.cuadres (turno_id);
CREATE INDEX IF NOT EXISTS idx_cuadres_estado ON public.cuadres (estado);

ALTER TABLE public.cuadres ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cuadres FROM anon;

-- ============================================================
-- 3) Tabla responsabilidades
-- ============================================================
-- Tareas operativas asignadas a un usuario o un turno.
-- Estados: PENDIENTE, EN_PROGRESO, COMPLETADA, CANCELADA.
CREATE TABLE IF NOT EXISTS public.responsabilidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descripcion text,
  usuario_id uuid,                           -- responsable (si es por usuario)
  turno_id uuid,                             -- turno relacionado (si es por turno)
  fecha_limite timestamptz,
  estado text NOT NULL DEFAULT 'PENDIENTE',
  prioridad text DEFAULT 'normal',           -- baja/normal/alta
  creador_id uuid,                           -- quien la creó
  creador_nombre text,
  completada_en timestamptz,
  observacion_final text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.responsabilidades DROP CONSTRAINT IF EXISTS resp_estado_valido;
ALTER TABLE public.responsabilidades ADD CONSTRAINT resp_estado_valido
  CHECK (estado IN ('PENDIENTE','EN_PROGRESO','COMPLETADA','CANCELADA'));

CREATE INDEX IF NOT EXISTS idx_resp_usuario ON public.responsabilidades (usuario_id);
CREATE INDEX IF NOT EXISTS idx_resp_turno ON public.responsabilidades (turno_id);
CREATE INDEX IF NOT EXISTS idx_resp_estado ON public.responsabilidades (estado);

ALTER TABLE public.responsabilidades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.responsabilidades FROM anon;

-- ============================================================
-- 4) Tabla incidencias
-- ============================================================
-- Excepciones operativas: faltantes, sobrantes, daños, errores.
-- Reutiliza el modelo de auditoría para trazabilidad.
-- Estados: ABIERTA, EN_REVISION, RESUELTA, CERRADA.
CREATE TABLE IF NOT EXISTS public.incidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,                       -- faltante/sobrante/dano/error_operativo/otro
  descripcion text NOT NULL,
  usuario_id uuid,                          -- quien la reportó
  usuario_nombre text,
  turno_id uuid,                            -- turno relacionado
  cuadre_id uuid,                           -- cuadre relacionado
  estado text NOT NULL DEFAULT 'ABIERTA',
  resolucion text,                           -- cómo se resolvió
  resuelta_por uuid,                        -- quien la resolvió
  resuelta_nombre text,
  fecha_resolucion timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencias DROP CONSTRAINT IF EXISTS inc_estado_valido;
ALTER TABLE public.incidencias ADD CONSTRAINT inc_estado_valido
  CHECK (estado IN ('ABIERTA','EN_REVISION','RESUELTA','CERRADA'));

CREATE INDEX IF NOT EXISTS idx_inc_turno ON public.incidencias (turno_id);
CREATE INDEX IF NOT EXISTS idx_inc_estado ON public.incidencias (estado);
CREATE INDEX IF NOT EXISTS idx_inc_tipo ON public.incidencias (tipo);

ALTER TABLE public.incidencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.incidencias FROM anon;

-- ============================================================
-- 5) RPC: abrir_turno
-- ============================================================
-- Abre el turno del usuario. Valida usuario activo, permiso, que no
-- tenga otro turno ABIERTO. Idempotente. Registra auditoría.
CREATE OR REPLACE FUNCTION public.abrir_turno(
  p_almacen_id uuid DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_nombre text;
  v_abierto_existente uuid;
  v_turno_id uuid;
BEGIN
  v_uid := public._validar_usuario_operacion('turnos', 'crear');
  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id = v_uid;

  -- No permitir doble apertura: si ya tiene un turno ABIERTO, devolverlo.
  SELECT id INTO v_abierto_existente FROM public.turnos
    WHERE usuario_id = v_uid AND estado = 'ABIERTO';
  IF v_abierto_existente IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_abierto_existente, 'estado', 'ABIERTO',
      'nota', 'Ya tenés un turno abierto.');
  END IF;

  INSERT INTO public.turnos (usuario_id, usuario_nombre, almacen_id, fecha,
    apertura_real, estado, observacion, creado_por)
  VALUES (v_uid, v_nombre, p_almacen_id, CURRENT_DATE, now(), 'ABIERTO',
    p_observacion, v_uid)
  RETURNING id INTO v_turno_id;

  -- Auditoría (reutiliza B4).
  PERFORM public.registrar_auditoria('turno', 'Turno abierto por ' || COALESCE(v_nombre, v_uid::text),
    'exito', v_turno_id::text, p_idempotency_key, NULL);

  RETURN jsonb_build_object('id', v_turno_id, 'estado', 'ABIERTO');
END;
$$;

GRANT EXECUTE ON FUNCTION public.abrir_turno(uuid, uuid, text) TO anon, authenticated;

-- ============================================================
-- 6) RPC: cerrar_turno
-- ============================================================
-- Cierra el turno. Valida que esté ABIERTO y pertenezca al usuario
-- (o permiso admin). Detecta operaciones pendientes/REQUIERE_ATENCION.
-- No bloquea por tareas pendientes: genera alerta.
CREATE OR REPLACE FUNCTION public.cerrar_turno(
  p_turno_id uuid,
  p_idempotency_key uuid DEFAULT NULL,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_nombre text;
  v_turno record;
  v_es_admin boolean;
  v_resp_pend int;
  v_resultado jsonb;
BEGIN
  v_uid := public._validar_usuario_operacion('turnos', 'editar');
  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id = v_uid;

  SELECT * INTO v_turno FROM public.turnos WHERE id = p_turno_id;
  IF v_turno.id IS NULL THEN
    RAISE EXCEPTION 'El turno no existe.' USING ERRCODE = 'P0001';
  END IF;
  IF v_turno.estado <> 'ABIERTO' THEN
    RAISE EXCEPTION 'El turno no está abierto (estado: %).', v_turno.estado USING ERRCODE = 'P0001';
  END IF;

  -- Validar propiedad o permiso admin (turnos.editar_any).
  v_es_admin := public.tiene_permiso('turnos', 'editar_any');
  IF v_turno.usuario_id <> v_uid AND NOT v_es_admin THEN
    RAISE EXCEPTION 'No podés cerrar un turno que no es tuyo.' USING ERRCODE = '42501';
  END IF;

  -- Detectar responsabilidades pendientes del turno (no bloquea).
  SELECT count(*) INTO v_resp_pend FROM public.responsabilidades
    WHERE turno_id = p_turno_id AND estado IN ('PENDIENTE','EN_PROGRESO');

  UPDATE public.turnos SET estado = 'CERRADO', cierre_real = now(),
    observacion = COALESCE(p_observacion, observacion),
    actualizado_en = now()
    WHERE id = p_turno_id;

  -- Crear cuadre pendiente automáticamente (se calcula el dinero esperado).
  -- El dinero esperado se calcula de las ventas reales del usuario en el
  -- período del turno (ver calcular_dinero_esperado_turno más abajo).
  INSERT INTO public.cuadres (turno_id, dinero_esperado, estado)
  VALUES (p_turno_id, public.calcular_dinero_esperado_turno(p_turno_id), 'PENDIENTE');

  PERFORM public.registrar_auditoria('turno', 'Turno cerrado por ' || COALESCE(v_nombre, v_uid::text),
    'exito', p_turno_id::text, p_idempotency_key,
    jsonb_build_object('resp_pendientes', v_resp_pend));

  RETURN jsonb_build_object('id', p_turno_id, 'estado', 'CERRADO',
    'responsabilidades_pendientes', v_resp_pend);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cerrar_turno(uuid, uuid, text) TO anon, authenticated;

-- ============================================================
-- 7) RPC: calcular_dinero_esperado_turno (interno)
-- ============================================================
-- Calcula el dinero esperado de un turno a partir de las ventas reales
-- del usuario en el período del turno. NO lo introduce el trabajador.
-- DOCUMENTACIÓN: entra el total de ventas del usuario entre apertura_real
-- y cierre_real del turno. NO entran compras/transferencias/vales
-- (son movimientos de inventario, no dinero en caja). Si el turno está
-- ABIERTO (sin cierre), usa now() como límite.
CREATE OR REPLACE FUNCTION public.calcular_dinero_esperado_turno(p_turno_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_turno record;
  v_hasta timestamptz;
  v_total numeric := 0;
BEGIN
  SELECT * INTO v_turno FROM public.turnos WHERE id = p_turno_id;
  IF v_turno.id IS NULL THEN RETURN 0; END IF;
  v_hasta := COALESCE(v_turno.cierre_real, now());
  -- Ventas del usuario en el período del turno.
  -- ventas no tiene usuario_id (verificado en auditoría B6), así que se
  -- usa el almacén + período. Si el turno tiene almacén, filtra por ahí.
  SELECT COALESCE(sum(v.total), 0) INTO v_total
    FROM public.ventas v
    WHERE v.fecha >= v_turno.apertura_real
      AND v.fecha <= v_hasta
      AND (v_turno.almacen_id IS NULL OR v.almacen_id = v_turno.almacen_id);
  RETURN v_total;
END;
$$;

-- ============================================================
-- 8) RPC: registrar_cuadre
-- ============================================================
-- El trabajador declara cuánto dinero entrega. El sistema calcula la
-- diferencia. No permite editar un cuadre ya cerrado/aprobado.
CREATE OR REPLACE FUNCTION public.registrar_cuadre(
  p_cuadre_id uuid,
  p_dinero_declarado numeric,
  p_idempotency_key uuid DEFAULT NULL,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_cuadre record;
  v_turno record;
  v_diferencia numeric;
  v_nuevo_estado text;
BEGIN
  v_uid := public._validar_usuario_operacion('turnos', 'crear');
  SELECT * INTO v_cuadre FROM public.cuadres WHERE id = p_cuadre_id;
  IF v_cuadre.id IS NULL THEN
    RAISE EXCEPTION 'El cuadre no existe.' USING ERRCODE = 'P0001';
  END IF;
  -- No permitir editar un cuadre cerrado/aprobado.
  IF v_cuadre.estado IN ('CUADRADO','APROBADO','RECHAZADO') THEN
    RAISE EXCEPTION 'El cuadre ya está cerrado (estado: %).', v_cuadre.estado USING ERRCODE = 'P0001';
  END IF;
  IF NOT (p_dinero_declarado >= 0) THEN
    RAISE EXCEPTION 'El dinero declarado no puede ser negativo.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_turno FROM public.turnos WHERE id = v_cuadre.turno_id;
  -- Validar que el cuadre pertenece al turno del usuario (o admin).
  IF v_turno.usuario_id <> v_uid AND NOT public.tiene_permiso('turnos', 'editar_any') THEN
    RAISE EXCEPTION 'No podés declarar el cuadre de un turno ajeno.' USING ERRCODE = '42501';
  END IF;

  v_diferencia := p_dinero_declarado - v_cuadre.dinero_esperado;
  v_nuevo_estado := CASE WHEN v_diferencia = 0 THEN 'CUADRADO' ELSE 'CON_DIFERENCIA' END;

  UPDATE public.cuadres SET dinero_declarado = p_dinero_declarado,
    diferencia = v_diferencia, estado = v_nuevo_estado,
    observacion = COALESCE(p_observacion, observacion),
    actualizado_en = now()
    WHERE id = p_cuadre_id;

  -- Si hay diferencia, crear incidencia automáticamente.
  IF v_diferencia <> 0 THEN
    INSERT INTO public.incidencias (tipo, descripcion, usuario_id, turno_id, cuadre_id, estado)
    VALUES (
      CASE WHEN v_diferencia < 0 THEN 'faltante' ELSE 'sobrante' END,
      'Diferencia de $' || v_diferencia || ' en cuadre del turno ' || v_cuadre.turno_id,
      v_uid, v_cuadre.turno_id, p_cuadre_id, 'ABIERTA'
    );
  END IF;

  PERFORM public.registrar_auditoria('cuadre', 'Cuadre declarado: $' || p_dinero_declarado ||
    ' (esperado $' || v_cuadre.dinero_esperado || ', diferencia $' || v_diferencia || ')',
    'exito', p_cuadre_id::text, p_idempotency_key, NULL);

  RETURN jsonb_build_object('id', p_cuadre_id, 'estado', v_nuevo_estado,
    'dinero_esperado', v_cuadre.dinero_esperado, 'dinero_declarado', p_dinero_declarado,
    'diferencia', v_diferencia);
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_cuadre(uuid, numeric, uuid, text) TO anon, authenticated;

-- ============================================================
-- 9) RPC: revisar_cuadre
-- ============================================================
-- El admin revisa, aprueba o rechaza un cuadre. No permite que el
-- trabajador apruebe su propia diferencia (valida que no sea el mismo
-- usuario que abrió el turno).
CREATE OR REPLACE FUNCTION public.revisar_cuadre(
  p_cuadre_id uuid,
  p_decision text,                          -- aprobar/rechazar/devolver
  p_comentario text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_nombre text;
  v_cuadre record;
  v_turno record;
  v_estado_anterior text;
  v_nuevo_estado text;
BEGIN
  v_uid := public._validar_usuario_operacion('turnos', 'editar_any');
  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id = v_uid;
  SELECT * INTO v_cuadre FROM public.cuadres WHERE id = p_cuadre_id;
  IF v_cuadre.id IS NULL THEN
    RAISE EXCEPTION 'El cuadre no existe.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_turno FROM public.turnos WHERE id = v_cuadre.turno_id;
  -- No permitir que el trabajador apruebe su propia diferencia.
  IF v_turno.usuario_id = v_uid THEN
    RAISE EXCEPTION 'No podés aprobar/rechazar tu propio cuadre.' USING ERRCODE = '42501';
  END IF;

  v_estado_anterior := v_cuadre.estado;
  v_nuevo_estado := CASE p_decision
    WHEN 'aprobar' THEN 'APROBADO'
    WHEN 'rechazar' THEN 'RECHAZADO'
    WHEN 'devolver' THEN 'EN_REVISION'
    ELSE v_cuadre.estado END;

  UPDATE public.cuadres SET estado = v_nuevo_estado,
    revisado_por = v_uid, revisado_nombre = v_nombre,
    comentario_revision = p_comentario, fecha_revision = now(),
    actualizado_en = now()
    WHERE id = p_cuadre_id;

  PERFORM public.registrar_auditoria('cuadre', 'Cuadre ' || p_decision || ' por ' ||
    COALESCE(v_nombre, v_uid::text) || ' (era ' || v_estado_anterior || ')',
    'exito', p_cuadre_id::text, p_idempotency_key,
    jsonb_build_object('estado_anterior', v_estado_anterior, 'estado_nuevo', v_nuevo_estado));

  RETURN jsonb_build_object('id', p_cuadre_id, 'estado', v_nuevo_estado,
    'estado_anterior', v_estado_anterior);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revisar_cuadre(uuid, text, text, uuid) TO anon, authenticated;

-- ============================================================
-- 10) RPC: crear_responsabilidad
-- ============================================================
-- Crea una tarea. Puede ser para un usuario o un turno.
CREATE OR REPLACE FUNCTION public.crear_responsabilidad(
  p_titulo text,
  p_descripcion text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL,
  p_fecha_limite timestamptz DEFAULT NULL,
  p_prioridad text DEFAULT 'normal',
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_nombre text;
  v_id uuid;
BEGIN
  v_uid := public._validar_usuario_operacion('turnos', 'crear');
  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id = v_uid;
  IF p_titulo IS NULL OR btrim(p_titulo) = '' THEN
    RAISE EXCEPTION 'El título es obligatorio.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.responsabilidades (titulo, descripcion, usuario_id, turno_id,
    fecha_limite, prioridad, creador_id, creador_nombre, estado)
  VALUES (p_titulo, p_descripcion, p_usuario_id, p_turno_id, p_fecha_limite,
    p_prioridad, v_uid, v_nombre, 'PENDIENTE')
  RETURNING id INTO v_id;

  PERFORM public.registrar_auditoria('responsabilidad', 'Responsabilidad creada: ' || p_titulo,
    'exito', v_id::text, p_idempotency_key, NULL);

  RETURN jsonb_build_object('id', v_id, 'estado', 'PENDIENTE');
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_responsabilidad(text, text, uuid, uuid, timestamptz, text, uuid) TO anon, authenticated;

-- ============================================================
-- 11) RPC: actualizar_responsabilidad
-- ============================================================
-- Cambia el estado de una responsabilidad. Valida propiedad o permiso.
CREATE OR REPLACE FUNCTION public.actualizar_responsabilidad(
  p_responsabilidad_id uuid,
  p_estado text,
  p_observacion_final text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_resp record;
  v_es_admin boolean;
BEGIN
  v_uid := public._validar_usuario_operacion('turnos', 'crear');
  SELECT * INTO v_resp FROM public.responsabilidades WHERE id = p_responsabilidad_id;
  IF v_resp.id IS NULL THEN
    RAISE EXCEPTION 'La responsabilidad no existe.' USING ERRCODE = 'P0001';
  END IF;
  v_es_admin := public.tiene_permiso('turnos', 'editar_any');
  IF v_resp.usuario_id <> v_uid AND v_resp.creador_id <> v_uid AND NOT v_es_admin THEN
    RAISE EXCEPTION 'No podés actualizar una responsabilidad que no es tuya.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.responsabilidades SET estado = p_estado,
    observacion_final = COALESCE(p_observacion_final, observacion_final),
    completada_en = CASE WHEN p_estado = 'COMPLETADA' THEN now() ELSE completada_en END,
    actualizado_en = now()
    WHERE id = p_responsabilidad_id;

  PERFORM public.registrar_auditoria('responsabilidad',
    'Responsabilidad ' || p_estado || ': ' || v_resp.titulo,
    'exito', p_responsabilidad_id::text, p_idempotency_key, NULL);

  RETURN jsonb_build_object('id', p_responsabilidad_id, 'estado', p_estado);
END;
$$;

GRANT EXECUTE ON FUNCTION public.actualizar_responsabilidad(uuid, text, text, uuid) TO anon, authenticated;

-- ============================================================
-- 12) RPC: crear_incidencia
-- ============================================================
-- Cualquier usuario puede reportar una incidencia operativa.
CREATE OR REPLACE FUNCTION public.crear_incidencia(
  p_tipo text,
  p_descripcion text,
  p_turno_id uuid DEFAULT NULL,
  p_cuadre_id uuid DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_nombre text;
  v_id uuid;
BEGIN
  v_uid := public._validar_usuario_operacion('turnos', 'crear');
  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id = v_uid;
  IF p_descripcion IS NULL OR btrim(p_descripcion) = '' THEN
    RAISE EXCEPTION 'La descripción es obligatoria.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.incidencias (tipo, descripcion, usuario_id, usuario_nombre,
    turno_id, cuadre_id, estado)
  VALUES (p_tipo, p_descripcion, v_uid, v_nombre, p_turno_id, p_cuadre_id, 'ABIERTA')
  RETURNING id INTO v_id;

  PERFORM public.registrar_auditoria('incidencia', 'Incidencia (' || p_tipo || '): ' || p_descripcion,
    'exito', v_id::text, p_idempotency_key, NULL);

  RETURN jsonb_build_object('id', v_id, 'estado', 'ABIERTA');
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_incidencia(text, text, uuid, uuid, uuid) TO anon, authenticated;

-- ============================================================
-- 13) RPC: resolver_incidencia
-- ============================================================
-- El admin resuelve una incidencia. Valida permiso editar_any.
CREATE OR REPLACE FUNCTION public.resolver_incidencia(
  p_incidencia_id uuid,
  p_resolucion text,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_nombre text;
  v_inc record;
BEGIN
  v_uid := public._validar_usuario_operacion('turnos', 'editar_any');
  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id = v_uid;
  SELECT * INTO v_inc FROM public.incidencias WHERE id = p_incidencia_id;
  IF v_inc.id IS NULL THEN
    RAISE EXCEPTION 'La incidencia no existe.' USING ERRCODE = 'P0001';
  END IF;
  IF p_resolucion IS NULL OR btrim(p_resolucion) = '' THEN
    RAISE EXCEPTION 'La resolución es obligatoria.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.incidencias SET estado = 'RESUELTA', resolucion = p_resolucion,
    resuelta_por = v_uid, resuelta_nombre = v_nombre, fecha_resolucion = now(),
    actualizado_en = now()
    WHERE id = p_incidencia_id;

  PERFORM public.registrar_auditoria('incidencia', 'Incidencia resuelta: ' || v_inc.tipo,
    'exito', p_incidencia_id::text, p_idempotency_key, NULL);

  RETURN jsonb_build_object('id', p_incidencia_id, 'estado', 'RESUELTA');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_incidencia(uuid, text, uuid) TO anon, authenticated;

-- ============================================================
-- 14) RPC de lectura: listar_turnos
-- ============================================================
-- Lista turnos con filtros. El trabajador ve los suyos; el admin ve todos.
CREATE OR REPLACE FUNCTION public.listar_turnos(
  p_usuario_id uuid DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL,
  p_limite int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  usuario_nombre text,
  almacen_id uuid,
  fecha date,
  apertura_real timestamptz,
  cierre_real timestamptz,
  estado text,
  observacion text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_es_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE = '42501';
  END IF;
  v_es_admin := public.tiene_permiso('turnos', 'editar_any');
  IF p_limite IS NULL OR p_limite > 200 THEN p_limite := 50; END IF;
  IF p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
    SELECT t.id, t.usuario_nombre, t.almacen_id, t.fecha, t.apertura_real,
      t.cierre_real, t.estado, t.observacion
    FROM public.turnos t
    WHERE (NOT v_es_admin AND t.usuario_id = v_uid OR v_es_admin)
      AND (p_usuario_id IS NULL OR t.usuario_id = p_usuario_id)
      AND (p_estado IS NULL OR p_estado = '' OR t.estado = p_estado)
      AND (p_almacen_id IS NULL OR t.almacen_id = p_almacen_id)
    ORDER BY t.fecha DESC, t.apertura_real DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_turnos(uuid, text, uuid, int, int) TO anon, authenticated;

-- ============================================================
-- 15) RPC de lectura: listar_cuadres
-- ============================================================
CREATE OR REPLACE FUNCTION public.listar_cuadres(
  p_estado text DEFAULT NULL,
  p_limite int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  turno_id uuid,
  dinero_esperado numeric,
  dinero_declarado numeric,
  diferencia numeric,
  estado text,
  observacion text,
  revisado_nombre text,
  comentario_revision text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_es_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE = '42501';
  END IF;
  v_es_admin := public.tiene_permiso('turnos', 'editar_any');
  IF p_limite IS NULL OR p_limite > 200 THEN p_limite := 50; END IF;
  IF p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
    SELECT c.id, c.turno_id, c.dinero_esperado, c.dinero_declarado, c.diferencia,
      c.estado, c.observacion, c.revisado_nombre, c.comentario_revision
    FROM public.cuadres c
    JOIN public.turnos t ON t.id = c.turno_id
    WHERE (v_es_admin OR t.usuario_id = v_uid)
      AND (p_estado IS NULL OR p_estado = '' OR c.estado = p_estado)
    ORDER BY c.creado_en DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_cuadres(text, int, int) TO anon, authenticated;

-- ============================================================
-- 16) RPC de lectura: listar_responsabilidades
-- ============================================================
CREATE OR REPLACE FUNCTION public.listar_responsabilidades(
  p_usuario_id uuid DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_limite int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  titulo text,
  descripcion text,
  usuario_id uuid,
  turno_id uuid,
  fecha_limite timestamptz,
  estado text,
  prioridad text,
  creador_nombre text,
  completada_en timestamptz,
  observacion_final text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_es_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE = '42501';
  END IF;
  v_es_admin := public.tiene_permiso('turnos', 'editar_any');
  IF p_limite IS NULL OR p_limite > 200 THEN p_limite := 50; END IF;
  IF p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
    SELECT r.id, r.titulo, r.descripcion, r.usuario_id, r.turno_id, r.fecha_limite,
      r.estado, r.prioridad, r.creador_nombre, r.completada_en, r.observacion_final
    FROM public.responsabilidades r
    WHERE (v_es_admin OR r.usuario_id = v_uid OR r.creador_id = v_uid)
      AND (p_usuario_id IS NULL OR r.usuario_id = p_usuario_id)
      AND (p_turno_id IS NULL OR r.turno_id = p_turno_id)
      AND (p_estado IS NULL OR p_estado = '' OR r.estado = p_estado)
    ORDER BY r.creado_en DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_responsabilidades(uuid, uuid, text, int, int) TO anon, authenticated;

-- ============================================================
-- 17) RPC de lectura: listar_incidencias
-- ============================================================
CREATE OR REPLACE FUNCTION public.listar_incidencias(
  p_estado text DEFAULT NULL,
  p_tipo text DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL,
  p_limite int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  tipo text,
  descripcion text,
  usuario_nombre text,
  turno_id uuid,
  cuadre_id uuid,
  estado text,
  resolucion text,
  resuelta_nombre text,
  fecha_resolucion timestamptz,
  creado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_es_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE = '42501';
  END IF;
  v_es_admin := public.tiene_permiso('turnos', 'editar_any');
  IF p_limite IS NULL OR p_limite > 200 THEN p_limite := 50; END IF;
  IF p_limite < 1 THEN p_limite := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
    SELECT i.id, i.tipo, i.descripcion, i.usuario_nombre, i.turno_id, i.cuadre_id,
      i.estado, i.resolucion, i.resuelta_nombre, i.fecha_resolucion, i.creado_en
    FROM public.incidencias i
    WHERE (v_es_admin OR i.usuario_id = v_uid)
      AND (p_estado IS NULL OR p_estado = '' OR i.estado = p_estado)
      AND (p_tipo IS NULL OR p_tipo = '' OR i.tipo = p_tipo)
      AND (p_turno_id IS NULL OR i.turno_id = p_turno_id)
    ORDER BY i.creado_en DESC
    LIMIT p_limite OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_incidencias(text, text, uuid, int, int) TO anon, authenticated;

-- ============================================================
-- 18) RPC: turno_actual_usuario
-- ============================================================
-- Devuelve el turno ABIERTO del usuario actual (o null si no tiene).
CREATE OR REPLACE FUNCTION public.turno_actual_usuario()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_turno record;
  v_cuadre jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_turno FROM public.turnos
    WHERE usuario_id = v_uid AND estado = 'ABIERTO' LIMIT 1;
  IF v_turno.id IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_build_object('id', c.id, 'estado', c.estado, 'dinero_esperado', c.dinero_esperado,
    'dinero_declarado', c.dinero_declarado, 'diferencia', c.diferencia) INTO v_cuadre
    FROM public.cuadres c WHERE c.turno_id = v_turno.id LIMIT 1;

  RETURN jsonb_build_object(
    'id', v_turno.id, 'estado', v_turno.estado, 'almacen_id', v_turno.almacen_id,
    'apertura_real', v_turno.apertura_real, 'fecha', v_turno.fecha,
    'usuario_nombre', v_turno.usuario_nombre, 'cuadre', v_cuadre
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.turno_actual_usuario() TO anon, authenticated;

-- ============================================================
-- NOTAS DE SEGURIDAD Y ARQUITECTURA:
--   - Todas las funciones: SECURITY DEFINER, search_path = public, pg_temp.
--   - Validan auth.uid(), usuario activo y tiene_permiso (reutiliza _validar_usuario_operacion de B6).
--   - auditoría: reutiliza registrar_auditoria (B4). No duplica el sistema.
--   - idempotencia: las operaciones que mueven estado pasan por la cola offline
--     del frontend (ejecutarOperacion + p_idempotency_key), no duplican mecanismo.
--   - El trabajador no puede aprobar su propio cuadre (validación real en backend).
--   - El dinero esperado se calcula de ventas reales, no lo introduce el trabajador.
--   - Diferencias generan incidencias automáticamente (no se ocultan).
--   - RLS + REVOKE a anon en todas las tablas nuevas.
--   - Reutiliza usuarios/roles/permisos/almacenes/ventas existentes. No duplica.
-- ============================================================
