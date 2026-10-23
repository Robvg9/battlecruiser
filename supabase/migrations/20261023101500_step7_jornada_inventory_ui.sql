-- Step 7/15: session-scoped physical inventory snapshots and jornada adjustments.
-- Additive only. Legacy ventas/ciclos tables and their histories remain untouched.
BEGIN;

CREATE TABLE IF NOT EXISTS public.turno_jornada_inventario_cortes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_sesion_id uuid NOT NULL REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('INICIAL','FINAL')),
  estado text NOT NULL DEFAULT 'CONFIRMADO' CHECK (estado='CONFIRMADO'),
  creado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  confirmado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  confirmado_en timestamptz NOT NULL DEFAULT now(),
  observacion text,
  CONSTRAINT turno_jornada_corte_unico_tipo UNIQUE (turno_sesion_id,tipo)
);

CREATE TABLE IF NOT EXISTS public.turno_jornada_inventario_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corte_id uuid NOT NULL REFERENCES public.turno_jornada_inventario_cortes(id) ON DELETE RESTRICT,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  cantidad_contada numeric(14,3) NOT NULL CHECK (cantidad_contada >= 0),
  stock_sistema numeric(14,3) NOT NULL CHECK (stock_sistema >= 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turno_jornada_corte_producto_unico UNIQUE(corte_id,producto_id)
);

CREATE INDEX IF NOT EXISTS turno_jornada_cortes_sesion_idx
  ON public.turno_jornada_inventario_cortes(turno_sesion_id,tipo);
CREATE INDEX IF NOT EXISTS turno_jornada_lineas_corte_idx
  ON public.turno_jornada_inventario_lineas(corte_id);

ALTER TABLE public.turno_jornada_inventario_cortes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turno_jornada_inventario_lineas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.turno_jornada_inventario_cortes,public.turno_jornada_inventario_lineas
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bc7_obtener_inventario_jornada(p_turno_sesion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde al modelo de jornada única.' USING ERRCODE='23503';
  END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programación no encontrada.' USING ERRCODE='23503'; END IF;
  IF NOT public.bc_actor_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado puede consultar esta jornada.' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'sesion',jsonb_build_object(
      'id',v_s.id,'turno_id',v_s.turno_id,'almacen_id',v_s.almacen_id,
      'numero_dia',v_s.numero_dia,'fecha',v_s.fecha,'bloque',v_s.bloque,
      'estado',v_s.estado,'hora_inicio_prevista',v_p.hora_inicio_prevista,
      'hora_fin_prevista',v_p.hora_fin_prevista,'zona_horaria',v_p.zona_horaria,
      'responsable_id',v_p.responsable_id,'programacion_id',v_p.id
    ),
    'productos',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'producto_id',p.id,'nombre',p.nombre,'unidad',p.unidad,
        'stock_actual',s.cantidad,'minimo',s.minimo
      ) ORDER BY p.nombre,p.id)
      FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
      WHERE s.almacen_id=v_s.almacen_id AND p.activo=true
    ),'[]'::jsonb),
    'cortes',coalesce((
      SELECT jsonb_object_agg(c.tipo,jsonb_build_object(
        'id',c.id,'tipo',c.tipo,'estado',c.estado,'creado_por',c.creado_por,
        'confirmado_por',c.confirmado_por,'creado_en',c.creado_en,
        'confirmado_en',c.confirmado_en,'observacion',c.observacion,
        'lineas',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'producto_id',l.producto_id,'cantidad_contada',l.cantidad_contada,
            'stock_sistema',l.stock_sistema,'diferencia',l.cantidad_contada-l.stock_sistema
          ) ORDER BY p.nombre,p.id)
          FROM public.turno_jornada_inventario_lineas l
          JOIN public.productos p ON p.id=l.producto_id
          WHERE l.corte_id=c.id
        ),'[]'::jsonb)
      ))
      FROM public.turno_jornada_inventario_cortes c
      WHERE c.turno_sesion_id=v_s.id
    ),'{}'::jsonb),
    'tramo_activo',(
      SELECT jsonb_build_object('id',t.id,'usuario_id',t.usuario_id,'inicio_at',t.inicio_at)
      FROM public.turno_tramos t
      WHERE t.turno_sesion_id=v_s.id AND t.estado='ACTIVO'
      ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST LIMIT 1
    ),
    'declaracion_dinero',(
      SELECT jsonb_build_object('id',d.id,'monto',d.monto,'estado_aprobacion',d.estado_aprobacion,'declarado_at',d.declarado_at)
      FROM public.turno_declaraciones d
      WHERE d.turno_sesion_id=v_s.id
      ORDER BY d.declarado_at DESC NULLS LAST,d.created_at DESC NULLS LAST LIMIT 1
    )
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_guard_jornada_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF NEW.bloque='JORNADA' AND NEW.jornada_programacion_id IS NOT NULL
     AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    IF NEW.estado='EN_CURSO' AND OLD.estado IN ('PENDIENTE','PROGRAMADA') THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.turno_jornada_inventario_cortes c
        JOIN public.turno_jornada_inventario_lineas l ON l.corte_id=c.id
        WHERE c.turno_sesion_id=NEW.id AND c.tipo='INICIAL' AND c.estado='CONFIRMADO'
      ) THEN
        RAISE EXCEPTION 'Antes de abrir la jornada debes confirmar el inventario inicial.' USING ERRCODE='23514';
      END IF;
    ELSIF NEW.estado='COMPLETADA' AND OLD.estado='EN_CURSO' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.turno_jornada_inventario_cortes c
        JOIN public.turno_jornada_inventario_lineas l ON l.corte_id=c.id
        WHERE c.turno_sesion_id=NEW.id AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
      ) THEN
        RAISE EXCEPTION 'Antes de cerrar la jornada debes confirmar el inventario final.' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bc7_jornada_inventory_transition ON public.turno_sesiones;
