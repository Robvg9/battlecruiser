-- BattleCruiser — Regresiones operativas 2026-09-02
-- No recupera unidades de prueba borradas: el catálogo/stock actual sigue siendo la fuente de verdad.
-- Reglas nuevas:
--   1. Solo ADMIN/Dueño/perfil con turnos.editar_any puede forzar cierre.
--   2. Stock mínimo se guarda por (producto, almacén), usando la restricción UNIQUE existente.

CREATE OR REPLACE FUNCTION public.bc_forzar_cierre_turno_admin(
  p_turno_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_turno record;
  v_cerradas integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede forzar el cierre de un turno.' USING ERRCODE = '42501';
  END IF;

  SELECT id, estado_maestro, ciclo_id
    INTO v_turno
  FROM public.turnos
  WHERE id = p_turno_id
  FOR UPDATE;

  IF v_turno.id IS NULL THEN
    RAISE EXCEPTION 'Turno no encontrado.' USING ERRCODE = 'P0001';
  END IF;
  IF v_turno.estado_maestro IN ('CERRADO','CANCELADO') THEN
    RETURN jsonb_build_object('id', p_turno_id, 'estado', v_turno.estado_maestro, 'ya_cerrado', true);
  END IF;

  -- Un cierre forzado termina las sesiones abiertas/pedientes del mismo turno.
  UPDATE public.turno_sesiones
  SET estado = 'COMPLETADA'
  WHERE turno_id = p_turno_id
    AND estado NOT IN ('COMPLETADA','CANCELADA');
  GET DIAGNOSTICS v_cerradas = ROW_COUNT;

  UPDATE public.turnos
  SET estado_maestro = 'CERRADO',
      cierre_real = now(),
      actualizado_en = now()
  WHERE id = p_turno_id;

  IF to_regclass('public.turno_eventos') IS NOT NULL THEN
    INSERT INTO public.turno_eventos(turno_id, actor_user_id, tipo, payload)
    VALUES (
      p_turno_id,
      v_uid,
      'TURNO_CIERRE_FORZADO_ADMIN',
      jsonb_build_object('motivo', COALESCE(NULLIF(trim(p_motivo), ''), 'Cierre forzado por ADMIN'),
                         'sesiones_cerradas', v_cerradas)
    );
  END IF;

  RETURN jsonb_build_object(
    'id', p_turno_id,
    'estado', 'CERRADO',
    'sesiones_cerradas', v_cerradas,
    'forzado', true
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.bc_forzar_cierre_turno_admin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc_forzar_cierre_turno_admin(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc_actualizar_stock_minimo(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_minimo numeric
)
RETURNS public.stock
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.stock;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE = '42501';
  END IF;
  IF p_minimo IS NULL OR p_minimo < 0 THEN
    RAISE EXCEPTION 'El stock mínimo debe ser mayor o igual a 0.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.tiene_permiso('stock','editar') AND NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'No tenés permiso para editar el stock mínimo.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.stock(producto_id, almacen_id, cantidad, minimo, updated_at)
  VALUES (p_producto_id, p_almacen_id, 0, p_minimo, now())
  ON CONFLICT (producto_id, almacen_id)
  DO UPDATE SET minimo = EXCLUDED.minimo, updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.bc_actualizar_stock_minimo(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc_actualizar_stock_minimo(uuid, uuid, numeric) TO authenticated;
