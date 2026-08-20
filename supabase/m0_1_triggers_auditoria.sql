-- DOCUMENTAL — YA EXISTE EN PRODUCCIÓN — NO EJECUTAR COMO MIGRACIÓN NUEVA
--
-- Extraído por introspección real (pg_trigger + pg_get_triggerdef()) contra
-- Supabase producción (project_ref: papxnkkjtkxsitcsvcme) el 2026-08-20.
-- Objetivo: dejar en el repo la definición de los 11 triggers reales sobre
-- 6 tablas de public que existían en producción sin archivo .sql fuente
-- versionado. Coinciden exactamente con la auditoría Mission 3
-- (docs/archive/SUPABASE_REAL_STATE.md, sección "5. Triggers (11, sobre 6 tablas)").
--
-- Funciones de trigger referenciadas (ya existentes en producción,
-- no se recrean aquí): auditar_mutacion_operativa(), proteger_ultimo_dueno(),
-- validar_producto_activo_en_mutacion().

-- =========================================================
-- lotes_compra
-- =========================================================
CREATE TRIGGER trg_auditoria_lotes_compra
AFTER INSERT ON public.lotes_compra
FOR EACH ROW EXECUTE FUNCTION auditar_mutacion_operativa();

CREATE TRIGGER trg_validar_producto_activo_lotes
BEFORE INSERT ON public.lotes_compra
FOR EACH ROW EXECUTE FUNCTION validar_producto_activo_en_mutacion();

-- =========================================================
-- productos
-- =========================================================
CREATE TRIGGER trg_auditoria_productos
AFTER INSERT OR UPDATE ON public.productos
FOR EACH ROW EXECUTE FUNCTION auditar_mutacion_operativa();

-- =========================================================
-- transferencias
-- =========================================================
CREATE TRIGGER trg_auditoria_transferencias
AFTER INSERT ON public.transferencias
FOR EACH ROW EXECUTE FUNCTION auditar_mutacion_operativa();

-- =========================================================
-- transferencias_lineas
-- =========================================================
CREATE TRIGGER trg_validar_producto_activo_transferencias_lineas
BEFORE INSERT ON public.transferencias_lineas
FOR EACH ROW EXECUTE FUNCTION validar_producto_activo_en_mutacion();

-- =========================================================
-- usuarios
-- =========================================================
CREATE TRIGGER trg_auditoria_usuarios
AFTER UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION auditar_mutacion_operativa();

CREATE TRIGGER trg_proteger_ultimo_dueno
BEFORE UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION proteger_ultimo_dueno();

-- =========================================================
-- vales_salida
-- =========================================================
CREATE TRIGGER trg_auditoria_vales
AFTER INSERT ON public.vales_salida
FOR EACH ROW EXECUTE FUNCTION auditar_mutacion_operativa();

CREATE TRIGGER trg_validar_producto_activo_vales
BEFORE INSERT ON public.vales_salida
FOR EACH ROW EXECUTE FUNCTION validar_producto_activo_en_mutacion();

-- =========================================================
-- ventas
-- =========================================================
CREATE TRIGGER trg_auditoria_ventas
AFTER INSERT ON public.ventas
FOR EACH ROW EXECUTE FUNCTION auditar_mutacion_operativa();

-- =========================================================
-- ventas_lineas
-- =========================================================
CREATE TRIGGER trg_validar_producto_activo_ventas_lineas
BEFORE INSERT ON public.ventas_lineas
FOR EACH ROW EXECUTE FUNCTION validar_producto_activo_en_mutacion();
