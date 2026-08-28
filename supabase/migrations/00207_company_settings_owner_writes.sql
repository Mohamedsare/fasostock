-- 00207 — `company_settings` : écrire redevient un droit de propriétaire.
--
-- ============================================================================
-- LE TROU
-- ============================================================================
--
-- Depuis 00002, les deux policies d'écriture de `company_settings` ne demandaient
-- qu'une seule chose : appartenir à l'entreprise.
--
--   CREATE POLICY "company_settings_insert" ON public.company_settings
--   FOR INSERT WITH CHECK (
--     company_id IN (SELECT * FROM current_user_company_ids())
--   );
--
-- Or l'écran Paramètres, lui, réserve chacun de ces réglages au propriétaire —
-- `{isOwner && companyId ? <FsCard …> : null}`. La garde vivait donc **uniquement dans
-- le navigateur**. Un caissier, avec le jeton que l'application lui remet à sa propre
-- connexion, pouvait écrire n'importe quel réglage de la maison en un appel REST, sans
-- jamais avoir accès à l'écran qui les affiche — ni laisser de trace ailleurs que dans
-- `updated_at`.
--
-- Ce ne sont pas des préférences d'affichage. Parmi les clés concernées :
--
--   sale_customer_policy ............... refus de vendre à un client déjà endetté
--   customer_debt_exemptions ........... dérogations nominatives à ce refus
--   quick_pos_price_edit_enabled ....... prix modifiable à la main au comptoir
--   quick_pos_credit_enabled ........... vente à crédit depuis la caisse rapide
--   quick_pos_payments ................. moyens de paiement acceptés en caisse
--   sales_seller_board_staff_enabled ... chiffres de vente visibles des employés
--   employee_hidden_pages .............. pages retirées du menu d'un employé
--   sale_pickup_tracking_enabled ....... suivi « payé mais pas emporté »
--   packaging_price_per_piece_enabled .. sens du champ prix des conditionnements
--
-- Autrement dit : un caissier pouvait s'autoriser lui-même à changer les prix au
-- comptoir, lever le blocage des clients endettés, se réafficher les pages qu'on lui
-- avait retirées, ou inverser le sens du champ prix des lots. Ce sont précisément les
-- garde-fous anti-fraude du commerçant.
--
-- ============================================================================
-- CE QUE FAIT CETTE MIGRATION
-- ============================================================================
--
-- La **lecture** ne bouge pas. Tout membre de l'entreprise doit continuer à lire les
-- réglages : sans cela, le caissier ne saurait pas comment se comporte sa propre
-- caisse. C'est d'ailleurs ce qui fait qu'un réglage du patron se propage à toute
-- l'équipe.
--
-- Seule l'**écriture** est ramenée au propriétaire — ce que l'interface prétendait
-- déjà faire depuis le début.
--
-- La suppression, elle, reste interdite à tout le monde : `company_settings` n'a
-- jamais eu de policy DELETE, et aucun code applicatif n'en supprime (un réglage se
-- remet à `false`, il ne s'efface pas). On ne lui en ajoute pas.

-- ---------------------------------------------------------------------------
-- Qui a le droit d'écrire quelle clé
-- ---------------------------------------------------------------------------
-- Une fonction plutôt que l'expression recopiée dans les deux policies : la règle
-- s'énonce à un seul endroit, et la liste des exceptions se relit d'un coup d'œil.
--
-- `user_is_company_owner` (00062) exige un rôle `owner` **actif** sur l'entreprise ;
-- `is_super_admin` (00002) couvre l'assistance FasoStock, y compris le mode dépannage.

CREATE OR REPLACE FUNCTION public.can_write_company_setting(
  p_company_id uuid,
  p_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.user_is_company_owner(p_company_id)
    -- ------------------------------------------------------------------
    -- Exception assumée : le seuil d'alerte de stock.
    -- ------------------------------------------------------------------
    -- Contrairement aux autres clés, celle-ci ne se règle pas dans Paramètres mais
    -- sur la page Inventaire, derrière la permission `inventory.manage`
    -- (`components/inventory/inventory-screen.tsx`). Un gérant à qui le patron a
    -- confié le stock doit pouvoir ajuster « à partir de combien je préviens » sans
    -- réveiller le patron. Et le pire cas est une alerte de trop ou de moins — aucun
    -- montant, aucun prix, aucune règle de vente n'en dépend.
    OR (
      p_key = 'default_stock_alert_threshold'
      AND public.has_permission(p_company_id, 'inventory.manage')
    );
$$;

COMMENT ON FUNCTION public.can_write_company_setting(uuid, text) IS
  'True si l''utilisateur courant peut écrire ce réglage d''entreprise. Propriétaire actif '
  'ou super admin pour tout ; `default_stock_alert_threshold` est délégué à la permission '
  'inventory.manage.';

GRANT EXECUTE ON FUNCTION public.can_write_company_setting(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Les policies
-- ---------------------------------------------------------------------------
-- `DROP` avant `CREATE` : PostgreSQL n'a pas de `CREATE OR REPLACE POLICY`, et sans
-- le `IF EXISTS` la migration casserait sur une base déjà passée par ici.

DROP POLICY IF EXISTS "company_settings_insert" ON public.company_settings;
DROP POLICY IF EXISTS "company_settings_update" ON public.company_settings;

CREATE POLICY "company_settings_insert" ON public.company_settings
  FOR INSERT
  WITH CHECK (public.can_write_company_setting(company_id, key));

-- `USING` filtre les lignes modifiables, `WITH CHECK` valide la ligne d'arrivée. Les
-- deux sont nécessaires et doivent être écrites : sans `WITH CHECK`, PostgreSQL réutilise
-- `USING`, ce qui marche ici mais laisse la règle implicite — donc fragile à la
-- prochaine relecture.
CREATE POLICY "company_settings_update" ON public.company_settings
  FOR UPDATE
  USING (public.can_write_company_setting(company_id, key))
  WITH CHECK (public.can_write_company_setting(company_id, key));

-- ---------------------------------------------------------------------------
-- Ce qui reste à surveiller
-- ---------------------------------------------------------------------------
-- L'application Flutter écrit-elle dans `company_settings` depuis un compte non
-- propriétaire ? Si oui, l'appel remontera désormais un 42501 (`new row violates
-- row-level security policy`). Ce dépôt étant le web, la vérification est à faire de
-- l'autre côté avant de déployer.
