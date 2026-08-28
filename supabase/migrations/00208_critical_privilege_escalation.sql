-- 00208 — Deux élévations de privilèges. À appliquer en priorité sur tout le reste.
--
-- ============================================================================
-- FAILLE 1 (CRITIQUE) — `set_super_admin_profile` appelable par n'importe qui
-- ============================================================================
--
-- 00014 avait ouvert la fonction de bootstrap à trois rôles :
--
--   GRANT EXECUTE ON FUNCTION public.set_super_admin_profile(uuid, text) TO service_role;
--   GRANT EXECUTE ON FUNCTION public.set_super_admin_profile(uuid, text) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.set_super_admin_profile(uuid, text) TO anon;
--
-- 00109 a cru refermer avec :
--
--   REVOKE ALL ON FUNCTION public.set_super_admin_profile(uuid, text) FROM PUBLIC;
--
-- Ça ne referme rien. Dans PostgreSQL, `PUBLIC` est un pseudo-rôle : le révoquer
-- n'efface QUE le droit accordé à `PUBLIC`. Les deux `GRANT` nominatifs à `anon` et
-- `authenticated` de 00014 sont des privilèges distincts, et ils sont restés en place
-- depuis. Un `REVOKE ... FROM PUBLIC` ne retire jamais un `GRANT ... TO <role>`.
--
-- La fonction ne contient AUCUN contrôle d'appelant — c'est voulu, elle n'était censée
-- être appelable que par l'Edge Function `create-super-admin` en `service_role`. Elle
-- fait un `INSERT ... ON CONFLICT DO UPDATE SET is_super_admin = true` sur l'id qu'on
-- lui passe.
--
-- CONSÉQUENCE : la clé `anon` est publique (elle part dans le bundle du navigateur).
-- N'importe qui pouvait donc appeler, sans même avoir de compte :
--
--   POST /rest/v1/rpc/set_super_admin_profile
--   { "p_user_id": "<un id de auth.users>" }
--
-- et promouvoir ce compte super admin de toute la plateforme — donc accès à toutes les
-- entreprises clientes, à la console d'administration et au mode dépannage. Le chemin
-- le plus court était : créer un compte gratuit, lire son propre `sub` dans son JWT,
-- appeler la fonction sur soi-même.
--
-- Vérifié le 2026-08-28 sur la base de production, avec la clé `anon` et un UUID
-- inexistant : la réponse est `23503` (violation de clé étrangère `profiles_id_fkey`),
-- pas `42501` (permission refusée). La fonction s'exécutait bien ; seule la contrainte
-- vers `auth.users` a arrêté l'appel de test. Avec un id réel, elle aboutissait.
--
-- État au moment du correctif : un seul `profiles.is_super_admin = true` (MHDCODE7,
-- créé le 2026-03-09) — aucune trace d'exploitation.

REVOKE EXECUTE ON FUNCTION public.set_super_admin_profile(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_super_admin_profile(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_super_admin_profile(uuid, text) FROM PUBLIC;

-- Seul le service_role (Edge Function `create-super-admin`) garde le droit.
GRANT EXECUTE ON FUNCTION public.set_super_admin_profile(uuid, text) TO service_role;

COMMENT ON FUNCTION public.set_super_admin_profile(uuid, text) IS
  'Bootstrap super admin. AUCUN contrôle d''appelant : réservé à service_role (Edge Function '
  'create-super-admin). Ne jamais accorder à anon ni authenticated — voir 00208.';

-- ============================================================================
-- FAILLE 2 (ÉLEVÉE) — `ship_transfer` : la branche boutique → boutique ne
--                     vérifiait rien, et l'auteur du mouvement était falsifiable
-- ============================================================================
--
-- `ship_transfer(p_transfer_id, p_user_id)` est `SECURITY DEFINER` (donc hors RLS) et
-- accordée à `authenticated`. Sa dernière version (00122) ne contrôle l'appelant que
-- dans la branche « depuis le dépôt » :
--
--   IF v_transfer.from_warehouse THEN
--     IF NOT public.user_can_manage_company_warehouse(v_transfer.company_id) THEN ...
--
-- La branche **boutique → boutique**, elle, part directement décrémenter
-- `store_inventory` sans jamais demander à qui appartient le transfert. Et dans les
-- deux branches, `created_by` des mouvements vaut `p_user_id`, un paramètre fourni par
-- l'appelant — jamais confronté à `auth.uid()`.
--
-- Deux abus, du plus réaliste au plus lointain :
--
--  1. **Interne.** Un caissier lit les transferts de sa propre entreprise (la RLS le
--     lui permet), récupère un id, et appelle la RPC directement : le stock quitte la
--     boutique, et le mouvement est signé du nom qu'il choisit. C'est le contournement
--     complet des droits « transferts » — et une fraude difficile à lire après coup,
--     puisque l'historique désigne quelqu'un d'autre.
--  2. **Externe.** Un utilisateur d'une autre entreprise qui obtient un id de transfert
--     (UUID v4, donc non devinable — il faut une fuite) peut expédier le transfert
--     d'un tiers.
--
-- Le jumeau `receive_transfer` avait déjà reçu le bon traitement :
--
--   IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT * FROM current_user_company_ids())) ...
--   IF p_created_by IS DISTINCT FROM auth.uid() ...
--
-- `ship_transfer` ne l'a jamais reçu, alors même que 00122 s'appelle
-- « security_fixes_multi_warehouse ». On lui applique ici exactement la même règle.
--
-- MÉTHODE : on ne réécrit pas le corps (≈150 lignes de logique de stock, dont une
-- ligne recopiée de travers coûterait plus cher que la faille). On renomme l'existant
-- en `_unchecked`, on lui coupe tout accès direct, et on remet un `ship_transfer` de
-- même signature qui contrôle puis délègue.

