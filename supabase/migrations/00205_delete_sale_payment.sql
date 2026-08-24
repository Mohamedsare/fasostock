-- FasoStock — Annuler un encaissement de crédit (suppression d'une ligne `sale_payments`).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI
-- ─────────────────────────────────────────────────────────────────────────────
-- Un remboursement se saisit au comptoir, souvent dans le bruit : le client tend
-- l'argent, le vendeur valide, l'écran met une seconde à répondre, il revalide.
-- Résultat : deux fois le même encaissement, une dette éteinte alors que le client
-- doit encore, et un commerçant qui n'a AUCUN moyen de corriger — jusqu'ici, la
-- seule sortie était d'ouvrir une contre-écriture qu'aucun écran ne sait produire.
--
-- Cette porte existe donc pour la faute de frappe, pas pour réécrire l'histoire.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI ELLE EST ÉTROITE
-- ─────────────────────────────────────────────────────────────────────────────
--   • PROPRIÉTAIRE (ou administrateur FasoStock) UNIQUEMENT. Effacer la preuve d'un
--     encaissement est exactement le geste d'un caissier qui garde l'argent : le
--     droit `sales.update`, qui autorise à encaisser, n'ouvre pas cette porte.
--   • JAMAIS la ligne `method = 'other'` (mise à crédit à la vente). Elle n'est pas
--     un encaissement : c'est la dette elle-même. La supprimer ferait disparaître le
--     crédit du dossier sans que personne n'ait rien payé.
--   • TOUJOURS TRACÉ dans `audit_logs` (montant, mode, instant d'origine, motif),
--     même si la ligne, elle, disparaît. Le journal d'audit doit pouvoir répondre à
--     « qui a effacé les 994 500 F du 24 août, et pourquoi ».
--
-- La comptabilité se recale seule : le trigger `accounting_sale_payment_sync`
-- (00136) écoute déjà les DELETE et régénère l'écriture de la vente.

CREATE OR REPLACE FUNCTION public.delete_sale_payment(
  p_payment_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pay record;
  v_sale record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT id, sale_id, method, amount, reference, created_at
    INTO v_pay
  FROM public.sale_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encaissement introuvable.';
  END IF;

  SELECT id, company_id, store_id, sale_number, status
    INTO v_sale
  FROM public.sales
  WHERE id = v_pay.sale_id
  FOR UPDATE;

  IF NOT FOUND OR v_sale.company_id IS NULL THEN
    RAISE EXCEPTION 'Vente introuvable.';
  END IF;

  IF NOT (public.is_super_admin() OR public.user_is_company_owner(v_sale.company_id)) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut annuler un encaissement.';
  END IF;

  IF NOT public.is_super_admin() THEN
    IF NOT (v_sale.company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
      RAISE EXCEPTION 'Accès refusé';
    END IF;
    IF NOT public.has_store_access(v_sale.store_id, v_sale.company_id) THEN
      RAISE EXCEPTION 'Accès refusé : boutique';
    END IF;
  END IF;

  IF v_pay.method = 'other'::public.payment_method THEN
    RAISE EXCEPTION 'Cette ligne est la mise à crédit de la vente, pas un encaissement : elle ne peut pas être annulée.';
  END IF;

  -- La trace survit à la ligne : le journal d'audit garde le montant effacé.
  INSERT INTO public.audit_logs (company_id, store_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_sale.company_id,
    v_sale.store_id,
    v_uid,
    'delete',
    'sale_payment',
    v_pay.id,
    jsonb_build_object(
      'sale_id', v_sale.id,
      'sale_number', v_sale.sale_number,
      'method', v_pay.method::text,
      'amount', v_pay.amount,
      'reference', v_pay.reference,
      'paid_at', v_pay.created_at,
      'reason', NULLIF(trim(COALESCE(p_reason, '')), '')
    ),
    NULL
  );

  DELETE FROM public.sale_payments WHERE id = p_payment_id;

  UPDATE public.sales SET updated_at = now() WHERE id = v_sale.id;
END;
$$;

COMMENT ON FUNCTION public.delete_sale_payment(uuid, text) IS
  'Propriétaire / super admin : supprime un encaissement de vente (jamais la ligne « other » de mise à crédit) et trace la suppression dans audit_logs.';

GRANT EXECUTE ON FUNCTION public.delete_sale_payment(uuid, text) TO authenticated;
