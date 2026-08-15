-- FasoStock — « Caisse à deux » : la TENUE DE CAISSE, un seul caissier à la fois.
--
-- 00191 a rendu possible le travail à deux : l'un prépare, l'autre encaisse. Il manquait
-- la règle qui va avec, et que tout commerçant applique déjà sans y penser : **l'argent
-- ne passe que par une seule personne à la fois**.
--
-- Sans elle, rien n'empêche les deux employés d'encaisser en même temps, chacun sur son
-- téléphone. Aucun bon n'est encaissé deux fois (00191 s'en charge), mais le tiroir-caisse,
-- lui, est tenu par deux mains : le soir, personne ne peut dire qui devait avoir combien
-- d'espèces, et un manquant n'a plus de responsable. C'est exactement le problème que la
-- caisse à deux devait supprimer, pas créer.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA RÈGLE
-- ─────────────────────────────────────────────────────────────────────────────
-- Dès qu'une personne encaisse dans une boutique, elle TIENT LA CAISSE. Tant qu'elle la
-- tient, personne d'autre ne peut encaisser dans cette boutique : les collègues restent
-- en vente, et leurs paniers partent vers elle. Les rôles s'échangent quand même — elle
-- rend la caisse, l'autre la prend — mais jamais en même temps.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- TROIS DÉCISIONS, ET POURQUOI
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La prise est AUTOMATIQUE. On ne demande pas au caissier de « prendre son poste »
--    avant de travailler : un écran de plus à comprendre le matin, et une caisse bloquée
--    tous les soirs par quelqu'un qui aura oublié de le quitter. Encaisser un bon prend
--    la caisse, tout simplement. C'est le geste lui-même qui décide.
--
-- 2. La caisse se LIBÈRE TOUTE SEULE après trois minutes sans signe de vie. Le téléphone
--    tombe en panne de batterie, l'employé part sans rien dire, le navigateur est fermé :
--    sans expiration, la boutique entière ne pourrait plus encaisser jusqu'à ce que
--    quelqu'un appelle le patron. Une caisse coincée est un problème plus grave que deux
--    caissiers simultanés.
--
-- 3. Le PROPRIÉTAIRE peut toujours reprendre la caisse de force. C'est son argent et son
--    magasin ; il n'a pas à attendre trois minutes parce qu'un employé est parti déjeuner
--    en laissant l'application ouverte.
--
-- La règle est posée dans la BASE (`checkout_pos_handoff` la vérifie), pas seulement dans
-- l'écran : un employé qui garderait un vieil onglet ouvert ne doit pas pouvoir la
-- contourner.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Qui tient la caisse
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Une ligne par boutique, au plus. La clé primaire sur `store_id` EST la règle :
 * deux détenteurs simultanés sont impossibles, quoi que fasse l'application.
 */
