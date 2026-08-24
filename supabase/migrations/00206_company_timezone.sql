-- 00206 — Fuseau horaire de l'entreprise, choisi par le propriétaire
--         (Paramètres › Fuseau horaire).
--
-- Stocké dans `company_settings` (clé `timezone`), comme la devise (00179). Défaut
-- `Africa/Ouagadougou` : aucune entreprise existante ne change de comportement tant
-- qu'elle n'a rien choisi.
--
-- POURQUOI UN RÉGLAGE D'ENTREPRISE ET NON LE FUSEAU DU POSTE
--
-- L'application lisait le fuseau du navigateur. Un PC réglé sur « W. Central Africa »
-- (UTC+1) dans un commerce burkinabè (UTC+0) imprimait donc 16:43 sur les tickets là où
-- il était 15:43, et surtout : les bornes « aujourd'hui » des rapports commençaient à
-- 23:00 la veille, rangeant de vraies ventes dans le mauvais jour. Un commerce a UN
-- fuseau, celui de son pays. Il se choisit une fois et vaut pour tous les postes.
--
-- POURQUOI PAS DE VERROU, CONTRAIREMENT À LA DEVISE
--
-- Changer de devise ne convertit aucun montant : les livres deviennent faux en silence,
-- d'où le verrou de 00179. Le fuseau, lui, ne touche qu'à l'**affichage** — les
-- horodatages restent des `timestamptz` en UTC. Corriger un fuseau mal choisi remet
-- l'historique à la bonne heure au lieu de le fausser : il faut donc rester librement
-- modifiable par le propriétaire.

-- ---------------------------------------------------------------------------
-- Liste blanche — alignée sur `lib/config/timezones.ts`
-- ---------------------------------------------------------------------------
-- Identifiants IANA. Les régler ici plutôt que d'accepter n'importe quelle chaîne
-- évite qu'une faute de frappe (« Africa/Ouaga ») fasse retomber tout l'affichage sur
-- le fuseau par défaut sans que personne comprenne pourquoi.

CREATE OR REPLACE FUNCTION public.is_supported_timezone(p_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(coalesce(p_id, '')) IN (
    'Africa/Ouagadougou', 'Africa/Abidjan', 'Africa/Dakar', 'Africa/Bamako',
    'Africa/Accra', 'Africa/Conakry', 'Africa/Nouakchott', 'Africa/Lome',
    'Africa/Banjul', 'Africa/Bissau', 'Africa/Freetown', 'Africa/Monrovia',
    'Africa/Lagos', 'Africa/Porto-Novo', 'Africa/Niamey', 'Africa/Douala',
    'Africa/Bangui', 'Africa/Ndjamena', 'Africa/Libreville', 'Africa/Brazzaville',
    'Africa/Kinshasa', 'Africa/Luanda', 'Africa/Tunis', 'Africa/Algiers',
    'Africa/Casablanca', 'Africa/Lubumbashi', 'Africa/Kigali', 'Africa/Bujumbura',
    'Africa/Cairo', 'Africa/Nairobi', 'Africa/Djibouti', 'Indian/Comoro',
    'Europe/Paris'
  );
$$;

COMMENT ON FUNCTION public.is_supported_timezone(text) IS
  'Fuseaux IANA acceptés. Miroir de lib/config/timezones.ts.';

-- ---------------------------------------------------------------------------
-- Lecture — utilisable par les traitements serveur (e-mails, bilans planifiés)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.company_timezone(p_company_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT cs.value #>> '{}'
      FROM public.company_settings cs
      WHERE cs.company_id = p_company_id
        AND cs.key = 'timezone'
        AND public.is_supported_timezone(cs.value #>> '{}')
    ),
    'Africa/Ouagadougou'
  );
$$;

COMMENT ON FUNCTION public.company_timezone(uuid) IS
  'Fuseau horaire de l''entreprise, ou Africa/Ouagadougou si rien n''a été choisi.';

GRANT EXECUTE ON FUNCTION public.company_timezone(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Écriture contrôlée
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_company_timezone(
  p_company_id uuid,
  p_timezone text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text := trim(coalesce(p_timezone, ''));
  v_is_owner boolean;
BEGIN
  IF NOT public.is_supported_timezone(v_id) THEN
    RAISE EXCEPTION 'Fuseau horaire non pris en charge : %', coalesce(p_timezone, '(vide)');
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

  IF NOT v_is_owner AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : seul le propriétaire peut changer le fuseau horaire.';
  END IF;

  INSERT INTO public.company_settings (company_id, key, value)
  VALUES (p_company_id, 'timezone', to_jsonb(v_id))
  ON CONFLICT (company_id, key)
  DO UPDATE SET value = to_jsonb(v_id);
END;
$$;

COMMENT ON FUNCTION public.set_company_timezone(uuid, text) IS
  'Propriétaire : choisit le fuseau horaire du commerce. Sans verrou — le fuseau ne change que l''affichage, les horodatages restent en UTC.';

GRANT EXECUTE ON FUNCTION public.set_company_timezone(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Fuseau de l'entreprise de l'appelant — utilisé par les routes PDF authentifiées
-- ---------------------------------------------------------------------------
-- Les PDF sont rendus côté serveur (Node en UTC) : sans cette lecture, une facture
-- imprimée porterait l'heure d'Ouagadougou pour une entreprise nigérienne. Le fuseau
-- est déduit du rôle actif de l'appelant plutôt que transmis par le navigateur —
-- l'heure imprimée sur un document commercial ne doit pas dépendre de ce que le
-- client envoie.

CREATE OR REPLACE FUNCTION public.my_company_timezone()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT public.company_timezone(ucr.company_id)
      FROM public.user_company_roles ucr
      WHERE ucr.user_id = auth.uid()
        AND ucr.is_active
      -- Un utilisateur multi-entreprises est rare ; à défaut d'entreprise active
      -- explicite, on prend la plus ancienne — stable d'un appel à l'autre.
      ORDER BY ucr.created_at
      LIMIT 1
    ),
    'Africa/Ouagadougou'
  );
$$;

COMMENT ON FUNCTION public.my_company_timezone() IS
  'Fuseau horaire de l''entreprise de l''utilisateur courant (rendu PDF côté serveur).';

GRANT EXECUTE ON FUNCTION public.my_company_timezone() TO authenticated;

-- ---------------------------------------------------------------------------
-- Pages publiques : le fuseau voyage avec la donnée
-- ---------------------------------------------------------------------------
-- Le suivi de commande et la vérification de facture par QR sont consultés par le
-- client final, sans session. Ils n'ont donc aucun moyen de connaître le fuseau du
-- commerce : les deux fonctions le renvoient désormais avec la ligne.

DROP FUNCTION IF EXISTS public.public_online_order_track(uuid);

CREATE FUNCTION public.public_online_order_track(p_token uuid)
RETURNS TABLE (
  order_number text,
  status text,
  created_at timestamptz,
  customer_name text,
  delivery_mode text,
  payment_method text,
  customer_address text,
  subtotal numeric,
  delivery_fee numeric,
  total numeric,
  shop_name text,
  shop_slug text,
  shop_phone text,
  items jsonb,
  timezone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.order_number,
    o.status,
    o.created_at,
    o.customer_name,
    o.delivery_mode,
    o.payment_method,
    o.customer_address,
    o.subtotal,
    o.delivery_fee,
    o.total,
    COALESCE(NULLIF(btrim(st.display_name), ''), s.name),
    st.slug,
    COALESCE(NULLIF(btrim(st.whatsapp_phone), ''), s.phone),
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'name', i.product_name,
          'quantity', i.quantity,
          'unit_price', i.unit_price,
          'total', i.total
        ) ORDER BY i.product_name)
        FROM public.online_order_items i
        WHERE i.order_id = o.id
      ),
      '[]'::jsonb
    ),
    public.company_timezone(o.company_id)
  FROM public.online_orders o
  JOIN public.stores s ON s.id = o.store_id
  LEFT JOIN public.store_online_settings st ON st.store_id = s.id
  WHERE o.public_token = p_token;
