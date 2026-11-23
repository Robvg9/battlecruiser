BEGIN;

-- Allow the assigned worker to finish the three operational checklist blocks
-- after an automatic operational seal. A checklist confirmation means that
-- the worker has finished entering evidence; it does not approve the records.
CREATE OR REPLACE FUNCTION public.bc7_confirmar_bloque_jornada(
  p_turno_sesion_id uuid,
  p_bloque text,
  p_completado boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_tramo public.turno_tramos;
  v_master_turn public.turnos;
  v_tipo text:=lower(coalesce(p_bloque,''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF v_tipo NOT IN ('gastos','reinversiones','bajas') OR p_completado IS NULL THEN
    RAISE EXCEPTION 'El bloque de checklist no es válido.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN
    RAISE EXCEPTION 'La Jornada no existe.' USING ERRCODE='23503';
  END IF;

  IF v_s.estado='CERRADA_OPERATIVAMENTE' THEN
    -- The assigned worker, not ADMIN, owns the completion declaration.
    v_tramo:=public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);
    SELECT * INTO v_master_turn
    FROM public.turnos
    WHERE id=v_s.turno_id
    FOR UPDATE;
    IF NOT FOUND OR v_master_turn.estado<>'ABIERTO'
       OR coalesce(v_master_turn.estado_maestro,v_master_turn.estado)<>'EN_CURSO' THEN
      RAISE EXCEPTION 'El Turno maestro ya está cerrado; no se admiten cambios de checklist.' USING ERRCODE='23514';
    END IF;
    IF v_s.corte_operativo_at IS NULL OR v_tramo.id IS NULL
       OR v_tramo.estado<>'COMPLETADO'
       OR v_tramo.fin_at IS DISTINCT FROM v_s.corte_operativo_at
       OR v_tramo.usuario_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'No se pudo verificar el tramo sellado de la responsable.' USING ERRCODE='23514';
    END IF;
    -- BC7_SEALED_OWNER_BLOCK_GATE_V2
    -- BC7_SEALED_WORKER_BLOCK_CONFIRM_V3
  ELSE
    v_tramo:=public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.almacenes a
    WHERE a.id=v_s.almacen_id AND a.tipo='minorista'
  ) THEN
    RAISE EXCEPTION 'El checklist operativo solo aplica a jornadas minoristas.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.turno_jornada_confirmaciones(turno_sesion_id)
  VALUES(p_turno_sesion_id)
  ON CONFLICT(turno_sesion_id) DO NOTHING;

  IF v_tipo='gastos' THEN
    UPDATE public.turno_jornada_confirmaciones
    SET gastos_completado=p_completado,
        gastos_completado_por=CASE WHEN p_completado THEN auth.uid() ELSE NULL END,
        gastos_completado_at=CASE WHEN p_completado THEN now() ELSE NULL END,
        updated_at=now()
    WHERE turno_sesion_id=p_turno_sesion_id;
  ELSIF v_tipo='reinversiones' THEN
    UPDATE public.turno_jornada_confirmaciones
    SET reinversiones_completado=p_completado,
        reinversiones_completado_por=CASE WHEN p_completado THEN auth.uid() ELSE NULL END,
        reinversiones_completado_at=CASE WHEN p_completado THEN now() ELSE NULL END,
        updated_at=now()
    WHERE turno_sesion_id=p_turno_sesion_id;
  ELSE
    UPDATE public.turno_jornada_confirmaciones
    SET bajas_completado=p_completado,
        bajas_completado_por=CASE WHEN p_completado THEN auth.uid() ELSE NULL END,
        bajas_completado_at=CASE WHEN p_completado THEN now() ELSE NULL END,
        updated_at=now()
    WHERE turno_sesion_id=p_turno_sesion_id;
  END IF;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_despues
  )
  VALUES(
    v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),
    CASE v_tipo
      WHEN 'gastos' THEN CASE WHEN p_completado THEN 'CHECKLIST_GASTOS_CONFIRMADO' ELSE 'CHECKLIST_GASTOS_REABIERTO' END
      WHEN 'reinversiones' THEN CASE WHEN p_completado THEN 'CHECKLIST_REINVERSIONES_CONFIRMADO' ELSE 'CHECKLIST_REINVERSIONES_REABIERTO' END
      ELSE CASE WHEN p_completado THEN 'CHECKLIST_BAJAS_CONFIRMADO' ELSE 'CHECKLIST_BAJAS_REABIERTO' END
    END,
    NULL,
    jsonb_build_object('sesion_id',p_turno_sesion_id,'bloque',v_tipo,'completado',p_completado,
      'aprobacion_operativa_separada',true)
  );

  RETURN public.bc7_estado_confirmaciones_jornada(p_turno_sesion_id);
