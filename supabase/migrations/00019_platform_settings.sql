-- Paramètres plateforme (super admin uniquement).

CREATE TABLE public.platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_settings IS 'Paramètres globaux de la plateforme (nom, contact, options).';

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_settings_select_super_admin" ON public.platform_settings
  FOR SELECT TO authenticated USING (is_super_admin());

CREATE POLICY "platform_settings_update_super_admin" ON public.platform_settings
  FOR UPDATE TO authenticated USING (is_super_admin());

CREATE POLICY "platform_settings_insert_super_admin" ON public.platform_settings
  FOR INSERT TO authenticated WITH CHECK (is_super_admin());

GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO authenticated;

-- Valeurs par défaut optionnelles (clés utilisées par l'app)
INSERT INTO public.platform_settings (key, value) VALUES
  ('platform_name', 'FasoStock'),
  ('contact_email', ''),
  ('contact_phone', ''),
  ('contact_whatsapp', '+226 64 71 20 44'),
  ('registration_enabled', 'true'),
  ('landing_chat_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
