-- Step 7/15 follow-up: audited opening-inventory carry-forward and jornada-bound finance.
-- Additive only. Legacy sesion_id foreign keys remain pointed at sesiones_ciclo.
-- All writes happen through authenticated SECURITY DEFINER RPCs; no LIVE data is touched here.
BEGIN;

-- Preserve the old legacy FK columns and add a distinct link to the new jornada session/tramo.
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS turno_sesion_id uuid,
  ADD COLUMN IF NOT EXISTS turno_tramo_id uuid;
ALTER TABLE public.reinversiones
  ADD COLUMN IF NOT EXISTS turno_sesion_id uuid,
  ADD COLUMN IF NOT EXISTS turno_tramo_id uuid;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='gastos_turno_sesion_id_fkey') THEN
    ALTER TABLE public.gastos ADD CONSTRAINT gastos_turno_sesion_id_fkey
      FOREIGN KEY (turno_sesion_id) REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='gastos_turno_tramo_id_fkey') THEN
    ALTER TABLE public.gastos ADD CONSTRAINT gastos_turno_tramo_id_fkey
      FOREIGN KEY (turno_tramo_id) REFERENCES public.turno_tramos(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='gastos_jornada_link_pair_chk') THEN
    ALTER TABLE public.gastos ADD CONSTRAINT gastos_jornada_link_pair_chk
      CHECK ((turno_sesion_id IS NULL) = (turno_tramo_id IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reinversiones_turno_sesion_id_fkey') THEN
    ALTER TABLE public.reinversiones ADD CONSTRAINT reinversiones_turno_sesion_id_fkey
      FOREIGN KEY (turno_sesion_id) REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reinversiones_turno_tramo_id_fkey') THEN
    ALTER TABLE public.reinversiones ADD CONSTRAINT reinversiones_turno_tramo_id_fkey
      FOREIGN KEY (turno_tramo_id) REFERENCES public.turno_tramos(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reinversiones_jornada_link_pair_chk') THEN
    ALTER TABLE public.reinversiones ADD CONSTRAINT reinversiones_jornada_link_pair_chk
      CHECK ((turno_sesion_id IS NULL) = (turno_tramo_id IS NULL));
  END IF;
END;
$constraints$;

CREATE INDEX IF NOT EXISTS gastos_turno_sesion_idx
  ON public.gastos(turno_sesion_id,turno_tramo_id);
CREATE INDEX IF NOT EXISTS reinversiones_turno_sesion_idx
  ON public.reinversiones(turno_sesion_id,turno_tramo_id);

-- A link may only identify a real jornada session, its matching tranche, warehouse and creator.
-- Tranches may already be COMPLETADO when an expense is later approved, so this trigger
-- checks immutable identity/ownership, not current active status.
CREATE OR REPLACE FUNCTION public.bc7_guard_gasto_jornada_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_almacen uuid;
  v_bloque text;
  v_tramo_sesion uuid;
  v_tramo_usuario uuid;
BEGIN
  IF NEW.turno_sesion_id IS NULL AND NEW.turno_tramo_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.turno_sesion_id IS NULL OR NEW.turno_tramo_id IS NULL THEN
    RAISE EXCEPTION 'El vínculo de gasto con jornada requiere sesión y tramo.' USING ERRCODE='23514';
  END IF;
  IF NEW.sesion_id IS NOT NULL OR NEW.ciclo_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un gasto JORNADA no puede reutilizar vínculos legacy de sesión/ciclo.' USING ERRCODE='23514';
  END IF;
  SELECT s.almacen_id,s.bloque,tr.turno_sesion_id,tr.usuario_id
    INTO v_almacen,v_bloque,v_tramo_sesion,v_tramo_usuario
  FROM public.turno_sesiones s
  JOIN public.turno_tramos tr ON tr.turno_sesion_id=s.id
  WHERE s.id=NEW.turno_sesion_id AND tr.id=NEW.turno_tramo_id;
  IF NOT FOUND OR v_bloque<>'JORNADA'
     OR v_tramo_sesion IS DISTINCT FROM NEW.turno_sesion_id
     OR v_almacen IS DISTINCT FROM NEW.almacen_id
     OR v_tramo_usuario IS DISTINCT FROM NEW.creado_por THEN
    RAISE EXCEPTION 'El gasto no coincide con la sesión, tramo, almacén o responsable.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_guard_reinversion_jornada_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_almacen uuid;
  v_bloque text;
  v_tramo_sesion uuid;
  v_tramo_usuario uuid;
BEGIN
  IF NEW.turno_sesion_id IS NULL AND NEW.turno_tramo_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.turno_sesion_id IS NULL OR NEW.turno_tramo_id IS NULL THEN
    RAISE EXCEPTION 'El vínculo de reinversión con jornada requiere sesión y tramo.' USING ERRCODE='23514';
  END IF;
  IF NEW.sesion_id IS NOT NULL OR NEW.ciclo_id IS NOT NULL THEN
    RAISE EXCEPTION 'Una reinversión JORNADA no puede reutilizar vínculos legacy de sesión/ciclo.' USING ERRCODE='23514';
  END IF;
  SELECT s.almacen_id,s.bloque,tr.turno_sesion_id,tr.usuario_id
    INTO v_almacen,v_bloque,v_tramo_sesion,v_tramo_usuario
  FROM public.turno_sesiones s
  JOIN public.turno_tramos tr ON tr.turno_sesion_id=s.id
  WHERE s.id=NEW.turno_sesion_id AND tr.id=NEW.turno_tramo_id;
  IF NOT FOUND OR v_bloque<>'JORNADA'
     OR v_tramo_sesion IS DISTINCT FROM NEW.turno_sesion_id
     OR v_almacen IS DISTINCT FROM NEW.almacen_id
     OR v_tramo_usuario IS DISTINCT FROM NEW.usuario_id THEN
    RAISE EXCEPTION 'La reinversión no coincide con la sesión, tramo, almacén o responsable.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bc7_gastos_jornada_link_guard ON public.gastos;
CREATE TRIGGER bc7_gastos_jornada_link_guard
  BEFORE INSERT OR UPDATE ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.bc7_guard_gasto_jornada_link();

DROP TRIGGER IF EXISTS bc7_reinversiones_jornada_link_guard ON public.reinversiones;
CREATE TRIGGER bc7_reinversiones_jornada_link_guard
  BEFORE INSERT OR UPDATE ON public.reinversiones
  FOR EACH ROW EXECUTE FUNCTION public.bc7_guard_reinversion_jornada_link();

CREATE OR REPLACE FUNCTION public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id uuid)
RETURNS public.turno_tramos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_t public.turno_tramos;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  IF NOT public.tiene_permiso('turnos','ver') THEN
    RAISE EXCEPTION 'No tienes permiso para operar dentro de jornadas.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL
     OR v_s.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'La operación solo se permite dentro de una jornada única en curso.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id FOR SHARE;
  IF NOT FOUND OR v_p.responsable_id IS DISTINCT FROM auth.uid()
     OR NOT EXISTS (
       SELECT 1 FROM public.turno_asignaciones a
       WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
     ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado actualmente puede registrar operaciones en esta jornada.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_t FROM public.turno_tramos
  WHERE turno_sesion_id=v_s.id AND usuario_id=auth.uid() AND estado='ACTIVO'
  ORDER BY inicio_at DESC NULLS LAST,created_at DESC NULLS LAST
  LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay un tramo activo del responsable para esta jornada.' USING ERRCODE='23514'; END IF;
  RETURN v_t;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_registrar_gasto_jornada(
  p_turno_sesion_id uuid,
  p_concepto text,
  p_monto numeric,
  p_descripcion text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_t public.turno_tramos;
  v_id uuid;
  v_uid uuid:=auth.uid();
  v_nombre text;
  v_existing_session uuid;
  v_existing_tramo uuid;
BEGIN
  IF NOT public.tiene_permiso('gastos','crear') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar gastos.' USING ERRCODE='42501';
  END IF;
  IF p_concepto IS NULL OR btrim(p_concepto)='' OR p_monto IS NULL OR p_monto<=0 THEN
    RAISE EXCEPTION 'Concepto y monto válido son obligatorios.' USING ERRCODE='22023';
  END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Se requiere clave de idempotencia.' USING ERRCODE='22023'; END IF;
  v_t := public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  -- Serialize retries for this actor/key. Do not call crear_gasto here: that legacy RPC
  -- infers an open turno_sesion_id from any active turn, which is unsafe for JORNADA.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text||':'||p_idempotency_key::text,0));
  SELECT id,turno_sesion_id,turno_tramo_id
    INTO v_id,v_existing_session,v_existing_tramo
  FROM public.gastos
  WHERE idempotency_key=p_idempotency_key AND creado_por=v_uid
  LIMIT 1 FOR UPDATE;
  IF v_id IS NOT NULL THEN
    IF v_existing_session IS DISTINCT FROM v_s.id OR v_existing_tramo IS DISTINCT FROM v_t.id THEN
      RAISE EXCEPTION 'La clave de idempotencia ya pertenece a otro registro/jornada.' USING ERRCODE='23505';
    END IF;
    RETURN v_id;
  END IF;

  SELECT nombre INTO v_nombre FROM public.usuarios WHERE id=v_uid;
  INSERT INTO public.gastos
    (concepto,descripcion,monto,estado,almacen_id,ciclo_id,sesion_id,
     creado_por,creado_nombre,idempotency_key,turno_sesion_id,turno_tramo_id)
  VALUES
    (btrim(p_concepto),NULLIF(btrim(coalesce(p_descripcion,'')),''),p_monto,'PENDIENTE',
     v_s.almacen_id,NULL,NULL,v_uid,v_nombre,p_idempotency_key,v_s.id,v_t.id)
  RETURNING id INTO v_id;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES (v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),'GASTO_SOLICITADO',
    btrim(p_concepto),jsonb_build_object('sesion_id',v_s.id,'tramo_id',v_t.id),
    jsonb_build_object('gasto_id',v_id,'monto',p_monto,'estado','PENDIENTE'));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_registrar_reinversion_jornada(
  p_turno_sesion_id uuid,
  p_lineas jsonb,
  p_idempotency_key uuid,
  p_proveedor text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_t public.turno_tramos;
  v_id uuid;
  v_existing_session uuid;
  v_existing_tramo uuid;
BEGIN
  IF NOT public.tiene_permiso('reinversiones','crear') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar reinversiones.' USING ERRCODE='42501';
  END IF;
  IF p_idempotency_key IS NULL OR p_lineas IS NULL
     OR jsonb_typeof(p_lineas)<>'array' OR jsonb_array_length(p_lineas)=0 THEN
    RAISE EXCEPTION 'La reinversión requiere líneas y clave de idempotencia.' USING ERRCODE='22023';
  END IF;
  v_t := public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  -- Serialize retries at the same actor/key before probing the existing row.
  -- The table's unique key is the final cross-path guard; this lock keeps wrapper retries idempotent.
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_idempotency_key::text,0));
  SELECT id,turno_sesion_id,turno_tramo_id
    INTO v_id,v_existing_session,v_existing_tramo
  FROM public.reinversiones
  WHERE idempotency_key=p_idempotency_key AND usuario_id=auth.uid()
  LIMIT 1 FOR UPDATE;
  IF v_id IS NOT NULL THEN
    IF v_existing_session IS DISTINCT FROM v_s.id OR v_existing_tramo IS DISTINCT FROM v_t.id THEN
      RAISE EXCEPTION 'La clave de idempotencia ya pertenece a otra reinversión/jornada.' USING ERRCODE='23505';
    END IF;
    RETURN v_id;
  END IF;

  -- Reuse the current stock/FIFO/cash-ledger implementation in one transaction.
  -- The Jornada association is additional provenance, not a replacement for turno_id.
  -- Use the server transaction time; a caller cannot backdate an active-tranche operation.
  v_id := public.registrar_reinversion_multiple(
    v_s.almacen_id,NULLIF(btrim(coalesce(p_proveedor,'')),''),now(),
    p_lineas,NULL,NULL,v_s.turno_id,p_idempotency_key
  );
  UPDATE public.reinversiones
  SET turno_sesion_id=v_s.id,turno_tramo_id=v_t.id
  WHERE id=v_id AND usuario_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo ligar la reinversión a la jornada.' USING ERRCODE='23514'; END IF;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES (v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),'REINVERSION_REGISTRADA',
    NULLIF(btrim(coalesce(p_proveedor,'')),''),jsonb_build_object('sesion_id',v_s.id,'tramo_id',v_t.id),
    jsonb_build_object('reinversion_id',v_id,'lineas',p_lineas));
  RETURN v_id;
