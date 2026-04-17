-- Caissier : doit voir Produits, Clients et Stock (alertes) pour le menu ; nav est 100 % permission-based.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'cashier'
  AND p.key IN ('products.view', 'customers.view', 'stock.view')
ON CONFLICT DO NOTHING;
