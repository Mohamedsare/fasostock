-- FasoStock — Bannière hero de la landing : support vidéo (en plus des images).
-- 1) Le bucket public `landing-images` doit accepter les vidéos et des fichiers
--    plus lourds (une vidéo de bannière peut dépasser la limite par défaut).
-- 2) Nouvelle clé de réglage `hero_banner_media_type` ('image' | 'video') pour
--    que la landing sache rendre <img> ou <video>.

-- 100 Mo max par fichier — suffisant pour une courte vidéo de bannière optimisée.
UPDATE storage.buckets
SET
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY[
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'
  ]
WHERE id = 'landing-images';

INSERT INTO public.public_landing_settings (key, value) VALUES
  ('hero_banner_media_type', 'image')
ON CONFLICT (key) DO NOTHING;