-- `ALTER FUNCTION … RENAME` n'accepte pas de `IF EXISTS` : on garde la migration
-- rejouable en testant nous-mêmes. Sans ça, un second passage échoue sur un renommage
-- déjà fait et laisse la migration à moitié appliquée.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ship_transfer_unchecked'
  ) THEN
    ALTER FUNCTION public.ship_transfer(uuid, uuid) RENAME TO ship_transfer_unchecked;
  END IF;
END;
$do$;

-- Les privilèges suivent l'OID, pas le nom : le renommage a emporté le GRANT à
-- `authenticated`. C'est précisément ce qu'on retire ici.
REVOKE ALL ON FUNCTION public.ship_transfer_unchecked(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ship_transfer_unchecked(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ship_transfer_unchecked(uuid, uuid) FROM authenticated;

COMMENT ON FUNCTION public.ship_transfer_unchecked(uuid, uuid) IS
  'Corps historique de ship_transfer, SANS contrôle d''appelant. Non appelable : passer '
  'par public.ship_transfer, qui vérifie l''entreprise et l''identité (00208).';

CREATE OR REPLACE FUNCTION public.ship_transfer(
  p_transfer_id uuid,
  p_user_id     uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  -- L'auteur du mouvement de stock ne se déclare pas, il se constate.
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Expéditeur invalide : le mouvement doit être enregistré au nom de l''utilisateur connecté.';
  END IF;

  SELECT company_id INTO v_company
  FROM public.stock_transfers
  WHERE id = p_transfer_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Transfert non trouvé';
  END IF;

  IF NOT (v_company IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : ce transfert n''appartient pas à votre entreprise.';
  END IF;

  -- Le reste des règles (statut, droit dépôt, stock disponible, portée produit) est
  -- inchangé et vit toujours dans le corps historique.
  PERFORM public.ship_transfer_unchecked(p_transfer_id, p_user_id);
END;
$$;

COMMENT ON FUNCTION public.ship_transfer(uuid, uuid) IS
  'Expédie un transfert après vérification de l''entreprise de l''appelant et de son identité, '
  'puis délègue à ship_transfer_unchecked. Aligné sur receive_transfer (00208).';

GRANT EXECUTE ON FUNCTION public.ship_transfer(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Limite connue, à traiter séparément
-- ---------------------------------------------------------------------------
-- Le contrôle posé ici est l'**appartenance** à l'entreprise, pas la permission
-- « transferts » elle-même — c'est le niveau qu'applique déjà `receive_transfer`, et
-- s'en écarter dans la même migration risquerait de bloquer des expéditions
-- légitimes. Un caissier de l'entreprise peut donc toujours expédier un transfert de
-- SA maison. Le durcir à `has_permission(v_company, 'transfers.manage')` demande
-- d'abord de vérifier quels rôles portent réellement cette permission en production.
