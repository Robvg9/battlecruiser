BEGIN;

-- Restore the canonical owner/admin approval RPC to the tracked migration chain.
-- The production schema already exposes this contract; it was absent from the
-- repository migration set, so disposable CI databases could not complete the
-- full Turn approval -> successor Jornada integration test.
CREATE OR REPLACE FUNCTION public.bc_aprobar_turno(
  p_turno_id uuid,
  p_comentario text DEFAULT NULL
)
RETURNS public.turno_revisiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  r public.turno_revisiones;
BEGIN
  IF NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede aprobar';
  END IF;

  PERFORM 1
  FROM public.turnos
  WHERE id=p_turno_id
    AND estado_maestro='PENDIENTE_APROBACION'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El Turno no está pendiente de aprobación';
  END IF;

  UPDATE public.turno_revisiones
  SET estado='APROBADO',
      revisado_por=auth.uid(),
      revisado_at=now(),
      comentario=p_comentario
  WHERE turno_id=p_turno_id
  RETURNING * INTO r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expediente de revisión no encontrado';
  END IF;

  UPDATE public.turnos
  SET estado_maestro='CERRADO'
  WHERE id=p_turno_id;

  INSERT INTO public.turno_eventos(turno_id,actor_user_id,tipo,payload)
  VALUES(
    p_turno_id,
    auth.uid(),
    'TURNO_APROBADO',
    jsonb_build_object('comentario',p_comentario)
  );

  RETURN r;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc_aprobar_turno(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc_aprobar_turno(uuid,text) TO authenticated,service_role;

COMMENT ON FUNCTION public.bc_aprobar_turno(uuid,text) IS
  'Owner/admin approval of a fully reconciled Turn. Must be preceded by bc_enviar_turno_a_aprobacion.';

COMMIT;
