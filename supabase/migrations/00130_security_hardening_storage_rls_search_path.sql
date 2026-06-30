-- Durcissement sécurité (audit) — 100 % additif, sans changement de comportement métier.
--
-- 1) RLS sur login_attempt_tracking (table de sécurité accédée uniquement via RPC
--    SECURITY DEFINER ; aucune GRANT directe, aucun accès client direct).
-- 2) search_path figé sur les helpers d'isolation tenant (anti search_path mutable).
-- 3) Storage : restreindre UPDATE/DELETE des buckets publics au périmètre légitime
--    (avant : tout utilisateur authentifié pouvait remplacer/supprimer les images
--    produits et logos de N'IMPORTE QUELLE entreprise). Les uploads (INSERT) et la
--    lecture publique (SELECT) restent inchangés → aucun flux applicatif cassé
--    (le client n'appelle jamais .remove()/.update() sur ces buckets).

-- ---------------------------------------------------------------------------
-- 1) RLS sur login_attempt_tracking (deny-all direct ; RPC SECURITY DEFINER OK)
-- ---------------------------------------------------------------------------
ALTER TABLE public.login_attempt_tracking ENABLE ROW LEVEL SECURITY;
-- Aucune policy : tout accès direct PostgREST est refusé. Les fonctions
-- record_failed_login / get_login_lock_status / reset_login_attempts /
-- admin_* (SECURITY DEFINER) continuent de fonctionner normalement.

-- ---------------------------------------------------------------------------
-- 2) search_path figé sur les helpers d'isolation (corps inchangé)
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.current_user_company_ids() SET search_path = public;
ALTER FUNCTION public.is_super_admin() SET search_path = public;
ALTER FUNCTION public.current_user_store_ids(uuid) SET search_path = public;
ALTER FUNCTION public.has_store_access(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.get_my_role_slug(uuid) SET search_path = public;

-- ---------------------------------------------------------------------------
-- 3) Storage : durcir UPDATE/DELETE des buckets publics
-- ---------------------------------------------------------------------------
-- product-images : chemin = {productId}/{fichier}. On autorise modif/suppression
-- seulement au super-admin ou au propriétaire (produit appartenant à l'entreprise).
DROP POLICY IF EXISTS "product_images_authenticated_update" ON storage.objects;
CREATE POLICY "product_images_owner_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'product-images' AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.products p
        WHERE (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND p.id = ((storage.foldername(name))[1])::uuid
          AND p.company_id IN (SELECT * FROM public.current_user_company_ids())
      )
    )
  )
  WITH CHECK (
    bucket_id = 'product-images' AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.products p
        WHERE (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND p.id = ((storage.foldername(name))[1])::uuid
          AND p.company_id IN (SELECT * FROM public.current_user_company_ids())
      )
    )
  );

DROP POLICY IF EXISTS "product_images_authenticated_delete" ON storage.objects;
CREATE POLICY "product_images_owner_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'product-images' AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.products p
        WHERE (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND p.id = ((storage.foldername(name))[1])::uuid
          AND p.company_id IN (SELECT * FROM public.current_user_company_ids())
      )
    )
  );

-- store-logos : chemins {storeId}/… et company/{companyId}/… (deux schémas).
-- Le client n'effectue jamais de modif/suppression → on réserve ces opérations au
-- super-admin (ferme la falsification cross-tenant sans rien casser).
DROP POLICY IF EXISTS "store_logos_authenticated_update" ON storage.objects;
CREATE POLICY "store_logos_super_admin_update" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'store-logos' AND public.is_super_admin())
  WITH CHECK (bucket_id = 'store-logos' AND public.is_super_admin());

DROP POLICY IF EXISTS "store_logos_authenticated_delete" ON storage.objects;
CREATE POLICY "store_logos_super_admin_delete" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'store-logos' AND public.is_super_admin());
