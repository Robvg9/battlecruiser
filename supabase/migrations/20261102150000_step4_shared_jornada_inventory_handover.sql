-- Step 4/15 — shared physical inventory handover between adjacent JORNADA sessions.
-- Immutable source cuts remain untouched. The handover ledger owns the effective quantity.
BEGIN;

CREATE TABLE IF NOT EXISTS public.turno_jornada_inventario_entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  turno_id uuid NOT NULL REFERENCES public.turnos(id) ON DELETE RESTRICT,
  origen_sesion_id uuid NOT NULL UNIQUE REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT,
  origen_corte_id uuid NOT NULL UNIQUE REFERENCES public.turno_jornada_inventario_cortes(id) ON DELETE RESTRICT,
  destino_sesion_id uuid UNIQUE REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT,
  fecha_destino date NOT NULL,
  estado text NOT NULL CHECK (estado IN (
    'PENDIENTE_PROGRAMACION','PENDIENTE_RECEPCION','PENDIENTE_REVISION','ACEPTADA','REQUIERE_RECUENTO'
  )),
  creado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turno_jornada_entrega_sesiones_distintas CHECK
    (destino_sesion_id IS NULL OR destino_sesion_id <> origen_sesion_id)
);

CREATE TABLE IF NOT EXISTS public.turno_jornada_inventario_entrega_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES public.turno_jornada_inventario_entregas(id) ON DELETE RESTRICT,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  cantidad_declarada numeric(14,3) NOT NULL CHECK (cantidad_declarada >= 0),
  cantidad_efectiva numeric(14,3) CHECK (cantidad_efectiva IS NULL OR cantidad_efectiva >= 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turno_jornada_entrega_producto_unico UNIQUE(entrega_id,producto_id)
);

CREATE TABLE IF NOT EXISTS public.turno_jornada_inventario_recepciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES public.turno_jornada_inventario_entregas(id) ON DELETE RESTRICT,
  intento integer NOT NULL CHECK (intento > 0),
  recibido_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recibido_en timestamptz NOT NULL DEFAULT now(),
  estado text NOT NULL CHECK (estado IN ('PENDIENTE_REVISION','ACEPTADA','RECHAZADA')),
  observacion text,
  decision_por uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  decision_en timestamptz,
  decision_motivo text,
  idempotency_key uuid NOT NULL UNIQUE,
  payload_hash text NOT NULL,
  CONSTRAINT turno_jornada_recepcion_intento_unico UNIQUE(entrega_id,intento)
);

CREATE TABLE IF NOT EXISTS public.turno_jornada_inventario_recepcion_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recepcion_id uuid NOT NULL REFERENCES public.turno_jornada_inventario_recepciones(id) ON DELETE RESTRICT,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  cantidad_declarada numeric(14,3) NOT NULL CHECK (cantidad_declarada >= 0),
  cantidad_recibida numeric(14,3) NOT NULL CHECK (cantidad_recibida >= 0),
  diferencia numeric(14,3) NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turno_jornada_recepcion_producto_unico UNIQUE(recepcion_id,producto_id)
);

CREATE INDEX IF NOT EXISTS turno_jornada_entrega_destino_estado_idx
  ON public.turno_jornada_inventario_entregas(destino_sesion_id,estado);
CREATE INDEX IF NOT EXISTS turno_jornada_entrega_fecha_idx
  ON public.turno_jornada_inventario_entregas(almacen_id,fecha_destino,estado);
CREATE INDEX IF NOT EXISTS turno_jornada_recepciones_entrega_idx
  ON public.turno_jornada_inventario_recepciones(entrega_id,intento DESC);

ALTER TABLE public.turno_jornada_inventario_entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turno_jornada_inventario_entrega_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turno_jornada_inventario_recepciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turno_jornada_inventario_recepcion_lineas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.turno_jornada_inventario_entregas,
  public.turno_jornada_inventario_entrega_lineas,
  public.turno_jornada_inventario_recepciones,
  public.turno_jornada_inventario_recepcion_lineas
FROM PUBLIC,anon,authenticated;

-- Create one shared handover when the outgoing session confirms its FINAL snapshot.
-- The next JORNADA session is reused if the multi-day schedule already created it.
CREATE OR REPLACE FUNCTION public.bc7_preparar_entrega_inventario_jornada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_destino uuid;
  v_entrega uuid;
