-- Retroactive successor handover for a closed Jornada.
-- Keep the outgoing record locked, reconcile the shared physical count,
-- and create the overdue successor from the existing family-level delivery.
BEGIN;
UPDATE public.turnos t
SET estado='CERRADO',cierre_real=COALESCE(t.cierre_real,r.revisado_at,now()),actualizado_en=now()
FROM public.turno_revisiones r
WHERE r.turno_id=t.id AND t.estado_maestro='CERRADO' AND t.estado<>'CERRADO' AND r.estado='APROBADO';

CREATE OR REPLACE FUNCTION public.bc_aprobar_turno(p_turno_id uuid,p_comentario text DEFAULT NULL::text)
RETURNS public.turno_revisiones LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE r public.turno_revisiones;
BEGIN
 IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN RAISE EXCEPTION 'Solo ADMIN puede aprobar'; END IF;
 PERFORM 1 FROM public.turnos WHERE id=p_turno_id AND estado_maestro='PENDIENTE_APROBACION' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'El Turno no está pendiente de aprobación'; END IF;
 UPDATE public.turno_revisiones SET estado='APROBADO',revisado_por=auth.uid(),revisado_at=now(),comentario=p_comentario
 WHERE turno_id=p_turno_id RETURNING * INTO r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Expediente de revisión no encontrado'; END IF;
 UPDATE public.turnos SET estado='CERRADO',estado_maestro='CERRADO',
   cierre_real=COALESCE(cierre_real,now()),actualizado_en=now() WHERE id=p_turno_id;
 INSERT INTO public.turno_eventos(turno_id,actor_user_id,tipo,payload)
 VALUES(p_turno_id,auth.uid(),'TURNO_APROBADO',jsonb_build_object('comentario',p_comentario,'estado','CERRADO','estado_maestro','CERRADO'));
 RETURN r;
END;
$function$;
REVOKE ALL ON FUNCTION public.bc_aprobar_turno(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc_aprobar_turno(uuid,text) TO authenticated;

-- Freeze price/cost and tranche edits once the master turn is closed.
DO $patch$
DECLARE v_definition text; v_old text; v_new text;
BEGIN
 SELECT pg_get_functiondef('public.bc7_ajustar_valores_producto_jornada(uuid,jsonb,text)'::regprocedure) INTO v_definition;
 v_old := $old$IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'COMPLETADA' THEN
    RAISE EXCEPTION 'Solo se corrigen valores de una Jornada completada.' USING ERRCODE='23514';
  END IF;$old$;
 v_new := $new$IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'COMPLETADA' THEN
    RAISE EXCEPTION 'Solo se corrigen valores de una Jornada completada.' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.turnos t WHERE t.id=v_s.turno_id
      AND coalesce(t.estado_maestro,t.estado) IN ('CERRADO','CANCELADO')) THEN
    RAISE EXCEPTION 'El Turno está cerrado. Los precios y costos históricos quedaron congelados.' USING ERRCODE='23514';
  END IF;$new$;
 IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN RAISE EXCEPTION 'No se localizó el control de cierre de valores históricos.'; END IF;
 EXECUTE replace(v_definition,v_old,v_new);
END;
$patch$;

DO $patch$
DECLARE v_definition text; v_old text; v_new text;
BEGIN
 SELECT pg_get_functiondef('public.bc7_guardar_tramos_precio_jornada(uuid,uuid,jsonb,text)'::regprocedure) INTO v_definition;
 v_old := $old$IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'COMPLETADA' THEN
  RAISE EXCEPTION 'Solo se corrigen jornadas completadas.' USING ERRCODE='23514';
 END IF;$old$;
 v_new := $new$IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'COMPLETADA' THEN
  RAISE EXCEPTION 'Solo se corrigen jornadas completadas.' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.turnos t WHERE t.id=v_s.turno_id
     AND coalesce(t.estado_maestro,t.estado) IN ('CERRADO','CANCELADO')) THEN
  RAISE EXCEPTION 'El Turno está cerrado. Los precios por tramos quedaron congelados.' USING ERRCODE='23514';
 END IF;$new$;
 IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN RAISE EXCEPTION 'No se localizó el control de cierre de precios por tramos.'; END IF;
 EXECUTE replace(v_definition,v_old,v_new);
END;
$patch$;

-- A closed master turn must not accept late classification edits.
DO $patch$
DECLARE v_definition text; v_old text; v_new text;
BEGIN
 SELECT pg_get_functiondef('public.bc7_clasificar_movimientos_fuera_corte(uuid,jsonb)'::regprocedure)
 INTO v_definition;
 v_old := $old$IF NOT FOUND OR v_s.estado<>'COMPLETADA' THEN
    RAISE EXCEPTION 'Solo se pueden revisar movimientos de una jornada completada.' USING ERRCODE='23514';
  END IF;$old$;
 v_new := $new$IF NOT FOUND OR v_s.estado<>'COMPLETADA' THEN
    RAISE EXCEPTION 'Solo se pueden revisar movimientos de una jornada completada.' USING ERRCODE='23514';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.turnos t
    WHERE t.id=v_s.turno_id AND coalesce(t.estado_maestro,t.estado) IN ('CERRADO','CANCELADO')
  ) THEN
    RAISE EXCEPTION 'El Turno está cerrado. Las bajas/mermas quedaron congeladas al aprobar la liquidación.' USING ERRCODE='23514';
  END IF;$new$;
 IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
  RAISE EXCEPTION 'No se localizó el control de cierre de clasificación de movimientos.';
 END IF;
 EXECUTE replace(v_definition,v_old,v_new);
