-- Nouveaux droits que l'owner peut accorder + droit factures A4.
-- Tous insérés dans public.permissions ; owner reçoit tout (sauf stores.approve_extra déjà exclu).

INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'dashboard.view'),
  (uuid_generate_v4(), 'products.view'),
  (uuid_generate_v4(), 'sales.view'),
  (uuid_generate_v4(), 'purchases.view'),
  (uuid_generate_v4(), 'stock.view'),
  (uuid_generate_v4(), 'customers.view'),
  (uuid_generate_v4(), 'customers.manage'),
  (uuid_generate_v4(), 'suppliers.view'),
  (uuid_generate_v4(), 'suppliers.manage'),
  (uuid_generate_v4(), 'stores.view'),
  (uuid_generate_v4(), 'cash.view'),
  (uuid_generate_v4(), 'products.import'),
  (uuid_generate_v4(), 'transfers.create'),
  (uuid_generate_v4(), 'transfers.approve'),
  (uuid_generate_v4(), 'purchases.cancel'),
  (uuid_generate_v4(), 'sales.invoice_a4')
ON CONFLICT (key) DO NOTHING;

-- Owner : ajouter tous les nouveaux droits (owner a déjà les anciens via seed ; on lie les nouveaux).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner'
  AND p.key IN (
    'dashboard.view', 'products.view', 'sales.view', 'purchases.view', 'stock.view',
    'customers.view', 'customers.manage', 'suppliers.view', 'suppliers.manage',
    'stores.view', 'cash.view', 'products.import', 'transfers.create', 'transfers.approve',
    'purchases.cancel', 'sales.invoice_a4'
  )
ON CONFLICT DO NOTHING;

-- Manager : droits de vue + facture A4 + import + transferts. Pas dashboard.view par défaut (owner peut l'accorder).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'manager'
  AND p.key IN (
    'products.view', 'sales.view', 'purchases.view', 'stock.view',
    'customers.view', 'customers.manage', 'suppliers.view', 'suppliers.manage',
    'stores.view', 'cash.view', 'products.import', 'transfers.create', 'transfers.approve',
    'purchases.cancel', 'sales.invoice_a4'
  )
ON CONFLICT DO NOTHING;

-- Store Manager : idem manager. Pas dashboard.view par défaut (owner peut l'accorder).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'store_manager'
  AND p.key IN (
    'products.view', 'sales.view', 'purchases.view', 'stock.view',
    'customers.view', 'customers.manage', 'suppliers.view', 'suppliers.manage',
    'stores.view', 'cash.view', 'products.import', 'transfers.create', 'transfers.approve',
    'purchases.cancel', 'sales.invoice_a4'
  )
ON CONFLICT DO NOTHING;

-- Magasinier : vues stock + produits + transferts (create + approve).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'stock_manager'
  AND p.key IN ('stock.view', 'products.view', 'transfers.create', 'transfers.approve')
ON CONFLICT DO NOTHING;

-- Caissier : ventes + vues produits/clients/stock pour le menu (nav 100 % permission-based).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'cashier'
  AND p.key IN ('sales.view', 'sales.create', 'products.view', 'customers.view', 'stock.view')
ON CONFLICT DO NOTHING;

-- Comptable : vues pour rapports et audit.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'accountant'
  AND p.key IN (
    'dashboard.view', 'products.view', 'sales.view', 'purchases.view', 'stock.view',
    'customers.view', 'suppliers.view', 'stores.view', 'cash.view'
  )
ON CONFLICT DO NOTHING;

-- Lecture seule : vues uniquement. Pas dashboard.view par défaut (owner peut l'accorder).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'viewer'
  AND p.key IN (
    'products.view', 'sales.view', 'purchases.view', 'stock.view',
    'customers.view', 'suppliers.view', 'stores.view'
  )
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.permissions IS 'Clés de permission : owner peut accorder/retirer via user_permission_overrides.';
