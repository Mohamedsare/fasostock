-- FasoStock — Module « Pièces » : compatibilités, équivalences et variantes.
--
-- Métier visé : vendeurs de pièces détachées (motos, autos, engins, électroménager…),
-- quincailleries, magasins de prêt-à-porter. Trois besoins concrets, une seule page :
--
--   1. COMPATIBILITÉS  — « quelles pièces vont sur une Yamaha Crypton ? »
--      Un produit est lié à N modèles (`part_models`). La recherche par modèle sort
--      tout ce qui est compatible, avec le stock de la boutique en cours.
--
--   2. ÉQUIVALENCES    — « la pièce d'origine est en rupture, qu'est-ce qui la remplace ? »
--      Paires produit ↔ produit, qualifiées (origine / générique / adaptable). La
--      relation est stockée DANS LES DEUX SENS par la RPC : la lecture est donc un
--      simple SELECT, jamais un UNION fragile.
--
--   3. VARIANTES       — « le même tee-shirt en 4 tailles et 3 couleurs ».
--      On REGROUPE des fiches produit existantes au lieu d'inventer un second modèle
--      de stock : chaque déclinaison garde sa ligne `products` (donc son stock, son
--      code-barres, son prix, ses ventes — rien à migrer, rien à casser au POS), et le
--      groupe (`product_variant_groups`) fournit la vue « une seule fiche ».
--
-- Activation : DÉSACTIVÉ PAR DÉFAUT. Le super admin ouvre le module pour toute une
-- entreprise (`companies.parts_module_enabled`) ou pour une boutique en particulier
-- (`stores.parts_module_enabled`). Tant que rien n'est activé, la page est masquée et
-- les RPC refusent d'écrire — l'application est strictement inchangée.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drapeaux d'activation (plateforme)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS parts_module_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.parts_module_enabled IS
  'Module Pièces (compatibilités par modèle, équivalences, variantes) actif pour TOUTE '
  'l''entreprise. Réservé au super admin. Défaut désactivé.';

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS parts_module_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stores.parts_module_enabled IS
  'Module Pièces activé pour cette boutique — activable par le super admin depuis '
  'Admin › Boutiques. Défaut désactivé. S''ajoute au drapeau entreprise.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Permission dédiée (owner par défaut, accordable aux autres rôles)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (id, key)
VALUES (uuid_generate_v4(), 'parts.manage')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Garde plateforme : seul le super admin bascule le drapeau entreprise
--    (étend 00132 / 00162 — même corps, colonne `parts_module_enabled` en plus).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.companies_enforce_platform_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.warehouse_feature_enabled IS DISTINCT FROM OLD.warehouse_feature_enabled
     OR NEW.store_quota_increase_enabled IS DISTINCT FROM OLD.store_quota_increase_enabled
     OR NEW.ai_predictions_enabled IS DISTINCT FROM OLD.ai_predictions_enabled
     OR NEW.accounting_module_enabled IS DISTINCT FROM OLD.accounting_module_enabled
     OR NEW.hr_module_enabled IS DISTINCT FROM OLD.hr_module_enabled
     OR NEW.expiry_module_enabled IS DISTINCT FROM OLD.expiry_module_enabled
     OR NEW.parts_module_enabled IS DISTINCT FROM OLD.parts_module_enabled
  THEN
    RAISE EXCEPTION 'Modification réservée à l''administration plateforme.';
  END IF;

  IF NEW.store_quota IS DISTINCT FROM OLD.store_quota THEN
    IF NEW.store_quota > OLD.store_quota AND NOT COALESCE(OLD.store_quota_increase_enabled, true) THEN
      RAISE EXCEPTION 'L''augmentation du quota de boutiques est désactivée pour cette entreprise.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_enforce_platform_flags_trigger ON public.companies;
CREATE TRIGGER companies_enforce_platform_flags_trigger
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE PROCEDURE public.companies_enforce_platform_flags();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tables
-- ─────────────────────────────────────────────────────────────────────────────

