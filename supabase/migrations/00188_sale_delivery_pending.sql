-- FasoStock — « Payé, mais pas encore emporté » : le statut de RETRAIT d'une vente.
--
-- Le cas, quotidien et aujourd'hui non traçable : le client choisit, il paie, puis il
-- repart sans la marchandise. Il revient « ce soir », « samedi », « avec le taxi », « quand
-- mon frère aura le tricycle ». Entre-temps, la vente est enregistrée comme n'importe
-- quelle autre : rien, nulle part, ne dit que trois sacs de ciment attendent derrière le
-- comptoir au nom de quelqu'un. Le commerçant tient la liste dans sa tête ou sur un cahier —
-- et le jour où il n'est pas là, personne ne sait à qui appartient quoi. Deux issues
-- classiques : la marchandise est revendue à un autre client, ou elle dort six mois.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QU'ON NE FAIT PAS, ET POURQUOI
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. On ne crée PAS un nouveau statut de vente (`sales.status`). Cette vente est
--    complétée : l'argent est encaissé, elle compte dans le chiffre d'affaires, dans la
--    caisse du jour, dans le bénéfice, dans la comptabilité. Un statut « en attente »
--    la sortirait de tous ces totaux — donc ferait mentir la caisse du soir pour décrire
--    un simple problème de logistique.
--
-- 2. On ne touche PAS au stock. `create_sale_with_stock` a déjà décrémenté à
--    l'encaissement, et c'est le bon choix : la marchandise est VENDUE, elle n'est plus
--    disponible à la vente même si elle est encore physiquement dans la boutique. La
--    remettre en stock jusqu'au retrait la rendrait re-vendable — c'est exactement
--    l'accident qu'on veut empêcher. Conséquence à assumer et à dire au commerçant : au
--    comptage d'inventaire, ces articles sont physiquement présents et absents du stock
--    théorique. Ils doivent être mis à part (carton « retraits »), pas rangés en rayon.
--
-- Ce qui manque n'est donc ni un statut de vente ni un mouvement de stock : c'est une
-- LIGNE DE SUIVI. Trois questions, trois réponses :
--   • Cette vente est-elle emportée ?      → `delivery_state`
--   • Depuis quand attend-elle, pour quand → `delivery_marked_at`, `delivery_due_at`
--   • Qui a remis, et quand ?              → `delivered_by`, `delivered_at`
--
-- La dernière ligne est celle qui compte le jour du litige. « Je ne l'ai jamais reçu » se
-- répond avec un nom et une heure, pas avec un souvenir.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Les colonnes de suivi
-- ─────────────────────────────────────────────────────────────────────────────
-- Défaut `'delivered'` : la quasi-totalité des ventes sont emportées immédiatement. Tout
-- l'historique existant bascule donc du bon côté sans aucune reprise de données, et une
-- vente ne devient « en attente » que si quelqu'un le dit explicitement.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS delivery_state text NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS delivery_due_at date,
  ADD COLUMN IF NOT EXISTS delivery_note text,
  ADD COLUMN IF NOT EXISTS delivery_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_marked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_delivery_state_check'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_delivery_state_check
      CHECK (delivery_state IN ('delivered', 'pending'));
  END IF;
END $$;

COMMENT ON COLUMN public.sales.delivery_state IS
  'Retrait de la marchandise : « delivered » = emportée (cas normal, valeur par défaut), '
  '« pending » = payée mais laissée en boutique. N''affecte NI le statut de la vente, NI '
  'le stock (déjà décrémenté à l''encaissement) : c''est un suivi logistique.';
COMMENT ON COLUMN public.sales.delivery_due_at IS
  'Date à laquelle le client a annoncé venir chercher. Facultative — sert à repérer les '
  'retraits en retard.';
COMMENT ON COLUMN public.sales.delivery_note IS
  'Précision libre : ce qui reste à remettre, où c''est rangé, qui viendra le chercher.';
COMMENT ON COLUMN public.sales.delivery_marked_at IS
  'Mise en attente : depuis quand la marchandise dort en boutique.';
COMMENT ON COLUMN public.sales.delivered_at IS
  'Remise effective au client. Renseigné uniquement si la vente est passée par l''attente — '
  'une vente emportée sur-le-champ n''a rien à prouver.';
COMMENT ON COLUMN public.sales.delivered_by IS
  'Qui a remis la marchandise. La réponse au « je ne l''ai jamais reçu » de plus tard.';

