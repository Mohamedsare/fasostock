-- Donner les droits super admin à un utilisateur déjà connecté.
-- À exécuter dans le SQL Editor Supabase.
-- Remplacez l'email ci-dessous par le vôtre (celui avec lequel vous vous connectez).

DO $$
DECLARE
  v_user_id UUID;
  v_name TEXT;
BEGIN
  -- Récupérer l'id et le nom de l'utilisateur (auth.users)
  SELECT id, raw_user_meta_data->>'full_name' INTO v_user_id, v_name
  FROM auth.users
  WHERE email = 'mohamedsare078@gmail.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Aucun utilisateur trouvé avec cet email. Modifiez l''email dans le script.';
  END IF;

  -- Créer ou mettre à jour le profil avec is_super_admin = true
  INSERT INTO public.profiles (id, full_name, is_super_admin, created_at, updated_at)
  VALUES (v_user_id, COALESCE(v_name, 'Super Admin'), true, now(), now())
  ON CONFLICT (id) DO UPDATE SET
    is_super_admin = true,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    updated_at = now();

  RAISE NOTICE 'Super admin activé pour l''utilisateur % (id: %)', 'mohamedsare078@gmail.com', v_user_id;
END $$;

-- =============================================================================
-- Si le script ci-dessus échoue (accès refusé à auth.users), utilisez ceci :
-- 1. Allez dans Dashboard > Authentication > Users
-- 2. Cliquez sur votre utilisateur et copiez son UUID (id)
-- 3. Décommentez et exécutez la ligne suivante en collant l'UUID à la place de 'VOTRE-UUID-ICI'
-- =============================================================================
-- INSERT INTO public.profiles (id, full_name, is_super_admin, created_at, updated_at)
-- VALUES ('VOTRE-UUID-ICI', 'Votre nom', true, now(), now())
-- ON CONFLICT (id) DO UPDATE SET is_super_admin = true, updated_at = now();
