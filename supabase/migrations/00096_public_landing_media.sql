-- Medias publics de la landing (editable depuis Super Admin > GPublique).

CREATE TABLE IF NOT EXISTS public.public_landing_media (
  key TEXT PRIMARY KEY,
  image_url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.public_landing_media IS 'Medias publics de la landing FasoStock.';

ALTER TABLE public.public_landing_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_landing_media_select_public ON public.public_landing_media;
CREATE POLICY public_landing_media_select_public
ON public.public_landing_media
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS public_landing_media_write_super_admin ON public.public_landing_media;
CREATE POLICY public_landing_media_write_super_admin
ON public.public_landing_media
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

GRANT SELECT ON public.public_landing_media TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.public_landing_media TO authenticated;

INSERT INTO public.public_landing_media (key, image_url)
VALUES ('support_section_image', '')
ON CONFLICT (key) DO NOTHING;

