-- Dual-POS : type de vente et type de document (ticket thermique vs facture A4).
-- + Colonnes personnalisation facture A4 sur stores.

-- Enums
DO $$ BEGIN
  CREATE TYPE public.sale_mode AS ENUM ('quick_pos', 'invoice_pos');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.document_type AS ENUM ('thermal_receipt', 'a4_invoice');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Sales : mode et type de document (défaut = caisse rapide / ticket thermique pour l'existant)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS sale_mode public.sale_mode NOT NULL DEFAULT 'quick_pos',
  ADD COLUMN IF NOT EXISTS document_type public.document_type NOT NULL DEFAULT 'thermal_receipt';

COMMENT ON COLUMN public.sales.sale_mode IS 'quick_pos = caisse rapide, invoice_pos = vente détaillée facture A4';
COMMENT ON COLUMN public.sales.document_type IS 'thermal_receipt = ticket thermique, a4_invoice = facture A4';

-- Stores : personnalisation facture A4 (logo, couleurs, mentions légales, etc.)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'XOF',
  ADD COLUMN IF NOT EXISTS primary_color TEXT,
  ADD COLUMN IF NOT EXISTS secondary_color TEXT,
  ADD COLUMN IF NOT EXISTS invoice_prefix TEXT DEFAULT 'FAC',
  ADD COLUMN IF NOT EXISTS footer_text TEXT,
  ADD COLUMN IF NOT EXISTS legal_info TEXT,
  ADD COLUMN IF NOT EXISTS signature_url TEXT,
  ADD COLUMN IF NOT EXISTS stamp_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS tax_label TEXT,
  ADD COLUMN IF NOT EXISTS tax_number TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS commercial_name TEXT,
  ADD COLUMN IF NOT EXISTS slogan TEXT;

COMMENT ON COLUMN public.stores.invoice_prefix IS 'Préfixe numérotation factures (ex: FAC, INV)';
COMMENT ON COLUMN public.stores.primary_color IS 'Couleur principale (hex) pour en-tête facture';
COMMENT ON COLUMN public.stores.signature_url IS 'URL image signature pour facture A4';
COMMENT ON COLUMN public.stores.stamp_url IS 'URL image cachet pour facture A4';
