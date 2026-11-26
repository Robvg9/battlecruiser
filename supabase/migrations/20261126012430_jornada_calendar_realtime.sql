-- Add only the two jornada tables needed by the calendar's RLS-scoped live refresh.
-- Realtime carries change notifications; the UI re-reads the authorized bc5_mis_jornadas RPC.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Expected Supabase publication supabase_realtime was not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'turno_sesiones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.turno_sesiones;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'turnos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.turnos;
  END IF;
END
$$;
