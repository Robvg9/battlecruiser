-- Payroll identity links are restricted to active BattleCruiser dependientas.
-- No employee mappings, salary snapshots, expenses or balances are changed.
CREATE OR REPLACE FUNCTION public.bc7_payroll_list_employees()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.bc7_payroll_assert_admin();

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'bc_usuario_id',u.id,
    'nombre',u.nombre,
    'username',u.username,
    'activo',u.activo,
    'archivado',coalesce(u.archivado,false),
    'cc_perfil_id',m.cc_perfil_id,
    'vinculado',coalesce(m.activo,false),
    'confirmado_en',m.confirmado_en
  ) ORDER BY u.nombre,u.id),'[]'::jsonb)
  INTO v_result
  FROM public.usuarios u
  JOIN public.roles r ON r.id=u.role_id
  LEFT JOIN public.bc_cuevacoin_vinculos m
    ON m.bc_usuario_id=u.id AND m.activo
  WHERE u.id<>auth.uid()
    AND u.activo IS TRUE
    AND coalesce(u.archivado,false) IS FALSE
    AND r.activo IS TRUE
    AND lower(btrim(r.nombre)) IN ('dependienta','dependientas');

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_payroll_set_mapping(
  p_bc_usuario_id uuid,
  p_cc_perfil_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user public.usuarios%ROWTYPE;
  v_result public.bc_cuevacoin_vinculos%ROWTYPE;
BEGIN
  PERFORM public.bc7_payroll_assert_admin();

  IF p_bc_usuario_id IS NULL OR p_cc_perfil_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona a la persona y su cuenta dependiente de CuevaCoin.'
      USING ERRCODE='22023';
  END IF;

  SELECT u.* INTO v_user
  FROM public.usuarios u
  JOIN public.roles r ON r.id=u.role_id
  WHERE u.id=p_bc_usuario_id
    AND u.activo IS TRUE
    AND coalesce(u.archivado,false) IS FALSE
    AND r.activo IS TRUE
    AND lower(btrim(r.nombre)) IN ('dependienta','dependientas')
  FOR UPDATE OF u;

  IF NOT FOUND OR p_bc_usuario_id=auth.uid() THEN
    RAISE EXCEPTION 'La cuenta BattleCruiser no es una dependienta activa disponible para nómina.'
      USING ERRCODE='23514';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('bc7-payroll-link:'||p_bc_usuario_id::text,0)
  );

  IF EXISTS(
    SELECT 1
    FROM public.bc_cuevacoin_vinculos
    WHERE cc_perfil_id=p_cc_perfil_id
      AND bc_usuario_id<>p_bc_usuario_id
      AND activo
  ) THEN
    RAISE EXCEPTION 'Esta cuenta CuevaCoin ya está vinculada a otra persona.'
      USING ERRCODE='23505';
  END IF;

  INSERT INTO public.bc_cuevacoin_vinculos
    (bc_usuario_id,cc_perfil_id,confirmado_por,confirmado_en,activo,actualizado_en)
  VALUES
    (p_bc_usuario_id,p_cc_perfil_id,auth.uid(),now(),true,now())
  ON CONFLICT(bc_usuario_id) DO UPDATE SET
    cc_perfil_id=EXCLUDED.cc_perfil_id,
    confirmado_por=auth.uid(),
    confirmado_en=now(),
    activo=true,
    actualizado_en=now()
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'ok',true,
    'bc_usuario_id',v_result.bc_usuario_id,
    'cc_perfil_id',v_result.cc_perfil_id,
    'confirmado_en',v_result.confirmado_en
  );
END;
$function$;

COMMENT ON FUNCTION public.bc7_payroll_list_employees() IS
  'Admin-only list of active, unarchived BattleCruiser users with a Dependienta role; excludes the current Owner/Admin.';

COMMENT ON FUNCTION public.bc7_payroll_set_mapping(uuid,uuid) IS
  'Admin-only CuevaCoin identity mapping; server-validates the BattleCruiser user is an active Dependienta before persisting an explicit Owner-confirmed link.';

 
