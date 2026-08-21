-- =================================================================
-- M16 — ENTREGAS DE CAJA + VALIDACIÓN
-- Reconstruido desde el ESTADO REAL de producción (papxnkkjtkxsitcsvcme)
-- el 2026-08-21, a partir de:
--   - supabase_migrations.schema_migrations
--       20260821165421_m16_entregas_caja_validacion
--       20260821173254_m16_entregas_caja_completar
--   - pg_catalog / information_schema (tabla, constraints, índices,
--     RLS, funciones, grants) verificados contra el esquema vivo.
--
-- Requiere M0–M15 ya aplicados (usa ciclos_operativos, sesiones_ciclo,
-- turnos, almacenes, usuarios, private.reclamar_idempotencia,
-- public.registrar_auditoria, public._validar_usuario_operacion).
--
-- Reproducible: aplica los dos cambios reales en el mismo orden en que
-- quedaron en producción (incluida la corrección posterior).
-- =================================================================

-- -----------------------------------------------------------------
-- 0. Ampliar catálogo de permisos (permisos_seccion_check)
--    Estado real confirmado del constraint tras M16:
--    incluye 'ciclos' (de M15) y 'entregas_caja' (de M16).
-- -----------------------------------------------------------------
ALTER TABLE public.permisos DROP CONSTRAINT permisos_seccion_check;
ALTER TABLE public.permisos ADD CONSTRAINT permisos_seccion_check CHECK (
  seccion = ANY (ARRAY[
    'productos','categorias','almacenes','stock','transferencias','vales_salida',
    'ventas','reportes','usuarios','presentaciones','auditoria','turnos',
    'comunicacion','unidades','ciclos','entregas_caja'
  ])
);

-- -----------------------------------------------------------------
-- 1. TABLA: entregas_caja
--    Columnas y tipos verificados 1:1 contra information_schema.columns.
-- -----------------------------------------------------------------
CREATE TABLE public.entregas_caja (
    id                   uuid NOT NULL DEFAULT gen_random_uuid(),
    ciclo_id             uuid NOT NULL,
    sesion_id            uuid,
    turno_id             uuid,
    almacen_id           uuid NOT NULL,

    monto_declarado      numeric NOT NULL,
    declarado_por        uuid NOT NULL,
    declarado_nombre     text,
    fecha_declaracion    timestamptz NOT NULL DEFAULT now(),

    monto_contado        numeric,
    contado_por          uuid,
    contado_nombre       text,
    fecha_conteo         timestamptz,
    observacion_conteo   text,

    diferencia           numeric,

    estado               text NOT NULL DEFAULT 'DECLARADA',

    revisado_por         uuid,
    revisado_nombre      text,
    decision_revision    text,
    comentario_revision  text,
    fecha_revision       timestamptz,

    creado_en            timestamptz NOT NULL DEFAULT now(),
    actualizado_en       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT entregas_caja_pkey PRIMARY KEY (id),
    CONSTRAINT entregas_caja_ciclo_id_fkey FOREIGN KEY (ciclo_id)
        REFERENCES public.ciclos_operativos (id),
    CONSTRAINT entregas_caja_sesion_id_fkey FOREIGN KEY (sesion_id)
        REFERENCES public.sesiones_ciclo (id),
    CONSTRAINT entregas_caja_turno_id_fkey FOREIGN KEY (turno_id)
        REFERENCES public.turnos (id),
    CONSTRAINT entregas_caja_almacen_id_fkey FOREIGN KEY (almacen_id)
        REFERENCES public.almacenes (id),
    CONSTRAINT entregas_caja_declarado_por_fkey FOREIGN KEY (declarado_por)
        REFERENCES public.usuarios (id),
    CONSTRAINT entregas_caja_contado_por_fkey FOREIGN KEY (contado_por)
        REFERENCES public.usuarios (id),
    CONSTRAINT entregas_caja_revisado_por_fkey FOREIGN KEY (revisado_por)
        REFERENCES public.usuarios (id),

    CONSTRAINT entregas_caja_estado_valido CHECK (
        estado = ANY (ARRAY['DECLARADA','CONTADA','APROBADA','RECHAZADA'])
    ),
    CONSTRAINT entregas_caja_decision_valida CHECK (
        decision_revision IS NULL OR decision_revision = ANY (ARRAY['APROBADA','RECHAZADA'])
    ),
    CONSTRAINT entregas_caja_monto_declarado_valido CHECK (monto_declarado >= 0),
    CONSTRAINT entregas_caja_monto_contado_valido CHECK (monto_contado IS NULL OR monto_contado >= 0)
);