END;
$function$;

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
       OR (
         NOT EXISTS (
           SELECT 1 FROM public.turno_asignaciones a
           WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
         ) AND NOT EXISTS (
           SELECT 1 FROM public.turno_jornada_programacion p
           WHERE p.id=v_s.jornada_programacion_id AND p.responsable_id=auth.uid()
         )
       )
     ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado con turnos.ver o ADMIN puede consultar estas finanzas.' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'gastos',CASE WHEN public.bc_actor_is_admin() OR public.tiene_permiso('gastos','ver') THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',g.id,'concepto',g.concepto,'descripcion',g.descripcion,'monto',g.monto,
        'estado',g.estado,'creado_en',g.creado_en,'creado_nombre',g.creado_nombre,
        'revisado_nombre',g.revisado_nombre,'comentario_revision',g.comentario_revision,
        'fecha_revision',g.fecha_revision
      ) ORDER BY g.creado_en,g.id)
      FROM public.gastos g
      WHERE g.turno_sesion_id=v_s.id
    ),'[]'::jsonb) ELSE '[]'::jsonb END,
    'reinversiones',CASE WHEN public.bc_actor_is_admin() OR public.tiene_permiso('reinversiones','ver') THEN coalesce((
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
    ),'[]'::jsonb) ELSE '[]'::jsonb END
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