/** Un modèle d'engin / véhicule / appareil auquel des pièces s'adaptent. */
CREATE TABLE IF NOT EXISTS public.part_models (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  /** Nom du modèle — ex. « Crypton 115 », « Corolla E120 », « KDK 1500 ». */
  name text NOT NULL,
  /** Marque / constructeur — ex. « Yamaha », « Toyota ». Facultatif. */
  maker text,
  /** Millésimes couverts, saisie libre — ex. « 2008-2015 ». Facultatif. */
  years text,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.part_models IS
  'Modèles (moto, auto, appareil) servant de clé de recherche « quelles pièces vont sur … ».';
CREATE INDEX IF NOT EXISTS idx_part_models_company ON public.part_models(company_id);
-- Un même modèle ne doit pas être saisi deux fois (casse / espaces ignorés).
CREATE UNIQUE INDEX IF NOT EXISTS uq_part_models_company_name
  ON public.part_models(company_id, lower(btrim(name)), lower(btrim(coalesce(maker, ''))));

/** Lien N-N produit ↔ modèle : « cette pièce va sur ce modèle ». */
CREATE TABLE IF NOT EXISTS public.product_part_models (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES public.part_models(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, model_id)
);
CREATE INDEX IF NOT EXISTS idx_product_part_models_model ON public.product_part_models(model_id);
CREATE INDEX IF NOT EXISTS idx_product_part_models_product ON public.product_part_models(product_id);
CREATE INDEX IF NOT EXISTS idx_product_part_models_company ON public.product_part_models(company_id);

/**
 * Équivalence / référence croisée entre deux produits.
 * Écrite DANS LES DEUX SENS par `product_equivalences_set` (A→B et B→A) : la lecture
 * reste un SELECT direct sur `product_id`, et une suppression nettoie les deux lignes.
 */
CREATE TABLE IF NOT EXISTS public.product_equivalences (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  equivalent_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  /** Nature du remplaçant vu depuis `product_id`. */
  kind text NOT NULL DEFAULT 'equivalent'
    CHECK (kind IN ('origine', 'generique', 'adaptable', 'equivalent')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, equivalent_id),
  CONSTRAINT product_equivalences_not_self CHECK (product_id <> equivalent_id)
);
COMMENT ON TABLE public.product_equivalences IS
  'Références croisées : quel produit peut remplacer quel autre (origine / générique / adaptable).';
CREATE INDEX IF NOT EXISTS idx_product_equivalences_product ON public.product_equivalences(product_id);
CREATE INDEX IF NOT EXISTS idx_product_equivalences_company ON public.product_equivalences(company_id);

/** Famille de déclinaisons : « Tee-shirt col rond » décliné en Couleur × Taille. */
CREATE TABLE IF NOT EXISTS public.product_variant_groups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  /** Axes de déclinaison — ex. {Couleur, Taille}. 1 à 3 axes. */
  attribute_names text[] NOT NULL DEFAULT '{}',
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.product_variant_groups IS
  'Regroupe des fiches produit en une famille de déclinaisons. Chaque variante reste une '
  'ligne products à part entière : stock, code-barres, prix et ventes inchangés.';
CREATE INDEX IF NOT EXISTS idx_product_variant_groups_company ON public.product_variant_groups(company_id);

-- Rattachement d'un produit à sa famille + valeurs de ses axes.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variant_group_id uuid
    REFERENCES public.product_variant_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_attributes jsonb;

COMMENT ON COLUMN public.products.variant_group_id IS
  'Famille de déclinaisons (module Pièces). NULL = produit autonome (cas par défaut).';
COMMENT ON COLUMN public.products.variant_attributes IS
  'Valeurs des axes de la famille — ex. {"Couleur":"Rouge","Taille":"XL"}. NULL si hors famille.';

CREATE INDEX IF NOT EXISTS idx_products_variant_group
  ON public.products(variant_group_id) WHERE variant_group_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS — lecture par les membres de l'entreprise ; écriture via RPC uniquement
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.part_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_part_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_equivalences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variant_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "part_models_select" ON public.part_models;
CREATE POLICY "part_models_select" ON public.part_models FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "product_part_models_select" ON public.product_part_models;
CREATE POLICY "product_part_models_select" ON public.product_part_models FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "product_equivalences_select" ON public.product_equivalences;
CREATE POLICY "product_equivalences_select" ON public.product_equivalences FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "product_variant_groups_select" ON public.product_variant_groups;
CREATE POLICY "product_variant_groups_select" ON public.product_variant_groups FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Helpers de droit
-- ─────────────────────────────────────────────────────────────────────────────

/** Le module est-il ouvert pour cette entreprise (entreprise entière ou une boutique) ? */
CREATE OR REPLACE FUNCTION public.parts_module_enabled(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT c.parts_module_enabled FROM public.companies c WHERE c.id = p_company_id),
    false
  )
  OR EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.company_id = p_company_id AND s.parts_module_enabled = true
  );