BEGIN
  IF NEW.tipo <> 'FINAL' THEN RETURN NEW; END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=NEW.turno_sesion_id AND bloque='JORNADA'
    AND jornada_programacion_id IS NOT NULL;

  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT s.id INTO v_destino
  FROM public.turno_sesiones s
  WHERE s.turno_id=v_s.turno_id
    AND s.numero_dia=v_s.numero_dia+1
    AND s.fecha=v_s.fecha+1
    AND s.almacen_id=v_s.almacen_id
    AND s.bloque='JORNADA'
    AND s.jornada_programacion_id IS NOT NULL
    AND s.estado IN ('PENDIENTE','PROGRAMADA')
  ORDER BY s.created_at,s.id
  LIMIT 1;

  -- A legacy INITIAL already recorded before this feature remains historical and is not relinked.
  IF v_destino IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=v_destino AND c.tipo='INICIAL'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.turno_jornada_inventario_entregas
    (almacen_id,turno_id,origen_sesion_id,origen_corte_id,destino_sesion_id,fecha_destino,
     estado,creado_por)
  VALUES
    (v_s.almacen_id,v_s.turno_id,v_s.id,NEW.id,v_destino,v_s.fecha+1,
     CASE WHEN v_destino IS NULL THEN 'PENDIENTE_PROGRAMACION' ELSE 'PENDIENTE_RECEPCION' END,
     NEW.confirmado_por)
  ON CONFLICT (origen_sesion_id) DO NOTHING
  RETURNING id INTO v_entrega;

  IF v_entrega IS NULL THEN
    SELECT id INTO v_entrega
    FROM public.turno_jornada_inventario_entregas
    WHERE origen_sesion_id=v_s.id;
  ELSE
    INSERT INTO public.turno_jornada_inventario_entrega_lineas
      (entrega_id,producto_id,cantidad_declarada)
    SELECT v_entrega,l.producto_id,l.cantidad_contada
    FROM public.turno_jornada_inventario_lineas l
    WHERE l.corte_id=NEW.id
    ON CONFLICT (entrega_id,producto_id) DO NOTHING;

    INSERT INTO public.turno_jornada_eventos
      (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
    VALUES
      (v_s.almacen_id,v_s.jornada_programacion_id,NEW.confirmado_por,
       'INVENTARIO_ENTREGA_PREPARADA',
       'Entrega compartida generada desde el inventario final confirmado.',
       jsonb_build_object('sesion_origen_id',v_s.id,'corte_final_id',NEW.id),
       jsonb_build_object('entrega_id',v_entrega,'sesion_destino_id',v_destino,
         'fecha_destino',v_s.fecha+1));
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bc7_preparar_entrega_inventario_jornada ON public.turno_jornada_inventario_cortes;
CREATE CONSTRAINT TRIGGER bc7_preparar_entrega_inventario_jornada
AFTER INSERT ON public.turno_jornada_inventario_cortes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.bc7_preparar_entrega_inventario_jornada();

-- A manually linked destination must be the already scheduled next JORNADA, never a duplicate.
CREATE OR REPLACE FUNCTION public.bc7_vincular_entrega_jornada(
  p_entrega_id uuid,
  p_destino_sesion_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_e public.turno_jornada_inventario_entregas;
  v_s public.turno_sesiones;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el dueño puede vincular la siguiente jornada.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_e FROM public.turno_jornada_inventario_entregas
  WHERE id=p_entrega_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrega de inventario no encontrada.' USING ERRCODE='23503'; END IF;
  IF v_e.estado<>'PENDIENTE_PROGRAMACION' OR v_e.destino_sesion_id IS NOT NULL THEN
    RAISE EXCEPTION 'La entrega ya tiene destino o ya fue procesada.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_s FROM public.turno_sesiones
  WHERE id=p_destino_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL
     OR v_s.almacen_id<>v_e.almacen_id OR v_s.fecha<>v_e.fecha_destino
     OR v_s.estado NOT IN ('PENDIENTE','PROGRAMADA')
     OR NOT EXISTS (SELECT 1 FROM public.turno_sesiones o
       WHERE o.id=v_e.origen_sesion_id
         AND ((v_s.turno_id=o.turno_id AND v_s.numero_dia=o.numero_dia+1)
           OR (v_s.turno_id<>o.turno_id AND v_s.numero_dia=1))) THEN
    RAISE EXCEPTION 'El destino debe ser una jornada única ya programada para el mismo almacén y la fecha siguiente.' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_inventario_entregas
    WHERE destino_sesion_id=v_s.id AND id<>v_e.id
  ) OR EXISTS (
    SELECT 1 FROM public.turno_jornada_inventario_cortes
    WHERE turno_sesion_id=v_s.id AND tipo='INICIAL'
  ) THEN
    RAISE EXCEPTION 'La jornada destino ya tiene una entrega o inventario inicial.' USING ERRCODE='23505';
  END IF;

  UPDATE public.turno_jornada_inventario_entregas
  SET destino_sesion_id=v_s.id,estado='PENDIENTE_RECEPCION',actualizado_en=now()
  WHERE id=v_e.id;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES (v_e.almacen_id,v_s.jornada_programacion_id,auth.uid(),
    'INVENTARIO_ENTREGA_DESTINO_VINCULADO',
    'El dueño vinculó una jornada ya programada; no se creó una sesión duplicada.',
    jsonb_build_object('entrega_id',v_e.id,'destino_sesion_id',NULL),
    jsonb_build_object('entrega_id',v_e.id,'destino_sesion_id',v_s.id));

  RETURN jsonb_build_object('id',v_e.id,'estado','PENDIENTE_RECEPCION','destino_sesion_id',v_s.id);
END;
$function$;

-- Internal helper: create the receiving INITIAL cut only after equality or owner approval.
CREATE OR REPLACE FUNCTION public._bc7_crear_inicial_desde_entrega(
  p_entrega_id uuid,
  p_recepcion_id uuid,
  p_confirmado_por uuid,
  p_nota text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_e public.turno_jornada_inventario_entregas;
  v_r public.turno_jornada_inventario_recepciones;
  v_source_cut uuid;
  v_cut uuid;
BEGIN
  SELECT * INTO v_e FROM public.turno_jornada_inventario_entregas
  WHERE id=p_entrega_id FOR UPDATE;
  SELECT * INTO v_r FROM public.turno_jornada_inventario_recepciones
  WHERE id=p_recepcion_id AND entrega_id=p_entrega_id FOR UPDATE;

  IF v_e.id IS NULL OR v_r.id IS NULL OR v_e.estado<>'ACEPTADA'
     OR v_e.destino_sesion_id IS NULL THEN
    RAISE EXCEPTION 'La entrega no está aprobada para generar el inventario inicial.' USING ERRCODE='23514';
  END IF;

  SELECT origen_corte_id INTO v_source_cut
  FROM public.turno_jornada_inventario_entregas WHERE id=v_e.id;

  IF EXISTS (SELECT 1 FROM public.turno_jornada_inventario_cortes
    WHERE turno_sesion_id=v_e.destino_sesion_id AND tipo='INICIAL') THEN
    SELECT id INTO v_cut FROM public.turno_jornada_inventario_cortes
    WHERE turno_sesion_id=v_e.destino_sesion_id AND tipo='INICIAL';
    RETURN v_cut;
  END IF;

  INSERT INTO public.turno_jornada_inventario_cortes
    (turno_sesion_id,tipo,estado,creado_por,confirmado_por,observacion,origen_corte_id)
  VALUES (v_e.destino_sesion_id,'INICIAL','CONFIRMADO',v_r.recibido_por,p_confirmado_por,
    left(coalesce(p_nota,v_r.observacion,'Recepción de inventario compartido aprobada.'),1000),
    v_source_cut)
  RETURNING id INTO v_cut;

  INSERT INTO public.turno_jornada_inventario_lineas
    (corte_id,producto_id,cantidad_contada,stock_sistema)
  SELECT v_cut,rl.producto_id,dl.cantidad_efectiva,s.cantidad
  FROM public.turno_jornada_inventario_recepcion_lineas rl
  JOIN public.turno_jornada_inventario_entrega_lineas dl
    ON dl.entrega_id=v_e.id AND dl.producto_id=rl.producto_id
  JOIN public.turno_sesiones ds ON ds.id=v_e.destino_sesion_id
  JOIN public.stock s ON s.almacen_id=ds.almacen_id AND s.producto_id=rl.producto_id
  WHERE rl.recepcion_id=v_r.id;

  IF NOT EXISTS (
    SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.id=v_cut
      AND (SELECT count(*) FROM public.turno_jornada_inventario_lineas l WHERE l.corte_id=c.id)
        =(SELECT count(*) FROM public.turno_jornada_inventario_entrega_lineas l WHERE l.entrega_id=v_e.id)
  ) THEN
    RAISE EXCEPTION 'No se pudo materializar el inventario inicial completo.' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  SELECT ds.almacen_id,ds.jornada_programacion_id,p_confirmado_por,
    'INVENTARIO_INICIAL_RECIBIDO',
    left(coalesce(p_nota,v_r.observacion,'Recepción de inventario compartido confirmada.'),1000),
    jsonb_build_object('entrega_id',v_e.id,'recepcion_id',v_r.id,'corte_final_origen_id',v_source_cut),
    jsonb_build_object('corte_inicial_id',v_cut,'recibido_por',v_r.recibido_por,
      'confirmado_por',p_confirmado_por)
  FROM public.turno_sesiones ds WHERE ds.id=v_e.destino_sesion_id;

  RETURN v_cut;
END;
$function$;

-- Record an immutable physical receiving attempt. Equal counts accept immediately;
-- discrepancies require the owner and block the next jornada from opening.
CREATE OR REPLACE FUNCTION public.bc7_recibir_entrega_jornada(
  p_destino_sesion_id uuid,
  p_lineas jsonb,
  p_observacion text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_e public.turno_jornada_inventario_entregas;
  v_r public.turno_jornada_inventario_recepciones;
  v_existing public.turno_jornada_inventario_recepciones;
  v_uid uuid:=auth.uid();
  v_count integer;
  v_distinct integer;
  v_expected integer;
  v_attempt integer;
  v_hash text;
  v_has_diff boolean;
  v_initial uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF NOT public.bc_actor_is_admin() AND NOT public.tiene_permiso('turnos','ver') THEN
    RAISE EXCEPTION 'Se requiere permiso para consultar turnos.' USING ERRCODE='42501';
  END IF;
  IF p_idempotency_key IS NULL OR p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array' THEN
    RAISE EXCEPTION 'La recepción necesita un identificador idempotente y una lista de cantidades.' USING ERRCODE='22023';
  END IF;

  v_hash:=md5(p_lineas::text||'|'||coalesce(p_observacion,''));
  SELECT * INTO v_existing FROM public.turno_jornada_inventario_recepciones
  WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.recibido_por<>v_uid OR v_existing.payload_hash<>v_hash THEN
      RAISE EXCEPTION 'El identificador idempotente ya pertenece a otra recepción o a otro contenido.' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('id',v_existing.id,'estado',v_existing.estado,
      'intento',v_existing.intento,'idempotente',true);
  END IF;

  SELECT * INTO v_s FROM public.turno_sesiones
  WHERE id=p_destino_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL
     OR v_s.estado NOT IN ('PENDIENTE','PROGRAMADA') THEN
    RAISE EXCEPTION 'La recepción solo se registra en una jornada única aún no iniciada.' USING ERRCODE='23514';
  END IF;
  IF NOT public.bc_actor_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=v_uid AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo la dependienta asignada puede recibir este inventario.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_e FROM public.turno_jornada_inventario_entregas
  WHERE destino_sesion_id=v_s.id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta jornada todavía no tiene una entrega de inventario vinculada.' USING ERRCODE='P0002';
  END IF;
  IF v_e.estado NOT IN ('PENDIENTE_RECEPCION','REQUIERE_RECUENTO') THEN
    RAISE EXCEPTION 'La entrega no está disponible para una nueva recepción (%).',v_e.estado USING ERRCODE='23514';
  END IF;

  SELECT count(*) INTO v_expected
  FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
  WHERE s.almacen_id=v_s.almacen_id AND p.activo=true;
  SELECT count(*),count(DISTINCT (x.value->>'producto_id')::uuid)
    INTO v_count,v_distinct
  FROM jsonb_array_elements(p_lineas) AS x(value);
  IF v_count<>v_expected OR v_distinct<>v_count THEN
    RAISE EXCEPTION 'La recepción debe contener exactamente una cantidad por cada producto activo (% esperado; % recibidos).',
      v_expected,v_count USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) AS x(value)
    LEFT JOIN public.productos p ON p.id=(x.value->>'producto_id')::uuid AND p.activo=true
    WHERE jsonb_typeof(x.value)<>'object' OR p.id IS NULL
      OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
      OR NOT EXISTS (SELECT 1 FROM public.stock s
        WHERE s.almacen_id=v_s.almacen_id AND s.producto_id=p.id)
  ) THEN
    RAISE EXCEPTION 'Producto o cantidad de recepción inválida.' USING ERRCODE='22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_observacion,'')),'') IS NOT NULL AND length(p_observacion)>1000 THEN
    RAISE EXCEPTION 'La observación no puede superar 1000 caracteres.' USING ERRCODE='22023';
  END IF;

  SELECT coalesce(max(intento),0)+1 INTO v_attempt
  FROM public.turno_jornada_inventario_recepciones WHERE entrega_id=v_e.id;

  INSERT INTO public.turno_jornada_inventario_recepciones
    (entrega_id,intento,recibido_por,estado,observacion,idempotency_key,payload_hash)
  VALUES (v_e.id,v_attempt,v_uid,'PENDIENTE_REVISION',
    NULLIF(btrim(p_observacion),''),p_idempotency_key,v_hash)
  RETURNING * INTO v_r;

  INSERT INTO public.turno_jornada_inventario_recepcion_lineas
    (recepcion_id,producto_id,cantidad_declarada,cantidad_recibida,diferencia)
  SELECT v_r.id,dl.producto_id,dl.cantidad_declarada,
    (x.value->>'cantidad')::numeric,
    (x.value->>'cantidad')::numeric-dl.cantidad_declarada
  FROM jsonb_array_elements(p_lineas) AS x(value)
  JOIN public.turno_jornada_inventario_entrega_lineas dl
    ON dl.entrega_id=v_e.id AND dl.producto_id=(x.value->>'producto_id')::uuid;

  SELECT EXISTS (
    SELECT 1 FROM public.turno_jornada_inventario_recepcion_lineas
    WHERE recepcion_id=v_r.id AND diferencia<>0
  ) INTO v_has_diff;

  IF v_has_diff THEN
    UPDATE public.turno_jornada_inventario_entregas
    SET estado='PENDIENTE_REVISION',actualizado_en=now() WHERE id=v_e.id;
  ELSE
    UPDATE public.turno_jornada_inventario_recepciones
    SET estado='ACEPTADA',decision_por=v_uid,decision_en=now(),
      decision_motivo='Recepción física coincide con el inventario declarado.'
    WHERE id=v_r.id RETURNING * INTO v_r;
    UPDATE public.turno_jornada_inventario_entrega_lineas dl
    SET cantidad_efectiva=rl.cantidad_recibida
    FROM public.turno_jornada_inventario_recepcion_lineas rl
    WHERE rl.recepcion_id=v_r.id AND rl.producto_id=dl.producto_id
      AND dl.entrega_id=v_e.id;
    UPDATE public.turno_jornada_inventario_entregas
    SET estado='ACEPTADA',actualizado_en=now() WHERE id=v_e.id;
    v_initial:=public._bc7_crear_inicial_desde_entrega(v_e.id,v_r.id,v_uid,
      'Recepción física igual al inventario declarado; cantidad compartida aceptada automáticamente.');
  END IF;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES (v_e.almacen_id,v_s.jornada_programacion_id,v_uid,
    CASE WHEN v_has_diff THEN 'INVENTARIO_RECEPCION_CON_DIFERENCIAS' ELSE 'INVENTARIO_RECEPCION_IGUAL' END,
    left(coalesce(p_observacion,''),1000),
    jsonb_build_object('entrega_id',v_e.id,'intento',v_attempt),
    jsonb_build_object('recepcion_id',v_r.id,'estado',CASE WHEN v_has_diff THEN 'PENDIENTE_REVISION' ELSE 'ACEPTADA' END,
      'inventario_inicial_id',v_initial));

  RETURN jsonb_build_object('id',v_r.id,'entrega_id',v_e.id,'estado',v_r.estado,
    'intento',v_attempt,'requiere_revision',v_has_diff,'inventario_inicial_id',v_initial,
    'idempotente',false);
END;
$function$;

-- Only the owner may approve or reject a discrepant receipt. Rejection requires recount.
CREATE OR REPLACE FUNCTION public.bc7_resolver_entrega_jornada(
  p_entrega_id uuid,
  p_decision text,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_e public.turno_jornada_inventario_entregas;
  v_r public.turno_jornada_inventario_recepciones;
  v_s public.turno_sesiones;
  v_initial uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el dueño puede resolver una diferencia de recepción.' USING ERRCODE='42501';
  END IF;
  IF upper(coalesce(p_decision,'')) NOT IN ('APROBAR','RECHAZAR')
     OR NULLIF(btrim(coalesce(p_motivo,'')),'') IS NULL
     OR length(p_motivo)>1000 THEN
    RAISE EXCEPTION 'Selecciona aprobar/rechazar y registra el motivo de la decisión.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_e FROM public.turno_jornada_inventario_entregas
  WHERE id=p_entrega_id FOR UPDATE;
  IF NOT FOUND OR v_e.estado<>'PENDIENTE_REVISION' THEN
    RAISE EXCEPTION 'La entrega no tiene una diferencia pendiente de revisión.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_r FROM public.turno_jornada_inventario_recepciones
  WHERE entrega_id=v_e.id ORDER BY intento DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR v_r.estado<>'PENDIENTE_REVISION' THEN
    RAISE EXCEPTION 'No existe un intento de recepción pendiente.' USING ERRCODE='23514';
  END IF;

  IF upper(p_decision)='APROBAR' THEN
    UPDATE public.turno_jornada_inventario_recepciones
    SET estado='ACEPTADA',decision_por=auth.uid(),decision_en=now(),decision_motivo=left(btrim(p_motivo),1000)
    WHERE id=v_r.id RETURNING * INTO v_r;
    UPDATE public.turno_jornada_inventario_entrega_lineas dl
    SET cantidad_efectiva=rl.cantidad_recibida
    FROM public.turno_jornada_inventario_recepcion_lineas rl
    WHERE rl.recepcion_id=v_r.id AND rl.producto_id=dl.producto_id
      AND dl.entrega_id=v_e.id;
    UPDATE public.turno_jornada_inventario_entregas
    SET estado='ACEPTADA',actualizado_en=now() WHERE id=v_e.id;
    v_initial:=public._bc7_crear_inicial_desde_entrega(v_e.id,v_r.id,auth.uid(),
      'Diferencia revisada y aprobada por el dueño: '||left(btrim(p_motivo),900));
  ELSE
    UPDATE public.turno_jornada_inventario_recepciones
    SET estado='RECHAZADA',decision_por=auth.uid(),decision_en=now(),decision_motivo=left(btrim(p_motivo),1000)
    WHERE id=v_r.id RETURNING * INTO v_r;
    UPDATE public.turno_jornada_inventario_entregas
    SET estado='REQUIERE_RECUENTO',actualizado_en=now() WHERE id=v_e.id;
  END IF;

  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=v_e.destino_sesion_id;
  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES (v_e.almacen_id,v_s.jornada_programacion_id,auth.uid(),
    CASE WHEN upper(p_decision)='APROBAR' THEN 'INVENTARIO_RECEPCION_APROBADA' ELSE 'INVENTARIO_RECEPCION_RECHAZADA' END,
    left(btrim(p_motivo),1000),
    jsonb_build_object('entrega_id',v_e.id,'recepcion_id',v_r.id,'estado_anterior','PENDIENTE_REVISION'),
    jsonb_build_object('entrega_id',v_e.id,'recepcion_id',v_r.id,'estado',v_e.estado,
      'inventario_inicial_id',v_initial));

  RETURN jsonb_build_object('id',v_e.id,'estado',
    CASE WHEN upper(p_decision)='APROBAR' THEN 'ACEPTADA' ELSE 'REQUIERE_RECUENTO' END,
    'recepcion_id',v_r.id,'inventario_inicial_id',v_initial);
END;
$function$;

-- Safe legacy recovery: owner performs and records a physical INITIAL recount after opening.
CREATE OR REPLACE FUNCTION public.bc7_regularizar_inicial_jornada_legacy(
  p_turno_sesion_id uuid,
  p_lineas jsonb,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_cut uuid;
  v_expected integer;
  v_count integer;
  v_distinct integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el dueño puede regularizar una jornada legacy abierta sin inventario inicial.' USING ERRCODE='42501';
  END IF;
  IF NULLIF(btrim(coalesce(p_motivo,'')),'') IS NULL OR length(p_motivo)>1000
     OR p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array' THEN
    RAISE EXCEPTION 'La regularización requiere un motivo y el conteo físico completo.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL
     OR v_s.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'La regularización solo aplica a una jornada única legacy que ya está en curso.' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.turno_jornada_inventario_cortes
    WHERE turno_sesion_id=v_s.id AND tipo='INICIAL') THEN
    RAISE EXCEPTION 'La jornada ya tiene un inventario inicial.' USING ERRCODE='23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.turno_jornada_inventario_entregas e
    WHERE (e.destino_sesion_id=v_s.id OR (e.destino_sesion_id IS NULL
      AND e.almacen_id=v_s.almacen_id AND e.fecha_destino=v_s.fecha
      AND e.estado='PENDIENTE_PROGRAMACION')) AND e.estado<>'ACEPTADA') THEN
    RAISE EXCEPTION 'Primero debe resolverse la entrega compartida pendiente; no se permite regularizarla por separado.' USING ERRCODE='23514';
  END IF;

  SELECT count(*) INTO v_expected FROM public.stock s
  JOIN public.productos p ON p.id=s.producto_id
  WHERE s.almacen_id=v_s.almacen_id AND p.activo=true;
  SELECT count(*),count(DISTINCT (x.value->>'producto_id')::uuid)
    INTO v_count,v_distinct FROM jsonb_array_elements(p_lineas) AS x(value);
  IF v_count<>v_expected OR v_distinct<>v_count THEN
    RAISE EXCEPTION 'La regularización debe contar cada producto activo (% esperado; % recibidos).',
      v_expected,v_count USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) AS x(value)
    LEFT JOIN public.productos p ON p.id=(x.value->>'producto_id')::uuid AND p.activo=true
    WHERE jsonb_typeof(x.value)<>'object' OR p.id IS NULL
      OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
      OR NOT EXISTS (SELECT 1 FROM public.stock s
        WHERE s.almacen_id=v_s.almacen_id AND s.producto_id=p.id)
  ) THEN
    RAISE EXCEPTION 'Producto o cantidad inválida en la regularización.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.turno_jornada_inventario_cortes
    (turno_sesion_id,tipo,estado,creado_por,confirmado_por,observacion)
  VALUES (v_s.id,'INICIAL','CONFIRMADO',auth.uid(),auth.uid(),
    'REGULARIZACIÓN LEGACY: '||left(btrim(p_motivo),970))
  RETURNING id INTO v_cut;

  INSERT INTO public.turno_jornada_inventario_lineas
    (corte_id,producto_id,cantidad_contada,stock_sistema)
  SELECT v_cut,(x.value->>'producto_id')::uuid,(x.value->>'cantidad')::numeric,s.cantidad
  FROM jsonb_array_elements(p_lineas) AS x(value)
  JOIN public.stock s ON s.almacen_id=v_s.almacen_id
    AND s.producto_id=(x.value->>'producto_id')::uuid;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES (v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),
    'INVENTARIO_INICIAL_LEGACY_REGULARIZADO',left(btrim(p_motivo),1000),
    jsonb_build_object('sesion_id',v_s.id,'estado','EN_CURSO','inventario_inicial_ausente',true),
    jsonb_build_object('corte_inicial_id',v_cut,'cantidad_lineas',v_count,
      'stock_global_modificado',false));

  RETURN jsonb_build_object('id',v_cut,'estado','CONFIRMADO','regularizacion_legacy',true,
    'cantidad_lineas',v_count,'stock_global_modificado',false);
