BEGIN;

-- La dependienta marca explícitamente que terminó de registrar cada categoría.
-- Después de marcarla, el backend impide nuevas escrituras vinculadas a esa jornada.
CREATE TABLE IF NOT EXISTS public.turno_jornada_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_sesion_id uuid NOT NULL REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT,
  tarea text NOT NULL CHECK (tarea IN ('GASTOS','REINVERSIONES','BAJAS')),
  completado_por uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  completado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turno_jornada_checklist_unico UNIQUE (turno_sesion_id,tarea)
);
CREATE INDEX IF NOT EXISTS turno_jornada_checklist_session_idx
  ON public.turno_jornada_checklist(turno_sesion_id,tarea);
REVOKE ALL ON TABLE public.turno_jornada_checklist FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bc7_guard_jornada_checklist_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_tarea text;
BEGIN
  IF NEW.turno_sesion_id IS NULL THEN RETURN NEW; END IF;

  -- Serialize writes against the dependent's explicit "finished" action.
  PERFORM 1 FROM public.turno_sesiones s
  WHERE s.id=NEW.turno_sesion_id
  FOR SHARE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_tarea:=CASE
    WHEN TG_TABLE_NAME='gastos' THEN 'GASTOS'
    WHEN TG_TABLE_NAME='reinversiones' THEN 'REINVERSIONES'
    WHEN TG_TABLE_NAME IN ('bajas','mermas') THEN 'BAJAS'
    ELSE NULL
  END;
  IF v_tarea IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.turno_jornada_checklist c
    WHERE c.turno_sesion_id=NEW.turno_sesion_id AND c.tarea=v_tarea
  ) THEN
    RAISE EXCEPTION 'La responsable ya confirmó que terminó de registrar % para esta jornada. No se admiten registros nuevos en ese bloque.',lower(v_tarea)
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bc7_gastos_checklist_lock ON public.gastos;
CREATE TRIGGER bc7_gastos_checklist_lock
  BEFORE INSERT OR UPDATE OF turno_sesion_id ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.bc7_guard_jornada_checklist_write();
DROP TRIGGER IF EXISTS bc7_reinversiones_checklist_lock ON public.reinversiones;
CREATE TRIGGER bc7_reinversiones_checklist_lock
  BEFORE INSERT OR UPDATE OF turno_sesion_id ON public.reinversiones
  FOR EACH ROW EXECUTE FUNCTION public.bc7_guard_jornada_checklist_write();
DROP TRIGGER IF EXISTS bc7_bajas_checklist_lock ON public.bajas;
CREATE TRIGGER bc7_bajas_checklist_lock
  BEFORE INSERT OR UPDATE OF turno_sesion_id ON public.bajas
  FOR EACH ROW EXECUTE FUNCTION public.bc7_guard_jornada_checklist_write();
DROP TRIGGER IF EXISTS bc7_mermas_checklist_lock ON public.mermas;
CREATE TRIGGER bc7_mermas_checklist_lock
  BEFORE INSERT OR UPDATE OF turno_sesion_id ON public.mermas
  FOR EACH ROW EXECUTE FUNCTION public.bc7_guard_jornada_checklist_write();

