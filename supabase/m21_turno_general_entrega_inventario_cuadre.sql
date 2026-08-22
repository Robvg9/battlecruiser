-- BATTLECRUISER M21 — Turno general: entrega de inventario + siguiente turno + cuadre unificado
-- Aditivo. No elimina tablas legacy ni duplica la cola/offline.

CREATE TABLE IF NOT EXISTS public.turnos_inventario_entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_origen_id uuid NOT NULL REFERENCES public.ciclos_operativos(id),
  ciclo_destino_id uuid REFERENCES public.ciclos_operativos(id),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),
  entregado_por uuid REFERENCES public.usuarios(id),
  entregado_nombre text,
  recibido_por uuid REFERENCES public.usuarios(id),
  recibido_nombre text,
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ACEPTADA','RECHAZADA')),
  observacion text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  aceptado_en timestamptz,
  idempotency_key uuid,
  CONSTRAINT uq_turno_inventario_entrega_origen UNIQUE (ciclo_origen_id)
);

CREATE TABLE IF NOT EXISTS public.turnos_inventario_entrega_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES public.turnos_inventario_entregas(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  presentacion_id uuid REFERENCES public.presentaciones(id),
  cantidad_base numeric(14,3) NOT NULL CHECK (cantidad_base >= 0),
  cantidad_presentacion numeric(14,3),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_turno_inventario_entrega_producto UNIQUE (entrega_id, producto_id, presentacion_id)
);

