-- Page Code Barre : accès owner par défaut ; le propriétaire peut accorder
-- explicitement la permission aux autres utilisateurs.

INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'barcodes.manage')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner'
  AND p.key = 'barcodes.manage'
ON CONFLICT DO NOTHING;