-- Carry-forward is provenance only: the next day's initial physical count is a NEW immutable
-- cut. It may be prefilled from the prior completed day's FINAL count, but never copies stock
-- or marks the new initial inventory confirmed without a fresh physical confirmation.
ALTER TABLE public.turno_jornada_inventario_cortes
  ADD COLUMN IF NOT EXISTS origen_corte_id uuid;
DO $origin_fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='turno_jornada_corte_origen_fkey') THEN
    ALTER TABLE public.turno_jornada_inventario_cortes
      ADD CONSTRAINT turno_jornada_corte_origen_fkey
      FOREIGN KEY (origen_corte_id) REFERENCES public.turno_jornada_inventario_cortes(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='turno_jornada_corte_origen_tipo_chk') THEN
    ALTER TABLE public.turno_jornada_inventario_cortes
      ADD CONSTRAINT turno_jornada_corte_origen_tipo_chk
      CHECK (origen_corte_id IS NULL OR tipo='INICIAL');
  END IF;
END;
$origin_fk$;

CREATE INDEX IF NOT EXISTS turno_jornada_corte_origen_idx
  ON public.turno_jornada_inventario_cortes(origen_corte_id);

-- Return the previous day's confirmed FINAL as an opening suggestion. The user still has to
-- count and confirm every current product through bc7_guardar_inventario_jornada.
CREATE OR REPLACE FUNCTION public.bc7_obtener_inventario_jornada(p_turno_sesion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde al modelo de jornada única.' USING ERRCODE='23503';
  END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programación no encontrada.' USING ERRCODE='23503'; END IF;
  IF NOT public.bc_actor_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado puede consultar esta jornada.' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'sesion',jsonb_build_object(
      'id',v_s.id,'turno_id',v_s.turno_id,'almacen_id',v_s.almacen_id,
      'numero_dia',v_s.numero_dia,'fecha',v_s.fecha,'bloque',v_s.bloque,
      'estado',v_s.estado,'hora_inicio_prevista',v_p.hora_inicio_prevista,
      'hora_fin_prevista',v_p.hora_fin_prevista,'zona_horaria',v_p.zona_horaria,
      'responsable_id',v_p.responsable_id,'programacion_id',v_p.id
    ),
    'productos',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'producto_id',p.id,'nombre',p.nombre,'unidad',p.unidad,
        'stock_actual',s.cantidad,'minimo',s.minimo
      ) ORDER BY p.nombre,p.id)
      FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
      WHERE s.almacen_id=v_s.almacen_id AND p.activo=true
    ),'[]'::jsonb),
    'cortes',coalesce((
      SELECT jsonb_object_agg(c.tipo,jsonb_build_object(
        'id',c.id,'tipo',c.tipo,'estado',c.estado,'creado_por',c.creado_por,
        'confirmado_por',c.confirmado_por,'creado_en',c.creado_en,
        'confirmado_en',c.confirmado_en,'observacion',c.observacion,
        'origen_corte_id',c.origen_corte_id,
        'lineas',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'producto_id',l.producto_id,'cantidad_contada',l.cantidad_contada,
            'stock_sistema',l.stock_sistema,'diferencia',l.cantidad_contada-l.stock_sistema
          ) ORDER BY p.nombre,p.id)
          FROM public.turno_jornada_inventario_lineas l
          JOIN public.productos p ON p.id=l.producto_id
          WHERE l.corte_id=c.id
        ),'[]'::jsonb)
      ))
      FROM public.turno_jornada_inventario_cortes c
      WHERE c.turno_sesion_id=v_s.id
    ),'{}'::jsonb),
    'apertura_previa',(
      SELECT jsonb_build_object(
        'corte_id',c.id,'sesion_id',ps.id,'numero_dia',ps.numero_dia,'fecha',ps.fecha,
        'lineas',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'producto_id',l.producto_id,'cantidad_contada',l.cantidad_contada
          ) ORDER BY p.nombre,p.id)
          FROM public.turno_jornada_inventario_lineas l
          JOIN public.productos p ON p.id=l.producto_id
          WHERE l.corte_id=c.id
        ),'[]'::jsonb)
      )
      FROM public.turno_sesiones ps
      JOIN public.turno_jornada_inventario_cortes c ON c.turno_sesion_id=ps.id
      WHERE ps.turno_id=v_s.turno_id AND ps.numero_dia=v_s.numero_dia-1
        AND ps.fecha<v_s.fecha AND ps.bloque='JORNADA' AND ps.estado='COMPLETADA'
        AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
      LIMIT 1
    ),
    'tramo_activo',(
      SELECT jsonb_build_object('id',t.id,'usuario_id',t.usuario_id,'inicio_at',t.inicio_at)
      FROM public.turno_tramos t
      WHERE t.turno_sesion_id=v_s.id AND t.estado='ACTIVO'
      ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST LIMIT 1
    ),
    'declaracion_dinero',(
      SELECT jsonb_build_object('id',d.id,'turno_tramo_id',d.turno_tramo_id,'monto',d.monto,
        'estado_aprobacion',d.estado_aprobacion,'declarado_at',d.declarado_at)
      FROM public.turno_declaraciones d
      WHERE d.turno_sesion_id=v_s.id
        AND d.turno_tramo_id=coalesce(
          (SELECT t.id FROM public.turno_tramos t
           WHERE t.turno_sesion_id=v_s.id AND t.estado='ACTIVO'
           ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST LIMIT 1),
          (SELECT t.id FROM public.turno_tramos t
           WHERE t.turno_sesion_id=v_s.id
           ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST LIMIT 1)
        )
      ORDER BY d.declarado_at DESC NULLS LAST,d.created_at DESC NULLS LAST LIMIT 1
    )
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

