-- BattleCruiser: audited cash handover for single-day and legacy turn sessions.
-- Additive only: preserves historical declarations and never writes operational LIVE data.
BEGIN;

ALTER TABLE public.turno_declaraciones
  ADD COLUMN IF NOT EXISTS monto_contado numeric,
  ADD COLUMN IF NOT EXISTS contado_por uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS contado_at timestamptz,
  ADD COLUMN IF NOT EXISTS observacion_conteo text,
  ADD COLUMN IF NOT EXISTS diferencia numeric;

ALTER TABLE public.turno_declaraciones
  DROP CONSTRAINT IF EXISTS turno_declaraciones_estado_aprobacion_check;
ALTER TABLE public.turno_declaraciones
  ADD CONSTRAINT turno_declaraciones_estado_aprobacion_check
  CHECK (estado_aprobacion IN ('PENDIENTE','ESPERANDO_APROBACION','APROBADA','RECHAZADA','CON_DIFERENCIA'));

ALTER TABLE public.turno_declaraciones
  DROP CONSTRAINT IF EXISTS turno_declaraciones_conteo_consistency_chk;
ALTER TABLE public.turno_declaraciones
  ADD CONSTRAINT turno_declaraciones_conteo_consistency_chk
  CHECK (
    (monto_contado IS NULL AND contado_por IS NULL AND contado_at IS NULL AND diferencia IS NULL)
    OR
    (monto_contado IS NOT NULL AND monto_contado >= 0
      AND contado_por IS NOT NULL AND contado_at IS NOT NULL AND diferencia IS NOT NULL)
  );

ALTER TABLE public.turno_diferencias
  ADD COLUMN IF NOT EXISTS declaracion_dinero_id uuid;
DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='turno_diferencias_declaracion_dinero_id_fkey'
      AND conrelid='public.turno_diferencias'::regclass
  ) THEN
    ALTER TABLE public.turno_diferencias
      ADD CONSTRAINT turno_diferencias_declaracion_dinero_id_fkey
      FOREIGN KEY (declaracion_dinero_id)
      REFERENCES public.turno_declaraciones(id) ON DELETE RESTRICT;
  END IF;
END
$fk$;
CREATE UNIQUE INDEX IF NOT EXISTS turno_diferencias_declaracion_dinero_uidx
  ON public.turno_diferencias(declaracion_dinero_id)
  WHERE declaracion_dinero_id IS NOT NULL;

-- Do not permit direct client writes; authenticated callers must use the audited SECURITY DEFINER RPCs.
REVOKE INSERT,UPDATE,DELETE ON TABLE public.turno_declaraciones,public.turno_diferencias FROM PUBLIC,anon,authenticated;

-- Administrative inbox: pending counts and unresolved discrepancies, with no table exposure.
CREATE OR REPLACE FUNCTION public.bc5_listar_dinero_pendiente_contar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador puede consultar las entregas pendientes de conteo.' USING ERRCODE='42501';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.declarado_at DESC NULLS LAST,q.declaracion_id), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT
      d.id AS declaracion_id,
      d.turno_id,
      d.turno_sesion_id,
      d.turno_tramo_id,
      t.almacen_id,
      al.nombre AS almacen_nombre,
      s.fecha,
      s.numero_dia,
      s.bloque,
      s.estado AS estado_sesion,
      d.usuario_id AS responsable_id,
      coalesce(u.nombre,'Usuario') AS responsable_nombre,
      d.monto AS monto_declarado,
      d.moneda,
      d.declarado_at,
      d.monto_contado,
      d.diferencia,
      d.estado_aprobacion,
      d.contado_por,
      coalesce(cu.nombre,'') AS contador_nombre,
      d.contado_at,
      d.observacion_conteo,
      dif.id AS diferencia_id,
      coalesce(dif.aprobado,false) AS diferencia_aprobada,
      dif.comentario AS comentario_diferencia
    FROM public.turno_declaraciones d
    JOIN public.turno_sesiones s ON s.id=d.turno_sesion_id
    JOIN public.turnos t ON t.id=d.turno_id
    LEFT JOIN public.almacenes al ON al.id=t.almacen_id
    LEFT JOIN public.usuarios u ON u.id=d.usuario_id
    LEFT JOIN public.usuarios cu ON cu.id=d.contado_por
    LEFT JOIN LATERAL (
      SELECT x.id,x.aprobado,x.comentario
      FROM public.turno_diferencias x
      WHERE x.declaracion_dinero_id=d.id
      ORDER BY x.created_at DESC
      LIMIT 1
    ) dif ON true
    WHERE d.estado_aprobacion IN ('PENDIENTE','ESPERANDO_APROBACION','CON_DIFERENCIA')
  ) q;

  RETURN coalesce(v_result,'[]'::jsonb);
END;
$function$;

