-- BC14.15: el overload legado de registrar_venta es un contrato de validación.
-- No debe ser invocable por anon/PUBLIC como SECURITY DEFINER.
revoke execute on function public.registrar_venta(uuid,text,jsonb,text,numeric,text) from public, anon;
grant execute on function public.registrar_venta(uuid,text,jsonb,text,numeric,text) to authenticated, service_role;