CREATE INDEX idx_entregas_caja_ciclo    ON public.entregas_caja USING btree (ciclo_id);
CREATE INDEX idx_entregas_caja_sesion   ON public.entregas_caja USING btree (sesion_id);
CREATE INDEX idx_entregas_caja_turno    ON public.entregas_caja USING btree (turno_id);
CREATE INDEX idx_entregas_caja_almacen  ON public.entregas_caja USING btree (almacen_id);
CREATE INDEX idx_entregas_caja_estado   ON public.entregas_caja USING btree (estado);

-- -----------------------------------------------------------------
-- 2. RLS — confirmado en catálogo real: relrowsecurity = true,
--    relforcerowsecurity = false, CERO policies en pg_policies.
--    Mismo patrón que ciclos_operativos/sesiones_ciclo: acceso solo
--    vía RPC SECURITY DEFINER. Los GRANT de tabla a 'authenticated'
--    son paridad de esquema; sin policy no hay acceso directo real.
-- -----------------------------------------------------------------
ALTER TABLE public.entregas_caja ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entregas_caja TO authenticated;

-- -----------------------------------------------------------------
-- 3. PERMISOS entregas_caja para roles existentes
--    Estado real verificado en public.permisos: hoy sólo existe el
--    rol "Dueño" y tiene las 5 filas (ver/crear/editar/editar_any/borrar)
--    en permitido = true.
-- -----------------------------------------------------------------
INSERT INTO public.permisos (role_id, seccion, accion, permitido)
SELECT r.id, 'entregas_caja', a.accion, true
FROM public.roles r
CROSS JOIN (VALUES ('ver'),('crear'),('editar'),('editar_any'),('borrar')) AS a(accion)
ON CONFLICT (role_id, seccion, accion) DO NOTHING;

-- -----------------------------------------------------------------
-- 4. HELPER: serializa una entrega de caja a JSON
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._entrega_caja_json(p_entrega_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', e.id,
    'ciclo_id', e.ciclo_id,
    'sesion_id', e.sesion_id,
    'turno_id', e.turno_id,
    'almacen_id', e.almacen_id,
    'almacen_nombre', al.nombre,
    'monto_declarado', e.monto_declarado,
    'declarado_por', e.declarado_por,
    'declarado_nombre', e.declarado_nombre,
    'fecha_declaracion', e.fecha_declaracion,
    'monto_contado', e.monto_contado,
    'contado_por', e.contado_por,
    'contado_nombre', e.contado_nombre,
    'fecha_conteo', e.fecha_conteo,
    'observacion_conteo', e.observacion_conteo,
    'diferencia', e.diferencia,
    'estado', e.estado,
    'revisado_por', e.revisado_por,
    'revisado_nombre', e.revisado_nombre,
    'decision_revision', e.decision_revision,
    'comentario_revision', e.comentario_revision,
    'fecha_revision', e.fecha_revision,
    'creado_en', e.creado_en,
    'actualizado_en', e.actualizado_en
  )
  INTO v_resultado
  FROM public.entregas_caja e
  JOIN public.almacenes al ON al.id = e.almacen_id
  WHERE e.id = p_entrega_id;

  RETURN v_resultado;
END;
$function$;