CREATE TABLE IF NOT EXISTS public.turnos_inventario_inicial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id uuid NOT NULL REFERENCES public.ciclos_operativos(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),
  cantidad_base numeric(14,3) NOT NULL CHECK (cantidad_base >= 0),
  presentacion_id uuid REFERENCES public.presentaciones(id),
  capturado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_turno_inventario_inicial_producto UNIQUE (ciclo_id, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_turnos_inventario_entregas_estado ON public.turnos_inventario_entregas(estado, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_turnos_inventario_inicial_ciclo ON public.turnos_inventario_inicial(ciclo_id);

ALTER TABLE public.turnos_inventario_entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos_inventario_entrega_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos_inventario_inicial ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._capturar_inventario_inicial_turno()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public','pg_temp' AS $$
BEGIN
  INSERT INTO public.turnos_inventario_inicial(ciclo_id, producto_id, almacen_id, cantidad_base, presentacion_id)
  SELECT NEW.id, s.producto_id, s.almacen_id, s.cantidad, p.presentacion_id
  FROM public.stock s
  JOIN public.productos p ON p.id=s.producto_id
  WHERE s.almacen_id=NEW.almacen_id AND s.cantidad >= 0
  ON CONFLICT (ciclo_id, producto_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capturar_inventario_inicial_turno ON public.ciclos_operativos;
CREATE TRIGGER trg_capturar_inventario_inicial_turno
AFTER INSERT ON public.ciclos_operativos
FOR EACH ROW EXECUTE FUNCTION public._capturar_inventario_inicial_turno();

CREATE OR REPLACE FUNCTION public.declarar_entrega_inventario_turno(
  p_ciclo_id uuid,
  p_observacion text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public','pg_temp' AS $$
DECLARE uid uuid; v_entrega uuid; v_almacen uuid;
BEGIN
  uid := public._validar_usuario_operacion('ciclos','editar');
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Se requiere idempotency_key'; END IF;
  SELECT almacen_id INTO v_almacen FROM public.ciclos_operativos WHERE id=p_ciclo_id;
  IF v_almacen IS NULL THEN RAISE EXCEPTION 'Turno no encontrado.'; END IF;
  SELECT id INTO v_entrega FROM public.turnos_inventario_entregas WHERE ciclo_origen_id=p_ciclo_id FOR UPDATE;
  IF v_entrega IS NOT NULL THEN
    RETURN jsonb_build_object('id',v_entrega,'estado',(SELECT estado FROM public.turnos_inventario_entregas WHERE id=v_entrega),'existente',true);
  END IF;
  INSERT INTO public.turnos_inventario_entregas(ciclo_origen_id,almacen_id,entregado_por,entregado_nombre,observacion,idempotency_key)
  VALUES(p_ciclo_id,v_almacen,uid,(SELECT nombre FROM public.usuarios WHERE id=uid),NULLIF(btrim(p_observacion),''),p_idempotency_key)
  RETURNING id INTO v_entrega;
  INSERT INTO public.turnos_inventario_entrega_lineas(entrega_id,producto_id,presentacion_id,cantidad_base,cantidad_presentacion)
  SELECT v_entrega,i.producto_id,i.presentacion_id,i.cantidad_base,i.cantidad_base
  FROM public.turnos_inventario_inicial i WHERE i.ciclo_id=p_ciclo_id;
  PERFORM public.registrar_auditoria('entrega_inventario','Entrega de inventario declarada','exito',v_entrega::text,p_idempotency_key,NULL);
  RETURN jsonb_build_object('id',v_entrega,'estado','PENDIENTE');
END;
$$;

CREATE OR REPLACE FUNCTION public.aceptar_entrega_inventario_turno(
  p_entrega_id uuid,
  p_idempotency_key uuid DEFAULT NULL,
  p_observacion text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public','pg_temp' AS $$
DECLARE uid uuid; e record; v_destino jsonb; v_destino_id uuid; v_inicio date; v_dias int; v_nombre text;
BEGIN
  uid := public._validar_usuario_operacion('ciclos','crear');
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Se requiere idempotency_key'; END IF;
  SELECT e.*, c.almacen_id, c.inicio_plan, c.cantidad_dias, c.fin_plan INTO e
  FROM public.turnos_inventario_entregas e
  JOIN public.ciclos_operativos c ON c.id=e.ciclo_origen_id
  WHERE e.id=p_entrega_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Entrega de inventario no encontrada.'; END IF;
  IF e.estado <> 'PENDIENTE' THEN RAISE EXCEPTION 'La entrega ya fue procesada.'; END IF;
  SELECT nombre INTO v_nombre FROM public.usuarios WHERE id=uid;
  v_inicio := e.fin_plan + 1;
  v_dias := LEAST(e.cantidad_dias,5);
  v_destino := public.crear_ciclo_operativo(e.almacen_id, v_inicio, v_dias, p_idempotency_key);
  v_destino_id := (v_destino->>'id')::uuid;
  INSERT INTO public.turnos_inventario_inicial(ciclo_id,producto_id,almacen_id,cantidad_base,presentacion_id)
  SELECT v_destino_id,l.producto_id,e.almacen_id,l.cantidad_base,l.presentacion_id
  FROM public.turnos_inventario_entrega_lineas l WHERE l.entrega_id=e.id
  ON CONFLICT (ciclo_id,producto_id) DO UPDATE SET cantidad_base=EXCLUDED.cantidad_base,presentacion_id=EXCLUDED.presentacion_id;
  UPDATE public.turnos_inventario_entregas
  SET estado='ACEPTADA',recibido_por=uid,recibido_nombre=v_nombre,aceptado_en=now(),
      observacion=COALESCE(NULLIF(btrim(p_observacion),''),observacion),ciclo_destino_id=v_destino_id
  WHERE id=e.id;
  PERFORM public.registrar_auditoria('entrega_inventario','Inventario aceptado; siguiente turno creado','exito',e.id::text,p_idempotency_key,jsonb_build_object('ciclo_destino_id',v_destino_id));
  RETURN jsonb_build_object('id',e.id,'estado','ACEPTADA','ciclo_destino_id',v_destino_id,'inicio_plan',v_inicio,'cantidad_dias',v_dias);
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_entrega_inventario_turno(p_ciclo_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path='public','pg_temp' AS $$
  SELECT COALESCE((SELECT jsonb_build_object(
    'entrega',to_jsonb(e),
    'lineas',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'producto_id',l.producto_id,'producto_nombre',p.nombre,'presentacion_id',l.presentacion_id,'presentacion_nombre',pr.nombre,'cantidad_base',l.cantidad_base,'cantidad_presentacion',l.cantidad_presentacion) ORDER BY p.nombre)
      FROM public.turnos_inventario_entrega_lineas l
      JOIN public.productos p ON p.id=l.producto_id
      LEFT JOIN public.presentaciones pr ON pr.id=l.presentacion_id
      WHERE l.entrega_id=e.id),'[]'::jsonb)
  ) FROM public.turnos_inventario_entregas e WHERE e.ciclo_origen_id=p_ciclo_id),'null'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.obtener_cuadre_turno_general(p_ciclo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public','pg_temp' AS $$
DECLARE c record; v_ventas numeric:=0; v_compras numeric:=0; v_gastos numeric:=0; v_reinversion numeric:=0; v_esperado numeric:=0; v_entregado numeric:=0; v_mermas numeric:=0; v_bajas numeric:=0;
BEGIN
  SELECT * INTO c FROM public.ciclos_operativos WHERE id=p_ciclo_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Turno no encontrado.'; END IF;
  PERFORM public._validar_usuario_operacion('ciclos','ver');
  SELECT COALESCE(sum(v.total),0) INTO v_ventas FROM public.ventas v WHERE v.almacen_id=c.almacen_id AND v.fecha >= c.inicio_plan::timestamptz AND v.fecha < (c.fin_plan + 1)::timestamptz;
  SELECT COALESCE(sum(cp.total),0) INTO v_compras FROM public.compras cp WHERE cp.almacen_id=c.almacen_id AND cp.fecha >= c.inicio_plan::timestamptz AND cp.fecha < (c.fin_plan + 1)::timestamptz;
  SELECT COALESCE(sum(g.monto),0) INTO v_gastos FROM public.gastos g WHERE g.ciclo_id=p_ciclo_id AND g.estado='APROBADO';
  SELECT COALESCE(sum(r.total),0) INTO v_reinversion FROM public.reinversiones r WHERE r.ciclo_id=p_ciclo_id;
  SELECT COALESCE(sum(m.cantidad),0) INTO v_mermas FROM public.mermas m WHERE m.ciclo_id=p_ciclo_id AND m.estado='APROBADA';
  SELECT COALESCE(sum(b.cantidad),0) INTO v_bajas FROM public.bajas b WHERE b.ciclo_id=p_ciclo_id AND b.estado='APROBADA';
  SELECT COALESCE(sum(e.monto_declarado),0) INTO v_entregado FROM public.entregas_caja e WHERE e.ciclo_id=p_ciclo_id AND e.estado IN('CONTADA','APROBADA');
  v_esperado := greatest(v_ventas - v_gastos - v_reinversion,0);
  RETURN jsonb_build_object(
    'ciclo_id',p_ciclo_id,
    'inventario_inicial',COALESCE((SELECT jsonb_agg(jsonb_build_object('producto_id',i.producto_id,'producto_nombre',p.nombre,'cantidad',i.cantidad_base,'presentacion',pr.nombre))
      FROM public.turnos_inventario_inicial i JOIN public.productos p ON p.id=i.producto_id LEFT JOIN public.presentaciones pr ON pr.id=i.presentacion_id WHERE i.ciclo_id=p_ciclo_id),'[]'::jsonb),
    'entradas',v_compras,'compras',v_compras,'ventas',v_ventas,'mermas',v_mermas,'bajas',v_bajas,'gastos',v_gastos,'reinversiones',v_reinversion,
    'dinero_esperado',v_esperado,'dinero_entregado',v_entregado,'diferencia',v_entregado-v_esperado
  );
END;
$$;

REVOKE ALL ON FUNCTION public.declarar_entrega_inventario_turno(uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aceptar_entrega_inventario_turno(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obtener_entrega_inventario_turno(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obtener_cuadre_turno_general(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.declarar_entrega_inventario_turno(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aceptar_entrega_inventario_turno(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_entrega_inventario_turno(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_cuadre_turno_general(uuid) TO authenticated;
