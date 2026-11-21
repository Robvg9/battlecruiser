BEGIN;
REVOKE ALL ON FUNCTION public.bc7_vincular_transferencia_jornada_destino_minorista()
  FROM PUBLIC, anon, authenticated;
COMMIT;