CREATE TRIGGER bc7_jornada_inventory_transition
BEFORE UPDATE OF estado ON public.turno_sesiones
FOR EACH ROW EXECUTE FUNCTION public.bc7_guard_jornada_inventory();

CREATE OR REPLACE FUNCTION public.bc7_guardar_inventario_jornada(
  p_turno_sesion_id uuid,
  p_tipo text,
  p_lineas jsonb,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_uid uuid:=auth.uid();
  v_existing public.turno_jornada_inventario_cortes;
  v_corte_id uuid;
  v_expected integer;
  v_count integer;
  v_distinct integer;
  v_tipo text:=upper(coalesce(p_tipo,''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  IF v_tipo NOT IN ('INICIAL','FINAL') THEN
    RAISE EXCEPTION 'Tipo de inventario inválido.' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_lineas)<>'array' THEN
    RAISE EXCEPTION 'El conteo debe ser una lista de productos y cantidades.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde al modelo de jornada única.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=v_uid AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado puede registrar este inventario.' USING ERRCODE='42501';
  END IF;
  IF v_tipo='INICIAL' AND v_s.estado NOT IN ('PENDIENTE','PROGRAMADA') THEN
    RAISE EXCEPTION 'El inventario inicial debe confirmarse antes de abrir la jornada.' USING ERRCODE='23514';
  END IF;
  IF v_tipo='FINAL' AND v_s.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'El inventario final solo puede confirmarse durante la jornada.' USING ERRCODE='23514';
  END IF;
  IF NULLIF(btrim(coalesce(p_observacion,'')),'') IS NOT NULL AND length(p_observacion)>1000 THEN
    RAISE EXCEPTION 'La observación no puede superar 1000 caracteres.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_existing FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo=v_tipo FOR UPDATE;
  IF FOUND THEN
    -- Repeated delivery is safe: a confirmed snapshot is immutable and returned as already stored.
    RETURN jsonb_build_object('id',v_existing.id,'tipo',v_existing.tipo,'estado',v_existing.estado,'idempotente',true,
      'mensaje','El conteo ya estaba confirmado; no se sobrescribió.');
  END IF;

  SELECT count(*) INTO v_expected FROM public.stock s
  JOIN public.productos p ON p.id=s.producto_id
  WHERE s.almacen_id=v_s.almacen_id AND p.activo=true;
  SELECT count(*),count(DISTINCT (x.value->>'producto_id')::uuid)
    INTO v_count,v_distinct
  FROM jsonb_array_elements(p_lineas) AS x(value);
  IF v_count<>v_expected OR v_distinct<>v_count THEN
    RAISE EXCEPTION 'El conteo debe incluir una sola entrada por cada producto activo con stock registrado (% esperado; % recibidos).',
      v_expected,v_count USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) AS x(value)
    LEFT JOIN public.productos p ON p.id=(x.value->>'producto_id')::uuid AND p.activo=true
    WHERE p.id IS NULL OR jsonb_typeof(x.value)<>'object'
      OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
      OR NOT EXISTS (
        SELECT 1 FROM public.stock s
        WHERE s.almacen_id=v_s.almacen_id AND s.producto_id=p.id
      )
  ) THEN
    RAISE EXCEPTION 'Producto o cantidad inválida en el conteo.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.turno_jornada_inventario_cortes
    (turno_sesion_id,tipo,estado,creado_por,confirmado_por,observacion)
  VALUES (v_s.id,v_tipo,'CONFIRMADO',v_uid,v_uid,NULLIF(btrim(p_observacion),'' ))
  RETURNING id INTO v_corte_id;

  INSERT INTO public.turno_jornada_inventario_lineas(corte_id,producto_id,cantidad_contada,stock_sistema)
  SELECT v_corte_id,(x.value->>'producto_id')::uuid,(x.value->>'cantidad')::numeric,s.cantidad
  FROM jsonb_array_elements(p_lineas) AS x(value)
  JOIN public.stock s ON s.almacen_id=v_s.almacen_id AND s.producto_id=(x.value->>'producto_id')::uuid;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES (v_s.almacen_id,v_s.jornada_programacion_id,v_uid,
    CASE WHEN v_tipo='INICIAL' THEN 'INVENTARIO_INICIAL_CONFIRMADO' ELSE 'INVENTARIO_FINAL_CONFIRMADO' END,
    NULLIF(btrim(p_observacion),''),jsonb_build_object('sesion_id',v_s.id,'estado',v_s.estado),
    jsonb_build_object('corte_id',v_corte_id,'tipo',v_tipo,'cantidad_lineas',v_count));

  RETURN jsonb_build_object('id',v_corte_id,'tipo',v_tipo,'estado','CONFIRMADO','cantidad_lineas',v_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_registrar_ajuste_jornada(
  p_turno_sesion_id uuid,
  p_tipo text,
  p_producto_id uuid,
  p_cantidad numeric,
  p_motivo text,
  p_idempotency_key uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_uid uuid:=auth.uid();
  v_id uuid;
  v_tipo text:=lower(coalesce(p_tipo,''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  IF v_tipo NOT IN ('merma','baja') THEN RAISE EXCEPTION 'Tipo de ajuste inválido.' USING ERRCODE='22023'; END IF;
  IF p_cantidad IS NULL OR p_cantidad<=0 OR p_motivo IS NULL OR btrim(p_motivo)='' THEN
    RAISE EXCEPTION 'Cantidad positiva y motivo son obligatorios.' USING ERRCODE='22023';
  END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Se requiere clave de idempotencia.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR SHARE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'El ajuste solo puede registrarse en una jornada en curso.' USING ERRCODE='23514';
  END IF;
  IF NOT public.bc_actor_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=v_uid AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado puede registrar ajustes en esta jornada.' USING ERRCODE='42501';
  END IF;
  IF NOT public.tiene_permiso(CASE WHEN v_tipo='merma' THEN 'mermas' ELSE 'bajas' END,'crear') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar este tipo de ajuste.' USING ERRCODE='42501';
  END IF;

  IF v_tipo='merma' THEN
    v_id:=public.crear_merma(v_s.almacen_id,p_producto_id,p_cantidad,btrim(p_motivo),NULL,v_s.id,p_idempotency_key);
  ELSE
    v_id:=public.crear_baja(v_s.almacen_id,p_producto_id,p_cantidad,btrim(p_motivo),NULL,v_s.id,p_idempotency_key);
  END IF;
  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES (v_s.almacen_id,v_s.jornada_programacion_id,v_uid,
    CASE WHEN v_tipo='merma' THEN 'MERMA_SOLICITADA' ELSE 'BAJA_SOLICITADA' END,
    btrim(p_motivo),jsonb_build_object('sesion_id',v_s.id),
    jsonb_build_object('ajuste_id',v_id,'tipo',v_tipo,'producto_id',p_producto_id,'cantidad',p_cantidad));
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_obtener_inventario_jornada(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_guardar_inventario_jornada(uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_registrar_ajuste_jornada(uuid,text,uuid,numeric,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_guard_jornada_inventory() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_obtener_inventario_jornada(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_guardar_inventario_jornada(uuid,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_registrar_ajuste_jornada(uuid,text,uuid,numeric,text,uuid) TO authenticated;

COMMIT;
