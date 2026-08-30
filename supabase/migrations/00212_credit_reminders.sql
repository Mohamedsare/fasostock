-- FasoStock — « Rappels de crédit » : l'application se souvient de ce que le commerçant oublie.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- LE PROBLÈME, TEL QU'IL SE VIT
-- ═════════════════════════════════════════════════════════════════════════════
-- Le crédit n'est pas un accident du commerce ici : c'est le commerce. On sert le
-- voisin, le collègue, le client de dix ans, et l'on note. La page Crédit sait déjà
-- parfaitement dire QUI DOIT COMBIEN — le problème n'a jamais été là.
--
-- Le problème est qu'il faut Y ALLER. Ouvrir l'application, choisir la page, lire la
-- liste. Un commerçant qui vend toute la journée ne le fait pas, et pas par négligence :
-- rien ne le lui rappelle. L'argent dort donc dehors pendant des mois, et se perd —
-- non pas parce que le client refuse de payer, mais parce que PERSONNE N'A REDEMANDÉ.
--
-- Ce module renverse le sens : ce n'est plus le commerçant qui va chercher
-- l'information, c'est elle qui vient à lui. Discrètement, à la fréquence qu'il choisit,
-- avec un message poli déjà écrit et prêt à partir.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- CE QUE CETTE MIGRATION AJOUTE, ET CE QU'ELLE NE TOUCHE PAS
-- ═════════════════════════════════════════════════════════════════════════════
-- ELLE AJOUTE une seule table : la MÉMOIRE des relances. Rien d'autre.
--
-- ELLE NE RECALCULE AUCUNE DETTE. Les montants dus se lisent là où ils ont toujours
--   été lus — les ventes et leurs `sale_payments`, agrégés par client
--   (`lib/features/credit/credit-math.ts`). Dupliquer ce calcul dans une table serait
--   créer un second chiffre, qui dériverait du premier, et le jour où les deux ne
--   diraient plus la même chose, plus personne ne saurait lequel croire.
--
-- ELLE NE RÉGLE PAS LA FRÉQUENCE. « Tous les jours », « tous les trois jours », « le
--   lundi » : c'est un réglage à plusieurs valeurs, qui change souvent, et dont
--   l'absence doit valoir « pas encore réglé » et non « faux ». Il vit dans
--   `company_settings` (clé `credit_reminders_config`), dont l'écriture est déjà
--   réservée au propriétaire depuis 00207.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POURQUOI GARDER UNE TRACE DES RELANCES
-- ═════════════════════════════════════════════════════════════════════════════
-- Trois raisons, et chacune suffirait :
--
--   1. NE PAS HARCELER. Relancer le même client trois fois dans la journée parce que
--      trois personnes ont ouvert l'application est la meilleure façon de le perdre.
--      La trace permet de dire « déjà relancé ce matin » et de se taire.
--
--   2. SAVOIR OÙ ON EN EST. « Je lui ai dit quand, déjà ? » est la question qui décide
--      si l'on relance gentiment ou si l'on passe le voir. Sans date, le commerçant
--      relance au hasard, donc trop ou pas assez.
--
--   3. REPORTER SANS OUBLIER. Un client prévient qu'il paiera après la récolte : on ne
--      veut plus le voir remonter chaque matin, mais on ne veut pas non plus l'oublier.
--      Le report (`snoozed`) est daté, et il expire tout seul.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La mémoire des relances
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.credit_reminders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,

  /**
   * `sent`    : une relance est partie (WhatsApp, appel, de vive voix).
   * `snoozed` : le client est mis de côté jusqu'à `snooze_until`.
   *
   * Deux natures dans une seule table, et c'est voulu : ce sont deux réponses à la
   * MÊME question (« qu'est-ce que j'ai fait pour ce client, et quand ? »). Les
   * séparer obligerait à lire deux tables et à fusionner deux historiques pour
   * afficher une seule ligne de temps.
   */
  kind text NOT NULL DEFAULT 'sent' CHECK (kind IN ('sent', 'snoozed')),

  /**
   * Par où la relance est passée. `app` = le commerçant a simplement pris acte du
   * rappel (il verra le client demain au marché) — ça compte aussi, sinon le rappel
   * reviendra le lendemain comme si de rien n'était.
   */
  channel text NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp', 'sms', 'call', 'app')),

  /**
   * Le montant dû À L'INSTANT DE LA RELANCE. Photo, et non calcul : c'est ce chiffre-là
   * qui a été annoncé au client. Le retrouver six mois plus tard, quand la dette a
   * changé trois fois, est la seule façon de savoir ce qui lui a été dit.
   */
  amount_due numeric(18, 4) NOT NULL DEFAULT 0 CHECK (amount_due >= 0),

  /** Le message envoyé, tel qu'envoyé. Sert à ne pas se répéter mot pour mot. */
  message text,
  /** Mot du commerçant : « il passe vendredi », « répond plus ». */
  note text,

  /** Renseigné seulement si `kind = 'snoozed'`. Expire tout seul. */
  snooze_until date,

  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.credit_reminders IS
  'Mémoire des relances de crédit : ce qui a été dit à quel client, quand, par quel '
  'canal, et pour quel montant à cet instant. Ne stocke AUCUNE dette — les montants '
  'dus restent calculés depuis les ventes.';
