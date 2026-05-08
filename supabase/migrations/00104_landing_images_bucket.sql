-- FasoStock — Bucket Storage public pour les images de la landing page
-- (bannière hero, image accompagnement, logos partenaires, etc.).
-- Évite de stocker des Data URLs base64 dans `public_landing_settings`,
-- ce qui gonflait le HTML de la landing (>3 MB) et faisait échouer le cache.
INSERT INTO storage.buckets (id, name, public)
VALUES ('landing-images', 'landing-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "landing_images_public_read" ON storage.objects;
CREATE POLICY "landing_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'landing-images');

-- Seuls les super-admins peuvent écrire dans ce bucket.
DROP POLICY IF EXISTS "landing_images_super_admin_insert" ON storage.objects;
CREATE POLICY "landing_images_super_admin_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'landing-images' AND public.is_super_admin());

DROP POLICY IF EXISTS "landing_images_super_admin_update" ON storage.objects;
CREATE POLICY "landing_images_super_admin_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'landing-images' AND public.is_super_admin());

DROP POLICY IF EXISTS "landing_images_super_admin_delete" ON storage.objects;
CREATE POLICY "landing_images_super_admin_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'landing-images' AND public.is_super_admin());
