-- FasoStock — Le règlement quitte la facture engin et passe derrière le QR code.
--
-- Problème : la facture A4 d'un engin circule. Le client la montre à la mairie, au
-- transporteur, à la douane, à un parent ; elle traîne sur un bureau, on la photocopie.
-- Y imprimer « Montant payé : 150 000 · Reste à payer : 600 000 », c'est afficher la
-- situation financière de l'acheteur à tous ceux qui la croisent — et donner au premier
-- venu de quoi juger, ou négocier, ce qui ne le regarde pas.
--
-- Réponse : la facture n'imprime plus que le montant de la vente. Le DÉTAIL du règlement
-- (payé, reste, statut, mode) devient consultable en scannant le QR de vérification —
-- même page, même jeton opaque qu'aujourd'hui, mais elle en dit un peu plus.
--
-- Ce que ça change côté accès : le QR est imprimé sur la facture, donc qui tient la
-- facture peut voir le règlement. C'est VOULU — c'est le même public qu'avant. La
-- différence est qu'il faut le geste de scanner : plus rien ne s'expose au regard qui
-- passe, ni sur une photocopie. Le jeton reste opaque et non devinable (`gen_random_uuid`),
-- la page reste `noindex`, et rien d'autre n'est exposé (aucune adresse, aucun contact,
-- aucune référence bancaire).

-- `RETURNS TABLE` change de forme : il faut supprimer avant de recréer.
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
  payment_methods text[]
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
      COALESCE(
        array_agg(DISTINCT p.method) FILTER (WHERE p.method IS NOT NULL),
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
    paid.payment_methods
  FROM sale
  CROSS JOIN paid
  JOIN public.stores st ON st.id = sale.store_id
  JOIN public.companies c ON c.id = sale.company_id;
$$;

COMMENT ON FUNCTION public.verify_engine_sale IS
  'Vérification publique (QR) d''une facture de vente d''engin : identité de la facture, '
  'de l''engin, et détail du règlement — ce dernier n''étant plus imprimé sur la facture A4.';

GRANT EXECUTE ON FUNCTION public.verify_engine_sale(text) TO anon, authenticated;