END;
$function$;

-- The final step is complete only when the responsible's final declaration
-- and every date-specific cash delivery have been recorded. An ADMIN-only
-- transcription does not count as the worker's declaration.
CREATE OR REPLACE FUNCTION public.bc7_estado_confirmaciones_jornada(
  p_turno_sesion_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_gastos boolean:=false;
  v_reinversiones boolean:=false;
  v_bajas boolean:=false;
  v_final boolean:=false;
  v_lista_conteo boolean:=false;
  v_lista_calculo boolean:=false;
  v_cash_state text;
  v_cash_declared boolean:=false;
  v_cash_registered boolean:=false;
  v_cash_tranche_id uuid;
  v_cash_actor_id uuid;
  v_daily_expected integer:=0;
  v_daily_registered integer:=0;
  v_liquidacion jsonb;
  v_phase text;
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
    OR NOT EXISTS(
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Solo la responsable asignada o ADMIN puede consultar el checklist.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_p
  FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id;

  SELECT coalesce(c.gastos_completado,false),
         coalesce(c.reinversiones_completado,false),
         coalesce(c.bajas_completado,false)
    INTO v_gastos,v_reinversiones,v_bajas
  FROM public.turno_jornada_confirmaciones c
  WHERE c.turno_sesion_id=p_turno_sesion_id;
  v_gastos:=coalesce(v_gastos,false);
  v_reinversiones:=coalesce(v_reinversiones,false);
  v_bajas:=coalesce(v_bajas,false);

  SELECT EXISTS(
    SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=p_turno_sesion_id
      AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
  ) INTO v_final;

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
          'DINERO_DECLARACION_RESPONSABLE_SUSTITUYE_TRANSCRIPCION'
        )
    );

  v_daily_expected:=greatest(0,coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha+1);
  SELECT count(DISTINCT e.fecha)::integer
    INTO v_daily_registered
  FROM public.turno_jornada_entregas_diarias e
  WHERE e.turno_sesion_id=p_turno_sesion_id
    AND e.fecha BETWEEN v_p.fecha AND coalesce(v_p.fecha_fin,v_p.fecha)
    AND e.estado<>'RECHAZADA';

  v_cash_declared:=v_cash_registered
    AND v_daily_expected>0
    AND v_daily_registered=v_daily_expected;

  v_lista_conteo:=v_gastos AND v_reinversiones AND v_bajas AND v_final AND v_cash_declared;
  v_liquidacion:=public.bc7_liquidacion_inventario_jornada(p_turno_sesion_id);
  v_lista_calculo:=v_lista_conteo
    AND v_cash_state='APROBADA'
    AND coalesce((v_liquidacion->>'calculable')::boolean,false);

  v_phase:=CASE
    WHEN NOT v_lista_conteo THEN 'OPERACION'
    WHEN v_s.estado NOT IN ('COMPLETADA','CERRADA_OPERATIVAMENTE') THEN 'LISTA_PARA_ENTREGA'
    WHEN v_cash_state IS DISTINCT FROM 'APROBADA' THEN 'PENDIENTE_CONTEO_DUENO'
    WHEN v_lista_calculo THEN 'CALCULAR'
    ELSE 'REVISION_APROBACIONES'
  END;

  RETURN jsonb_build_object(
    'gastos',jsonb_build_object('completado',v_gastos),
    'reinversiones',jsonb_build_object('completado',v_reinversiones),
    'bajas',jsonb_build_object('completado',v_bajas),
    'inventario_final',jsonb_build_object('completado',v_final),
    'declaracion_dinero',jsonb_build_object(
      'completado',v_cash_declared,
      'declaracion_registrada',v_cash_registered,
      'entregas_diarias_registradas',v_daily_registered,
      'entregas_diarias_esperadas',v_daily_expected,
      'estado',v_cash_state
    ),
    'lista_para_conteo',v_lista_conteo,
    'lista_para_calcular',v_lista_calculo,
    'estado_efectivo_final',v_cash_state,
    'fase',v_phase
  );
