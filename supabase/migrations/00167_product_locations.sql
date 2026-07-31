-- FasoStock — Module « Emplacements » : où se trouve physiquement un produit dans la boutique.
--
-- Problème : « le client demande la peinture blanche 5 L — elle est où ? ». Le vendeur
-- cherche, le patron seul sait, et un nouvel employé perd dix minutes par article.
--
-- Difficulté : DEUX boutiques ne se rangent JAMAIS pareil. Un supermarché pense
-- « Rayon → Allée → Étagère → Niveau », une quincaillerie « Travée → Rack → Bac »,
-- une pharmacie « Zone → Meuble → Tiroir ». Imposer un modèle unique = module inutilisé.
--
-- D'où le découpage en trois tables :
--
--   1. `store_location_schemes`  — le MODÈLE d'organisation de LA boutique : la liste
--      ordonnée de ses niveaux (`levels`), choisie sur un gabarit métier ou construite
--      de zéro. Tant qu'il est en `draft`, on peut tout changer ; une fois `active`,
--      il sert de règle de saisie (profondeur maximale, libellé de chaque niveau).
--
--   2. `store_locations`        — les EMPLACEMENTS réels, en arbre (Rayon Boissons ›
--      Allée 2 › Étagère B). `depth` correspond à l'index du niveau dans le modèle.
--      `path_label` est le chemin lisible, recalculé à chaque modification : la lecture
--      (liste produits, POS, recherche) n'a alors jamais besoin de remonter l'arbre.
--
--   3. `product_locations`      — le RANGEMENT : un produit ↔ un emplacement, PAR
--      BOUTIQUE (le même article n'est pas au même endroit dans deux magasins), avec
--      une précision libre (« 3ᵉ casier en partant du haut »).
--
-- Activation : DÉSACTIVÉ PAR DÉFAUT, ouvert par le PROPRIÉTAIRE lui-même dans
-- Paramètres (`companies.product_locations_enabled`) — pas besoin du super admin.
-- Tant que le drapeau est faux, la page est masquée ET les RPC d'écriture refusent :
-- aucune table existante n'est modifiée, aucun écran existant ne change de comportement.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drapeau d'activation (entreprise, réglé par le propriétaire)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS product_locations_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.product_locations_enabled IS
  'Module « Emplacements » (rangement physique des produits en boutique). Désactivé par '
  'défaut, activé par le PROPRIÉTAIRE dans Paramètres (RPC company_set_product_locations_enabled).';

-- Le drapeau n'est pas une option plateforme : il reste au propriétaire. Mais la
-- policy `companies_update` autorise TOUT membre de l'entreprise à écrire sur la
-- ligne — on referme donc la porte par un garde dédié, sans toucher au trigger
-- `companies_enforce_platform_flags` (drapeaux super admin) qui vit sa propre vie.
CREATE OR REPLACE FUNCTION public.companies_enforce_owner_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.product_locations_enabled IS DISTINCT FROM OLD.product_locations_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver le module Emplacements.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_enforce_owner_flags_trigger ON public.companies;
CREATE TRIGGER companies_enforce_owner_flags_trigger
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE PROCEDURE public.companies_enforce_owner_flags();

-- RPC d'écriture du drapeau (chemin normal de l'écran Paramètres).
CREATE OR REPLACE FUNCTION public.company_set_product_locations_enabled(
  p_company_id uuid,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT (public.is_super_admin() OR public.user_is_company_owner(p_company_id)) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver le module Emplacements.';
  END IF;
  UPDATE public.companies
  SET product_locations_enabled = COALESCE(p_enabled, false)
  WHERE id = p_company_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.company_set_product_locations_enabled(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Permission dédiée (owner par défaut, accordable à un employé)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (id, key)
VALUES (uuid_generate_v4(), 'product_locations.manage')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tables
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_location_schemes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Plan de rangement',
  /** Gabarit d'origine (`supermarche`, `quincaillerie`, `custom`…) — indicatif. */
  template_slug text,
  /** Niveaux ordonnés : [{"name":"Rayon"},{"name":"Allée"},…]. 1 à 5 entrées. */
  levels jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active')),
  activated_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.store_location_schemes IS
  'Modèle d''organisation physique d''UNE boutique : ses niveaux ordonnés (Rayon → Allée → '
  'Étagère…). En `draft` il se modifie librement ; en `active` il sert de règle de saisie.';
CREATE INDEX IF NOT EXISTS idx_store_location_schemes_company
  ON public.store_location_schemes(company_id);

CREATE TABLE IF NOT EXISTS public.store_locations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  scheme_id uuid NOT NULL REFERENCES public.store_location_schemes(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.store_locations(id) ON DELETE CASCADE,
  /** Index du niveau dans `levels` (0 = premier niveau). */
  depth int NOT NULL DEFAULT 0 CHECK (depth >= 0 AND depth <= 4),
  name text NOT NULL,
  /** Code court affiché en pastille (ex. « A2 »), facultatif. */
  code text,
  sort_order int NOT NULL DEFAULT 0,
  /** Chemin lisible complet (« Boissons › Allée 2 › Étagère B ») — recalculé à chaque écriture. */
  path_label text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.store_locations IS
  'Emplacements physiques d''une boutique, en arbre. `path_label` évite de remonter '
  'l''arbre à la lecture (liste produits, recherche « c''est où ? »).';
CREATE INDEX IF NOT EXISTS idx_store_locations_store ON public.store_locations(store_id);
CREATE INDEX IF NOT EXISTS idx_store_locations_parent ON public.store_locations(parent_id);
CREATE INDEX IF NOT EXISTS idx_store_locations_scheme ON public.store_locations(scheme_id);
-- Deux « Étagère B » sous la même allée = confusion garantie : on l'interdit.
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_locations_sibling_name
  ON public.store_locations(
    store_id,
    (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (lower(btrim(name)))
  );

CREATE TABLE IF NOT EXISTS public.product_locations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.store_locations(id) ON DELETE CASCADE,
  /** Précision libre : « 3ᵉ casier en partant du haut », « derrière le comptoir ». */
  detail text,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, product_id)
);
COMMENT ON TABLE public.product_locations IS
  'Rangement d''un produit dans UNE boutique (un emplacement par produit et par boutique).';
CREATE INDEX IF NOT EXISTS idx_product_locations_location ON public.product_locations(location_id);
CREATE INDEX IF NOT EXISTS idx_product_locations_product ON public.product_locations(product_id);
CREATE INDEX IF NOT EXISTS idx_product_locations_store ON public.product_locations(store_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.store_location_schemes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.store_location_schemes
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.store_locations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.store_locations
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — lecture par les membres de l'entreprise, écriture par RPC uniquement
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.store_location_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_location_schemes_select" ON public.store_location_schemes;
CREATE POLICY "store_location_schemes_select" ON public.store_location_schemes FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);
DROP POLICY IF EXISTS "store_locations_select" ON public.store_locations;
CREATE POLICY "store_locations_select" ON public.store_locations FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);
DROP POLICY IF EXISTS "product_locations_select" ON public.product_locations;
CREATE POLICY "product_locations_select" ON public.product_locations FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Gardes communes
-- ─────────────────────────────────────────────────────────────────────────────

/** Le module est-il ouvert pour cette entreprise ? */
CREATE OR REPLACE FUNCTION public.product_locations_module_enabled(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT c.product_locations_enabled FROM public.companies c WHERE c.id = p_company_id),
    false
  );