END;
$function$;

-- Read model for the current session; source and receiving users see only their own linked handover.
CREATE OR REPLACE FUNCTION public._bc7_entrega_inventario_json(p_entrega_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'id',e.id,'almacen_id',e.almacen_id,'turno_id',e.turno_id,
    'origen_sesion_id',e.origen_sesion_id,'origen_corte_id',e.origen_corte_id,
    'destino_sesion_id',e.destino_sesion_id,'fecha_destino',e.fecha_destino,'estado',e.estado,
    'creado_por',e.creado_por,'creado_en',e.creado_en,'actualizado_en',e.actualizado_en,
    'recepcion',(
      SELECT jsonb_build_object('id',r.id,'intento',r.intento,'estado',r.estado,
        'recibido_por',r.recibido_por,'recibido_en',r.recibido_en,'observacion',r.observacion,
        'decision_por',r.decision_por,'decision_en',r.decision_en,'decision_motivo',r.decision_motivo)
      FROM public.turno_jornada_inventario_recepciones r
      WHERE r.entrega_id=e.id ORDER BY r.intento DESC LIMIT 1
    ),
    'lineas',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'producto_id',dl.producto_id,'nombre',p.nombre,'unidad',p.unidad,
        'cantidad_declarada',dl.cantidad_declarada,'cantidad_efectiva',dl.cantidad_efectiva,
        'cantidad_recibida',rl.cantidad_recibida,'diferencia',rl.diferencia
      ) ORDER BY p.nombre,p.id)
      FROM public.turno_jornada_inventario_entrega_lineas dl
      JOIN public.productos p ON p.id=dl.producto_id
      LEFT JOIN public.turno_jornada_inventario_recepcion_lineas rl
        ON rl.producto_id=dl.producto_id
       AND rl.recepcion_id=(
         SELECT r.id FROM public.turno_jornada_inventario_recepciones r
         WHERE r.entrega_id=e.id ORDER BY r.intento DESC LIMIT 1
       )
      WHERE dl.entrega_id=e.id
    ),'[]'::jsonb)
  )
  FROM public.turno_jornada_inventario_entregas e
  WHERE e.id=p_entrega_id;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_estado_entrega_inventario_jornada(p_turno_sesion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_admin boolean;
  v_out uuid;
  v_in uuid;
  v_unlinked uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jornada no encontrada.' USING ERRCODE='23503'; END IF;
  v_admin:=public.bc_actor_is_admin();
  IF NOT v_admin AND NOT public.tiene_permiso('turnos','ver') THEN
    RAISE EXCEPTION 'Se requiere permiso para consultar el inventario de jornada.' USING ERRCODE='42501';
  END IF;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN
    RAISE EXCEPTION 'Jornada no encontrada.' USING ERRCODE='23503';
  END IF;
  IF NOT v_admin AND NOT EXISTS (
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado puede consultar esta entrega.' USING ERRCODE='42501';
  END IF;

  SELECT id INTO v_out FROM public.turno_jornada_inventario_entregas
  WHERE origen_sesion_id=v_s.id;
  SELECT id INTO v_in FROM public.turno_jornada_inventario_entregas
  WHERE destino_sesion_id=v_s.id;
  SELECT id INTO v_unlinked FROM public.turno_jornada_inventario_entregas
  WHERE destino_sesion_id IS NULL AND almacen_id=v_s.almacen_id AND fecha_destino=v_s.fecha
    AND estado='PENDIENTE_PROGRAMACION'
  ORDER BY creado_en DESC LIMIT 1;

  RETURN jsonb_build_object(
    'is_admin',v_admin,
    'salida',CASE WHEN v_out IS NULL THEN NULL ELSE public._bc7_entrega_inventario_json(v_out) END,
    'entrada',CASE WHEN v_in IS NULL THEN NULL ELSE public._bc7_entrega_inventario_json(v_in) END,
    'sin_vincular',CASE WHEN v_unlinked IS NULL THEN NULL ELSE public._bc7_entrega_inventario_json(v_unlinked) END
  );
END;
$function$;

-- Prevent bypass: when a shared handover exists, the destination INITIAL may only be created
-- by the receive/owner-resolution flow after its header has reached ACEPTADA.
CREATE OR REPLACE FUNCTION public.bc7_guard_shared_initial_cut()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_estado text;
BEGIN
  IF NEW.tipo='INICIAL' THEN
    SELECT e.estado INTO v_estado
    FROM public.turno_jornada_inventario_entregas e
    JOIN public.turno_sesiones s ON s.id=NEW.turno_sesion_id
    WHERE e.destino_sesion_id=NEW.turno_sesion_id
       OR (e.destino_sesion_id IS NULL AND e.almacen_id=s.almacen_id
           AND e.fecha_destino=s.fecha AND e.estado='PENDIENTE_PROGRAMACION')
    ORDER BY e.creado_en DESC LIMIT 1 FOR UPDATE OF e;
    IF FOUND AND v_estado<>'ACEPTADA' THEN
      RAISE EXCEPTION 'La jornada debe recibir y resolver la entrega compartida antes de guardar el inventario inicial.' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bc7_guard_shared_initial_cut ON public.turno_jornada_inventario_cortes;
CREATE TRIGGER bc7_guard_shared_initial_cut
BEFORE INSERT ON public.turno_jornada_inventario_cortes
FOR EACH ROW EXECUTE FUNCTION public.bc7_guard_shared_initial_cut();

-- Keep the existing opening/closing inventory barrier and also block pending shared receipts.
CREATE OR REPLACE FUNCTION public.bc7_guard_jornada_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.bloque='JORNADA' AND NEW.jornada_programacion_id IS NOT NULL
     AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    IF NEW.estado='EN_CURSO' AND OLD.estado IN ('PENDIENTE','PROGRAMADA') THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.turno_jornada_inventario_cortes c
        WHERE c.turno_sesion_id=NEW.id AND c.tipo='INICIAL' AND c.estado='CONFIRMADO'
      ) THEN
        RAISE EXCEPTION 'Antes de abrir la jornada debes confirmar el inventario inicial.' USING ERRCODE='23514';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.turno_jornada_inventario_entregas e
        WHERE (e.destino_sesion_id=NEW.id OR (e.destino_sesion_id IS NULL
          AND e.almacen_id=NEW.almacen_id AND e.fecha_destino=NEW.fecha
          AND e.estado='PENDIENTE_PROGRAMACION')) AND e.estado<>'ACEPTADA'
      ) THEN
        RAISE EXCEPTION 'La entrega de inventario tiene una diferencia o recepción pendiente de decisión del dueño.' USING ERRCODE='23514';
      END IF;
    ELSIF NEW.estado='COMPLETADA' AND OLD.estado='EN_CURSO' THEN
      IF NEW.cierre_forzado IS TRUE
         AND auth.uid() IS NOT NULL
         AND public.bc_actor_is_admin()
         AND EXISTS (
           SELECT 1 FROM public.turno_eventos e
           WHERE e.turno_id=NEW.turno_id
             AND e.actor_user_id=auth.uid()
             AND e.tipo='TURNO_CIERRE_FORZADO_ADMIN'
             AND e.payload->>'cierre_jornada_forzado_sin_conteo_final'='true'
             AND coalesce(e.payload->'sesiones_en_curso_ids','[]'::jsonb) ? NEW.id::text
         ) THEN
        NULL;
      ELSIF NOT EXISTS (
        SELECT 1 FROM public.turno_jornada_inventario_cortes c
        WHERE c.turno_sesion_id=NEW.id AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
      ) THEN
        RAISE EXCEPTION 'Antes de cerrar la jornada debes confirmar el inventario final.' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_preparar_entrega_inventario_jornada() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._bc7_crear_inicial_desde_entrega(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._bc7_entrega_inventario_json(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_guard_shared_initial_cut() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_vincular_entrega_jornada(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_recibir_entrega_jornada(uuid,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_resolver_entrega_jornada(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_regularizar_inicial_jornada_legacy(uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_estado_entrega_inventario_jornada(uuid) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.bc7_vincular_entrega_jornada(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_recibir_entrega_jornada(uuid,jsonb,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_resolver_entrega_jornada(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_regularizar_inicial_jornada_legacy(uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_estado_entrega_inventario_jornada(uuid) TO authenticated;

COMMIT;