END;
$function$;

-- Let the responsible replace the earlier ADMIN transcription with her actual
-- final declaration. The original amount and ADMIN event remain in the audit log.
CREATE OR REPLACE FUNCTION public.bc5_responsable_declarar_dinero_jornada(
  p_turno_sesion_id uuid,
  p_monto numeric
)
RETURNS public.turno_declaraciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_t public.turno_tramos;
  v_turn public.turnos;
  v_d public.turno_declaraciones;
  v_existing_admin_event boolean:=false;
  v_existing_worker_event boolean:=false;
  v_old_amount numeric;
  v_old_state text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF p_monto IS NULL OR p_monto<0 THEN
    RAISE EXCEPTION 'El importe final declarado debe ser un número igual o mayor que cero.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id AND bloque='JORNADA'
    AND estado='CERRADA_OPERATIVAMENTE'
  FOR UPDATE;
  IF NOT FOUND OR v_s.corte_operativo_at IS NULL THEN
    RAISE EXCEPTION 'La declaración tardía solo está disponible para una Jornada sellada con corte verificable.' USING ERRCODE='23514';
  END IF;

  v_t:=public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);
  SELECT * INTO v_turn
  FROM public.turnos
  WHERE id=v_s.turno_id
  FOR UPDATE;
  IF NOT FOUND OR v_turn.estado<>'ABIERTO'
     OR coalesce(v_turn.estado_maestro,v_turn.estado)<>'EN_CURSO' THEN
    RAISE EXCEPTION 'El Turno maestro ya está cerrado; no se admite una nueva declaración.' USING ERRCODE='23514';
  END IF;
  IF v_t.estado<>'COMPLETADO' OR v_t.fin_at IS DISTINCT FROM v_s.corte_operativo_at
     OR v_t.usuario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No se encontró el tramo sellado correspondiente a la responsable.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_d
  FROM public.turno_declaraciones
  WHERE turno_tramo_id=v_t.id
  FOR UPDATE;

  IF FOUND THEN
    SELECT EXISTS(
      SELECT 1 FROM public.turno_eventos e
      WHERE e.turno_sesion_id=v_s.id
        AND e.turno_tramo_id=v_t.id
        AND e.tipo='DINERO_DECLARACION_TRANSCRITA_ADMIN'
        AND e.payload->>'declaracion_id'=v_d.id::text
    ) INTO v_existing_admin_event;

    SELECT EXISTS(
      SELECT 1 FROM public.turno_eventos e
      WHERE e.turno_sesion_id=v_s.id
        AND e.turno_tramo_id=v_t.id
        AND e.tipo='DINERO_DECLARACION_RESPONSABLE_SUSTITUYE_TRANSCRIPCION'
        AND e.payload->>'declaracion_id'=v_d.id::text
    ) INTO v_existing_worker_event;

    IF v_existing_worker_event AND v_d.monto IS NOT DISTINCT FROM p_monto
       AND v_d.estado_aprobacion IN ('ESPERANDO_APROBACION','PENDIENTE') THEN
      RETURN v_d;
    END IF;

    IF NOT v_existing_admin_event OR v_existing_worker_event
       OR v_d.estado_aprobacion NOT IN ('ESPERANDO_APROBACION','PENDIENTE')
       OR v_d.monto_contado IS NOT NULL THEN
      RAISE EXCEPTION 'Ya existe una declaración de la responsable o una declaración que requiere revisión administrativa; no se sobrescribió.' USING ERRCODE='23505';
    END IF;

    v_old_amount:=v_d.monto;
    v_old_state:=v_d.estado_aprobacion;
    UPDATE public.turno_declaraciones
    SET monto=p_monto,
        estado_aprobacion='ESPERANDO_APROBACION',
        aprobado_por=NULL,aprobado_at=NULL,
        monto_contado=NULL,contado_por=NULL,contado_at=NULL,
        diferencia=NULL,observacion_conteo=NULL
    WHERE id=v_d.id
    RETURNING * INTO v_d;

    INSERT INTO public.turno_eventos(
      turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload
    )
    VALUES(
      v_s.turno_id,v_s.id,v_t.id,auth.uid(),
      'DINERO_DECLARACION_RESPONSABLE_SUSTITUYE_TRANSCRIPCION',
      jsonb_build_object(
        'declaracion_id',v_d.id,
        'monto_anterior_transcripcion_admin',v_old_amount,
        'monto_declarado_responsable',p_monto,
        'estado_anterior',v_old_state,
        'transcripcion_original_conservada',true,
        'conteo_fisico',false
      )
    );
    RETURN v_d;
  END IF;

  RETURN public.bc_declarar_dinero(v_t.id,p_monto);