COMMENT ON COLUMN public.credit_reminders.amount_due IS
  'Photo du montant dû au moment de la relance (ce qui a été annoncé au client), pas '
  'un solde à jour.';

-- « Ce client, je l'ai relancé quand ? » — la requête de chaque ligne de la page.
CREATE INDEX IF NOT EXISTS idx_credit_reminders_customer
  ON public.credit_reminders(company_id, customer_id, created_at DESC);
-- « Qui est en report, et jusqu'à quand ? » — index partiel, donc minuscule.
CREATE INDEX IF NOT EXISTS idx_credit_reminders_snoozed
  ON public.credit_reminders(company_id, snooze_until)
  WHERE kind = 'snoozed';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Droit effectif
-- ─────────────────────────────────────────────────────────────────────────────
/*
 * Aucune permission nouvelle : relancer un client sur sa dette, c'est exactement ce
 * que fait déjà quiconque a la page Crédit (`credit.view`). Créer un droit de plus
 * obligerait chaque propriétaire à re-cocher une case pour la même personne, sur la
 * même information — et laisserait, entre-temps, un écran vide à qui a déjà tout vu.
 */
CREATE OR REPLACE FUNCTION public.can_send_credit_reminders(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR (
        EXISTS (
          SELECT 1 FROM public.companies
          WHERE id = p_company_id AND credit_reminders_enabled = true
        )
        AND (
          public.user_is_company_owner(p_company_id)
          OR ('credit.view' = ANY(public.get_my_permission_keys(p_company_id)))
        )
      );
$$;

COMMENT ON FUNCTION public.can_send_credit_reminders(uuid) IS
  'Droit d''enregistrer une relance de crédit. Exige le module ouvert par le '
  'propriétaire ET l''accès à la page Crédit (credit.view).';

GRANT EXECUTE ON FUNCTION public.can_send_credit_reminders(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.credit_reminders ENABLE ROW LEVEL SECURITY;

-- Lecture : tout membre de l'entreprise. Savoir qu'un collègue a déjà relancé Awa ce
-- matin est précisément ce qui évite de la relancer trois fois.
DROP POLICY IF EXISTS "credit_reminders_select" ON public.credit_reminders;
CREATE POLICY "credit_reminders_select" ON public.credit_reminders FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

/*
 * Écriture directe (sans RPC) : la ligne ne fait bouger ni argent ni stock, et le
 * `sent_by = auth.uid()` de la policy interdit déjà de signer une relance du nom d'un
 * collègue — ce qui est le seul abus imaginable ici. Un RPC n'apporterait qu'un
 * aller-retour de plus sur une page qui en fait déjà plusieurs.
 */
DROP POLICY IF EXISTS "credit_reminders_insert" ON public.credit_reminders;
CREATE POLICY "credit_reminders_insert" ON public.credit_reminders FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.can_send_credit_reminders(company_id)
  AND sent_by = auth.uid()
  -- Le client doit être celui de la maison : un identifiant glissé dans la requête ne
  -- doit pas rattacher une relance au fichier client du voisin.
  AND EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_id AND c.company_id = credit_reminders.company_id
  )
);

