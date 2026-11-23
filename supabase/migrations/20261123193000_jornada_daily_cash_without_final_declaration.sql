BEGIN;

-- Separate the Owner's physical cash count from the worker's daily declarations.
-- Historical turno_declaraciones rows are deliberately preserved untouched.
CREATE TABLE IF NOT EXISTS public.turno_jornada_conteos_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_sesion_id uuid NOT NULL UNIQUE
    REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT,
  monto_entregas_aprobadas numeric(14,2) NOT NULL CHECK (monto_entregas_aprobadas >= 0),
  monto_contado numeric(14,2) NOT NULL CHECK (monto_contado >= 0),
  diferencia numeric(14,2) NOT NULL,
  estado text NOT NULL CHECK (estado IN ('APROBADA','CON_DIFERENCIA','APROBADA_CON_DIFERENCIA')),
  contado_por uuid NOT NULL,
  contado_at timestamptz NOT NULL DEFAULT now(),
  observacion text,
  diferencia_id uuid REFERENCES public.turno_diferencias(id) ON DELETE RESTRICT,
  resuelto_por uuid,
  resuelto_at timestamptz,
  resolucion text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.turno_jornada_conteos_caja ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.turno_jornada_conteos_caja FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.turno_jornada_conteos_caja IS
  'One immutable physical cash count by the Owner, separate from worker daily cash entries and legacy turno_declaraciones.';

