-- FasoStock — Durcissement Storage : scoping des uploads (INSERT) par entreprise.
--
-- Contexte (audit sécurité 31/07/2026, suite de 00130) : la migration 00130 a
-- fermé UPDATE/DELETE cross-tenant sur `product-images` / `store-logos`, mais
-- l'INSERT restait ouvert à TOUT utilisateur authentifié :
--     WITH CHECK (bucket_id = '…' AND auth.role() = 'authenticated')
-- → un utilisateur de l'entreprise A pouvait déposer un fichier arbitraire dans
--   le dossier {productId}/ ou {storeId}/ de n'importe quelle autre entreprise
--   (buckets publics en lecture : hébergement de contenu illicite sous le nom de
--   domaine, pollution des dossiers, consommation du quota de stockage).
--
-- Conventions de chemin — IDENTIQUES web ET Flutter, ne pas changer :
--   product-images : {productId}/{timestamp}.{ext}
--   store-logos    : {storeId}/{timestamp}.{ext}
--                et  company/{companyId}/{timestamp}.{ext}
-- Dans les deux clients, l'upload a toujours lieu APRÈS création de la ligne
-- (produit / boutique / entreprise) → les vérifications ci-dessous ne cassent
-- aucun flux existant.
--
-- SELECT (lecture publique) reste inchangé : les images doivent rester
-- affichables sans authentification (tickets, catalogue, landing).

-- ---------------------------------------------------------------------------
-- 1) product-images : upload réservé au propriétaire du produit
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "product_images_authenticated_upload" ON storage.objects;
CREATE POLICY "product_images_owner_upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    -- Extension image uniquement : bloque le dépôt de .html/.js/.pdf/.zip…
    AND name ~* '\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?|svg)$'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.products p
        WHERE (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND p.id = ((storage.foldername(name))[1])::uuid
          AND p.company_id IN (SELECT * FROM public.current_user_company_ids())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2) store-logos : upload réservé à l'entreprise propriétaire
-- ---------------------------------------------------------------------------
-- Deux schémas de chemin sont acceptés (cf. en-tête) : logo de boutique et
-- logo d'entreprise. Chacun est rattaché à l'entreprise de l'utilisateur.
DROP POLICY IF EXISTS "store_logos_authenticated_upload" ON storage.objects;
CREATE POLICY "store_logos_owner_upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'store-logos'
    AND name ~* '\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?|svg)$'
    AND (
      public.is_super_admin()
      -- Schéma 1 : {storeId}/… — la boutique doit appartenir à l'entreprise.
      OR EXISTS (
        SELECT 1 FROM public.stores s
        WHERE (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND s.id = ((storage.foldername(name))[1])::uuid
          AND s.company_id IN (SELECT * FROM public.current_user_company_ids())
      )
      -- Schéma 2 : company/{companyId}/…
      OR (
        (storage.foldername(name))[1] = 'company'
        AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND ((storage.foldername(name))[2])::uuid IN (SELECT * FROM public.current_user_company_ids())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Plafond de taille par fichier (anti-DoS quota)
-- ---------------------------------------------------------------------------
-- 25 Mo : très au-dessus d'une photo de téléphone (≈ 3-12 Mo), donc aucun
-- upload légitime n'est refusé. On ne fixe volontairement PAS
-- `allowed_mime_types` : le Content-Type est fourni par le client (Flutter peut
-- envoyer application/octet-stream) — le filtrage se fait sur l'extension dans
-- les policies ci-dessus, qui ne dépend d'aucun comportement client.
UPDATE storage.buckets
SET file_size_limit = 26214400
WHERE id IN ('product-images', 'store-logos')
  AND (file_size_limit IS NULL OR file_size_limit > 26214400);
