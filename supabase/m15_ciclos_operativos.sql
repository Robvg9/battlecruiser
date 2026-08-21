-- =============================================================
-- M15 — CICLOS OPERATIVOS
-- Archivo de RECONCILIACIÓN (no es una migración nueva).
--
-- Este archivo documenta objetos que YA EXISTEN en producción
-- (proyecto Supabase "battlecruiser", papxnkkjtkxsitcsvcme).
-- Se extrajo el DDL real vía information_schema / pg_constraint /
-- pg_indexes / pg_get_functiondef / pg_get_triggerdef.
--
-- NO ejecutar este archivo contra producción: las tablas, columnas,
-- funciones y trigger aquí descritos ya están creados. Se entrega
-- únicamente para versionar en GitHub y dejar el repo sincronizado
-- con el estado real de la base de datos.
--
-- Verificado en vivo el 21/08/2026, misión de solo lectura
-- (sin ALTER/CREATE/DROP/UPDATE ejecutados contra Supabase).
-- =============================================================

-- -------------------------------------------------------------
-- TABLA: ciclos_operativos
-- -------------------------------------------------------------
CREATE TABLE public.ciclos_operativos (
    id            uuid NOT NULL DEFAULT gen_random_uuid(),
    almacen_id    uuid NOT NULL,
    inicio_plan   date NOT NULL,
    cantidad_dias integer NOT NULL,
    fin_plan      date,
    estado        text NOT NULL DEFAULT 'PLANIFICADO',
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    CONSTRAINT ciclos_operativos_pkey PRIMARY KEY (id),
    CONSTRAINT ciclos_operativos_almacen_id_fkey FOREIGN KEY (almacen_id)
        REFERENCES public.almacenes (id),
    CONSTRAINT ciclos_cantidad_dias_valido CHECK (
        cantidad_dias >= 1 AND cantidad_dias <= 31
    ),
    CONSTRAINT ciclos_estado_valido CHECK (
        estado = ANY (ARRAY['PLANIFICADO','ACTIVO','EN_VALIDACION','VALIDADO','ARCHIVADO'])
    )
);

CREATE INDEX idx_ciclos_almacen ON public.ciclos_operativos USING btree (almacen_id);
CREATE INDEX idx_ciclos_estado  ON public.ciclos_operativos USING btree (estado);

-- -------------------------------------------------------------
-- TABLA: sesiones_ciclo
-- -------------------------------------------------------------
CREATE TABLE public.sesiones_ciclo (
    id                    uuid NOT NULL DEFAULT gen_random_uuid(),
    ciclo_id              uuid NOT NULL,
    dia_n                 integer NOT NULL,
    bloque                text NOT NULL,
    fecha                 date NOT NULL,
    hora_inicio_prevista  time,
    hora_fin_prevista     time,
    estado                text NOT NULL DEFAULT 'PENDIENTE',
    created_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sesiones_ciclo_pkey PRIMARY KEY (id),
    CONSTRAINT sesiones_ciclo_ciclo_id_fkey FOREIGN KEY (ciclo_id)
        REFERENCES public.ciclos_operativos (id) ON DELETE CASCADE,
    CONSTRAINT sesiones_ciclo_dia_bloque_unico UNIQUE (ciclo_id, dia_n, bloque),
    CONSTRAINT sesiones_bloque_valido CHECK (
        bloque = ANY (ARRAY['MANANA','TARDE'])
    ),
    CONSTRAINT sesiones_dia_n_positivo CHECK (dia_n >= 1),
    CONSTRAINT sesiones_estado_valido CHECK (
        estado = ANY (ARRAY['PENDIENTE','EN_CURSO','COMPLETADA','CANCELADA'])
    )
);

CREATE INDEX idx_sesiones_ciclo_ciclo ON public.sesiones_ciclo USING btree (ciclo_id);
CREATE INDEX idx_sesiones_ciclo_fecha ON public.sesiones_ciclo USING btree (fecha);

-- -------------------------------------------------------------
-- COLUMNAS AÑADIDAS A turnos (M14 no se modifica: son columnas
-- nuevas, nullable, sin alterar abrir_turno/cerrar_turno/
-- registrar_venta/registrar_cuadre)
-- -------------------------------------------------------------
ALTER TABLE public.turnos
    ADD COLUMN ciclo_id  uuid,
    ADD COLUMN sesion_id uuid;

ALTER TABLE public.turnos
    ADD CONSTRAINT turnos_ciclo_id_fkey  FOREIGN KEY (ciclo_id)  REFERENCES public.ciclos_operativos (id),
    ADD CONSTRAINT turnos_sesion_id_fkey FOREIGN KEY (sesion_id) REFERENCES public.sesiones_ciclo (id);

-- -------------------------------------------------------------
-- TRIGGER: valida que dia_n no exceda cantidad_dias del ciclo
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._validar_dia_n_sesion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cantidad_dias integer;
BEGIN
  SELECT cantidad_dias INTO v_cantidad_dias
  FROM public.ciclos_operativos WHERE id = NEW.ciclo_id;

  IF v_cantidad_dias IS NULL THEN
    RAISE EXCEPTION 'Ciclo operativo no encontrado.' USING ERRCODE = '23503';
  END IF;

  IF NEW.dia_n > v_cantidad_dias THEN
    RAISE EXCEPTION 'dia_n (%) excede la cantidad_dias del ciclo (%).', NEW.dia_n, v_cantidad_dias
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_validar_dia_n_sesion
    BEFORE INSERT OR UPDATE ON public.sesiones_ciclo
    FOR EACH ROW EXECUTE FUNCTION public._validar_dia_n_sesion();

