-- FasoStock — « Caisse à deux » : imprimer le ticket SUR LE POSTE DU VENDEUR.
--
-- Le comptoir réel : le vendeur est au fond du magasin avec le client et la marchandise ;
-- le caissier est devant, avec l'argent. L'imprimante thermique, elle, est souvent d'un
-- seul côté — et pas forcément du côté de celui qui encaisse. Aujourd'hui, le caissier
-- appuie sur « Imprimer » et le ticket sort à côté de LUI : quelqu'un doit traverser le
-- magasin pour l'apporter au client. Le gain de temps de la caisse à deux repart dans ce
-- trajet.
--
-- Ce qu'il faut : que le caissier puisse envoyer l'impression au poste du vendeur, comme
-- il vient de recevoir le panier de sa part. Le relais fonctionne dans les deux sens.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI UNE TABLE, ET PAS UN APPEL DIRECT
-- ─────────────────────────────────────────────────────────────────────────────
-- Un navigateur ne peut pas parler à un autre navigateur, ni à une imprimante branchée
-- sur une autre machine. La seule voie possible est celle que ce module utilise déjà pour
-- les paniers : **une ligne dans la base, que le poste destinataire vient chercher**.
--
-- D'où `pos_print_jobs` : « poste X, imprime la vente Y ». Le poste du vendeur interroge
-- la table au même rythme que le reste (quelques secondes), prend le travail, l'imprime,
-- et le marque fait. C'est un facteur de plus dans une chaîne déjà éprouvée, pas une
-- technologie nouvelle à faire fonctionner en boutique.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QU'ON NE STOCKE PAS
-- ─────────────────────────────────────────────────────────────────────────────
-- Pas le ticket. On stocke `sale_id`, et le poste destinataire reconstruit le ticket avec
-- le MÊME code que la réimpression depuis la page Ventes. Copier le contenu ici créerait
-- une deuxième vérité qui vieillirait mal (logo changé, adresse corrigée, devise) et
-- ferait diverger deux tickets de la même vente.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA LIMITE, ET IL FAUT LA CONNAÎTRE
-- ─────────────────────────────────────────────────────────────────────────────
-- Un navigateur n'imprime jamais en silence : le poste destinataire ouvrira la fenêtre
-- d'impression. Sur un poste de caisse, cela se règle une fois pour toutes en lançant
-- Chrome avec `--kiosk-printing`, qui envoie directement à l'imprimante par défaut. Sans
-- ce réglage, le vendeur devra valider la fenêtre — c'est un clic, pas une traversée de
-- magasin, mais ce n'est pas « rien ».

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_print_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,

  /**
   * Le poste destinataire, désigné par la PERSONNE connectée dessus. C'est le repère du
   * commerçant (« la caisse d'Awa ») et il suit l'employé s'il change de machine — ce
   * qu'un identifiant d'appareil ne ferait pas.
   */
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  /** Ce qu'il faut imprimer. Le contenu est reconstruit à l'arrivée, jamais recopié ici. */
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  /** Bon d'origine, pour retrouver le contexte dans l'historique. Facultatif. */
  handoff_id uuid REFERENCES public.pos_handoffs(id) ON DELETE SET NULL,
  paper_width_mm integer NOT NULL DEFAULT 80 CHECK (paper_width_mm IN (58, 80)),

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'printing', 'printed', 'failed')),

  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  /** Pris par le poste destinataire — c'est ce qui empêche deux onglets d'imprimer deux fois. */
  claimed_at timestamptz,
  printed_at timestamptz,
  /** Ce qui a échoué, pour que le caissier sache qu'il doit imprimer chez lui. */
  error text
);

COMMENT ON TABLE public.pos_print_jobs IS
  'Travaux d''impression adressés à un poste (module « Caisse à deux ») : le caissier '
  'envoie le ticket à l''imprimante du vendeur. Ne contient pas le ticket, seulement la '
  'vente à réimprimer.';