-- -----------------------------------------------------------------
-- 5. RPC: declarar_entrega_caja
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.declarar_entrega_caja(
    p_ciclo_id uuid,
    p_monto_declarado numeric,
    p_sesion_id uuid DEFAULT NULL::uuid,
    p_turno_id uuid DEFAULT NULL::uuid,
    p_almacen_id uuid DEFAULT NULL::uuid,
    p_idempotency_key uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid;
  v_idempotente uuid;
  v_entrega_id uuid;
  v_ciclo record;
  v_almacen_id uuid;
BEGIN
  uid := public._validar_usuario_operacion('entregas_caja','crear');

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Se requiere idempotency_key';
  END IF;

  IF p_monto_declarado IS NULL OR p_monto_declarado < 0 THEN
    RAISE EXCEPTION 'monto_declarado inválido: debe ser mayor o igual a 0.' USING ERRCODE = '23514';
  END IF;

  SELECT id, almacen_id, estado INTO v_ciclo FROM public.ciclos_operativos WHERE id = p_ciclo_id;
  IF v_ciclo.id IS NULL THEN
    RAISE EXCEPTION 'Ciclo operativo no encontrado.' USING ERRCODE = '23503';
  END IF;

  v_almacen_id := COALESCE(p_almacen_id, v_ciclo.almacen_id);
  IF v_almacen_id <> v_ciclo.almacen_id THEN
    RAISE EXCEPTION 'El almacén indicado no coincide con el almacén del ciclo.' USING ERRCODE = '23514';
  END IF;

  IF p_sesion_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.sesiones_ciclo WHERE id = p_sesion_id AND ciclo_id = p_ciclo_id
    ) THEN
      RAISE EXCEPTION 'La sesión indicada no pertenece al ciclo indicado.' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_turno_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.turnos WHERE id = p_turno_id AND almacen_id = v_almacen_id
    ) THEN
      RAISE EXCEPTION 'El turno indicado no pertenece al almacén del ciclo.' USING ERRCODE = '23514';
    END IF;
  END IF;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key, uid, 'declarar_entrega_caja',
    jsonb_build_object('ciclo_id', p_ciclo_id, 'sesion_id', p_sesion_id, 'turno_id', p_turno_id,
                        'almacen_id', v_almacen_id, 'monto_declarado', p_monto_declarado)
  );
  IF v_idempotente IS NOT NULL THEN
    RETURN public._entrega_caja_json(v_idempotente) || jsonb_build_object('idempotente', true);
  END IF;

  INSERT INTO public.entregas_caja (
    ciclo_id, sesion_id, turno_id, almacen_id,
    monto_declarado, declarado_por, declarado_nombre, estado
  ) VALUES (
    p_ciclo_id, p_sesion_id, p_turno_id, v_almacen_id,
    p_monto_declarado, uid, (SELECT nombre FROM public.usuarios WHERE id = uid), 'DECLARADA'
  ) RETURNING id INTO v_entrega_id;

  UPDATE private.operaciones_idempotencia SET resultado_id = v_entrega_id WHERE idempotency_key = p_idempotency_key;
  PERFORM public.registrar_auditoria('entrega_caja', 'Entrega de caja declarada por ' || uid, 'exito', v_entrega_id::text, p_idempotency_key, NULL);

  RETURN public._entrega_caja_json(v_entrega_id);
END;
$function$;

-- -----------------------------------------------------------------
-- 6. RPC: registrar_conteo_entrega_caja
--    NOTA DE FIDELIDAD: esta función quedó en la primera migración
--    (m16_entregas_caja_validacion) y en el estado REAL actual de
--    producción SIGUE EXISTIENDO (verificado en pg_proc), aunque la
--    segunda migración (m16_entregas_caja_completar) creó una función
--    distinta y funcionalmente equivalente, registrar_recepcion_entrega_caja
--    (paso 6-bis), que es la que de hecho usa el resto del M16 (permisos,
--    flujo DECLARADA->CONTADA). Ambas coexisten hoy en la base real; esta
--    quedó huérfana/sin uso. Se incluye aquí tal cual está en producción
--    para que este archivo sea fiel al estado real. Ver PASS/FAIL al
--    final de la respuesta para más detalle.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_conteo_entrega_caja(
    p_entrega_id uuid,
    p_monto_contado numeric,
    p_observacion text DEFAULT NULL::text,
    p_idempotency_key uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid;
  v_idempotente uuid;
  e record;
  v_diferencia numeric;
BEGIN
  uid := public._validar_usuario_operacion('entregas_caja','editar');

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Se requiere idempotency_key';
  END IF;

  IF p_monto_contado IS NULL OR p_monto_contado < 0 THEN
    RAISE EXCEPTION 'monto_contado inválido: debe ser mayor o igual a 0.' USING ERRCODE = '23514';
  END IF;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key, uid, 'registrar_conteo_entrega_caja',
    jsonb_build_object('entrega_id', p_entrega_id, 'monto_contado', p_monto_contado)
  );
  IF v_idempotente IS NOT NULL THEN
    RETURN public._entrega_caja_json(v_idempotente) || jsonb_build_object('idempotente', true);
  END IF;

  SELECT * INTO e FROM public.entregas_caja WHERE id = p_entrega_id;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'La entrega de caja no existe.' USING ERRCODE = '23503';
  END IF;

  IF e.estado <> 'DECLARADA' THEN
    RAISE EXCEPTION 'Solo se puede registrar el conteo de una entrega en estado DECLARADA (actual: %).', e.estado
      USING ERRCODE = '23514';
  END IF;

  v_diferencia := p_monto_contado - e.monto_declarado;

  UPDATE public.entregas_caja SET
    monto_contado = p_monto_contado,
    contado_por = uid,
    contado_nombre = (SELECT nombre FROM public.usuarios WHERE id = uid),
    fecha_conteo = now(),
    observacion_conteo = p_observacion,
    diferencia = v_diferencia,
    estado = 'CONTADA',
    actualizado_en = now()
  WHERE id = p_entrega_id;

  UPDATE private.operaciones_idempotencia SET resultado_id = p_entrega_id WHERE idempotency_key = p_idempotency_key;
  PERFORM public.registrar_auditoria('entrega_caja', 'Conteo registrado para entrega de caja', 'exito', p_entrega_id::text, p_idempotency_key, jsonb_build_object('diferencia', v_diferencia));

  RETURN public._entrega_caja_json(p_entrega_id);