$$;

GRANT EXECUTE ON FUNCTION public.public_online_order_track(uuid) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.verify_engine_sale(text);

CREATE FUNCTION public.verify_engine_sale(p_token text)
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
  internal_reference text,
  -- Règlement : ce qui n'est plus imprimé sur le papier.
  amount_paid numeric,
  amount_due numeric,
  payment_status text,
  payment_methods text[],
  timezone text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH sale AS (
    SELECT
      s.id,
      s.sale_number,
      s.created_at AS sale_date,
      s.total,
      s.store_id,
      s.company_id,
      d.client_name,
      d.engine_designation,
      d.engine_brand,
      d.engine_model,
      d.engine_chassis,
      d.internal_reference
    FROM public.engine_sale_details d
    JOIN public.sales s ON s.id = d.sale_id
    WHERE d.verification_token = p_token
      AND s.status <> 'cancelled'
    LIMIT 1
  ),
  paid AS (
    SELECT
      COALESCE(SUM(p.amount), 0)::numeric AS amount_paid,
      -- `sale_payments.method` est l'enum `payment_method` : sans le `::text`,
      -- l'agrégat sort en `payment_method[]` et le COALESCE échoue (42846), alors
      -- que la fonction déclare `payment_methods text[]`.
      COALESCE(
        array_agg(DISTINCT p.method::text ORDER BY p.method::text)
          FILTER (WHERE p.method IS NOT NULL),
        '{}'::text[]
      ) AS payment_methods
    FROM public.sale_payments p
    JOIN sale ON sale.id = p.sale_id
  )
  SELECT
    sale.sale_number,
    sale.sale_date,
    sale.total,
    st.name AS store_name,
    c.name AS company_name,
    sale.client_name,
    sale.engine_designation,
    sale.engine_brand,
    sale.engine_model,
    sale.engine_chassis,
    sale.internal_reference,
    paid.amount_paid,
    GREATEST(sale.total - paid.amount_paid, 0)::numeric AS amount_due,
    (CASE
      WHEN paid.amount_paid <= 0 THEN 'unpaid'
      WHEN paid.amount_paid >= sale.total THEN 'paid'
      ELSE 'partial'
    END)::text AS payment_status,
    paid.payment_methods,
    public.company_timezone(sale.company_id)
  FROM sale
  CROSS JOIN paid
  JOIN public.stores st ON st.id = sale.store_id
  JOIN public.companies c ON c.id = sale.company_id;
$$;

COMMENT ON FUNCTION public.verify_engine_sale IS
  'Vérification publique (QR) d''une facture de vente d''engin : identité de la facture, '
  'de l''engin, détail du règlement, et fuseau du commerce pour dater la vente juste.';

GRANT EXECUTE ON FUNCTION public.verify_engine_sale(text) TO anon, authenticated;