-- La requête du poste destinataire, jouée toutes les quelques secondes : mes travaux en
-- attente. Index partiel — la file vivante ne fait que quelques lignes.
CREATE INDEX IF NOT EXISTS idx_pos_print_jobs_pending
  ON public.pos_print_jobs (target_user_id, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pos_print_jobs_company
  ON public.pos_print_jobs (company_id, created_at DESC);

ALTER TABLE public.pos_print_jobs ENABLE ROW LEVEL SECURITY;

-- Lecture : les membres de l'entreprise. Le destinataire doit voir ce qu'on lui envoie,
-- et le caissier doit pouvoir suivre si son envoi a abouti.
DROP POLICY IF EXISTS "pos_print_jobs_select" ON public.pos_print_jobs;
CREATE POLICY "pos_print_jobs_select" ON public.pos_print_jobs FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Envoyer une impression à un poste
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_pos_print_job(
  p_sale_id uuid,
  p_target_user_id uuid,
  p_handoff_id uuid DEFAULT NULL,
  p_paper_width_mm integer DEFAULT 80
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_store uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT company_id, store_id INTO v_company, v_store
  FROM public.sales WHERE id = p_sale_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Vente introuvable.'; END IF;

  IF NOT public.has_store_access(v_store, v_company) THEN
    RAISE EXCEPTION 'Cette vente n''est pas dans vos boutiques.';
  END IF;
  IF NOT public.can_checkout_pos_handoffs(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''encaisser.';
  END IF;

  -- Le destinataire doit appartenir à l'entreprise : on n'envoie pas une impression chez
  -- quelqu'un d'autre, et surtout pas le contenu d'une vente.
  IF NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = p_target_user_id
      AND ucr.company_id = v_company
      AND ucr.is_active = true
  ) THEN
    RAISE EXCEPTION 'Ce poste n''appartient pas à votre entreprise.';
  END IF;

  INSERT INTO public.pos_print_jobs (
    company_id, store_id, target_user_id, sale_id, handoff_id, paper_width_mm, requested_by
  )
  VALUES (
    v_company, v_store, p_target_user_id, p_sale_id, p_handoff_id,
    CASE WHEN p_paper_width_mm = 58 THEN 58 ELSE 80 END,
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_pos_print_job IS
  'Envoie l''impression d''un ticket au poste d''un collègue (caisse à deux).';

REVOKE ALL ON FUNCTION public.create_pos_print_job(uuid, uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pos_print_job(uuid, uuid, uuid, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Prendre un travail — un seul onglet imprime
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Le vendeur a souvent deux onglets ouverts, ou l'application sur le PC ET sur le
 * téléphone. Sans prise atomique, le même ticket sortirait deux fois. Le `WHERE
 * status = 'pending'` de l'UPDATE tranche : un seul appelant obtient la ligne.
 */
CREATE OR REPLACE FUNCTION public.claim_pos_print_job(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  UPDATE public.pos_print_jobs
  SET status = 'printing', claimed_at = now()
  WHERE id = p_job_id
    AND status = 'pending'
    AND target_user_id = auth.uid();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pos_print_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pos_print_job(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Rendre compte
-- ─────────────────────────────────────────────────────────────────────────────
-- L'échec compte autant que le succès : c'est lui qui dit au caissier « imprime chez toi,
-- le poste d'en face n'a pas répondu ». Un envoi qui échoue en silence enverrait le
-- client dehors sans ticket.
CREATE OR REPLACE FUNCTION public.complete_pos_print_job(
  p_job_id uuid,
  p_ok boolean,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  UPDATE public.pos_print_jobs
  SET status = CASE WHEN COALESCE(p_ok, false) THEN 'printed' ELSE 'failed' END,
      printed_at = CASE WHEN COALESCE(p_ok, false) THEN now() ELSE printed_at END,
      error = CASE
                WHEN COALESCE(p_ok, false) THEN NULL
                ELSE NULLIF(btrim(COALESCE(p_error, '')), '')
              END
  WHERE id = p_job_id
    AND target_user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.complete_pos_print_job(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_pos_print_job(uuid, boolean, text) TO authenticated;