END;
$function$;

-- -----------------------------------------------------------------
-- 6-bis. RPC: registrar_recepcion_entrega_caja
--    Esta es la versión FINAL/vigente (creada por
--    m16_entregas_caja_completar, "faltaba"). Es la que debe usar el
--    frontend para el paso DECLARADA -> CONTADA.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_recepcion_entrega_caja(
  p_entrega_id uuid,
  p_monto_contado numeric,
  p_observacion_conteo text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid;
  v_idempotente uuid;
  e record;
BEGIN
  uid := public._validar_usuario_operacion('entregas_caja','editar');

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Se requiere idempotency_key';
  END IF;

  IF p_monto_contado IS NULL OR p_monto_contado < 0 THEN
    RAISE EXCEPTION 'monto_contado inválido: debe ser mayor o igual a 0.' USING ERRCODE = '23514';
  END IF;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key, uid, 'registrar_recepcion_entrega_caja',
    jsonb_build_object('entrega_id', p_entrega_id, 'monto_contado', p_monto_contado, 'observacion_conteo', p_observacion_conteo)
  );
  IF v_idempotente IS NOT NULL THEN
    RETURN public._entrega_caja_json(v_idempotente) || jsonb_build_object('idempotente', true);
  END IF;

  SELECT * INTO e FROM public.entregas_caja WHERE id = p_entrega_id;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'La entrega de caja no existe.' USING ERRCODE = '23503';
  END IF;

  IF e.estado <> 'DECLARADA' THEN
    RAISE EXCEPTION 'Solo se puede registrar recepción de una entrega en estado DECLARADA (actual: %).', e.estado
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.entregas_caja SET
    monto_contado = p_monto_contado,
    contado_por = uid,
    contado_nombre = (SELECT nombre FROM public.usuarios WHERE id = uid),
    fecha_conteo = now(),
    observacion_conteo = p_observacion_conteo,
    diferencia = p_monto_contado - e.monto_declarado,
    estado = 'CONTADA',
    actualizado_en = now()
  WHERE id = p_entrega_id;

  UPDATE private.operaciones_idempotencia SET resultado_id = p_entrega_id WHERE idempotency_key = p_idempotency_key;
  PERFORM public.registrar_auditoria('entrega_caja', 'Entrega de caja contada por ' || uid, 'exito', p_entrega_id::text, p_idempotency_key, jsonb_build_object('monto_contado', p_monto_contado));

  RETURN public._entrega_caja_json(p_entrega_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.registrar_recepcion_entrega_caja(uuid, numeric, text, uuid) TO authenticated;

-- -----------------------------------------------------------------
-- 7. RPC: revisar_entrega_caja (aprobar / rechazar)
--    Versión FINAL vigente (la de m16_entregas_caja_completar, que
--    corrigió el bug de la primera versión: exige motivo obligatorio
--    en el rechazo). La versión anterior sin esa validación quedó
--    reemplazada por CREATE OR REPLACE, no coexiste.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revisar_entrega_caja(
  p_entrega_id uuid,
  p_decision text,
  p_comentario text DEFAULT NULL::text,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid;
  v_idempotente uuid;
  e record;
  v_nuevo text;
BEGIN
  uid := public._validar_usuario_operacion('entregas_caja','editar_any');

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Se requiere idempotency_key';
  END IF;

  IF p_decision NOT IN ('aprobar','rechazar') THEN
    RAISE EXCEPTION 'Decisión inválida: debe ser aprobar o rechazar.' USING ERRCODE = '23514';
  END IF;

  IF p_decision = 'rechazar' AND (p_comentario IS NULL OR btrim(p_comentario) = '') THEN
    RAISE EXCEPTION 'El rechazo requiere un motivo (comentario).' USING ERRCODE = '23514';
  END IF;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key, uid, 'revisar_entrega_caja',
    jsonb_build_object('entrega_id', p_entrega_id, 'decision', p_decision, 'comentario', p_comentario)
  );
  IF v_idempotente IS NOT NULL THEN
    RETURN public._entrega_caja_json(v_idempotente) || jsonb_build_object('idempotente', true);
  END IF;

  SELECT * INTO e FROM public.entregas_caja WHERE id = p_entrega_id;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'La entrega de caja no existe.' USING ERRCODE = '23503';
  END IF;

  IF e.estado <> 'CONTADA' THEN
    RAISE EXCEPTION 'Solo se puede aprobar/rechazar una entrega en estado CONTADA (actual: %).', e.estado
      USING ERRCODE = '23514';
  END IF;

  IF uid = e.declarado_por OR uid = e.contado_por THEN
    RAISE EXCEPTION 'No podés aprobar/rechazar tu propia entrega de caja.' USING ERRCODE = '42501';
  END IF;

  v_nuevo := CASE p_decision WHEN 'aprobar' THEN 'APROBADA' WHEN 'rechazar' THEN 'RECHAZADA' END;

  UPDATE public.entregas_caja SET
    estado = v_nuevo,
    revisado_por = uid,
    revisado_nombre = (SELECT nombre FROM public.usuarios WHERE id = uid),
    decision_revision = v_nuevo,
    comentario_revision = p_comentario,
    fecha_revision = now(),
    actualizado_en = now()
  WHERE id = p_entrega_id;

  UPDATE private.operaciones_idempotencia SET resultado_id = p_entrega_id WHERE idempotency_key = p_idempotency_key;
  PERFORM public.registrar_auditoria('entrega_caja', 'Entrega de caja ' || p_decision, 'exito', p_entrega_id::text, p_idempotency_key, jsonb_build_object('estado_nuevo', v_nuevo));

  RETURN public._entrega_caja_json(p_entrega_id);
END;
$function$;

-- -----------------------------------------------------------------
-- 8. RPC: listar_entregas_caja
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_entregas_caja(
    p_ciclo_id uuid DEFAULT NULL::uuid,
    p_almacen_id uuid DEFAULT NULL::uuid,
    p_estado text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  PERFORM public._validar_usuario_operacion('entregas_caja','ver');

  SELECT COALESCE(jsonb_agg(public._entrega_caja_json(e.id) ORDER BY e.creado_en DESC), '[]'::jsonb)
  INTO v_resultado
  FROM public.entregas_caja e
  WHERE (p_ciclo_id IS NULL OR e.ciclo_id = p_ciclo_id)
    AND (p_almacen_id IS NULL OR e.almacen_id = p_almacen_id)
    AND (p_estado IS NULL OR e.estado = p_estado);

  RETURN v_resultado;
END;
$function$;

-- -----------------------------------------------------------------
-- 9. RPC: obtener_entrega_caja
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_entrega_caja(p_entrega_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  PERFORM public._validar_usuario_operacion('entregas_caja','ver');

  v_resultado := public._entrega_caja_json(p_entrega_id);
  IF v_resultado IS NULL THEN
    RAISE EXCEPTION 'Entrega de caja no encontrada.' USING ERRCODE = '23503';
  END IF;

  RETURN v_resultado;
END;
$function$;

-- =================================================================
-- FIN M16
--
-- NOTA DE FIDELIDAD SOBRE GRANTS DE EJECUCIÓN (verificado en pg_proc.proacl):
-- Ninguna migración de M16 ejecutó REVOKE EXECUTE sobre estas funciones.
-- Postgres otorga EXECUTE a PUBLIC por defecto en toda función nueva,
-- y ese default sigue vigente hoy para las 7 funciones de este archivo
-- (incluida la huérfana registrar_conteo_entrega_caja): anon y PUBLIC
-- pueden ejecutarlas directamente, aunque la RLS sin policies impide
-- que anon lea/escriba la tabla igual. Este archivo NO agrega ningún
-- REVOKE porque no lo hay en el estado real; se deja constancia acá
-- para que quede visible, tal como pediste que se reporte cualquier
-- hallazgo relevante para "grants necesarios".
-- =================================================================