-- -------------------------------------------------------------
-- HELPER: serializa un ciclo + sus sesiones a JSON
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ciclo_operativo_json(p_ciclo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', c.id,
    'almacen_id', c.almacen_id,
    'almacen_nombre', a.nombre,
    'inicio_plan', c.inicio_plan,
    'fin_plan', c.fin_plan,
    'cantidad_dias', c.cantidad_dias,
    'estado', c.estado,
    'created_at', c.created_at,
    'created_by', c.created_by,
    'sesiones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'dia_n', s.dia_n,
        'bloque', s.bloque,
        'fecha', s.fecha,
        'hora_inicio_prevista', s.hora_inicio_prevista,
        'hora_fin_prevista', s.hora_fin_prevista,
        'estado', s.estado
      ) ORDER BY s.dia_n, s.bloque DESC)
      FROM public.sesiones_ciclo s
      WHERE s.ciclo_id = c.id
    ), '[]'::jsonb)
  )
  INTO v_resultado
  FROM public.ciclos_operativos c
  JOIN public.almacenes a ON a.id = c.almacen_id
  WHERE c.id = p_ciclo_id;

  RETURN v_resultado;
END;
$function$;

-- -------------------------------------------------------------
-- RPC: crear_ciclo_operativo
-- Genera automáticamente 2 sesiones por día (MANANA + TARDE)
-- según cantidad_dias (configurable, 1..31).
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_ciclo_operativo(
    p_almacen_id uuid,
    p_inicio_plan date,
    p_cantidad_dias integer,
    p_idempotency_key uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid;
  v_activo boolean;
  v_idempotente uuid;
  v_ciclo_id uuid;
  v_dia integer;
BEGIN
  uid := public._validar_usuario_operacion('ciclos','crear');

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Se requiere idempotency_key';
  END IF;

  IF p_almacen_id IS NULL THEN
    RAISE EXCEPTION 'Debe especificarse un almacén para el ciclo.' USING ERRCODE = '23514';
  END IF;

  IF p_inicio_plan IS NULL THEN
    RAISE EXCEPTION 'Debe especificarse la fecha de inicio del ciclo.' USING ERRCODE = '23514';
  END IF;

  IF p_cantidad_dias IS NULL OR p_cantidad_dias < 1 OR p_cantidad_dias > 31 THEN
    RAISE EXCEPTION 'cantidad_dias inválida: debe estar entre 1 y 31.' USING ERRCODE = '23514';
  END IF;

  SELECT activo INTO v_activo FROM public.almacenes WHERE id = p_almacen_id;
  IF v_activo IS NULL THEN
    RAISE EXCEPTION 'Almacén no encontrado.' USING ERRCODE = '23503';
  END IF;
  IF NOT v_activo THEN
    RAISE EXCEPTION 'El almacén indicado está inactivo.' USING ERRCODE = '23514';
  END IF;

  v_idempotente := private.reclamar_idempotencia(
    p_idempotency_key, uid, 'crear_ciclo_operativo',
    jsonb_build_object('almacen_id', p_almacen_id, 'inicio_plan', p_inicio_plan, 'cantidad_dias', p_cantidad_dias)
  );
  IF v_idempotente IS NOT NULL THEN
    RETURN public._ciclo_operativo_json(v_idempotente) || jsonb_build_object('idempotente', true);
  END IF;

  INSERT INTO public.ciclos_operativos (almacen_id, inicio_plan, cantidad_dias, estado, created_by)
  VALUES (p_almacen_id, p_inicio_plan, p_cantidad_dias, 'PLANIFICADO', uid)
  RETURNING id INTO v_ciclo_id;

  FOR v_dia IN 1..p_cantidad_dias LOOP
    INSERT INTO public.sesiones_ciclo (ciclo_id, dia_n, bloque, fecha, estado)
    VALUES (v_ciclo_id, v_dia, 'MANANA', p_inicio_plan + (v_dia - 1), 'PENDIENTE');

    INSERT INTO public.sesiones_ciclo (ciclo_id, dia_n, bloque, fecha, estado)
    VALUES (v_ciclo_id, v_dia, 'TARDE', p_inicio_plan + (v_dia - 1), 'PENDIENTE');
  END LOOP;

  UPDATE private.operaciones_idempotencia SET resultado_id = v_ciclo_id WHERE idempotency_key = p_idempotency_key;
  PERFORM public.registrar_auditoria('ciclo_operativo', 'Ciclo operativo creado ('||p_cantidad_dias||' días) para almacén '||p_almacen_id, 'exito', v_ciclo_id::text, p_idempotency_key, NULL);

  RETURN public._ciclo_operativo_json(v_ciclo_id);
END;
$function$;

-- -------------------------------------------------------------
-- RPC: listar_ciclos_operativos
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_ciclos_operativos(
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
  PERFORM public._validar_usuario_operacion('ciclos','ver');

  SELECT COALESCE(jsonb_agg(public._ciclo_operativo_json(c.id) ORDER BY c.inicio_plan DESC), '[]'::jsonb)
  INTO v_resultado
  FROM public.ciclos_operativos c
  WHERE (p_almacen_id IS NULL OR c.almacen_id = p_almacen_id)
    AND (p_estado IS NULL OR c.estado = p_estado);

  RETURN v_resultado;
END;
$function$;

-- -------------------------------------------------------------
-- RPC: obtener_ciclo_operativo
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_ciclo_operativo(p_ciclo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  PERFORM public._validar_usuario_operacion('ciclos','ver');

  v_resultado := public._ciclo_operativo_json(p_ciclo_id);
  IF v_resultado IS NULL THEN
    RAISE EXCEPTION 'Ciclo operativo no encontrado.' USING ERRCODE = '23503';
  END IF;

  RETURN v_resultado;
END;
$function$;

-- =============================================================
-- FIN M15
-- =============================================================
