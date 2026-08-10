-- FasoStock — « Motos identifiées » : le châssis, le moteur et la couleur de CHAQUE engin.
--
-- Problème : une moto n'est pas un sac de riz. Dix « Sanili 110 » dans la cour, ce sont dix
-- ENGINS DIFFÉRENTS — chacun avec son numéro de châssis (gravé, unique au monde), son numéro
-- de moteur et sa couleur. Le catalogue, lui, ne connaît qu'une ligne « Sanili 110, stock 10 ».
-- Résultat aujourd'hui : le vendeur ressaisit le châssis à la main sur la facture, en le lisant
-- sur l'engin ou pire, sur un cahier. Une faute de frappe sur un châssis, et c'est la carte
-- grise du client qui coince à la mairie.
--
-- Réponse : une ligne par engin physique (`engine_units`), rattachée au produit du catalogue.
-- Le produit reste le MODÈLE (nom, prix, stock) ; l'unité porte l'IDENTITÉ (châssis, moteur,
-- couleur) et son état (en stock / vendue, et à quelle vente).
--
-- Ce que ça change concrètement :
--   • à la réception : on saisit les châssis une fois, dans la fiche produit ;
--   • à la vente : le vendeur CHOISIT l'engin dans la liste → châssis / moteur / couleur
--     partent tels quels sur la facture A4, sans ressaisie ;
--   • après : on sait quelle moto précise a été vendue, à qui, et laquelle reste en cour.
--
-- Activation : AUCUN drapeau propre. La fonction s'ouvre et se ferme AVEC le module
-- « Vente Engins » (`stores.engine_sales_enabled`, 00140) : là où on vend des engins,
-- on enregistre leur châssis ; ailleurs, la section n'existe pas. Un réglage de plus
-- n'aurait rien décidé de plus — personne n'active Vente Engins sans vouloir suivre
-- ses châssis. Module coupé ⇒ la section disparaît de la fiche produit et le choix de
-- l'engin disparaît de la vente, sans que rien ne soit détruit : les engins déjà saisis
-- dorment et reviennent tels quels à la réactivation.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Les engins physiques
-- ─────────────────────────────────────────────────────────────────────────────
-- Une table (et non un tableau sur `products` comme les alias) : ici la donnée VIT.
-- Chaque ligne a un état qui change (en stock → vendue), se rattache à une vente, se
-- cherche par châssis. C'est exactement ce qu'une table sait faire et qu'un `text[]` ne
-- sait pas. Le stock chiffré reste `store_inventory` : cette table ne le remplace pas,
-- elle l'IDENTIFIE.
CREATE TABLE IF NOT EXISTS public.engine_units (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Le modèle au catalogue (« Sanili 110 »). Produit supprimé ⇒ ses engins partent avec.
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- Boutique où se trouve l'engin. Nullable : une entreprise mono-boutique ne s'en sert pas,
  -- et un engin saisi en vue « toutes boutiques » n'a pas d'emplacement connu.
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,

  -- Identité gravée sur l'engin.
  chassis_number text NOT NULL,
  engine_number text,
  color text,

  -- État : 'in_stock' (en cour) | 'sold' (facturée).
  status text NOT NULL DEFAULT 'in_stock',
  -- Vente qui a sorti l'engin. Vente supprimée ⇒ NULL, et le trigger ci-dessous remet
  -- l'engin en stock (sinon il resterait « vendu » sans facture, invendable à vie).
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  sold_at timestamptz,

  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.engine_units IS
  'Un engin PHYSIQUE (moto…) : châssis, moteur, couleur. Le produit reste le modèle ; '
  'cette table donne son identité à chaque exemplaire et suit son état (en stock / vendu).';
COMMENT ON COLUMN public.engine_units.chassis_number IS
  'Numéro de châssis gravé — unique dans l''entreprise (normalisé en majuscules sans espaces).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.engine_units'::regclass
      AND conname = 'engine_units_status_check'
  ) THEN
    ALTER TABLE public.engine_units
      ADD CONSTRAINT engine_units_status_check
      CHECK (status IN ('in_stock', 'sold'));
  END IF;
END;
$$;

