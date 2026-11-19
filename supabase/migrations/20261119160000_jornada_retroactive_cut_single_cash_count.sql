-- BattleCruiser · retroactive Jornada movement boundary + one-step final cash count.
-- A retroactive initial physical cut already contains every movement before that cut.
-- Final cash approval and physical count must be the same Owner action.

BEGIN;

DO $patch_retroactive_inventory_boundary$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure)
  INTO v_definition;

  v_old := $old$v_start_at:=coalesce(v_turno.apertura_real,v_initial.confirmado_en,v_initial.creado_en);$old$;
  v_new := $new$v_start_at:=coalesce(v_initial.confirmado_en,v_initial.creado_en,v_turno.apertura_real);$new$;
  IF position(v_old in v_definition)=0 THEN
    RAISE EXCEPTION 'Expected Jornada initial-cut boundary not found.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$OR EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
          WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA'
            AND mr.movimiento_id=m.id AND mr.clasificacion='ANTES_CORTE')$old$;
  v_new := $new$OR (coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_start_at
          AND EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA'
              AND mr.movimiento_id=m.id AND mr.clasificacion='ANTES_CORTE'))$new$;
  IF position(v_old in v_definition)=0 THEN
    RAISE EXCEPTION 'Expected MERMA before-cut attribution branch not found.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$OR EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
          WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA'
            AND mr.movimiento_id=b.id AND mr.clasificacion='ANTES_CORTE')$old$;
  v_new := $new$OR (coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_start_at
          AND EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA'
              AND mr.movimiento_id=b.id AND mr.clasificacion='ANTES_CORTE'))$new$;
  IF position(v_old in v_definition)=0 THEN
    RAISE EXCEPTION 'Expected BAJA before-cut attribution branch not found.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END;
$patch_retroactive_inventory_boundary$;

DO $patch_one_step_final_cash_count$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc5_contar_dinero_entregado(uuid,numeric,text)'::regprocedure)
  INTO v_definition;

  v_old := $old$IF coalesce(v_d.estado_aprobacion,'')<>'DECLARACION_APROBADA' THEN$old$;
  v_new := $new$IF coalesce(v_d.estado_aprobacion,'') NOT IN ('PENDIENTE','ESPERANDO_APROBACION','DECLARACION_APROBADA') THEN$new$;
  IF position(v_old in v_definition)=0 THEN
    RAISE EXCEPTION 'Expected final-cash count state guard not found.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END;
$patch_one_step_final_cash_count$;

-- Keep rejection available for correcting the declared amount, but prohibit
-- an approval-only transition that would force the Owner to count the same
-- final handover in a second screen/action.
DO $disable_approval_only_final_cash$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_resolver_declaracion_jornada(uuid,text,text)'::regprocedure)
  INTO v_definition;

  v_old := $old$  IF p_decision='RECHAZAR' AND v_comment IS NULL THEN$old$;
  v_new := $new$  IF p_decision='APROBAR' THEN
    RAISE EXCEPTION 'La declaración final debe confirmarse con el conteo físico en una sola acción.' USING ERRCODE='23514';
  END IF;
  IF p_decision='RECHAZAR' AND v_comment IS NULL THEN$new$;
  IF position(v_old in v_definition)=0 THEN
    RAISE EXCEPTION 'Expected final-cash approval guard insertion point not found.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END;
$disable_approval_only_final_cash$;


-- Do not expose a declaration in the Owner's approval queue before the
-- responsible person has completed and handed over the Jornada. This makes
-- the single physical count action available exactly when the server allows it.
DO $show_final_cash_only_after_handover$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.listar_aprobaciones_admin()'::regprocedure)
  INTO v_definition;

  v_old := $old$WHERE s.bloque='JORNADA'
      AND d.estado_aprobacion IN ('PENDIENTE','ESPERANDO_APROBACION')
      AND d.monto_contado IS NULL
      AND (public.tiene_permiso('entregas_caja','editar_any')$old$;
  v_new := $new$WHERE s.bloque='JORNADA'
      AND s.estado='COMPLETADA'
      AND d.estado_aprobacion IN ('PENDIENTE','ESPERANDO_APROBACION')
      AND d.monto_contado IS NULL
      AND (public.tiene_permiso('entregas_caja','editar_any')$new$;
  IF position(v_old in v_definition)=0 THEN
    RAISE EXCEPTION 'Expected final-cash admin queue branch not found.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END;
$show_final_cash_only_after_handover$;

COMMIT;
