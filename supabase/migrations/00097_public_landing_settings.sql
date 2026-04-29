-- Paramètres publics de la landing (lisibles publiquement, modifiables par super admin).

CREATE TABLE IF NOT EXISTS public.public_landing_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.public_landing_settings IS 'Réglages publics de la landing FasoStock.';

ALTER TABLE public.public_landing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_landing_settings_select_public ON public.public_landing_settings;
CREATE POLICY public_landing_settings_select_public
ON public.public_landing_settings
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS public_landing_settings_write_super_admin ON public.public_landing_settings;
CREATE POLICY public_landing_settings_write_super_admin
ON public.public_landing_settings
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

GRANT SELECT ON public.public_landing_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.public_landing_settings TO authenticated;

INSERT INTO public.public_landing_settings (key, value) VALUES
  ('hero_banner_image_url', ''),
  ('footer_whatsapp_url', 'https://wa.me/22603079618'),
  ('footer_facebook_url', 'https://facebook.com'),
  ('footer_youtube_url', 'https://youtube.com'),
  ('footer_tiktok_url', 'https://tiktok.com'),
  ('footer_linkedin_url', 'https://linkedin.com'),
  ('pricing_trial_days', '7'),
  ('pricing_monthly_amount', '15000'),
  ('pricing_yearly_amount', '125000'),
  ('pricing_yearly_savings', '55000'),
  ('support_whatsapp_url', '/help'),
  ('support_demo_url', '/help')
ON CONFLICT (key) DO NOTHING;

