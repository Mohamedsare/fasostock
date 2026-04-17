-- Fix utilisateur orphelin : lie ton user à une entreprise existante
-- À exécuter dans Supabase SQL Editor (en tant que ton user ou service role)
-- Remplace USER_ID et COMPANY_ID par les vrais UUID

-- 1. Trouver ton user_id : Authentication > Users > ton email > UUID
-- 2. Trouver company_id : Table Editor > companies > id de ton entreprise

-- INSERT INTO public.user_company_roles (user_id, company_id, role_id)
-- SELECT 
--   'USER_ID_ICI'::uuid, 
--   'COMPANY_ID_ICI'::uuid,
--   r.id
-- FROM public.roles r WHERE r.slug = 'owner'
-- ON CONFLICT (user_id, company_id) DO NOTHING;