/*
 * Ni UPDATE ni DELETE. Une relance est un fait daté : « je lui ai dit mardi ». La
 * réécrire ou l'effacer, c'est perdre la seule chose que cette table sait faire. Une
 * erreur se corrige en ajoutant une ligne (`note`), pas en gommant la précédente.
 *
 * Un report qu'on veut lever se lève de la même façon : une nouvelle ligne `snoozed`
 * avec une date passée, ou simplement une relance envoyée — la page lit toujours la
 * plus récente.
 */

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Ce que la page lit pour ne pas harceler
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Dernière relance et report en cours, par client, en une seule lecture.
 *
 * Sans cette fonction, la page ferait un aller-retour par client pour savoir s'il faut
 * l'afficher — soit, sur cinquante débiteurs et une connexion de marché, un écran qui
 * met dix secondes à se décider. Ici, tout arrive d'un coup.
 *
 * `DISTINCT ON` : PostgreSQL rend la ligne la plus récente par client sans sous-requête
 * ni fenêtre, et l'index posé plus haut la sert directement.
 */
CREATE OR REPLACE FUNCTION public.credit_reminder_states(p_company_id uuid)
RETURNS TABLE (
  customer_id uuid,
  last_sent_at timestamptz,
  last_amount_due numeric,
  last_channel text,
  snoozed_until date,
  sent_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT r.*
    FROM public.credit_reminders r
    WHERE r.company_id = p_company_id
      AND (
        public.is_super_admin()
        OR p_company_id IN (SELECT * FROM public.current_user_company_ids())
      )
  ),
  last_sent AS (
    SELECT DISTINCT ON (s.customer_id)
      s.customer_id, s.created_at, s.amount_due, s.channel
    FROM scoped s
    WHERE s.kind = 'sent'
    ORDER BY s.customer_id, s.created_at DESC
  ),
  snoozes AS (
    -- Le report le plus LOINTAIN encore valable : deux reports successifs ne doivent
    -- pas se raccourcir l'un l'autre.
    SELECT s.customer_id, MAX(s.snooze_until) AS snooze_until
    FROM scoped s
    WHERE s.kind = 'snoozed' AND s.snooze_until IS NOT NULL
    GROUP BY s.customer_id
  ),
  counts AS (
    SELECT s.customer_id, COUNT(*)::int AS n
    FROM scoped s
    WHERE s.kind = 'sent'
    GROUP BY s.customer_id
  )
  SELECT
    COALESCE(l.customer_id, z.customer_id, c.customer_id),
    l.created_at,
    l.amount_due,
    l.channel,
    z.snooze_until,
    COALESCE(c.n, 0)
  FROM last_sent l
  FULL OUTER JOIN snoozes z ON z.customer_id = l.customer_id
  FULL OUTER JOIN counts  c ON c.customer_id = COALESCE(l.customer_id, z.customer_id);
$$;

COMMENT ON FUNCTION public.credit_reminder_states(uuid) IS
  'Par client : dernière relance envoyée, montant annoncé, canal, report en cours et '
  'nombre de relances. Une seule lecture pour toute la page Rappels de crédit.';

REVOKE ALL ON FUNCTION public.credit_reminder_states(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_reminder_states(uuid) TO authenticated;
