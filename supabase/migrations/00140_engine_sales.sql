-- Module « Vente Engins » (motos / engins) — vente type POS avec facture A4 riche.
--
-- 1. Flag d'activation PAR BOUTIQUE (super admin) + champs de config facture
--    spécifiques (personnalisables par chaque entreprise — rien en dur).
-- 2. Marqueur sale_kind='engine' sur les ventes existantes (réutilise toute
--    l'infra ventes/stock/paiement via create_sale_with_stock).
-- 3. Table engine_sale_details : toutes les infos client / engin / garantie /
--    accessoires de la facture, 1 ligne par vente.
-- 4. RPC publique de vérification (QR) exposant un récap NON sensible.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Boutique : flag + config facture engin
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS engine_sales_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS engine_invoice_signatory text,
  ADD COLUMN IF NOT EXISTS engine_invoice_extra_phones text;

COMMENT ON COLUMN public.stores.engine_sales_enabled IS
  'Module Vente Engins — activable par boutique uniquement par le super admin. Défaut désactivé.';
COMMENT ON COLUMN public.stores.engine_invoice_signatory IS
  'Nom du signataire de la facture engin (« Je soussigné … »). Config par entreprise.';
COMMENT ON COLUMN public.stores.engine_invoice_extra_phones IS
  'Téléphones supplémentaires affichés sur la facture engin (séparés par des virgules).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Vente : type de vente
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS sale_kind text NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_sale_kind_check'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_sale_kind_check
      CHECK (sale_kind IN ('standard', 'engine'));
  END IF;
END $$;

COMMENT ON COLUMN public.sales.sale_kind IS
  'Type de vente : ''standard'' (POS classique) ou ''engine'' (Vente Engins).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Détails de la vente d'engin (1 ↔ 1 avec sales)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.engine_sale_details (
  sale_id uuid PRIMARY KEY REFERENCES public.sales(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Client
  client_name text,
  client_civility text,
  client_profession text,
  client_full_identity text,
  client_id_type text,
  client_id_number text,
  client_address text,
  client_address_extra text,
  client_phone1 text,
  client_phone2 text,
  client_email text,

  -- Engin
  engine_wheels smallint,                       -- 2 ou 3 roues
  engine_brand text,
  engine_model text,
  engine_designation text,
  engine_chassis text,
  engine_motor text,
  engine_color text,
  engine_condition text,                        -- 'neuf' | 'occasion'

  -- Montant en lettres (les chiffres = sales.total ; détail paiement = sale_payments)
  amount_in_words text,

  -- Garantie éventuelle
  warranty boolean NOT NULL DEFAULT false,
  warranty_duration text,
  warranty_km_limit text,
  warranty_covered text,
  warranty_conditions text,

  -- Accessoires remis avec la moto
  acc_helmet boolean NOT NULL DEFAULT false,
  acc_toolkit boolean NOT NULL DEFAULT false,
  acc_manual boolean NOT NULL DEFAULT false,
  acc_keys boolean NOT NULL DEFAULT false,
  acc_vest boolean NOT NULL DEFAULT false,
  acc_other text,

  -- Divers
  observations text,
  internal_reference text,
  -- Jeton public opaque pour le QR de vérification.
  verification_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engine_sale_details_company_idx
  ON public.engine_sale_details (company_id);

ALTER TABLE public.engine_sale_details ENABLE ROW LEVEL SECURITY;

-- Accès entreprise (aligné sur les autres tables : super admin ou membre de l'entreprise).
DROP POLICY IF EXISTS "engine_sale_details_all" ON public.engine_sale_details;
CREATE POLICY "engine_sale_details_all" ON public.engine_sale_details
  FOR ALL
  USING (
    is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
  )
  WITH CHECK (
    is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
  );

-- updated_at auto
DROP TRIGGER IF EXISTS engine_sale_details_set_updated_at ON public.engine_sale_details;
CREATE TRIGGER engine_sale_details_set_updated_at
  BEFORE UPDATE ON public.engine_sale_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Vérification publique de la facture (QR) — récap NON sensible.
--    Appelable par le rôle anon (page publique), sans exposer pièce d'identité,
--    email, ni détail financier autre que le total.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_engine_sale(p_token text)
RETURNS TABLE (
  sale_number text,
  sale_date timestamptz,
  total numeric,
  store_name text,
  company_name text,
  client_name text,
  engine_designation text,
  engine_brand text,
  engine_model text,
  engine_chassis text,
  internal_reference text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.sale_number,
    s.created_at AS sale_date,
    s.total,
    st.name AS store_name,
    c.name AS company_name,
    d.client_name,
    d.engine_designation,
    d.engine_brand,
    d.engine_model,
    d.engine_chassis,
    d.internal_reference
  FROM public.engine_sale_details d
  JOIN public.sales s ON s.id = d.sale_id
  JOIN public.stores st ON st.id = s.store_id
  JOIN public.companies c ON c.id = s.company_id
  WHERE d.verification_token = p_token
    AND s.status <> 'cancelled'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.verify_engine_sale IS
  'Vérification publique (QR) d''une facture de vente d''engin — champs non sensibles uniquement.';

GRANT EXECUTE ON FUNCTION public.verify_engine_sale(text) TO anon, authenticated;