END;
$patch$;

-- Allow a closed final count correction only while its successor has a real
-- discrepancy awaiting an owner decision.
DO $patch$
DECLARE v_definition text; v_old text; v_new text;
BEGIN
 SELECT pg_get_functiondef('public.bc7_corregir_inventario_final_jornada(uuid,jsonb,text)'::regprocedure) INTO v_definition;
 v_old := $old$IF NOT FOUND THEN RAISE EXCEPTION 'No existe un inventario final confirmado.' USING ERRCODE='23503'; END IF;$old$;
 v_new := $new$IF NOT FOUND THEN RAISE EXCEPTION 'No existe un inventario final confirmado.' USING ERRCODE='23503'; END IF;
 IF EXISTS(SELECT 1 FROM public.turnos t WHERE t.id=v_s.turno_id
     AND coalesce(t.estado_maestro,t.estado) IN ('CERRADO','CANCELADO'))
    AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_inventario_entregas e
      WHERE e.origen_sesion_id=v_s.id AND e.estado='PENDIENTE_REVISION') THEN
   RAISE EXCEPTION 'El Turno está cerrado. Solo se permite corregir su inventario final al resolver una diferencia real de recepción de la jornada sucesora.' USING ERRCODE='23514';
 END IF;$new$;
 IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN RAISE EXCEPTION 'No se localizó el control de inventario final cerrado.'; END IF;
 EXECUTE replace(v_definition,v_old,v_new);
END;
$patch$;

