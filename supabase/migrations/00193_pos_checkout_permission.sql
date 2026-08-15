-- FasoStock — « Caisse à deux » : ENCAISSER devient un droit à part entière.
--
-- 00191 partait d'un raccourci : « qui peut vendre peut encaisser » (`sales.create`).
-- L'intention était bonne — que les deux employés puissent échanger leurs postes sans que
-- le propriétaire ait un réglage à revoir. Mais elle enlève au propriétaire la décision
-- qui compte le plus dans son magasin : **qui touche l'argent**.
--
-- Le commerçant, lui, ne raisonne pas comme ça. Il a un neveu qui aide en rayon les jours
-- de marché, un apprenti de trois semaines, un vendeur qu'il connaît depuis dix ans. Tous
-- peuvent constituer un panier ; un seul doit pouvoir ouvrir le tiroir. Sans droit dédié,
-- il n'avait qu'une réponse possible à « je ne veux pas qu'il encaisse » : lui retirer
-- `sales.create` — c'est-à-dire l'empêcher aussi de vendre, donc de servir.
--
-- Deux gestes, deux droits :
--   • `sales.create`  → constituer un panier et l'ENVOYER à la caisse ;
--   • `pos.checkout`  → CONFIRMER et ENCAISSER (page Encaissement, tenue de caisse).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LE DÉFAUT, ET POURQUOI IL COMPTE ICI PLUS QU'AILLEURS
-- ─────────────────────────────────────────────────────────────────────────────
-- Un nouveau droit n'est accordé à personne : ni rôle, ni dérogation. Appliqué tel quel,
-- ce fichier couperait donc l'encaissement à tous les caissiers déjà au travail — au
-- milieu d'une journée, sans prévenir, chez un client qui n'a rien demandé.
--
-- On le donne donc, à l'installation, à **tous les rôles qui possèdent déjà
-- `sales.create`** : rien ne change le jour de la migration. Le propriétaire retire
-- ensuite le droit, employé par employé, dans Employés › gestion fine des droits. Le
-- réglage part de l'état actuel et se resserre, il ne casse pas puis ne se répare pas.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Le droit
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (id, key)
VALUES (uuid_generate_v4(), 'pos.checkout')
ON CONFLICT (key) DO NOTHING;

-- Accordé à tout rôle qui peut déjà vendre — dérivé de l'état réel de la base plutôt que
-- d'une liste de slugs écrite à la main, qui oublierait un rôle ajouté depuis 00035.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rp.role_id, np.id
FROM public.role_permissions rp
JOIN public.permissions p ON p.id = rp.permission_id
CROSS JOIN public.permissions np
WHERE p.key = 'sales.create'
  AND np.key = 'pos.checkout'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Les deux gardes
-- ─────────────────────────────────────────────────────────────────────────────
-- `can_handle_pos_handoffs` (00191) garde son sens — ENVOYER un panier — et reste donc
-- adossée à `sales.create` : préparer un panier n'est que vendre, et le commentaire de
-- 00191 disait déjà cela. Seul l'encaissement se sépare.
COMMENT ON FUNCTION public.can_handle_pos_handoffs(uuid) IS
  'Droit d''ENVOYER un panier à la caisse (sales.create). Encaisser relève désormais '
  'd''un droit distinct : voir can_checkout_pos_handoffs.';

/**
 * Droit d'encaisser : le propriétaire, ou `pos.checkout`.
 *
 * Volontairement SANS repli sur `sales.create` : un repli rendrait le retrait du droit
 * sans effet, et c'est précisément le retrait que le propriétaire vient chercher.
 */