-- Normalisation : le châssis se lit sur un cadre poussiéreux, il arrive avec des espaces
-- et en minuscules. On range TOUJOURS la même forme (majuscules, sans espace) — sinon
-- « lc4b 12 34 » et « LC4B1234 » cohabiteraient et l'unicité ne servirait à rien.
CREATE OR REPLACE FUNCTION public.engine_units_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.chassis_number := upper(regexp_replace(COALESCE(NEW.chassis_number, ''), '\s+', '', 'g'));
  IF NEW.chassis_number = '' THEN
    RAISE EXCEPTION 'Le numéro de châssis est obligatoire.';
  END IF;
  NEW.engine_number := NULLIF(upper(regexp_replace(COALESCE(NEW.engine_number, ''), '\s+', '', 'g')), '');
  NEW.color := NULLIF(btrim(COALESCE(NEW.color, '')), '');
  NEW.notes := NULLIF(btrim(COALESCE(NEW.notes, '')), '');

  -- Cohérence état ↔ vente : un engin vendu porte une date, un engin remis en stock
  -- ne garde ni vente ni date. Vaut pour TOUS les clients (web, Flutter, import).
  IF NEW.status = 'sold' THEN
    NEW.sold_at := COALESCE(NEW.sold_at, now());
  ELSE
    NEW.sale_id := NULL;
    NEW.sold_at := NULL;
  END IF;

  -- Vente détachée (sale supprimée → ON DELETE SET NULL) : l'engin retourne en stock.
  IF TG_OP = 'UPDATE' AND NEW.sale_id IS NULL AND OLD.sale_id IS NOT NULL AND NEW.status = 'sold' THEN
    NEW.status := 'in_stock';
    NEW.sold_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engine_units_normalize_trigger ON public.engine_units;
CREATE TRIGGER engine_units_normalize_trigger
  BEFORE INSERT OR UPDATE ON public.engine_units
  FOR EACH ROW
  EXECUTE PROCEDURE public.engine_units_normalize();

-- Un châssis n'existe qu'une fois : la contrainte attrape la double saisie (deux vendeurs,
-- ou le même engin ressaisi par erreur sur un autre modèle) AVANT qu'elle ne pollue le stock.
CREATE UNIQUE INDEX IF NOT EXISTS engine_units_chassis_unique
  ON public.engine_units (company_id, chassis_number);

CREATE INDEX IF NOT EXISTS engine_units_product_idx
  ON public.engine_units (product_id, status);
CREATE INDEX IF NOT EXISTS engine_units_company_idx
  ON public.engine_units (company_id, status);
CREATE INDEX IF NOT EXISTS engine_units_sale_idx
  ON public.engine_units (sale_id)
  WHERE sale_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.engine_units;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.engine_units
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.engine_units ENABLE ROW LEVEL SECURITY;

-- Accès entreprise, aligné sur `engine_sale_details` (00140).
DROP POLICY IF EXISTS "engine_units_all" ON public.engine_units;
CREATE POLICY "engine_units_all" ON public.engine_units
  FOR ALL
  USING (
    is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
  )
  WITH CHECK (
    is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Sortie de stock d'un engin (appelée juste après la vente)
-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotente : la vente d'engin peut être rejouée (file d'attente hors ligne, reprise
-- après coupure). Rejouer avec la MÊME vente ne fait rien ; réserver un engin déjà vendu
-- à une AUTRE vente est refusé — deux clients ne repartent pas avec le même châssis.
CREATE OR REPLACE FUNCTION public.engine_unit_mark_sold(
  p_unit_id uuid,
  p_sale_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_status text;
  v_sale uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT company_id, status, sale_id
    INTO v_company, v_status, v_sale
  FROM public.engine_units
  WHERE id = p_unit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Engin introuvable.';
  END IF;
  IF NOT (public.is_super_admin() OR v_company IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;

  -- Déjà rattaché à CETTE vente : rejouage, on sort sans rien changer.
  IF v_status = 'sold' AND v_sale IS NOT DISTINCT FROM p_sale_id THEN
    RETURN;
  END IF;
  IF v_status = 'sold' THEN
    RAISE EXCEPTION 'Cet engin a déjà été vendu.';
  END IF;

  UPDATE public.engine_units
  SET status = 'sold',
      sale_id = p_sale_id,
      sold_at = now()
  WHERE id = p_unit_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.engine_unit_mark_sold(uuid, uuid) TO authenticated;
