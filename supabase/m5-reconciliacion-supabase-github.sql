-- =====================================================================
-- M5 — RECONCILIACIÓN SUPABASE ↔ GITHUB (Misión 1/3, Battlecruiser)
-- =====================================================================
-- Propósito: este archivo NO introduce funcionalidad nueva ni cambia
-- producción. Es la copia fiel (verificada con pg_get_functiondef
-- sobre el proyecto real papxnkkjtkxsitcsvcme) de piezas que YA
-- existen y funcionan en producción pero que ningún archivo del
-- repositorio representaba hasta ahora (ver RECONCILIACION_SUPABASE_GITHUB.md,
-- Hallazgos 2 y 3).
--
-- Es seguro re-ejecutar este archivo contra producción: todo es
-- CREATE OR REPLACE / CREATE ... IF NOT EXISTS sobre objetos que ya
-- existen con exactamente esta definición. Su valor real es para
-- GitHub: deja el repo capaz de reconstruir estas piezas desde cero.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Esquema `private` — mecanismo real de idempotencia de servidor
--    (no documentado en ningún archivo previo del repo)
-- ---------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.operaciones_idempotencia (
  idempotency_key uuid PRIMARY KEY,
  usuario_id uuid NOT NULL,
  tipo_operacion text NOT NULL,
  payload_hash text NOT NULL,
  resultado_id uuid,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- Nota de seguridad documentada en RECONCILIACION_SUPABASE_GITHUB.md
-- (Hallazgo 3): esta tabla tiene RLS deshabilitado en producción, pero
-- ni anon ni authenticated tienen USAGE sobre el esquema `private`, por
-- lo que no es alcanzable desde el cliente. No se activa RLS aquí para
-- no divergir de lo que hay realmente en producción (regla de la
-- misión: no inventar cambios). Queda como decisión pendiente de
-- discutir explícitamente con el usuario, no como fix automático.

CREATE OR REPLACE FUNCTION private.reclamar_idempotencia(
  p_idempotency_key uuid,
  p_usuario_id uuid,
  p_tipo_operacion text,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_hash text;
  v_existente private.operaciones_idempotencia%rowtype;
begin
  if p_idempotency_key is null then
    return null;
  end if;
  if p_usuario_id is null then
    raise exception 'No se puede usar idempotencia sin usuario autenticado';
  end if;

  v_hash := md5(coalesce(p_payload, '{}'::jsonb)::text);

  insert into private.operaciones_idempotencia (idempotency_key, usuario_id, tipo_operacion, payload_hash)
  values (p_idempotency_key, p_usuario_id, p_tipo_operacion, v_hash)
  on conflict (idempotency_key) do nothing;

  select * into v_existente
  from private.operaciones_idempotencia
  where idempotency_key = p_idempotency_key;

  if v_existente.usuario_id <> p_usuario_id then
    raise exception 'La clave de idempotencia ya pertenece a otro usuario';
  end if;

  if v_existente.tipo_operacion <> p_tipo_operacion or v_existente.payload_hash <> v_hash then
    raise exception 'La clave de idempotencia fue reutilizada con una operación diferente';
  end if;

  return v_existente.resultado_id;
end;
$function$;


-- ---------------------------------------------------------------------
-- 2. tiene_permiso() — base de las 24 policies RLS de public.
--    Existía en producción desde una migración fundacional anterior
--    a la numeración b3–b8 y nunca tuvo archivo propio en el repo.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tiene_permiso(p_seccion text, p_accion text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (
      select p.permitido
      from usuarios u
      join permisos p on p.role_id = u.role_id
      where u.id = auth.uid()
        and u.activo = true
        and p.seccion = p_seccion
        and p.accion = p_accion
    ),
    false
  );
$function$;


-- ---------------------------------------------------------------------
-- 3. obtener_conversion_presentacion() — creada por la migración real
--    "fn_obtener_conversion_presentacion" (2026-08-12), sin archivo
--    .sql propio en el repo.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.obtener_conversion_presentacion(
  p_producto_id uuid,
  p_presentacion_id uuid,
  p_cantidad numeric
)
RETURNS TABLE(factor numeric, unidades_base numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_producto_existe boolean;
  v_presentacion_activa boolean;
  v_factor numeric;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'cantidad debe ser mayor que cero' using errcode = '22023';
  end if;

  if p_cantidad <> trunc(p_cantidad) then
    raise exception 'cantidad debe ser un numero entero para presentaciones comerciales' using errcode = '22023';
  end if;

  select exists(select 1 from public.productos p where p.id = p_producto_id)
    into v_producto_existe;

  if not v_producto_existe then
    raise exception 'producto inexistente' using errcode = 'P0002';
  end if;

  select pr.activo into v_presentacion_activa
  from public.presentaciones pr
  where pr.id = p_presentacion_id;

  if not found then
    raise exception 'presentacion inexistente' using errcode = 'P0002';
  end if;

  if not v_presentacion_activa then
    raise exception 'presentacion inactiva' using errcode = '22023';
  end if;

  select pp.factor into v_factor
  from public.producto_presentaciones pp
  where pp.producto_id = p_producto_id
    and pp.presentacion_id = p_presentacion_id
    and pp.activo = true;

  if not found then
    raise exception 'asociacion producto-presentacion inexistente o inactiva' using errcode = 'P0002';
  end if;

  if v_factor is null or v_factor <= 0 then
    raise exception 'factor de conversion invalido' using errcode = '22023';
  end if;

  return query select v_factor as factor, (p_cantidad * v_factor) as unidades_base;
end;
$function$;


-- ---------------------------------------------------------------------
-- 4. proteger_ultimo_dueno() + su trigger — creada por
--    "b3_6_trigger_proteccion_ultimo_dueno", sin archivo .sql propio.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.proteger_ultimo_dueno()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rol_anterior text;
  v_duenos_activos int;
BEGIN
  IF NEW.role_id IS NOT DISTINCT FROM OLD.role_id AND NEW.activo IS NOT DISTINCT FROM OLD.activo THEN
    RETURN NEW;
  END IF;

  SELECT r.nombre INTO v_rol_anterior FROM public.roles r WHERE r.id = OLD.role_id;

  IF v_rol_anterior = 'Dueño' AND OLD.activo = true THEN
    IF (NEW.role_id IS DISTINCT FROM OLD.role_id) OR (NEW.activo = false) THEN
      SELECT count(*) INTO v_duenos_activos
      FROM public.usuarios u
      JOIN public.roles r ON r.id = u.role_id
      WHERE r.nombre = 'Dueño' AND u.activo = true AND u.id <> OLD.id;

      IF v_duenos_activos = 0 THEN
        RAISE EXCEPTION 'No se puede dejar el sistema sin ningún Dueño activo.' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_proteger_ultimo_dueno ON public.usuarios;
CREATE TRIGGER trg_proteger_ultimo_dueno
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_ultimo_dueno();


-- =====================================================================
-- FIN de la migración de reconciliación.
--
-- Lo que este archivo NO cubre (a propósito, fuera del alcance de
-- "documentar lo faltante crítico" de Misión 1/3):
--   - Las versiones reales completas de registrar_compra/venta/
--     transferencia/vale_salida/crear_producto (ya con FIFO inline +
--     private.reclamar_idempotencia). Se dejan para Misión 2/3, donde
--     se puede decidir si conviene reemplazar b6-nucleo-operativo.sql
--     completo o generar un b6-nucleo-operativo-v2.sql nuevo.
--   - Las ~35 migraciones incrementales restantes que no tocan objetos
--     nuevos (grants, revokes, índices, fixes de search_path) — no
--     aportan nada nuevo al repo si se documentan una por una; su
--     efecto neto ya está reflejado en SUPABASE_REAL_STATE.md (grants,
--     triggers, policies tal como quedaron).
-- =====================================================================
