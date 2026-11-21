BEGIN;

-- An operational seal is intentionally separate from a reconciled completion.
ALTER TABLE public.turno_sesiones
  ADD COLUMN IF NOT EXISTS cierre_operativo_at timestamptz,
  ADD COLUMN IF NOT EXISTS corte_operativo_at timestamptz,
  ADD COLUMN IF NOT EXISTS cierre_operativo_origen text,
  ADD COLUMN IF NOT EXISTS cierre_operativo_por uuid,
  ADD COLUMN IF NOT EXISTS cierre_operativo_motivo text;

ALTER TABLE public.turno_sesiones
  DROP CONSTRAINT IF EXISTS turno_sesiones_estado_check;
ALTER TABLE public.turno_sesiones
  ADD CONSTRAINT turno_sesiones_estado_check
  CHECK (estado = ANY (ARRAY[
    'PENDIENTE'::text,'PROGRAMADA'::text,'EN_CURSO'::text,
    'INTERRUMPIDA'::text,'CERRADA_OPERATIVAMENTE'::text,
    'COMPLETADA'::text,'CANCELADA'::text
  ]));

CREATE INDEX IF NOT EXISTS turno_sesiones_operational_seal_idx
  ON public.turno_sesiones (almacen_id, estado, corte_operativo_at)
  WHERE bloque='JORNADA';

CREATE OR REPLACE FUNCTION public.bc5_cerrar_jornadas_operativas_vencidas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_t public.turno_tramos;
  v_cutoff timestamptz;
  v_sealed_at timestamptz;
  v_count integer := 0;
