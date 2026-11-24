BEGIN;

-- A pending successor must be compared only with rows from its exact,
-- confirmed source FINAL cut. Without this source-cut predicate the anti-match
-- counts unrelated historical inventory lines from every other shift and
-- produces false mismatches (for La Cueva: 400 instead of 0).
DO $fix$
DECLARE
  v_definition text;
  v_old_block text := $old$
  ) correction ON true
  WHERE delivery_line.id IS NULL
     OR delivery_line.cantidad_declarada IS DISTINCT FROM
        coalesce(correction.cantidad_corregida,source_line.cantidad_contada);
$old$;
  v_new_block text := $new$
  ) correction ON true
  WHERE source_line.corte_id=v_e.origen_corte_id
    AND (
      delivery_line.id IS NULL
      OR delivery_line.cantidad_declarada IS DISTINCT FROM
         coalesce(correction.cantidad_corregida,source_line.cantidad_contada)
    );
$new$;
BEGIN
  SELECT replace(
    pg_get_functiondef(
      'public.bc7_admin_programar_sucesora_pendiente(uuid,date,uuid,text)'::regprocedure
    ),
    E'\\r\\n',
    E'\\n'
  )
  INTO v_definition;

  v_old_block:=replace(v_old_block,E'\\r\\n',E'\\n');
  v_new_block:=replace(v_new_block,E'\\r\\n',E'\\n');

  IF position(v_old_block IN v_definition)=0 THEN
    RAISE EXCEPTION
      'Expected unscoped FINAL mismatch block was not found; refusing to patch an unexpected function version.';
  END IF;

  v_definition:=replace(v_definition,v_old_block,v_new_block);
  EXECUTE v_definition;
END
$fix$;

NOTIFY pgrst, 'reload schema';

COMMIT;
