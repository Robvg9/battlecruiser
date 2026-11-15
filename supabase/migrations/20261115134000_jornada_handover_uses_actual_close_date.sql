-- Recalculate the successor handover date from the actual operational close.
-- A late administrative handover without overtime keeps the programmed end date;
-- a close with an explicit exception uses the actual close date.
BEGIN;

DO $patch$
DECLARE
  v_definition text;
  v_old_decl text;
  v_new_decl text;
  v_old_block text;
  v_new_block text;
BEGIN
  SELECT pg_get_functiondef('public.bc5_cerrar_jornada(uuid,text)'::regprocedure)
  INTO v_definition;

  v_old_decl := $old$  v_fecha_fin date;$old$;
  v_new_decl := $new$  v_fecha_fin date;
  v_fecha_entrega date;
  v_entrega public.turno_jornada_inventario_entregas;$new$;
  IF length(v_definition)-length(replace(v_definition,v_old_decl,''))<>length(v_old_decl) THEN
    RAISE EXCEPTION 'No se localizó la declaración de fecha de bc5_cerrar_jornada(uuid,text).';
  END IF;
  v_definition := replace(v_definition,v_old_decl,v_new_decl);

  v_old_block := $old$  UPDATE public.turnos SET estado='ABIERTO',estado_maestro='EN_CURSO',cierre_real=NULL,actualizado_en=now()
  WHERE id=v_sesion.turno_id;
  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo)$old$;

  v_new_block := $new$  UPDATE public.turnos SET estado='ABIERTO',estado_maestro='EN_CURSO',cierre_real=NULL,actualizado_en=now()
  WHERE id=v_sesion.turno_id;

  -- Keep the programmed next day only when the shift ended on schedule and
  -- the owner received the handover later as an administrative action.
  -- An explicit overtime/early-close exception uses the real local close date.
  v_fecha_entrega := CASE
    WHEN v_tipo_evento='JORNADA_ENTREGADA_TARDE' THEN v_fecha_fin + 1
    ELSE v_local::date + 1
  END;

  SELECT * INTO v_entrega
  FROM public.turno_jornada_inventario_entregas
  WHERE origen_sesion_id=v_sesion.id
    AND destino_sesion_id IS NULL
    AND estado='PENDIENTE_PROGRAMACION'
  FOR UPDATE;

  IF FOUND AND v_entrega.fecha_destino IS DISTINCT FROM v_fecha_entrega THEN
    UPDATE public.turno_jornada_inventario_entregas
    SET fecha_destino=v_fecha_entrega,actualizado_en=now()
    WHERE id=v_entrega.id;

    INSERT INTO public.turno_jornada_eventos
      (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
    VALUES
      (v_programacion.almacen_id,v_programacion.id,auth.uid(),
       'INVENTARIO_ENTREGA_DESTINO_RECALCULADO',
       'La sucesora se programa para el día posterior al cierre operativo real.',
       jsonb_build_object('entrega_id',v_entrega.id,'fecha_destino_anterior',v_entrega.fecha_destino),
       jsonb_build_object('entrega_id',v_entrega.id,'fecha_destino',v_fecha_entrega,
         'fecha_cierre_real',v_local::date,'tipo_cierre',v_tipo_evento));
  END IF;

  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo)$new$;

  IF length(v_definition)-length(replace(v_definition,v_old_block,''))<>length(v_old_block) THEN
    RAISE EXCEPTION 'No se localizó el punto de cierre de bc5_cerrar_jornada(uuid,text).';
  END IF;
  v_definition := replace(v_definition,v_old_block,v_new_block);
  EXECUTE v_definition;
END;
$patch$;

-- Repair already-created, still-unlinked successor deliveries using the
-- source jornada's recorded close event. No stock or cut quantity is changed.
DO $backfill$
DECLARE
  v record;
BEGIN
  FOR v IN
    SELECT
      e.id AS entrega_id,
      e.almacen_id,
      e.origen_sesion_id,
      e.fecha_destino AS fecha_anterior,
      s.jornada_programacion_id,
      coalesce(cierre.actor_user_id,e.creado_por) AS actor_user_id,
      (
        CASE
          WHEN cierre.tipo='JORNADA_ENTREGADA_TARDE'
            THEN coalesce(nullif(cierre.estado_despues->>'fecha_fin_programada','')::date,
                          p.fecha_fin,p.fecha)
          ELSE coalesce(nullif(cierre.estado_despues->>'fecha_real','')::date,
                        (tr.fin_at AT TIME ZONE coalesce(nullif(p.zona_horaria,''),'America/Havana'))::date,
                        p.fecha_fin,p.fecha)
        END + 1
      ) AS fecha_nueva
    FROM public.turno_jornada_inventario_entregas e
    JOIN public.turno_sesiones s ON s.id=e.origen_sesion_id
    JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
    LEFT JOIN LATERAL (
      SELECT tr.fin_at
      FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id=s.id
      ORDER BY tr.fin_at DESC NULLS LAST,tr.created_at DESC
      LIMIT 1
    ) tr ON true
    JOIN LATERAL (
      SELECT je.tipo,je.estado_despues,je.actor_user_id
      FROM public.turno_jornada_eventos je
      WHERE je.programacion_id=p.id
        AND je.tipo IN ('JORNADA_CERRADA','JORNADA_CERRADA_CON_EXCEPCION','JORNADA_ENTREGADA_TARDE')
      ORDER BY je.creado_en DESC
      LIMIT 1
    ) cierre ON true
    WHERE e.destino_sesion_id IS NULL
      AND e.estado='PENDIENTE_PROGRAMACION'
      AND s.estado='COMPLETADA'
    FOR UPDATE OF e
  LOOP
    IF v.fecha_anterior IS DISTINCT FROM v.fecha_nueva THEN
      UPDATE public.turno_jornada_inventario_entregas
      SET fecha_destino=v.fecha_nueva,actualizado_en=now()
      WHERE id=v.entrega_id;

      INSERT INTO public.turno_jornada_eventos
        (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
      VALUES
        (v.almacen_id,v.jornada_programacion_id,v.actor_user_id,
         'INVENTARIO_ENTREGA_DESTINO_RECALCULADO',
         'Regularización de fecha: la jornada de origen terminó después de su fecha programada.',
         jsonb_build_object('entrega_id',v.entrega_id,'fecha_destino_anterior',v.fecha_anterior),
         jsonb_build_object('entrega_id',v.entrega_id,'fecha_destino',v.fecha_nueva,
           'origen_sesion_id',v.origen_sesion_id,'recalculado_desde_cierre_real',true));
    END IF;
  END LOOP;
END;
$backfill$;

COMMIT;