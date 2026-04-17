-- Droits pour modifier et supprimer des achats (brouillons). Owner les reçoit.
INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'purchases.update'),
  (uuid_generate_v4(), 'purchases.delete')
ON CONFLICT (key) DO NOTHING;

-- Owner : ajouter les nouveaux droits achats.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner'
  AND p.key IN ('purchases.update', 'purchases.delete')
ON CONFLICT DO NOTHING;
