-- ============================================================
-- SUPER ADMIN EN 2 ÉTAPES (le plus simple)
-- ============================================================
--
-- ÉTAPE 1 — Dans Supabase : Authentication > Users > Add user
--           Créez l'utilisateur (email + mot de passe).
--           Puis cliquez sur cet utilisateur et COPIEZ son "User UID".
--
-- ÉTAPE 2 — Collez l'UUID ci-dessous à la place de VOTRE-UUID
--           (gardez les guillemets), puis exécutez ce bloc (Run).
--

INSERT INTO public.profiles (id, full_name, is_super_admin, created_at, updated_at)
VALUES ('VOTRE-UUID', 'Super Admin', true, now(), now())
ON CONFLICT (id) DO UPDATE SET is_super_admin = true, updated_at = now();