BEGIN
  v_sealed_at := clock_timestamp();

  FOR v_s IN
    SELECT s.*
    FROM public.turno_sesiones s
    JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
    JOIN public.almacenes a ON a.id=s.almacen_id
    WHERE s.bloque='JORNADA'
      AND s.estado='EN_CURSO'
      AND a.tipo='minorista'
      AND ((coalesce(p.fecha_fin,p.fecha)::timestamp + p.hora_fin_prevista)
          AT TIME ZONE coalesce(nullif(p.zona_horaria,''),'America/Havana')) <= v_sealed_at
      AND EXISTS (
        SELECT 1 FROM public.turno_tramos t
        WHERE t.turno_sesion_id=s.id AND t.estado='ACTIVO'
      )
    ORDER BY
      ((coalesce(p.fecha_fin,p.fecha)::timestamp + p.hora_fin_prevista)
        AT TIME ZONE coalesce(nullif(p.zona_horaria,''),'America/Havana')),
      s.id
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    SELECT * INTO v_p
    FROM public.turno_jornada_programacion
    WHERE id=v_s.jornada_programacion_id;

    v_cutoff := (coalesce(v_p.fecha_fin,v_p.fecha)::timestamp + v_p.hora_fin_prevista)
      AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana');

    SELECT * INTO v_t
    FROM public.turno_tramos
    WHERE turno_sesion_id=v_s.id AND estado='ACTIVO'
    ORDER BY inicio_at DESC NULLS LAST,created_at DESC NULLS LAST
    LIMIT 1
    FOR UPDATE;

    IF v_t.id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.turno_tramos
    SET estado='COMPLETADO',fin_at=v_cutoff
    WHERE id=v_t.id AND estado='ACTIVO';

    UPDATE public.turno_sesiones
    SET estado='CERRADA_OPERATIVAMENTE',
        cierre_operativo_at=v_sealed_at,
        corte_operativo_at=v_cutoff,
        cierre_operativo_origen='AUTO_HORA_FIN',
        cierre_operativo_por=NULL,
        cierre_operativo_motivo=NULL,
        updated_at=v_sealed_at
    WHERE id=v_s.id AND estado='EN_CURSO';

    IF FOUND THEN
      INSERT INTO public.turno_eventos
        (turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
      VALUES
        (v_s.turno_id,v_s.id,v_t.id,NULL,'JORNADA_CERRADA_OPERATIVAMENTE',
         jsonb_build_object(
           'actor','SYSTEM',
           'origen','AUTO_HORA_FIN',
           'corte_operativo_at',v_cutoff,
           'cierre_operativo_at',v_sealed_at,
           'zona_horaria',v_p.zona_horaria,
           'hora_fin_prevista',v_p.hora_fin_prevista,
           'inventario_final_confirmado',false,
           'declaracion_efectivo_creada',false,
           'conciliacion_completada',false
         ));
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc5_cerrar_jornadas_operativas_vencidas() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bc5_cerrar_jornadas_operativas_vencidas() TO service_role;

CREATE OR REPLACE FUNCTION public.bc5_cerrar_jornada_operativa(
  p_turno_sesion_id uuid,
  p_motivo_excepcion text DEFAULT NULL
)
RETURNS public.turno_sesiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_t public.turno_tramos;
  v_almacen_tipo text;
  v_now timestamptz := clock_timestamp();
  v_cutoff timestamptz;
  v_reason text := nullif(left(btrim(coalesce(p_motivo_excepcion,'')),1000),'');
  v_result public.turno_sesiones;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;

  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde a una Jornada única.' USING ERRCODE='23503';
  END IF;
  IF v_s.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'La jornada ya no está operativamente en curso.' USING ERRCODE='23514';
  END IF;

  SELECT tipo INTO v_almacen_tipo
  FROM public.almacenes
  WHERE id=v_s.almacen_id;
  IF v_almacen_tipo IS DISTINCT FROM 'minorista' THEN
    RAISE EXCEPTION 'El cierre operativo de Jornada solo aplica a almacenes minoristas.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_p
  FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la programación de la Jornada.' USING ERRCODE='23503';
  END IF;

  IF NOT public.bc_actor_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_s.id
      AND a.usuario_id=auth.uid()
      AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado o ADMIN puede sellar operativamente esta Jornada.' USING ERRCODE='42501';
  END IF;

  v_cutoff := (coalesce(v_p.fecha_fin,v_p.fecha)::timestamp + v_p.hora_fin_prevista)
    AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana');

  IF v_now < v_cutoff AND v_reason IS NULL THEN
    RAISE EXCEPTION 'El cierre es anterior a la hora programada. Escribe el motivo de la excepción.' USING ERRCODE='23514';
  END IF;
  IF v_now < v_cutoff THEN
    v_cutoff := v_now;
  END IF;

  SELECT * INTO v_t
  FROM public.turno_tramos
  WHERE turno_sesion_id=v_s.id AND estado='ACTIVO'
  ORDER BY inicio_at DESC NULLS LAST,created_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF v_t.id IS NULL THEN
    RAISE EXCEPTION 'No existe un tramo operativo activo para sellar.' USING ERRCODE='23514';
  END IF;

  UPDATE public.turno_tramos
  SET estado='COMPLETADO',fin_at=v_cutoff
  WHERE id=v_t.id AND estado='ACTIVO';

  UPDATE public.turno_sesiones
  SET estado='CERRADA_OPERATIVAMENTE',
      cierre_operativo_at=v_now,
      corte_operativo_at=v_cutoff,
      cierre_operativo_origen='MANUAL',
      cierre_operativo_por=auth.uid(),
      cierre_operativo_motivo=v_reason,
      updated_at=v_now
  WHERE id=v_s.id
  RETURNING * INTO v_result;

  INSERT INTO public.turno_eventos
    (turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
  VALUES
    (v_s.turno_id,v_s.id,v_t.id,auth.uid(),'JORNADA_CERRADA_OPERATIVAMENTE',
     jsonb_build_object(
       'actor','USER',
       'origen','MANUAL',
       'corte_operativo_at',v_cutoff,
       'cierre_operativo_at',v_now,
       'zona_horaria',v_p.zona_horaria,
       'hora_fin_prevista',v_p.hora_fin_prevista,
       'motivo',v_reason,
       'inventario_final_confirmado',false,
       'declaracion_efectivo_creada',false,
       'conciliacion_completada',false
     ));

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc5_cerrar_jornada_operativa(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc5_cerrar_jornada_operativa(uuid,text) TO authenticated;

-- Keep the provenance of a next-Jornada physical initial count when it is
-- reused as the previous operationally-sealed Jornada's final count.
ALTER TABLE public.turno_jornada_inventario_cortes
  ADD COLUMN IF NOT EXISTS corte_sucesora_origen_id uuid
    REFERENCES public.turno_jornada_inventario_cortes(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.turno_jornada_inventario_cortes.corte_sucesora_origen_id IS
'For a FINAL cut, points to the actual INITIAL physical count of the next Jornada when no stock movements occurred between the prior operational cutoff and that count.';

CREATE OR REPLACE FUNCTION public.bc5_admin_transcribir_declaracion_dinero(
  p_turno_sesion_id uuid,
  p_monto numeric,
  p_observacion text
)
RETURNS public.turno_declaraciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_t public.turno_tramos;
  v_declaration public.turno_declaraciones;
  v_note text:=nullif(left(btrim(coalesce(p_observacion,'')),1000),'');
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede transcribir una declaración después del sello operativo.' USING ERRCODE='42501';
  END IF;
  IF p_monto IS NULL OR p_monto<0 THEN
    RAISE EXCEPTION 'El importe declarado debe ser un número no negativo.' USING ERRCODE='22023';
  END IF;
  IF v_note IS NULL OR length(v_note)<5 THEN
    RAISE EXCEPTION 'Indica la fuente o motivo de la transcripción (mínimo 5 caracteres).' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id AND bloque='JORNADA'
    AND estado='CERRADA_OPERATIVAMENTE'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo se puede transcribir la declaración de una Jornada sellada operativamente.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_t
  FROM public.turno_tramos
  WHERE turno_sesion_id=v_s.id AND estado='COMPLETADO'
  ORDER BY fin_at DESC NULLS LAST,created_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;
  IF v_t.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el tramo responsable de esta Jornada.' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.turno_declaraciones d WHERE d.turno_tramo_id=v_t.id) THEN
    RAISE EXCEPTION 'Este tramo ya tiene una declaración. No se sobrescribe; usa el procedimiento de rectificación autorizado.' USING ERRCODE='23505';
  END IF;

  INSERT INTO public.turno_declaraciones
    (turno_id,turno_sesion_id,turno_tramo_id,usuario_id,monto)
  VALUES
    (v_s.turno_id,v_s.id,v_t.id,v_t.usuario_id,p_monto)
  RETURNING * INTO v_declaration;

  INSERT INTO public.turno_eventos
    (turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
  VALUES
    (v_s.turno_id,v_s.id,v_t.id,auth.uid(),'DINERO_DECLARACION_TRANSCRITA_ADMIN',
     jsonb_build_object(
       'declaracion_id',v_declaration.id,
       'monto_declarado',p_monto,
       'responsable_id',v_t.usuario_id,
       'transcrito_por',auth.uid(),
       'fuente_observacion',v_note,
       'es_conteo_fisico',false
     ));

  RETURN v_declaration;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc5_admin_transcribir_declaracion_dinero(uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc5_admin_transcribir_declaracion_dinero(uuid,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc5_vincular_inicial_sucesora_como_final_anterior(
  p_turno_sesion_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_old public.turno_sesiones;
  v_next public.turno_sesiones;
  v_initial public.turno_jornada_inventario_cortes;
  v_existing public.turno_jornada_inventario_cortes;
  v_final_id uuid;
  v_note text:=nullif(left(btrim(coalesce(p_motivo,'')),1000),'');
  v_movement_exists boolean:=false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede vincular el conteo físico entre Jornadas.' USING ERRCODE='42501';
  END IF;
  IF v_note IS NULL OR length(v_note)<5 THEN
    RAISE EXCEPTION 'Explica por qué se vincula el conteo inicial siguiente como inventario final anterior.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_old
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id AND bloque='JORNADA'
    AND estado='CERRADA_OPERATIVAMENTE'
    AND corte_operativo_at IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La Jornada anterior debe estar sellada operativamente antes de vincular inventarios.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_existing
  FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_old.id AND tipo='FINAL';
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'idempotente',true,'corte_final_id',v_existing.id,
      'origen_corte_sucesora_id',v_existing.corte_sucesora_origen_id);
  END IF;

  SELECT s.* INTO v_next
  FROM public.turno_sesiones s
  JOIN public.turno_jornada_inventario_cortes c
    ON c.turno_sesion_id=s.id AND c.tipo='INICIAL' AND c.estado='CONFIRMADO'
  WHERE s.almacen_id=v_old.almacen_id
    AND s.bloque='JORNADA'
    AND s.id<>v_old.id
    AND s.fecha>v_old.fecha
    AND c.confirmado_en>=v_old.corte_operativo_at
  ORDER BY c.confirmado_en ASC,s.fecha ASC,s.id
  LIMIT 1
  FOR UPDATE OF s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe un conteo inicial físico confirmado en la siguiente Jornada.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_initial
  FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_next.id AND tipo='INICIAL' AND estado='CONFIRMADO'
  FOR SHARE;

  IF v_initial.id IS NULL OR v_initial.confirmado_por IS NULL THEN
    RAISE EXCEPTION 'El conteo inicial sucesor no tiene evidencia física confirmada.' USING ERRCODE='23514';
  END IF;

  -- Do not infer the prior closing stock if any stock-changing activity occurred
  -- after its operational cutoff and before the successor's actual physical count.
  SELECT EXISTS (
    SELECT 1 FROM public.transferencias t
    WHERE (t.almacen_origen_id=v_old.almacen_id OR t.almacen_destino_id=v_old.almacen_id)
      AND t.fecha>v_old.corte_operativo_at AND t.fecha<=v_initial.confirmado_en
    UNION ALL
    SELECT 1 FROM public.lotes_compra lc
    WHERE lc.almacen_id=v_old.almacen_id
      AND lc.fecha_compra>v_old.corte_operativo_at AND lc.fecha_compra<=v_initial.confirmado_en
    UNION ALL
    SELECT 1 FROM public.ventas v
    WHERE v.almacen_id=v_old.almacen_id
      AND v.fecha>v_old.corte_operativo_at AND v.fecha<=v_initial.confirmado_en
    UNION ALL
    SELECT 1 FROM public.vales_salida vs
    WHERE vs.almacen_id=v_old.almacen_id
      AND vs.fecha>v_old.corte_operativo_at AND vs.fecha<=v_initial.confirmado_en
    UNION ALL
    SELECT 1 FROM public.mermas mm
    WHERE mm.almacen_id=v_old.almacen_id
      AND coalesce(mm.fecha_revision,mm.actualizado_en,mm.creado_en)>v_old.corte_operativo_at
      AND coalesce(mm.fecha_revision,mm.actualizado_en,mm.creado_en)<=v_initial.confirmado_en
    UNION ALL
    SELECT 1 FROM public.bajas bb
    WHERE bb.almacen_id=v_old.almacen_id
      AND coalesce(bb.fecha_revision,bb.actualizado_en,bb.creado_en)>v_old.corte_operativo_at
      AND coalesce(bb.fecha_revision,bb.actualizado_en,bb.creado_en)<=v_initial.confirmado_en
    UNION ALL
    SELECT 1 FROM public.reinversiones r
    WHERE r.almacen_id=v_old.almacen_id
      AND r.fecha>v_old.corte_operativo_at AND r.fecha<=v_initial.confirmado_en
  ) INTO v_movement_exists;

  IF v_movement_exists THEN
    RAISE EXCEPTION 'No se puede vincular automáticamente: hubo movimientos de stock entre el sello de la Jornada anterior y el conteo físico inicial siguiente. Requiere conciliación histórica manual.' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.turno_jornada_inventario_cortes
    (turno_sesion_id,tipo,estado,creado_por,confirmado_por,confirmado_en,
     observacion,corte_sucesora_origen_id)
  VALUES
    (v_old.id,'FINAL','CONFIRMADO',auth.uid(),v_initial.confirmado_por,
     v_initial.confirmado_en,
     'Conteo físico inicial de la Jornada sucesora vinculado por ADMIN. Hora real del conteo: '||
       v_initial.confirmado_en::text||'. No hubo movimientos de stock registrados desde el corte operativo anterior. Motivo: '||v_note,
     v_initial.id)
  RETURNING id INTO v_final_id;

  INSERT INTO public.turno_jornada_inventario_lineas
    (corte_id,producto_id,cantidad_contada,stock_sistema)
  SELECT v_final_id,l.producto_id,l.cantidad_contada,l.stock_sistema
  FROM public.turno_jornada_inventario_lineas l
  WHERE l.corte_id=v_initial.id;

  INSERT INTO public.turno_eventos
    (turno_id,turno_sesion_id,actor_user_id,tipo,payload)
  VALUES
    (v_old.turno_id,v_old.id,auth.uid(),'JORNADA_FINAL_VINCULADO_A_INICIAL_SUcesORA',
     jsonb_build_object(
       'corte_final_id',v_final_id,
       'corte_inicial_origen_id',v_initial.id,
       'sesion_sucesora_id',v_next.id,
       'conteo_fisico_at',v_initial.confirmado_en,
       'corte_operativo_anterior_at',v_old.corte_operativo_at,
       'sin_movimientos_stock_intermedios',true,
       'motivo',v_note
     ));

  RETURN jsonb_build_object('ok',true,'idempotente',false,'corte_final_id',v_final_id,
    'corte_inicial_origen_id',v_initial.id,'sesion_sucesora_id',v_next.id,
    'conteo_fisico_at',v_initial.confirmado_en);
END;
$function$;

REVOKE ALL ON FUNCTION public.bc5_vincular_inicial_sucesora_como_final_anterior(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc5_vincular_inicial_sucesora_como_final_anterior(uuid,text) TO authenticated;

-- Install a one-minute database scheduler where pg_cron is available.
-- The next-start fallback below still seals overdue sessions if the scheduler is absent.
DO $schedule$
DECLARE
  v_job bigint;
BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
      EXECUTE 'CREATE EXTENSION pg_cron';
    END IF;
    IF to_regnamespace('cron') IS NOT NULL THEN
      FOR v_job IN EXECUTE
        'SELECT jobid FROM cron.job WHERE jobname = $1'
        USING 'battlecruiser-jornada-operational-seal'
      LOOP
        EXECUTE 'SELECT cron.unschedule($1)' USING v_job;
      END LOOP;
      EXECUTE 'SELECT cron.schedule($1,$2,$3)'
        USING 'battlecruiser-jornada-operational-seal','* * * * *',
              'SELECT public.bc5_cerrar_jornadas_operativas_vencidas();';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron no quedó programado; el cierre de respaldo al iniciar Jornada permanece activo. %',SQLERRM;
  END;
END;
$schedule$;

-- Bind only the destination side when the destination warehouse is retail.
-- Almacen Casa (almacenamiento) intentionally receives no Jornada link.
CREATE OR REPLACE FUNCTION public.bc7_vincular_transferencia_jornada_destino_minorista()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_session_id uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.id INTO v_session_id
  FROM public.turno_sesiones s
  JOIN public.almacenes a ON a.id=s.almacen_id
  WHERE s.almacen_id=NEW.almacen_destino_id
    AND a.tipo='minorista'
    AND s.bloque='JORNADA'
    AND s.jornada_programacion_id IS NOT NULL
    AND s.estado='EN_CURSO'
  ORDER BY s.fecha DESC,s.numero_dia DESC
  LIMIT 1;

  IF v_session_id IS NOT NULL THEN
    INSERT INTO public.turno_jornada_entradas_vinculadas
      (turno_sesion_id,transferencia_id,vinculado_por)
    VALUES (v_session_id,NEW.id,v_actor)
    ON CONFLICT (transferencia_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bc7_vincular_transferencia_jornada_destino_minorista
  ON public.transferencias;
CREATE TRIGGER trg_bc7_vincular_transferencia_jornada_destino_minorista
AFTER INSERT ON public.transferencias
FOR EACH ROW
EXECUTE FUNCTION public.bc7_vincular_transferencia_jornada_destino_minorista();

-- Keep transfer attribution restricted to the warehouse leg that can have a Jornada.
-- This never creates a Jornada association for Almacen Casa.
COMMENT ON FUNCTION public.bc7_vincular_transferencia_jornada_destino_minorista() IS
'Links only an active retail destination Jornada for incoming transfers. Storage warehouses never receive Jornada links.';

-- Preserve the legacy start guard but allow a prior session already sealed operationally.
-- Starting a new session first applies the overdue seal fallback in case pg_cron was unavailable.
DO $patch_start$
DECLARE
  v_def text;
  v_old text;
BEGIN
  SELECT pg_get_functiondef('public.bc5_iniciar_jornada(uuid,text)'::regprocedure) INTO v_def;

  v_old := '  SELECT * INTO v_sesion FROM public.turno_sesiones' || E'\n' ||
           '  WHERE id=p_turno_sesion_id FOR UPDATE;';
  IF strpos(v_def,'PERFORM public.bc5_cerrar_jornadas_operativas_vencidas();')=0 THEN
    IF strpos(v_def,v_old)=0 THEN
      RAISE EXCEPTION 'No se pudo localizar el inicio de bc5_iniciar_jornada para instalar el fallback.';
    END IF;
    v_def := replace(v_def,v_old,
      '  PERFORM public.bc5_cerrar_jornadas_operativas_vencidas();' || E'\n' || v_old);
  END IF;

  v_old := 'AND s.estado NOT IN (''COMPLETADA'',''CANCELADA'')';
  IF strpos(v_def,v_old)=0 THEN
    RAISE EXCEPTION 'No se pudo localizar el bloqueo de jornada anterior en bc5_iniciar_jornada.';
  END IF;
  v_def := replace(v_def,v_old,
    'AND s.estado NOT IN (''COMPLETADA'',''CANCELADA'',''CERRADA_OPERATIVAMENTE'')');

  v_old := '  IF EXISTS (SELECT 1 FROM public.turno_tramos t WHERE t.usuario_id=auth.uid() AND t.estado=''ACTIVO'') THEN';
  IF strpos(v_def,'Una jornada operativa anterior sigue activa para este almacén.')=0 THEN
    IF strpos(v_def,v_old)=0 THEN
      RAISE EXCEPTION 'No se pudo localizar el guard de tramo activo en bc5_iniciar_jornada.';
    END IF;
    v_def := replace(v_def,v_old,
      '  IF EXISTS (' || E'\n' ||
      '    SELECT 1 FROM public.turno_sesiones s' || E'\n' ||
      '    JOIN public.turno_tramos t ON t.turno_sesion_id=s.id' || E'\n' ||
      '    WHERE s.almacen_id=v_sesion.almacen_id AND s.id<>v_sesion.id' || E'\n' ||
      '      AND s.bloque=''JORNADA'' AND s.estado=''EN_CURSO'' AND t.estado=''ACTIVO''' || E'\n' ||
      '  ) THEN' || E'\n' ||
      '    RAISE EXCEPTION ''Una jornada operativa anterior sigue activa para este almacén.'' USING ERRCODE=''23505'';' || E'\n' ||
      '  END IF;' || E'\n' || v_old);
  END IF;

  EXECUTE v_def;
END;
$patch_start$;

-- A sealed session can be counted by the Owner after the 5-step evidence is complete.
-- ADMIN can attest the three documentary blocks after an operational seal.
-- Pending expense/reinvestment/baja/merma records must still be resolved first.
DO $patch_owner_checklist$
DECLARE
  v_def text;
  v_old text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_confirmar_bloque_jornada(uuid,text,boolean)'::regprocedure) INTO v_def;

  v_old := '  v_tramo:=public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);' || E'\n' ||
           '  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;';
  IF strpos(v_def,'Owner ADMIN confirms sealed Jornada blocks')=0 THEN
    IF strpos(v_def,v_old)=0 THEN
      RAISE EXCEPTION 'No se pudo adaptar bc7_confirmar_bloque_jornada al sello operativo.';
    END IF;
    v_def := replace(v_def,v_old,
      '  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;' || E'\n' ||
      '  IF NOT FOUND THEN RAISE EXCEPTION ''La Jornada no existe.'' USING ERRCODE=''23503''; END IF;' || E'\n' ||
      '  IF v_s.estado=''CERRADA_OPERATIVAMENTE'' THEN' || E'\n' ||
      '    IF NOT public.bc_actor_is_admin() THEN RAISE EXCEPTION ''Solo ADMIN puede confirmar bloques después del sello operativo.'' USING ERRCODE=''42501''; END IF;' || E'\n' ||
      '    SELECT * INTO v_tramo FROM public.turno_tramos WHERE turno_sesion_id=v_s.id AND estado=''COMPLETADO'' ORDER BY fin_at DESC NULLS LAST LIMIT 1;' || E'\n' ||
      '    IF v_tramo.id IS NULL THEN RAISE EXCEPTION ''No se encontró el tramo de la Jornada sellada.'' USING ERRCODE=''23514''; END IF;' || E'\n' ||
      '  ELSE' || E'\n' ||
      '    v_tramo:=public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);' || E'\n' ||
      '  END IF;');
    v_def := replace(v_def,
      '  INSERT INTO public.turno_jornada_confirmaciones(turno_sesion_id)' || E'\n' ||
      '  VALUES(p_turno_sesion_id)',
      '  IF p_completado AND v_s.estado=''CERRADA_OPERATIVAMENTE'' THEN' || E'\n' ||
      '    IF v_tipo=''gastos'' AND EXISTS(SELECT 1 FROM public.gastos g WHERE g.turno_sesion_id=v_s.id AND g.estado=''PENDIENTE'') THEN RAISE EXCEPTION ''Todavía hay gastos pendientes de revisión.'' USING ERRCODE=''23514''; END IF;' || E'\n' ||
      '    IF v_tipo=''reinversiones'' AND EXISTS(SELECT 1 FROM public.reinversiones r WHERE r.turno_sesion_id=v_s.id AND r.estado=''PENDIENTE'') THEN RAISE EXCEPTION ''Todavía hay reinversiones pendientes de revisión.'' USING ERRCODE=''23514''; END IF;' || E'\n' ||
      '    IF v_tipo=''bajas'' AND (EXISTS(SELECT 1 FROM public.bajas b WHERE b.turno_sesion_id=v_s.id AND b.estado=''PENDIENTE'') OR EXISTS(SELECT 1 FROM public.mermas m WHERE m.turno_sesion_id=v_s.id AND m.estado=''PENDIENTE'')) THEN RAISE EXCEPTION ''Todavía hay bajas o mermas pendientes de revisión.'' USING ERRCODE=''23514''; END IF;' || E'\n' ||
      '  END IF;' || E'\n' ||
      '  INSERT INTO public.turno_jornada_confirmaciones(turno_sesion_id)' || E'\n' ||
      '  VALUES(p_turno_sesion_id)');
  END IF;

  EXECUTE v_def;
END;
$patch_owner_checklist$;

DO $patch_cash$
DECLARE
  v_def text;
  v_old text := 'IF v_s.estado<>''COMPLETADA'' THEN';
BEGIN
  SELECT pg_get_functiondef('public.bc5_contar_dinero_entregado(uuid,numeric,text)'::regprocedure) INTO v_def;
  IF strpos(v_def,v_old)>0 THEN
    v_def := replace(v_def,v_old,
      'IF v_s.estado NOT IN (''COMPLETADA'',''CERRADA_OPERATIVAMENTE'') THEN');
    EXECUTE v_def;
  ELSIF strpos(v_def,'CERRADA_OPERATIVAMENTE')=0 THEN
    RAISE EXCEPTION 'No se pudo adaptar el control de estado del conteo de efectivo.';
  END IF;
END;
$patch_cash$;

-- Keep the checklist and Owner approval lifecycle separate from operational sealing.
DO $patch_checklist$
DECLARE
  v_def text;
  v_old text := 'WHEN v_s.estado<>''COMPLETADA'' THEN ''LISTA_PARA_ENTREGA''';
BEGIN
  SELECT pg_get_functiondef('public.bc7_estado_confirmaciones_jornada(uuid)'::regprocedure) INTO v_def;
  IF strpos(v_def,v_old)>0 THEN
    v_def := replace(v_def,v_old,
      'WHEN v_s.estado NOT IN (''COMPLETADA'',''CERRADA_OPERATIVAMENTE'') THEN ''LISTA_PARA_ENTREGA''');
    EXECUTE v_def;
  ELSIF strpos(v_def,'CERRADA_OPERATIVAMENTE')=0 THEN
    RAISE EXCEPTION 'No se pudo adaptar la fase del checklist de Jornada.';
  END IF;
END;
$patch_checklist$;

-- ADMIN can complete the normal reconciliation checklist for a session that was
-- operationally sealed. Only after the full liquidation is calculable is it promoted
-- to COMPLETADA; the existing final turn approval remains unchanged.
DO $patch_owner_review$
DECLARE
  v_def text;
  v_old text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_resolver_revision_jornada(uuid,text,text)'::regprocedure) INTO v_def;

  v_old := 'IF v_s.estado NOT IN (''COMPLETADA'',''CANCELADA'') THEN';
  IF strpos(v_def,v_old)=0 THEN
    RAISE EXCEPTION 'No se pudo localizar el guard de sesión en bc7_resolver_revision_jornada.';
  END IF;
  v_def := replace(v_def,v_old,
    'IF v_s.estado NOT IN (''COMPLETADA'',''CANCELADA'',''CERRADA_OPERATIVAMENTE'') THEN');

  v_old := 'IF v_s.estado=''COMPLETADA'' THEN';
  IF strpos(v_def,v_old)=0 THEN
    RAISE EXCEPTION 'No se pudo localizar la liquidación de sesión en bc7_resolver_revision_jornada.';
  END IF;
  v_def := replace(v_def,v_old,
    'IF v_s.estado IN (''COMPLETADA'',''CERRADA_OPERATIVAMENTE'') THEN');

  v_old := '      IF coalesce((v_liq->>''calculable'')::boolean,false) IS NOT TRUE THEN' || E'\n' ||
           '        RAISE EXCEPTION ''La liquidación del día % no está completa. Revisa precios, movimientos, inventario, salario y efectivo. Detalle: %'',' || E'\n' ||
           '          v_s.numero_dia,v_liq USING ERRCODE=''23514'';' || E'\n' ||
           '      END IF;';
  IF strpos(v_def,'JORNADA_CONCILIADA_POST_CIERRE_OPERATIVO')=0 THEN
    IF strpos(v_def,v_old)=0 THEN
      RAISE EXCEPTION 'No se pudo localizar el cierre de liquidación en bc7_resolver_revision_jornada.';
    END IF;
    v_def := replace(v_def,v_old,
      v_old || E'\n' ||
      '      IF v_s.estado=''CERRADA_OPERATIVAMENTE'' THEN' || E'\n' ||
      '        UPDATE public.turno_sesiones SET estado=''COMPLETADA'',updated_at=now() WHERE id=v_s.id;' || E'\n' ||
      '        INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)' || E'\n' ||
      '        VALUES(v_s.turno_id,v_s.id,auth.uid(),''JORNADA_CONCILIADA_POST_CIERRE_OPERATIVO'',' || E'\n' ||
      '          jsonb_build_object(''corte_operativo_at'',v_s.corte_operativo_at,''conciliado_at'',now()));' || E'\n' ||
      '      END IF;');
  END IF;

  EXECUTE v_def;
END;
$patch_owner_review$;

-- Late entry after operational sealing is allowed only while the master Turn
-- remains open. The original responsable and exact completed tranche stay bound
-- to the Jornada; no physical count, cash declaration or approval is inferred.
CREATE OR REPLACE FUNCTION public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id uuid)
RETURNS public.turno_tramos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_t public.turno_tramos;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF NOT public.tiene_permiso('turnos','ver') THEN
    RAISE EXCEPTION 'No tienes permiso para operar dentro de jornadas.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL
     OR v_s.estado NOT IN ('EN_CURSO','CERRADA_OPERATIVAMENTE') THEN
    RAISE EXCEPTION 'La operación solo se permite dentro de una Jornada en curso o sellada pendiente de conciliación.' USING ERRCODE='23514';
  END IF;
  IF v_s.estado='CERRADA_OPERATIVAMENTE' AND NOT EXISTS (
    SELECT 1 FROM public.turnos t WHERE t.id=v_s.turno_id AND t.estado='ABIERTO'
  ) THEN
    RAISE EXCEPTION 'El Turno maestro ya no está abierto; no se admiten registros tardíos.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id FOR SHARE;
  IF NOT FOUND OR v_p.responsable_id IS DISTINCT FROM auth.uid()
     OR NOT EXISTS (
       SELECT 1 FROM public.turno_asignaciones a
       WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
     ) THEN
    RAISE EXCEPTION 'Solo la responsable asignada actualmente puede registrar operaciones en esta Jornada.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_t FROM public.turno_tramos
  WHERE turno_sesion_id=v_s.id AND usuario_id=auth.uid()
    AND (
      (v_s.estado='EN_CURSO' AND estado='ACTIVO')
      OR (v_s.estado='CERRADA_OPERATIVAMENTE' AND estado='COMPLETADO'
          AND fin_at=v_s.corte_operativo_at)
    )
  ORDER BY inicio_at DESC NULLS LAST,created_at DESC NULLS LAST
  LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el tramo correspondiente a la Jornada y su responsable.' USING ERRCODE='23514';
  END IF;
  RETURN v_t;
END;
$function$;

-- The multi-item Baja RPC already performs payload idempotency, exact actor
-- binding and stock reservation checks. Widen only its state predicate after
-- the helper above has verified the sealed tranche and open master Turn.
DO $patch_late_bajas$
DECLARE
  v_def text;
  v_old text := 'IF NOT FOUND OR v_s.bloque<>''JORNADA'' OR v_s.estado<>''EN_CURSO'' THEN';
  v_new text := 'IF NOT FOUND OR v_s.bloque<>''JORNADA'' OR v_s.estado NOT IN (''EN_CURSO'',''CERRADA_OPERATIVAMENTE'') THEN';
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_registrar_bajas_multiple_jornada(uuid,jsonb,text,uuid)'::regprocedure
  ) INTO v_def;
  IF strpos(v_def,v_old)=0 THEN
    IF strpos(v_def,'CERRADA_OPERATIVAMENTE')=0 THEN
      RAISE EXCEPTION 'No se pudo localizar el guard de estado de bc7_registrar_bajas_multiple_jornada.';
    END IF;
  ELSE
    v_def:=replace(v_def,v_old,v_new);
    EXECUTE v_def;
  END IF;
END;
$patch_late_bajas$;

REVOKE ALL ON FUNCTION public.bc7_validar_tramo_responsable_jornada(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_validar_tramo_responsable_jornada(uuid) TO authenticated;

COMMIT;
