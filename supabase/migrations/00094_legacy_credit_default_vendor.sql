-- Backfill vendeur pour anciens crédits libres:
-- - Si vendeur absent (ancien format), forcer "OUEDRAOGO BOUBA"
-- - Conserver la note existante dans le champ "note" du payload JSON.

UPDATE public.legacy_customer_credits
SET internal_note =
  '__VENDEUR__:' ||
  json_build_object(
    'vendor',
    'OUEDRAOGO BOUBA',
    'note',
    NULLIF(btrim(COALESCE(internal_note, '')), '')
  )::text
WHERE internal_note IS NULL
   OR btrim(internal_note) = ''
   OR internal_note NOT LIKE '__VENDEUR__:%';
