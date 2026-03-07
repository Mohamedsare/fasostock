-- FasoStock - Bucket Storage pour uploads (logos boutique, photos produits)
-- Si la création du bucket échoue (schéma read-only), créez-le à la main :
-- Dashboard Supabase > Storage > New bucket > Name: uploads > Public: Yes

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'uploads') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('uploads', 'uploads', true);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Créez le bucket "uploads" manuellement dans Storage (Dashboard).';
END $$;

-- RLS : autoriser les utilisateurs authentifiés à uploader dans uploads
DROP POLICY IF EXISTS "Authenticated users can upload to uploads" ON storage.objects;
CREATE POLICY "Authenticated users can upload to uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'uploads');

-- RLS : lecture publique du bucket (URLs publiques)
DROP POLICY IF EXISTS "Public read for uploads bucket" ON storage.objects;
CREATE POLICY "Public read for uploads bucket"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'uploads');

-- RLS : mise à jour / suppression par les authentifiés
DROP POLICY IF EXISTS "Authenticated users can update uploads" ON storage.objects;
CREATE POLICY "Authenticated users can update uploads"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'uploads');

DROP POLICY IF EXISTS "Authenticated users can delete uploads" ON storage.objects;
CREATE POLICY "Authenticated users can delete uploads"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'uploads');
