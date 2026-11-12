BEGIN;

-- Link a completed multi-day Jornada to the next session after its full period.
-- Single-day sessions retain the original fecha + 1 behavior because fecha_fin is NULL/same-day.
CREATE OR REPLACE FUNCTION public.bc7_preparar_entrega_inventario_jornada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_programacion public.turno_jornada_programacion;
  v_destino uuid;
  v_entrega uuid;
  v_fecha_destino date;
BEGIN
  IF NEW.tipo <> 'FINAL' THEN RETURN NEW; END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=NEW.turno_sesion_id AND bloque='JORNADA'
    AND jornada_programacion_id IS NOT NULL;

  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO v_programacion
  FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- A multi-date Jornada (for example, Nov 9–10) hands stock to the next
  -- Jornada after fecha_fin, not to the middle date inside the same period.
  v_fecha_destino:=coalesce(v_programacion.fecha_fin,v_programacion.fecha)+1;

  SELECT s.id INTO v_destino
  FROM public.turno_sesiones s
  WHERE s.turno_id=v_s.turno_id
    AND s.numero_dia=v_s.numero_dia+1
    AND s.fecha=v_fecha_destino
    AND s.almacen_id=v_s.almacen_id
    AND s.bloque='JORNADA'
    AND s.jornada_programacion_id IS NOT NULL
    AND s.estado IN ('PENDIENTE','PROGRAMADA')
  ORDER BY s.id
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
    (v_s.almacen_id,v_s.turno_id,v_s.id,NEW.id,v_destino,v_fecha_destino,
     CASE WHEN v_destino IS NULL THEN 'PENDIENTE_PROGRAMACION' ELSE 'PENDIENTE_RECEPCION' END,
     NEW.confirmado_por)
  ON CONFLICT (origen_sesion_id) DO NOTHING
  RETURNING id INTO v_entrega;

  IF v_entrega IS NULL THEN
    SELECT id INTO v_entrega
    FROM public.turno_jornada_inventario_entregas
    WHERE origen_sesion_id=v_s.id;
  END IF;

  -- Always reconcile missing immutable detail rows on retry. The FINAL cut and its
  -- line items may be persisted in separate statements before the deferred trigger fires.
  INSERT INTO public.turno_jornada_inventario_entrega_lineas
    (entrega_id,producto_id,cantidad_declarada)
  SELECT v_entrega,l.producto_id,l.cantidad_contada
  FROM public.turno_jornada_inventario_lineas l
  WHERE l.corte_id=NEW.id
  ON CONFLICT (entrega_id,producto_id) DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_eventos
    WHERE tipo='INVENTARIO_ENTREGA_PREPARADA'
      AND estado_despues->>'entrega_id'=v_entrega::text
  ) THEN
    RETURN NEW;
  END IF;

  IF v_entrega IS NOT NULL THEN
    INSERT INTO public.turno_jornada_eventos
      (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
    VALUES
      (v_s.almacen_id,v_s.jornada_programacion_id,NEW.confirmado_por,
       'INVENTARIO_ENTREGA_PREPARADA',
       'Entrega compartida generada desde el inventario final confirmado.',
       jsonb_build_object('sesion_origen_id',v_s.id,'corte_final_id',NEW.id),
       jsonb_build_object('entrega_id',v_entrega,'sesion_destino_id',v_destino,
         'fecha_destino',v_fecha_destino));
  END IF;

  RETURN NEW;
END;
$function$;


COMMIT;