-- Retail handover is recorded by parent families (66 La Cueva families), not
-- every stock SKU (75 rows including variants).
CREATE OR REPLACE FUNCTION public.bc7_recibir_entrega_jornada(
 p_destino_sesion_id uuid,p_lineas jsonb,p_observacion text DEFAULT NULL::text,p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_s public.turno_sesiones; v_e public.turno_jornada_inventario_entregas;
 v_r public.turno_jornada_inventario_recepciones; v_existing public.turno_jornada_inventario_recepciones;
 v_uid uuid:=auth.uid(); v_count integer; v_distinct integer; v_expected integer;
 v_attempt integer; v_hash text; v_has_diff boolean; v_initial uuid; v_grouped boolean:=false;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
 IF NOT public.bc_actor_is_admin() AND NOT public.tiene_permiso('turnos','ver') THEN
  RAISE EXCEPTION 'Se requiere permiso para consultar turnos.' USING ERRCODE='42501';
 END IF;
 IF p_idempotency_key IS NULL OR p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array' THEN
  RAISE EXCEPTION 'La recepción necesita un identificador idempotente y una lista de cantidades.' USING ERRCODE='22023';
 END IF;
 v_hash:=md5(p_lineas::text||'|'||coalesce(p_observacion,''));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
 SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_destino_sesion_id FOR UPDATE;
 IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
  RAISE EXCEPTION 'La recepción solo se registra en una jornada única válida.' USING ERRCODE='23514';
 END IF;
 IF NOT public.bc_actor_is_admin() AND NOT EXISTS(
   SELECT 1 FROM public.turno_asignaciones a WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=v_uid AND a.retirado_at IS NULL
 ) THEN RAISE EXCEPTION 'Solo la dependienta asignada puede recibir este inventario.' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_existing FROM public.turno_jornada_inventario_recepciones WHERE idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF v_existing.recibido_por<>v_uid OR v_existing.payload_hash<>v_hash
     OR v_existing.entrega_id IS DISTINCT FROM(
       SELECT e.id FROM public.turno_jornada_inventario_entregas e WHERE e.destino_sesion_id=p_destino_sesion_id
     ) THEN RAISE EXCEPTION 'El identificador idempotente ya pertenece a otra recepción, entrega o contenido.' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('id',v_existing.id,'estado',v_existing.estado,'intento',v_existing.intento,'idempotente',true);
 END IF;
 IF v_s.estado NOT IN ('PENDIENTE','PROGRAMADA') THEN
  RAISE EXCEPTION 'La recepción solo se registra antes de abrir la jornada.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_e FROM public.turno_jornada_inventario_entregas WHERE destino_sesion_id=v_s.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Esta jornada todavía no tiene una entrega de inventario vinculada.' USING ERRCODE='P0002'; END IF;
 IF v_e.estado NOT IN ('PENDIENTE_RECEPCION','REQUIERE_RECUENTO') THEN
  RAISE EXCEPTION 'La entrega no está disponible para una nueva recepción (%).',v_e.estado USING ERRCODE='23514';
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista') INTO v_grouped;
 IF v_grouped THEN
  SELECT count(*) INTO v_expected FROM public.productos p WHERE p.activo=true AND p.producto_padre_id IS NULL;
 ELSE
  SELECT count(*) INTO v_expected FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
  WHERE s.almacen_id=v_s.almacen_id AND p.activo=true;
 END IF;
 SELECT count(*),count(DISTINCT(x.value->>'producto_id')::uuid) INTO v_count,v_distinct
 FROM jsonb_array_elements(p_lineas) x(value);
 IF v_count<>v_expected OR v_distinct<>v_count THEN
  RAISE EXCEPTION 'La recepción debe contener exactamente una cantidad por cada producto/familia activa (% esperadas; % recibidos).',v_expected,v_count USING ERRCODE='22023';
 END IF;
 IF EXISTS(
  SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
  LEFT JOIN public.productos p ON p.id=(x.value->>'producto_id')::uuid AND p.activo=true
  WHERE jsonb_typeof(x.value)<>'object' OR p.id IS NULL
    OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
    OR (v_grouped AND p.producto_padre_id IS NOT NULL)
    OR (NOT v_grouped AND NOT EXISTS(
      SELECT 1 FROM public.stock st WHERE st.almacen_id=v_s.almacen_id AND st.producto_id=p.id
    ))
 ) THEN RAISE EXCEPTION 'Producto/familia o cantidad de recepción inválida.' USING ERRCODE='22023'; END IF;
 IF v_expected<>(SELECT count(*) FROM public.turno_jornada_inventario_entrega_lineas WHERE entrega_id=v_e.id)
    OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
      LEFT JOIN public.turno_jornada_inventario_entrega_lineas dl
       ON dl.entrega_id=v_e.id AND dl.producto_id=(x.value->>'producto_id')::uuid
      WHERE dl.id IS NULL
    ) THEN RAISE EXCEPTION 'El catálogo de productos cambió entre entrega y recepción. El dueño debe revisar el expediente; no se omitirá ningún producto.' USING ERRCODE='23514'; END IF;
 IF NULLIF(btrim(coalesce(p_observacion,'')),'') IS NOT NULL AND length(p_observacion)>1000 THEN
  RAISE EXCEPTION 'La observación no puede superar 1000 caracteres.' USING ERRCODE='22023';
 END IF;

 SELECT coalesce(max(intento),0)+1 INTO v_attempt FROM public.turno_jornada_inventario_recepciones WHERE entrega_id=v_e.id;
 INSERT INTO public.turno_jornada_inventario_recepciones(entrega_id,intento,recibido_por,estado,observacion,idempotency_key,payload_hash)
 VALUES(v_e.id,v_attempt,v_uid,'PENDIENTE_REVISION',NULLIF(btrim(p_observacion),''),p_idempotency_key,v_hash)
 RETURNING * INTO v_r;
 INSERT INTO public.turno_jornada_inventario_recepcion_lineas(recepcion_id,producto_id,cantidad_declarada,cantidad_recibida,diferencia)
 SELECT v_r.id,dl.producto_id,dl.cantidad_declarada,(x.value->>'cantidad')::numeric,
   (x.value->>'cantidad')::numeric-dl.cantidad_declarada
 FROM jsonb_array_elements(p_lineas) x(value)
 JOIN public.turno_jornada_inventario_entrega_lineas dl
  ON dl.entrega_id=v_e.id AND dl.producto_id=(x.value->>'producto_id')::uuid;
 SELECT EXISTS(SELECT 1 FROM public.turno_jornada_inventario_recepcion_lineas WHERE recepcion_id=v_r.id AND diferencia<>0)
 INTO v_has_diff;
 IF v_has_diff THEN
  UPDATE public.turno_jornada_inventario_entregas SET estado='PENDIENTE_REVISION',actualizado_en=now() WHERE id=v_e.id;
 ELSE
  UPDATE public.turno_jornada_inventario_recepciones SET estado='ACEPTADA',decision_por=v_uid,decision_en=now(),
    decision_motivo='Recepción física igual a lo declarado en el inventario anterior.'
  WHERE id=v_r.id RETURNING * INTO v_r;
  UPDATE public.turno_jornada_inventario_entrega_lineas dl SET cantidad_efectiva=rl.cantidad_recibida
  FROM public.turno_jornada_inventario_recepcion_lineas rl
  WHERE rl.recepcion_id=v_r.id AND rl.producto_id=dl.producto_id AND dl.entrega_id=v_e.id;
  UPDATE public.turno_jornada_inventario_entregas SET estado='ACEPTADA',actualizado_en=now() WHERE id=v_e.id;
  v_initial:=public._bc7_crear_inicial_desde_entrega(v_e.id,v_r.id,v_uid,
    'Recepción física igual al inventario declarado; cantidad compartida aceptada automáticamente.');
 END IF;
 INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
 VALUES(v_e.almacen_id,v_s.jornada_programacion_id,v_uid,
  CASE WHEN v_has_diff THEN 'INVENTARIO_RECEPCION_CON_DIFERENCIAS' ELSE 'INVENTARIO_RECEPCION_IGUAL' END,
  left(coalesce(p_observacion,''),1000),jsonb_build_object('entrega_id',v_e.id,'intento',v_attempt),
  jsonb_build_object('recepcion_id',v_r.id,'estado',CASE WHEN v_has_diff THEN 'PENDIENTE_REVISION' ELSE 'ACEPTADA' END,
    'inventario_inicial_id',v_initial,'inventario_agrupado_por_familia',v_grouped));
 RETURN jsonb_build_object('id',v_r.id,'entrega_id',v_e.id,'estado',v_r.estado,'intento',v_attempt,
  'requiere_revision',v_has_diff,'inventario_inicial_id',v_initial,
  'inventario_agrupado_por_familia',v_grouped,'idempotente',false);
END;
$function$;