CREATE OR REPLACE FUNCTION public.bc7_marcar_checklist_jornada(
  p_turno_sesion_id uuid,
  p_tarea text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_tarea text:=upper(coalesce(p_tarea,''));
  v_id uuid;
  v_created boolean:=false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.tiene_permiso('turnos','ver') THEN
    RAISE EXCEPTION 'No tienes permiso para completar el checklist de esta jornada.' USING ERRCODE='42501';
  END IF;
  IF v_tarea NOT IN ('GASTOS','REINVERSIONES','BAJAS') THEN
    RAISE EXCEPTION 'Bloque de checklist no válido.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'Solo puedes completar tareas de una jornada que esté en curso.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo la responsable asignada puede confirmar que terminó este bloque.' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.turno_jornada_checklist(turno_sesion_id,tarea,completado_por)
  VALUES(v_s.id,v_tarea,auth.uid())
  ON CONFLICT(turno_sesion_id,tarea) DO NOTHING
  RETURNING id INTO v_id;
  v_created:=v_id IS NOT NULL;
  IF NOT v_created THEN
    SELECT id INTO v_id FROM public.turno_jornada_checklist
    WHERE turno_sesion_id=v_s.id AND tarea=v_tarea;
  END IF;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(
    v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),
    CASE WHEN v_created THEN 'CHECKLIST_BLOQUE_COMPLETADO' ELSE 'CHECKLIST_BLOQUE_RECONFIRMADO' END,
    v_tarea,
    jsonb_build_object('sesion_id',v_s.id,'tarea',v_tarea,'completado',false),
    jsonb_build_object('checklist_id',v_id,'tarea',v_tarea,'completado',true)
  );

  RETURN jsonb_build_object(
    'ok',true,'turno_sesion_id',v_s.id,'tarea',v_tarea,
    'completado',true,'idempotente',NOT v_created
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_estado_checklist_jornada(p_turno_sesion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_gastos boolean:=false;
  v_reinversiones boolean:=false;
  v_bajas boolean:=false;
  v_final boolean:=false;
  v_declaracion public.turno_declaraciones;
  v_expected_daily integer:=0;
  v_approved_daily integer:=0;
  v_pending_daily integer:=0;
  v_pending_expenses integer:=0;
  v_pending_reinvestments integer:=0;
  v_pending_adjustments integer:=0;
  v_daily_missing integer:=0;
  v_can_count boolean:=false;
  v_blocker text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN
    RAISE EXCEPTION 'La jornada no existe.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS(
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Solo la responsable asignada o ADMIN puede consultar el checklist.' USING ERRCODE='42501';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.turno_jornada_checklist c WHERE c.turno_sesion_id=v_s.id AND c.tarea='GASTOS')
    INTO v_gastos;
  SELECT EXISTS(SELECT 1 FROM public.turno_jornada_checklist c WHERE c.turno_sesion_id=v_s.id AND c.tarea='REINVERSIONES')
    INTO v_reinversiones;
  SELECT EXISTS(SELECT 1 FROM public.turno_jornada_checklist c WHERE c.turno_sesion_id=v_s.id AND c.tarea='BAJAS')
    INTO v_bajas;
  SELECT EXISTS(
    SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=v_s.id AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
  ) INTO v_final;

  SELECT * INTO v_declaracion
  FROM public.turno_declaraciones d
  WHERE d.turno_sesion_id=v_s.id
  ORDER BY d.declarado_at DESC NULLS LAST,d.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT * INTO v_p FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id;
  v_expected_daily:=greatest(0,(coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha)::integer);
  SELECT count(*) FILTER(WHERE e.estado='APROBADA'),
         count(*) FILTER(WHERE e.estado='PENDIENTE')
    INTO v_approved_daily,v_pending_daily
  FROM public.turno_jornada_entregas_diarias e
  WHERE e.turno_sesion_id=v_s.id;
  v_daily_missing:=greatest(0,v_expected_daily-v_approved_daily);

  SELECT count(*) FILTER(WHERE g.estado='PENDIENTE')
  INTO v_pending_expenses
  FROM public.gastos g WHERE g.turno_sesion_id=v_s.id;
  SELECT count(*) FILTER(WHERE r.estado='PENDIENTE')
  INTO v_pending_reinvestments
  FROM public.reinversiones r WHERE r.turno_sesion_id=v_s.id;
  SELECT count(*) INTO v_pending_adjustments
  FROM (
    SELECT 1 FROM public.mermas m WHERE m.turno_sesion_id=v_s.id AND m.estado='PENDIENTE'
    UNION ALL
    SELECT 1 FROM public.bajas b WHERE b.turno_sesion_id=v_s.id AND b.estado='PENDIENTE'
  ) pending;

  v_can_count:=(
    v_s.estado='COMPLETADA'
    AND v_declaracion.id IS NOT NULL
    AND v_declaracion.monto_contado IS NULL
  ) OR (
    v_s.estado='EN_CURSO'
    AND v_gastos AND v_reinversiones AND v_bajas AND v_final
    AND v_declaracion.id IS NOT NULL AND v_declaracion.monto_contado IS NULL
    AND v_pending_expenses=0 AND v_pending_reinvestments=0
    AND v_pending_adjustments=0 AND v_pending_daily=0 AND v_daily_missing=0
  );

  IF v_s.estado='COMPLETADA' THEN
    v_blocker:=NULL;
  ELSIF NOT (v_gastos AND v_reinversiones AND v_bajas) THEN
    v_blocker:='Sheila debe confirmar que terminó de registrar gastos, reinversiones y bajas.';
  ELSIF NOT v_final THEN
    v_blocker:='Falta confirmar el inventario final físico.';
  ELSIF v_pending_expenses>0 OR v_pending_reinvestments>0 OR v_pending_adjustments>0 THEN
    v_blocker:='El Dueño debe resolver todas las aprobaciones de gastos, reinversiones, bajas y mermas.';
  ELSIF v_pending_daily>0 OR v_daily_missing>0 THEN
    v_blocker:='Faltan entregas diarias de efectivo por aprobar.';
  ELSIF v_declaracion.id IS NULL THEN
    v_blocker:='La responsable todavía no ha declarado el efectivo final.';
  ELSIF v_declaracion.monto_contado IS NOT NULL THEN
    v_blocker:='El efectivo final ya tiene un conteo físico registrado.';
  ELSE
    v_blocker:='El Dueño puede realizar el conteo físico del efectivo final.';
  END IF;

  RETURN jsonb_build_object(
    'gastos_completados',v_gastos,
    'reinversiones_completadas',v_reinversiones,
    'bajas_completadas',v_bajas,
    'inventario_final_confirmado',v_final,
    'efectivo_declarado',v_declaracion.id IS NOT NULL,
    'efectivo_contado',v_declaracion.monto_contado IS NOT NULL,
    'efectivo_aprobado',coalesce(v_declaracion.estado_aprobacion='APROBADA' AND v_declaracion.monto_contado IS NOT NULL,false),
    'estado_efectivo',v_declaracion.estado_aprobacion,
    'monto_declarado',v_declaracion.monto,
    'monto_contado',v_declaracion.monto_contado,
    'diferencia',v_declaracion.diferencia,
    'puede_contar_efectivo',v_can_count,
    'bloqueo_efectivo',CASE WHEN v_can_count THEN NULL ELSE v_blocker END,
    'aprobaciones_pendientes',jsonb_build_object(
      'gastos',v_pending_expenses,'reinversiones',v_pending_reinvestments,
      'ajustes',v_pending_adjustments,'entregas_diarias',v_pending_daily,
      'entregas_diarias_faltantes',v_daily_missing
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_marcar_checklist_jornada(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_marcar_checklist_jornada(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.bc7_estado_checklist_jornada(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_estado_checklist_jornada(uuid) TO authenticated;

-- Retail JORNADA sessions are no longer closed by the dependent's cash form.
-- Only the owner's explicit final-review RPC may move them to COMPLETADA.
CREATE OR REPLACE FUNCTION public.bc7_guard_owner_final_jornada_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF OLD.bloque='JORNADA'
     AND OLD.estado IS DISTINCT FROM NEW.estado
     AND NEW.estado='COMPLETADA'
     AND EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=OLD.almacen_id AND a.tipo='minorista')
     AND (
       current_setting('app.bc7_owner_final_approval',true) IS DISTINCT FROM 'on'
       OR NOT public.bc_actor_is_admin()
     ) THEN
    RAISE EXCEPTION 'La jornada de La Cueva no se cierra al declarar el efectivo. El Dueño debe contar el dinero, revisar la liquidación y aprobar el cierre final.'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS bc7_owner_final_jornada_close_guard ON public.turno_sesiones;
CREATE TRIGGER bc7_owner_final_jornada_close_guard
  BEFORE UPDATE OF estado ON public.turno_sesiones
  FOR EACH ROW EXECUTE FUNCTION public.bc7_guard_owner_final_jornada_close();

-- The Dueño's count is the fifth checklist step. A difference remains subject to
-- the existing difference-approval path before the automatic liquidation becomes calculable.
CREATE OR REPLACE FUNCTION public.bc5_contar_dinero_entregado(p_declaracion_id uuid, p_monto_contado numeric, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_d public.turno_declaraciones;
  v_s public.turno_sesiones;
  v_contado numeric(14,2);
  v_diferencia numeric(14,2);
  v_diferencia_id uuid;
  v_obs text;
  v_gate jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE='42501';
  END IF;
  IF NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador puede contar el dinero entregado.' USING ERRCODE='42501';
  END IF;
  IF p_declaracion_id IS NULL OR p_monto_contado IS NULL OR p_monto_contado < 0 THEN
    RAISE EXCEPTION 'Introduce un importe contado válido, igual o mayor que cero.' USING ERRCODE='23514';
  END IF;

  v_contado := round(p_monto_contado,2);
  v_obs := nullif(left(btrim(coalesce(p_observacion,'')),1000),'');
  SELECT * INTO v_d
  FROM public.turno_declaraciones
  WHERE id=p_declaracion_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la declaración de dinero.' USING ERRCODE='23503';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=v_d.turno_sesion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la jornada asociada a la declaración.' USING ERRCODE='23503';
  END IF;
  IF v_s.estado NOT IN ('EN_CURSO','COMPLETADA') THEN
    RAISE EXCEPTION 'La jornada debe estar en curso o completada para contar el efectivo.' USING ERRCODE='23514';
  END IF;
  IF v_s.estado='EN_CURSO' THEN
    v_gate:=public.bc7_estado_checklist_jornada(v_s.id);
    IF NOT coalesce((v_gate->>'puede_contar_efectivo')::boolean,false) THEN
      RAISE EXCEPTION '%',coalesce(v_gate->>'bloqueo_efectivo','Completa los cuatro pasos operativos y resuelve las aprobaciones antes de contar el efectivo.')
        USING ERRCODE='23514';
    END IF;
  END IF;

  -- A retry with the exact same physical count is safe. A different amount cannot overwrite evidence.
  IF v_d.monto_contado IS NOT NULL THEN
    IF round(v_d.monto_contado,2) IS DISTINCT FROM v_contado THEN
      RAISE EXCEPTION 'Esta entrega ya tiene un conteo confirmado. No se puede sobrescribir.' USING ERRCODE='23514';
    END IF;
    SELECT id INTO v_diferencia_id
    FROM public.turno_diferencias
    WHERE declaracion_dinero_id=v_d.id
    ORDER BY created_at DESC
    LIMIT 1;
    RETURN jsonb_build_object(
      'declaracion_id',v_d.id,
      'estado',v_d.estado_aprobacion,
      'monto_declarado',v_d.monto,
      'monto_contado',v_d.monto_contado,
      'diferencia',v_d.diferencia,
      'diferencia_id',v_diferencia_id,
      'contado_por',v_d.contado_por,
      'contado_at',v_d.contado_at,
      'idempotente',true
    );
  END IF;

  IF coalesce(v_d.estado_aprobacion,'') NOT IN ('PENDIENTE','ESPERANDO_APROBACION') THEN
    RAISE EXCEPTION 'La declaración no está pendiente de conteo.' USING ERRCODE='23514';
  END IF;

  v_diferencia := round(v_contado-round(v_d.monto,2),2);

  UPDATE public.turno_declaraciones
  SET monto_contado=v_contado,
      contado_por=auth.uid(),
      contado_at=now(),
      observacion_conteo=v_obs,
      diferencia=v_diferencia,
      estado_aprobacion=CASE WHEN v_diferencia=0 THEN 'APROBADA' ELSE 'CON_DIFERENCIA' END,
      aprobado_por=CASE WHEN v_diferencia=0 THEN auth.uid() ELSE NULL END,
      aprobado_at=CASE WHEN v_diferencia=0 THEN now() ELSE NULL END
  WHERE id=v_d.id
  RETURNING * INTO v_d;

  IF v_diferencia<>0 THEN
    INSERT INTO public.turno_diferencias(
      turno_id,turno_sesion_id,categoria,referencia,esperado,declarado,diferencia,
      usuario_responsable,aprobado,comentario,declaracion_dinero_id
    )
    VALUES(
      v_d.turno_id,v_d.turno_sesion_id,'DINERO',
      'Entrega de dinero · declaración '||v_d.id::text,
      v_d.monto,v_contado,v_diferencia,
      v_d.usuario_id,false,v_obs,v_d.id
    )
    ON CONFLICT (declaracion_dinero_id) WHERE declaracion_dinero_id IS NOT NULL
    DO NOTHING;

    SELECT id INTO v_diferencia_id
    FROM public.turno_diferencias
    WHERE declaracion_dinero_id=v_d.id
    LIMIT 1;
  END IF;

  INSERT INTO public.turno_eventos(
    turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload
  )
  VALUES(
    v_d.turno_id,v_d.turno_sesion_id,v_d.turno_tramo_id,auth.uid(),
    'DINERO_CONTADO_POR_ADMIN',
    jsonb_build_object(
      'declaracion_id',v_d.id,'monto_declarado',v_d.monto,
      'monto_contado',v_contado,'diferencia',v_diferencia,
      'estado',v_d.estado_aprobacion,'diferencia_id',v_diferencia_id,
      'observacion',v_obs
    )
  );

  RETURN jsonb_build_object(
    'declaracion_id',v_d.id,
    'estado',v_d.estado_aprobacion,
    'monto_declarado',v_d.monto,
    'monto_contado',v_contado,
    'diferencia',v_diferencia,
    'diferencia_id',v_diferencia_id,
    'contado_por',v_d.contado_por,
    'contado_at',v_d.contado_at,
    'idempotente',false
  );
END;
$function$


-- An explicit owner review closes one retail Jornada. Once every worked session in the
-- Turn is complete, it reuses the existing Turn submission gate; final approval remains
-- the existing "Aprobar turno" action.
CREATE OR REPLACE FUNCTION public.bc7_finalizar_revision_jornada(
  p_turno_sesion_id uuid,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_t public.turno_tramos;
  v_checklist jsonb;
  v_liquidacion jsonb;
  v_turno_enviado boolean:=false;
  v_turno_aprobado boolean:=false;
  v_remaining integer;
  v_obs text:=nullif(left(btrim(coalesce(p_observacion,'')),1000),'');
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño puede aprobar la revisión final de la jornada.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde a una jornada válida.' USING ERRCODE='23503';
  END IF;
  IF v_s.estado='COMPLETADA' AND EXISTS(
    SELECT 1 FROM public.turno_jornada_eventos e
    WHERE e.programacion_id=v_s.jornada_programacion_id
      AND e.tipo='JORNADA_REVISION_DUENO_APROBADA'
  ) THEN
    RETURN jsonb_build_object('ok',true,'idempotente',true,'turno_sesion_id',v_s.id,'estado','COMPLETADA');
  END IF;
  IF v_s.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'La jornada debe estar EN_CURSO antes de la revisión final del Dueño.' USING ERRCODE='23514';
  END IF;

  v_checklist:=public.bc7_estado_checklist_jornada(v_s.id);
  IF NOT coalesce((v_checklist->>'gastos_completados')::boolean,false)
     OR NOT coalesce((v_checklist->>'reinversiones_completadas')::boolean,false)
     OR NOT coalesce((v_checklist->>'bajas_completadas')::boolean,false)
     OR NOT coalesce((v_checklist->>'inventario_final_confirmado')::boolean,false) THEN
    RAISE EXCEPTION 'Faltan pasos del checklist de Sheila o el inventario final.' USING ERRCODE='23514';
  END IF;
  IF NOT coalesce((v_checklist->>'efectivo_aprobado')::boolean,false) THEN
    RAISE EXCEPTION 'El Dueño debe contar y aprobar el efectivo final antes de cerrar la jornada.' USING ERRCODE='23514';
  END IF;

  v_liquidacion:=public.bc7_liquidacion_inventario_jornada(v_s.id);
  IF coalesce((v_liquidacion->>'calculable')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'La liquidación todavía no está calculable. Revisa aprobaciones, inventario, efectivo, salario y precios. Detalle: %',v_liquidacion
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_t FROM public.turno_tramos
  WHERE turno_sesion_id=v_s.id AND estado='ACTIVO'
  ORDER BY inicio_at DESC NULLS LAST,created_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;
  IF v_t.id IS NULL THEN
    RAISE EXCEPTION 'No hay un tramo activo para completar después de la revisión del Dueño.' USING ERRCODE='23514';
  END IF;

  UPDATE public.turno_tramos
  SET estado='COMPLETADO',fin_at=now()
  WHERE id=v_t.id;
  PERFORM set_config('app.bc7_owner_final_approval','on',true);
  UPDATE public.turno_sesiones
  SET estado='COMPLETADA',updated_at=now()
  WHERE id=v_s.id;
  UPDATE public.turnos
  SET estado='ABIERTO',estado_maestro='EN_CURSO',cierre_real=NULL,actualizado_en=now()
  WHERE id=v_s.turno_id;

  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
  VALUES(
    v_s.turno_id,v_s.id,v_t.id,auth.uid(),'SESION_CERRADA',
    jsonb_build_object('origen','REVISION_FINAL_DUENO','observacion',v_obs)
  );
  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(
    v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),'JORNADA_REVISION_DUENO_APROBADA',
    v_obs,jsonb_build_object('estado_sesion','EN_CURSO'),
    jsonb_build_object('estado_sesion','COMPLETADA','liquidacion',v_liquidacion,'observacion',v_obs)
  );

  SELECT count(*) INTO v_remaining
  FROM public.turno_sesiones s
  WHERE s.turno_id=v_s.turno_id AND s.estado NOT IN ('COMPLETADA','CANCELADA');
  IF v_remaining=0 THEN
    PERFORM public.bc_enviar_turno_a_aprobacion(v_s.turno_id);
    v_turno_enviado:=true;
    -- The same owner action includes the existing turn-level approval. This keeps
    -- the final observation in turno_revisiones and avoids a second redundant approval step.
    PERFORM public.bc_aprobar_turno(v_s.turno_id,v_obs);
    v_turno_aprobado:=true;
  END IF;

  RETURN jsonb_build_object(
    'ok',true,'idempotente',false,
    'turno_sesion_id',v_s.id,'estado','COMPLETADA',
    'turno_enviado_aprobacion',v_turno_enviado,
    'turno_aprobado',v_turno_aprobado,
    'liquidacion',v_liquidacion
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_finalizar_revision_jornada(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_finalizar_revision_jornada(uuid,text) TO authenticated;

-- Keep the owner/admin approval card concise and expose the actual unit cost per line.
CREATE OR REPLACE FUNCTION public.listar_aprobaciones_admin()
 RETURNS TABLE(tipo text, id uuid, fecha timestamp with time zone, usuario_nombre text, almacen_nombre text, producto_nombre text, resumen text, monto numeric, cantidad numeric, estado text, motivo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (
    public.tiene_permiso('auditoria','editar_any')
    OR public.tiene_permiso('gastos','editar_any')
    OR public.tiene_permiso('mermas','editar_any')
    OR public.tiene_permiso('bajas','editar_any')
    OR public.tiene_permiso('reinversiones','editar_any')
    OR public.tiene_permiso('entregas_caja','editar_any')
  ) THEN
    RAISE EXCEPTION 'Sin permiso para ver aprobaciones administrativas' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
    SELECT 'gasto'::text,g.id,g.creado_en,g.creado_nombre,a.nombre,NULL::text,
           g.concepto,g.monto,NULL::numeric,g.estado,g.descripcion
    FROM public.gastos g
    LEFT JOIN public.almacenes a ON a.id=g.almacen_id
    WHERE g.estado='PENDIENTE'
      AND (public.tiene_permiso('gastos','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT 'merma'::text,m.id,m.creado_en,m.creado_nombre,a.nombre,p.nombre,
           'Merma de inventario'::text,NULL::numeric,m.cantidad,m.estado,m.motivo
    FROM public.mermas m
    JOIN public.almacenes a ON a.id=m.almacen_id
    JOIN public.productos p ON p.id=m.producto_id
    WHERE m.estado='PENDIENTE'
      AND (public.tiene_permiso('mermas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'baja_lista'::text,
      s.id,
      s.creado_en,
      s.creado_nombre,
      a.nombre,
      ('Lista de bajas · '||count(b.id)||' productos')::text,
      'Solicitud agrupada de inventario'::text,
      NULL::numeric,
      sum(b.cantidad),
      'PENDIENTE'::text,
      s.motivo_general
    FROM public.bajas_solicitudes s
    JOIN public.almacenes a ON a.id=s.almacen_id
    JOIN public.bajas b ON b.solicitud_id=s.id AND b.estado='PENDIENTE'
    WHERE s.estado='PENDIENTE'
      AND (public.tiene_permiso('bajas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))
    GROUP BY s.id,s.creado_en,s.creado_nombre,a.nombre,s.motivo_general

    UNION ALL

    SELECT 'baja'::text,b.id,b.creado_en,b.creado_nombre,a.nombre,p.nombre,
           'Baja individual'::text,NULL::numeric,b.cantidad,b.estado,b.motivo
    FROM public.bajas b
    JOIN public.almacenes a ON a.id=b.almacen_id
    JOIN public.productos p ON p.id=b.producto_id
    WHERE b.estado='PENDIENTE'
      AND b.solicitud_id IS NULL
      AND (public.tiene_permiso('bajas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'reinversion'::text,r.id,r.fecha,r.usuario_nombre,a.nombre,
      (SELECT string_agg(p.nombre, ', ' ORDER BY p.nombre)
       FROM public.reinversiones_lineas rl JOIN public.productos p ON p.id=rl.producto_id
       WHERE rl.reinversion_id=r.id),
      coalesce((
        SELECT string_agg(
          trim(to_char(rl.cantidad_base,'FM999999990.###'))||' '||p.nombre||
          ' × '||trim(to_char(rl.costo_unitario,'FM999999990.##'))||' CUP',
          ' + ' ORDER BY p.nombre,rl.id
        )
        FROM public.reinversiones_lineas rl
        JOIN public.productos p ON p.id=rl.producto_id
        WHERE rl.reinversion_id=r.id
      ),'Reinversión')::text,
      r.total,
      (SELECT sum(rl.cantidad_base) FROM public.reinversiones_lineas rl WHERE rl.reinversion_id=r.id),
      r.estado,
      coalesce(r.proveedor,'')
    FROM public.reinversiones r
    JOIN public.almacenes a ON a.id=r.almacen_id
    WHERE r.estado='PENDIENTE'
      AND r.turno_sesion_id IS NOT NULL
      AND public.tiene_permiso('reinversiones','editar_any')

    UNION ALL

    SELECT 'entrega_diaria'::text,e.id,e.creado_en,e.creado_nombre,a.nombre,
           NULL::text,('Entrega diaria de efectivo · '||e.fecha::text)::text,
           e.monto_declarado,NULL::numeric,e.estado,e.observacion
    FROM public.turno_jornada_entregas_diarias e
    JOIN public.almacenes a ON a.id=e.almacen_id
    WHERE e.estado='PENDIENTE'
      AND public.tiene_permiso('entregas_caja','editar_any')

    UNION ALL

    SELECT
      'declaracion_jornada'::text,
      d.id,
      d.declarado_at,
      COALESCE(u.nombre,'')::text,
      a.nombre,
      NULL::text,
      ('Declaración final de efectivo · Día '||s.numero_dia::text)::text,
      d.monto,
      NULL::numeric,
      d.estado_aprobacion,
      s.estado::text
    FROM public.turno_declaraciones d
    JOIN public.turno_sesiones s ON s.id=d.turno_sesion_id
    JOIN public.almacenes a ON a.id=s.almacen_id
    LEFT JOIN public.usuarios u ON u.id=d.usuario_id
    WHERE s.bloque='JORNADA'
      AND d.estado_aprobacion IN ('PENDIENTE','ESPERANDO_APROBACION')
      AND d.monto_contado IS NULL
      AND (public.tiene_permiso('entregas_caja','editar_any')
        OR public.tiene_permiso('auditoria','editar_any'))

    ORDER BY 3 DESC;
END;
$function$


-- Preserve the current operational approval behavior while reusing the configured
-- warehouse minimum for reinvestment stock upserts.
CREATE OR REPLACE FUNCTION public.resolver_aprobacion_operativa(p_tipo text, p_id uuid, p_decision text, p_comentario text DEFAULT NULL::text, p_cantidad_real numeric DEFAULT NULL::numeric, p_monto_real numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_nombre text;
  v_alm uuid;
  v_prod uuid;
  v_cant numeric;
  v_cant_real numeric;
  v_monto numeric;
  v_estado text;
  v_reinversion public.reinversiones;
  v_entrega record;
  v_line record;
  v_stock_minimum numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE='42501';
  END IF;

  -- Authorization is per operation type; permission to approve expenses must
  -- not implicitly grant authority over inventory waste or write-offs.
  IF p_tipo='gasto' THEN
    IF NOT (public.tiene_permiso('auditoria','editar_any') OR public.tiene_permiso('gastos','editar_any')) THEN
      RAISE EXCEPTION 'Sin permiso para revisar gastos.' USING ERRCODE='42501';
    END IF;
  ELSIF p_tipo='merma' THEN
    IF NOT (public.tiene_permiso('auditoria','editar_any') OR public.tiene_permiso('mermas','editar_any')) THEN
      RAISE EXCEPTION 'Sin permiso para revisar mermas.' USING ERRCODE='42501';
    END IF;
  ELSIF p_tipo='baja' THEN
    IF NOT (public.tiene_permiso('auditoria','editar_any') OR public.tiene_permiso('bajas','editar_any')) THEN
      RAISE EXCEPTION 'Sin permiso para revisar bajas.' USING ERRCODE='42501';
    END IF;
  ELSIF p_tipo='reinversion' THEN
    IF NOT public.tiene_permiso('reinversiones','editar_any') THEN
      RAISE EXCEPTION 'Sin permiso para revisar reinversiones.' USING ERRCODE='42501';
    END IF;
  ELSIF p_tipo='entrega_diaria' THEN
    IF NOT public.tiene_permiso('entregas_caja','editar_any') THEN
      RAISE EXCEPTION 'Solo Dueño puede revisar entregas diarias de efectivo.' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de aprobación desconocido.';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('APROBAR','RECHAZAR') THEN
    RAISE EXCEPTION 'Decisión inválida.';
  END IF;
  IF p_decision='RECHAZAR' AND NULLIF(btrim(p_comentario),'') IS NULL THEN
    RAISE EXCEPTION 'El rechazo requiere un motivo.';
  END IF;

  SELECT nombre INTO v_nombre FROM public.usuarios WHERE id=auth.uid();

  IF p_tipo='gasto' THEN
    SELECT estado,monto INTO v_estado,v_monto
    FROM public.gastos WHERE id=p_id FOR UPDATE;
    IF v_estado IS NULL OR v_estado<>'PENDIENTE' THEN
      RAISE EXCEPTION 'Gasto no pendiente o inexistente.';
    END IF;
    IF p_decision='APROBAR' AND p_monto_real IS NOT NULL AND p_monto_real<=0 THEN
      RAISE EXCEPTION 'Monto real inválido.';
    END IF;
    UPDATE public.gastos
    SET monto=CASE WHEN p_decision='APROBAR' AND p_monto_real IS NOT NULL THEN p_monto_real ELSE monto END,
        estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADO' ELSE 'RECHAZADO' END,
        revisado_por=auth.uid(),
        revisado_nombre=v_nombre,
        comentario_revision=NULLIF(btrim(p_comentario),'') ||
          CASE WHEN p_decision='APROBAR' AND p_monto_real IS NOT NULL AND p_monto_real<>v_monto
            THEN ' | Monto declarado: '||v_monto::text||' | Monto aprobado: '||p_monto_real::text ELSE '' END,
        fecha_revision=now(), actualizado_en=now()
    WHERE id=p_id;

  ELSIF p_tipo IN ('merma','baja') THEN
    IF p_tipo='merma' THEN
      SELECT estado,almacen_id,producto_id,cantidad
      INTO v_estado,v_alm,v_prod,v_cant
      FROM public.mermas WHERE id=p_id FOR UPDATE;
    ELSE
      SELECT estado,almacen_id,producto_id,cantidad
      INTO v_estado,v_alm,v_prod,v_cant
      FROM public.bajas WHERE id=p_id FOR UPDATE;
    END IF;

    IF v_estado IS NULL OR v_estado<>'PENDIENTE' THEN
      RAISE EXCEPTION 'La solicitud de ajuste no está pendiente o no existe.';
    END IF;

    IF p_decision='APROBAR' THEN
      v_cant_real:=COALESCE(p_cantidad_real,v_cant);
      IF v_cant_real IS NULL OR v_cant_real<=0 OR v_cant_real>v_cant THEN
        RAISE EXCEPTION 'Cantidad real inválida; debe ser mayor que cero y no superar la cantidad solicitada.';
      END IF;
      -- Stock and FIFO lot depletion run in this same transaction.
      PERFORM public._aplicar_salida_aprobada(v_alm,v_prod,v_cant_real);
    END IF;

    IF p_tipo='merma' THEN
      UPDATE public.mermas
      SET cantidad=CASE WHEN p_decision='APROBAR' THEN v_cant_real ELSE cantidad END,
          estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
          revisado_por=auth.uid(), revisado_nombre=v_nombre,
          comentario_revision=NULLIF(btrim(p_comentario),'') ||
            CASE WHEN p_decision='APROBAR' AND v_cant_real<>v_cant
              THEN ' | Cantidad declarada: '||v_cant::text||' | Cantidad aprobada: '||v_cant_real::text ELSE '' END,
          fecha_revision=now(), actualizado_en=now()
      WHERE id=p_id;
    ELSE
      UPDATE public.bajas
      SET cantidad=CASE WHEN p_decision='APROBAR' THEN v_cant_real ELSE cantidad END,
          estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
          revisado_por=auth.uid(), revisado_nombre=v_nombre,
          comentario_revision=NULLIF(btrim(p_comentario),'') ||
            CASE WHEN p_decision='APROBAR' AND v_cant_real<>v_cant
              THEN ' | Cantidad declarada: '||v_cant::text||' | Cantidad aprobada: '||v_cant_real::text ELSE '' END,
          fecha_revision=now(), actualizado_en=now()
      WHERE id=p_id;
    END IF;
  ELSIF p_tipo='reinversion' THEN
    SELECT * INTO v_reinversion FROM public.reinversiones WHERE id=p_id FOR UPDATE;
    IF NOT FOUND OR v_reinversion.estado<>'PENDIENTE' THEN
      RAISE EXCEPTION 'La reinversión no está pendiente o no existe.' USING ERRCODE='23514';
    END IF;
    IF p_decision='APROBAR' THEN
      IF p_monto_real IS NOT NULL AND p_monto_real<>v_reinversion.total THEN
        RAISE EXCEPTION 'El importe debe aprobarse por el total informado; corrige la solicitud antes de aprobar.'
          USING ERRCODE='23514';
      END IF;
      FOR v_line IN
        SELECT rl.producto_id,rl.cantidad_base,rl.costo_unitario
        FROM public.reinversiones_lineas rl
        WHERE rl.reinversion_id=v_reinversion.id
        ORDER BY rl.id
      LOOP
        INSERT INTO public.lotes_compra
          (producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario,
           fecha_compra,origen,usuario_id,compra_id)
        VALUES
          (v_line.producto_id,v_reinversion.almacen_id,v_line.cantidad_base,
           v_line.cantidad_base,v_line.costo_unitario,v_reinversion.fecha,
           'reinversion',coalesce(v_reinversion.usuario_id,auth.uid()),NULL);
        -- Lock and reuse the warehouse's configured minimum before the BEFORE INSERT
        -- trigger runs. ON CONFLICT still increments only quantity and never overwrites
        -- the existing minimum. A product with no configured minimum remains blocked.
        v_stock_minimum:=NULL;
        SELECT s.minimo INTO v_stock_minimum
        FROM public.stock s
        WHERE s.producto_id=v_line.producto_id
          AND s.almacen_id=v_reinversion.almacen_id
        FOR UPDATE;
        INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
        VALUES(v_line.producto_id,v_reinversion.almacen_id,v_line.cantidad_base,coalesce(v_stock_minimum,0))
        ON CONFLICT(producto_id,almacen_id)
        DO UPDATE SET cantidad=public.stock.cantidad+excluded.cantidad,updated_at=now();
      END LOOP;
      PERFORM private.registrar_movimiento_caja(
        v_reinversion.almacen_id,v_reinversion.ciclo_id,v_reinversion.sesion_id,
        v_reinversion.turno_id,'REINVERSION','SALIDA',v_reinversion.total,
        'reinversion',v_reinversion.id,
        coalesce(nullif(trim(v_reinversion.proveedor),''),'Reinversión de inventario')
      );
    END IF;
    UPDATE public.reinversiones
    SET estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
        revisado_por=auth.uid(),revisado_nombre=v_nombre,
        comentario_revision=NULLIF(btrim(p_comentario),''),
        fecha_revision=now()
    WHERE id=p_id;
    IF v_reinversion.turno_sesion_id IS NOT NULL THEN
      INSERT INTO public.turno_jornada_eventos
        (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
      SELECT v_reinversion.almacen_id,s.jornada_programacion_id,auth.uid(),
        CASE WHEN p_decision='APROBAR' THEN 'REINVERSION_APROBADA' ELSE 'REINVERSION_RECHAZADA' END,
        NULLIF(btrim(p_comentario),''),
        jsonb_build_object('reinversion_id',p_id,'estado','PENDIENTE'),
        jsonb_build_object('reinversion_id',p_id,'estado',CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
          'stock_y_caja_aplicados',p_decision='APROBAR')
      FROM public.turno_sesiones s WHERE s.id=v_reinversion.turno_sesion_id;
    END IF;
  ELSIF p_tipo='entrega_diaria' THEN
    SELECT * INTO v_entrega
    FROM public.turno_jornada_entregas_diarias
    WHERE id=p_id FOR UPDATE;
    IF NOT FOUND OR v_entrega.estado<>'PENDIENTE' THEN
      RAISE EXCEPTION 'La entrega diaria no está pendiente o no existe.' USING ERRCODE='23514';
    END IF;
    IF p_decision='APROBAR' AND p_monto_real IS NOT NULL AND p_monto_real<0 THEN
      RAISE EXCEPTION 'El importe contado no puede ser negativo.' USING ERRCODE='22023';
    END IF;
    UPDATE public.turno_jornada_entregas_diarias
    SET estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
        monto_aprobado=CASE WHEN p_decision='APROBAR' THEN coalesce(p_monto_real,monto_declarado) ELSE NULL END,
        revisado_por=auth.uid(),revisado_nombre=v_nombre,
        comentario_revision=NULLIF(btrim(p_comentario),''),
        fecha_revision=now()
    WHERE id=p_id;
    INSERT INTO public.turno_jornada_eventos
      (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
    SELECT e.almacen_id,s.jornada_programacion_id,auth.uid(),
      CASE WHEN p_decision='APROBAR' THEN 'ENTREGA_DIARIA_APROBADA' ELSE 'ENTREGA_DIARIA_RECHAZADA' END,
      NULLIF(btrim(p_comentario),''),
      jsonb_build_object('entrega_id',p_id,'fecha',e.fecha,'monto_declarado',e.monto_declarado,'estado','PENDIENTE'),
      jsonb_build_object('entrega_id',p_id,'monto_aprobado',CASE WHEN p_decision='APROBAR' THEN coalesce(p_monto_real,e.monto_declarado) ELSE NULL END,
        'estado',CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END)
    FROM public.turno_jornada_entregas_diarias e
    JOIN public.turno_sesiones s ON s.id=e.turno_sesion_id
    WHERE e.id=p_id;
  END IF;

  RETURN jsonb_build_object('ok',true,'tipo',p_tipo,'id',p_id,'decision',p_decision,'revisado_por',v_nombre);
END;
$function$


COMMIT;
