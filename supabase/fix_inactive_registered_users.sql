-- Active les comptes créés par inscription (ont une entreprise) qui sont désactivés par erreur.
-- À exécuter une fois dans le SQL Editor Supabase (Dashboard > SQL Editor).
-- Tous les utilisateurs ayant au moins une entreprise (= inscription complétée) et non super-admin.

UPDATE public.profiles p
SET is_active = true, updated_at = now()
WHERE p.is_active = false
  AND p.is_super_admin = false
  AND EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = p.id
  );