$$;
GRANT EXECUTE ON FUNCTION public.parts_module_enabled(uuid) TO authenticated;

/** Droit effectif d'écriture : module ouvert + owner ou permission `parts.manage`. */
CREATE OR REPLACE FUNCTION public.can_manage_parts(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.parts_module_enabled(p_company_id)
     AND (
       public.user_is_company_owner(p_company_id)
       OR ('parts.manage' = ANY(public.get_my_permission_keys(p_company_id)))
     );
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_parts(uuid) TO authenticated;

/** Garde commune aux RPC d'écriture : entreprise autorisée + module + droit. */
CREATE OR REPLACE FUNCTION public.parts_assert_can_manage(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_company_id IS NULL
     OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Entreprise invalide ou non autorisée';
  END IF;
  IF NOT public.parts_module_enabled(p_company_id) THEN
    RAISE EXCEPTION 'Le module Pièces n''est pas activé pour cette entreprise.';
  END IF;
  IF NOT public.can_manage_parts(p_company_id) THEN
    RAISE EXCEPTION 'Droit insuffisant pour gérer les pièces et variantes.';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.parts_assert_can_manage(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC — Modèles
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.part_model_save(
  p_id uuid,
  p_company_id uuid,
  p_name text,
  p_maker text,
  p_years text,
  p_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.parts_assert_can_manage(p_company_id);

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Nom du modèle requis';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.part_models (company_id, name, maker, years, note, created_by)
    VALUES (p_company_id, btrim(p_name), NULLIF(btrim(coalesce(p_maker, '')), ''),
            NULLIF(btrim(coalesce(p_years, '')), ''), NULLIF(btrim(coalesce(p_note, '')), ''),
            auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.part_models
    SET name = btrim(p_name),
        maker = NULLIF(btrim(coalesce(p_maker, '')), ''),
        years = NULLIF(btrim(coalesce(p_years, '')), ''),
        note  = NULLIF(btrim(coalesce(p_note, '')), ''),
        updated_at = now()
    WHERE id = p_id AND company_id = p_company_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Modèle introuvable'; END IF;
  END IF;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.part_model_save(uuid, uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.part_model_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.part_models WHERE id = p_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Modèle introuvable'; END IF;
  PERFORM public.parts_assert_can_manage(v_company);
  DELETE FROM public.part_models WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.part_model_delete(uuid) TO authenticated;

/** Liste des modèles avec le nombre de pièces rattachées. */
CREATE OR REPLACE FUNCTION public.part_models_list(p_company_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  maker text,
  years text,
  note text,
  product_count bigint,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id, m.name, m.maker, m.years, m.note,
    (SELECT count(*) FROM public.product_part_models l WHERE l.model_id = m.id) AS product_count,
    m.created_at
  FROM public.part_models m
  WHERE m.company_id = p_company_id
    AND p_company_id IN (SELECT * FROM public.current_user_company_ids())
  ORDER BY lower(coalesce(m.maker, '')), lower(m.name);
$$;
GRANT EXECUTE ON FUNCTION public.part_models_list(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RPC — Compatibilités d'un produit (remplacement complet de la liste)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.product_part_models_set(
  p_product_id uuid,
  p_model_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.products WHERE id = p_product_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Produit introuvable'; END IF;
  PERFORM public.parts_assert_can_manage(v_company);

  DELETE FROM public.product_part_models WHERE product_id = p_product_id;

  IF p_model_ids IS NOT NULL THEN
    INSERT INTO public.product_part_models (company_id, product_id, model_id)
    SELECT v_company, p_product_id, mid
    FROM unnest(p_model_ids) AS mid
    WHERE EXISTS (
      SELECT 1 FROM public.part_models m WHERE m.id = mid AND m.company_id = v_company
    )
    ON CONFLICT (product_id, model_id) DO NOTHING;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.product_part_models_set(uuid, uuid[]) TO authenticated;

/**
 * Recherche « quelles pièces vont sur ce modèle ? ».
 * `p_model_id` prioritaire ; sinon `p_query` cherche dans le nom/marque du modèle.
 * `p_store_id` NULL → stock cumulé sur toutes les boutiques de l'entreprise.
 */
CREATE OR REPLACE FUNCTION public.parts_search_compatible(
  p_company_id uuid,
  p_model_id uuid,
  p_query text,
  p_store_id uuid
)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  sku text,
  barcode text,
  unit text,
  sale_price numeric,
  stock numeric,
  model_id uuid,
  model_name text,
  model_maker text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT NULLIF(btrim(coalesce(p_query, '')), '') AS term
  ),
  matched AS (
    SELECT m.id, m.name, m.maker
    FROM public.part_models m, q
    WHERE m.company_id = p_company_id
      AND (
        (p_model_id IS NOT NULL AND m.id = p_model_id)
        OR (
          p_model_id IS NULL AND q.term IS NOT NULL
          AND (m.name ILIKE '%' || q.term || '%' OR coalesce(m.maker, '') ILIKE '%' || q.term || '%')
        )
      )
  )
  SELECT
    p.id, p.name, p.sku, p.barcode, p.unit, p.sale_price,
    COALESCE((
      SELECT sum(si.quantity)::numeric
      FROM public.store_inventory si
      JOIN public.stores st ON st.id = si.store_id
      WHERE si.product_id = p.id
        AND st.company_id = p_company_id
        AND (p_store_id IS NULL OR si.store_id = p_store_id)
    ), 0) AS stock,
    mm.id, mm.name, mm.maker,
    p.is_active
  FROM public.product_part_models l
  JOIN matched mm ON mm.id = l.model_id
  JOIN public.products p ON p.id = l.product_id AND p.deleted_at IS NULL
  WHERE l.company_id = p_company_id
    AND p_company_id IN (SELECT * FROM public.current_user_company_ids())
  ORDER BY p.name;
$$;
GRANT EXECUTE ON FUNCTION public.parts_search_compatible(uuid, uuid, text, uuid) TO authenticated;

/** Modèles compatibles d'un produit (pour préremplir le dialogue d'édition). */
CREATE OR REPLACE FUNCTION public.product_part_models_list(p_product_id uuid)
RETURNS TABLE (model_id uuid, model_name text, model_maker text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.name, m.maker
  FROM public.product_part_models l
  JOIN public.part_models m ON m.id = l.model_id
  WHERE l.product_id = p_product_id
    AND l.company_id IN (SELECT * FROM public.current_user_company_ids())
  ORDER BY lower(coalesce(m.maker, '')), lower(m.name);
$$;
GRANT EXECUTE ON FUNCTION public.product_part_models_list(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RPC — Équivalences
-- ─────────────────────────────────────────────────────────────────────────────

/** Nature inverse : ce qui est « générique » de A fait de A un « origine » pour lui. */
CREATE OR REPLACE FUNCTION public.parts_inverse_equivalence_kind(p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_kind
    WHEN 'origine' THEN 'generique'
    WHEN 'generique' THEN 'origine'
    WHEN 'adaptable' THEN 'adaptable'
    ELSE 'equivalent'
  END;
$$;

/**
 * Remplace la liste d'équivalences d'un produit.
 * `p_items` : [{"id":"<uuid produit>","kind":"generique","note":"…"}, …]
 * Les liens retirés sont supprimés dans les DEUX sens ; les liens ajoutés sont écrits
 * dans les deux sens (sens inverse qualifié par `parts_inverse_equivalence_kind`).
 */
CREATE OR REPLACE FUNCTION public.product_equivalences_set(
  p_product_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.products WHERE id = p_product_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Produit introuvable'; END IF;
  PERFORM public.parts_assert_can_manage(v_company);

  -- Un seul ordre SQL : les CTE modifiantes portent sur des ensembles DISJOINTS
  -- (on ne supprime que ce qui n'est pas voulu, on n'insère que ce qui l'est).
  WITH wanted AS (
    SELECT
      (e ->> 'id')::uuid AS equivalent_id,
      COALESCE(NULLIF(btrim(coalesce(e ->> 'kind', '')), ''), 'equivalent') AS kind,
      NULLIF(btrim(coalesce(e ->> 'note', '')), '') AS note
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS e
    WHERE (e ->> 'id') IS NOT NULL
  ),
  -- Ne garder que des produits réels de la même entreprise, jamais le produit lui-même.
  valid AS (
    SELECT w.*
    FROM wanted w
    WHERE w.equivalent_id <> p_product_id
      AND w.kind IN ('origine', 'generique', 'adaptable', 'equivalent')
      AND EXISTS (
        SELECT 1 FROM public.products pr
        WHERE pr.id = w.equivalent_id AND pr.company_id = v_company AND pr.deleted_at IS NULL
      )
  ),
  del_direct AS (
    DELETE FROM public.product_equivalences pe
    WHERE pe.product_id = p_product_id
      AND NOT EXISTS (SELECT 1 FROM valid v WHERE v.equivalent_id = pe.equivalent_id)
    RETURNING 1
  ),
  del_inverse AS (
    DELETE FROM public.product_equivalences pe
    WHERE pe.equivalent_id = p_product_id
      AND NOT EXISTS (SELECT 1 FROM valid v WHERE v.equivalent_id = pe.product_id)
    RETURNING 1
  ),
  ins_direct AS (
    INSERT INTO public.product_equivalences (company_id, product_id, equivalent_id, kind, note)
    SELECT v_company, p_product_id, v.equivalent_id, v.kind, v.note
    FROM valid v
    ON CONFLICT (product_id, equivalent_id)
    DO UPDATE SET kind = EXCLUDED.kind, note = EXCLUDED.note
    RETURNING 1
  )
  -- Sens inverse (miroir), pour que la fiche d'en face montre aussi le lien.
  INSERT INTO public.product_equivalences (company_id, product_id, equivalent_id, kind, note)
  SELECT v_company, v.equivalent_id, p_product_id,
         public.parts_inverse_equivalence_kind(v.kind), v.note
  FROM valid v
  ON CONFLICT (product_id, equivalent_id)
  DO UPDATE SET kind = EXCLUDED.kind, note = EXCLUDED.note;
END;
$$;
GRANT EXECUTE ON FUNCTION public.product_equivalences_set(uuid, jsonb) TO authenticated;

/**
 * Remplaçants d'un produit, avec leur stock — c'est LA réponse à « c'est en rupture,
 * qu'est-ce que je propose au client ? ». Les articles en stock remontent en premier.
 */
CREATE OR REPLACE FUNCTION public.product_equivalences_for(
  p_product_id uuid,
  p_store_id uuid
)
RETURNS TABLE (
  equivalent_id uuid,
  product_name text,
  sku text,
  barcode text,
  unit text,
  sale_price numeric,
  stock numeric,
  kind text,
  note text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eq_rows AS (
    SELECT
      p.id AS pid, p.name AS pname, p.sku AS psku, p.barcode AS pbarcode,
      p.unit AS punit, p.sale_price AS pprice,
      COALESCE((
        SELECT sum(si.quantity)::numeric
        FROM public.store_inventory si
        JOIN public.stores st ON st.id = si.store_id
        WHERE si.product_id = p.id
          AND st.company_id = pe.company_id
          AND (p_store_id IS NULL OR si.store_id = p_store_id)
      ), 0) AS pstock,
      pe.kind AS pkind, pe.note AS pnote, p.is_active AS pactive
    FROM public.product_equivalences pe
    JOIN public.products p ON p.id = pe.equivalent_id AND p.deleted_at IS NULL
    WHERE pe.product_id = p_product_id
      AND pe.company_id IN (SELECT * FROM public.current_user_company_ids())
  )
  SELECT r.pid, r.pname, r.psku, r.pbarcode, r.punit, r.pprice,
         r.pstock, r.pkind, r.pnote, r.pactive
  FROM eq_rows r
  -- Ce qui est réellement disponible d'abord : c'est ce que le vendeur propose.
  ORDER BY r.pstock DESC, r.pname;
$$;
GRANT EXECUTE ON FUNCTION public.product_equivalences_for(uuid, uuid) TO authenticated;

/** Produits ayant au moins une équivalence — liste de la page. */
CREATE OR REPLACE FUNCTION public.product_equivalences_overview(
  p_company_id uuid,
  p_store_id uuid
)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  sku text,
  stock numeric,
  equivalent_count bigint,
  in_stock_alternatives bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH stock_by_product AS (
    SELECT si.product_id, sum(si.quantity)::numeric AS qty
    FROM public.store_inventory si
    JOIN public.stores st ON st.id = si.store_id
    WHERE st.company_id = p_company_id
      AND (p_store_id IS NULL OR si.store_id = p_store_id)
    GROUP BY si.product_id
  )
  SELECT
    p.id, p.name, p.sku,
    COALESCE(sp.qty, 0) AS stock,
    count(*) AS equivalent_count,
    count(*) FILTER (WHERE COALESCE(spe.qty, 0) > 0) AS in_stock_alternatives
  FROM public.product_equivalences pe
  JOIN public.products p ON p.id = pe.product_id AND p.deleted_at IS NULL
  JOIN public.products pq ON pq.id = pe.equivalent_id AND pq.deleted_at IS NULL
  LEFT JOIN stock_by_product sp ON sp.product_id = p.id
  LEFT JOIN stock_by_product spe ON spe.product_id = pe.equivalent_id
  WHERE pe.company_id = p_company_id
    AND p_company_id IN (SELECT * FROM public.current_user_company_ids())
  GROUP BY p.id, p.name, p.sku, sp.qty
  ORDER BY COALESCE(sp.qty, 0) ASC, p.name;
$$;
GRANT EXECUTE ON FUNCTION public.product_equivalences_overview(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RPC — Variantes (familles de déclinaisons)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.variant_group_save(
  p_id uuid,
  p_company_id uuid,
  p_name text,
  p_attribute_names text[],
  p_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_attrs text[];
BEGIN
  PERFORM public.parts_assert_can_manage(p_company_id);

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Nom de la famille requis';
  END IF;

  SELECT COALESCE(array_agg(a ORDER BY ord), '{}'::text[])
  INTO v_attrs
  FROM (
    SELECT btrim(x) AS a, ord
    FROM unnest(COALESCE(p_attribute_names, '{}'::text[])) WITH ORDINALITY AS t(x, ord)
    WHERE btrim(coalesce(x, '')) <> ''
  ) s;

  IF array_length(v_attrs, 1) IS NULL THEN
    RAISE EXCEPTION 'Indiquez au moins un axe de déclinaison (ex. Taille).';
  END IF;
  IF array_length(v_attrs, 1) > 3 THEN
    RAISE EXCEPTION 'Trois axes de déclinaison au maximum.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.product_variant_groups (company_id, name, attribute_names, note, created_by)
    VALUES (p_company_id, btrim(p_name), v_attrs, NULLIF(btrim(coalesce(p_note, '')), ''), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.product_variant_groups
    SET name = btrim(p_name),
        attribute_names = v_attrs,
        note = NULLIF(btrim(coalesce(p_note, '')), ''),
        updated_at = now()
    WHERE id = p_id AND company_id = p_company_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Famille introuvable'; END IF;
  END IF;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.variant_group_save(uuid, uuid, text, text[], text) TO authenticated;

/** Supprime la famille. Les produits sont simplement détachés (jamais supprimés). */
CREATE OR REPLACE FUNCTION public.variant_group_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.product_variant_groups WHERE id = p_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Famille introuvable'; END IF;
  PERFORM public.parts_assert_can_manage(v_company);

  UPDATE public.products
  SET variant_group_id = NULL, variant_attributes = NULL
  WHERE variant_group_id = p_id;

  DELETE FROM public.product_variant_groups WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.variant_group_delete(uuid) TO authenticated;

/**
 * Fixe la composition d'une famille.
 * `p_items` : [{"product_id":"…","attributes":{"Couleur":"Rouge","Taille":"XL"}}, …]
 * Les produits absents de la liste sont détachés ; aucun produit n'est supprimé.
 */
CREATE OR REPLACE FUNCTION public.variant_group_set_members(
  p_group_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.product_variant_groups WHERE id = p_group_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Famille introuvable'; END IF;
  PERFORM public.parts_assert_can_manage(v_company);

  -- Un seul ordre SQL : « détacher » et « attacher » portent sur des lignes disjointes.
  WITH wanted AS (
    SELECT
      (e ->> 'product_id')::uuid AS product_id,
      CASE
        WHEN jsonb_typeof(e -> 'attributes') = 'object' THEN e -> 'attributes'
        ELSE '{}'::jsonb
      END AS attributes
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS e
    WHERE (e ->> 'product_id') IS NOT NULL
  ),
  valid AS (
    SELECT w.*
    FROM wanted w
    WHERE EXISTS (
      SELECT 1 FROM public.products pr
      WHERE pr.id = w.product_id AND pr.company_id = v_company AND pr.deleted_at IS NULL
    )
  ),
  -- Détache les anciens membres qui ne sont plus dans la liste (produit jamais supprimé).
  detached AS (
    UPDATE public.products p
    SET variant_group_id = NULL, variant_attributes = NULL
    WHERE p.variant_group_id = p_group_id
      AND NOT EXISTS (SELECT 1 FROM valid v WHERE v.product_id = p.id)
    RETURNING 1
  )
  -- Attache / met à jour les membres voulus.
  UPDATE public.products p
  SET variant_group_id = p_group_id,
      variant_attributes = v.attributes
  FROM valid v
  WHERE p.id = v.product_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.variant_group_set_members(uuid, jsonb) TO authenticated;

/** Familles + leurs déclinaisons (avec stock), pour l'affichage « une seule fiche ». */
CREATE OR REPLACE FUNCTION public.variant_groups_list(
  p_company_id uuid,
  p_store_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  attribute_names text[],
  note text,
  total_stock numeric,
  members jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH stock_by_product AS (
    SELECT si.product_id, sum(si.quantity)::numeric AS qty
    FROM public.store_inventory si
    JOIN public.stores st ON st.id = si.store_id
    WHERE st.company_id = p_company_id
      AND (p_store_id IS NULL OR si.store_id = p_store_id)
    GROUP BY si.product_id
  ),
  member_rows AS (
    SELECT
      p.variant_group_id AS group_id,
      COALESCE(sp.qty, 0) AS qty,
      jsonb_build_object(
        'product_id', p.id,
        'name', p.name,
        'sku', p.sku,
        'barcode', p.barcode,
        'sale_price', p.sale_price,
        'is_active', p.is_active,
        'stock', COALESCE(sp.qty, 0),
        'attributes', COALESCE(p.variant_attributes, '{}'::jsonb)
      ) AS member
    FROM public.products p
    LEFT JOIN stock_by_product sp ON sp.product_id = p.id
    WHERE p.company_id = p_company_id
      AND p.variant_group_id IS NOT NULL
      AND p.deleted_at IS NULL
  )
  SELECT
    g.id, g.name, g.attribute_names, g.note,
    COALESCE((SELECT sum(mr.qty) FROM member_rows mr WHERE mr.group_id = g.id), 0) AS total_stock,
    COALESCE((SELECT jsonb_agg(mr.member) FROM member_rows mr WHERE mr.group_id = g.id), '[]'::jsonb) AS members
  FROM public.product_variant_groups g
  WHERE g.company_id = p_company_id
    AND p_company_id IN (SELECT * FROM public.current_user_company_ids())
  ORDER BY lower(g.name);
$$;
GRANT EXECUTE ON FUNCTION public.variant_groups_list(uuid, uuid) TO authenticated;
