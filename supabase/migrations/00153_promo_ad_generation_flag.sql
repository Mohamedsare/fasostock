-- Flag GLOBAL (super admin) : génération d'affiches publicitaires IA sur les promotions.
-- Un seul interrupteur pour TOUTES les entreprises. Désactivé par défaut.

INSERT INTO public.platform_settings (key, value)
VALUES ('promo_ad_generation_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- `platform_settings` n'est lisible que par le super admin (RLS). Cette fonction expose
-- UNIQUEMENT ce booléen aux utilisateurs authentifiés (pour afficher/masquer le bouton).
CREATE OR REPLACE FUNCTION public.promo_ad_generation_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value = 'true' FROM public.platform_settings WHERE key = 'promo_ad_generation_enabled'),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.promo_ad_generation_enabled() TO authenticated;