-- Rebuild the initial cut from all family lines, aggregating underlying variant stocks.
CREATE OR REPLACE FUNCTION public._bc7_crear_inicial_desde_entrega(
 p_entrega_id uuid,p_recepcion_id uuid,p_confirmado_por uuid,p_nota text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_e public.turno_jornada_inventario_entregas; v_r public.turno_jornada_inventario_recepciones;
 v_source_cut uuid;v_cut uuid;v_grouped boolean:=false;
BEGIN
 SELECT * INTO v_e FROM public.turno_jornada_inventario_entregas WHERE id=p_entrega_id FOR UPDATE;
 SELECT * INTO v_r FROM public.turno_jornada_inventario_recepciones WHERE id=p_recepcion_id AND entrega_id=p_entrega_id FOR UPDATE;
 IF v_e.id IS NULL OR v_r.id IS NULL OR v_e.estado<>'ACEPTADA' OR v_e.destino_sesion_id IS NULL THEN
  RAISE EXCEPTION 'La entrega no está aprobada para generar el inventario inicial.' USING ERRCODE='23514';
 END IF;
 SELECT origen_corte_id INTO v_source_cut FROM public.turno_jornada_inventario_entregas WHERE id=v_e.id;
 IF EXISTS(SELECT 1 FROM public.turno_jornada_inventario_cortes WHERE turno_sesion_id=v_e.destino_sesion_id AND tipo='INICIAL') THEN
  SELECT id INTO v_cut FROM public.turno_jornada_inventario_cortes WHERE turno_sesion_id=v_e.destino_sesion_id AND tipo='INICIAL';
  RETURN v_cut;
 END IF;
 SELECT EXISTS(
  SELECT 1 FROM public.almacenes a JOIN public.turno_sesiones ds ON ds.almacen_id=a.id
  WHERE ds.id=v_e.destino_sesion_id AND a.tipo='minorista'
 ) INTO v_grouped;
 INSERT INTO public.turno_jornada_inventario_cortes(turno_sesion_id,tipo,estado,creado_por,confirmado_por,observacion,origen_corte_id)
 VALUES(v_e.destino_sesion_id,'INICIAL','CONFIRMADO',v_r.recibido_por,p_confirmado_por,
  left(coalesce(p_nota,v_r.observacion,'Recepción de inventario compartido aprobada.'),1000),v_source_cut)
 RETURNING id INTO v_cut;
 INSERT INTO public.turno_jornada_inventario_lineas(corte_id,producto_id,cantidad_contada,stock_sistema)
 SELECT v_cut,rl.producto_id,dl.cantidad_efectiva,
  CASE WHEN v_grouped THEN coalesce((
   SELECT sum(st.cantidad) FROM public.stock st JOIN public.productos sp ON sp.id=st.producto_id
   WHERE st.almacen_id=ds.almacen_id AND (sp.id=rl.producto_id OR sp.producto_padre_id=rl.producto_id)
  ),0) ELSE coalesce((
   SELECT st.cantidad FROM public.stock st WHERE st.almacen_id=ds.almacen_id AND st.producto_id=rl.producto_id LIMIT 1
  ),0) END
 FROM public.turno_jornada_inventario_recepcion_lineas rl
 JOIN public.turno_jornada_inventario_entrega_lineas dl ON dl.entrega_id=v_e.id AND dl.producto_id=rl.producto_id
 JOIN public.turno_sesiones ds ON ds.id=v_e.destino_sesion_id
 WHERE rl.recepcion_id=v_r.id;
 IF NOT EXISTS(
  SELECT 1 FROM public.turno_jornada_inventario_cortes c WHERE c.id=v_cut
   AND (SELECT count(*) FROM public.turno_jornada_inventario_lineas l WHERE l.corte_id=c.id)
    =(SELECT count(*) FROM public.turno_jornada_inventario_entrega_lineas l WHERE l.entrega_id=v_e.id)
 ) THEN RAISE EXCEPTION 'No se pudo materializar el inventario inicial completo.' USING ERRCODE='23514'; END IF;
 INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
 SELECT ds.almacen_id,ds.jornada_programacion_id,p_confirmado_por,'INVENTARIO_INICIAL_RECIBIDO',
  left(coalesce(p_nota,v_r.observacion,'Recepción de inventario compartido confirmada.'),1000),
  jsonb_build_object('entrega_id',v_e.id,'recepcion_id',v_r.id,'corte_final_origen_id',v_source_cut),
  jsonb_build_object('corte_inicial_id',v_cut,'recibido_por',v_r.recibido_por,
    'confirmado_por',p_confirmado_por,'inventario_agrupado_por_familia',v_grouped)
 FROM public.turno_sesiones ds WHERE ds.id=v_e.destino_sesion_id;
 RETURN v_cut;
END;
$function$;

-- Approving a real incoming discrepancy updates the old final through audit
-- and creates the new initial from the exact physical receipt. Original cuts remain.
CREATE OR REPLACE FUNCTION public.bc7_resolver_entrega_jornada(p_entrega_id uuid,p_decision text,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_e public.turno_jornada_inventario_entregas;v_r public.turno_jornada_inventario_recepciones;
 v_s public.turno_sesiones;v_initial uuid;v_correcciones jsonb:='[]'::jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
  RAISE EXCEPTION 'Solo el dueño puede resolver una diferencia de recepción.' USING ERRCODE='42501';
 END IF;
 IF upper(coalesce(p_decision,'')) NOT IN ('APROBAR','RECHAZAR')
    OR NULLIF(btrim(coalesce(p_motivo,'')),'') IS NULL OR length(p_motivo)>1000 THEN
  RAISE EXCEPTION 'Selecciona aprobar/rechazar y registra el motivo de la decisión.' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_e FROM public.turno_jornada_inventario_entregas WHERE id=p_entrega_id FOR UPDATE;
 IF NOT FOUND OR v_e.estado<>'PENDIENTE_REVISION' THEN
  RAISE EXCEPTION 'La entrega no tiene una diferencia pendiente de revisión.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_r FROM public.turno_jornada_inventario_recepciones
 WHERE entrega_id=v_e.id ORDER BY intento DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR v_r.estado<>'PENDIENTE_REVISION' THEN
  RAISE EXCEPTION 'No existe un intento de recepción pendiente.' USING ERRCODE='23514';
 END IF;
 IF upper(p_decision)='APROBAR' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('producto_id',rl.producto_id,'cantidad',rl.cantidad_recibida)
    ORDER BY rl.producto_id),'[]'::jsonb)
  INTO v_correcciones FROM public.turno_jornada_inventario_recepcion_lineas rl
  WHERE rl.recepcion_id=v_r.id AND rl.diferencia<>0;
  IF jsonb_array_length(v_correcciones)>0 THEN
   PERFORM public.bc7_corregir_inventario_final_jornada(v_e.origen_sesion_id,v_correcciones,
    left('Recepción física de la jornada sucesora aprobada: '||btrim(p_motivo),500));
  END IF;
  UPDATE public.turno_jornada_inventario_recepciones SET estado='ACEPTADA',decision_por=auth.uid(),
   decision_en=now(),decision_motivo=left(btrim(p_motivo),1000)
  WHERE id=v_r.id RETURNING * INTO v_r;
  UPDATE public.turno_jornada_inventario_entrega_lineas dl SET cantidad_efectiva=rl.cantidad_recibida
  FROM public.turno_jornada_inventario_recepcion_lineas rl
  WHERE rl.recepcion_id=v_r.id AND rl.producto_id=dl.producto_id AND dl.entrega_id=v_e.id;
  UPDATE public.turno_jornada_inventario_entregas SET estado='ACEPTADA',actualizado_en=now() WHERE id=v_e.id;
  v_e.estado:='ACEPTADA';
  v_initial:=public._bc7_crear_inicial_desde_entrega(v_e.id,v_r.id,auth.uid(),
   'Diferencia revisada y aprobada por el dueño: '||left(btrim(p_motivo),900));
 ELSE
  UPDATE public.turno_jornada_inventario_recepciones SET estado='RECHAZADA',decision_por=auth.uid(),
   decision_en=now(),decision_motivo=left(btrim(p_motivo),1000)
  WHERE id=v_r.id RETURNING * INTO v_r;
  UPDATE public.turno_jornada_inventario_entregas SET estado='REQUIERE_RECUENTO',actualizado_en=now() WHERE id=v_e.id;
  v_e.estado:='REQUIERE_RECUENTO';
 END IF;
 SELECT * INTO v_s FROM public.turno_sesiones WHERE id=v_e.destino_sesion_id;
 INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
 VALUES(v_e.almacen_id,v_s.jornada_programacion_id,auth.uid(),
  CASE WHEN upper(p_decision)='APROBAR' THEN 'INVENTARIO_RECEPCION_APROBADA' ELSE 'INVENTARIO_RECEPCION_RECHAZADA' END,
  left(btrim(p_motivo),1000),
  jsonb_build_object('entrega_id',v_e.id,'recepcion_id',v_r.id,'estado_anterior','PENDIENTE_REVISION'),
  jsonb_build_object('entrega_id',v_e.id,'recepcion_id',v_r.id,'estado',v_e.estado,
   'inventario_inicial_id',v_initial,'productos_final_anterior_corregidos',jsonb_array_length(coalesce(v_correcciones,'[]'::jsonb))));
 RETURN jsonb_build_object('id',v_e.id,'estado',
  CASE WHEN upper(p_decision)='APROBAR' THEN 'ACEPTADA' ELSE 'REQUIERE_RECUENTO' END,
  'recepcion_id',v_r.id,'inventario_inicial_id',v_initial,
  'productos_final_anterior_corregidos',jsonb_array_length(coalesce(v_correcciones,'[]'::jsonb)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_listar_entregas_sucesoras_pendientes()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
  RAISE EXCEPTION 'Solo el Dueño/Admin puede consultar entregas sucesoras pendientes.' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'entrega_id',e.id,'turno_anterior_id',e.turno_id,'sesion_anterior_id',e.origen_sesion_id,
  'almacen_id',e.almacen_id,'almacen_nombre',a.nombre,'fecha_inicio',p.fecha,
  'fecha_fin_anterior',coalesce(p.fecha_fin,p.fecha),'fecha_destino',e.fecha_destino,'estado',e.estado,
  'lineas',(SELECT count(*) FROM public.turno_jornada_inventario_entrega_lineas dl WHERE dl.entrega_id=e.id)
 ) ORDER BY e.fecha_destino,e.creado_en),'[]'::jsonb)
 INTO v_result
 FROM public.turno_jornada_inventario_entregas e
 JOIN public.turnos t ON t.id=e.turno_id
 JOIN public.turno_sesiones s ON s.id=e.origen_sesion_id
 JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
 JOIN public.almacenes a ON a.id=e.almacen_id
 JOIN public.turno_jornada_inventario_cortes c ON c.id=e.origen_corte_id AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
 WHERE e.destino_sesion_id IS NULL AND e.estado='PENDIENTE_PROGRAMACION'
  AND t.estado_maestro='CERRADO' AND s.estado='COMPLETADA';
 RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_admin_programar_sucesora_pendiente(
 p_entrega_id uuid,p_fecha_fin date,p_responsable_id uuid,p_observacion text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
 v_uid uuid:=auth.uid();v_e public.turno_jornada_inventario_entregas;
 v_old_s public.turno_sesiones;v_old_t public.turnos;v_old_p public.turno_jornada_programacion;
 v_cfg public.turno_jornada_configuracion;v_t public.turnos;v_p public.turno_jornada_programacion;v_s public.turno_sesiones;
 v_timezone text:='America/Havana';v_start time:='07:00';v_end time:='23:00';
 v_days integer;v_expected integer;v_line_count integer;v_salary numeric;v_grouped boolean:=false;v_today date;
BEGIN
 IF v_uid IS NULL OR NOT public.bc_actor_is_admin() THEN
  RAISE EXCEPTION 'Solo ADMIN autenticado puede preparar una jornada sucesora atrasada.' USING ERRCODE='42501';
 END IF;
 IF p_entrega_id IS NULL OR p_fecha_fin IS NULL OR p_responsable_id IS NULL
   OR length(btrim(coalesce(p_observacion,'')))<5 OR length(p_observacion)>1000 THEN
  RAISE EXCEPTION 'Completa la fecha final, responsable y motivo (5–1000 caracteres).' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_e FROM public.turno_jornada_inventario_entregas WHERE id=p_entrega_id FOR UPDATE;
 IF NOT FOUND OR v_e.estado<>'PENDIENTE_PROGRAMACION' OR v_e.destino_sesion_id IS NOT NULL THEN
  RAISE EXCEPTION 'La entrega no está pendiente de programación.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_old_s FROM public.turno_sesiones WHERE id=v_e.origen_sesion_id FOR SHARE;
 SELECT * INTO v_old_t FROM public.turnos WHERE id=v_e.turno_id FOR SHARE;
 SELECT * INTO v_old_p FROM public.turno_jornada_programacion WHERE id=v_old_s.jornada_programacion_id;
 IF v_old_s.id IS NULL OR v_old_s.estado<>'COMPLETADA' OR v_old_t.estado_maestro<>'CERRADO'
   OR NOT EXISTS(SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=v_old_s.id AND c.tipo='FINAL' AND c.estado='CONFIRMADO' AND c.id=v_e.origen_corte_id) THEN
  RAISE EXCEPTION 'El origen debe ser un Turno cerrado con jornada completada e inventario final confirmado.' USING ERRCODE='23514';
 END IF;
 IF p_fecha_fin<v_e.fecha_destino OR p_fecha_fin-v_e.fecha_destino>30 THEN
  RAISE EXCEPTION 'El período sucesor debe abarcar entre 1 y 31 días desde %.',v_e.fecha_destino USING ERRCODE='22023';
 END IF;
 IF NOT public.bc5_jornada_responsable_elegible(p_responsable_id) THEN
  RAISE EXCEPTION 'La responsable debe estar activa y tener rol Dependienta o Dueño.' USING ERRCODE='42501';
 END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('bc7-period-warehouse:'||v_e.almacen_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('bc7-period-responsible:'||p_responsable_id::text,0));
 SELECT * INTO v_cfg FROM public.turno_jornada_configuracion WHERE almacen_id=v_e.almacen_id FOR SHARE;
 IF FOUND THEN
  v_timezone:=coalesce(nullif(v_cfg.zona_horaria,''),'America/Havana');
  v_start:=v_cfg.hora_inicio;v_end:=v_cfg.hora_fin;v_salary:=v_cfg.salario_porcentaje;
 END IF;
 v_salary:=coalesce(v_salary,v_old_p.salario_porcentaje);
 v_today:=(now() AT TIME ZONE v_timezone)::date;
 IF p_fecha_fin>=v_today THEN
  RAISE EXCEPTION 'Esta opción se reserva para períodos ya terminados; usa la programación normal para fechas actuales o futuras.' USING ERRCODE='23514';
 END IF;

 IF EXISTS(SELECT 1 FROM public.turnos t WHERE t.almacen_id=v_e.almacen_id AND t.dias_turno IS NOT NULL
   AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')) THEN
  RAISE EXCEPTION 'El almacén ya tiene otro turno abierto o programado.' USING ERRCODE='23505';
 END IF;
 IF EXISTS(SELECT 1 FROM public.turno_jornada_programacion p
   WHERE p.almacen_id=v_e.almacen_id AND p.fecha<=p_fecha_fin
    AND coalesce(p.fecha_fin,p.fecha)>=v_e.fecha_destino AND p.estado IN ('PROGRAMADA','DESCANSO')) THEN
  RAISE EXCEPTION 'Ya existe una programación que se cruza con el período sucesor.' USING ERRCODE='23505';
 END IF;
 IF EXISTS(SELECT 1 FROM public.turno_jornada_programacion p
   WHERE p.responsable_id=p_responsable_id AND p.trabaja=true AND p.estado='PROGRAMADA'
    AND p.fecha<=p_fecha_fin AND coalesce(p.fecha_fin,p.fecha)>=v_e.fecha_destino)
  OR EXISTS(SELECT 1 FROM public.turno_sesiones s
   JOIN public.turno_asignaciones a ON a.turno_sesion_id=s.id JOIN public.turnos t ON t.id=s.turno_id
   WHERE s.fecha BETWEEN v_e.fecha_destino AND p_fecha_fin AND s.estado NOT IN ('COMPLETADA','CANCELADA')
    AND a.usuario_id=p_responsable_id AND a.retirado_at IS NULL
    AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO'))
  OR EXISTS(SELECT 1 FROM public.turno_tramos tr WHERE tr.usuario_id=p_responsable_id AND tr.estado='ACTIVO') THEN
  RAISE EXCEPTION 'La responsable ya tiene otra jornada programada o tramo activo dentro del período.' USING ERRCODE='23505';
 END IF;

 SELECT (a.tipo='minorista') INTO v_grouped FROM public.almacenes a WHERE a.id=v_e.almacen_id AND a.activo=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'El almacén no existe o está inactivo.' USING ERRCODE='23503'; END IF;
 IF v_grouped THEN
  SELECT count(*) INTO v_expected FROM public.productos p WHERE p.activo=true AND p.producto_padre_id IS NULL;
 ELSE
  SELECT count(*) INTO v_expected FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
  WHERE s.almacen_id=v_e.almacen_id AND p.activo=true;
 END IF;
 SELECT count(*) INTO v_line_count FROM public.turno_jornada_inventario_entrega_lineas WHERE entrega_id=v_e.id;
 IF v_line_count=0 OR v_line_count<>v_expected THEN
  RAISE EXCEPTION 'La entrega heredada contiene % líneas, pero el catálogo actual requiere % productos/familias. No se abrirá una sucesora incompleta.',v_line_count,v_expected USING ERRCODE='23514';
 END IF;

 v_days:=(p_fecha_fin-v_e.fecha_destino)+1;
 INSERT INTO public.turnos(usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,estado_maestro,dias_turno)
 VALUES(v_uid,NULL,v_e.almacen_id,v_e.fecha_destino,'PROGRAMADO',v_uid,v_uid,'PROGRAMADO',v_days) RETURNING * INTO v_t;
 INSERT INTO public.turno_jornada_programacion(
  turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,hora_inicio_prevista,hora_fin_prevista,
  zona_horaria,patron_id,estado,motivo_ajuste,creado_por,actualizado_por,salario_porcentaje
 ) VALUES(v_t.id,v_e.almacen_id,1,v_e.fecha_destino,p_fecha_fin,true,p_responsable_id,v_start,v_end,
  v_timezone,NULL,'PROGRAMADA','Regularización retroactiva: '||btrim(p_observacion),v_uid,v_uid,v_salary)
 RETURNING * INTO v_p;
 INSERT INTO public.turno_sesiones(turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id,apertura_retroactiva)
 VALUES(v_t.id,v_e.almacen_id,1,'JORNADA',v_e.fecha_destino,'PROGRAMADA',v_p.id,false) RETURNING * INTO v_s;
 INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por,motivo)
 VALUES(v_s.id,v_t.id,p_responsable_id,v_uid,'Responsable de jornada sucesora retroactiva: '||btrim(p_observacion));
 UPDATE public.turno_jornada_inventario_entregas
 SET destino_sesion_id=v_s.id,estado='PENDIENTE_RECEPCION',actualizado_en=now() WHERE id=v_e.id;
 INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
 VALUES(v_e.almacen_id,v_p.id,v_uid,'JORNADA_SUcesora_RETROACTIVA_PROGRAMADA',btrim(p_observacion),
  jsonb_build_object('entrega_id',v_e.id,'estado','PENDIENTE_PROGRAMACION'),
  jsonb_build_object('turno_id',v_t.id,'sesion_id',v_s.id,'fecha_inicio',v_e.fecha_destino,
    'fecha_fin',p_fecha_fin,'responsable_id',p_responsable_id,'estado_entrega','PENDIENTE_RECEPCION'));
 INSERT INTO public.turno_eventos(turno_id,actor_user_id,tipo,payload)
 VALUES(v_t.id,v_uid,'JORNADA_SUcesora_RETROACTIVA_PROGRAMADA',
  jsonb_build_object('turno_anterior_id',v_old_t.id,'sesion_anterior_id',v_old_s.id,'entrega_id',v_e.id,
   'sesion_id',v_s.id,'fecha_inicio',v_e.fecha_destino,'fecha_fin',p_fecha_fin,
   'responsable_id',p_responsable_id,'stock_global_modificado',false));
 RETURN jsonb_build_object('turno_id',v_t.id,'sesion_id',v_s.id,'programacion_id',v_p.id,
  'entrega_id',v_e.id,'fecha_inicio',v_e.fecha_destino,'fecha_fin',p_fecha_fin,
  'responsable_id',p_responsable_id,'lineas_inventario',v_line_count,'estado','PROGRAMADA',
  'recepcion','PENDIENTE_RECEPCION','stock_global_modificado',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_admin_iniciar_sucesora_retroactiva(p_turno_sesion_id uuid,p_hora_real time,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
 v_uid uuid:=auth.uid();v_s public.turno_sesiones;v_p public.turno_jornada_programacion;
 v_t public.turnos;v_tr public.turno_tramos;v_delivery public.turno_jornada_inventario_entregas;
 v_start timestamptz;v_today date;
BEGIN
 IF v_uid IS NULL OR NOT public.bc_actor_is_admin() THEN
  RAISE EXCEPTION 'Solo ADMIN autenticado puede abrir una sucesora retroactiva.' USING ERRCODE='42501';
 END IF;
 IF p_hora_real IS NULL OR length(btrim(coalesce(p_motivo,'')))<5 OR length(p_motivo)>1000 THEN
  RAISE EXCEPTION 'Indica la hora real de inicio y un motivo (5–1000 caracteres).' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
 IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL OR v_s.estado NOT IN ('PENDIENTE','PROGRAMADA') THEN
  RAISE EXCEPTION 'La sesión sucesora ya no está disponible para apertura retroactiva.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id FOR SHARE;
 SELECT * INTO v_t FROM public.turnos WHERE id=v_s.turno_id FOR UPDATE;
 IF NOT FOUND OR v_t.estado_maestro<>'PROGRAMADO' THEN
  RAISE EXCEPTION 'El Turno sucesor no está programado.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_delivery FROM public.turno_jornada_inventario_entregas WHERE destino_sesion_id=v_s.id FOR UPDATE;
 IF NOT FOUND OR v_delivery.estado<>'ACEPTADA' THEN
  RAISE EXCEPTION 'La recepción física debe estar aceptada antes de abrir la jornada.' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.turno_jornada_inventario_cortes c
  WHERE c.turno_sesion_id=v_s.id AND c.tipo='INICIAL' AND c.estado='CONFIRMADO') THEN
  RAISE EXCEPTION 'La recepción no ha generado un inventario inicial completo.' USING ERRCODE='23514';
 END IF;
 v_today:=(now() AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'))::date;
 IF v_today<=coalesce(v_p.fecha_fin,v_p.fecha) THEN
  RAISE EXCEPTION 'La apertura retroactiva solo se usa cuando el período ya terminó.' USING ERRCODE='23514';
 END IF;
 IF p_hora_real<v_p.hora_inicio_prevista OR p_hora_real>=v_p.hora_fin_prevista THEN
  RAISE EXCEPTION 'La hora real debe estar dentro del horario previsto %–%.',v_p.hora_inicio_prevista,v_p.hora_fin_prevista USING ERRCODE='22023';
 END IF;
 v_start:=(v_p.fecha+p_hora_real) AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana');
 IF v_start>now() THEN RAISE EXCEPTION 'La fecha/hora real de inicio no puede estar en el futuro.' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.turno_tramos tr WHERE tr.usuario_id=v_p.responsable_id AND tr.estado='ACTIVO') THEN
  RAISE EXCEPTION 'La responsable ya tiene otro tramo operativo activo.' USING ERRCODE='23505';
 END IF;
 IF EXISTS(SELECT 1 FROM public.turno_sesiones s JOIN public.turnos t ON t.id=s.turno_id
  WHERE s.almacen_id=v_s.almacen_id AND s.id<>v_s.id AND s.estado='EN_CURSO'
    AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')) THEN
  RAISE EXCEPTION 'El almacén ya tiene otra jornada en curso.' USING ERRCODE='23505';
 END IF;
 INSERT INTO public.turno_tramos(turno_sesion_id,turno_id,usuario_id,tipo,estado,inicio_at)
 VALUES(v_s.id,v_t.id,v_p.responsable_id,'NORMAL','ACTIVO',v_start) RETURNING * INTO v_tr;
 UPDATE public.turno_sesiones SET estado='EN_CURSO',apertura_retroactiva=true,updated_at=now() WHERE id=v_s.id;
 UPDATE public.turnos SET estado='ABIERTO',estado_maestro='EN_CURSO',apertura_real=v_start,actualizado_en=now() WHERE id=v_t.id;
 INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
 VALUES(v_t.id,v_s.id,v_tr.id,v_uid,'JORNADA_SUcesora_RETROACTIVA_INICIADA',
  jsonb_build_object('responsable_id',v_p.responsable_id,'inicio_real_at',v_start,'fecha_inicio',v_p.fecha,
   'fecha_fin',coalesce(v_p.fecha_fin,v_p.fecha),'motivo',btrim(p_motivo),
   'recepcion_id',(SELECT r.id FROM public.turno_jornada_inventario_recepciones r
    WHERE r.entrega_id=v_delivery.id ORDER BY r.intento DESC LIMIT 1)));
 INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
 VALUES(v_s.almacen_id,v_p.id,v_uid,'JORNADA_SUcesora_RETROACTIVA_INICIADA',btrim(p_motivo),
  jsonb_build_object('estado','PROGRAMADA'),jsonb_build_object('estado','EN_CURSO','tramo_id',v_tr.id,'inicio_real_at',v_start));
 RETURN jsonb_build_object('ok',true,'turno_id',v_t.id,'sesion_id',v_s.id,'tramo_id',v_tr.id,
  'responsable_id',v_p.responsable_id,'inicio_real_at',v_start,'estado','EN_CURSO');
END;
$function$;

DO $patch$
DECLARE v_definition text;v_old text;v_new text;
BEGIN
 SELECT pg_get_functiondef('public.bc7_obtener_inventario_jornada(uuid)'::regprocedure) INTO v_definition;
 v_old := $old$'responsable_id',v_p.responsable_id,'programacion_id',v_p.id,'es_minorista',v_agrupar$old$;
 v_new := $new$'responsable_id',v_p.responsable_id,'programacion_id',v_p.id,'es_minorista',v_agrupar,
  'sucesora_retroactiva',EXISTS(
   SELECT 1 FROM public.turno_jornada_inventario_entregas e
   JOIN public.turnos ot ON ot.id=e.turno_id
   WHERE e.destino_sesion_id=v_s.id AND ot.estado_maestro='CERRADO'
  )$new$;
 IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN
  RAISE EXCEPTION 'No se pudo localizar el payload de bc7_obtener_inventario_jornada(uuid).';
 END IF;
 EXECUTE replace(v_definition,v_old,v_new);
END;
$patch$;

REVOKE ALL ON FUNCTION public.bc7_recibir_entrega_jornada(uuid,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_recibir_entrega_jornada(uuid,jsonb,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public._bc7_crear_inicial_desde_entrega(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_resolver_entrega_jornada(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_resolver_entrega_jornada(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.bc7_corregir_inventario_final_jornada(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_corregir_inventario_final_jornada(uuid,jsonb,text) TO authenticated;
REVOKE ALL ON FUNCTION public.bc7_obtener_inventario_jornada(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_obtener_inventario_jornada(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.bc7_listar_entregas_sucesoras_pendientes() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_listar_entregas_sucesoras_pendientes() TO authenticated;
REVOKE ALL ON FUNCTION public.bc7_admin_programar_sucesora_pendiente(uuid,date,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_admin_programar_sucesora_pendiente(uuid,date,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.bc7_admin_iniciar_sucesora_retroactiva(uuid,time,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_admin_iniciar_sucesora_retroactiva(uuid,time,text) TO authenticated;
COMMIT;