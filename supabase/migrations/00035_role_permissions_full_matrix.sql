-- Matrice complète des rôles : Manager, Store Manager, Magasinier, Caissier, Comptable, Lecture seule.
-- Ne modifie pas super_admin ni owner.

DELETE FROM public.role_permissions
WHERE role_id IN (SELECT id FROM public.roles WHERE slug IN ('manager', 'store_manager', 'stock_manager', 'cashier', 'accountant', 'viewer'));

-- Manager : produits, ventes, stock, achats, rapports ; pas utilisateurs, paramètres, créer boutiques, IA
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'manager' AND p.key IN (
  'products.create', 'products.update', 'products.delete',
  'sales.create', 'sales.cancel', 'sales.refund',
  'purchases.create', 'stock.adjust', 'stock.transfer',
  'reports.view_global', 'reports.view_store'
)
ON CONFLICT DO NOTHING;

-- Store Manager : comme Manager mais rapports boutique uniquement
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'store_manager' AND p.key IN (
  'products.create', 'products.update', 'products.delete',
  'sales.create', 'sales.cancel', 'sales.refund',
  'purchases.create', 'stock.adjust', 'stock.transfer',
  'reports.view_store'
)
ON CONFLICT DO NOTHING;

-- Magasinier : stock (ajuster, transfert)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'stock_manager' AND p.key IN ('stock.adjust', 'stock.transfer')
ON CONFLICT DO NOTHING;

-- Caissier : ventes (caisse)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'cashier' AND p.key IN ('sales.create')
ON CONFLICT DO NOTHING;

-- Comptable : rapports et audit (accès ventes/achats/clients/fournisseurs géré par rôle dans l'app)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'accountant' AND p.key IN ('reports.view_global', 'reports.view_store', 'audit.view')
ON CONFLICT DO NOTHING;

-- Lecture seule : rapports (accès produits/stock/clients en lecture géré par rôle dans l'app)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'viewer' AND p.key IN ('reports.view_global', 'reports.view_store')
ON CONFLICT DO NOTHING;
