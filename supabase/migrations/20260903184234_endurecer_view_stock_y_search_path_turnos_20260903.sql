ALTER VIEW public.v_stock_bajo_reposicion SET (security_invoker = true);
ALTER FUNCTION public.bc_orden_bloque_sesion(text) SET search_path TO public, pg_temp;
