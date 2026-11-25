BEGIN;

-- 1) Record and reconcile physical receipt differences without requiring an Owner decision.
-- The immutable FINAL and INITIAL line rows are never rewritten; corrections are overlays.
CREATE OR REPLACE FUNCTION public._bc7_rectificar_final_anterior_desde_recepcion(
  p_entrega_id uuid,
  p_recepcion_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_e public.turno_jornada_inventario_entregas;
  v_r public.turno_jornada_inventario_recepciones;
  v_old public.turno_sesiones;
  v_new public.turno_sesiones;
  v_old_p public.turno_jornada_programacion;
  v_new_p public.turno_jornada_programacion;
  v_source public.turno_jornada_inventario_cortes;
  v_cutoff timestamptz;
  v_movements boolean:=false;
  v_item record;
  v_previous numeric;
  v_count integer:=0;
  v_diff_count integer:=0;
  v_differences jsonb:='[]'::jsonb;
  v_alert jsonb;
  v_actor_name text;
  v_old_name text;
  v_new_name text;
BEGIN
  IF auth.uid() IS NULL OR p_actor_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'La rectificación debe ejecutarla la persona que registró la recepción.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_e FROM public.turno_jornada_inventario_entregas
  WHERE id=p_entrega_id FOR UPDATE;
  SELECT * INTO v_r FROM public.turno_jornada_inventario_recepciones
  WHERE id=p_recepcion_id AND entrega_id=p_entrega_id FOR UPDATE;
  IF v_e.id IS NULL OR v_r.id IS NULL OR v_e.destino_sesion_id IS NULL
     OR v_r.estado NOT IN ('PENDIENTE_REVISION','ACEPTADA') THEN
    RAISE EXCEPTION 'La recepción no pertenece a la entrega sucesora.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_old FROM public.turno_sesiones WHERE id=v_e.origen_sesion_id FOR SHARE;
  SELECT * INTO v_new FROM public.turno_sesiones WHERE id=v_e.destino_sesion_id FOR SHARE;
  SELECT * INTO v_source FROM public.turno_jornada_inventario_cortes
    WHERE id=v_e.origen_corte_id AND turno_sesion_id=v_old.id
      AND tipo='FINAL' AND estado='CONFIRMADO' FOR SHARE;
  SELECT * INTO v_old_p FROM public.turno_jornada_programacion WHERE id=v_old.jornada_programacion_id;
  SELECT * INTO v_new_p FROM public.turno_jornada_programacion WHERE id=v_new.jornada_programacion_id;
  IF v_old.id IS NULL OR v_new.id IS NULL OR v_source.id IS NULL
     OR v_old.estado<>'COMPLETADA' THEN
    RAISE EXCEPTION 'El corte FINAL de origen no está completado y confirmado.' USING ERRCODE='23514';
  END IF;

  SELECT count(*)::integer INTO v_diff_count
  FROM public.turno_jornada_inventario_recepcion_lineas
  WHERE recepcion_id=v_r.id AND diferencia<>0;
  IF v_diff_count=0 THEN
    RETURN jsonb_build_object(
      'diferencias',0,'correcciones_aplicadas',0,
      'movimientos_intermedios_detectados',false,
      'corte_final_anterior_actualizado',false
    );
  END IF;

  -- A physical count taken after documented stock movements cannot be copied blindly
  -- into the previous FINAL. Keep the receipt non-blocking, notify both sessions,
  -- and leave the historical FINAL untouched until those movements are attributable.
  v_cutoff:=coalesce(v_old.corte_operativo_at,v_source.confirmado_en);
  SELECT EXISTS(
    SELECT 1 FROM public.transferencias t
    WHERE (t.almacen_origen_id=v_old.almacen_id OR t.almacen_destino_id=v_old.almacen_id)
      AND lower(t.estado)='completada'
      AND t.fecha>v_cutoff AND t.fecha<=v_r.recibido_en
    UNION ALL
    SELECT 1 FROM public.lotes_compra lc
    WHERE lc.almacen_id=v_old.almacen_id
      AND lc.fecha_compra>v_cutoff AND lc.fecha_compra<=v_r.recibido_en
    UNION ALL
    SELECT 1 FROM public.ventas v
    WHERE v.almacen_id=v_old.almacen_id
      AND v.fecha>v_cutoff AND v.fecha<=v_r.recibido_en
    UNION ALL
    SELECT 1 FROM public.vales_salida vs
    WHERE vs.almacen_id=v_old.almacen_id
      AND vs.fecha>v_cutoff AND vs.fecha<=v_r.recibido_en
    UNION ALL
    SELECT 1 FROM public.mermas mm
    WHERE mm.almacen_id=v_old.almacen_id
      AND coalesce(mm.fecha_revision,mm.actualizado_en,mm.creado_en)>v_cutoff
      AND coalesce(mm.fecha_revision,mm.actualizado_en,mm.creado_en)<=v_r.recibido_en
    UNION ALL
    SELECT 1 FROM public.bajas bb
    WHERE bb.almacen_id=v_old.almacen_id
      AND coalesce(bb.fecha_revision,bb.actualizado_en,bb.creado_en)>v_cutoff
      AND coalesce(bb.fecha_revision,bb.actualizado_en,bb.creado_en)<=v_r.recibido_en
    UNION ALL
    SELECT 1 FROM public.reinversiones ri
    WHERE ri.almacen_id=v_old.almacen_id
      AND ri.fecha>v_cutoff AND ri.fecha<=v_r.recibido_en
  ) INTO v_movements;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'producto_id',rl.producto_id,
    'producto',p.nombre,
    'unidad',p.unidad,
    'cantidad_anterior',rl.cantidad_declarada,
    'cantidad_recibida',rl.cantidad_recibida,
    'diferencia',rl.diferencia
  ) ORDER BY p.nombre,p.id),'[]'::jsonb)
  INTO v_differences
  FROM public.turno_jornada_inventario_recepcion_lineas rl
  JOIN public.productos p ON p.id=rl.producto_id
  WHERE rl.recepcion_id=v_r.id AND rl.diferencia<>0;

  IF NOT v_movements THEN
    FOR v_item IN
      SELECT rl.producto_id,rl.cantidad_recibida,
        coalesce(c.cantidad_corregida,l.cantidad_contada) AS cantidad_anterior
      FROM public.turno_jornada_inventario_recepcion_lineas rl
      JOIN public.turno_jornada_inventario_lineas l
        ON l.corte_id=v_source.id AND l.producto_id=rl.producto_id
      LEFT JOIN public.turno_jornada_inventario_correcciones c
        ON c.turno_sesion_id=v_old.id AND c.tipo='FINAL'
       AND c.producto_id=rl.producto_id AND c.vigente
      WHERE rl.recepcion_id=v_r.id AND rl.diferencia<>0
      ORDER BY rl.producto_id
    LOOP
      v_previous:=v_item.cantidad_anterior;
      IF v_previous IS DISTINCT FROM v_item.cantidad_recibida THEN
        UPDATE public.turno_jornada_inventario_correcciones
        SET vigente=false
        WHERE turno_sesion_id=v_old.id AND tipo='FINAL'
          AND producto_id=v_item.producto_id AND vigente;

        INSERT INTO public.turno_jornada_inventario_correcciones(
          turno_sesion_id,tipo,producto_id,cantidad_original,cantidad_corregida,comentario,creado_por
        ) VALUES(
          v_old.id,'FINAL',v_item.producto_id,v_previous,v_item.cantidad_recibida,
          left('Rectificación automática desde el conteo físico de la Jornada sucesora. Recepción '
            ||v_r.id::text||'; sesión sucesora '||v_new.id::text||'. El corte original permanece inmutable.',500),
          p_actor_user_id
        );
        v_count:=v_count+1;
      END IF;
    END LOOP;
  END IF;

  SELECT nombre INTO v_actor_name FROM public.usuarios WHERE id=p_actor_user_id;
  SELECT nombre INTO v_old_name FROM public.usuarios WHERE id=v_old_p.responsable_id;
  SELECT nombre INTO v_new_name FROM public.usuarios WHERE id=v_new_p.responsable_id;

  v_alert:=jsonb_build_object(
    'tipo','DISCREPANCIA_INVENTARIO_ENTRE_JORNADAS',
    'sesion_anterior_id',v_old.id,
    'sesion_sucesora_id',v_new.id,
    'responsable_anterior_id',v_old_p.responsable_id,
    'responsable_anterior_nombre',coalesce(v_old_name,'Responsable anterior'),
    'responsable_sucesora_id',v_new_p.responsable_id,
    'responsable_sucesora_nombre',coalesce(v_new_name,'Responsable sucesora'),
    'recepcion_id',v_r.id,
    'fecha_recepcion',v_r.recibido_en,
    'registrada_por',coalesce(v_actor_name,'Responsable'),
    'diferencias',v_differences,
    'correcciones_aplicadas',v_count,
    'movimientos_intermedios_detectados',v_movements,
    'corte_final_anterior_actualizado',(NOT v_movements AND v_count>0),
    'mensaje',CASE
      WHEN v_movements THEN
        'La recepción fue aceptada sin bloquear la Jornada. Hay movimientos de stock entre el corte anterior y la recepción; el FINAL anterior se conserva para no atribuir esos movimientos como error de conteo.'
      ELSE
        'La recepción fue aceptada sin bloquear la Jornada. El FINAL anterior recibió una rectificación auditada basada en las cantidades físicas recibidas. El corte original se conserva.'
    END
  );

  -- Store one continuity alert on each Jornada so the Owner and both responsible
  -- employees see the same facts from their respective workspace.
  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_old.almacen_id,v_old_p.id,p_actor_user_id,
    'JORNADA_INVENTARIO_DISCREPANCIA_CONTINUIDAD',
    'Diferencias físicas entre el FINAL anterior y la recepción sucesora.',
    jsonb_build_object('corte_final_id',v_source.id,'sesion_sucesora_id',v_new.id),
    jsonb_build_object('alerta',v_alert)
  );
  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_new.almacen_id,v_new_p.id,p_actor_user_id,
    'JORNADA_INVENTARIO_DISCREPANCIA_CONTINUIDAD',
    'Diferencias físicas entre el FINAL anterior y la recepción sucesora.',
    jsonb_build_object('corte_final_origen_id',v_source.id,'sesion_anterior_id',v_old.id),
    jsonb_build_object('alerta',v_alert)
  );

  RETURN jsonb_build_object(
    'diferencias',v_diff_count,
    'correcciones_aplicadas',v_count,
    'movimientos_intermedios_detectados',v_movements,
    'corte_final_anterior_actualizado',(NOT v_movements AND v_count>0)
  );
