BEGIN;

-- A responsible worker may inspect the financial and adjustment ledger for their own
-- currently assigned Jornada. No global gastos/reinversiones/mermas/bajas view grants
-- are required; the session assignment and turnos.ver gate remains mandatory.
-- Each result is constrained to turno_sesion_id = the authorized session. Direct table
-- access stays revoked and write/approval actions keep their separate RPC permissions.

CREATE OR REPLACE FUNCTION public.bc7_finanzas_jornada(p_turno_sesion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN
    RAISE EXCEPTION 'La sesión no corresponde a una jornada única.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin()
     AND (
       NOT public.tiene_permiso('turnos','ver')
       OR NOT EXISTS (
         SELECT 1 FROM public.turno_asignaciones a
         WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
       )
     ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado con turnos.ver o ADMIN puede consultar estas finanzas.' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'gastos',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',g.id,'concepto',g.concepto,'descripcion',g.descripcion,'monto',g.monto,
        'estado',g.estado,'creado_en',g.creado_en,'creado_nombre',g.creado_nombre,
        'revisado_nombre',g.revisado_nombre,'comentario_revision',g.comentario_revision,
        'fecha_revision',g.fecha_revision
      ) ORDER BY g.creado_en,g.id)
      FROM public.gastos g
      WHERE g.turno_sesion_id=v_s.id
    ),'[]'::jsonb),
    'reinversiones',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',r.id,'proveedor',r.proveedor,'fecha',r.fecha,'total',r.total,
        'usuario_nombre',r.usuario_nombre,
        'lineas',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'producto_id',rl.producto_id,'producto',p.nombre,
            'cantidad_base',rl.cantidad_base,'costo_total',rl.costo_total,
            'costo_unitario',rl.costo_unitario
          ) ORDER BY p.nombre,p.id)
          FROM public.reinversiones_lineas rl
          JOIN public.productos p ON p.id=rl.producto_id
          WHERE rl.reinversion_id=r.id
        ),'[]'::jsonb)
      ) ORDER BY r.fecha,r.id)
      FROM public.reinversiones r
      WHERE r.turno_sesion_id=v_s.id
    ),'[]'::jsonb),
    'mermas',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',m.id,'producto',p.nombre,'producto_id',m.producto_id,
        'cantidad',m.cantidad,'motivo',m.motivo,'estado',m.estado,
        'creado_en',m.creado_en,'creado_nombre',m.creado_nombre,
        'revisado_nombre',m.revisado_nombre,'comentario_revision',m.comentario_revision,
        'fecha_revision',m.fecha_revision
      ) ORDER BY m.creado_en,m.id)
      FROM public.mermas m
      JOIN public.productos p ON p.id=m.producto_id
      WHERE m.turno_sesion_id=v_s.id
    ),'[]'::jsonb),
    'bajas',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',b.id,'producto',p.nombre,'producto_id',b.producto_id,
        'cantidad',b.cantidad,'motivo',b.motivo,'estado',b.estado,
        'creado_en',b.creado_en,'creado_nombre',b.creado_nombre,
        'revisado_nombre',b.revisado_nombre,'comentario_revision',b.comentario_revision,
        'fecha_revision',b.fecha_revision
      ) ORDER BY b.creado_en,b.id)
      FROM public.bajas b
      JOIN public.productos p ON p.id=b.producto_id
      WHERE b.turno_sesion_id=v_s.id
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_finanzas_jornada(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_finanzas_jornada(uuid) TO authenticated;

COMMENT ON FUNCTION public.bc7_finanzas_jornada(uuid) IS
  'Read-only financial and adjustment ledger for ADMIN or the currently assigned responsible worker with turnos.ver; always scoped to one jornada session.';

COMMIT;
