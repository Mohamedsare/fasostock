-- FasoStock — Seed: roles, permissions, demo companies/stores/products
-- Run after migrations. For full demo, create a user in Supabase Auth and set SEED_USER_ID below.

-- ========== ROLES ==========
INSERT INTO public.roles (id, name, slug) VALUES
  ('11111111-1111-1111-1111-111111111101', 'Super Admin', 'super_admin'),
  ('11111111-1111-1111-1111-111111111102', 'Owner', 'owner'),
  ('11111111-1111-1111-1111-111111111103', 'Manager', 'manager'),
  ('11111111-1111-1111-1111-111111111104', 'Store Manager', 'store_manager'),
  ('11111111-1111-1111-1111-111111111105', 'Caissier', 'cashier'),
  ('11111111-1111-1111-1111-111111111106', 'Magasinier', 'stock_manager'),
  ('11111111-1111-1111-1111-111111111107', 'Comptable', 'accountant'),
  ('11111111-1111-1111-1111-111111111108', 'Lecture seule', 'viewer')
ON CONFLICT (id) DO NOTHING;

-- ========== PERMISSIONS ==========
INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'company.manage'),
  (uuid_generate_v4(), 'stores.create'),
  (uuid_generate_v4(), 'stores.request_extra'),
  (uuid_generate_v4(), 'stores.approve_extra'),
  (uuid_generate_v4(), 'products.create'),
  (uuid_generate_v4(), 'products.update'),
  (uuid_generate_v4(), 'products.delete'),
  (uuid_generate_v4(), 'sales.create'),
  (uuid_generate_v4(), 'sales.cancel'),
  (uuid_generate_v4(), 'sales.refund'),
  (uuid_generate_v4(), 'purchases.create'),
  (uuid_generate_v4(), 'stock.adjust'),
  (uuid_generate_v4(), 'stock.transfer'),
  (uuid_generate_v4(), 'reports.view_global'),
  (uuid_generate_v4(), 'reports.view_store'),
  (uuid_generate_v4(), 'users.manage'),
  (uuid_generate_v4(), 'settings.manage'),
  (uuid_generate_v4(), 'ai.insights.view'),
  (uuid_generate_v4(), 'cash.open_close'),
  (uuid_generate_v4(), 'audit.view')
ON CONFLICT (key) DO NOTHING;

-- ========== ROLE_PERMISSIONS ==========
-- Super admin : tout
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'super_admin'
ON CONFLICT DO NOTHING;

-- Owner : tout sauf stores.approve_extra
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner' AND p.key != 'stores.approve_extra'
ON CONFLICT DO NOTHING;

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

-- Store Manager : comme Manager mais rapports boutique uniquement ; pas rapports globaux, pas utilisateurs, paramètres, boutiques, IA
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'store_manager' AND p.key IN (
  'products.create', 'products.update', 'products.delete',
  'sales.create', 'sales.cancel', 'sales.refund',
  'purchases.create', 'stock.adjust', 'stock.transfer',
  'reports.view_store'
)
ON CONFLICT DO NOTHING;

-- Magasinier : jeux de droits minimaux pour seed seul — en prod les migrations (ex. 00047, 00078) étendent le rôle (magasin, stock complet, produits CRUD).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'stock_manager' AND p.key IN ('stock.adjust', 'stock.transfer')
ON CONFLICT DO NOTHING;

-- Caissier : ventes (caisse) uniquement
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'cashier' AND p.key IN ('sales.create')
ON CONFLICT DO NOTHING;

-- Comptable : voir ventes, achats, clients, fournisseurs, rapports (lecture / export)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'accountant' AND p.key IN ('reports.view_global', 'reports.view_store', 'audit.view')
ON CONFLICT DO NOTHING;

-- Lecture seule : produits, stock, clients, rapports en lecture
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'viewer' AND p.key IN ('reports.view_global', 'reports.view_store')
ON CONFLICT DO NOTHING;

-- ========== DEMO COMPANIES ==========
INSERT INTO public.companies (id, name, slug, is_active, store_quota) VALUES
  ('22222222-2222-2222-2222-222222222201', 'Entreprise Demo 1', 'demo-1', true, 3),
  ('22222222-2222-2222-2222-222222222202', 'Entreprise Demo 2', 'demo-2', true, 3)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug;

-- ========== DEMO STORES ==========
INSERT INTO public.stores (id, company_id, name, code, is_active, is_primary) VALUES
  ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', 'Boutique Ouaga', 'B1', true, true),
  ('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222201', 'Boutique Bobo', 'B2', true, false),
  ('33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222202', 'Magasin Principal', 'M1', true, true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;

-- ========== CATEGORIES ==========
INSERT INTO public.categories (id, company_id, name, slug) VALUES
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Boissons', 'boissons'),
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Alimentation', 'alimentation'),
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Hygiène', 'hygiene'),
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222202', 'Divers', 'divers')
ON CONFLICT DO NOTHING;

-- ========== BRANDS ==========
INSERT INTO public.brands (id, company_id, name) VALUES
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Marque A'),
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Marque B')
ON CONFLICT DO NOTHING;

-- ========== PRODUCTS (company 1) ==========
INSERT INTO public.products (company_id, name, sku, unit, purchase_price, sale_price, stock_min, is_active) VALUES
  ('22222222-2222-2222-2222-222222222201', 'Eau minérale 1.5L', 'EAU-001', 'pce', 150, 250, 10, true),
  ('22222222-2222-2222-2222-222222222201', 'Soda orange 33cl', 'SOD-001', 'pce', 120, 200, 20, true),
  ('22222222-2222-2222-2222-222222222201', 'Riz 5kg', 'RIZ-001', 'pce', 2500, 3200, 5, true),
  ('22222222-2222-2222-2222-222222222201', 'Savon 200g', 'SAV-001', 'pce', 350, 500, 15, true),
  ('22222222-2222-2222-2222-222222222201', 'Huile 1L', 'HUI-001', 'pce', 1800, 2200, 8, true)
ON CONFLICT (company_id, sku) DO NOTHING;

-- ========== STORE INVENTORY (assign stock to stores) ==========
INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
SELECT s.id, p.id, 100, 0
FROM public.stores s
CROSS JOIN public.products p
WHERE s.company_id = '22222222-2222-2222-2222-222222222201' AND p.company_id = '22222222-2222-2222-2222-222222222201'
ON CONFLICT (store_id, product_id) DO UPDATE SET quantity = 100;

-- ========== SUPPLIERS ==========
INSERT INTO public.suppliers (id, company_id, name, phone) VALUES
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Fournisseur Boissons SARL', '+226 70 00 00 01'),
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Grossiste Alimentaire', '+226 70 00 00 02')
ON CONFLICT DO NOTHING;

-- ========== CUSTOMERS ==========
INSERT INTO public.customers (id, company_id, name, type, phone) VALUES
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Client Particulier', 'individual', '+226 71 00 00 01'),
  (uuid_generate_v4(), '22222222-2222-2222-2222-222222222201', 'Restaurant Le Bon Goût', 'company', '+226 71 00 00 02')
ON CONFLICT DO NOTHING;
