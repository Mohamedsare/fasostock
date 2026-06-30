-- Page Péremptions (DLC/DLUO) : droit séparé ; seul le rôle owner l'a par défaut
-- (le propriétaire peut l'accorder aux autres via la gestion des droits).
-- 100 % additif : aucune table modifiée, réutilise public.product_batches (00116).

INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'expiry.view')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner'
  AND p.key = 'expiry.view'
ON CONFLICT DO NOTHING;
