-- BattleCruiser Step 4 — exact sales provenance for Jornada and payment channel.
-- Additive only: historic sales stay unlinked and are explicitly marked NO_DECLARADO.
BEGIN;

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS turno_sesion_id uuid,
  ADD COLUMN IF NOT EXISTS turno_tramo_id uuid,
  ADD COLUMN IF NOT EXISTS metodo_pago text NOT NULL DEFAULT 'NO_DECLARADO',
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS idempotency_payload_hash text;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='ventas_turno_sesion_id_fkey'
      AND conrelid='public.ventas'::regclass
  ) THEN
    ALTER TABLE public.ventas
      ADD CONSTRAINT ventas_turno_sesion_id_fkey
      FOREIGN KEY (turno_sesion_id) REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='ventas_turno_tramo_id_fkey'
      AND conrelid='public.ventas'::regclass
  ) THEN
    ALTER TABLE public.ventas
      ADD CONSTRAINT ventas_turno_tramo_id_fkey
      FOREIGN KEY (turno_tramo_id) REFERENCES public.turno_tramos(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='ventas_jornada_link_pair_chk'
      AND conrelid='public.ventas'::regclass
  ) THEN
    ALTER TABLE public.ventas
      ADD CONSTRAINT ventas_jornada_link_pair_chk
      CHECK ((turno_sesion_id IS NULL) = (turno_tramo_id IS NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='ventas_metodo_pago_chk'
      AND conrelid='public.ventas'::regclass
  ) THEN
    ALTER TABLE public.ventas
      ADD CONSTRAINT ventas_metodo_pago_chk
      CHECK (metodo_pago IN ('NO_DECLARADO','EFECTIVO','TRANSFERENCIA','TARJETA','OTRO'));
  END IF;
END
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS ventas_actor_idempotency_uidx
  ON public.ventas(creado_por,idempotency_key)
  WHERE creado_por IS NOT NULL AND idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ventas_jornada_fecha_idx
  ON public.ventas(turno_sesion_id,fecha,id)
  WHERE turno_sesion_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bc7_registrar_venta_jornada(
  p_almacen_id uuid,
  p_lineas jsonb,
  p_turno_sesion_id uuid,
  p_turno_tramo_id uuid,
  p_metodo_pago text,
  p_idempotency_key uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_s public.turno_sesiones;
  v_t public.turno_tramos;
  v_tipo_almacen text;
  v_tipo_precio text;
  v_payload_hash text;
  v_existing_id uuid;
  v_existing_hash text;
  v_existing_session uuid;
  v_existing_tramo uuid;
  v_existing_method text;
  v_venta_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF NOT public.tiene_permiso('ventas','crear') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar ventas.' USING ERRCODE='42501';
  END IF;
  IF p_idempotency_key IS NULL OR p_turno_sesion_id IS NULL OR p_turno_tramo_id IS NULL THEN
    RAISE EXCEPTION 'La venta requiere jornada, tramo y clave de idempotencia.' USING ERRCODE='22023';
  END IF;
  IF p_metodo_pago NOT IN ('EFECTIVO','TRANSFERENCIA','TARJETA','OTRO') THEN
    RAISE EXCEPTION 'Selecciona una forma de pago válida.' USING ERRCODE='22023';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array' OR jsonb_array_length(p_lineas)=0 THEN
    RAISE EXCEPTION 'La venta debe contener al menos un producto.' USING ERRCODE='22023';
  END IF;

  v_payload_hash:=md5(jsonb_build_object(
    'almacen_id',p_almacen_id,
    'lineas',p_lineas,
    'turno_sesion_id',p_turno_sesion_id,
    'turno_tramo_id',p_turno_tramo_id,
    'metodo_pago',p_metodo_pago
  )::text);

  -- Retries return the original sale only when the full session/payment payload matches.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text||':'||p_idempotency_key::text,0));
  SELECT id,idempotency_payload_hash,turno_sesion_id,turno_tramo_id,metodo_pago
    INTO v_existing_id,v_existing_hash,v_existing_session,v_existing_tramo,v_existing_method
  FROM public.ventas
  WHERE creado_por=v_uid AND idempotency_key=p_idempotency_key
  LIMIT 1 FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_hash IS DISTINCT FROM v_payload_hash
       OR v_existing_session IS DISTINCT FROM p_turno_sesion_id
       OR v_existing_tramo IS DISTINCT FROM p_turno_tramo_id
       OR v_existing_method IS DISTINCT FROM p_metodo_pago THEN
      RAISE EXCEPTION 'La clave de idempotencia ya pertenece a otra venta/jornada o forma de pago.' USING ERRCODE='23505';
    END IF;
    RETURN v_existing_id;
  END IF;

  v_t:=public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);
  IF v_t.id IS DISTINCT FROM p_turno_tramo_id OR v_t.usuario_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'El tramo activo no corresponde a esta jornada y responsable.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'La venta solo puede registrarse en una jornada única en curso.' USING ERRCODE='23514';
  END IF;
  IF p_almacen_id IS DISTINCT FROM v_s.almacen_id THEN
    RAISE EXCEPTION 'El almacén indicado no coincide con la jornada.' USING ERRCODE='42501';
  END IF;

  SELECT tipo INTO v_tipo_almacen FROM public.almacenes WHERE id=v_s.almacen_id;
  IF v_tipo_almacen IS NULL THEN
    RAISE EXCEPTION 'El almacén de la jornada no existe.' USING ERRCODE='23503';
  END IF;
  v_tipo_precio:=CASE WHEN v_tipo_almacen='mayorista' THEN 'mayorista' ELSE 'normal' END;

  -- Reuse the established server-side price, FIFO and stock transaction. A private
  -- internal key lets this wrapper own the external key and bind it to Jornada provenance.
  v_venta_id:=public.registrar_venta(v_s.almacen_id,p_lineas,gen_random_uuid(),v_tipo_precio);

  UPDATE public.ventas
  SET turno_sesion_id=v_s.id,
      turno_tramo_id=v_t.id,
      metodo_pago=p_metodo_pago,
      idempotency_key=p_idempotency_key,
      idempotency_payload_hash=v_payload_hash
  WHERE id=v_venta_id AND creado_por=v_uid
    AND almacen_id=v_s.almacen_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La venta se creó, pero no pudo vincularse a la jornada. La transacción fue revertida.' USING ERRCODE='23514';
  END IF;

  RETURN v_venta_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_ventas_jornada(p_turno_sesion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_s public.turno_sesiones;
  v_ventas jsonb;
  v_resumen jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN
    RAISE EXCEPTION 'La sesión no corresponde a una jornada única.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin()
     AND (
       NOT public.tiene_permiso('turnos','ver')
       OR NOT public.tiene_permiso('ventas','ver')
       OR NOT EXISTS (
         SELECT 1 FROM public.turno_asignaciones a
         WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=v_uid AND a.retirado_at IS NULL
       )
     ) THEN
    RAISE EXCEPTION 'Solo ADMIN o el responsable asignado con turnos.ver y ventas.ver puede consultar las ventas de esta jornada.' USING ERRCODE='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',v.id,
    'fecha',v.fecha,
    'total',v.total,
    'metodo_pago',v.metodo_pago,
    'lineas',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'producto',p.nombre,
        'cantidad',vl.cantidad,
        'precio_unitario',vl.precio_unitario,
        'subtotal',vl.subtotal
      ) ORDER BY p.nombre,p.id)
      FROM public.ventas_lineas vl
      JOIN public.productos p ON p.id=vl.producto_id
      WHERE vl.venta_id=v.id
    ),'[]'::jsonb)
  ) ORDER BY v.fecha,v.id),'[]'::jsonb)
  INTO v_ventas
  FROM public.ventas v
  WHERE v.turno_sesion_id=v_s.id;

  SELECT jsonb_build_object(
    'cantidad',count(*)::integer,
    'total',coalesce(sum(v.total),0),
    'efectivo',coalesce(sum(v.total) FILTER (WHERE v.metodo_pago='EFECTIVO'),0),
    'transferencia',coalesce(sum(v.total) FILTER (WHERE v.metodo_pago='TRANSFERENCIA'),0),
    'tarjeta',coalesce(sum(v.total) FILTER (WHERE v.metodo_pago='TARJETA'),0),
    'otro',coalesce(sum(v.total) FILTER (WHERE v.metodo_pago='OTRO'),0),
    'sin_metodo',coalesce(sum(v.total) FILTER (WHERE v.metodo_pago='NO_DECLARADO'),0)
  ) INTO v_resumen
  FROM public.ventas v
  WHERE v.turno_sesion_id=v_s.id;

  RETURN jsonb_build_object('ventas',v_ventas,'resumen',v_resumen);
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_registrar_venta_jornada(uuid,jsonb,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_registrar_venta_jornada(uuid,jsonb,uuid,uuid,text,uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.bc7_ventas_jornada(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bc7_ventas_jornada(uuid) TO authenticated;

COMMENT ON FUNCTION public.bc7_registrar_venta_jornada(uuid,jsonb,uuid,uuid,text,uuid) IS
  'Registers a sale only against the exact active Jornada/tranche. Payment channel and idempotency provenance are immutable per sale; legacy/offline operations stay on their original RPC.';

COMMENT ON FUNCTION public.bc7_ventas_jornada(uuid) IS
  'Read-only sale ledger and payment-channel totals for ADMIN or the currently assigned responsible with turnos.ver and ventas.ver. No historical unlinked sale is backfilled.';

COMMIT;