-- Index partiel : la liste « à retirer » interroge quelques dizaines de lignes au milieu
-- de dizaines de milliers de ventes. Seules les lignes en attente sont indexées — l'index
-- reste minuscule et ne coûte rien aux ventes ordinaires.
CREATE INDEX IF NOT EXISTS idx_sales_delivery_pending
  ON public.sales (company_id, store_id, delivery_marked_at DESC)
  WHERE delivery_state = 'pending';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Marquer / démarquer — par RPC, jamais par un UPDATE du client
-- ─────────────────────────────────────────────────────────────────────────────
-- La politique `sales_update` (00002) laisse tout membre de la boutique modifier une vente :
-- un UPDATE direct depuis l'application marcherait. Mais alors `delivered_by` serait ce que
-- le client aurait bien voulu écrire. Une trace que l'appelant choisit n'est pas une trace :
-- l'auteur et l'heure sont posés ICI, à partir de `auth.uid()` et `now()`.
--
-- Qui a le droit : le propriétaire, ou celui qui peut vendre (`sales.create`) ou corriger
-- une vente (`sales.update`). Remettre un sac de ciment est un geste de comptoir — le
-- caissier qui a encaissé doit pouvoir le pointer. L'acte ne déplace ni argent ni stock.
CREATE OR REPLACE FUNCTION public.sale_set_delivery_state(
  p_sale_id uuid,
  p_state text,
  p_due_at date DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_store uuid;
  v_status sale_status;
  v_state text := lower(btrim(COALESCE(p_state, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF v_state NOT IN ('delivered', 'pending') THEN
    RAISE EXCEPTION 'Statut de retrait inconnu.';
  END IF;

  SELECT company_id, store_id, status
    INTO v_company, v_store, v_status
  FROM public.sales
  WHERE id = p_sale_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Vente introuvable.';
  END IF;

  IF NOT public.is_super_admin() THEN
    IF v_company NOT IN (SELECT * FROM public.current_user_company_ids())
       OR v_store NOT IN (SELECT * FROM public.current_user_store_ids(v_company))
    THEN
      RAISE EXCEPTION 'Cette vente n''est pas dans vos boutiques.';
    END IF;

    IF NOT (
      public.user_is_company_owner(v_company)
      OR public.user_has_company_permission(v_company, 'sales.create')
      OR public.user_has_company_permission(v_company, 'sales.update')
    ) THEN
      RAISE EXCEPTION 'Vous n''avez pas le droit de suivre les retraits.';
    END IF;
  END IF;

  -- Une vente annulée n'a plus de marchandise à remettre (le stock est revenu) et une
  -- vente en brouillon n'a rien encaissé. Le suivi de retrait ne concerne qu'une vente
  -- réellement conclue.
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'Seule une vente complétée peut suivre un retrait.';
  END IF;

  IF v_state = 'pending' THEN
    UPDATE public.sales
    SET delivery_state      = 'pending',
        delivery_due_at     = p_due_at,
        delivery_note       = NULLIF(btrim(COALESCE(p_note, '')), ''),
        delivery_marked_at  = COALESCE(delivery_marked_at, now()),
        delivery_marked_by  = COALESCE(delivery_marked_by, auth.uid()),
        -- Retour en attente après une remise (erreur de pointage, reprise) : l'ancienne
        -- remise ne vaut plus, elle ne doit pas rester affichée comme acquise.
        delivered_at        = NULL,
        delivered_by        = NULL
    WHERE id = p_sale_id;
  ELSE
    UPDATE public.sales
    SET delivery_state = 'delivered',
        delivered_at   = now(),
        delivered_by   = auth.uid(),
        -- `delivery_note` / `delivery_due_at` sont conservés : ils racontent l'attente
        -- qui vient de se terminer. Les effacer effacerait l'histoire au moment précis
        -- où elle devient vérifiable.
        delivery_due_at = COALESCE(p_due_at, delivery_due_at),
        delivery_note   = COALESCE(NULLIF(btrim(COALESCE(p_note, '')), ''), delivery_note)
    WHERE id = p_sale_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.sale_set_delivery_state(uuid, text, date, text) IS
  'Marque une vente complétée « à retirer » (pending) ou « remise » (delivered). Pose '
  'lui-même l''auteur et l''heure : le client ne les choisit pas.';

GRANT EXECUTE ON FUNCTION public.sale_set_delivery_state(uuid, text, date, text) TO authenticated;
