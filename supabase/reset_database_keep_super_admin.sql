-- =============================================================================
-- RESET BASE : tout vider et ne garder que le compte super admin
-- =============================================================================
-- À exécuter dans le SQL Editor Supabase (Dashboard → SQL Editor).
-- Prérequis : au moins un profil avec is_super_admin = true (sinon tous les
-- utilisateurs seront supprimés et vous ne pourrez plus vous connecter).
-- =============================================================================

DO $$
DECLARE
  v_super_admin_id UUID;
  v_count_users int;
BEGIN
  -- Vérifier qu'un super admin existe
  SELECT id INTO v_super_admin_id
  FROM public.profiles
  WHERE is_super_admin = true
  LIMIT 1;

  IF v_super_admin_id IS NULL THEN
    RAISE EXCEPTION 'Aucun super admin trouvé (profiles.is_super_admin = true). Annulé pour éviter de tout supprimer.';
  END IF;

  -- 1. Messages landing (hors app métier)
  DELETE FROM public.landing_chat_messages;
  RAISE NOTICE 'landing_chat_messages vidé.';

  -- 2. Supprimer toutes les entreprises → CASCADE supprime tout le reste
  --    (company_settings, user_company_roles, stores, products, sales, etc.)
  DELETE FROM public.companies;
  RAISE NOTICE 'companies supprimées (cascade: boutiques, produits, ventes, achats, etc.).';

  -- 3. Audit et notifications (liés aux utilisateurs)
  DELETE FROM public.audit_logs;
  DELETE FROM public.notifications;
  RAISE NOTICE 'audit_logs et notifications vidés.';

  -- 4. Supprimer tous les utilisateurs auth SAUF le super admin
  --    (les profils des autres sont supprimés en CASCADE par auth.users)
  DELETE FROM auth.users
  WHERE id != v_super_admin_id;
  GET DIAGNOSTICS v_count_users = ROW_COUNT;
  RAISE NOTICE 'Utilisateurs auth supprimés (sauf super admin). Compte(s) retiré(s): %.', v_count_users;

  RAISE NOTICE 'Reset terminé. Seul le super admin (id: %) reste.', v_super_admin_id;
END $$;

-- =============================================================================
-- Ce qui reste après le reset :
-- - auth.users : 1 ligne (votre compte super admin)
-- - public.profiles : 1 ligne (is_super_admin = true)
-- - public.roles, public.permissions, public.role_permissions (données de référence)
-- - public.platform_settings (paramètres plateforme)
-- =============================================================================
-- Si "permission denied" sur auth.users : dans Supabase Cloud, exécutez ce script
-- via le SQL Editor (il utilise le rôle postgres). Si ça échoue encore, supprimez
-- les autres utilisateurs à la main dans Dashboard → Authentication → Users.
-- =============================================================================
