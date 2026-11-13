
BEGIN;

-- Persist the three explicit employee confirmations that no more operating
-- entries remain. The physical FINAL count is the fourth, server-derived check.
CREATE TABLE IF NOT EXISTS public.turno_jornada_confirmaciones (
  turno_sesion_id uuid PRIMARY KEY REFERENCES public.turno_sesiones(id) ON DELETE CASCADE,
  gastos_completado boolean NOT NULL DEFAULT false,
  gastos_completado_por uuid,
  gastos_completado_at timestamptz,
  reinversiones_completado boolean NOT NULL DEFAULT false,
  reinversiones_completado_por uuid,
  reinversiones_completado_at timestamptz,
  bajas_completado boolean NOT NULL DEFAULT false,
  bajas_completado_por uuid,
  bajas_completado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.turno_jornada_confirmaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.turno_jornada_confirmaciones FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.bc7_reset_checklist_jornada_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND NEW.turno_sesion_id IS NOT DISTINCT FROM OLD.turno_sesion_id THEN
    RETURN NEW;
  END IF;
  IF NEW.turno_sesion_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.turno_jornada_confirmaciones(turno_sesion_id)
  VALUES(NEW.turno_sesion_id)
  ON CONFLICT(turno_sesion_id) DO NOTHING;

  IF TG_TABLE_NAME='gastos' THEN
    UPDATE public.turno_jornada_confirmaciones
    SET gastos_completado=false,gastos_completado_por=NULL,gastos_completado_at=NULL,updated_at=now()
    WHERE turno_sesion_id=NEW.turno_sesion_id;
  ELSIF TG_TABLE_NAME='reinversiones' THEN
    UPDATE public.turno_jornada_confirmaciones
    SET reinversiones_completado=false,reinversiones_completado_por=NULL,reinversiones_completado_at=NULL,updated_at=now()
    WHERE turno_sesion_id=NEW.turno_sesion_id;
  ELSIF TG_TABLE_NAME='bajas' OR TG_TABLE_NAME='mermas' THEN
    UPDATE public.turno_jornada_confirmaciones
    SET bajas_completado=false,bajas_completado_por=NULL,bajas_completado_at=NULL,updated_at=now()
    WHERE turno_sesion_id=NEW.turno_sesion_id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_reset_checklist_jornada_entry() FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS bc7_gastos_reset_jornada_checklist ON public.gastos;
CREATE TRIGGER bc7_gastos_reset_jornada_checklist
AFTER INSERT OR UPDATE ON public.gastos
FOR EACH ROW EXECUTE FUNCTION public.bc7_reset_checklist_jornada_entry();

DROP TRIGGER IF EXISTS bc7_reinversiones_reset_jornada_checklist ON public.reinversiones;
CREATE TRIGGER bc7_reinversiones_reset_jornada_checklist
AFTER INSERT OR UPDATE ON public.reinversiones
FOR EACH ROW EXECUTE FUNCTION public.bc7_reset_checklist_jornada_entry();

DROP TRIGGER IF EXISTS bc7_bajas_reset_jornada_checklist ON public.bajas;
CREATE TRIGGER bc7_bajas_reset_jornada_checklist
AFTER INSERT OR UPDATE ON public.bajas
FOR EACH ROW EXECUTE FUNCTION public.bc7_reset_checklist_jornada_entry();

DROP TRIGGER IF EXISTS bc7_mermas_reset_jornada_checklist ON public.mermas;
CREATE TRIGGER bc7_mermas_reset_jornada_checklist
AFTER INSERT OR UPDATE ON public.mermas
FOR EACH ROW EXECUTE FUNCTION public.bc7_reset_checklist_jornada_entry();

CREATE OR REPLACE FUNCTION public.bc7_confirmar_bloque_jornada(
  p_turno_sesion_id uuid,
  p_bloque text,
  p_completado boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_tipo text:=lower(coalesce(p_bloque,''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF v_tipo NOT IN ('gastos','reinversiones','bajas') OR p_completado IS NULL THEN
    RAISE EXCEPTION 'El bloque de checklist no es válido.' USING ERRCODE='22023';
  END IF;
  v_s:=public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.almacenes a
    WHERE a.id=v_s.almacen_id AND a.tipo='minorista'
  ) THEN
    RAISE EXCEPTION 'El checklist operativo solo aplica a jornadas minoristas.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.turno_jornada_confirmaciones(turno_sesion_id)
  VALUES(p_turno_sesion_id)
  ON CONFLICT(turno_sesion_id) DO NOTHING;

  IF v_tipo='gastos' THEN
    UPDATE public.turno_jornada_confirmaciones
    SET gastos_completado=p_completado,
        gastos_completado_por=CASE WHEN p_completado THEN auth.uid() ELSE NULL END,
        gastos_completado_at=CASE WHEN p_completado THEN now() ELSE NULL END,
        updated_at=now()
    WHERE turno_sesion_id=p_turno_sesion_id;
  ELSIF v_tipo='reinversiones' THEN
    UPDATE public.turno_jornada_confirmaciones
    SET reinversiones_completado=p_completado,
        reinversiones_completado_por=CASE WHEN p_completado THEN auth.uid() ELSE NULL END,
        reinversiones_completado_at=CASE WHEN p_completado THEN now() ELSE NULL END,
        updated_at=now()
    WHERE turno_sesion_id=p_turno_sesion_id;
  ELSE
    UPDATE public.turno_jornada_confirmaciones
    SET bajas_completado=p_completado,
        bajas_completado_por=CASE WHEN p_completado THEN auth.uid() ELSE NULL END,
        bajas_completado_at=CASE WHEN p_completado THEN now() ELSE NULL END,
        updated_at=now()
    WHERE turno_sesion_id=p_turno_sesion_id;
  END IF;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_despues
  )
  VALUES(
    v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),
    CASE v_tipo
      WHEN 'gastos' THEN CASE WHEN p_completado THEN 'CHECKLIST_GASTOS_CONFIRMADO' ELSE 'CHECKLIST_GASTOS_REABIERTO' END
      WHEN 'reinversiones' THEN CASE WHEN p_completado THEN 'CHECKLIST_REINVERSIONES_CONFIRMADO' ELSE 'CHECKLIST_REINVERSIONES_REABIERTO' END
      ELSE CASE WHEN p_completado THEN 'CHECKLIST_BAJAS_CONFIRMADO' ELSE 'CHECKLIST_BAJAS_REABIERTO' END
    END,
    NULL,
    jsonb_build_object('sesion_id',p_turno_sesion_id,'bloque',v_tipo,'completado',p_completado)
  );
  RETURN public.bc7_estado_confirmaciones_jornada(p_turno_sesion_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_confirmar_bloque_jornada(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_confirmar_bloque_jornada(uuid,text,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.bc7_estado_confirmaciones_jornada(p_turno_sesion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_gastos boolean:=false;
  v_reinversiones boolean:=false;
  v_bajas boolean:=false;
  v_final boolean:=false;
  v_lista_conteo boolean:=false;
  v_lista_calculo boolean:=false;
  v_cash_state text;
  v_liquidacion jsonb;
  v_phase text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN
    RAISE EXCEPTION 'La sesión no corresponde a una Jornada.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS(
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Solo la responsable asignada o ADMIN puede consultar el checklist.' USING ERRCODE='42501';
  END IF;

  SELECT coalesce(c.gastos_completado,false),
         coalesce(c.reinversiones_completado,false),
         coalesce(c.bajas_completado,false)
    INTO v_gastos,v_reinversiones,v_bajas
  FROM public.turno_jornada_confirmaciones c
  WHERE c.turno_sesion_id=p_turno_sesion_id;
  v_gastos:=coalesce(v_gastos,false);
  v_reinversiones:=coalesce(v_reinversiones,false);
  v_bajas:=coalesce(v_bajas,false);
  SELECT EXISTS(
    SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=p_turno_sesion_id
      AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
  ) INTO v_final;
  SELECT d.estado_aprobacion INTO v_cash_state
  FROM public.turno_declaraciones d
  WHERE d.turno_sesion_id=p_turno_sesion_id
  ORDER BY d.declarado_at DESC NULLS LAST,d.created_at DESC NULLS LAST
  LIMIT 1;
  v_lista_conteo:=v_gastos AND v_reinversiones AND v_bajas AND v_final;
  v_liquidacion:=public.bc7_liquidacion_inventario_jornada(p_turno_sesion_id);
  v_lista_calculo:=v_lista_conteo
    AND v_cash_state='APROBADA'
    AND coalesce((v_liquidacion->>'calculable')::boolean,false);
  v_phase:=CASE
    WHEN NOT v_lista_conteo THEN 'OPERACION'
    WHEN v_cash_state IS DISTINCT FROM 'APROBADA' THEN 'PENDIENTE_CONTEO_DUENO'
    WHEN v_lista_calculo THEN 'CALCULAR'
    ELSE 'REVISION_APROBACIONES'
  END;

  RETURN jsonb_build_object(
    'gastos',jsonb_build_object('completado',v_gastos),
    'reinversiones',jsonb_build_object('completado',v_reinversiones),
    'bajas',jsonb_build_object('completado',v_bajas),
    'inventario_final',jsonb_build_object('completado',v_final),
    'lista_para_conteo',v_lista_conteo,
    'lista_para_calcular',v_lista_calculo,
    'estado_efectivo_final',v_cash_state,
    'fase',v_phase
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_estado_confirmaciones_jornada(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_estado_confirmaciones_jornada(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.bc7_productos_ajuste_jornada(p_turno_sesion_id uuid)
RETURNS TABLE(
  producto_id uuid,
  nombre text,
  stock_actual numeric,
  minimo numeric,
  producto_padre_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN
    RAISE EXCEPTION 'La sesión no corresponde a una Jornada.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS(
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Solo la responsable asignada o ADMIN puede consultar el catálogo de ajustes.' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT p.id,p.nombre,coalesce(st.cantidad,0)::numeric,
         coalesce(st.minimo,0)::numeric,p.producto_padre_id
  FROM public.productos p
  LEFT JOIN public.stock st
    ON st.producto_id=p.id AND st.almacen_id=v_s.almacen_id
  WHERE p.activo IS TRUE
  ORDER BY p.nombre,p.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_productos_ajuste_jornada(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_productos_ajuste_jornada(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.resolver_aprobacion_operativa(p_tipo text, p_id uuid, p_decision text, p_comentario text DEFAULT NULL::text, p_cantidad_real numeric DEFAULT NULL::numeric, p_monto_real numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_nombre text;
  v_alm uuid;
  v_prod uuid;
  v_cant numeric;
  v_cant_real numeric;
  v_monto numeric;
  v_estado text;
  v_reinversion public.reinversiones;
  v_entrega record;
  v_line record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE='42501';
  END IF;

  -- Authorization is per operation type; permission to approve expenses must
  -- not implicitly grant authority over inventory waste or write-offs.
  IF p_tipo='gasto' THEN
    IF NOT (public.tiene_permiso('auditoria','editar_any') OR public.tiene_permiso('gastos','editar_any')) THEN
      RAISE EXCEPTION 'Sin permiso para revisar gastos.' USING ERRCODE='42501';
    END IF;
  ELSIF p_tipo='merma' THEN
    IF NOT (public.tiene_permiso('auditoria','editar_any') OR public.tiene_permiso('mermas','editar_any')) THEN
      RAISE EXCEPTION 'Sin permiso para revisar mermas.' USING ERRCODE='42501';
    END IF;
  ELSIF p_tipo='baja' THEN
    IF NOT (public.tiene_permiso('auditoria','editar_any') OR public.tiene_permiso('bajas','editar_any')) THEN
      RAISE EXCEPTION 'Sin permiso para revisar bajas.' USING ERRCODE='42501';
    END IF;
  ELSIF p_tipo='reinversion' THEN
    IF NOT public.tiene_permiso('reinversiones','editar_any') THEN
      RAISE EXCEPTION 'Sin permiso para revisar reinversiones.' USING ERRCODE='42501';
    END IF;
  ELSIF p_tipo='entrega_diaria' THEN
    IF NOT public.tiene_permiso('entregas_caja','editar_any') THEN
      RAISE EXCEPTION 'Solo Dueño puede revisar entregas diarias de efectivo.' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de aprobación desconocido.';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('APROBAR','RECHAZAR') THEN
    RAISE EXCEPTION 'Decisión inválida.';
  END IF;
  IF p_decision='RECHAZAR' AND NULLIF(btrim(p_comentario),'') IS NULL THEN
    RAISE EXCEPTION 'El rechazo requiere un motivo.';
  END IF;

  SELECT nombre INTO v_nombre FROM public.usuarios WHERE id=auth.uid();

  IF p_tipo='gasto' THEN
    SELECT estado,monto INTO v_estado,v_monto
    FROM public.gastos WHERE id=p_id FOR UPDATE;
    IF v_estado IS NULL OR v_estado<>'PENDIENTE' THEN
      RAISE EXCEPTION 'Gasto no pendiente o inexistente.';
    END IF;
    IF p_decision='APROBAR' AND p_monto_real IS NOT NULL AND p_monto_real<=0 THEN
      RAISE EXCEPTION 'Monto real inválido.';
    END IF;
    UPDATE public.gastos
    SET monto=CASE WHEN p_decision='APROBAR' AND p_monto_real IS NOT NULL THEN p_monto_real ELSE monto END,
        estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADO' ELSE 'RECHAZADO' END,
        revisado_por=auth.uid(),
        revisado_nombre=v_nombre,
        comentario_revision=NULLIF(btrim(p_comentario),'') ||
          CASE WHEN p_decision='APROBAR' AND p_monto_real IS NOT NULL AND p_monto_real<>v_monto
            THEN ' | Monto declarado: '||v_monto::text||' | Monto aprobado: '||p_monto_real::text ELSE '' END,
        fecha_revision=now(), actualizado_en=now()
    WHERE id=p_id;

  ELSIF p_tipo IN ('merma','baja') THEN
    IF p_tipo='merma' THEN
      SELECT estado,almacen_id,producto_id,cantidad
      INTO v_estado,v_alm,v_prod,v_cant
      FROM public.mermas WHERE id=p_id FOR UPDATE;
    ELSE
      SELECT estado,almacen_id,producto_id,cantidad
      INTO v_estado,v_alm,v_prod,v_cant
      FROM public.bajas WHERE id=p_id FOR UPDATE;
    END IF;

    IF v_estado IS NULL OR v_estado<>'PENDIENTE' THEN
      RAISE EXCEPTION 'La solicitud de ajuste no está pendiente o no existe.';
    END IF;

    IF p_decision='APROBAR' THEN
      v_cant_real:=COALESCE(p_cantidad_real,v_cant);
      IF v_cant_real IS NULL OR v_cant_real<=0 OR v_cant_real>v_cant THEN
        RAISE EXCEPTION 'Cantidad real inválida; debe ser mayor que cero y no superar la cantidad solicitada.';
      END IF;
      -- Stock and FIFO lot depletion run in this same transaction.
      PERFORM public._aplicar_salida_aprobada(v_alm,v_prod,v_cant_real);
    END IF;

    IF p_tipo='merma' THEN
      UPDATE public.mermas
      SET cantidad=CASE WHEN p_decision='APROBAR' THEN v_cant_real ELSE cantidad END,
          estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
          revisado_por=auth.uid(), revisado_nombre=v_nombre,
          comentario_revision=NULLIF(btrim(p_comentario),'') ||
            CASE WHEN p_decision='APROBAR' AND v_cant_real<>v_cant
              THEN ' | Cantidad declarada: '||v_cant::text||' | Cantidad aprobada: '||v_cant_real::text ELSE '' END,
          fecha_revision=now(), actualizado_en=now()
      WHERE id=p_id;
    ELSE
      UPDATE public.bajas
      SET cantidad=CASE WHEN p_decision='APROBAR' THEN v_cant_real ELSE cantidad END,
          estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
          revisado_por=auth.uid(), revisado_nombre=v_nombre,
          comentario_revision=NULLIF(btrim(p_comentario),'') ||
            CASE WHEN p_decision='APROBAR' AND v_cant_real<>v_cant
              THEN ' | Cantidad declarada: '||v_cant::text||' | Cantidad aprobada: '||v_cant_real::text ELSE '' END,
          fecha_revision=now(), actualizado_en=now()
      WHERE id=p_id;
    END IF;
  ELSIF p_tipo='reinversion' THEN
    SELECT * INTO v_reinversion FROM public.reinversiones WHERE id=p_id FOR UPDATE;
    IF NOT FOUND OR v_reinversion.estado<>'PENDIENTE' THEN
      RAISE EXCEPTION 'La reinversión no está pendiente o no existe.' USING ERRCODE='23514';
    END IF;
    IF p_decision='APROBAR' THEN
      IF p_monto_real IS NOT NULL AND p_monto_real<>v_reinversion.total THEN
        RAISE EXCEPTION 'El importe debe aprobarse por el total informado; corrige la solicitud antes de aprobar.'
          USING ERRCODE='23514';
      END IF;
      FOR v_line IN
        SELECT rl.producto_id,rl.cantidad_base,rl.costo_unitario
        FROM public.reinversiones_lineas rl
        WHERE rl.reinversion_id=v_reinversion.id
        ORDER BY rl.id
      LOOP
        INSERT INTO public.lotes_compra
          (producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario,
           fecha_compra,origen,usuario_id,compra_id)
        VALUES
          (v_line.producto_id,v_reinversion.almacen_id,v_line.cantidad_base,
           v_line.cantidad_base,v_line.costo_unitario,v_reinversion.fecha,
           'reinversion',coalesce(v_reinversion.usuario_id,auth.uid()),NULL);
        -- Update an existing warehouse stock row directly. INSERT ... ON CONFLICT
        -- evaluates the BEFORE INSERT minimum guard with minimo=0 before it can
        -- reach the conflict handler, even when the persisted row already has minimo>0.
        UPDATE public.stock st
        SET cantidad=st.cantidad+v_line.cantidad_base,updated_at=now()
        WHERE st.producto_id=v_line.producto_id
          AND st.almacen_id=v_reinversion.almacen_id;
        IF NOT FOUND THEN
          -- A genuinely new stock row still needs an explicit positive minimum.
          INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
          VALUES(v_line.producto_id,v_reinversion.almacen_id,v_line.cantidad_base,0);
        END IF;
      END LOOP;
      PERFORM private.registrar_movimiento_caja(
        v_reinversion.almacen_id,v_reinversion.ciclo_id,v_reinversion.sesion_id,
        v_reinversion.turno_id,'REINVERSION','SALIDA',v_reinversion.total,
        'reinversion',v_reinversion.id,
        coalesce(nullif(trim(v_reinversion.proveedor),''),'Reinversión de inventario')
      );
    END IF;
    UPDATE public.reinversiones
    SET estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
        revisado_por=auth.uid(),revisado_nombre=v_nombre,
        comentario_revision=NULLIF(btrim(p_comentario),''),
        fecha_revision=now()
    WHERE id=p_id;
    IF v_reinversion.turno_sesion_id IS NOT NULL THEN
      INSERT INTO public.turno_jornada_eventos
        (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
      SELECT v_reinversion.almacen_id,s.jornada_programacion_id,auth.uid(),
        CASE WHEN p_decision='APROBAR' THEN 'REINVERSION_APROBADA' ELSE 'REINVERSION_RECHAZADA' END,
        NULLIF(btrim(p_comentario),''),
        jsonb_build_object('reinversion_id',p_id,'estado','PENDIENTE'),
        jsonb_build_object('reinversion_id',p_id,'estado',CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
          'stock_y_caja_aplicados',p_decision='APROBAR')
      FROM public.turno_sesiones s WHERE s.id=v_reinversion.turno_sesion_id;
    END IF;
  ELSIF p_tipo='entrega_diaria' THEN
    SELECT * INTO v_entrega
    FROM public.turno_jornada_entregas_diarias
    WHERE id=p_id FOR UPDATE;
    IF NOT FOUND OR v_entrega.estado<>'PENDIENTE' THEN
      RAISE EXCEPTION 'La entrega diaria no está pendiente o no existe.' USING ERRCODE='23514';
    END IF;
    IF p_decision='APROBAR' AND p_monto_real IS NOT NULL AND p_monto_real<0 THEN
      RAISE EXCEPTION 'El importe contado no puede ser negativo.' USING ERRCODE='22023';
    END IF;
    UPDATE public.turno_jornada_entregas_diarias
    SET estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
        monto_aprobado=CASE WHEN p_decision='APROBAR' THEN coalesce(p_monto_real,monto_declarado) ELSE NULL END,
        revisado_por=auth.uid(),revisado_nombre=v_nombre,
        comentario_revision=NULLIF(btrim(p_comentario),''),
        fecha_revision=now()
    WHERE id=p_id;
    INSERT INTO public.turno_jornada_eventos
      (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
    SELECT e.almacen_id,s.jornada_programacion_id,auth.uid(),
      CASE WHEN p_decision='APROBAR' THEN 'ENTREGA_DIARIA_APROBADA' ELSE 'ENTREGA_DIARIA_RECHAZADA' END,
      NULLIF(btrim(p_comentario),''),
      jsonb_build_object('entrega_id',p_id,'fecha',e.fecha,'monto_declarado',e.monto_declarado,'estado','PENDIENTE'),
      jsonb_build_object('entrega_id',p_id,'monto_aprobado',CASE WHEN p_decision='APROBAR' THEN coalesce(p_monto_real,e.monto_declarado) ELSE NULL END,
        'estado',CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END)
    FROM public.turno_jornada_entregas_diarias e
    JOIN public.turno_sesiones s ON s.id=e.turno_sesion_id
    WHERE e.id=p_id;
  END IF;

  RETURN jsonb_build_object('ok',true,'tipo',p_tipo,'id',p_id,'decision',p_decision,'revisado_por',v_nombre);
END;
$function$

REVOKE ALL ON FUNCTION public.resolver_aprobacion_operativa(text,uuid,text,text,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolver_aprobacion_operativa(text,uuid,text,text,numeric,numeric) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.bc5_contar_dinero_entregado(p_declaracion_id uuid, p_monto_contado numeric, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  IF v_s.estado='EN_CURSO' THEN
    IF v_d.monto_contado IS NULL
       AND coalesce((public.bc7_estado_confirmaciones_jornada(v_s.id)->>'lista_para_conteo')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Antes del conteo físico, la responsable debe confirmar gastos, reinversiones, bajas e inventario final.' USING ERRCODE='23514';
    END IF;
  ELSIF v_s.estado<>'COMPLETADA' THEN
    RAISE EXCEPTION 'El conteo del administrador solo está disponible en una jornada activa lista para conteo o ya completada.' USING ERRCODE='23514';
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

  IF coalesce(v_d.estado_aprobacion,'') NOT IN ('PENDIENTE','ESPERANDO_APROBACION') THEN
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
$function$

REVOKE ALL ON FUNCTION public.bc5_contar_dinero_entregado(uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc5_contar_dinero_entregado(uuid,numeric,text) TO authenticated,service_role;

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
    OR public.tiene_permiso('reinversiones','editar_any')
    OR public.tiene_permiso('entregas_caja','editar_any')
  ) THEN
    RAISE EXCEPTION 'Sin permiso para ver aprobaciones administrativas' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
    SELECT 'gasto'::text,g.id,g.creado_en,g.creado_nombre,a.nombre,NULL::text,
           g.concepto,g.monto,NULL::numeric,g.estado,g.descripcion
    FROM public.gastos g
    LEFT JOIN public.almacenes a ON a.id=g.almacen_id
    WHERE g.estado='PENDIENTE'
      AND (public.tiene_permiso('gastos','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT 'merma'::text,m.id,m.creado_en,m.creado_nombre,a.nombre,p.nombre,
           'Merma de inventario'::text,NULL::numeric,m.cantidad,m.estado,m.motivo
    FROM public.mermas m
    JOIN public.almacenes a ON a.id=m.almacen_id
    JOIN public.productos p ON p.id=m.producto_id
    WHERE m.estado='PENDIENTE'
      AND (public.tiene_permiso('mermas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'baja_lista'::text,
      s.id,
      s.creado_en,
      s.creado_nombre,
      a.nombre,
      ('Lista de bajas · '||count(b.id)||' productos')::text,
      'Solicitud agrupada de inventario'::text,
      NULL::numeric,
      sum(b.cantidad),
      'PENDIENTE'::text,
      s.motivo_general
    FROM public.bajas_solicitudes s
    JOIN public.almacenes a ON a.id=s.almacen_id
    JOIN public.bajas b ON b.solicitud_id=s.id AND b.estado='PENDIENTE'
    WHERE s.estado='PENDIENTE'
      AND (public.tiene_permiso('bajas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))
    GROUP BY s.id,s.creado_en,s.creado_nombre,a.nombre,s.motivo_general

    UNION ALL

    SELECT 'baja'::text,b.id,b.creado_en,b.creado_nombre,a.nombre,p.nombre,
           'Baja individual'::text,NULL::numeric,b.cantidad,b.estado,b.motivo
    FROM public.bajas b
    JOIN public.almacenes a ON a.id=b.almacen_id
    JOIN public.productos p ON p.id=b.producto_id
    WHERE b.estado='PENDIENTE'
      AND b.solicitud_id IS NULL
      AND (public.tiene_permiso('bajas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'reinversion'::text,r.id,r.fecha,r.usuario_nombre,a.nombre,
      (SELECT string_agg(p.nombre, ', ' ORDER BY p.nombre)
       FROM public.reinversiones_lineas rl JOIN public.productos p ON p.id=rl.producto_id
       WHERE rl.reinversion_id=r.id),
      coalesce((
        SELECT string_agg(
          trim(trailing '.' from trim(trailing '0' from rl.cantidad_base::text))
          ||' '||p.nombre||' × '||
          trim(trailing '.' from trim(trailing '0' from rl.costo_unitario::text))||' CUP',
          ' · ' ORDER BY p.nombre,rl.id
        )
        FROM public.reinversiones_lineas rl
        JOIN public.productos p ON p.id=rl.producto_id
        WHERE rl.reinversion_id=r.id
      ),'Reinversión')::text,
      r.total,
      (SELECT sum(rl.cantidad_base) FROM public.reinversiones_lineas rl WHERE rl.reinversion_id=r.id),
      r.estado,
      coalesce(r.proveedor,'')
    FROM public.reinversiones r
    JOIN public.almacenes a ON a.id=r.almacen_id
    WHERE r.estado='PENDIENTE'
      AND r.turno_sesion_id IS NOT NULL
      AND public.tiene_permiso('reinversiones','editar_any')

    UNION ALL

    SELECT 'entrega_diaria'::text,e.id,e.creado_en,e.creado_nombre,a.nombre,
           NULL::text,('Entrega diaria de efectivo · '||e.fecha::text)::text,
           e.monto_declarado,NULL::numeric,e.estado,e.observacion
    FROM public.turno_jornada_entregas_diarias e
    JOIN public.almacenes a ON a.id=e.almacen_id
    WHERE e.estado='PENDIENTE'
      AND public.tiene_permiso('entregas_caja','editar_any')

    UNION ALL

    SELECT
      'declaracion_jornada'::text,
      d.id,
      d.declarado_at,
      COALESCE(u.nombre,'')::text,
      a.nombre,
      NULL::text,
      ('Declaración final de efectivo · Día '||s.numero_dia::text)::text,
      d.monto,
      NULL::numeric,
      d.estado_aprobacion,
      CASE
        WHEN s.estado='COMPLETADA' THEN 'COMPLETADA'
        WHEN coalesce(c.gastos_completado,false)
         AND coalesce(c.reinversiones_completado,false)
         AND coalesce(c.bajas_completado,false)
         AND EXISTS (
           SELECT 1 FROM public.turno_jornada_inventario_cortes cut
           WHERE cut.turno_sesion_id=s.id AND cut.tipo='FINAL' AND cut.estado='CONFIRMADO'
         ) THEN 'LISTA_PARA_CONTEO'
        ELSE s.estado::text
      END
    FROM public.turno_declaraciones d
    JOIN public.turno_sesiones s ON s.id=d.turno_sesion_id
    JOIN public.almacenes a ON a.id=s.almacen_id
    LEFT JOIN public.usuarios u ON u.id=d.usuario_id
    LEFT JOIN public.turno_jornada_confirmaciones c ON c.turno_sesion_id=s.id
    WHERE s.bloque='JORNADA'
      AND d.estado_aprobacion IN ('PENDIENTE','ESPERANDO_APROBACION')
      AND d.monto_contado IS NULL
      AND (public.tiene_permiso('entregas_caja','editar_any')
        OR public.tiene_permiso('auditoria','editar_any'))

    ORDER BY 3 DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.listar_aprobaciones_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.listar_aprobaciones_admin() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.bc5_cerrar_jornada(
  p_turno_sesion_id uuid,
  p_motivo_excepcion text DEFAULT NULL
)
RETURNS public.turno_sesiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_sesion public.turno_sesiones;
  v_programacion public.turno_jornada_programacion;
  v_local timestamp without time zone;
  v_ahora_minuto time;
  v_fecha_fin date;
  v_result public.turno_sesiones;
  v_tramo public.turno_tramos;
  v_liquidacion jsonb;
  v_pendientes jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_sesion FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_sesion.bloque<>'JORNADA' OR v_sesion.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'No es una sesión de jornada única válida.' USING ERRCODE='23503';
  END IF;
  SELECT * INTO v_programacion FROM public.turno_jornada_programacion WHERE id=v_sesion.jornada_programacion_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programación de jornada no encontrada.' USING ERRCODE='23503';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_sesion.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado puede cerrar esta jornada.' USING ERRCODE='42501';
  END IF;
  IF v_sesion.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'La jornada no está en curso.' USING ERRCODE='23514';
  END IF;

  IF EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_sesion.almacen_id AND a.tipo='minorista') THEN
    v_liquidacion:=public.bc7_liquidacion_inventario_jornada(v_sesion.id);
    v_pendientes:=coalesce(v_liquidacion->'pendientes','{}'::jsonb);
    IF coalesce((v_liquidacion->>'faltan_cortes')::boolean,true) THEN
      RAISE EXCEPTION 'No se puede cerrar: falta confirmar el inventario inicial o final.' USING ERRCODE='23514';
    END IF;
    IF v_liquidacion->>'salario_porcentaje' IS NULL THEN
      RAISE EXCEPTION 'No se puede cerrar: el Dueño debe configurar el porcentaje salarial de esta jornada.' USING ERRCODE='23514';
    END IF;
    IF coalesce((v_liquidacion->>'familias_sin_precio')::integer,0)>0 THEN
      RAISE EXCEPTION 'No se puede cerrar: hay productos sin precio válido en la liquidación.' USING ERRCODE='23514';
    END IF;
    IF coalesce((v_liquidacion->>'familias_con_vendidas_negativas')::integer,0)>0 THEN
      RAISE EXCEPTION 'No se puede cerrar: el inventario tiene diferencias negativas que deben revisarse.' USING ERRCODE='23514';
    END IF;
    IF coalesce((v_pendientes->>'gastos')::integer,0)>0
       OR coalesce((v_pendientes->>'reinversiones')::integer,0)>0
       OR coalesce((v_pendientes->>'ajustes')::integer,0)>0
       OR coalesce((v_pendientes->>'entregas_diarias')::integer,0)>0
       OR coalesce((v_pendientes->>'entregas_diarias_faltantes')::integer,0)>0 THEN
      RAISE EXCEPTION 'No se puede cerrar: faltan importes diarios o aprobaciones de gastos, reinversiones, mermas o bajas.' USING ERRCODE='23514';
    END IF;
    IF coalesce((public.bc7_estado_confirmaciones_jornada(v_sesion.id)->>'lista_para_conteo')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'No se puede entregar la jornada: Sheila debe completar gastos, reinversiones, bajas e inventario final.' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.turno_declaraciones d
      WHERE d.turno_sesion_id=v_sesion.id
        AND d.monto_contado IS NOT NULL
        AND d.estado_aprobacion='APROBADA'
    ) THEN
      RAISE EXCEPTION 'No se puede entregar la jornada: el Dueño todavía no ha contado y aprobado el efectivo final.' USING ERRCODE='23514';
    END IF;
    IF coalesce((v_liquidacion->>'calculable')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'No se puede entregar la jornada: la liquidación aún no está calculable; revisa aprobaciones, efectivo, precios y porcentaje salarial.' USING ERRCODE='23514';
    END IF;
  END IF;

  v_fecha_fin:=coalesce(v_programacion.fecha_fin,v_programacion.fecha);
  v_local:=now() AT TIME ZONE v_programacion.zona_horaria;
  v_ahora_minuto:=date_trunc('minute',v_local)::time;
  IF (v_local::date<>v_fecha_fin OR v_ahora_minuto<>v_programacion.hora_fin_prevista)
     AND trim(coalesce(p_motivo_excepcion,''))='' THEN
    RAISE EXCEPTION 'Cierre anticipado o tardío: debe registrar un motivo antes de cerrar.' USING ERRCODE='23514';
  END IF;

  -- Complete the Jornada transition here; the public legacy helper now rejects
  -- direct calls for block=JORNADA and remains available only to legacy blocks.
  SELECT * INTO v_tramo FROM public.turno_tramos
  WHERE turno_sesion_id=v_sesion.id AND estado='ACTIVO'
  ORDER BY inicio_at DESC NULLS LAST,created_at DESC NULLS LAST
  LIMIT 1 FOR UPDATE;
  IF v_tramo.id IS NULL THEN
    RAISE EXCEPTION 'La jornada EN_CURSO no tiene un tramo activo.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.turno_declaraciones d
    WHERE d.turno_tramo_id=v_tramo.id AND d.usuario_id=auth.uid()
  ) THEN
    RAISE EXCEPTION 'Antes de cerrar la jornada debes declarar el dinero entregado.' USING ERRCODE='23514';
  END IF;
  UPDATE public.turno_tramos SET estado='COMPLETADO',fin_at=now() WHERE id=v_tramo.id;
  UPDATE public.turno_sesiones SET estado='COMPLETADA',updated_at=now()
  WHERE id=v_sesion.id RETURNING * INTO v_result;
  UPDATE public.turnos SET estado='ABIERTO',estado_maestro='EN_CURSO',cierre_real=NULL,actualizado_en=now()
  WHERE id=v_sesion.turno_id;
  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo)
  VALUES(v_sesion.turno_id,v_sesion.id,v_tramo.id,auth.uid(),'SESION_CERRADA');

  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)
  VALUES(v_sesion.turno_id,v_sesion.id,auth.uid(),
    CASE WHEN v_local::date=v_fecha_fin AND v_ahora_minuto=v_programacion.hora_fin_prevista THEN 'JORNADA_CERRADA' ELSE 'JORNADA_CERRADA_CON_EXCEPCION' END,
    jsonb_build_object('fecha_fin_programada',v_fecha_fin,'hora_programada',v_programacion.hora_fin_prevista,
      'hora_real',v_ahora_minuto,'fecha_real',v_local::date,'zona_horaria',v_programacion.zona_horaria,
      'motivo',nullif(trim(p_motivo_excepcion),'')));
  INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(v_programacion.almacen_id,v_programacion.id,auth.uid(),
    CASE WHEN v_local::date=v_fecha_fin AND v_ahora_minuto=v_programacion.hora_fin_prevista THEN 'JORNADA_CERRADA' ELSE 'JORNADA_CERRADA_CON_EXCEPCION' END,
    nullif(trim(p_motivo_excepcion),''),jsonb_build_object('estado_sesion',v_sesion.estado),
    jsonb_build_object('estado_sesion',v_result.estado,'fecha_real',v_local::date,'fecha_fin_programada',v_fecha_fin,'hora_real',v_ahora_minuto));
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.bc5_cerrar_jornada(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc5_cerrar_jornada(uuid,text) TO authenticated;

COMMIT;
