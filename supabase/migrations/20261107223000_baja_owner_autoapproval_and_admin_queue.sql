-- Baja: auto-aprobar en la misma transacción si el creador tiene permiso global de aprobación.
-- Los usuarios sin ese permiso siguen generando una solicitud PENDIENTE.
BEGIN;

CREATE OR REPLACE FUNCTION public.crear_baja(
  p_almacen_id uuid,
  p_producto_id uuid,
  p_cantidad numeric,
  p_motivo text,
  p_ciclo_id uuid DEFAULT NULL::uuid,
  p_sesion_id uuid DEFAULT NULL::uuid,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_nombre text;
  v_auto_aprobar boolean;
BEGIN
  IF NOT public.tiene_permiso('bajas','crear') THEN
    RAISE EXCEPTION 'Sin permiso para registrar bajas' USING ERRCODE='42501';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad <= 0 OR p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Cantidad y motivo son obligatorios';
  END IF;

  -- A repeated request returns its existing record and never applies stock/FIFO twice.
  IF p_idempotency_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bajas
    WHERE idempotency_key = p_idempotency_key AND creado_por = auth.uid()
  ) THEN
    SELECT id INTO v_id
    FROM public.bajas
    WHERE idempotency_key = p_idempotency_key AND creado_por = auth.uid()
    LIMIT 1;
    RETURN v_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stock
    WHERE almacen_id = p_almacen_id
      AND producto_id = p_producto_id
      AND cantidad >= p_cantidad
  ) THEN
    RAISE EXCEPTION 'Stock insuficiente para solicitar esta baja';
  END IF;

  SELECT nombre INTO v_nombre
  FROM public.usuarios
  WHERE id = auth.uid();

  -- Only users who could approve this operation for another person may auto-approve
  -- their own write-off. Normal users still enter the independent approval queue.
  v_auto_aprobar :=
    public.tiene_permiso('bajas','editar_any')
    OR public.tiene_permiso('auditoria','editar_any');

  -- Stock and FIFO are changed before the insert but inside the same transaction:
  -- if FIFO or stock validation fails, neither the movement nor the Baja is committed.
  IF v_auto_aprobar THEN
    PERFORM public._aplicar_salida_aprobada(p_almacen_id, p_producto_id, p_cantidad);
  END IF;

  INSERT INTO public.bajas(
    almacen_id, producto_id, cantidad, motivo, ciclo_id, sesion_id,
    creado_por, creado_nombre, estado,
    revisado_por, revisado_nombre, comentario_revision, fecha_revision,
    idempotency_key
  )
  VALUES(
    p_almacen_id, p_producto_id, p_cantidad, btrim(p_motivo), p_ciclo_id, p_sesion_id,
    auth.uid(), v_nombre,
    CASE WHEN v_auto_aprobar THEN 'APROBADA' ELSE 'PENDIENTE' END,
    CASE WHEN v_auto_aprobar THEN auth.uid() ELSE NULL END,
    CASE WHEN v_auto_aprobar THEN v_nombre ELSE NULL END,
    CASE WHEN v_auto_aprobar
      THEN 'Autoaprobada al registrarse: el creador tiene permiso global de aprobación de Bajas.'
      ELSE NULL
    END,
    CASE WHEN v_auto_aprobar THEN now() ELSE NULL END,
    p_idempotency_key
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_aprobaciones_admin()
RETURNS TABLE(
  tipo text,
  id uuid,
  fecha timestamp with time zone,
  usuario_nombre text,
  almacen_nombre text,
  producto_nombre text,
  resumen text,
  monto numeric,
  cantidad numeric,
  estado text,
  motivo text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (
    public.tiene_permiso('auditoria','editar_any')
    OR public.tiene_permiso('gastos','editar_any')
    OR public.tiene_permiso('mermas','editar_any')
    OR public.tiene_permiso('bajas','editar_any')
  ) THEN
    RAISE EXCEPTION 'Sin permiso para ver aprobaciones administrativas' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
    SELECT 'gasto'::text,g.id,g.creado_en,g.creado_nombre,a.nombre,NULL::text,
           g.concepto,g.monto,NULL::numeric,g.estado,g.descripcion
    FROM public.gastos g
    LEFT JOIN public.almacenes a ON a.id=g.almacen_id
    WHERE g.estado='PENDIENTE'

    UNION ALL

    SELECT 'merma'::text,m.id,m.creado_en,m.creado_nombre,a.nombre,p.nombre,
           'Merma de inventario'::text,NULL::numeric,m.cantidad,m.estado,m.motivo
    FROM public.mermas m
    JOIN public.almacenes a ON a.id=m.almacen_id
    JOIN public.productos p ON p.id=m.producto_id
    WHERE m.estado='PENDIENTE'

    UNION ALL

    SELECT 'baja'::text,b.id,b.creado_en,b.creado_nombre,a.nombre,p.nombre,
           'Baja de inventario'::text,NULL::numeric,b.cantidad,b.estado,b.motivo
    FROM public.bajas b
    JOIN public.almacenes a ON a.id=b.almacen_id
    JOIN public.productos p ON p.id=b.producto_id
    WHERE b.estado='PENDIENTE'

    ORDER BY 3 DESC;
END;
$function$;

COMMIT;