CREATE OR REPLACE FUNCTION public.bc7_estado_conteo_efectivo_jornada(p_turno_sesion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_expected integer := 0;
  v_registered integer := 0;
  v_approved integer := 0;
  v_not_approved integer := 0;
  v_daily_total numeric(14,2) := 0;
  v_count public.turno_jornada_conteos_caja;
  v_checklist jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN
    RAISE EXCEPTION 'La sesión no corresponde a una Jornada.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS (
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id
        AND a.usuario_id=auth.uid()
        AND a.retirado_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Solo la responsable asignada o ADMIN puede consultar el conteo de efectivo.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_p
  FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la programación de esta Jornada.' USING ERRCODE='23503';
  END IF;

  v_expected := greatest(0,(coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha+1)::integer);
  SELECT (count(DISTINCT e.fecha) FILTER (WHERE e.estado<>'RECHAZADA'))::integer,
         (count(DISTINCT e.fecha) FILTER (WHERE e.estado='APROBADA'))::integer,
         (count(*) FILTER (WHERE e.estado<>'APROBADA'))::integer,
         coalesce(sum(e.monto_aprobado) FILTER (WHERE e.estado='APROBADA'),0)::numeric(14,2)
    INTO v_registered,v_approved,v_not_approved,v_daily_total
  FROM public.turno_jornada_entregas_diarias e
  WHERE e.turno_sesion_id=v_s.id
    AND e.fecha BETWEEN v_p.fecha AND coalesce(v_p.fecha_fin,v_p.fecha);

  SELECT * INTO v_count
  FROM public.turno_jornada_conteos_caja
  WHERE turno_sesion_id=v_s.id;

  v_checklist := public.bc7_estado_confirmaciones_jornada(v_s.id);

  RETURN jsonb_build_object(
    'turno_sesion_id',v_s.id,
    'entregas_diarias_esperadas',v_expected,
    'entregas_diarias_registradas',coalesce(v_registered,0),
    'entregas_diarias_aprobadas',coalesce(v_approved,0),
    'entregas_diarias_pendientes_aprobacion',coalesce(v_not_approved,0),
    'total_diario_aprobado',coalesce(v_daily_total,0),
    'monto_contado',v_count.monto_contado,
    'monto_entregas_aprobadas_al_contar',v_count.monto_entregas_aprobadas,
    'diferencia',v_count.diferencia,
    'estado',v_count.estado,
    'contado_por',v_count.contado_por,
    'contado_at',v_count.contado_at,
    'observacion',v_count.observacion,
    'puede_contar',
      v_s.estado IN ('COMPLETADA','CERRADA_OPERATIVAMENTE')
      AND coalesce((v_checklist->>'lista_para_conteo')::boolean,false)
      AND v_expected>0
      AND coalesce(v_approved,0)=v_expected
      AND coalesce(v_not_approved,0)=0
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_contar_efectivo_dueno_jornada(
  p_turno_sesion_id uuid,
  p_monto_contado numeric,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_existing public.turno_jornada_conteos_caja;
  v_expected integer := 0;
  v_registered integer := 0;
  v_approved integer := 0;
  v_not_approved integer := 0;
  v_daily_total numeric(14,2) := 0;
  v_counted numeric(14,2);
  v_difference numeric(14,2);
  v_difference_id uuid;
  v_observation text;
  v_checklist jsonb;
  v_saved public.turno_jornada_conteos_caja;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede contar el efectivo de la Jornada.' USING ERRCODE='42501';
  END IF;
  IF p_turno_sesion_id IS NULL OR p_monto_contado IS NULL OR p_monto_contado<0 THEN
    RAISE EXCEPTION 'Introduce el importe físico contado, igual o mayor que cero.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN
    RAISE EXCEPTION 'La sesión no corresponde a una Jornada.' USING ERRCODE='23503';
  END IF;
  IF v_s.estado NOT IN ('COMPLETADA','CERRADA_OPERATIVAMENTE') THEN
    RAISE EXCEPTION 'El conteo físico solo está disponible después de entregar la Jornada.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_existing
  FROM public.turno_jornada_conteos_caja
  WHERE turno_sesion_id=v_s.id
  FOR UPDATE;
  v_counted := round(p_monto_contado,2);
  v_observation := nullif(left(btrim(coalesce(p_observacion,'')),1000),'');
  IF FOUND THEN
    IF round(v_existing.monto_contado,2) IS DISTINCT FROM v_counted THEN
      RAISE EXCEPTION 'Esta Jornada ya tiene un conteo físico guardado. No se puede sobrescribir con otro importe.' USING ERRCODE='23514';
    END IF;
    RETURN jsonb_build_object(
      'conteo_id',v_existing.id,
      'turno_sesion_id',v_existing.turno_sesion_id,
      'monto_entregas_aprobadas',v_existing.monto_entregas_aprobadas,
      'monto_contado',v_existing.monto_contado,
      'diferencia',v_existing.diferencia,
      'estado',v_existing.estado,
      'diferencia_id',v_existing.diferencia_id,
      'resolucion',v_existing.resolucion,
      'contado_por',v_existing.contado_por,
      'contado_at',v_existing.contado_at,
      'idempotente',true
    );
  END IF;

  SELECT * INTO v_p
  FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la programación de esta Jornada.' USING ERRCODE='23503';
  END IF;

  v_checklist := public.bc7_estado_confirmaciones_jornada(v_s.id);
  IF coalesce((v_checklist->>'lista_para_conteo')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'La responsable todavía no ha completado los cinco pasos de la Jornada.' USING ERRCODE='23514';
  END IF;

  v_expected := greatest(0,(coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha+1)::integer);
  SELECT count(DISTINCT e.fecha) FILTER (WHERE e.estado<>'RECHAZADA')::integer,
         count(DISTINCT e.fecha) FILTER (WHERE e.estado='APROBADA')::integer,
         count(*) FILTER (WHERE e.estado<>'APROBADA')::integer,
         coalesce(sum(e.monto_aprobado) FILTER (WHERE e.estado='APROBADA'),0)::numeric(14,2)
    INTO v_registered,v_approved,v_not_approved,v_daily_total
  FROM public.turno_jornada_entregas_diarias e
  WHERE e.turno_sesion_id=v_s.id
    AND e.fecha BETWEEN v_p.fecha AND coalesce(v_p.fecha_fin,v_p.fecha);

  IF v_expected<=0 OR coalesce(v_registered,0)<>v_expected THEN
    RAISE EXCEPTION 'Falta una entrega diaria para alguna fecha del período. No se puede contar todavía.' USING ERRCODE='23514';
  END IF;
  IF coalesce(v_approved,0)<>v_expected OR coalesce(v_not_approved,0)<>0 THEN
    RAISE EXCEPTION 'ADMIN debe aprobar todas las entregas diarias antes del conteo físico.' USING ERRCODE='23514';
  END IF;

  v_difference := round(v_counted-coalesce(v_daily_total,0),2);
  IF v_difference<>0 THEN
    INSERT INTO public.turno_diferencias(
      turno_id,turno_sesion_id,categoria,referencia,esperado,declarado,diferencia,
      usuario_responsable,aprobado,comentario,declaracion_dinero_id
    )
    VALUES(
      v_s.turno_id,v_s.id,'DINERO',
      'Conteo físico de Jornada · sesión '||v_s.id::text,
      coalesce(v_daily_total,0),v_counted,v_difference,
      v_p.responsable_id,false,v_observation,NULL
    )
    RETURNING id INTO v_difference_id;
  END IF;

  INSERT INTO public.turno_jornada_conteos_caja(
    turno_sesion_id,monto_entregas_aprobadas,monto_contado,diferencia,
    estado,contado_por,contado_at,observacion,diferencia_id
  )
  VALUES(
    v_s.id,coalesce(v_daily_total,0),v_counted,v_difference,
    CASE WHEN v_difference=0 THEN 'APROBADA' ELSE 'CON_DIFERENCIA' END,
    auth.uid(),now(),v_observation,v_difference_id
  )
  RETURNING * INTO v_saved;

  RETURN jsonb_build_object(
    'conteo_id',v_saved.id,
    'turno_sesion_id',v_saved.turno_sesion_id,
    'monto_entregas_aprobadas',v_saved.monto_entregas_aprobadas,
    'monto_contado',v_saved.monto_contado,
    'diferencia',v_saved.diferencia,
    'estado',v_saved.estado,
    'diferencia_id',v_saved.diferencia_id,
    'resolucion',v_saved.resolucion,
    'contado_por',v_saved.contado_por,
    'contado_at',v_saved.contado_at,
    'idempotente',false
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.bc7_listar_diferencias_conteo_efectivo_jornada()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede consultar las diferencias del conteo físico.' USING ERRCODE='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'declaracion_id',c.id,
    'turno_id',s.turno_id,
    'turno_sesion_id',s.id,
    'turno_tramo_id',NULL,
    'almacen_id',s.almacen_id,
    'almacen_nombre',al.nombre,
    'fecha',p.fecha,
    'numero_dia',p.numero_dia,
    'bloque','JORNADA',
    'estado_sesion',s.estado,
    'responsable_id',p.responsable_id,
    'responsable_nombre',coalesce(u.nombre,'Responsable'),
    'monto_declarado',c.monto_entregas_aprobadas,
    'moneda','CUP',
    'declarado_at',c.contado_at,
    'monto_contado',c.monto_contado,
    'diferencia',c.diferencia,
    'estado_aprobacion',c.estado,
    'contado_por',c.contado_por,
    'contador_nombre',coalesce(cu.nombre,''),
    'contado_at',c.contado_at,
    'observacion_conteo',c.observacion,
    'diferencia_id',d.id,
    'diferencia_aprobada',coalesce(d.aprobado,false),
    'comentario_diferencia',d.comentario
  ) ORDER BY c.contado_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.turno_jornada_conteos_caja c
  JOIN public.turno_sesiones s ON s.id=c.turno_sesion_id
  JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
  JOIN public.turnos t ON t.id=s.turno_id
  JOIN public.almacenes al ON al.id=s.almacen_id
  LEFT JOIN public.usuarios u ON u.id=p.responsable_id
  LEFT JOIN public.usuarios cu ON cu.id=c.contado_por
  JOIN public.turno_diferencias d ON d.id=c.diferencia_id
  WHERE c.estado='CON_DIFERENCIA' AND d.aprobado=false;

  RETURN coalesce(v_result,'[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_listar_diferencias_conteo_efectivo_jornada() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_listar_diferencias_conteo_efectivo_jornada() TO authenticated;

REVOKE ALL ON FUNCTION public.bc7_estado_conteo_efectivo_jornada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_estado_conteo_efectivo_jornada(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.bc7_contar_efectivo_dueno_jornada(uuid,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_contar_efectivo_dueno_jornada(uuid,numeric,text) TO authenticated;

-- Step 5 is exactly one row per actual calendar date. It no longer requires
-- an additional worker-declared total or legacy declaration event.
DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_estado_confirmaciones_jornada(uuid)'::regprocedure)
    INTO v_def;

  v_old := $old$
  SELECT d.estado_aprobacion,d.turno_tramo_id,d.usuario_id
    INTO v_cash_state,v_cash_tranche_id,v_cash_actor_id
  FROM public.turno_declaraciones d
  WHERE d.turno_sesion_id=p_turno_sesion_id
  ORDER BY d.declarado_at DESC NULLS LAST,d.created_at DESC NULLS LAST
  LIMIT 1;

  v_cash_registered:=v_cash_state IS NOT NULL
    AND v_cash_state NOT IN ('RECHAZADA','RECTIFICADA')
    AND EXISTS(
      SELECT 1
      FROM public.turno_eventos e
      WHERE e.turno_sesion_id=p_turno_sesion_id
        AND e.turno_tramo_id=v_cash_tranche_id
        AND e.actor_user_id=v_cash_actor_id
        AND e.tipo IN (
          'DINERO_DECLARADO',
          'DINERO_REDECLARADO',
          'DINERO_DECLARACION_RESPONSABLE_SUSTITUYE_TRANSCRIPCION',
          'DINERO_DECLARACION_RESPONSABLE_RECTIFICA_RECHAZO'
        )
    );
$old$;
  v_new := $new$
  SELECT c.estado
    INTO v_cash_state
  FROM public.turno_jornada_conteos_caja c
  WHERE c.turno_sesion_id=p_turno_sesion_id
  ORDER BY c.contado_at DESC
  LIMIT 1;
$new$;
  IF strpos(v_def,v_old)>0 THEN
    v_def := replace(v_def,v_old,v_new);
  ELSIF strpos(v_def,'FROM public.turno_jornada_conteos_caja c')=0 THEN
    RAISE EXCEPTION 'No se reconoce la versión de bc7_estado_confirmaciones_jornada; no se aplicó el cambio.';
  END IF;

  v_old := $old$
  v_cash_declared:=v_cash_registered
    AND v_daily_expected>0
    AND v_daily_registered=v_daily_expected;
$old$;
  v_new := $new$
  v_cash_registered:=v_daily_expected>0
    AND v_daily_registered=v_daily_expected;
  v_cash_declared:=v_cash_registered;
$new$;
  IF strpos(v_def,v_old)>0 THEN
    v_def := replace(v_def,v_old,v_new);
  ELSIF strpos(v_def,'v_cash_registered:=v_daily_expected>0')=0 THEN
    RAISE EXCEPTION 'No se reconoce el cálculo diario de bc7_estado_confirmaciones_jornada.';
  END IF;
  EXECUTE v_def;
END;
$migration$;

-- The cash actually received is the physical Owner count, not daily declared cash
-- plus a second copy of that same cash. The expected number of dates is inclusive.
DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure)
    INTO v_def;

  v_old := $old$
  v_daily_expected:=greatest(0,(coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha)::integer);
$old$;
  v_new := $new$
  v_daily_expected:=greatest(0,(coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha+1)::integer);
$new$;
  IF strpos(v_def,v_old)>0 THEN
    v_def := replace(v_def,v_old,v_new);
  ELSIF strpos(v_def,'coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha+1')=0 THEN
    RAISE EXCEPTION 'No se reconoce el cálculo inclusivo de fechas en la liquidación de Jornada.';
  END IF;

  v_old := $old$
  SELECT d.monto,d.monto_contado,d.estado_aprobacion
    INTO v_final_declared,v_final_counted,v_final_cash_state
  FROM public.turno_declaraciones d
  WHERE d.turno_sesion_id=v_s.id
  ORDER BY d.declarado_at DESC NULLS LAST,d.created_at DESC NULLS LAST LIMIT 1;
$old$;
  v_new := $new$
  SELECT
    coalesce((
      SELECT sum(e.monto_aprobado)
      FROM public.turno_jornada_entregas_diarias e
      WHERE e.turno_sesion_id=v_s.id
        AND e.estado='APROBADA'
        AND e.fecha BETWEEN v_p.fecha AND coalesce(v_p.fecha_fin,v_p.fecha)
    ),0),
    c.monto_contado,
    c.estado
    INTO v_final_declared,v_final_counted,v_final_cash_state
  FROM (SELECT 1) seed
  LEFT JOIN public.turno_jornada_conteos_caja c ON c.turno_sesion_id=v_s.id;
$new$;
  IF strpos(v_def,v_old)>0 THEN
    v_def := replace(v_def,v_old,v_new);
  ELSIF strpos(v_def,'FROM public.turno_jornada_conteos_caja c')=0 THEN
    RAISE EXCEPTION 'No se reconoce la lectura de conteo del Dueño en la liquidación.';
  END IF;

  v_old := $old$
  v_cash_received:=CASE WHEN v_final_counted IS NOT NULL AND v_final_cash_state='APROBADA'
    THEN v_daily_cash+v_final_counted ELSE NULL END;
$old$;
  v_new := $new$
  v_cash_received:=CASE WHEN v_final_counted IS NOT NULL
    AND v_final_cash_state IN ('APROBADA','APROBADA_CON_DIFERENCIA')
    THEN v_final_counted ELSE NULL END;
$new$;
  IF strpos(v_def,v_old)>0 THEN
    v_def := replace(v_def,v_old,v_new);
  ELSIF strpos(v_def,'THEN v_final_counted ELSE NULL END')=0 THEN
    RAISE EXCEPTION 'No se reconoce el cálculo de efectivo recibido sin duplicación.';
  END IF;
  EXECUTE v_def;
END;
$migration$;


-- Route new retail Owner-count differences through the existing ADMIN exception inbox.
DO $patch_owner_count_difference_resolution$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc_aprobar_diferencia(uuid,text)'::regprocedure)
    INTO v_def;
  v_old := $old$
  IF r.declaracion_dinero_id IS NOT NULL THEN
    UPDATE public.turno_declaraciones
    SET estado_aprobacion='APROBADA',
        aprobado_por=auth.uid(),
        aprobado_at=now()
    WHERE id=r.declaracion_dinero_id
      AND estado_aprobacion='CON_DIFERENCIA';
    INSERT INTO public.turno_eventos(
      turno_id,turno_sesion_id,actor_user_id,tipo,payload
    )
    VALUES(
      r.turno_id,r.turno_sesion_id,auth.uid(),'DINERO_DIFERENCIA_RESUELTA',
      jsonb_build_object('declaracion_id',r.declaracion_dinero_id,
        'diferencia_id',r.id,'diferencia',r.diferencia,'comentario',r.comentario)
    );
  END IF;
$old$;
  v_new := $new$
  IF r.declaracion_dinero_id IS NOT NULL THEN
    UPDATE public.turno_declaraciones
    SET estado_aprobacion='APROBADA',
        aprobado_por=auth.uid(),
        aprobado_at=now()
    WHERE id=r.declaracion_dinero_id
      AND estado_aprobacion='CON_DIFERENCIA';
    INSERT INTO public.turno_eventos(
      turno_id,turno_sesion_id,actor_user_id,tipo,payload
    )
    VALUES(
      r.turno_id,r.turno_sesion_id,auth.uid(),'DINERO_DIFERENCIA_RESUELTA',
      jsonb_build_object('declaracion_id',r.declaracion_dinero_id,
        'diferencia_id',r.id,'diferencia',r.diferencia,'comentario',r.comentario)
    );
  END IF;

  UPDATE public.turno_jornada_conteos_caja
  SET estado='APROBADA_CON_DIFERENCIA',
      resuelto_por=auth.uid(),
      resuelto_at=now(),
      resolucion=coalesce(nullif(btrim(p_comentario),''),'Diferencia revisada y aprobada por ADMIN.')
  WHERE diferencia_id=r.id AND estado='CON_DIFERENCIA';

  IF FOUND THEN
    INSERT INTO public.turno_eventos(
      turno_id,turno_sesion_id,actor_user_id,tipo,payload
    )
    VALUES(
      r.turno_id,r.turno_sesion_id,auth.uid(),'DINERO_CONTEO_DUENO_DIFERENCIA_RESUELTA',
      jsonb_build_object('diferencia_id',r.id,'diferencia',r.diferencia,
        'comentario',coalesce(nullif(btrim(p_comentario),''),r.comentario))
    );
  END IF;
$new$;
  IF strpos(v_def,v_old)>0 THEN
    v_def := replace(v_def,v_old,v_new);
  ELSIF strpos(v_def,'APROBADA_CON_DIFERENCIA')=0 THEN
    RAISE EXCEPTION 'No se reconoce la función ADMIN para aprobar diferencias de efectivo.';
  END IF;
  EXECUTE v_def;
END;
$patch_owner_count_difference_resolution$;

-- The retail close requires date-specific submissions, not a worker final-total declaration.
-- Non-retail legacy sessions retain their original declaration gate.
DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc5_cerrar_jornada(uuid,text)'::regprocedure)
    INTO v_def;
  v_old := $old$
  IF NOT EXISTS(
    SELECT 1 FROM public.turno_declaraciones d
    WHERE d.turno_tramo_id=v_tramo.id AND d.usuario_id=auth.uid()
  ) THEN
    RAISE EXCEPTION 'Antes de cerrar la jornada debes declarar el dinero entregado.' USING ERRCODE='23514';
  END IF;
$old$;
  v_new := $new$
  IF EXISTS(
    SELECT 1 FROM public.almacenes a
    WHERE a.id=v_sesion.almacen_id AND a.tipo='minorista'
  ) THEN
    IF (
      SELECT count(DISTINCT e.fecha)
      FROM public.turno_jornada_entregas_diarias e
      WHERE e.turno_sesion_id=v_sesion.id
        AND e.fecha BETWEEN v_programacion.fecha AND coalesce(v_programacion.fecha_fin,v_programacion.fecha)
        AND e.estado<>'RECHAZADA'
    ) <> greatest(1,(coalesce(v_programacion.fecha_fin,v_programacion.fecha)-v_programacion.fecha+1)::integer) THEN
      RAISE EXCEPTION 'Antes de entregar la Jornada debes registrar una entrega de dinero por cada fecha del período (incluye 0 CUP cuando no hubo entrega).' USING ERRCODE='23514';
    END IF;
  ELSIF NOT EXISTS(
    SELECT 1 FROM public.turno_declaraciones d
    WHERE d.turno_tramo_id=v_tramo.id AND d.usuario_id=auth.uid()
  ) THEN
    RAISE EXCEPTION 'Antes de cerrar la jornada debes declarar el dinero entregado.' USING ERRCODE='23514';
  END IF;
$new$;
  IF strpos(v_def,v_old)>0 THEN
    v_def := replace(v_def,v_old,v_new);
  ELSIF strpos(v_def,'Antes de entregar la Jornada debes registrar una entrega de dinero por cada fecha')=0 THEN
    RAISE EXCEPTION 'No se reconoce la validación de dinero de bc5_cerrar_jornada.';
  END IF;
  EXECUTE v_def;
END;
$migration$;

-- Include the warehouse type in the Owner review payload so its UI can
-- suppress legacy worker declarations for retail sessions without losing audit data.
DO $patch_owner_review_session_type$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_obtener_revision_jornada(uuid)'::regprocedure)
    INTO v_def;
  v_old := $old$
      'estado',v_s.estado,'responsable_id',v_p.responsable_id,
      'hora_inicio',v_p.hora_inicio_prevista,'hora_fin',v_p.hora_fin_prevista,
$old$;
  v_new := $new$
      'estado',v_s.estado,'responsable_id',v_p.responsable_id,
      'es_minorista',coalesce((SELECT a.tipo='minorista' FROM public.almacenes a WHERE a.id=v_s.almacen_id),false),
      'hora_inicio',v_p.hora_inicio_prevista,'hora_fin',v_p.hora_fin_prevista,
$new$;
  IF strpos(v_def,v_old)>0 THEN
    v_def := replace(v_def,v_old,v_new);
  ELSIF strpos(v_def,'''es_minorista''')=0 THEN
    RAISE EXCEPTION 'No se reconoce la estructura de sesión en bc7_obtener_revision_jornada.';
  END IF;
  EXECUTE v_def;
END;
$patch_owner_review_session_type$;

-- Retail Jornada no longer has a separate final-declaration approval item.
-- Keep legacy turno_declaraciones rows intact for audit and non-retail sessions.
DO $patch_retail_declaration_queue$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.listar_aprobaciones_admin()'::regprocedure)
    INTO v_def;
  v_old := $old$WHERE s.bloque='JORNADA'
      AND d.estado_aprobacion IN ('PENDIENTE','ESPERANDO_APROBACION')$old$;
  v_new := $new$WHERE s.bloque='JORNADA'
      AND coalesce(a.tipo,'')<>'minorista'
      AND d.estado_aprobacion IN ('PENDIENTE','ESPERANDO_APROBACION')$new$;
  IF strpos(v_def,v_old)>0 THEN
    v_def := replace(v_def,v_old,v_new);
  ELSIF strpos(v_def,'coalesce(a.tipo,'''')<>''minorista''')=0 THEN
    RAISE EXCEPTION 'No se reconoce el filtro de declaración histórica en listar_aprobaciones_admin.';
  END IF;
  EXECUTE v_def;
END;
$patch_retail_declaration_queue$;

-- Keep the existing operational-close and attribution guards; permit the
-- already sealed operational session only while its master Turn remains open.
DO $migration$
DECLARE
  v_def text;
  v_old text := 'IF v_s.estado NOT IN (''PROGRAMADA'',''EN_CURSO'',''COMPLETADA'') THEN';
  v_new text := 'IF v_s.estado NOT IN (''PROGRAMADA'',''EN_CURSO'',''COMPLETADA'',''CERRADA_OPERATIVAMENTE'') THEN';
BEGIN
  SELECT pg_get_functiondef('public.bc7_vincular_transferencia_jornada(uuid,uuid,text)'::regprocedure)
    INTO v_def;
  IF strpos(v_def,v_new)>0 THEN
    NULL;
  ELSIF strpos(v_def,v_old)>0 THEN
    v_def := replace(v_def,v_old,v_new);
    EXECUTE v_def;
  ELSE
    RAISE EXCEPTION 'No se reconoce la versión de bc7_vincular_transferencia_jornada.';
  END IF;
END;
$migration$;

COMMIT;