CREATE TABLE IF NOT EXISTS public.store_checkout_holders (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  holder_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  /** Depuis quand cette personne tient la caisse (affiché aux collègues). */
  taken_at timestamptz NOT NULL DEFAULT now(),
  /**
   * Dernier signe de vie. Rafraîchi par la page Encaissement à chaque rafraîchissement
   * de la file ; c'est lui qui permet à la caisse de se libérer d'elle-même.
   */
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.store_checkout_holders IS
  'Tenue de caisse (module « Caisse à deux ») : qui encaisse en ce moment dans cette '
  'boutique. Une ligne par boutique au maximum — la clé primaire garantit l''unicité. '
  'Expire seule après 3 minutes sans signe de vie.';

CREATE INDEX IF NOT EXISTS idx_store_checkout_holders_company
  ON public.store_checkout_holders(company_id);

ALTER TABLE public.store_checkout_holders ENABLE ROW LEVEL SECURITY;

-- Lecture ouverte à l'entreprise : « qui tient la caisse ? » est précisément la question
-- que les collègues doivent pouvoir se poser. L'écriture passe exclusivement par les RPC
-- ci-dessous, qui seules posent l'auteur et l'horodatage.
DROP POLICY IF EXISTS "store_checkout_holders_select" ON public.store_checkout_holders;
CREATE POLICY "store_checkout_holders_select" ON public.store_checkout_holders FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Prendre la caisse
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Prend la caisse d'une boutique, ou la garde si elle est déjà à nous.
 *
 * Renvoie l'état résultant : qui tient, depuis quand, et si c'est nous. Le verrou
 * consultatif sérialise deux employés qui appuieraient à la même seconde — sans lui, les
 * deux passeraient la lecture avant que l'un des deux n'ait écrit.
 *
 * `p_force` : reprise autoritaire, réservée au propriétaire.
 */
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
  IF NOT public.can_handle_pos_handoffs(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''encaisser.';
  END IF;

  PERFORM pg_advisory_xact_lock(abs(hashtext(p_store_id::text)));

  SELECT * INTO v_row FROM public.store_checkout_holders WHERE store_id = p_store_id;

  IF v_row.store_id IS NULL THEN
    INSERT INTO public.store_checkout_holders (store_id, company_id, holder_id)
    VALUES (p_store_id, v_company, auth.uid())
    RETURNING * INTO v_row;

  ELSIF v_row.holder_id = auth.uid() THEN
    -- Déjà à nous : simple signe de vie. C'est l'appel le plus fréquent de tous.
    UPDATE public.store_checkout_holders
    SET last_seen_at = now()
    WHERE store_id = p_store_id
    RETURNING * INTO v_row;

  ELSE
    -- Trois minutes : assez long pour couvrir un client bavard ou un écran verrouillé,
    -- assez court pour qu'une boutique ne reste jamais bloquée un après-midi entier.
    v_stale := v_row.last_seen_at < now() - interval '3 minutes';

    IF NOT v_stale
       AND NOT COALESCE(p_force, false)
    THEN
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

COMMENT ON FUNCTION public.pos_checkout_take(uuid, boolean) IS
  'Prend (ou garde) la tenue de caisse d''une boutique. Sert aussi de signe de vie : '
  'appelée en boucle par la page Encaissement du détenteur.';

REVOKE ALL ON FUNCTION public.pos_checkout_take(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_checkout_take(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Rendre la caisse
-- ─────────────────────────────────────────────────────────────────────────────
-- Le geste explicite du changement d'équipe : « j'ai fini, prends ». Sans lui, le
-- collègue devrait attendre l'expiration de trois minutes pour rien.
CREATE OR REPLACE FUNCTION public.pos_checkout_release(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_holder uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT company_id, holder_id INTO v_company, v_holder
  FROM public.store_checkout_holders WHERE store_id = p_store_id FOR UPDATE;

  IF v_company IS NULL THEN
    RETURN; -- personne ne la tient : l'appel est sans objet, pas une erreur à afficher
  END IF;

  IF v_holder <> auth.uid()
     AND NOT (public.is_super_admin() OR public.user_is_company_owner(v_company))
  THEN
    RAISE EXCEPTION 'Cette caisse est tenue par quelqu''un d''autre.';
  END IF;

  DELETE FROM public.store_checkout_holders WHERE store_id = p_store_id;
END;
$$;

COMMENT ON FUNCTION public.pos_checkout_release(uuid) IS
  'Rend la tenue de caisse. Le détenteur, ou le propriétaire.';

REVOKE ALL ON FUNCTION public.pos_checkout_release(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_checkout_release(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. La garde utilisée à l'encaissement
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Prend la caisse si elle est libre, la garde si elle est à nous, refuse si un collègue
 * la tient. C'est ce que « la prise est automatique » veut dire, en une fonction.
 */
CREATE OR REPLACE FUNCTION public.pos_checkout_assert_holder(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_row public.store_checkout_holders%ROWTYPE;
BEGIN
  SELECT company_id INTO v_company FROM public.stores WHERE id = p_store_id;

  PERFORM pg_advisory_xact_lock(abs(hashtext(p_store_id::text)));
  SELECT * INTO v_row FROM public.store_checkout_holders WHERE store_id = p_store_id;

  IF v_row.store_id IS NULL THEN
    INSERT INTO public.store_checkout_holders (store_id, company_id, holder_id)
    VALUES (p_store_id, v_company, auth.uid());
    RETURN;
  END IF;

  IF v_row.holder_id = auth.uid() THEN
    UPDATE public.store_checkout_holders
    SET last_seen_at = now()
    WHERE store_id = p_store_id;
    RETURN;
  END IF;

  IF v_row.last_seen_at < now() - interval '3 minutes' THEN
    UPDATE public.store_checkout_holders
    SET holder_id = auth.uid(), taken_at = now(), last_seen_at = now()
    WHERE store_id = p_store_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Un collègue tient la caisse : c''est à lui d''encaisser ce bon. Vous restez en vente.';
END;
$$;

COMMENT ON FUNCTION public.pos_checkout_assert_holder(uuid) IS
  'Garde de la tenue de caisse, appelée par checkout_pos_handoff : prend la caisse si '
  'elle est libre, refuse si un collègue la tient.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. `checkout_pos_handoff` applique désormais la règle
-- ─────────────────────────────────────────────────────────────────────────────
-- Signature inchangée (00191) : simple remplacement, rien à modifier côté application.
-- Le seul ajout est l'appel à la garde, juste avant que l'argent et le stock ne bougent.
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
  IF NOT public.can_handle_pos_handoffs(v_h.company_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''encaisser.';
  END IF;

  IF v_h.status = 'paid' THEN
    RAISE EXCEPTION 'Ce bon vient d''être encaissé par quelqu''un d''autre.';
  END IF;
  IF v_h.status = 'cancelled' THEN
    RAISE EXCEPTION 'Ce bon a été annulé : demandez au vendeur de le renvoyer.';
  END IF;

  -- Un seul caissier à la fois dans cette boutique. Vérifié AVANT toute écriture : un
  -- refus ici ne laisse ni vente, ni mouvement de stock, ni bon consommé.
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

  -- Remise : celle du vendeur par défaut, celle du caissier si elle est fournie (le
  -- patron accorde souvent le geste commercial au moment de payer, pas en rayon).
  v_discount := GREATEST(0, COALESCE(p_discount, v_h.discount, 0));
  -- Client : le caissier peut en rattacher un que le vendeur n'avait pas saisi — c'est
  -- indispensable pour une vente à crédit, décidée au comptoir.
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

COMMENT ON FUNCTION public.checkout_pos_handoff IS
  'Encaisse un bon de caisse : vérifie la tenue de caisse (un seul caissier par '
  'boutique), crée la vente réelle via create_sale_with_stock, puis marque le bon payé.';

REVOKE ALL ON FUNCTION public.checkout_pos_handoff(uuid, jsonb, numeric, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkout_pos_handoff(uuid, jsonb, numeric, uuid, timestamptz) TO authenticated;