END;
$function$;

-- Direct physical entry in the PWA for the assigned responsible, including
-- after auto-seal. It remains anchored to the immutable operational cutoff.
CREATE OR REPLACE FUNCTION public.bc7_responsable_registrar_inventario_final_sellado_jornada(
  p_turno_sesion_id uuid,
  p_lineas jsonb,
  p_observacion text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_t public.turno_tramos;
  v_turn public.turnos;
  v_initial_cut uuid;
  v_expected integer;
  v_received integer;
  v_distinct integer;
  v_cut_id uuid;
  v_payload_hash text;
  v_existing jsonb;
  v_note text:=coalesce(nullif(left(btrim(coalesce(p_observacion,'')),1000),''),'Conteo físico realizado por la responsable desde la PWA al corte operativo original.');
BEGIN
  IF auth.uid() IS NULL OR NOT public.tiene_permiso('turnos','ver') THEN
    RAISE EXCEPTION 'Solo la responsable asignada con permiso de jornada puede registrar el inventario final.' USING ERRCODE='42501';
  END IF;
  IF p_turno_sesion_id IS NULL OR p_idempotency_key IS NULL
     OR p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array'
     OR jsonb_array_length(p_lineas)=0 OR jsonb_array_length(p_lineas)>500 THEN
    RAISE EXCEPTION 'Jornada, clave anti-duplicados y lista completa de productos son obligatorias.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
    WHERE jsonb_typeof(x.value)<>'object'
       OR coalesce(x.value->>'producto_id','') !~* '^[0-9a-f-]{36}$'
       OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
  ) THEN
    RAISE EXCEPTION 'Cada producto necesita una cantidad física no negativa con hasta 3 decimales.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id AND bloque='JORNADA'
    AND estado='CERRADA_OPERATIVAMENTE'
  FOR UPDATE;
  IF NOT FOUND OR v_s.corte_operativo_at IS NULL THEN
    RAISE EXCEPTION 'El inventario final tardío requiere una Jornada sellada con corte operativo inmutable.' USING ERRCODE='23514';
  END IF;
  v_t:=public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);
  SELECT * INTO v_turn
  FROM public.turnos
  WHERE id=v_s.turno_id
  FOR UPDATE;
  IF NOT FOUND OR v_turn.estado<>'ABIERTO'
     OR coalesce(v_turn.estado_maestro,v_turn.estado)<>'EN_CURSO' THEN
    RAISE EXCEPTION 'El Turno maestro ya está cerrado; no se admite el inventario final tardío.' USING ERRCODE='23514';
  END IF;
  IF v_t.estado<>'COMPLETADO' OR v_t.fin_at IS DISTINCT FROM v_s.corte_operativo_at
     OR v_t.usuario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No se encontró el tramo sellado correspondiente a la responsable.' USING ERRCODE='23514';
  END IF;

  v_payload_hash:=md5(p_lineas::text||'|'||v_note);
  SELECT e.payload INTO v_existing
  FROM public.turno_eventos e
  WHERE e.turno_sesion_id=v_s.id
    AND e.tipo='INVENTARIO_FINAL_RESPONSABLE_POST_SELLO'
    AND e.payload->>'idempotency_key'=p_idempotency_key::text
  ORDER BY e.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    IF v_existing->>'payload_hash' IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'La clave anti-duplicados ya se utilizó con otro conteo.' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object(
      'ok',true,'idempotente',true,
      'corte_id',v_existing->>'final_cut_id',
      'productos',v_existing->>'product_count',
      'corte_operativo_at',v_existing->>'corte_operativo_at'
    );
  END IF;

  SELECT c.id INTO v_initial_cut
  FROM public.turno_jornada_inventario_cortes c
  WHERE c.turno_sesion_id=v_s.id AND c.tipo='INICIAL' AND c.estado='CONFIRMADO'
  ORDER BY c.confirmado_en DESC NULLS LAST,c.creado_en DESC
  LIMIT 1;
  IF v_initial_cut IS NULL THEN
    RAISE EXCEPTION 'No existe inventario inicial confirmado para definir los productos del conteo.' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO v_expected
  FROM public.turno_jornada_inventario_lineas
  WHERE corte_id=v_initial_cut;
  SELECT count(*),count(DISTINCT (x.value->>'producto_id')::uuid)
    INTO v_received,v_distinct
  FROM jsonb_array_elements(p_lineas) x(value);
  IF v_expected=0 OR v_received<>v_expected OR v_distinct<>v_received THEN
    RAISE EXCEPTION 'El inventario final debe incluir exactamente los % productos del corte inicial; recibió %.',v_expected,v_received USING ERRCODE='23514';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
    WHERE NOT EXISTS(
      SELECT 1 FROM public.turno_jornada_inventario_lineas il
      WHERE il.corte_id=v_initial_cut
        AND il.producto_id=(x.value->>'producto_id')::uuid
    )
  ) OR EXISTS(
    SELECT 1 FROM public.turno_jornada_inventario_lineas il
    WHERE il.corte_id=v_initial_cut
      AND NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
        WHERE (x.value->>'producto_id')::uuid=il.producto_id
      )
  ) THEN
    RAISE EXCEPTION 'El conjunto de productos no coincide exactamente con el inventario inicial.' USING ERRCODE='23514';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=v_s.id AND c.tipo='FINAL'
  ) THEN
    RAISE EXCEPTION 'Esta Jornada ya tiene un inventario final. No se sobrescribió.' USING ERRCODE='23505';
  END IF;

  INSERT INTO public.turno_jornada_inventario_cortes(
    turno_sesion_id,tipo,estado,creado_por,confirmado_por,observacion
  )
  VALUES(
    v_s.id,'FINAL','CONFIRMADO',auth.uid(),auth.uid(),
    'Registro de responsable posterior al sello · efectivo al corte '||
      to_char(v_s.corte_operativo_at AT TIME ZONE 'America/Havana','YYYY-MM-DD HH24:MI')||
      ' America/Havana · '||v_note
  )
  RETURNING id INTO v_cut_id;

  WITH balances AS (
    SELECT coalesce(p.producto_padre_id,p.id) AS producto_id,
           sum(b.cantidad_actual)::numeric AS cantidad_actual
    FROM public.bc7_jornada_saldos_operativos(v_s.id) b
    JOIN public.productos p ON p.id=b.producto_id
    GROUP BY coalesce(p.producto_padre_id,p.id)
  )
  INSERT INTO public.turno_jornada_inventario_lineas(
    corte_id,producto_id,cantidad_contada,stock_sistema
  )
  SELECT v_cut_id,il.producto_id,
         (x.value->>'cantidad')::numeric,
         coalesce(balance.cantidad_actual,0)
  FROM public.turno_jornada_inventario_lineas il
  JOIN jsonb_array_elements(p_lineas) x(value)
    ON (x.value->>'producto_id')::uuid=il.producto_id
  LEFT JOIN balances balance ON balance.producto_id=il.producto_id
  WHERE il.corte_id=v_initial_cut;

  INSERT INTO public.turno_eventos(
    turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload
  )
  VALUES(
    v_s.turno_id,v_s.id,v_t.id,auth.uid(),'INVENTARIO_FINAL_RESPONSABLE_POST_SELLO',
    jsonb_build_object(
      'final_cut_id',v_cut_id,
      'idempotency_key',p_idempotency_key,
      'payload_hash',v_payload_hash,
      'product_count',v_expected,
      'corte_operativo_at',v_s.corte_operativo_at,
      'fecha_efectiva',to_char(v_s.corte_operativo_at AT TIME ZONE 'America/Havana','YYYY-MM-DD HH24:MI'),
      'stock_global_modificado',false,
      'corte_inicial_modificado',false,
      'responsable_id',auth.uid(),
      'observacion',v_note
    )
  );

  RETURN jsonb_build_object(
    'ok',true,'idempotente',false,'corte_id',v_cut_id,
    'productos',v_expected,'corte_operativo_at',v_s.corte_operativo_at,
    'stock_global_modificado',false
  );
