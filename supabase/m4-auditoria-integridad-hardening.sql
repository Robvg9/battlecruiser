-- BattleCruiser — M4 — Auditoría + integridad de operaciones críticas
--
-- Objetivo:
-- 1) Evitar escrituras directas de authenticated sobre productos, de modo
--    que crear/editar/activar/desactivar producto pase por sus RPC idempotentes.
-- 2) Garantizar una auditoría backend incluso si el frontend no puede invocar
--    registrar_auditoria directamente.
-- 3) Impedir nuevas entradas de stock/ventas/transferencias/vales para
--    productos inactivos.
--
-- No crea una segunda cola, sistema de idempotencia ni ruta de escritura.

REVOKE INSERT, UPDATE, DELETE ON TABLE public.productos FROM authenticated;

CREATE OR REPLACE FUNCTION public.validar_producto_activo_en_mutacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_activo boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.activo INTO v_activo
  FROM public.productos p
  WHERE p.id = NEW.producto_id;

  IF v_activo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'El producto está inactivo o no existe.' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_producto_activo_en_mutacion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validar_producto_activo_en_mutacion() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_validar_producto_activo_lotes ON public.lotes_compra;
CREATE TRIGGER trg_validar_producto_activo_lotes BEFORE INSERT ON public.lotes_compra FOR EACH ROW EXECUTE FUNCTION public.validar_producto_activo_en_mutacion();

DROP TRIGGER IF EXISTS trg_validar_producto_activo_ventas_lineas ON public.ventas_lineas;
CREATE TRIGGER trg_validar_producto_activo_ventas_lineas BEFORE INSERT ON public.ventas_lineas FOR EACH ROW EXECUTE FUNCTION public.validar_producto_activo_en_mutacion();

DROP TRIGGER IF EXISTS trg_validar_producto_activo_transferencias_lineas ON public.transferencias_lineas;
CREATE TRIGGER trg_validar_producto_activo_transferencias_lineas BEFORE INSERT ON public.transferencias_lineas FOR EACH ROW EXECUTE FUNCTION public.validar_producto_activo_en_mutacion();

DROP TRIGGER IF EXISTS trg_validar_producto_activo_vales ON public.vales_salida;
CREATE TRIGGER trg_validar_producto_activo_vales BEFORE INSERT ON public.vales_salida FOR EACH ROW EXECUTE FUNCTION public.validar_producto_activo_en_mutacion();

CREATE OR REPLACE FUNCTION public.auditar_mutacion_operativa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nombre text;
  v_tipo text;
  v_descripcion text;
  v_entidad text;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  SELECT u.nombre INTO v_nombre FROM public.usuarios u WHERE u.id = v_uid;

  IF TG_TABLE_NAME = 'productos' THEN
    v_entidad := NEW.id::text;
    IF TG_OP = 'INSERT' THEN
      v_tipo := 'producto';
      v_descripcion := 'Producto creado: ' || coalesce(NEW.nombre, NEW.id::text);
    ELSE
      v_tipo := CASE WHEN NEW.activo IS DISTINCT FROM OLD.activo THEN 'producto_estado' ELSE 'producto_actualizar' END;
      v_descripcion := CASE
        WHEN NEW.activo IS DISTINCT FROM OLD.activo THEN 'Producto ' || CASE WHEN NEW.activo THEN 'activado' ELSE 'desactivado' END || ': ' || coalesce(NEW.nombre, NEW.id::text)
        ELSE 'Producto actualizado: ' || coalesce(NEW.nombre, NEW.id::text)
      END;
    END IF;
  ELSIF TG_TABLE_NAME = 'lotes_compra' THEN
    IF TG_OP <> 'INSERT' OR coalesce(NEW.origen, 'compra') <> 'compra' THEN RETURN NEW; END IF;
    v_tipo := 'compra'; v_entidad := NEW.id::text; v_descripcion := 'Compra registrada: lote ' || NEW.id::text;
  ELSIF TG_TABLE_NAME = 'ventas' THEN
    IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
    v_tipo := 'venta'; v_entidad := NEW.id::text; v_descripcion := 'Venta registrada: ' || NEW.id::text;
  ELSIF TG_TABLE_NAME = 'transferencias' THEN
    IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
    v_tipo := 'transferencia'; v_entidad := NEW.id::text; v_descripcion := 'Transferencia registrada: ' || NEW.id::text;
  ELSIF TG_TABLE_NAME = 'vales_salida' THEN
    IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
    v_tipo := 'vale'; v_entidad := NEW.id::text; v_descripcion := 'Vale de salida registrado: ' || NEW.id::text;
  ELSIF TG_TABLE_NAME = 'usuarios' THEN
    IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
    IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
      v_tipo := 'usuario_rol'; v_descripcion := 'Rol de usuario actualizado: ' || NEW.id::text;
    ELSIF NEW.activo IS DISTINCT FROM OLD.activo THEN
      v_tipo := 'usuario_estado'; v_descripcion := 'Usuario ' || CASE WHEN NEW.activo THEN 'activado' ELSE 'desactivado' END || ': ' || NEW.id::text;
    ELSE RETURN NEW; END IF;
    v_entidad := NEW.id::text;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.auditoria_operaciones(usuario_id,usuario_nombre,tipo,descripcion,estado,entidad_id,idempotency_key,payload_resumen)
  VALUES(v_uid,v_nombre,v_tipo,v_descripcion,'exito',v_entidad,NULL,NULL);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auditar_mutacion_operativa() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auditar_mutacion_operativa() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_auditoria_productos ON public.productos;
CREATE TRIGGER trg_auditoria_productos AFTER INSERT OR UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION public.auditar_mutacion_operativa();
DROP TRIGGER IF EXISTS trg_auditoria_lotes_compra ON public.lotes_compra;
CREATE TRIGGER trg_auditoria_lotes_compra AFTER INSERT ON public.lotes_compra FOR EACH ROW EXECUTE FUNCTION public.auditar_mutacion_operativa();
DROP TRIGGER IF EXISTS trg_auditoria_ventas ON public.ventas;
CREATE TRIGGER trg_auditoria_ventas AFTER INSERT ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.auditar_mutacion_operativa();
DROP TRIGGER IF EXISTS trg_auditoria_transferencias ON public.transferencias;
CREATE TRIGGER trg_auditoria_transferencias AFTER INSERT ON public.transferencias FOR EACH ROW EXECUTE FUNCTION public.auditar_mutacion_operativa();
DROP TRIGGER IF EXISTS trg_auditoria_vales ON public.vales_salida;
CREATE TRIGGER trg_auditoria_vales AFTER INSERT ON public.vales_salida FOR EACH ROW EXECUTE FUNCTION public.auditar_mutacion_operativa();
DROP TRIGGER IF EXISTS trg_auditoria_usuarios ON public.usuarios;
CREATE TRIGGER trg_auditoria_usuarios AFTER UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.auditar_mutacion_operativa();

REVOKE EXECUTE ON FUNCTION public.registrar_auditoria(text,text,text,text,uuid,jsonb) FROM anon, authenticated;
