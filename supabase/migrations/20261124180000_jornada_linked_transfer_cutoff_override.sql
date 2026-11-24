BEGIN;

-- An explicitly audited retroactive transfer link is an Owner-authorized
-- attribution override for the upper operational cutoff. The link must never
-- bypass the inherited opening boundary, warehouse destination, or exact
-- Jornada identity. Unlinked late transfers remain outside the settlement.
DO $migration$
DECLARE
  v_function text := pg_get_functiondef(
    'public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure
  );
  v_old_filter text := $old$
      AND t.fecha>v_start_at AND t.fecha<=v_end_at
      AND (NOT v_retroactive$old$;
  v_new_filter text := $new$
      AND t.fecha>v_start_at
      AND (
        t.fecha<=v_end_at
        OR EXISTS (
          SELECT 1
          FROM public.turno_jornada_entradas_vinculadas linked_override
          WHERE linked_override.turno_sesion_id=v_s.id
            AND linked_override.transferencia_id=t.id
        )
      )
      AND (NOT v_retroactive$new$;
BEGIN
  IF position(v_new_filter IN v_function)=0 THEN
    IF position(v_old_filter IN v_function)=0 THEN
      RAISE EXCEPTION
        'Could not locate the inbound transfer cutoff filter; refusing a partial settlement-function rewrite.';
    END IF;
    v_function := replace(v_function,v_old_filter,v_new_filter);
  END IF;

  EXECUTE v_function;
END
$migration$;

COMMIT;
