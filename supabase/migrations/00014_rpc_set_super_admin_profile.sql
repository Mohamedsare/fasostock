-- RPC pour créer/mettre à jour un profil avec is_super_admin = true.
-- Utilisée par l'Edge Function create-super-admin (service role).
-- S'exécute en SECURITY DEFINER pour contourner les politiques RLS sur profiles.

CREATE OR REPLACE FUNCTION public.set_super_admin_profile(
  p_user_id uuid,
  p_full_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, is_super_admin, created_at, updated_at)
  VALUES (
    p_user_id,
    COALESCE(NULLIF(TRIM(p_full_name), ''), 'Super Admin'),
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(NULLIF(TRIM(EXCLUDED.full_name), ''), profiles.full_name),
    is_super_admin = true,
    updated_at = now();
END;
$$;

-- Rôle service_role doit pouvoir appeler la RPC (Supabase l’utilise pour les Edge Functions)
GRANT EXECUTE ON FUNCTION public.set_super_admin_profile(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_super_admin_profile(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_super_admin_profile(uuid, text) TO anon;
