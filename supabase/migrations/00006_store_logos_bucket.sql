-- FasoStock — Bucket Storage pour logos de boutiques
INSERT INTO storage.buckets (id, name, public)
VALUES ('store-logos', 'store-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Policies pour store-logos
DROP POLICY IF EXISTS "store_logos_public_read" ON storage.objects;
CREATE POLICY "store_logos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'store-logos');

DROP POLICY IF EXISTS "store_logos_authenticated_upload" ON storage.objects;
CREATE POLICY "store_logos_authenticated_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'store-logos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "store_logos_authenticated_update" ON storage.objects;
CREATE POLICY "store_logos_authenticated_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'store-logos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "store_logos_authenticated_delete" ON storage.objects;
CREATE POLICY "store_logos_authenticated_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'store-logos' AND auth.role() = 'authenticated');
