-- FasoStock — « Personnaliser mes dépenses » : les postes de charge du commerçant, pas les nôtres.
--
-- Problème : la page Dépenses impose onze catégories décidées à Ouagadougou une fois pour
-- toutes (Loyer, Salaires, Électricité & eau, Marketing…). Un quincaillier n'a pas de
-- « Marketing & publicité » ; il a « Motos livreurs », « Gardien de nuit », « Douane ».
-- Un boulanger a « Farine », « Bois du four », « Livreurs ». Chacun contourne alors la
-- liste en écrivant tout dans « Autre », et la question qui compte — « où part réellement
-- mon argent ? » — n'a plus de réponse : un seul poste, 90 % du total.
--
-- Deuxième problème, plus petit mais plus quotidien : le formulaire demande huit champs
-- (montant, catégorie, libellé, date, règlement, bénéficiaire, boutique, référence, notes).
-- Sept de trop pour noter 2 000 F de carburant entre deux clients. Un formulaire long n'est
-- pas rempli plus soigneusement : il n'est pas rempli du tout.
--
-- Réponse — un mode, activé par le PROPRIÉTAIRE, qui remplace le contenu de la page :
--
--   1. `expense_categories`          — SES postes de dépense, qu'il crée, renomme, retire.
--                                      Aucune catégorie imposée : la liste part vide.
--   2. `expenses.category_id`        — la dépense pointe vers SON poste.
--   3. `companies.custom_expenses_enabled` — l'interrupteur, dans Paramètres.
--
-- En mode personnalisé, la saisie se réduit à cinq champs : montant, catégorie, date,
-- règlement (espèces ou mobile money — Orange / Moov / Wave), note facultative. Rien
-- d'autre. L'opérateur mobile money va dans `expenses.reference`, exactement comme pour
-- les ventes (`sale_payments.reference`) : même convention, aucune colonne de plus.
--
-- Rien n'est détruit. Le drapeau coupé, la page redevient ce qu'elle était et les dépenses
-- saisies en mode personnalisé restent lisibles (leur poste s'affiche à la place de la
-- catégorie standard). Les dépenses déjà saisies en mode standard, elles, ne bougent pas.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ET LA TRACE : « qui a enregistré cette dépense ? »
-- ─────────────────────────────────────────────────────────────────────────────
-- La colonne `expenses.created_by` existe depuis 00125 mais n'a JAMAIS été renseignée :
-- aucun client ne l'écrit. Tant que seul le propriétaire saisissait, la question ne se
-- posait pas. Elle se pose dès qu'un caissier reçoit le droit d'enregistrer une sortie
-- d'argent. On la renseigne donc côté BASE (trigger), pas côté application : une trace
-- que le client peut oublier d'écrire n'est pas une trace.
--
-- Et on resserre l'écriture, jusqu'ici ouverte à tout membre de l'entreprise (l'app seule
-- filtrait) :
--   • ajouter    → propriétaire ou droit `expenses.manage` ;
--   • modifier / supprimer → propriétaire, ou l'AUTEUR de la ligne s'il a `expenses.manage`.
-- Un caissier note ses dépenses et corrige les siennes ; il ne touche pas à celles des
-- autres. La lecture, elle, reste bornée à l'entreprise comme avant.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Lire un droit depuis SQL
-- ─────────────────────────────────────────────────────────────────────────────
-- `get_my_permission_keys` (00039) sait déjà composer rôle + dérogations individuelles.
-- On l'enveloppe pour pouvoir l'interroger depuis une policy sans dupliquer sa logique.
CREATE OR REPLACE FUNCTION public.user_has_company_permission(
  p_company_id uuid,
  p_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR p_key = ANY (public.get_my_permission_keys(p_company_id));
$$;

COMMENT ON FUNCTION public.user_has_company_permission(uuid, text) IS
  'True si l''utilisateur courant possède le droit p_key dans l''entreprise (rôle + dérogations).';

GRANT EXECUTE ON FUNCTION public.user_has_company_permission(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drapeau d'activation (entreprise, réglé par le propriétaire)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS custom_expenses_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.custom_expenses_enabled IS
  'Mode « Personnaliser mes dépenses » : la page Dépenses n''affiche plus que les postes '
  'créés par l''entreprise et un formulaire réduit. Désactivé par défaut, activé par le '
  'PROPRIÉTAIRE dans Paramètres (RPC company_set_custom_expenses_enabled).';

-- Garde des drapeaux propriétaire posée en 00167, étendue en 00173 puis 00174 : quatrième
-- drapeau, même règle, même trigger — aucune duplication.
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

  IF NEW.product_aliases_enabled IS DISTINCT FROM OLD.product_aliases_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver les autres noms de produits.';
  END IF;

  IF NEW.landed_cost_enabled IS DISTINCT FROM OLD.landed_cost_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver le module Prix de revient.';
  END IF;

  IF NEW.custom_expenses_enabled IS DISTINCT FROM OLD.custom_expenses_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut personnaliser les dépenses.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_enforce_owner_flags_trigger ON public.companies;
CREATE TRIGGER companies_enforce_owner_flags_trigger
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE PROCEDURE public.companies_enforce_owner_flags();

CREATE OR REPLACE FUNCTION public.company_set_custom_expenses_enabled(
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
    RAISE EXCEPTION 'Seul le propriétaire peut personnaliser les dépenses.';
  END IF;
  UPDATE public.companies
  SET custom_expenses_enabled = COALESCE(p_enabled, false)
  WHERE id = p_company_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.company_set_custom_expenses_enabled(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Les postes de dépense de l'entreprise
-- ─────────────────────────────────────────────────────────────────────────────
-- Une table, et non un tableau de textes sur `companies` : un poste est REFERENCÉ par des
-- dépenses. Le renommer (« Gardien » → « Gardiennage ») doit corriger l'historique entier,
-- pas seulement les prochaines lignes. Seule une clé étrangère donne ça.
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  /** Ordre d'affichage choisi par le propriétaire (les plus fréquents en tête). */
  position int NOT NULL DEFAULT 0,
  /**
   * Poste retiré : il disparaît du formulaire mais RESTE lisible sur les dépenses
   * passées. On n'efface pas l'histoire d'un commerce parce qu'un poste n'a plus cours.
   */
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Deux fois « Carburant » dans la même liste, c'est deux totaux là où il en faut un.
CREATE UNIQUE INDEX IF NOT EXISTS ux_expense_categories_company_name
  ON public.expense_categories (company_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_expense_categories_company
  ON public.expense_categories (company_id, position, name);

COMMENT ON TABLE public.expense_categories IS
  'Postes de dépense propres à une entreprise (mode « Personnaliser mes dépenses »). '
  'Créés par le propriétaire ; aucune catégorie imposée.';

DROP TRIGGER IF EXISTS set_updated_at ON public.expense_categories;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

-- Lecture : tout membre de l'entreprise (le caissier doit voir la liste pour choisir).
DROP POLICY IF EXISTS "expense_categories_select" ON public.expense_categories;
CREATE POLICY "expense_categories_select" ON public.expense_categories FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);

-- Écriture : le PROPRIÉTAIRE seul. C'est SA structure de coûts ; un caissier qui peut
-- inventer un poste peut aussi ranger une sortie d'argent là où personne ne la cherchera.
DROP POLICY IF EXISTS "expense_categories_write" ON public.expense_categories;
CREATE POLICY "expense_categories_write" ON public.expense_categories FOR ALL USING (
  public.is_super_admin() OR public.user_is_company_owner(company_id)
) WITH CHECK (
  public.is_super_admin() OR public.user_is_company_owner(company_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. La dépense pointe vers son poste
-- ─────────────────────────────────────────────────────────────────────────────
-- `ON DELETE SET NULL` et non `CASCADE` : supprimer un poste ne doit JAMAIS effacer les
-- sorties d'argent qu'il portait. La dépense retombe alors sur `category` (« autre »).
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS category_id uuid
    REFERENCES public.expense_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_category_id
  ON public.expenses (category_id) WHERE category_id IS NOT NULL;

COMMENT ON COLUMN public.expenses.category_id IS
  'Poste de dépense propre à l''entreprise (mode personnalisé). NULL ⇒ catégorie standard '
  'lue dans `category`. Renseigné ⇒ `category` vaut « autre » et sert de repli comptable.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. La trace : qui a enregistré cette sortie d'argent ?
-- ─────────────────────────────────────────────────────────────────────────────
-- Écrite en base, pas dans l'application : le client peut oublier, le trigger non.
-- Et `created_by` ne se réécrit pas à la modification — l'auteur d'une ligne est celui
-- qui l'a créée, pas le dernier à l'avoir touchée.
CREATE OR REPLACE FUNCTION public.expenses_stamp_author()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expenses_stamp_author_trigger ON public.expenses;
CREATE TRIGGER expenses_stamp_author_trigger
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE PROCEDURE public.expenses_stamp_author();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Qui peut écrire une dépense
-- ─────────────────────────────────────────────────────────────────────────────
-- Jusqu'ici : « tout membre de l'entreprise », l'application filtrant seule (00125). Cela
-- suffisait tant que seul le propriétaire voyait la page. Maintenant qu'on accorde le droit
-- à un caissier, la règle descend en base.
DROP POLICY IF EXISTS "expenses_all" ON public.expenses;

DROP POLICY IF EXISTS "expenses_select" ON public.expenses;
CREATE POLICY "expenses_select" ON public.expenses FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);

DROP POLICY IF EXISTS "expenses_insert" ON public.expenses;
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM current_user_company_ids())
  AND (
    public.is_super_admin()
    OR public.user_is_company_owner(company_id)
    OR public.user_has_company_permission(company_id, 'expenses.manage')
  )
);

-- Modifier / supprimer : le propriétaire partout ; l'employé seulement SES lignes.
-- `created_by IS NULL` = ligne écrite avant cette migration (l'auteur n'a jamais été
-- enregistré, il est impossible de le reconstituer) : on ne la verrouille pas au-delà
-- de ce qu'elle était, sinon on casserait un usage en place.
DROP POLICY IF EXISTS "expenses_update" ON public.expenses;
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE USING (
  company_id IN (SELECT * FROM current_user_company_ids())
  AND (
    public.is_super_admin()
    OR public.user_is_company_owner(company_id)
    OR (
      public.user_has_company_permission(company_id, 'expenses.manage')
      AND (created_by IS NULL OR created_by = auth.uid())
    )
  )
) WITH CHECK (
  company_id IN (SELECT * FROM current_user_company_ids())
);

DROP POLICY IF EXISTS "expenses_delete" ON public.expenses;
CREATE POLICY "expenses_delete" ON public.expenses FOR DELETE USING (
  company_id IN (SELECT * FROM current_user_company_ids())
  AND (
    public.is_super_admin()
    OR public.user_is_company_owner(company_id)
    OR (
      public.user_has_company_permission(company_id, 'expenses.manage')
      AND (created_by IS NULL OR created_by = auth.uid())
    )
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Comptabilité : ce que devient un poste personnalisé
-- ─────────────────────────────────────────────────────────────────────────────
-- `accounting_sync_expense` (00136) choisit le compte de charge d'après `category`. Un
-- poste inventé par le commerçant (« Gardien de nuit ») n'a pas d'équivalent SYSCOHADA
-- connu d'avance : les dépenses personnalisées portent `category = 'autre'` et tombent
-- donc sur 605 « Autres achats ». C'est le repli honnête — mieux vaut un compte générique
-- exact qu'une imputation devinée. Le comptable reventile depuis le module Comptabilité.
