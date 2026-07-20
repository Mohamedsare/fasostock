-- Module « Immatriculation Engins » : suivi du cycle de vie des documents d'une moto
-- vendue (CMC → WW/carte provisoire → dépôt ministère → récépissé → carte grise → remise
-- au client), rattaché à la vente d'engin (donc au client). Activable PAR BOUTIQUE par le
-- super admin, exactement comme « Vente Engins » (engine_sales_enabled).
--
-- Un dossier = une vente d'engin (sales.sale_kind='engine'). Client / engin hérités de
-- engine_sale_details. Le WW ne s'émet que si la vente est soldée (contrôle applicatif).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Flag d'activation par boutique
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS engine_registration_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stores.engine_registration_enabled IS
  'Module Immatriculation Engins (CMC/WW/récépissé/carte grise) — activable par boutique '
  'par le super admin. Défaut désactivé.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Dossier d'immatriculation (1 ↔ 1 avec une vente d'engin)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.engine_registrations (
  sale_id uuid PRIMARY KEY REFERENCES public.sales(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- CMC (Certificat de Mise en Circulation) — présent ou non à l'arrivée de la moto.
  cmc_available boolean NOT NULL DEFAULT false,
  cmc_number text,
  cmc_date date,

  -- WW (carte provisoire) — émise seulement si la vente est soldée (contrôle applicatif).
  ww_number text,
  ww_date date,

  -- Dépôt du dossier au Ministère des Transports (pour la carte grise).
  deposit_date date,
  deposit_reference text,

  -- Récépissé de la carte grise (remis quelques jours/mois après le dépôt).
  recepisse_number text,
  recepisse_date date,

  -- Carte grise définitive + remise au client.
  carte_grise_number text,
  carte_grise_date date,
  delivered_to_client_date date,

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engine_registrations_company_idx
  ON public.engine_registrations (company_id);

ALTER TABLE public.engine_registrations ENABLE ROW LEVEL SECURITY;

-- Accès entreprise (aligné sur engine_sale_details : super admin ou membre de l'entreprise).
DROP POLICY IF EXISTS "engine_registrations_all" ON public.engine_registrations;
CREATE POLICY "engine_registrations_all" ON public.engine_registrations
  FOR ALL
  USING (
    is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
  )
  WITH CHECK (
    is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
  );

-- updated_at auto (fonction existante, cf. 00140).
DROP TRIGGER IF EXISTS engine_registrations_set_updated_at ON public.engine_registrations;
CREATE TRIGGER engine_registrations_set_updated_at
  BEFORE UPDATE ON public.engine_registrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
