-- N° d'ordonnance sur la vente (pharmacie). 100 % additif : colonne nullable.
-- Renseignée par UPDATE direct après création de la vente (policy `sales_update`),
-- donc AUCUNE modification du RPC atomique `create_sale_with_stock`.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS prescription_number TEXT;

COMMENT ON COLUMN public.sales.prescription_number IS 'Pharmacie : numéro d''ordonnance associé à la dispensation (optionnel).';