$$;
GRANT EXECUTE ON FUNCTION public.product_locations_module_enabled(uuid) TO authenticated;

/** Droit d'écrire sur le plan et le rangement : propriétaire ou permission dédiée. */
CREATE OR REPLACE FUNCTION public.can_manage_product_locations(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_is_company_owner(p_company_id)
     OR ('product_locations.manage' = ANY(public.get_my_permission_keys(p_company_id)));
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_product_locations(uuid) TO authenticated;

/**
 * Boutique → entreprise, après avoir vérifié : appartenance, module ouvert, droit.
 * Toutes les RPC d'écriture commencent par là ; en cas de refus l'exception est
 * en français, prête à être affichée telle quelle.
 */
CREATE OR REPLACE FUNCTION public.product_locations_guard_store(p_store_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  SELECT s.company_id INTO v_company FROM public.stores s WHERE s.id = p_store_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Boutique introuvable'; END IF;
  IF NOT (v_company IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Boutique non autorisée';
  END IF;
  IF NOT public.product_locations_module_enabled(v_company) THEN
    RAISE EXCEPTION 'Le module Emplacements n''est pas activé pour cette entreprise.';
  END IF;
  IF NOT public.can_manage_product_locations(v_company) THEN
    RAISE EXCEPTION 'Droit insuffisant pour gérer les emplacements.';
  END IF;
  RETURN v_company;
END;
$$;
GRANT EXECUTE ON FUNCTION public.product_locations_guard_store(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Modèle d'organisation (levels)
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Crée ou met à jour le modèle de la boutique — y compris quand le plan est déjà
 * en service : renommer « Étagère » en « Rayonnage » ou ajouter un niveau plus fin
 * ne casse rien. La seule opération refusée est le RACCOURCISSEMENT du modèle sous
 * des emplacements existants, qui les rendrait orphelins.
 */
CREATE OR REPLACE FUNCTION public.store_location_scheme_save(
  p_store_id uuid,
  p_name text,
  p_template_slug text,
  p_levels jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.product_locations_guard_store(p_store_id);
  v_id uuid;
  v_count int;
  v_max_depth int;
BEGIN
  IF p_levels IS NULL OR jsonb_typeof(p_levels) <> 'array' THEN
    RAISE EXCEPTION 'Modèle invalide : liste de niveaux attendue.';
  END IF;
  v_count := jsonb_array_length(p_levels);
  IF v_count < 1 OR v_count > 5 THEN
    RAISE EXCEPTION 'Un modèle compte entre 1 et 5 niveaux (reçu : %).', v_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_levels) AS lvl
    WHERE COALESCE(btrim(lvl->>'name'), '') = ''
  ) THEN
    RAISE EXCEPTION 'Chaque niveau doit avoir un nom.';
  END IF;

  SELECT id INTO v_id
  FROM public.store_location_schemes WHERE store_id = p_store_id;

  IF v_id IS NULL THEN
    INSERT INTO public.store_location_schemes
      (company_id, store_id, name, template_slug, levels, status, created_by)
    VALUES
      (v_company, p_store_id, COALESCE(NULLIF(btrim(p_name), ''), 'Plan de rangement'),
       NULLIF(btrim(p_template_slug), ''), p_levels, 'draft', auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  -- On refuse de raccourcir le modèle sous des emplacements existants.
  SELECT COALESCE(max(depth), -1) INTO v_max_depth
  FROM public.store_locations WHERE store_id = p_store_id;
  IF v_max_depth >= v_count THEN
    RAISE EXCEPTION
      'Des emplacements utilisent déjà % niveaux. Supprimez-les avant de réduire le modèle.',
      v_max_depth + 1;
  END IF;

  UPDATE public.store_location_schemes
  SET name = COALESCE(NULLIF(btrim(p_name), ''), name),
      template_slug = COALESCE(NULLIF(btrim(p_template_slug), ''), template_slug),
      levels = p_levels
  WHERE id = v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.store_location_scheme_save(uuid, text, text, jsonb) TO authenticated;

/**
 * Bascule le plan en service (`active`) ou le rouvre à l'édition (`draft`).
 * L'activation exige au moins un emplacement : un plan vide ne rend service à personne.
 * La réouverture ne supprime RIEN — les emplacements et les rangements restent.
 */
CREATE OR REPLACE FUNCTION public.store_location_scheme_set_status(
  p_store_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.product_locations_guard_store(p_store_id);
  v_id uuid;
BEGIN
  IF p_status NOT IN ('draft', 'active') THEN
    RAISE EXCEPTION 'Statut de plan inconnu : %', p_status;
  END IF;
  SELECT id INTO v_id FROM public.store_location_schemes WHERE store_id = p_store_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Aucun plan de rangement pour cette boutique.'; END IF;

  IF p_status = 'active' THEN
    IF NOT EXISTS (SELECT 1 FROM public.store_locations WHERE store_id = p_store_id) THEN
      RAISE EXCEPTION 'Créez au moins un emplacement avant d''activer le plan.';
    END IF;
    UPDATE public.store_location_schemes
    SET status = 'active', activated_at = COALESCE(activated_at, now())
    WHERE id = v_id;
  ELSE
    UPDATE public.store_location_schemes SET status = 'draft' WHERE id = v_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.store_location_scheme_set_status(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Emplacements (arbre)
-- ─────────────────────────────────────────────────────────────────────────────

/** Recalcule `path_label` de toute la boutique (arbre au plus 5 niveaux : trivial). */
CREATE OR REPLACE FUNCTION public.store_locations_refresh_paths(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH RECURSIVE tree AS (
    SELECT l.id, btrim(l.name) AS path
    FROM public.store_locations l
    WHERE l.store_id = p_store_id AND l.parent_id IS NULL
    UNION ALL
    SELECT c.id, t.path || ' › ' || btrim(c.name)
    FROM public.store_locations c
    JOIN tree t ON c.parent_id = t.id
    WHERE c.store_id = p_store_id
  )
  UPDATE public.store_locations l
  SET path_label = t.path
  FROM tree t
  WHERE l.id = t.id AND l.path_label IS DISTINCT FROM t.path;
END;
$$;

REVOKE ALL ON FUNCTION public.store_locations_refresh_paths(uuid) FROM PUBLIC;

/** Crée (p_id NULL) ou renomme un emplacement. Le parent fixe la profondeur. */
CREATE OR REPLACE FUNCTION public.store_location_save(
  p_id uuid,
  p_store_id uuid,
  p_parent_id uuid,
  p_name text,
  p_code text,
  p_sort_order int
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.product_locations_guard_store(p_store_id);
  v_scheme_id uuid;
  v_levels int;
  v_depth int := 0;
  v_id uuid;
BEGIN
  IF COALESCE(btrim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Nom de l''emplacement requis.';
  END IF;

  SELECT id, jsonb_array_length(levels) INTO v_scheme_id, v_levels
  FROM public.store_location_schemes WHERE store_id = p_store_id;
  IF v_scheme_id IS NULL THEN
    RAISE EXCEPTION 'Choisissez d''abord un modèle d''organisation pour cette boutique.';
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT depth + 1 INTO v_depth
    FROM public.store_locations
    WHERE id = p_parent_id AND store_id = p_store_id;
    IF v_depth IS NULL THEN RAISE EXCEPTION 'Emplacement parent introuvable.'; END IF;
  END IF;

  IF v_depth >= v_levels THEN
    RAISE EXCEPTION 'Le modèle ne prévoit que % niveau(x) : ajoutez-en un pour descendre plus bas.', v_levels;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.store_locations
      (company_id, store_id, scheme_id, parent_id, depth, name, code, sort_order)
    VALUES
      (v_company, p_store_id, v_scheme_id, p_parent_id, v_depth, btrim(p_name),
       NULLIF(btrim(p_code), ''), COALESCE(p_sort_order, 0))
    RETURNING id INTO v_id;
  ELSE
    -- Le déplacement d'une branche n'est volontairement pas exposé : on renomme sur place.
    UPDATE public.store_locations
    SET name = btrim(p_name),
        code = NULLIF(btrim(p_code), ''),
        sort_order = COALESCE(p_sort_order, sort_order)
    WHERE id = p_id AND store_id = p_store_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Emplacement introuvable.'; END IF;
  END IF;

  PERFORM public.store_locations_refresh_paths(p_store_id);
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.store_location_save(uuid, uuid, uuid, text, text, int) TO authenticated;

/**
 * Supprime un emplacement. Refus net s'il contient quelque chose, sauf `p_force` :
 * dans ce cas la branche entière part et les produits concernés redeviennent
 * « sans emplacement » (jamais de produit supprimé, jamais de stock touché).
 */
CREATE OR REPLACE FUNCTION public.store_location_delete(p_id uuid, p_force boolean DEFAULT false)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
  v_children int;
  v_products int;
  v_ids uuid[];
BEGIN
  SELECT store_id INTO v_store FROM public.store_locations WHERE id = p_id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'Emplacement introuvable.'; END IF;
  PERFORM public.product_locations_guard_store(v_store);

  WITH RECURSIVE branch AS (
    SELECT id FROM public.store_locations WHERE id = p_id
    UNION ALL
    SELECT c.id FROM public.store_locations c JOIN branch b ON c.parent_id = b.id
  )
  SELECT array_agg(id) INTO v_ids FROM branch;

  SELECT count(*) INTO v_children FROM public.store_locations WHERE parent_id = p_id;
  SELECT count(*) INTO v_products FROM public.product_locations WHERE location_id = ANY(v_ids);

  IF NOT COALESCE(p_force, false) AND (v_children > 0 OR v_products > 0) THEN
    RAISE EXCEPTION 'Cet emplacement contient % sous-emplacement(s) et % produit(s).',
      v_children, v_products;
  END IF;

  DELETE FROM public.store_locations WHERE id = p_id; -- cascade sur la branche
  PERFORM public.store_locations_refresh_paths(v_store);
  RETURN v_products;
END;
$$;
GRANT EXECUTE ON FUNCTION public.store_location_delete(uuid, boolean) TO authenticated;

/** Arbre complet d'une boutique + nombre de produits rangés (direct et cumulé). */
CREATE OR REPLACE FUNCTION public.store_locations_tree(p_store_id uuid)
RETURNS TABLE (
  id uuid,
  parent_id uuid,
  depth int,
  name text,
  code text,
  sort_order int,
  path_label text,
  direct_product_count bigint,
  total_product_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE allowed AS (
    SELECT s.id FROM public.stores s
    WHERE s.id = p_store_id
      AND s.company_id IN (SELECT * FROM public.current_user_company_ids())
  ),
  loc AS (
    SELECT l.* FROM public.store_locations l
    WHERE l.store_id IN (SELECT id FROM allowed)
  ),
  descendants AS (
    -- Pour chaque emplacement, la liste de ses descendants (lui inclus).
    SELECT a.id AS root_id, a.id AS node_id FROM loc a
    UNION ALL
    SELECT d.root_id, c.id
    FROM descendants d
    JOIN loc c ON c.parent_id = d.node_id
  )
  SELECT
    l.id,
    l.parent_id,
    l.depth,
    l.name,
    l.code,
    l.sort_order,
    l.path_label,
    (SELECT count(*) FROM public.product_locations pl WHERE pl.location_id = l.id) AS direct_product_count,
    (
      SELECT count(*)
      FROM public.product_locations pl
      WHERE pl.location_id IN (SELECT d.node_id FROM descendants d WHERE d.root_id = l.id)
    ) AS total_product_count
  FROM loc l
  ORDER BY l.depth, l.sort_order, l.name;
$$;
GRANT EXECUTE ON FUNCTION public.store_locations_tree(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Rangement des produits
-- ─────────────────────────────────────────────────────────────────────────────

/** Range un produit (`p_location_id` NULL = le retirer de son emplacement). */
CREATE OR REPLACE FUNCTION public.product_location_set(
  p_store_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_detail text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.product_locations_guard_store(p_store_id);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = p_product_id AND p.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'Produit introuvable dans cette entreprise.';
  END IF;

  IF p_location_id IS NULL THEN
    DELETE FROM public.product_locations
    WHERE store_id = p_store_id AND product_id = p_product_id;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.store_locations l
    WHERE l.id = p_location_id AND l.store_id = p_store_id
  ) THEN
    RAISE EXCEPTION 'Emplacement introuvable dans cette boutique.';
  END IF;

  INSERT INTO public.product_locations
    (company_id, store_id, product_id, location_id, detail, updated_by, updated_at)
  VALUES
    (v_company, p_store_id, p_product_id, p_location_id, NULLIF(btrim(p_detail), ''), auth.uid(), now())
  ON CONFLICT (store_id, product_id) DO UPDATE
  SET location_id = EXCLUDED.location_id,
      detail = EXCLUDED.detail,
      updated_by = EXCLUDED.updated_by,
      updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.product_location_set(uuid, uuid, uuid, text) TO authenticated;

/** Range plusieurs produits d'un coup (`p_location_id` NULL = tout retirer). Renvoie le nombre traité. */
CREATE OR REPLACE FUNCTION public.product_locations_bulk_set(
  p_store_id uuid,
  p_product_ids uuid[],
  p_location_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.product_locations_guard_store(p_store_id);
  v_count int := 0;
BEGIN
  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF p_location_id IS NULL THEN
    DELETE FROM public.product_locations
    WHERE store_id = p_store_id AND product_id = ANY(p_product_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.store_locations l
    WHERE l.id = p_location_id AND l.store_id = p_store_id
  ) THEN
    RAISE EXCEPTION 'Emplacement introuvable dans cette boutique.';
  END IF;

  INSERT INTO public.product_locations
    (company_id, store_id, product_id, location_id, updated_by, updated_at)
  SELECT v_company, p_store_id, p.id, p_location_id, auth.uid(), now()
  FROM public.products p
  WHERE p.id = ANY(p_product_ids) AND p.company_id = v_company
  ON CONFLICT (store_id, product_id) DO UPDATE
  SET location_id = EXCLUDED.location_id,
      updated_by = EXCLUDED.updated_by,
      updated_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.product_locations_bulk_set(uuid, uuid[], uuid) TO authenticated;

/**
 * Rangements d'une boutique : `product_id → emplacement`. Lecture seule, sans droit
 * de gestion (un vendeur doit pouvoir voir où est l'article), mais toujours borné à
 * l'entreprise de l'utilisateur.
 */
CREATE OR REPLACE FUNCTION public.product_locations_for_store(p_store_id uuid)
RETURNS TABLE (
  product_id uuid,
  location_id uuid,
  path_label text,
  code text,
  detail text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pl.product_id, pl.location_id, l.path_label, l.code, pl.detail
  FROM public.product_locations pl
  JOIN public.store_locations l ON l.id = pl.location_id
  JOIN public.stores s ON s.id = pl.store_id
  WHERE pl.store_id = p_store_id
    AND s.company_id IN (SELECT * FROM public.current_user_company_ids());
$$;
GRANT EXECUTE ON FUNCTION public.product_locations_for_store(uuid) TO authenticated;

/**
 * « C'est où ? » — recherche par nom, SKU ou code-barres dans une boutique.
 * Renvoie aussi les produits SANS emplacement (`location_id` NULL) : la réponse
 * honnête « ce produit n'est pas encore rangé » vaut mieux qu'une liste vide.
 */
CREATE OR REPLACE FUNCTION public.product_locations_find(
  p_store_id uuid,
  p_query text,
  p_limit int DEFAULT 30
)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  sku text,
  barcode text,
  location_id uuid,
  path_label text,
  code text,
  detail text,
  quantity numeric,
  image_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    p.sku,
    p.barcode,
    pl.location_id,
    l.path_label,
    l.code,
    pl.detail,
    COALESCE(i.quantity, 0)::numeric,
    img.url
  FROM public.products p
  JOIN public.stores s ON s.id = p_store_id AND s.company_id = p.company_id
  LEFT JOIN public.product_locations pl ON pl.product_id = p.id AND pl.store_id = p_store_id
  LEFT JOIN public.store_locations l ON l.id = pl.location_id
  LEFT JOIN public.store_inventory i ON i.product_id = p.id AND i.store_id = p_store_id
  LEFT JOIN LATERAL (
    SELECT pi.url FROM public.product_images pi
    WHERE pi.product_id = p.id
    ORDER BY pi.position ASC
    LIMIT 1
  ) img ON true
  WHERE s.company_id IN (SELECT * FROM public.current_user_company_ids())
    AND p.deleted_at IS NULL
    AND COALESCE(btrim(p_query), '') <> ''
    AND (
      p.name ILIKE '%' || btrim(p_query) || '%'
      OR COALESCE(p.sku, '') ILIKE '%' || btrim(p_query) || '%'
      OR COALESCE(p.barcode, '') ILIKE '%' || btrim(p_query) || '%'
      OR COALESCE(l.path_label, '') ILIKE '%' || btrim(p_query) || '%'
    )
  ORDER BY (pl.location_id IS NULL), p.name
  LIMIT LEAST(COALESCE(p_limit, 30), 100);
$$;
GRANT EXECUTE ON FUNCTION public.product_locations_find(uuid, text, int) TO authenticated;