CREATE OR REPLACE FUNCTION public.can_checkout_pos_handoffs(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR public.user_is_company_owner(p_company_id)
      OR public.user_has_company_permission(p_company_id, 'pos.checkout');
$$;

COMMENT ON FUNCTION public.can_checkout_pos_handoffs(uuid) IS
  'Droit de confirmer et d''encaisser un bon de caisse (pos.checkout). Distinct du droit '
  'de vendre : le propriétaire choisit qui tient l''argent.';

GRANT EXECUTE ON FUNCTION public.can_checkout_pos_handoffs(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. « Je le prends » — signaler qu'on s'occupe d'un bon
-- ─────────────────────────────────────────────────────────────────────────────
-- Réservé à ceux qui peuvent encaisser : se déclarer sur un bon qu'on n'a pas le droit
-- d'encaisser ne ferait qu'induire les collègues en erreur.
CREATE OR REPLACE FUNCTION public.claim_pos_handoff(
  p_handoff_id uuid,
  p_claim boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_store uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT company_id, store_id, status INTO v_company, v_store, v_status
  FROM public.pos_handoffs WHERE id = p_handoff_id;

  IF v_company IS NULL THEN RAISE EXCEPTION 'Bon de caisse introuvable.'; END IF;
  IF NOT public.has_store_access(v_store, v_company) THEN
    RAISE EXCEPTION 'Ce bon n''est pas dans vos boutiques.';
  END IF;
  IF NOT public.can_checkout_pos_handoffs(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''encaisser.';
  END IF;
  IF v_status = 'paid' THEN
    RAISE EXCEPTION 'Ce bon vient d''être encaissé.';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Ce bon a été annulé.';
  END IF;

  IF COALESCE(p_claim, true) THEN
    UPDATE public.pos_handoffs
    SET claimed_by = auth.uid(), claimed_at = now()
    WHERE id = p_handoff_id;
  ELSE
    UPDATE public.pos_handoffs
    SET claimed_by = NULL, claimed_at = NULL
    WHERE id = p_handoff_id;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Annuler un bon — les deux métiers, chacun pour sa raison
-- ─────────────────────────────────────────────────────────────────────────────
-- Le vendeur rappelle un bon envoyé par erreur ; le caissier refuse un bon devant un
-- client qui se ravise. Exiger le droit d'encaisser pour rappeler son propre bon
-- laisserait des bons fantômes dans la file de la boutique.
CREATE OR REPLACE FUNCTION public.cancel_pos_handoff(
  p_handoff_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_store uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT company_id, store_id, status INTO v_company, v_store, v_status
  FROM public.pos_handoffs WHERE id = p_handoff_id FOR UPDATE;

  IF v_company IS NULL THEN RAISE EXCEPTION 'Bon de caisse introuvable.'; END IF;
  IF NOT public.has_store_access(v_store, v_company) THEN
    RAISE EXCEPTION 'Ce bon n''est pas dans vos boutiques.';
  END IF;
  IF NOT (
    public.can_handle_pos_handoffs(v_company)
    OR public.can_checkout_pos_handoffs(v_company)
  ) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''annuler un bon de caisse.';
  END IF;
  IF v_status = 'paid' THEN
    RAISE EXCEPTION 'Ce bon est déjà encaissé : annulez la vente depuis la page Ventes.';
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN; -- déjà annulé : l'appel est sans effet, pas une erreur à afficher au caissier
  END IF;

  UPDATE public.pos_handoffs
  SET status = 'cancelled',
      cancelled_by = auth.uid(),
      cancelled_at = now(),
      cancel_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_handoff_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Tenue de caisse — prendre la caisse suppose le droit d'encaisser
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pos_checkout_take(
  p_store_id uuid,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_row public.store_checkout_holders%ROWTYPE;
  v_stale boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT company_id INTO v_company FROM public.stores WHERE id = p_store_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Boutique introuvable.'; END IF;
  IF NOT public.has_store_access(p_store_id, v_company) THEN
    RAISE EXCEPTION 'Cette boutique n''est pas la vôtre.';
  END IF;
  IF NOT public.can_checkout_pos_handoffs(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''encaisser.';
  END IF;

  PERFORM pg_advisory_xact_lock(abs(hashtext(p_store_id::text)));

  SELECT * INTO v_row FROM public.store_checkout_holders WHERE store_id = p_store_id;

  IF v_row.store_id IS NULL THEN
    INSERT INTO public.store_checkout_holders (store_id, company_id, holder_id)
    VALUES (p_store_id, v_company, auth.uid())
    RETURNING * INTO v_row;

  ELSIF v_row.holder_id = auth.uid() THEN
    UPDATE public.store_checkout_holders
    SET last_seen_at = now()
    WHERE store_id = p_store_id
    RETURNING * INTO v_row;

  ELSE
    v_stale := v_row.last_seen_at < now() - interval '3 minutes';

    IF NOT v_stale AND NOT COALESCE(p_force, false) THEN
      RAISE EXCEPTION 'Un collègue tient la caisse de cette boutique. Demandez-lui de la rendre, ou continuez en vente.';
    END IF;

    IF NOT v_stale
       AND NOT (public.is_super_admin() OR public.user_is_company_owner(v_company))
    THEN
      RAISE EXCEPTION 'Seul le propriétaire peut reprendre une caisse tenue par quelqu''un d''autre.';
    END IF;

    UPDATE public.store_checkout_holders
    SET holder_id = auth.uid(),
        taken_at = now(),
        last_seen_at = now()
    WHERE store_id = p_store_id
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'store_id', v_row.store_id,
    'holder_id', v_row.holder_id,
    'taken_at', v_row.taken_at,
    'last_seen_at', v_row.last_seen_at,
    'is_mine', v_row.holder_id = auth.uid()
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Encaisser — la garde qui compte vraiment
-- ─────────────────────────────────────────────────────────────────────────────
-- Signature inchangée (00191/00192). Un seul contrôle change : `can_handle_pos_handoffs`
-- devient `can_checkout_pos_handoffs`. C'est ICI que le droit se joue — un employé sans
-- `pos.checkout` ne peut plus créer de vente à partir d'un bon, quel que soit l'écran ou
-- l'onglet qu'il aurait gardé ouvert.
CREATE OR REPLACE FUNCTION public.checkout_pos_handoff(
  p_handoff_id uuid,
  p_payments jsonb DEFAULT '[]'::jsonb,
  p_discount numeric DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_credit_due_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_h public.pos_handoffs%ROWTYPE;
  v_items jsonb;
  v_discount numeric;
  v_customer uuid;
  v_sale_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT * INTO v_h FROM public.pos_handoffs WHERE id = p_handoff_id FOR UPDATE;

  IF v_h.id IS NULL THEN RAISE EXCEPTION 'Bon de caisse introuvable.'; END IF;
  IF NOT (v_h.company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise non autorisée';
  END IF;
  IF NOT public.has_store_access(v_h.store_id, v_h.company_id) THEN
    RAISE EXCEPTION 'Ce bon n''est pas dans vos boutiques.';
  END IF;
  IF NOT public.can_checkout_pos_handoffs(v_h.company_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''encaisser. Demandez à un collègue qui tient la caisse.';
  END IF;

  IF v_h.status = 'paid' THEN
    RAISE EXCEPTION 'Ce bon vient d''être encaissé par quelqu''un d''autre.';
  END IF;
  IF v_h.status = 'cancelled' THEN
    RAISE EXCEPTION 'Ce bon a été annulé : demandez au vendeur de le renvoyer.';
  END IF;

  -- Un seul caissier à la fois dans cette boutique (00192). Vérifié AVANT toute écriture :
  -- un refus ici ne laisse ni vente, ni mouvement de stock, ni bon consommé.
  PERFORM public.pos_checkout_assert_holder(v_h.store_id);

  SELECT jsonb_agg(
           jsonb_build_object(
             'product_id', i.product_id,
             'quantity', i.quantity,
             'unit_price', i.unit_price,
             'discount', i.discount
           )
           ORDER BY i.position, i.created_at
         )
    INTO v_items
  FROM public.pos_handoff_items i
  WHERE i.handoff_id = p_handoff_id;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Ce bon ne contient aucun article.';
  END IF;

  v_discount := GREATEST(0, COALESCE(p_discount, v_h.discount, 0));
  v_customer := COALESCE(p_customer_id, v_h.customer_id);

  v_sale_id := public.create_sale_with_stock(
    p_company_id => v_h.company_id,
    p_store_id => v_h.store_id,
    p_customer_id => v_customer,
    p_created_by => auth.uid(),
    p_items => v_items,
    p_payments => COALESCE(p_payments, '[]'::jsonb),
    p_discount => v_discount,
    p_sale_mode => v_h.sale_mode,
    p_document_type => v_h.document_type
  );

  IF p_credit_due_at IS NOT NULL THEN
    UPDATE public.sales SET credit_due_at = p_credit_due_at WHERE id = v_sale_id;
  END IF;
  IF v_h.prescription_number IS NOT NULL THEN
    UPDATE public.sales SET prescription_number = v_h.prescription_number WHERE id = v_sale_id;
  END IF;

  UPDATE public.pos_handoffs
  SET status = 'paid',
      sale_id = v_sale_id,
      paid_by = auth.uid(),
      paid_at = now(),
      customer_id = v_customer,
      discount = v_discount,
      total = GREATEST(0, subtotal - v_discount)
  WHERE id = p_handoff_id;

  RETURN v_sale_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS : le caissier doit pouvoir écrire sur un bon qu'il n'a pas créé
-- ─────────────────────────────────────────────────────────────────────────────
-- La policy de 00191 n'ouvrait l'UPDATE qu'à `sales.create`. Un caissier à qui le
-- propriétaire retirerait ce droit (il n'est plus en rayon, il ne fait que la caisse)
-- ne pourrait plus rien marquer. On ouvre donc aux deux droits.
DROP POLICY IF EXISTS "pos_handoffs_update" ON public.pos_handoffs;
CREATE POLICY "pos_handoffs_update" ON public.pos_handoffs FOR UPDATE USING (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND (
    public.is_super_admin()
    OR public.user_is_company_owner(company_id)
    OR public.user_has_company_permission(company_id, 'sales.create')
    OR public.user_has_company_permission(company_id, 'pos.checkout')
  )
) WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
);
