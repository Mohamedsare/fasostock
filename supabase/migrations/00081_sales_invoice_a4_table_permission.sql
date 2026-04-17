-- Interface POS « facture tableau » : droit séparé ; seul l’owner l’a par défaut (accord explicite aux autres via overrides / gestion des droits).

INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'sales.invoice_a4_table')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner'
  AND p.key = 'sales.invoice_a4_table'
ON CONFLICT DO NOTHING;
