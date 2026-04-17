-- 2FA (TOTP) pour les owners : secret stocké de manière sécurisée.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.totp_secret_encrypted IS 'Secret TOTP chiffré (2FA). Vide si 2FA désactivé.';
COMMENT ON COLUMN public.profiles.totp_enabled_at IS 'Date d''activation de la 2FA.';