-- Only an authenticated administrator can record the physical amount received.
-- A mismatch is persisted as a DINERO difference; it never changes cash or stock automatically.
CREATE OR REPLACE FUNCTION public.bc5_contar_dinero_entregado(
  p_declaracion_id uuid,
  p_monto_contado numeric,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_d public.turno_declaraciones;
  v_s public.turno_sesiones;
  v_contado numeric(14,2);
  v_diferencia numeric(14,2);
  v_diferencia_id uuid;
  v_obs text;
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
  IF v_s.estado<>'COMPLETADA' THEN
    RAISE EXCEPTION 'El conteo del administrador solo está disponible después de cerrar la sesión.' USING ERRCODE='23514';
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

  IF v_d.estado_aprobacion NOT IN ('PENDIENTE','ESPERANDO_APROBACION') THEN
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
$function$;

-- An unresolved Jornada cash discrepancy cannot be bypassed by the old "approve declaration" RPC.
-- Legacy MANANA/TARDE approval rules remain unchanged.
CREATE OR REPLACE FUNCTION public.bc_aprobar_declaracion(p_declaracion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  d public.turno_declaraciones;
  s public.turno_sesiones;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO d FROM public.turno_declaraciones WHERE id=p_declaracion_id FOR UPDATE;
  IF d.id IS NULL THEN
    RAISE EXCEPTION 'Declaración no encontrada.' USING ERRCODE='23503';
  END IF;
  SELECT * INTO s FROM public.turno_sesiones WHERE id=d.turno_sesion_id;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'Sesión de la declaración no encontrada.' USING ERRCODE='23503';
  END IF;
  IF d.estado_aprobacion='APROBADA' THEN
    RETURN jsonb_build_object('id',d.id,'estado','APROBADA','monto',d.monto,'idempotente',true);
  END IF;
  IF d.estado_aprobacion='CON_DIFERENCIA' THEN
    RAISE EXCEPTION 'La diferencia de efectivo debe revisarse desde su expediente; no puede aprobarse como una declaración normal.' USING ERRCODE='23514';
  END IF;
  IF s.bloque='JORNADA' THEN
    RAISE EXCEPTION 'La entrega de una jornada única debe aprobarse mediante el conteo físico del administrador.' USING ERRCODE='23514';
  END IF;
  IF s.estado<>'COMPLETADA' THEN
    RAISE EXCEPTION 'La declaración solo puede aprobarse cuando la sesión esté terminada.' USING ERRCODE='P0001';
  END IF;

  IF public.bc_actor_is_admin() THEN
    NULL;
  ELSIF s.bloque='MANANA' THEN
    IF NOT EXISTS(
      SELECT 1
      FROM public.turno_asignaciones a
      JOIN public.turno_sesiones ts ON ts.id=a.turno_sesion_id
      WHERE ts.turno_id=s.turno_id
        AND ts.numero_dia=s.numero_dia
        AND ts.bloque='TARDE'
        AND a.usuario_id=v_uid
        AND a.retirado_at IS NULL
    ) THEN
      RAISE EXCEPTION 'El dinero de la mañana solo puede aprobarlo la dependienta asignada a la tarde de esa misma jornada.' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'El dinero de la tarde solo puede aprobarlo ADMIN.' USING ERRCODE='42501';
  END IF;

  UPDATE public.turno_declaraciones
  SET estado_aprobacion='APROBADA',aprobado_por=v_uid,aprobado_at=now()
  WHERE id=d.id
  RETURNING * INTO d;

  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
  VALUES(d.turno_id,d.turno_sesion_id,d.turno_tramo_id,v_uid,'DINERO_DECLARACION_APROBADA',
    jsonb_build_object('declaracion_id',d.id,'monto',d.monto,'bloque',s.bloque,'numero_dia',s.numero_dia));

  RETURN jsonb_build_object('id',d.id,'estado',d.estado_aprobacion,'monto',d.monto,
    'aprobado_por',d.aprobado_por,'aprobado_at',d.aprobado_at);
END;
$function$;

-- Existing administrator review remains the resolution path for a cash discrepancy.
-- Resolving it updates the linked declaration but preserves the original counted amount and difference.
CREATE OR REPLACE FUNCTION public.bc_aprobar_diferencia(
  p_diferencia_id uuid,
  p_comentario text DEFAULT NULL
)
RETURNS public.turno_diferencias
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  r public.turno_diferencias;
BEGIN
  IF NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede aprobar diferencias.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO r
  FROM public.turno_diferencias
  WHERE id=p_diferencia_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Diferencia no encontrada.' USING ERRCODE='23503';
  END IF;
  IF r.aprobado THEN
    RETURN r;
  END IF;

  UPDATE public.turno_diferencias
  SET aprobado=true,
      aprobado_por=auth.uid(),
      aprobado_at=now(),
      comentario=coalesce(nullif(btrim(p_comentario),''),comentario)
  WHERE id=p_diferencia_id
  RETURNING * INTO r;

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

  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)
  VALUES(r.turno_id,r.turno_sesion_id,auth.uid(),'DIFERENCIA_APROBADA',
    jsonb_build_object('diferencia_id',r.id));

  RETURN r;
END;
$function$;

-- Extend the authenticated turn expediente so the inventory book can show both amounts.
CREATE OR REPLACE FUNCTION public.bc_obtener_expediente_turno(p_turno_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_turno jsonb;
  v_sessions jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.turnos t
    WHERE t.id=p_turno_id AND t.ciclo_id IS NULL AND t.sesion_id IS NULL
      AND (
        public.tiene_permiso('turnos','editar_any')
        OR t.creado_por=auth.uid()
        OR EXISTS(
          SELECT 1 FROM public.turno_asignaciones ta
          WHERE ta.turno_id=t.id AND ta.usuario_id=auth.uid() AND ta.retirado_at IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'No tenés permiso para consultar este Turno.' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'id',t.id,'almacen_id',t.almacen_id,'almacen_nombre',a.nombre,
    'fecha_inicio',t.fecha,'dias_turno',t.dias_turno,'estado',t.estado,
    'estado_maestro',t.estado_maestro,
    'fecha_fin',(t.fecha+greatest(coalesce(t.dias_turno,1)-1,0))
  ) INTO v_turno
  FROM public.turnos t
  LEFT JOIN public.almacenes a ON a.id=t.almacen_id
  WHERE t.id=p_turno_id AND t.ciclo_id IS NULL AND t.sesion_id IS NULL;

  IF v_turno IS NULL THEN
    RAISE EXCEPTION 'Turno no encontrado.' USING ERRCODE='23503';
  END IF;

  SELECT coalesce(
    jsonb_agg(jsonb_build_object(
      'id',s.id,'numero_dia',s.numero_dia,'bloque',s.bloque,'fecha',s.fecha,
      'estado',s.estado,'cierre_forzado',coalesce(s.cierre_forzado,false),
      'usuario_id',ta.usuario_id,'usuario_nombre',u.nombre,
      'dinero_declarado',d.id IS NOT NULL,'dinero_id',d.id,'dinero_monto',d.monto,
      'dinero_estado_aprobacion',coalesce(d.estado_aprobacion,'SIN_DECLARACION'),
      'dinero_aprobado_por',d.aprobado_por,'dinero_aprobado_at',d.aprobado_at,
      'dinero_monto_contado',d.monto_contado,'dinero_diferencia',d.diferencia,
      'dinero_contado_por',d.contado_por,'dinero_contado_nombre',d.contado_nombre,
      'dinero_contado_at',d.contado_at,'dinero_observacion_conteo',d.observacion_conteo
    ) ORDER BY s.numero_dia,CASE WHEN s.bloque='MANANA' THEN 1 WHEN s.bloque='TARDE' THEN 2 ELSE 1 END),
    '[]'::jsonb
  ) INTO v_sessions
  FROM public.turno_sesiones s
  LEFT JOIN LATERAL (
    SELECT x.usuario_id
    FROM public.turno_asignaciones x
    WHERE x.turno_sesion_id=s.id AND x.retirado_at IS NULL
    ORDER BY x.asignado_at DESC NULLS LAST,x.created_at DESC NULLS LAST
    LIMIT 1
  ) ta ON true
  LEFT JOIN public.usuarios u ON u.id=ta.usuario_id
  LEFT JOIN LATERAL (
    SELECT y.id,y.monto,y.estado_aprobacion,y.aprobado_por,y.aprobado_at,
      y.monto_contado,y.diferencia,y.contado_por,cu.nombre AS contado_nombre,
      y.contado_at,y.observacion_conteo
    FROM public.turno_declaraciones y
    LEFT JOIN public.usuarios cu ON cu.id=y.contado_por
    WHERE y.turno_sesion_id=s.id
    ORDER BY y.declarado_at DESC NULLS LAST,y.created_at DESC NULLS LAST
    LIMIT 1
  ) d ON true
  WHERE s.turno_id=p_turno_id;

  RETURN v_turno||jsonb_build_object('sesiones',v_sessions);
END;
$function$;

REVOKE ALL ON FUNCTION public.bc5_listar_dinero_pendiente_contar() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bc5_contar_dinero_entregado(uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc5_listar_dinero_pendiente_contar() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bc5_contar_dinero_entregado(uuid,numeric,text) TO authenticated,service_role;

REVOKE ALL ON FUNCTION public.bc_aprobar_declaracion(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc_aprobar_declaracion(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.bc_aprobar_diferencia(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc_aprobar_diferencia(uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.bc_obtener_expediente_turno(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc_obtener_expediente_turno(uuid) TO authenticated,service_role;

COMMIT;