END;
$function$;

-- 2) Make an eligible retroactive successor open at its scheduled start without
-- an Owner-only activation step. If its scheduled end is already past, the
-- existing operational-seal function closes the tranche at the original cutoff.
CREATE OR REPLACE FUNCTION public._bc7_iniciar_sucesora_si_corresponde(
  p_turno_sesion_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_t public.turnos;
  v_old_turn public.turnos;
  v_e public.turno_jornada_inventario_entregas;
  v_tr public.turno_tramos;
  v_start timestamptz;
  v_now timestamptz:=clock_timestamp();
  v_final_state text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('bc7-successor-auto-start:'||p_turno_sesion_id::text,0));

  SELECT * INTO v_s FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RETURN jsonb_build_object('iniciada',false,'motivo','SESION_NO_ENCONTRADA');
  END IF;
  IF v_s.estado NOT IN ('PENDIENTE','PROGRAMADA') THEN
    RETURN jsonb_build_object('iniciada',false,'motivo','YA_INICIADA','estado',v_s.estado);
  END IF;

  SELECT * INTO v_p FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id FOR SHARE;
  SELECT * INTO v_t FROM public.turnos WHERE id=v_s.turno_id FOR UPDATE;
  IF v_p.id IS NULL OR v_t.id IS NULL OR v_p.estado<>'PROGRAMADA' OR NOT v_p.trabaja THEN
    RETURN jsonb_build_object('iniciada',false,'motivo','PROGRAMACION_NO_DISPONIBLE');
  END IF;

  SELECT e.* INTO v_e
  FROM public.turno_jornada_inventario_entregas e
  JOIN public.turnos old_turn ON old_turn.id=e.turno_id
  WHERE e.destino_sesion_id=v_s.id
    AND e.estado='ACEPTADA'
    AND old_turn.estado_maestro='CERRADO'
  ORDER BY e.creado_en DESC
  LIMIT 1
  FOR UPDATE OF e;
  IF v_e.id IS NULL THEN
    RETURN jsonb_build_object('iniciada',false,'motivo','RECEPCION_NO_ACEPTADA');
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=v_s.id AND c.tipo='INICIAL' AND c.estado='CONFIRMADO'
  ) THEN
    RETURN jsonb_build_object('iniciada',false,'motivo','INVENTARIO_INICIAL_NO_CONFIRMADO');
  END IF;

  v_start:=(v_p.fecha::timestamp+v_p.hora_inicio_prevista)
    AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana');
  IF v_start>v_now THEN
    RETURN jsonb_build_object('iniciada',false,'motivo','NO_HA_LLEGADO_LA_HORA','inicio_programado_at',v_start);
  END IF;
  IF coalesce(v_t.estado_maestro,v_t.estado) NOT IN ('PROGRAMADO','EN_CURSO') THEN
    RETURN jsonb_build_object('iniciada',false,'motivo','TURNO_MAESTRO_NO_DISPONIBLE');
  END IF;
  IF NOT public.bc5_jornada_responsable_elegible(v_p.responsable_id) THEN
    RETURN jsonb_build_object('iniciada',false,'motivo','RESPONSABLE_NO_ELEGIBLE');
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.turno_sesiones other_s
    JOIN public.turno_tramos other_t ON other_t.turno_sesion_id=other_s.id
    WHERE other_s.almacen_id=v_s.almacen_id AND other_s.id<>v_s.id
      AND other_s.bloque='JORNADA' AND other_s.estado='EN_CURSO' AND other_t.estado='ACTIVO'
  ) THEN
    RETURN jsonb_build_object('iniciada',false,'motivo','ALMACEN_CON_JORNADA_ACTIVA');
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.turno_tramos other_t
    WHERE other_t.usuario_id=v_p.responsable_id AND other_t.estado='ACTIVO'
  ) THEN
    RETURN jsonb_build_object('iniciada',false,'motivo','RESPONSABLE_CON_TRAMO_ACTIVO');
  END IF;

  INSERT INTO public.turno_tramos(
    turno_sesion_id,turno_id,usuario_id,tipo,estado,inicio_at
  ) VALUES(
    v_s.id,v_t.id,v_p.responsable_id,'NORMAL','ACTIVO',v_start
  ) RETURNING * INTO v_tr;

  UPDATE public.turno_sesiones
  SET estado='EN_CURSO',
      apertura_retroactiva=(v_start<v_now),
      updated_at=v_now
  WHERE id=v_s.id;

  UPDATE public.turnos
  SET estado='ABIERTO',
      estado_maestro='EN_CURSO',
      apertura_real=coalesce(apertura_real,v_start),
      actualizado_en=v_now
  WHERE id=v_t.id;

  INSERT INTO public.turno_eventos(
    turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload
  ) VALUES(
    v_t.id,v_s.id,v_tr.id,p_actor_user_id,
    'JORNADA_SUcesora_INICIADA_AUTOMATICAMENTE',
    jsonb_build_object(
      'actor',CASE WHEN p_actor_user_id IS NULL THEN 'SYSTEM' ELSE 'RESPONSABLE' END,
      'responsable_id',v_p.responsable_id,
      'inicio_programado_at',v_start,
      'inicio_ejecutado_at',v_now,
      'hora_inicio_prevista',v_p.hora_inicio_prevista,
      'zona_horaria',v_p.zona_horaria,
      'recepcion_id',(SELECT r.id FROM public.turno_jornada_inventario_recepciones r
        WHERE r.entrega_id=v_e.id ORDER BY r.intento DESC LIMIT 1)
    )
  );

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  ) VALUES(
    v_s.almacen_id,v_p.id,coalesce(p_actor_user_id,v_p.creado_por),
    'JORNADA_SUcesora_INICIADA_AUTOMATICAMENTE',
    'Inicio automático tras la hora programada y recepción física aceptada.',
    jsonb_build_object('estado','PROGRAMADA'),
    jsonb_build_object('estado','EN_CURSO','tramo_id',v_tr.id,
      'inicio_programado_at',v_start,'apertura_retroactiva',v_start<v_now,
      'actor',CASE WHEN p_actor_user_id IS NULL THEN 'SYSTEM' ELSE 'RESPONSABLE' END)
  );

  PERFORM public.bc5_cerrar_jornadas_operativas_vencidas();
  SELECT estado INTO v_final_state FROM public.turno_sesiones WHERE id=v_s.id;
  RETURN jsonb_build_object(
    'iniciada',true,'turno_id',v_t.id,'sesion_id',v_s.id,'tramo_id',v_tr.id,
    'responsable_id',v_p.responsable_id,'inicio_programado_at',v_start,
    'estado',v_final_state
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_asegurar_inicio_sucesora_programada(
  p_turno_sesion_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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
  IF NOT FOUND THEN RAISE EXCEPTION 'Jornada no encontrada.' USING ERRCODE='23503'; END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  IF NOT public.bc_actor_is_admin() AND v_p.responsable_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS(
       SELECT 1 FROM public.turno_asignaciones a
       WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
     ) THEN
    RAISE EXCEPTION 'Solo la responsable asignada puede habilitar su jornada programada.' USING ERRCODE='42501';
  END IF;
  v_result:=public._bc7_iniciar_sucesora_si_corresponde(p_turno_sesion_id,auth.uid());
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_procesar_sucesoras_programadas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s record;
  v_result jsonb;
  v_started integer:=0;
BEGIN
  FOR v_s IN
    SELECT s.id
    FROM public.turno_sesiones s
    JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
    JOIN public.turno_jornada_inventario_entregas e ON e.destino_sesion_id=s.id AND e.estado='ACEPTADA'
    JOIN public.turnos old_turn ON old_turn.id=e.turno_id AND old_turn.estado_maestro='CERRADO'
    WHERE s.bloque='JORNADA'
      AND s.estado IN ('PENDIENTE','PROGRAMADA')
      AND p.estado='PROGRAMADA' AND p.trabaja
      AND (p.fecha::timestamp+p.hora_inicio_prevista)
        AT TIME ZONE coalesce(nullif(p.zona_horaria,''),'America/Havana') <= clock_timestamp()
      AND EXISTS(
        SELECT 1 FROM public.turno_jornada_inventario_cortes c
        WHERE c.turno_sesion_id=s.id AND c.tipo='INICIAL' AND c.estado='CONFIRMADO'
      )
    ORDER BY p.fecha,p.hora_inicio_prevista,s.id
    LIMIT 100
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    v_result:=public._bc7_iniciar_sucesora_si_corresponde(v_s.id,NULL);
    IF coalesce((v_result->>'iniciada')::boolean,false) THEN
      v_started:=v_started+1;
    END IF;
  END LOOP;
  PERFORM public.bc5_cerrar_jornadas_operativas_vencidas();
  RETURN v_started;
END;
$function$;

REVOKE ALL ON FUNCTION public._bc7_rectificar_final_anterior_desde_recepcion(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._bc7_iniciar_sucesora_si_corresponde(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bc7_asegurar_inicio_sucesora_programada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_asegurar_inicio_sucesora_programada(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.bc7_procesar_sucesoras_programadas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_procesar_sucesoras_programadas() TO postgres, service_role;

-- 3) Replace the Owner-review branch with automatic acceptance plus an audited FINAL overlay.
DO $patch$
DECLARE
  v_def text;
  v_old text;
  v_new text;
  v_old_event text;
  v_new_event text;
  v_old_return text;
  v_new_return text;
BEGIN
  v_def:=pg_get_functiondef(
    'public.bc7_recibir_entrega_jornada(uuid,jsonb,text,uuid)'::regprocedure
  );

  v_def:=replace(v_def,'v_synced integer:=0;','v_synced integer:=0;'||chr(10)||' v_final_correction jsonb;');
  IF position('v_final_correction jsonb;' IN v_def)=0 THEN
    RAISE EXCEPTION 'Could not add final correction result to the receipt function.';
  END IF;

  v_old:=$old$ IF v_has_diff THEN
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
$old$;
  v_new:=$new$ v_final_correction:=public._bc7_rectificar_final_anterior_desde_recepcion(v_e.id,v_r.id,v_uid);

 UPDATE public.turno_jornada_inventario_recepciones
 SET estado='ACEPTADA',
     decision_por=v_uid,
     decision_en=now(),
     decision_motivo=CASE
       WHEN v_has_diff AND coalesce((v_final_correction->>'movimientos_intermedios_detectados')::boolean,false)
         THEN 'Recepción aceptada automáticamente. Diferencias informativas; se detectaron movimientos intermedios y el corte FINAL anterior se conserva para evitar una atribución incorrecta.'
       WHEN v_has_diff
         THEN 'Recepción aceptada automáticamente. Diferencias informativas registradas y corte FINAL anterior rectificado con trazabilidad.'
       ELSE 'Recepción física igual al inventario declarado; cantidad compartida aceptada automáticamente.'
     END
 WHERE id=v_r.id RETURNING * INTO v_r;

 UPDATE public.turno_jornada_inventario_entrega_lineas dl
 SET cantidad_efectiva=rl.cantidad_recibida
 FROM public.turno_jornada_inventario_recepcion_lineas rl
 WHERE rl.recepcion_id=v_r.id
   AND rl.producto_id=dl.producto_id
   AND dl.entrega_id=v_e.id;

 UPDATE public.turno_jornada_inventario_entregas
 SET estado='ACEPTADA',actualizado_en=now()
 WHERE id=v_e.id;

 v_initial:=public._bc7_crear_inicial_desde_entrega(
   v_e.id,v_r.id,v_uid,
   CASE WHEN v_has_diff
     THEN 'Recepción física aceptada automáticamente. Diferencias preservadas como evidencia; no bloquean la Jornada.'
     ELSE 'Recepción física igual al inventario declarado; cantidad compartida aceptada automáticamente.'
   END
 );
$new$;

  IF position(v_old IN v_def)=0 THEN
    RAISE EXCEPTION 'The expected Owner-review branch in bc7_recibir_entrega_jornada was not found.';
  END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old_event:=$old$ INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
 VALUES(v_e.almacen_id,v_s.jornada_programacion_id,v_uid,
  CASE WHEN v_has_diff THEN 'INVENTARIO_RECEPCION_CON_DIFERENCIAS' ELSE 'INVENTARIO_RECEPCION_IGUAL' END,
  left(coalesce(p_observacion,''),1000),jsonb_build_object('entrega_id',v_e.id,'intento',v_attempt),
  jsonb_build_object('recepcion_id',v_r.id,'estado',CASE WHEN v_has_diff THEN 'PENDIENTE_REVISION' ELSE 'ACEPTADA' END,
    'inventario_inicial_id',v_initial,'inventario_agrupado_por_familia',v_grouped));
$old$;
  v_new_event:=$new$ INSERT INTO public.turno_jornada_eventos(
  almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
 ) VALUES(
  v_e.almacen_id,v_s.jornada_programacion_id,v_uid,
  CASE WHEN v_has_diff THEN 'INVENTARIO_RECEPCION_DISCREPANCIAS_INFORMATIVAS' ELSE 'INVENTARIO_RECEPCION_IGUAL' END,
  left(coalesce(p_observacion,''),1000),
  jsonb_build_object('entrega_id',v_e.id,'intento',v_attempt),
  jsonb_build_object(
    'recepcion_id',v_r.id,
    'estado','ACEPTADA',
    'requiere_revision',false,
    'diferencias_informativas',v_has_diff,
    'inventario_inicial_id',v_initial,
    'correcciones_final_anterior',coalesce((v_final_correction->>'correcciones_aplicadas')::integer,0),
    'movimientos_intermedios_detectados',coalesce((v_final_correction->>'movimientos_intermedios_detectados')::boolean,false),
    'inventario_agrupado_por_familia',v_grouped
  )
 );
$new$;
  IF position(v_old_event IN v_def)=0 THEN
    RAISE EXCEPTION 'The expected receipt event block was not found.';
  END IF;
  v_def:=replace(v_def,v_old_event,v_new_event);

  v_old_return:=$old$ RETURN jsonb_build_object('id',v_r.id,'entrega_id',v_e.id,'estado',v_r.estado,'intento',v_attempt,
  'requiere_revision',v_has_diff,'inventario_inicial_id',v_initial,
  'inventario_agrupado_por_familia',v_grouped,'idempotente',false);
END;
$function$
$old$;
  v_new_return:=$new$ RETURN jsonb_build_object(
  'id',v_r.id,
  'entrega_id',v_e.id,
  'estado',v_r.estado,
  'intento',v_attempt,
  'requiere_revision',false,
  'diferencias_informativas',v_has_diff,
  'inventario_inicial_id',v_initial,
  'correcciones_final_anterior',coalesce((v_final_correction->>'correcciones_aplicadas')::integer,0),
  'movimientos_intermedios_detectados',coalesce((v_final_correction->>'movimientos_intermedios_detectados')::boolean,false),
  'corte_final_anterior_actualizado',coalesce((v_final_correction->>'corte_final_anterior_actualizado')::boolean,false),
  'inventario_agrupado_por_familia',v_grouped,
  'idempotente',false
 );
END;
$function$
$new$;
  IF position(v_old_return IN v_def)=0 THEN
    RAISE EXCEPTION 'The expected receipt return block was not found.';
  END IF;
  v_def:=replace(v_def,v_old_return,v_new_return);
  EXECUTE v_def;
END
$patch$;

-- 4) Expose continuity alerts in both the previous and successor Jornada workspace.
DO $patch$
DECLARE
  v_def text;
  v_old text:=$old$
  RETURN v_result;
$old$;
  v_new text:=$new$
  v_result:=v_result||jsonb_build_object(
    'alertas_continuidad',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',ev.id,
        'creado_en',ev.creado_en,
        'alerta',ev.estado_despues->'alerta'
      ) ORDER BY ev.creado_en DESC)
      FROM public.turno_jornada_eventos ev
      WHERE ev.programacion_id=v_p.id
        AND ev.tipo='JORNADA_INVENTARIO_DISCREPANCIA_CONTINUIDAD'
    ),'[]'::jsonb)
  );
  RETURN v_result;
$old$;
BEGIN
  v_def:=pg_get_functiondef('public.bc7_obtener_inventario_jornada(uuid)'::regprocedure);
  IF position(v_old IN v_def)=0 THEN
    RAISE EXCEPTION 'Could not append continuity alerts to bc7_obtener_inventario_jornada.';
  END IF;
  v_def:=replace(v_def,v_old,v_new);
  EXECUTE v_def;
END
$patch$;

-- 5) The existing minute job now auto-starts eligible successors and then seals any
-- already-ended operational periods using their original scheduled cutoff.
DO $job$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    UPDATE cron.job
    SET command='SELECT public.bc7_procesar_sucesoras_programadas();'
    WHERE jobname='battlecruiser-jornada-operational-seal';
    IF NOT FOUND THEN
      PERFORM cron.schedule(
        'battlecruiser-jornada-operational-seal',
        '* * * * *',
        'SELECT public.bc7_procesar_sucesoras_programadas();'
      );
    END IF;
  END IF;
END
$job$;

NOTIFY pgrst,'reload schema';
COMMIT;
