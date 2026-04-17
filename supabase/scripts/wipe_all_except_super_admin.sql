-- =============================================================================
-- WIPE: Supprime toutes les données sauf le(s) super admin de la plateforme.
-- À exécuter manuellement dans le SQL Editor Supabase (pas une migration).
-- =============================================================================
-- Conserve : profiles où is_super_admin = true, roles, permissions, role_permissions, platform_settings.
-- Supprime : tout le reste (entreprises, boutiques, ventes, produits, etc.).
-- Note : Les utilisateurs Auth (auth.users) ne sont PAS supprimés par ce script.
--        Pour supprimer les comptes non super-admin : Supabase Dashboard > Authentication > Users.
-- =============================================================================

BEGIN;

-- 1) Enfants des ventes
DELETE FROM public.sale_return_items;
DELETE FROM public.sale_returns;
DELETE FROM public.sale_payments;
DELETE FROM public.sale_items;
DELETE FROM public.sales;

-- 2) Caisse
DELETE FROM public.cash_movements;
DELETE FROM public.cash_register_sessions;

-- 3) Stock / inventaire
DELETE FROM public.stock_movements;
DELETE FROM public.stock_adjustments;
DELETE FROM public.inventory_session_items;
DELETE FROM public.inventory_sessions;
DELETE FROM public.store_inventory;
DELETE FROM public.product_store_settings;

-- 4) Achats
DELETE FROM public.purchase_payments;
DELETE FROM public.purchase_items;
DELETE FROM public.purchases;

-- 5) Transferts
DELETE FROM public.stock_transfer_items;
DELETE FROM public.stock_transfers;

-- 6) Demandes d'augmentation de boutiques
DELETE FROM public.store_increase_requests;

-- 7) Assignations utilisateur / entreprise
DELETE FROM public.user_store_assignments;
DELETE FROM public.user_company_roles;

-- 8) Audit & notifications
DELETE FROM public.audit_logs;
DELETE FROM public.notifications;

-- 9) IA / prédictions
DELETE FROM public.ai_requests;
DELETE FROM public.ai_insights_cache;
DELETE FROM public.forecast_snapshots;

-- 10) Catalogue
DELETE FROM public.product_images;
DELETE FROM public.products;
DELETE FROM public.categories;
DELETE FROM public.brands;
DELETE FROM public.customers;
DELETE FROM public.suppliers;

-- 11) Boutiques & entreprises
DELETE FROM public.stores;
DELETE FROM public.company_settings;
DELETE FROM public.companies;

-- 12) Landing (chat)
DELETE FROM public.landing_chat_messages;

-- 13) Profils : ne garder que le(s) super admin
DELETE FROM public.profiles
WHERE is_super_admin = false;

-- On ne touche pas à : roles, permissions, role_permissions, platform_settings

COMMIT;

-- =============================================================================
-- Vérification rapide (optionnel) :
--   SELECT id, full_name, is_super_admin FROM public.profiles;
--   => doit lister uniquement le(s) super admin.
-- =============================================================================
