-- FasoStock — Correctif de 00166 (uploads Storage refusés à tort).
--
-- Deux défauts de 00166, corrigés ici :
--
-- 1) FILTRE D'EXTENSION TROP STRICT. La policy exigeait une extension d'une
--    allowlist. Or Chrome sous Windows enregistre couramment les JPEG en
--    `.jfif`, et d'autres sources produisent `.jpe` ou aucune extension →
--    « new row violates row-level security policy » sur des images légitimes.
--    Ce filtre est SUPPRIMÉ : il n'apportait qu'un durcissement marginal
--    (les buckets sont servis depuis le domaine Supabase, pas le nôtre) pour
--    un risque de blocage élevé. L'assainissement se fait côté client dans
--    `lib/utils/image-file.ts`, sans jamais refuser un upload.
--
-- 2) SOUS-REQUÊTE FRAGILE. La policy lisait `public.products` / `public.stores`
--    directement : le résultat dépendait alors de la RLS et des privilèges de
--    ces tables telles qu'évaluées depuis le service Storage. On passe par des
--    fonctions SECURITY DEFINER, qui rendent la vérification déterministe —
--    c'est `auth.uid()` seul qui décide, comme partout ailleurs.
--
-- Le cloisonnement par entreprise (l'objet réel de 00166) est conservé
-- intégralement, ainsi que le plafond de taille.

-- ---------------------------------------------------------------------------
-- 1) Helpers — SECURITY DEFINER : contournent la RLS des tables lues, mais
--    restent liés à l'utilisateur courant via current_user_company_ids().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_write_product_image(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.products p
    WHERE (storage.foldername(object_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND p.id = ((storage.foldername(object_name))[1])::uuid
      AND p.company_id IN (SELECT * FROM public.current_user_company_ids())
  );
$$;

-- store-logos accepte deux schémas de chemin (web ET Flutter) :
--   {storeId}/…            → logo de boutique
--   company/{companyId}/…  → logo d'entreprise
CREATE OR REPLACE FUNCTION public.can_write_store_logo(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE (storage.foldername(object_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND s.id = ((storage.foldername(object_name))[1])::uuid
        AND s.company_id IN (SELECT * FROM public.current_user_company_ids())
    )
    OR (
      (storage.foldername(object_name))[1] = 'company'
      AND (storage.foldername(object_name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND ((storage.foldername(object_name))[2])::uuid IN (SELECT * FROM public.current_user_company_ids())
    );
$$;

REVOKE ALL ON FUNCTION public.can_write_product_image(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write_store_logo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_product_image(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_store_logo(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Policies d'upload — sans filtre d'extension
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "product_images_owner_upload" ON storage.objects;
CREATE POLICY "product_images_owner_upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images' AND public.can_write_product_image(name)
  );

DROP POLICY IF EXISTS "store_logos_owner_upload" ON storage.objects;
CREATE POLICY "store_logos_owner_upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'store-logos' AND public.can_write_store_logo(name)
  );

-- ---------------------------------------------------------------------------
-- 3) Même traitement pour UPDATE/DELETE (posées par 00130)
-- ---------------------------------------------------------------------------
-- Ces policies portaient la même sous-requête fragile. Aucun flux de l'app ne
-- les exerce aujourd'hui (le web supprime la ligne `product_images`, pas
-- l'objet), donc le défaut serait passé inaperçu jusqu'au jour où un nettoyage
-- de fichiers échouerait sans raison apparente.
DROP POLICY IF EXISTS "product_images_owner_update" ON storage.objects;
CREATE POLICY "product_images_owner_update" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'product-images' AND public.can_write_product_image(name))
  WITH CHECK (bucket_id = 'product-images' AND public.can_write_product_image(name));

DROP POLICY IF EXISTS "product_images_owner_delete" ON storage.objects;
CREATE POLICY "product_images_owner_delete" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'product-images' AND public.can_write_product_image(name));
