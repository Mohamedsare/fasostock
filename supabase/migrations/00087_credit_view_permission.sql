-- Page Crédit / créances : droit séparé ; seul le rôle owner l’a par défaut (le propriétaire peut l’accorder aux autres via la gestion des droits).

INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'credit.view')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner'
  AND p.key = 'credit.view'
ON CONFLICT DO NOTHING;
