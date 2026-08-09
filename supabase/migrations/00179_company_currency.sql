-- 00179 — Devise de l'entreprise, choisie par le propriétaire (Paramètres › Devise).
--
-- Stockée dans `company_settings` (clé `currency_code`), comme les autres réglages
-- d'entreprise. La valeur par défaut reste XOF : aucune entreprise existante ne change
-- de comportement tant qu'elle n'a rien choisi.
--
-- POURQUOI UNE FONCTION PLUTÔT QU'UN SIMPLE UPDATE
--
-- Changer de devise ne convertit rien : une boutique avec 500 000 XOF d'historique qui
-- bascule en GNF verra « 500 000 GNF ». Mêmes chiffres, sens différent — ses livres
-- deviennent faux, sans le moindre message d'erreur.
--
-- La règle retenue est donc : libre tant qu'aucune vente n'existe, verrouillé ensuite,
-- et seul le super admin peut alors trancher. Cette règle doit vivre **dans la base** :
-- l'imposer côté écran ne protégerait rien, il suffirait d'appeler l'API directement.

-- ---------------------------------------------------------------------------
-- Liste blanche — alignée sur `lib/config/currencies.ts`
-- ---------------------------------------------------------------------------
-- Uniquement des devises SANS décimales : tout le calcul monétaire de l'application
-- arrondit à l'unité. Accepter une devise à centimes ici produirait des totaux faux
-- sur les factures, en silence. Ne pas étendre cette liste sans traiter les arrondis.

CREATE OR REPLACE FUNCTION public.is_supported_currency(p_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(trim(coalesce(p_code, ''))) IN (
    'XOF', 'XAF', 'GNF', 'CDF', 'RWF', 'BIF', 'KMF', 'DJF'
  );
$$;

COMMENT ON FUNCTION public.is_supported_currency(text) IS
  'Devises acceptées (toutes sans décimales). Miroir de lib/config/currencies.ts.';

-- ---------------------------------------------------------------------------
-- La devise est-elle encore modifiable par le propriétaire ?
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.company_currency_locked(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Verrouillée dès la première vente : au-delà, changer la devise réinterpréterait
  -- tout l'historique. `EXISTS` s'arrête à la première ligne trouvée.
  SELECT EXISTS (
    SELECT 1 FROM public.sales s WHERE s.company_id = p_company_id
  );
$$;

COMMENT ON FUNCTION public.company_currency_locked(uuid) IS
  'Vrai dès qu''une vente existe : le propriétaire ne peut plus changer la devise seul.';

GRANT EXECUTE ON FUNCTION public.company_currency_locked(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Écriture contrôlée
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_company_currency(
  p_company_id uuid,
  p_currency text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(trim(coalesce(p_currency, '')));
  v_is_owner boolean;
  v_is_sa boolean := public.is_super_admin();
BEGIN
  IF NOT public.is_supported_currency(v_code) THEN
    RAISE EXCEPTION 'Devise non prise en charge : %', coalesce(p_currency, '(vide)');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active
      AND r.slug = 'owner'
  ) INTO v_is_owner;

  IF NOT v_is_owner AND NOT v_is_sa THEN
    RAISE EXCEPTION 'Accès refusé : seul le propriétaire peut changer la devise.';
  END IF;

  -- Le super admin peut corriger une devise mal choisie ; le propriétaire, non :
  -- à ce stade, ses ventes sont déjà libellées dans l'ancienne devise.
  IF public.company_currency_locked(p_company_id) AND NOT v_is_sa THEN
    RAISE EXCEPTION
      'Des ventes existent déjà : la devise ne peut plus être modifiée. Contactez le support.';
  END IF;

  INSERT INTO public.company_settings (company_id, key, value)
  VALUES (p_company_id, 'currency_code', to_jsonb(v_code))
  ON CONFLICT (company_id, key)
  DO UPDATE SET value = to_jsonb(v_code);

  /*
   * `stores.currency` existait déjà (personnalisation des factures A4) et alimente le
   * PDF. On l'aligne ici au lieu d'introduire un second mécanisme : la facture suit
   * donc le choix du propriétaire sans une ligne de code supplémentaire, et il n'y a
   * jamais deux devises concurrentes pour une même entreprise.
   */
  UPDATE public.stores
  SET currency = v_code
  WHERE company_id = p_company_id;
END;
$$;

COMMENT ON FUNCTION public.set_company_currency(uuid, text) IS
  'Propriétaire : choisit la devise de l''entreprise. Refusé dès qu''une vente existe (seul le super admin passe outre) — changer la devise ne convertit aucun montant.';

GRANT EXECUTE ON FUNCTION public.set_company_currency(uuid, text) TO authenticated;
