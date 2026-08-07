-- Historique des notifications visible dans l'app (page /notifications) + Web Push.
--
-- La table `public.notifications` et sa RLS (`user_id = auth.uid()`) existent depuis
-- 00001/00002 ; ce fichier n'ajoute que ce qui manquait pour la consulter au quotidien :
-- les index de la liste « mes messages, les plus récents d'abord » et du compteur de non-lus.
-- La table `push_subscriptions` (endpoint unique, RLS par utilisateur) reste dans 00091.

-- Liste de l'utilisateur, triée par date : sans cet index, chaque ouverture de la page
-- scanne toute la table à mesure que les messages plateforme s'accumulent.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

-- Compteur de non-lus (pastille) : index partiel, il ne porte que sur les lignes non lues.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id)
  WHERE read_at IS NULL;

COMMENT ON TABLE public.notifications IS
  'Historique des notifications par utilisateur (page /notifications) — doublé d''un Web Push quand l''appareil est abonné (push_subscriptions).';