-- Attach the previous FINAL as source when the NEW physical INICIAL cut is saved.
-- Idempotent retries never overwrite an existing confirmed cut or replace its source.
CREATE OR REPLACE FUNCTION public.bc7_guardar_inventario_jornada(
  p_turno_sesion_id uuid,
  p_tipo text,
  p_lineas jsonb,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_uid uuid:=auth.uid();
  v_existing public.turno_jornada_inventario_cortes;
  v_corte_id uuid;
  v_origen_corte_id uuid;
  v_expected integer;
  v_count integer;
  v_distinct integer;
  v_tipo text:=upper(coalesce(p_tipo,''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  IF v_tipo NOT IN ('INICIAL','FINAL') THEN
    RAISE EXCEPTION 'Tipo de inventario inválido.' USING ERRCODE='22023';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array' THEN
    RAISE EXCEPTION 'El conteo debe ser una lista de productos y cantidades.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde al modelo de jornada única.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=v_uid AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado puede registrar este inventario.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_existing FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo=v_tipo FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('id',v_existing.id,'tipo',v_existing.tipo,'estado',v_existing.estado,
      'origen_corte_id',v_existing.origen_corte_id,'idempotente',true,
      'mensaje','El conteo ya estaba confirmado; no se sobrescribió.');
  END IF;
  IF v_tipo='INICIAL' AND v_s.estado NOT IN ('PENDIENTE','PROGRAMADA') THEN
    RAISE EXCEPTION 'El inventario inicial debe confirmarse antes de abrir la jornada.' USING ERRCODE='23514';
  END IF;
  IF v_tipo='FINAL' AND v_s.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'El inventario final solo puede confirmarse durante la jornada.' USING ERRCODE='23514';
  END IF;
  IF NULLIF(btrim(coalesce(p_observacion,'')),'') IS NOT NULL AND length(p_observacion)>1000 THEN
    RAISE EXCEPTION 'La observación no puede superar 1000 caracteres.' USING ERRCODE='22023';
  END IF;

  IF v_tipo='INICIAL' THEN
    SELECT c.id INTO v_origen_corte_id
    FROM public.turno_sesiones ps
    JOIN public.turno_jornada_inventario_cortes c ON c.turno_sesion_id=ps.id
    WHERE ps.turno_id=v_s.turno_id AND ps.numero_dia=v_s.numero_dia-1
      AND ps.fecha<v_s.fecha AND ps.bloque='JORNADA' AND ps.estado='COMPLETADA'
      AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
    LIMIT 1;
  END IF;

  SELECT count(*) INTO v_expected FROM public.stock s
  JOIN public.productos p ON p.id=s.producto_id
  WHERE s.almacen_id=v_s.almacen_id AND p.activo=true;
  SELECT count(*),count(DISTINCT (x.value->>'producto_id')::uuid)
    INTO v_count,v_distinct
  FROM jsonb_array_elements(p_lineas) AS x(value);
  IF v_count<>v_expected OR v_distinct<>v_count THEN
    RAISE EXCEPTION 'El conteo debe incluir una sola entrada por cada producto activo con stock registrado (% esperado; % recibidos).',
      v_expected,v_count USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) AS x(value)
    LEFT JOIN public.productos p ON p.id=(x.value->>'producto_id')::uuid AND p.activo=true
    WHERE p.id IS NULL OR jsonb_typeof(x.value)<>'object'
      OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
      OR NOT EXISTS (
        SELECT 1 FROM public.stock s
        WHERE s.almacen_id=v_s.almacen_id AND s.producto_id=p.id
      )
  ) THEN
    RAISE EXCEPTION 'Producto o cantidad inválida en el conteo.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.turno_jornada_inventario_cortes
    (turno_sesion_id,tipo,estado,creado_por,confirmado_por,observacion,origen_corte_id)
  VALUES (v_s.id,v_tipo,'CONFIRMADO',v_uid,v_uid,NULLIF(btrim(p_observacion),''),v_origen_corte_id)
  RETURNING id INTO v_corte_id;

  INSERT INTO public.turno_jornada_inventario_lineas(corte_id,producto_id,cantidad_contada,stock_sistema)
  SELECT v_corte_id,(x.value->>'producto_id')::uuid,(x.value->>'cantidad')::numeric,s.cantidad
  FROM jsonb_array_elements(p_lineas) AS x(value)
  JOIN public.stock s ON s.almacen_id=v_s.almacen_id AND s.producto_id=(x.value->>'producto_id')::uuid;

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES (v_s.almacen_id,v_s.jornada_programacion_id,v_uid,
    CASE WHEN v_tipo='INICIAL' THEN 'INVENTARIO_INICIAL_CONFIRMADO' ELSE 'INVENTARIO_FINAL_CONFIRMADO' END,
    NULLIF(btrim(p_observacion),''),jsonb_build_object('sesion_id',v_s.id,'estado',v_s.estado),
    jsonb_build_object('corte_id',v_corte_id,'tipo',v_tipo,'cantidad_lineas',v_count,
      'origen_corte_id',v_origen_corte_id));

  RETURN jsonb_build_object('id',v_corte_id,'tipo',v_tipo,'estado','CONFIRMADO',
    'cantidad_lineas',v_count,'origen_corte_id',v_origen_corte_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_validar_tramo_responsable_jornada(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_registrar_gasto_jornada(uuid,text,numeric,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_registrar_reinversion_jornada(uuid,jsonb,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_finanzas_jornada(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_guard_gasto_jornada_link() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bc7_guard_reinversion_jornada_link() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_registrar_gasto_jornada(uuid,text,numeric,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_registrar_reinversion_jornada(uuid,jsonb,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_finanzas_jornada(uuid) TO authenticated;

COMMIT;