-- The payroll predecessor unlock is stricter than a generic accepted handover:
-- the destination turn must start on the calendar day immediately after the
-- predecessor period ends, in the same warehouse, and under a different turn.
CREATE OR REPLACE FUNCTION public.bc7_payroll_unlock_predecessor(p_successor_turn_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_source_turn uuid;
  v_source_session uuid;
  v_target_session uuid;
  v_count integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede liberar nómina por sucesión validada.' USING ERRCODE='42501';
  END IF;

  SELECT src.turno_id,src.id,dst.id
  INTO v_source_turn,v_source_session,v_target_session
  FROM public.turno_jornada_inventario_entregas e
  JOIN public.turno_sesiones src ON src.id=e.origen_sesion_id
  JOIN public.turno_sesiones dst ON dst.id=e.destino_sesion_id
  JOIN public.turnos source_turn ON source_turn.id=src.turno_id
  JOIN public.turnos target_turn ON target_turn.id=dst.turno_id
  JOIN public.turno_jornada_programacion sp ON sp.id=src.jornada_programacion_id
  JOIN public.turno_jornada_programacion dp ON dp.id=dst.jornada_programacion_id
  WHERE dst.turno_id=p_successor_turn_id
    AND src.turno_id<>dst.turno_id
    AND e.estado='ACEPTADA'
    AND e.destino_sesion_id IS NOT NULL
    AND e.almacen_id=src.almacen_id
    AND src.almacen_id=dst.almacen_id
    AND sp.almacen_id=dp.almacen_id
    AND e.fecha_destino=dp.fecha
    AND dp.fecha=coalesce(sp.fecha_fin,sp.fecha)+1
    AND source_turn.dias_turno IS NOT NULL
    AND coalesce(source_turn.estado_maestro,source_turn.estado)='CERRADO'
    AND coalesce(target_turn.estado_maestro,target_turn.estado)='CERRADO'
    AND src.estado='COMPLETADA'
    AND dst.estado='COMPLETADA'
    AND src.id=(
      SELECT s2.id
      FROM public.turno_sesiones s2
      JOIN public.turno_jornada_programacion p2 ON p2.id=s2.jornada_programacion_id
      WHERE s2.turno_id=src.turno_id
        AND s2.almacen_id=src.almacen_id
        AND s2.bloque='JORNADA'
        AND s2.estado='COMPLETADA'
      ORDER BY coalesce(p2.fecha_fin,p2.fecha) DESC,p2.numero_dia DESC,s2.id DESC
      LIMIT 1
    )
    AND dst.id=(
      SELECT s3.id
      FROM public.turno_sesiones s3
      JOIN public.turno_jornada_programacion p3 ON p3.id=s3.jornada_programacion_id
      WHERE s3.turno_id=dst.turno_id
        AND s3.almacen_id=dst.almacen_id
        AND s3.bloque='JORNADA'
        AND s3.estado='COMPLETADA'
      ORDER BY p3.fecha,p3.numero_dia,s3.id
      LIMIT 1
    )
  ORDER BY e.creado_en DESC,e.id
  LIMIT 1;

  IF v_source_turn IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.bc_nomina_salarios
  SET sucesor_turno_id=p_successor_turn_id,
      sucesor_sesion_id=v_target_session,
      validado_en=now(),
      estado=CASE WHEN estado='RETENIDO' THEN 'LISTO_PARA_PAGO' ELSE estado END,
      actualizado_en=now()
  WHERE turno_id=v_source_turn
    AND sucesor_turno_id IS NULL
    AND estado IN ('RETENIDO','REVISION_MANUAL');

  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count>0 THEN
    INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)
    VALUES(
      v_source_turn,
      v_source_session,
      auth.uid(),
      'NOMINA_RETENIDA_VALIDADA_POR_SUCESORA',
      jsonb_build_object(
        'successor_turn_id',p_successor_turn_id,
        'successor_session_id',v_target_session,
        'source_session_id',v_source_session,
        'salaries_unlocked',v_count,
        'evidence','accepted same-warehouse next-day physical handover'
      )
    );
  END IF;
  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.bc7_payroll_unlock_predecessor(uuid) IS
  'Unlocks predecessor wages only after an accepted physical handover to the next consecutive turn (source period end + 1) in the same warehouse.';
