-- New salary snapshots and CuevaCoin bridge. No historical backfill or balance writes.
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS categoria_nomina text NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS beneficiario_usuario_id uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS cuevacoin_perfil_id uuid,
  ADD COLUMN IF NOT EXISTS cuevacoin_transaccion_id uuid,
  ADD COLUMN IF NOT EXISTS cuevacoin_pago_estado text NOT NULL DEFAULT 'NO_APLICA',
  ADD COLUMN IF NOT EXISTS cuevacoin_pago_error text,
  ADD COLUMN IF NOT EXISTS cuevacoin_intento_at timestamptz;
ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS gastos_categoria_nomina_check;
ALTER TABLE public.gastos ADD CONSTRAINT gastos_categoria_nomina_check
  CHECK (categoria_nomina IN ('LEGACY','OTROS','SALARIOS','UTILES_DE_LA_CAFETERIA'));
ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS gastos_cuevacoin_pago_estado_check;
ALTER TABLE public.gastos ADD CONSTRAINT gastos_cuevacoin_pago_estado_check
  CHECK (cuevacoin_pago_estado IN ('NO_APLICA','PENDIENTE','PROCESANDO','REINTENTAR','APLICADO'));

CREATE TABLE IF NOT EXISTS public.bc_cuevacoin_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bc_usuario_id uuid NOT NULL UNIQUE REFERENCES public.usuarios(id),
  cc_perfil_id uuid NOT NULL UNIQUE,
  confirmado_por uuid NOT NULL REFERENCES public.usuarios(id),
  confirmado_en timestamptz NOT NULL DEFAULT now(),
  activo boolean NOT NULL DEFAULT true,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bc_cuevacoin_vinculos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bc_cuevacoin_vinculos FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.bc_nomina_configuracion (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  modo_pago text NOT NULL DEFAULT 'MANUAL' CHECK(modo_pago IN ('MANUAL','AUTOMATICO')),
  actualizado_por uuid REFERENCES public.usuarios(id),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.bc_nomina_configuracion(id,modo_pago) VALUES(true,'MANUAL')
ON CONFLICT(id) DO NOTHING;
ALTER TABLE public.bc_nomina_configuracion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bc_nomina_configuracion FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.bc_nomina_salarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id uuid NOT NULL REFERENCES public.turnos(id),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  fecha_inicio date,
  fecha_fin date,
  ventas_total numeric(14,2) NOT NULL,
  porcentaje_resumen jsonb NOT NULL DEFAULT '[]'::jsonb,
  salario_bruto numeric(14,2) NOT NULL,
  descuentos_aprobados numeric(14,2) NOT NULL DEFAULT 0,
  salario_neto numeric(14,2),
  snapshot jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'RETENIDO'
    CHECK(estado IN ('RETENIDO','LISTO_PARA_PAGO','PROCESANDO','PAGADO','REVISION_MANUAL')),
  sucesor_turno_id uuid REFERENCES public.turnos(id),
  sucesor_sesion_id uuid REFERENCES public.turno_sesiones(id),
  validado_en timestamptz,
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  cuevacoin_perfil_id uuid,
  cuevacoin_transaccion_id uuid,
  pagado_por uuid REFERENCES public.usuarios(id),
  pagado_en timestamptz,
  ultimo_error text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bc_nomina_salario_turno_usuario_uq UNIQUE(turno_id,usuario_id),
  CONSTRAINT bc_nomina_salario_importes_ck CHECK(
    ventas_total>=0 AND salario_bruto>=0 AND descuentos_aprobados>=0
    AND (salario_neto IS NULL OR salario_neto>=0)
  )
);
ALTER TABLE public.bc_nomina_salarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bc_nomina_salarios FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS bc_nomina_salarios_estado_idx
  ON public.bc_nomina_salarios(estado,creado_en DESC);
CREATE INDEX IF NOT EXISTS gastos_nomina_pendientes_idx
  ON public.gastos(categoria_nomina,estado,creado_en DESC)
  WHERE categoria_nomina='SALARIOS';

