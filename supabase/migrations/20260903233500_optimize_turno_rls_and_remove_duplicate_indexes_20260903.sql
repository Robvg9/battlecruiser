-- BattleCruiser — Turno RLS performance + duplicate-index cleanup
-- Applied and verified in LIVE Supabase on 2026-09-03.
-- Purpose:
--   1) Remove two genuinely redundant Turno indexes.
--   2) Preserve the exact authorization predicates while allowing PostgreSQL
--      to evaluate session/auth helper functions once per statement instead
--      of repeatedly per candidate row.

BEGIN;

-- Keep the constraint-backed unique index and one partial unique index.
DROP INDEX IF EXISTS public.uq_turno_declaracion_tramo;
DROP INDEX IF EXISTS public.ux_turno_tramo_activo_sesion;

DROP POLICY IF EXISTS asignaciones_operativas_select ON public.asignaciones_operativas;
CREATE POLICY asignaciones_operativas_select ON public.asignaciones_operativas
  FOR SELECT TO authenticated
  USING ((usuario_id = (select auth.uid())) OR (select tiene_permiso('ciclos'::text, 'editar_any'::text)));

DROP POLICY IF EXISTS asignaciones_operativas_write ON public.asignaciones_operativas;
CREATE POLICY asignaciones_operativas_write ON public.asignaciones_operativas
  FOR ALL TO authenticated
  USING ((select tiene_permiso('ciclos'::text, 'editar_any'::text)))
  WITH CHECK ((select tiene_permiso('ciclos'::text, 'editar_any'::text)));

DROP POLICY IF EXISTS turno_asignaciones_select_involucrados ON public.turno_asignaciones;
CREATE POLICY turno_asignaciones_select_involucrados ON public.turno_asignaciones
  FOR SELECT TO authenticated
  USING ((select bc_actor_is_admin()) OR (usuario_id = (select auth.uid())) OR (asignado_por = (select auth.uid())));

DROP POLICY IF EXISTS turno_declaraciones_select_involucrados ON public.turno_declaraciones;
CREATE POLICY turno_declaraciones_select_involucrados ON public.turno_declaraciones
  FOR SELECT TO authenticated
  USING (
    (select bc_actor_is_admin())
    OR (usuario_id = (select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id = turno_declaraciones.turno_sesion_id
        AND a.usuario_id = (select auth.uid())
        AND a.retirado_at IS NULL
    )
  );

DROP POLICY IF EXISTS turno_descuentos_select_involucrados ON public.turno_descuentos;
CREATE POLICY turno_descuentos_select_involucrados ON public.turno_descuentos
  FOR SELECT TO authenticated
  USING ((select bc_actor_is_admin()) OR (usuario_id = (select auth.uid())));

DROP POLICY IF EXISTS turno_diferencias_select_involucrados ON public.turno_diferencias;
CREATE POLICY turno_diferencias_select_involucrados ON public.turno_diferencias
  FOR SELECT TO authenticated
  USING ((select bc_actor_is_admin()) OR (usuario_responsable = (select auth.uid())));

DROP POLICY IF EXISTS turno_entregas_select_involucrados ON public.turno_entregas_inventario;
CREATE POLICY turno_entregas_select_involucrados ON public.turno_entregas_inventario
  FOR SELECT TO authenticated
  USING ((select bc_actor_is_admin()) OR (entregado_por = (select auth.uid())) OR (recibido_por = (select auth.uid())));

DROP POLICY IF EXISTS turno_eventos_select_involucrados ON public.turno_eventos;
CREATE POLICY turno_eventos_select_involucrados ON public.turno_eventos
  FOR SELECT TO authenticated
  USING (
    (select bc_actor_is_admin())
    OR (actor_user_id = (select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_id = turno_eventos.turno_id
        AND a.usuario_id = (select auth.uid())
        AND a.retirado_at IS NULL
    )
  );

DROP POLICY IF EXISTS turno_sesiones_select_involucrados ON public.turno_sesiones;
CREATE POLICY turno_sesiones_select_involucrados ON public.turno_sesiones
  FOR SELECT TO authenticated
  USING (
    (select bc_actor_is_admin())
    OR EXISTS (
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id = turno_sesiones.id
        AND a.usuario_id = (select auth.uid())
        AND a.retirado_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.turnos t
      WHERE t.id = turno_sesiones.turno_id
        AND t.creado_por = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS turno_sucesiones_select_involucrados ON public.turno_sucesiones;
CREATE POLICY turno_sucesiones_select_involucrados ON public.turno_sucesiones
  FOR SELECT TO authenticated
  USING ((select bc_actor_is_admin()) OR (recibido_por = (select auth.uid())));

DROP POLICY IF EXISTS turno_tramos_select_involucrados ON public.turno_tramos;
CREATE POLICY turno_tramos_select_involucrados ON public.turno_tramos
  FOR SELECT TO authenticated
  USING (
    (select bc_actor_is_admin())
    OR (usuario_id = (select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.turnos t
      WHERE t.id = turno_tramos.turno_id
        AND t.creado_por = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS turnos_select_involucrados ON public.turnos;
CREATE POLICY turnos_select_involucrados ON public.turnos
  FOR SELECT TO authenticated
  USING (
    (select bc_actor_is_admin())
    OR (creado_por = (select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_id = turnos.id
        AND a.usuario_id = (select auth.uid())
        AND a.retirado_at IS NULL
    )
  );

DROP POLICY IF EXISTS turnos_inventario_entrega_lineas_select_involucrados ON public.turnos_inventario_entrega_lineas;
CREATE POLICY turnos_inventario_entrega_lineas_select_involucrados ON public.turnos_inventario_entrega_lineas
  FOR SELECT TO authenticated
  USING (
    (select bc_actor_is_admin())
    OR EXISTS (
      SELECT 1 FROM public.turnos_inventario_entregas e
      WHERE e.id = turnos_inventario_entrega_lineas.entrega_id
        AND ((e.entregado_por = (select auth.uid())) OR (e.recibido_por = (select auth.uid())))
    )
  );

DROP POLICY IF EXISTS turnos_inventario_entregas_select_involucrados ON public.turnos_inventario_entregas;
CREATE POLICY turnos_inventario_entregas_select_involucrados ON public.turnos_inventario_entregas
  FOR SELECT TO authenticated
  USING ((select bc_actor_is_admin()) OR (entregado_por = (select auth.uid())) OR (recibido_por = (select auth.uid())));

DROP POLICY IF EXISTS turnos_inventario_inicial_select_involucrados ON public.turnos_inventario_inicial;
CREATE POLICY turnos_inventario_inicial_select_involucrados ON public.turnos_inventario_inicial
  FOR SELECT TO authenticated
  USING (
    (select bc_actor_is_admin())
    OR EXISTS (
      SELECT 1
      FROM public.turnos t
      WHERE t.id = turnos_inventario_inicial.ciclo_id
        AND (
          t.creado_por = (select auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.turno_asignaciones a
            WHERE a.turno_id = t.id
              AND a.usuario_id = (select auth.uid())
              AND a.retirado_at IS NULL
          )
        )
    )
  );

COMMIT;