END;
$function$;

-- Lock each operational category at the RPC boundary after the worker submits it.
-- Reopening the checklist step is the only way to accept another late record.
CREATE OR REPLACE FUNCTION public.bc7_validar_bloque_abierto_jornada(
  p_turno_sesion_id uuid,
  p_bloque text,
  p_idempotency_key uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_block text:=lower(coalesce(p_bloque,''));
  v_done boolean:=false;
  v_existing boolean:=false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF v_block NOT IN ('gastos','reinversiones','bajas') THEN
    RAISE EXCEPTION 'El bloque operativo indicado no es válido.' USING ERRCODE='22023';
  END IF;

  -- Exact idempotent retries are allowed after submission; each underlying
  -- RPC still validates that the retry key matches the original payload.
  SELECT EXISTS(
    SELECT 1 FROM public.gastos g
    WHERE v_block='gastos' AND g.idempotency_key=p_idempotency_key AND g.creado_por=auth.uid()
    UNION ALL
    SELECT 1 FROM public.reinversiones r
    WHERE v_block='reinversiones' AND r.idempotency_key=p_idempotency_key AND r.usuario_id=auth.uid()
    UNION ALL
    SELECT 1 FROM public.bajas_solicitudes s
    WHERE v_block='bajas' AND s.idempotency_key=p_idempotency_key AND s.creado_por=auth.uid()
    UNION ALL
    SELECT 1 FROM public.bajas b
    WHERE v_block='bajas' AND b.idempotency_key=p_idempotency_key AND b.creado_por=auth.uid()
    UNION ALL
    SELECT 1 FROM public.mermas m
    WHERE v_block='bajas' AND m.idempotency_key=p_idempotency_key AND m.creado_por=auth.uid()
  ) INTO v_existing;
  IF v_existing THEN RETURN; END IF;

  SELECT CASE v_block
    WHEN 'gastos' THEN c.gastos_completado
    WHEN 'reinversiones' THEN c.reinversiones_completado
    ELSE c.bajas_completado
  END INTO v_done
  FROM public.turno_jornada_confirmaciones c
  WHERE c.turno_sesion_id=p_turno_sesion_id;
  IF coalesce(v_done,false) THEN
    RAISE EXCEPTION 'Ya enviaste este bloque. Reábrelo desde el checklist antes de registrar otro elemento.' USING ERRCODE='23514';
  END IF;
END;
$function$;

-- Add the block lock after the existing server-side worker/session validation.
DO $patch_operational_block_write_locks$
DECLARE
  v_def text;
  v_pattern text:='v_t[[:space:]]*:=[[:space:]]*public[.]bc7_validar_tramo_responsable_jornada[[:space:]]*[(]p_turno_sesion_id[)][[:space:]]*;';
  v_replacement text;
BEGIN
  -- Preserve the matched tranche-validation assignment, then insert a second
  -- server-side guard immediately after it. quote_literal keeps the category
  -- literal safe while pg_get_functiondef is rewritten on the target server.
  v_replacement:=$replace$\&$replace$||chr(10)||
    '  PERFORM public.bc7_validar_bloque_abierto_jornada(p_turno_sesion_id,';

  SELECT pg_get_functiondef('public.bc7_registrar_gasto_jornada(uuid,text,numeric,text,uuid)'::regprocedure) INTO v_def;
  IF v_def !~* v_pattern THEN RAISE EXCEPTION 'Cannot install expenses checklist write lock.'; END IF;
  v_def:=regexp_replace(v_def,v_pattern,v_replacement||quote_literal('gastos')||',p_idempotency_key);','i');
  EXECUTE v_def;

  SELECT pg_get_functiondef('public.bc7_registrar_reinversion_jornada(uuid,jsonb,uuid,text)'::regprocedure) INTO v_def;
  IF v_def !~* v_pattern THEN RAISE EXCEPTION 'Cannot install reinvestment checklist write lock.'; END IF;
  v_def:=regexp_replace(v_def,v_pattern,v_replacement||quote_literal('reinversiones')||',p_idempotency_key);','i');
  EXECUTE v_def;

  SELECT pg_get_functiondef('public.bc7_registrar_bajas_multiple_jornada(uuid,jsonb,text,uuid)'::regprocedure) INTO v_def;
  IF v_def !~* v_pattern THEN RAISE EXCEPTION 'Cannot install Bajas checklist write lock.'; END IF;
  v_def:=regexp_replace(v_def,v_pattern,v_replacement||quote_literal('bajas')||',p_idempotency_key);','i');
  EXECUTE v_def;

  SELECT pg_get_functiondef('public.bc7_registrar_ajuste_jornada(uuid,text,uuid,numeric,text,uuid)'::regprocedure) INTO v_def;
  IF v_def !~* v_pattern THEN RAISE EXCEPTION 'Cannot install Merma/Baja checklist write lock.'; END IF;
  v_def:=regexp_replace(v_def,v_pattern,v_replacement||quote_literal('bajas')||');','i');
  EXECUTE v_def;
END;
$patch_operational_block_write_locks$;

REVOKE ALL ON FUNCTION public.bc7_validar_bloque_abierto_jornada(uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bc7_validar_bloque_abierto_jornada(uuid,text,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.bc7_validar_bloque_abierto_jornada(uuid,text,uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.bc5_responsable_declarar_dinero_jornada(uuid,numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bc5_responsable_declarar_dinero_jornada(uuid,numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.bc5_responsable_declarar_dinero_jornada(uuid,numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.bc7_responsable_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bc7_responsable_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.bc7_responsable_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,uuid) TO authenticated;

COMMIT;