CREATE OR REPLACE FUNCTION public.bc7_payroll_snapshot_turn(p_turno_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
  v_turn public.turnos%ROWTYPE;
  v_report jsonb;
  v_user_id uuid;
  v_sessions jsonb;
  v_sales numeric(14,2);
  v_gross numeric(14,2);
  v_discount numeric(14,2);
  v_start date;
  v_end date;
  v_invalid boolean;
  v_non_cup boolean;
  v_snapshot jsonb;
  v_status text;
  v_net numeric(14,2);
  v_count integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede congelar la nómina de una Jornada.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_turn FROM public.turnos
  WHERE id=p_turno_id AND dias_turno IS NOT NULL
    AND coalesce(estado_maestro,estado)='CERRADO' FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  v_report:=public.bc7_obtener_revision_jornada(p_turno_id);
  IF jsonb_typeof(v_report->'sesiones') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'No se pudo obtener la evidencia de liquidación de la Jornada.' USING ERRCODE='23514';
  END IF;

  FOR v_user_id IN
    SELECT DISTINCT nullif(x.value->>'responsable_id','')::uuid
    FROM jsonb_array_elements(v_report->'sesiones') x(value)
    WHERE nullif(x.value->>'responsable_id','') IS NOT NULL
  LOOP
    SELECT coalesce(jsonb_agg(x.value ORDER BY x.value->>'fecha',x.value->>'numero_dia'),'[]'::jsonb)
    INTO v_sessions
    FROM jsonb_array_elements(v_report->'sesiones') x(value)
    WHERE nullif(x.value->>'responsable_id','')::uuid=v_user_id
      AND x.value->>'estado'='COMPLETADA';
    IF jsonb_array_length(v_sessions)=0 THEN CONTINUE; END IF;

    SELECT round(coalesce(sum(nullif(x.value->'liquidacion'->>'ventas_estimadas','')::numeric),0),2),
      round(coalesce(sum(nullif(x.value->'liquidacion'->>'salario_calculado','')::numeric),0),2),
      min(nullif(x.value->>'fecha','')::date),
      max(coalesce(nullif(x.value->>'fecha_fin','')::date,nullif(x.value->>'fecha','')::date)),
      bool_or(coalesce((x.value->'liquidacion'->>'calculable')::boolean,false) IS NOT TRUE
        OR nullif(x.value->'liquidacion'->>'ventas_estimadas','') IS NULL
        OR nullif(x.value->'liquidacion'->>'salario_calculado','') IS NULL)
    INTO v_sales,v_gross,v_start,v_end,v_invalid
    FROM jsonb_array_elements(v_sessions) x(value);

    SELECT round(coalesce(sum(d.monto),0),2),
      coalesce(bool_or(coalesce(d.moneda,'CUP')<>'CUP'),false)
    INTO v_discount,v_non_cup
    FROM public.turno_descuentos d
    WHERE d.turno_id=p_turno_id AND d.usuario_id=v_user_id;

    v_status:=CASE WHEN coalesce(v_invalid,false) OR coalesce(v_non_cup,false)
      OR v_discount>v_gross THEN 'REVISION_MANUAL' ELSE 'RETENIDO' END;
    v_net:=CASE WHEN v_status='REVISION_MANUAL' THEN NULL ELSE round(v_gross-v_discount,2) END;

    v_snapshot:=jsonb_build_object(
      'turno_id',p_turno_id,'almacen_id',v_turn.almacen_id,'bc_usuario_id',v_user_id,
      'fecha_inicio',v_start,'fecha_fin',v_end,'ventas_total',v_sales,
      'salario_bruto',v_gross,'descuentos_aprobados',v_discount,'salario_neto',v_net,
      'moneda','CUP','sesiones',v_sessions,
      'descuentos',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',d.id,'sesion_id',d.turno_sesion_id,'monto',d.monto,'moneda',d.moneda,
        'motivo',d.motivo,'creado_en',d.created_at) ORDER BY d.created_at,d.id)
        FROM public.turno_descuentos d WHERE d.turno_id=p_turno_id AND d.usuario_id=v_user_id),'[]'::jsonb),
      'congelado_en',now(),'fuente','bc7_obtener_revision_jornada'
    );

    INSERT INTO public.bc_nomina_salarios(
      turno_id,almacen_id,usuario_id,fecha_inicio,fecha_fin,ventas_total,
      porcentaje_resumen,salario_bruto,descuentos_aprobados,salario_neto,snapshot,estado
    ) VALUES (
      p_turno_id,v_turn.almacen_id,v_user_id,v_start,v_end,v_sales,
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'fecha',x.value->>'fecha','fecha_fin',x.value->>'fecha_fin',
        'porcentaje',x.value->>'salario_porcentaje',
        'ventas',x.value->'liquidacion'->'ventas_estimadas',
        'salario_bruto',x.value->'liquidacion'->'salario_calculado'
      ) ORDER BY x.value->>'fecha') FROM jsonb_array_elements(v_sessions) x(value)),'[]'::jsonb),
      v_gross,v_discount,v_net,v_snapshot,v_status
    ) ON CONFLICT(turno_id,usuario_id) DO NOTHING;
    IF FOUND THEN v_count:=v_count+1; END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_unlock_predecessor(p_successor_turn_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
  v_source_turn uuid;
  v_source_session uuid;
  v_target_session uuid;
  v_count integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede liberar nómina por sucesión validada.' USING ERRCODE='42501';
  END IF;
  SELECT src.turno_id,src.id,dst.id INTO v_source_turn,v_source_session,v_target_session
  FROM public.turno_jornada_inventario_entregas e
  JOIN public.turno_sesiones src ON src.id=e.origen_sesion_id
  JOIN public.turno_sesiones dst ON dst.id=e.destino_sesion_id
  JOIN public.turnos source_turn ON source_turn.id=src.turno_id
  JOIN public.turnos target_turn ON target_turn.id=dst.turno_id
  JOIN public.turno_jornada_programacion sp ON sp.id=src.jornada_programacion_id
  JOIN public.turno_jornada_programacion dp ON dp.id=dst.jornada_programacion_id
  WHERE dst.turno_id=p_successor_turn_id AND src.turno_id<>dst.turno_id
    AND e.estado='ACEPTADA' AND e.destino_sesion_id IS NOT NULL
    AND e.almacen_id=src.almacen_id AND src.almacen_id=dst.almacen_id
    AND source_turn.dias_turno IS NOT NULL
    AND coalesce(source_turn.estado_maestro,source_turn.estado)='CERRADO'
    AND coalesce(target_turn.estado_maestro,target_turn.estado)='CERRADO'
    AND src.estado='COMPLETADA' AND dst.estado='COMPLETADA'
    AND src.id=(SELECT s2.id FROM public.turno_sesiones s2
      JOIN public.turno_jornada_programacion p2 ON p2.id=s2.jornada_programacion_id
      WHERE s2.turno_id=src.turno_id AND s2.almacen_id=src.almacen_id
        AND s2.bloque='JORNADA' AND s2.estado='COMPLETADA'
      ORDER BY coalesce(p2.fecha_fin,p2.fecha) DESC,p2.numero_dia DESC,s2.id DESC LIMIT 1)
    AND dst.id=(SELECT s3.id FROM public.turno_sesiones s3
      JOIN public.turno_jornada_programacion p3 ON p3.id=s3.jornada_programacion_id
      WHERE s3.turno_id=dst.turno_id AND s3.almacen_id=dst.almacen_id
        AND s3.bloque='JORNADA' AND s3.estado='COMPLETADA'
      ORDER BY p3.fecha,p3.numero_dia,s3.id LIMIT 1)
  ORDER BY e.creado_en DESC,e.id LIMIT 1;

  IF v_source_turn IS NULL THEN RETURN 0; END IF;
  UPDATE public.bc_nomina_salarios
  SET sucesor_turno_id=p_successor_turn_id,sucesor_sesion_id=v_target_session,
    validado_en=now(),estado=CASE WHEN estado='RETENIDO' THEN 'LISTO_PARA_PAGO' ELSE estado END,
    actualizado_en=now()
  WHERE turno_id=v_source_turn AND sucesor_turno_id IS NULL
    AND estado IN ('RETENIDO','REVISION_MANUAL');
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count>0 THEN
    INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)
    VALUES(v_source_turn,v_source_session,auth.uid(),'NOMINA_RETENIDA_VALIDADA_POR_SUCESORA',
      jsonb_build_object('successor_turn_id',p_successor_turn_id,
        'successor_session_id',v_target_session,'source_session_id',v_source_session,
        'salaries_unlocked',v_count,'evidence','turno_jornada_inventario_entregas.estado=ACEPTADA'));
  END IF;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_on_turn_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.dias_turno IS NOT NULL
    AND coalesce(NEW.estado_maestro,NEW.estado)='CERRADO'
    AND coalesce(OLD.estado_maestro,OLD.estado) IS DISTINCT FROM 'CERRADO'
    AND EXISTS(SELECT 1 FROM public.turno_sesiones s
      WHERE s.turno_id=NEW.id AND s.bloque='JORNADA') THEN
    PERFORM public.bc7_payroll_snapshot_turn(NEW.id);
    PERFORM public.bc7_payroll_unlock_predecessor(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_bc7_payroll_on_turn_approved ON public.turnos;
CREATE TRIGGER trg_bc7_payroll_on_turn_approved
AFTER UPDATE OF estado_maestro ON public.turnos
FOR EACH ROW EXECUTE FUNCTION public.bc7_payroll_on_turn_approved();

CREATE OR REPLACE FUNCTION public.bc7_payroll_guard_expense_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='INSERT' AND (
       NEW.categoria_nomina<>'LEGACY' OR NEW.beneficiario_usuario_id IS NOT NULL
       OR NEW.cuevacoin_perfil_id IS NOT NULL OR NEW.cuevacoin_transaccion_id IS NOT NULL
     ) AND current_setting('bc.payroll_internal_write',true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'La categoría de gasto solo puede asignarse mediante el flujo seguro.'
      USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND ROW(NEW.categoria_nomina,NEW.beneficiario_usuario_id,
       NEW.cuevacoin_perfil_id,NEW.cuevacoin_transaccion_id,NEW.cuevacoin_pago_estado,
       NEW.cuevacoin_pago_error) IS DISTINCT FROM ROW(OLD.categoria_nomina,
       OLD.beneficiario_usuario_id,OLD.cuevacoin_perfil_id,OLD.cuevacoin_transaccion_id,
       OLD.cuevacoin_pago_estado,OLD.cuevacoin_pago_error)
       AND current_setting('bc.payroll_internal_write',true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Los datos de nómina solo pueden cambiar mediante el flujo seguro.'
      USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND OLD.estado='PENDIENTE' AND NEW.estado='APROBADO'
     AND NEW.categoria_nomina='SALARIOS'
     AND (NEW.cuevacoin_pago_estado IS DISTINCT FROM 'APLICADO'
       OR NEW.cuevacoin_transaccion_id IS NULL OR NEW.cuevacoin_perfil_id IS NULL) THEN
    RAISE EXCEPTION 'No se puede aprobar un retiro de salario sin confirmar el débito en CuevaCoin.'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_bc7_payroll_guard_expense_fields ON public.gastos;
CREATE TRIGGER trg_bc7_payroll_guard_expense_fields
BEFORE INSERT OR UPDATE ON public.gastos
FOR EACH ROW EXECUTE FUNCTION public.bc7_payroll_guard_expense_fields();


CREATE OR REPLACE FUNCTION public.bc7_payroll_assert_admin()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin autenticado puede operar nómina.' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('ok',true,'bc_usuario_id',auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_list_employees()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.bc7_payroll_assert_admin();
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'bc_usuario_id',u.id,'nombre',u.nombre,'username',u.username,
    'activo',u.activo,'archivado',coalesce(u.archivado,false),
    'cc_perfil_id',m.cc_perfil_id,'vinculado',coalesce(m.activo,false),
    'confirmado_en',m.confirmado_en
  ) ORDER BY u.nombre,u.id),'[]'::jsonb)
  INTO v_result
  FROM public.usuarios u
  LEFT JOIN public.bc_cuevacoin_vinculos m ON m.bc_usuario_id=u.id AND m.activo
  WHERE u.id<>auth.uid() AND u.activo IS TRUE AND coalesce(u.archivado,false) IS FALSE;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_list_mapped_employees()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.bc_actor_is_admin() AND NOT public.tiene_permiso('gastos','crear') THEN
    RAISE EXCEPTION 'No tienes permiso para consultar destinatarios de gastos.' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'bc_usuario_id',u.id,'nombre',u.nombre,'cc_perfil_id',m.cc_perfil_id
  ) ORDER BY u.nombre,u.id),'[]'::jsonb)
  INTO v_result
  FROM public.bc_cuevacoin_vinculos m
  JOIN public.usuarios u ON u.id=m.bc_usuario_id
  WHERE m.activo AND u.activo IS TRUE AND coalesce(u.archivado,false) IS FALSE;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_set_mapping(p_bc_usuario_id uuid,p_cc_perfil_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user public.usuarios%ROWTYPE; v_result public.bc_cuevacoin_vinculos%ROWTYPE;
BEGIN
  PERFORM public.bc7_payroll_assert_admin();
  IF p_bc_usuario_id IS NULL OR p_cc_perfil_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona a la persona y su cuenta dependiente de CuevaCoin.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_user FROM public.usuarios
  WHERE id=p_bc_usuario_id AND activo IS TRUE AND coalesce(archivado,false) IS FALSE FOR UPDATE;
  IF NOT FOUND OR p_bc_usuario_id=auth.uid() THEN
    RAISE EXCEPTION 'La cuenta BattleCruiser no está disponible para nómina.' USING ERRCODE='23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bc7-payroll-link:'||p_bc_usuario_id::text,0));
  IF EXISTS(SELECT 1 FROM public.bc_cuevacoin_vinculos
    WHERE cc_perfil_id=p_cc_perfil_id AND bc_usuario_id<>p_bc_usuario_id AND activo) THEN
    RAISE EXCEPTION 'Esta cuenta CuevaCoin ya está vinculada a otra persona.' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.bc_cuevacoin_vinculos
    (bc_usuario_id,cc_perfil_id,confirmado_por,confirmado_en,activo,actualizado_en)
  VALUES(p_bc_usuario_id,p_cc_perfil_id,auth.uid(),now(),true,now())
  ON CONFLICT(bc_usuario_id) DO UPDATE SET
    cc_perfil_id=EXCLUDED.cc_perfil_id,confirmado_por=auth.uid(),
    confirmado_en=now(),activo=true,actualizado_en=now()
  RETURNING * INTO v_result;
  RETURN jsonb_build_object('ok',true,'bc_usuario_id',v_result.bc_usuario_id,
    'cc_perfil_id',v_result.cc_perfil_id,'confirmado_en',v_result.confirmado_en);
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_get_settings()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.bc_nomina_configuracion%ROWTYPE;
BEGIN
  PERFORM public.bc7_payroll_assert_admin();
  SELECT * INTO v_row FROM public.bc_nomina_configuracion WHERE id=true;
  RETURN jsonb_build_object('modo_pago',v_row.modo_pago,'actualizado_en',v_row.actualizado_en);
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_set_mode(p_modo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.bc_nomina_configuracion%ROWTYPE;
BEGIN
  PERFORM public.bc7_payroll_assert_admin();
  IF p_modo NOT IN ('MANUAL','AUTOMATICO') THEN
    RAISE EXCEPTION 'El modo debe ser MANUAL o AUTOMATICO.' USING ERRCODE='22023';
  END IF;
  UPDATE public.bc_nomina_configuracion SET modo_pago=p_modo,
    actualizado_por=auth.uid(),actualizado_en=now() WHERE id=true RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok',true,'modo_pago',v_row.modo_pago,'actualizado_en',v_row.actualizado_en);
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_registrar_gasto_jornada(
  p_turno_sesion_id uuid,p_categoria text,p_beneficiario_usuario_id uuid,
  p_concepto text,p_monto numeric,p_descripcion text,p_idempotency_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_category text:=upper(coalesce(p_categoria,'OTROS'));
  v_id uuid;
  v_existing public.gastos%ROWTYPE;
  v_mapping public.bc_cuevacoin_vinculos%ROWTYPE;
BEGIN
  IF v_category NOT IN ('OTROS','SALARIOS','UTILES_DE_LA_CAFETERIA') THEN
    RAISE EXCEPTION 'Categoría de gasto inválida.' USING ERRCODE='22023';
  END IF;
  IF v_category='SALARIOS' THEN
    IF p_beneficiario_usuario_id IS NULL THEN
      RAISE EXCEPTION 'Selecciona quién recibe el retiro de salario.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_mapping FROM public.bc_cuevacoin_vinculos
    WHERE bc_usuario_id=p_beneficiario_usuario_id AND activo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La persona aún no tiene una cuenta CuevaCoin confirmada.' USING ERRCODE='23514';
    END IF;
  ELSIF p_beneficiario_usuario_id IS NOT NULL THEN
    RAISE EXCEPTION 'Solo SALARIOS admite beneficiario.' USING ERRCODE='22023';
  END IF;
  v_id:=public.bc7_registrar_gasto_jornada(
    p_turno_sesion_id,p_concepto,p_monto,p_descripcion,p_idempotency_key
  );
  SELECT * INTO v_existing FROM public.gastos WHERE id=v_id FOR UPDATE;
  IF v_existing.categoria_nomina NOT IN ('LEGACY',v_category)
     OR (v_existing.categoria_nomina<>'LEGACY'
       AND v_existing.beneficiario_usuario_id IS DISTINCT FROM p_beneficiario_usuario_id) THEN
    RAISE EXCEPTION 'La clave de idempotencia ya pertenece a otro tipo de gasto.' USING ERRCODE='23505';
  END IF;
  PERFORM set_config('bc.payroll_internal_write','1',true);
  UPDATE public.gastos SET categoria_nomina=v_category,
    beneficiario_usuario_id=p_beneficiario_usuario_id,
    cuevacoin_perfil_id=CASE WHEN v_category='SALARIOS' THEN v_mapping.cc_perfil_id ELSE NULL END,
    cuevacoin_pago_estado=CASE WHEN v_category='SALARIOS' THEN 'PENDIENTE' ELSE 'NO_APLICA' END
  WHERE id=v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_list_expenses_for_session(p_turno_sesion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_s public.turno_sesiones%ROWTYPE; v_result jsonb;
BEGIN
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR (NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('gastos','ver')
    OR NOT EXISTS(SELECT 1 FROM public.turno_jornada_programacion jp
      WHERE jp.id=v_s.jornada_programacion_id AND jp.responsable_id=auth.uid())
    AND NOT EXISTS(SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL)
  )) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar estos gastos.' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',g.id,'concepto',g.concepto,'descripcion',g.descripcion,'monto',g.monto,
    'estado',g.estado,'creado_en',g.creado_en,'creado_nombre',g.creado_nombre,
    'revisado_nombre',g.revisado_nombre,'comentario_revision',g.comentario_revision,
    'fecha_revision',g.fecha_revision,'categoria',g.categoria_nomina,
    'beneficiario_usuario_id',g.beneficiario_usuario_id,'beneficiario_nombre',u.nombre,
    'cuevacoin_pago_estado',g.cuevacoin_pago_estado,
    'cuevacoin_transaccion_id',g.cuevacoin_transaccion_id,
    'cuevacoin_pago_error',g.cuevacoin_pago_error
  ) ORDER BY g.creado_en,g.id),'[]'::jsonb)
  INTO v_result FROM public.gastos g
  LEFT JOIN public.usuarios u ON u.id=g.beneficiario_usuario_id
  WHERE g.turno_sesion_id=p_turno_sesion_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_list_salaries()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.bc7_payroll_assert_admin();
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',n.id,'turno_id',n.turno_id,'almacen_id',n.almacen_id,'almacen_nombre',a.nombre,
    'usuario_id',n.usuario_id,'empleado_nombre',u.nombre,'fecha_inicio',n.fecha_inicio,
    'fecha_fin',n.fecha_fin,'ventas_total',n.ventas_total,'porcentaje_resumen',n.porcentaje_resumen,
    'salario_bruto',n.salario_bruto,'descuentos_aprobados',n.descuentos_aprobados,
    'salario_neto',n.salario_neto,'estado',n.estado,'snapshot',n.snapshot,
    'sucesor_turno_id',n.sucesor_turno_id,'sucesor_sesion_id',n.sucesor_sesion_id,
    'validado_en',n.validado_en,'cc_vinculado',m.cc_perfil_id IS NOT NULL AND m.activo,
    'cc_perfil_id',m.cc_perfil_id,'cuevacoin_transaccion_id',n.cuevacoin_transaccion_id,
    'pagado_en',n.pagado_en,'ultimo_error',n.ultimo_error,
    'sucesor_almacen',sa.nombre,'sucesor_empleado',su.nombre,'sucesor_fecha',sp.fecha
  ) ORDER BY n.creado_en DESC,n.fecha_inicio DESC),'[]'::jsonb)
  INTO v_result FROM public.bc_nomina_salarios n
  JOIN public.usuarios u ON u.id=n.usuario_id
  JOIN public.almacenes a ON a.id=n.almacen_id
  LEFT JOIN public.bc_cuevacoin_vinculos m ON m.bc_usuario_id=n.usuario_id AND m.activo
  LEFT JOIN public.turnos st ON st.id=n.sucesor_turno_id
  LEFT JOIN public.almacenes sa ON sa.id=st.almacen_id
  LEFT JOIN public.turno_sesiones ss ON ss.id=n.sucesor_sesion_id
  LEFT JOIN public.turno_jornada_programacion sp ON sp.id=ss.jornada_programacion_id
  LEFT JOIN public.usuarios su ON su.id=sp.responsable_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_list_pending_withdrawals()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.bc7_payroll_assert_admin();
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',g.id,'turno_sesion_id',g.turno_sesion_id,'almacen_id',g.almacen_id,
    'almacen_nombre',a.nombre,'concepto',g.concepto,'descripcion',g.descripcion,
    'monto',g.monto,'estado',g.estado,'beneficiario_usuario_id',g.beneficiario_usuario_id,
    'beneficiario_nombre',u.nombre,'categoria',g.categoria_nomina,
    'cuevacoin_pago_estado',g.cuevacoin_pago_estado,'cuevacoin_pago_error',g.cuevacoin_pago_error,
    'creado_nombre',g.creado_nombre,'creado_en',g.creado_en
  ) ORDER BY g.creado_en,g.id),'[]'::jsonb)
  INTO v_result FROM public.gastos g
  JOIN public.almacenes a ON a.id=g.almacen_id
  LEFT JOIN public.usuarios u ON u.id=g.beneficiario_usuario_id
  WHERE g.categoria_nomina='SALARIOS' AND g.estado='PENDIENTE';
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_begin_credit(p_salary_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n public.bc_nomina_salarios%ROWTYPE; m public.bc_cuevacoin_vinculos%ROWTYPE;
BEGIN
  PERFORM public.bc7_payroll_assert_admin();
  SELECT * INTO n FROM public.bc_nomina_salarios WHERE id=p_salary_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago salarial no encontrado.' USING ERRCODE='23503'; END IF;
  IF n.estado='PAGADO' THEN
    RETURN jsonb_build_object('ok',true,'ya_pagado',true,'transaccion_id',n.cuevacoin_transaccion_id,'id',n.id);
  END IF;
  IF n.estado NOT IN ('LISTO_PARA_PAGO','PROCESANDO') OR n.salario_neto IS NULL OR n.salario_neto<=0 THEN
    RAISE EXCEPTION 'El salario sigue retenido o requiere revisión.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO m FROM public.bc_cuevacoin_vinculos
  WHERE bc_usuario_id=n.usuario_id AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Falta confirmar el vínculo CuevaCoin.' USING ERRCODE='23514'; END IF;
  IF n.estado='LISTO_PARA_PAGO' THEN
    UPDATE public.bc_nomina_salarios SET estado='PROCESANDO',cuevacoin_perfil_id=m.cc_perfil_id,
      ultimo_error=NULL,actualizado_en=now() WHERE id=n.id RETURNING * INTO n;
  END IF;
  RETURN jsonb_build_object('ok',true,'id',n.id,'tipo','DEPOSITO',
    'cc_perfil_id',m.cc_perfil_id,'monto',n.salario_neto,
    'idempotency_key',n.idempotency_key,'referencia_externa',n.id::text,
    'motivo','Salario BattleCruiser · turno '||coalesce(n.fecha_inicio::text,'')||' a '||coalesce(n.fecha_fin::text,''));
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_finish_credit(p_salary_id uuid,p_cc_transaccion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n public.bc_nomina_salarios%ROWTYPE;
BEGIN
  PERFORM public.bc7_payroll_assert_admin();
  IF p_cc_transaccion_id IS NULL THEN RAISE EXCEPTION 'Falta la transacción confirmada de CuevaCoin.'; END IF;
  SELECT * INTO n FROM public.bc_nomina_salarios WHERE id=p_salary_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago salarial no encontrado.'; END IF;
  IF n.estado='PAGADO' AND n.cuevacoin_transaccion_id=p_cc_transaccion_id THEN
    RETURN jsonb_build_object('ok',true,'repetido',true,'id',n.id,'estado',n.estado);
  END IF;
  IF n.estado<>'PROCESANDO' OR n.cuevacoin_perfil_id IS NULL THEN
    RAISE EXCEPTION 'El salario no está preparado para confirmar.' USING ERRCODE='23514';
  END IF;
  UPDATE public.bc_nomina_salarios SET estado='PAGADO',cuevacoin_transaccion_id=p_cc_transaccion_id,
    pagado_por=auth.uid(),pagado_en=now(),ultimo_error=NULL,actualizado_en=now() WHERE id=n.id;
  RETURN jsonb_build_object('ok',true,'repetido',false,'id',n.id,'estado','PAGADO',
    'cuevacoin_transaccion_id',p_cc_transaccion_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_retry_credit(p_salary_id uuid,p_error text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.bc7_payroll_assert_admin();
  UPDATE public.bc_nomina_salarios SET estado='LISTO_PARA_PAGO',
    ultimo_error=left(coalesce(p_error,'No se pudo confirmar el abono en CuevaCoin.'),500),
    actualizado_en=now()
  WHERE id=p_salary_id AND estado IN ('PROCESANDO','LISTO_PARA_PAGO');
  RETURN jsonb_build_object('ok',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_begin_withdrawal(p_gasto_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g public.gastos%ROWTYPE; m public.bc_cuevacoin_vinculos%ROWTYPE;
BEGIN
  PERFORM public.bc7_payroll_assert_admin();
  SELECT * INTO g FROM public.gastos WHERE id=p_gasto_id FOR UPDATE;
  IF NOT FOUND OR g.categoria_nomina<>'SALARIOS' THEN
    RAISE EXCEPTION 'Gasto salarial no encontrado.' USING ERRCODE='23503';
  END IF;
  IF g.estado='APROBADO' AND g.cuevacoin_pago_estado='APLICADO' AND g.cuevacoin_transaccion_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'ya_aplicado',true,'transaccion_id',g.cuevacoin_transaccion_id,'id',g.id);
  END IF;
  IF g.estado<>'PENDIENTE' OR g.cuevacoin_pago_estado NOT IN ('PENDIENTE','PROCESANDO','REINTENTAR') THEN
    RAISE EXCEPTION 'Este gasto ya no está pendiente para pagar.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO m FROM public.bc_cuevacoin_vinculos
  WHERE bc_usuario_id=g.beneficiario_usuario_id AND activo;
  IF NOT FOUND OR m.cc_perfil_id IS DISTINCT FROM g.cuevacoin_perfil_id THEN
    RAISE EXCEPTION 'El vínculo CuevaCoin cambió; revisa este gasto.' USING ERRCODE='23514';
  END IF;
  PERFORM set_config('bc.payroll_internal_write','1',true);
  UPDATE public.gastos SET cuevacoin_pago_estado='PROCESANDO',
    cuevacoin_pago_error=NULL,cuevacoin_intento_at=now() WHERE id=g.id;
  RETURN jsonb_build_object('ok',true,'id',g.id,'tipo','RETIRO',
    'cc_perfil_id',m.cc_perfil_id,'monto',g.monto,
    'idempotency_key',g.idempotency_key,'referencia_externa',g.id::text,
    'motivo','Retiro de salario acumulado · '||g.concepto);
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_finish_withdrawal(p_gasto_id uuid,p_cc_transaccion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g public.gastos%ROWTYPE; v_name text;
BEGIN
  PERFORM public.bc7_payroll_assert_admin();
  IF p_cc_transaccion_id IS NULL THEN RAISE EXCEPTION 'Falta la transacción confirmada de CuevaCoin.'; END IF;
  SELECT * INTO g FROM public.gastos WHERE id=p_gasto_id FOR UPDATE;
  IF NOT FOUND OR g.categoria_nomina<>'SALARIOS' THEN RAISE EXCEPTION 'Gasto salarial no encontrado.'; END IF;
  IF g.estado='APROBADO' AND g.cuevacoin_pago_estado='APLICADO' AND g.cuevacoin_transaccion_id=p_cc_transaccion_id THEN
    RETURN jsonb_build_object('ok',true,'repetido',true,'id',g.id,'estado',g.estado);
  END IF;
  IF g.estado<>'PENDIENTE' OR g.cuevacoin_pago_estado NOT IN ('PROCESANDO','REINTENTAR') THEN
    RAISE EXCEPTION 'El gasto no está preparado para confirmar.' USING ERRCODE='23514';
  END IF;
  SELECT nombre INTO v_name FROM public.usuarios WHERE id=g.beneficiario_usuario_id;
  PERFORM set_config('bc.payroll_internal_write','1',true);
  UPDATE public.gastos SET estado='APROBADO',cuevacoin_pago_estado='APLICADO',
    cuevacoin_transaccion_id=p_cc_transaccion_id,revisado_por=auth.uid(),
    revisado_nombre=(SELECT nombre FROM public.usuarios WHERE id=auth.uid()),
    fecha_revision=now(),comentario_revision='Débito confirmado en CuevaCoin · transacción '||p_cc_transaccion_id::text,
    cuevacoin_pago_error=NULL,actualizado_en=now() WHERE id=g.id;
  RETURN jsonb_build_object('ok',true,'repetido',false,'id',g.id,'estado','APROBADO',
    'beneficiario',v_name,'cuevacoin_transaccion_id',p_cc_transaccion_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_retry_withdrawal(p_gasto_id uuid,p_error text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.bc7_payroll_assert_admin();
  PERFORM set_config('bc.payroll_internal_write','1',true);
  UPDATE public.gastos SET cuevacoin_pago_estado='REINTENTAR',
    cuevacoin_pago_error=left(coalesce(p_error,'No se pudo confirmar el débito en CuevaCoin.'),500),
    actualizado_en=now()
  WHERE id=p_gasto_id AND categoria_nomina='SALARIOS' AND estado='PENDIENTE';
  RETURN jsonb_build_object('ok',true);
END;
$$;

REVOKE ALL ON FUNCTION public.bc7_payroll_assert_admin() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_list_employees() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_list_mapped_employees() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_set_mapping(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_get_settings() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_set_mode(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_registrar_gasto_jornada(uuid,text,uuid,text,numeric,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_list_expenses_for_session(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_list_salaries() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_list_pending_withdrawals() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_begin_credit(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_finish_credit(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_retry_credit(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_begin_withdrawal(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_finish_withdrawal(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_retry_withdrawal(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc7_payroll_snapshot_turn(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_payroll_unlock_predecessor(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_payroll_on_turn_approved() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_payroll_guard_expense_fields() FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.bc7_payroll_assert_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_payroll_list_employees() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_payroll_list_mapped_employees() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_payroll_set_mapping(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_payroll_get_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_payroll_set_mode(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_payroll_registrar_gasto_jornada(uuid,text,uuid,text,numeric,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_payroll_list_expenses_for_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_payroll_list_salaries() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_payroll_list_pending_withdrawals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_payroll_begin_credit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_payroll_finish_credit(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_payroll_retry_credit(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_payroll_begin_withdrawal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_payroll_finish_withdrawal(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_payroll_retry_withdrawal(uuid,text) TO authenticated;

COMMENT ON TABLE public.bc_nomina_salarios IS
  'Snapshots salariales inmutables creados al aprobar un Turno Jornada; liberación solo por entrega física aceptada al sucesor.';
COMMENT ON TABLE public.bc_cuevacoin_vinculos IS
  'Vínculos confirmados por ADMIN entre usuarios BattleCruiser y perfiles dependientes activos de CuevaCoin.';
COMMENT ON COLUMN public.gastos.categoria_nomina IS
  'LEGACY preserva registros anteriores sin reclasificarlos. Los nuevos gastos pueden ser OTROS, SALARIOS o UTILES_DE_LA_CAFETERIA.';
