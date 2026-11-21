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

COMMIT;
